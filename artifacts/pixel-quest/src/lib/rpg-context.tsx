import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/react';
import { getGetRpgStateQueryKey, useGetRpgState, usePerformRpgAction } from '@workspace/api-client-react';
import type { RpgActionInput, RpgSnapshot } from '@workspace/api-client-react';
import { cue, reducedMotion } from '@/lib/feedback';
import { discoverNewlyReadyRewards, discoverShareMilestones, type ShareMilestone } from '@/lib/share-milestones';

export type ActionInput = Omit<RpgActionInput, 'requestId'>;
export interface RunOptions { optimistic?: (s: RpgSnapshot) => RpgSnapshot; key?: string; requestId?: string }
interface Celebration { id: number; kind: 'boss' | 'reward'; text: string }
interface RpgCtx {
  snap: RpgSnapshot | undefined; isLoading: boolean; isError: boolean; refetch: () => void;
  run: (input: ActionInput, opts?: RunOptions) => Promise<RpgSnapshot | null>;
  isPending: (key: string) => boolean; anyPending: boolean;
  error: string; clearError: () => void; notice: string; userId: string | null;
  shareMilestone: ShareMilestone | null; dismissShareMilestone: () => void; openPlayerCard: () => void;
}
const Ctx = createContext<RpgCtx | null>(null);
export function useRpg(): RpgCtx { const c = useContext(Ctx); if (!c) throw new Error('useRpg outside RpgProvider'); return c; }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function isSnapshot(value: unknown): value is RpgSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<RpgSnapshot>;
  return typeof snapshot.today === 'string' &&
    typeof snapshot.timezone === 'string' &&
    !!snapshot.profile && typeof snapshot.profile === 'object' &&
    !!snapshot.skills && typeof snapshot.skills === 'object' &&
    Array.isArray(snapshot.habits) &&
    Array.isArray(snapshot.quests) &&
    Array.isArray(snapshot.rewards);
}
function errMessage(e: unknown): string {
  const x = e as { data?: { error?: string; message?: string } | null; message?: string };
  return x?.data?.error || x?.data?.message || x?.message || 'That action could not be saved. Your journal was restored.';
}
const transient = (e: unknown) => { const s = (e as { status?: number })?.status; return s === undefined || s >= 500; };

export function RpgProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { user, isSignedIn } = useUser();
  const userId = user?.id ?? null;
  const [cachedState, setCachedState] = useState<{ owner: string | null; snap: RpgSnapshot | null }>({ owner: null, snap: null });
  const pendingRef = useRef(new Set<string>());
  const readySeenRef = useRef(new Map<string, Set<number>>());
  const shareSeenRef = useRef(new Map<string, Set<string>>());
  const qk = useMemo(() => [...getGetRpgStateQueryKey(), userId], [userId]);
  const q = useGetRpgState({ query: { enabled: !!isSignedIn, queryKey: qk, refetchInterval: () => pendingRef.current.size ? false : 30000, refetchOnWindowFocus: () => pendingRef.current.size === 0, staleTime: 10000 } });
  useEffect(() => {
    setCachedState({ owner: userId, snap: null });
    if (!userId) return;
    try {
      const raw = localStorage.getItem(`pq:rpg-snapshot:${userId}`);
      const stored: unknown = raw ? JSON.parse(raw) : null;
      if (isSnapshot(stored)) setCachedState({ owner: userId, snap: stored });
    } catch {
      // The live API remains authoritative; malformed or unavailable local cache is ignored.
    }
  }, [userId]);
  useEffect(() => {
    if (!userId || !q.data) return;
    try {
      localStorage.setItem(`pq:rpg-snapshot:${userId}`, JSON.stringify(q.data));
      setCachedState({ owner: userId, snap: q.data });
    } catch {
      // Offline entry drafts remain available even if the snapshot cache cannot be written.
    }
  }, [q.data, userId]);
  const mutation = usePerformRpgAction();
  const mutateRef = useRef(mutation.mutateAsync); mutateRef.current = mutation.mutateAsync;
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [shareQueue, setShareQueue] = useState<ShareMilestone[]>([]);
  const noticeTimer = useRef<number | undefined>(undefined); const celTimer = useRef<number | undefined>(undefined);
  const userRef = useRef(userId); userRef.current = userId;
  useEffect(() => {
    setError(''); setNotice(''); setCelebration(null);
    setShareQueue([]);
    window.clearTimeout(noticeTimer.current); window.clearTimeout(celTimer.current);
  }, [userId]);

  const celebrate = useCallback((kind: 'boss' | 'reward', text: string) => {
    cue(kind); setCelebration({ id: Date.now(), kind, text });
    window.clearTimeout(celTimer.current); celTimer.current = window.setTimeout(() => setCelebration(null), 2600);
  }, []);
  const enqueueShare = useCallback((milestone: ShareMilestone, persist = true) => {
    const uid = userRef.current;
    if (!uid) return;
    if (persist) {
      const key = `pq:share-seen:${uid}`;
      let seen = shareSeenRef.current.get(uid);
      if (!seen) {
        seen = new Set<string>();
        try {
          const stored = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
          if (Array.isArray(stored)) stored.filter((id): id is string => typeof id === 'string').forEach(id => seen?.add(id));
        } catch { /* Continue with in-memory deduplication if storage is unavailable. */ }
      }
      if (seen.has(milestone.id)) return;
      seen.add(milestone.id);
      shareSeenRef.current.set(uid, seen);
      try {
        localStorage.setItem(key, JSON.stringify([...seen].slice(-200)));
      } catch { /* A blocked storage API should not prevent sharing a fresh milestone. */ }
    }
    setCelebration(null); window.clearTimeout(celTimer.current);
    setShareQueue(queue => queue.some(item => item.id === milestone.id) ? queue : [...queue, milestone]);
  }, []);
  const dismissShareMilestone = useCallback(() => setShareQueue(queue => queue.slice(1)), []);
  const openPlayerCard = useCallback(() => enqueueShare({
    id: `player:${userRef.current}:${Date.now()}`,
    type: 'player',
    headline: 'Your Player Card',
    detail: 'A snapshot of your Pixel Quest journey.',
  }, false), [enqueueShare]);
  /** Returns true when a brand-new READY reward was celebrated. Deduped per account + reward. */
  const detectUnlock = useCallback((s: RpgSnapshot): boolean => {
    const uid = userRef.current; if (!uid) return false;
    const key = `pq:ready-seen:${uid}`;
    let stored: number[] | null = null;
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) as unknown : null;
      stored = Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : null;
    } catch { stored = null; }
    if (!stored) {
      const memorySeen = readySeenRef.current.get(uid);
      if (memorySeen) stored = [...memorySeen];
    }
    const seen = new Set(stored ?? []);
    const fresh = discoverNewlyReadyRewards(s, seen);
    s.rewards.filter((reward) => reward.status === 'ready').forEach((reward) => seen.add(reward.id));
    readySeenRef.current.set(uid, seen);
    try { localStorage.setItem(key, JSON.stringify([...seen])); } catch { /* Keep account-scoped in-memory deduplication. */ }
    if (stored && fresh.length) {
      for (const reward of fresh) enqueueShare({ id: `reward:${reward.id}`, type: 'reward', headline: 'Real-Life Reward Unlocked', detail: reward.title });
      return true;
    }
    return false;
  }, [enqueueShare]);

  const snap = q.data ?? (cachedState.owner === userId ? cachedState.snap ?? undefined : undefined);
  useEffect(() => { if (snap) detectUnlock(snap); }, [snap, detectUnlock]);
   useEffect(() => () => { userRef.current = null; window.clearTimeout(noticeTimer.current); window.clearTimeout(celTimer.current); }, []);

  const run = useCallback(async (input: ActionInput, opts?: RunOptions) => {
    const key = opts?.key ?? `${input.action}:${input.id ?? input.itemId ?? ''}`;
    if (pendingRef.current.size > 0 || !userRef.current) return null;
    const actor = userRef.current;
    pendingRef.current.add(key); setPending(new Set(pendingRef.current)); setError('');
    const prev = qc.getQueryData<RpgSnapshot>(qk);
    await qc.cancelQueries({ queryKey: qk });
    if (opts?.optimistic && prev) qc.setQueryData(qk, opts.optimistic(prev));
    const requestId = opts?.requestId ?? crypto.randomUUID();
    try {
      let result: RpgSnapshot | undefined;
      for (let attempt = 0; ; attempt++) {
        // Never replay a signed-out user's create action into a new account.
        if (userRef.current !== actor) return null;
        try { result = await mutateRef.current({ data: { ...input, requestId } }); break; }
        catch (e) { if (attempt < 2 && transient(e)) { await sleep(700 * (attempt + 1)); continue; } throw e; }
      }
      if (userRef.current !== actor) return null;
      // A poll that began during the mutation must not overwrite its committed snapshot.
      await qc.cancelQueries({ queryKey: qk });
      qc.setQueryData(qk, result);
      const unlocked = detectUnlock(result);
      if (prev) {
        for (const milestone of discoverShareMilestones(prev, result)) enqueueShare(milestone);
      }
      if (result.effect === 'complete') cue(result.bosses.some(b => b.hp > 0 && b.hp < (prev?.bosses.find(old => old.id === b.id)?.hp ?? b.hp)) ? 'boss' : 'complete');
      else if (result.effect === 'boss') cue('boss');
      else if (result.effect === 'reward' && !unlocked) celebrate('reward', result.message || 'Reward claimed');
      if (result.message) { setNotice(result.message); window.clearTimeout(noticeTimer.current); noticeTimer.current = window.setTimeout(() => setNotice(''), 5000); }
      return result;
    } catch (e) {
      if (userRef.current !== actor) return null;
      if (opts?.optimistic && prev) qc.setQueryData(qk, prev);
      setError(errMessage(e));
      void qc.invalidateQueries({ queryKey: qk });
      return null;
    } finally {
      pendingRef.current.delete(key); setPending(new Set(pendingRef.current));
       if (userRef.current === actor) void qc.invalidateQueries({ queryKey: qk });
    }
  }, [qc, qk, detectUnlock, celebrate, enqueueShare]);

  const value = useMemo<RpgCtx>(() => ({
    snap, isLoading: !snap && !q.isError && !!isSignedIn, isError: !snap && q.isError, refetch: () => void q.refetch(),
     run, isPending: () => pending.size > 0, anyPending: pending.size > 0, error, clearError: () => setError(''), notice, userId,
     shareMilestone: shareQueue[0] ?? null, dismissShareMilestone, openPlayerCard,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [snap, q.isError, isSignedIn, run, pending, error, notice, userId, shareQueue, dismissShareMilestone, openPlayerCard]);

  return <Ctx.Provider value={value}>{children}
    {celebration && <div key={celebration.id} data-testid="celebration" aria-live="polite" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {!reducedMotion() && Array.from({ length: 28 }, (_, i) => <i key={i} className="pixel-spark absolute h-2 w-2" style={{ left: `${(i * 37) % 97}%`, top: `${(i * 19) % 75}%`, background: ['var(--pq-gold)', 'var(--pq-cyan)', 'var(--pq-purple)', 'var(--pq-danger)'][i % 4], animationDelay: `${i * 14}ms` }}/>)}
      <div className="absolute left-1/2 top-[22%] w-[min(90vw,380px)] -translate-x-1/2 border-2 border-[color:var(--pq-gold)] bg-[color:var(--pq-panel)] px-5 py-4 text-center shadow-[5px_5px_0_var(--pq-shadow)]">
        <p className="pixel-title text-[10px] text-[color:var(--pq-gold)]">{celebration.kind === 'boss' ? 'BOSS DEFEATED' : 'REWARD'}</p>
        <p className="mt-3 text-xs text-[color:var(--pq-cyan)]">{celebration.text}</p></div></div>}
  </Ctx.Provider>;
}
