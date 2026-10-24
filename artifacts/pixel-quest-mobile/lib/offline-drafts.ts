import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/expo';
import { usePerformRpgAction, type RpgActionInput } from '@workspace/api-client-react';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { invalidatePixelQuest } from '@/lib/pixel-quest';

export type ManualDraftInput = Omit<RpgActionInput, 'requestId'> & {
  action: 'saveHabit' | 'saveQuest';
};
export type ManualDraftKind = 'habit' | 'task';
export type ManualDraftStatus = 'pending' | 'syncing' | 'failed';
export interface ManualDraft {
  id: string;
  kind: ManualDraftKind;
  input: ManualDraftInput;
  status: ManualDraftStatus;
  createdAt: number;
}

interface DraftState { owner: string | null; drafts: ManualDraft[] }
const keyFor = (userId: string) => `pq:manual-drafts:${userId}`;

function validDraft(value: unknown): value is ManualDraft {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ManualDraft>;
  return typeof item.id === 'string' &&
    (item.kind === 'habit' || item.kind === 'task') &&
    !!item.input && (item.input.action === 'saveHabit' || item.input.action === 'saveQuest') &&
    (item.status === 'pending' || item.status === 'syncing' || item.status === 'failed') &&
    typeof item.createdAt === 'number';
}

function isOnlineState(state: Network.NetworkState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function useOfflineDrafts() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const mutation = usePerformRpgAction();
  const mutationRef = useRef(mutation.mutateAsync);
  mutationRef.current = mutation.mutateAsync;
  const actorRef = useRef(userId);
  actorRef.current = userId;
  const draftsRef = useRef<ManualDraft[]>([]);
  const flushingRef = useRef(false);
  const [state, setState] = useState<DraftState>({ owner: null, drafts: [] });
  const [online, setOnline] = useState<boolean | null>(null);
  const [storageError, setStorageError] = useState('');
  const drafts = state.owner === userId ? state.drafts : [];

  const persist = useCallback(async (actor: string, next: ManualDraft[]) => {
    if (!actor || actorRef.current !== actor || userId !== actor) return false;
    try {
      await AsyncStorage.setItem(keyFor(actor), JSON.stringify(next));
    } catch {
      setStorageError('Could not save this draft on the device. Check available storage and try again.');
      return false;
    }
    if (actorRef.current !== actor) return false;
    draftsRef.current = next;
    setState({ owner: actor, drafts: next });
    setStorageError('');
    return true;
  }, [userId]);

  const refreshNetwork = useCallback(async () => {
    try {
      const network = await Network.getNetworkStateAsync();
      const connected = isOnlineState(network);
      setOnline(connected);
      return connected;
    } catch {
      setOnline(false);
      return false;
    }
  }, []);

  useEffect(() => {
    draftsRef.current = [];
    setState({ owner: userId ?? null, drafts: [] });
    setStorageError('');
    if (!userId) return;
    let active = true;
    void AsyncStorage.getItem(keyFor(userId)).then(raw => {
      if (!active || actorRef.current !== userId) return;
      const stored: unknown = raw ? JSON.parse(raw) : [];
      const loaded = Array.isArray(stored)
        ? stored.filter(validDraft).map(draft => ({ ...draft, status: draft.status === 'syncing' ? 'pending' as const : draft.status }))
        : [];
      draftsRef.current = loaded;
      setState({ owner: userId, drafts: loaded });
    }).catch(() => {
      if (active) setStorageError('Saved drafts could not be read from this device.');
    });
    return () => { active = false; };
  }, [userId]);

  const flush = useCallback(async (retryFailed = false) => {
    const actor = userId;
    if (!actor || flushingRef.current) return;
    if (!await refreshNetwork() || actorRef.current !== actor) return;
    flushingRef.current = true;
    try {
      for (const draft of [...draftsRef.current]) {
        if (actorRef.current !== actor || !await refreshNetwork()) break;
        if (draft.status !== 'pending' && !(retryFailed && draft.status === 'failed')) continue;
        const marked = draftsRef.current.map(item => item.id === draft.id ? { ...item, status: 'syncing' as const } : item);
        if (!await persist(actor, marked)) break;
        try {
          await mutationRef.current({ data: { ...draft.input, requestId: draft.id } });
          if (actorRef.current !== actor) break;
          invalidatePixelQuest(queryClient);
          await persist(actor, draftsRef.current.filter(item => item.id !== draft.id));
        } catch {
          if (actorRef.current !== actor) break;
          await persist(actor, draftsRef.current.map(item => item.id === draft.id ? { ...item, status: 'failed' as const } : item));
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [persist, queryClient, refreshNetwork, userId]);

  useEffect(() => {
    void refreshNetwork().then(connected => { if (connected) void flush(true); });
    const networkSubscription = Network.addNetworkStateListener(state => {
      const connected = isOnlineState(state);
      setOnline(connected);
      if (connected) void flush(true);
    });
    const appSubscription = AppState.addEventListener('change', next => {
      if (next === 'active') void flush(true);
    });
    return () => {
      networkSubscription.remove();
      appSubscription.remove();
    };
  }, [flush, refreshNetwork]);

  useEffect(() => {
    if (online) void flush();
  }, [drafts, flush, online]);

  const add = useCallback(async (input: ManualDraftInput): Promise<string | null> => {
    if (!userId || !actorRef.current) return null;
    const draft: ManualDraft = {
      id: Crypto.randomUUID(),
      kind: input.action === 'saveHabit' ? 'habit' : 'task',
      input,
      status: 'pending',
      createdAt: Date.now(),
    };
    return await persist(userId, [...draftsRef.current, draft]) ? draft.id : null;
  }, [persist, userId]);

  const update = useCallback(async (id: string, input: ManualDraftInput) => {
    if (!userId) return false;
    return persist(userId, draftsRef.current.map(draft => draft.id === id ? {
      ...draft,
      kind: input.action === 'saveHabit' ? 'habit' as const : 'task' as const,
      input,
      status: 'pending' as const,
    } : draft));
  }, [persist, userId]);

  const remove = useCallback(async (id: string) => {
    if (userId) await persist(userId, draftsRef.current.filter(draft => draft.id !== id));
  }, [persist, userId]);

  const retry = useCallback(async (id: string) => {
    if (userId) await persist(userId, draftsRef.current.map(draft => draft.id === id ? { ...draft, status: 'pending' } : draft));
  }, [persist, userId]);

  return { drafts, online, storageError, add, update, remove, retry };
}
