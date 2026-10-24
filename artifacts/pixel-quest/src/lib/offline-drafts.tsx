import { useCallback, useEffect, useRef, useState } from "react";
import type { RpgActionInput } from "@workspace/api-client-react";
import { useRpg } from "@/lib/rpg-context";

export type ManualDraftInput = Omit<RpgActionInput, "requestId"> & {
  action: "saveHabit" | "saveQuest";
};
export type ManualDraftKind = "habit" | "task";
export type ManualDraftStatus = "pending" | "syncing" | "failed";
export interface ManualDraft {
  id: string;
  kind: ManualDraftKind;
  input: ManualDraftInput;
  status: ManualDraftStatus;
  createdAt: number;
}

interface DraftState { owner: string | null; drafts: ManualDraft[] }
const emptyState: DraftState = { owner: null, drafts: [] };
const storageKey = (userId: string) => `pq:manual-drafts:${userId}`;

function validDraft(value: unknown): value is ManualDraft {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ManualDraft>;
  return typeof item.id === "string" &&
    (item.kind === "habit" || item.kind === "task") &&
    !!item.input && (item.input.action === "saveHabit" || item.input.action === "saveQuest") &&
    (item.status === "pending" || item.status === "syncing" || item.status === "failed") &&
    typeof item.createdAt === "number";
}

export function useOfflineDrafts() {
  const { userId, run, anyPending } = useRpg();
  const [state, setState] = useState<DraftState>(emptyState);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [storageError, setStorageError] = useState("");
  const actorRef = useRef(userId);
  const draftsRef = useRef<ManualDraft[]>([]);
  const flushingRef = useRef(false);
  actorRef.current = userId;
  const drafts = state.owner === userId ? state.drafts : [];

  const write = useCallback((actor: string, next: ManualDraft[]) => {
    if (!actor || actorRef.current !== actor || userId !== actor) return false;
    try {
      localStorage.setItem(storageKey(actor), JSON.stringify(next));
    } catch {
      setStorageError("This browser could not save the draft locally. Free up browser storage and try again.");
      return false;
    }
    draftsRef.current = next;
    setState({ owner: actor, drafts: next });
    setStorageError("");
    return true;
  }, [userId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      const actor = actorRef.current;
      if (actor) {
        const next = draftsRef.current.map(draft => draft.status === "failed" ? { ...draft, status: "pending" as const } : draft);
        if (next.some((draft, index) => draft.status !== draftsRef.current[index]?.status)) write(actor, next);
      }
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [write]);

  useEffect(() => {
    draftsRef.current = [];
    setState({ owner: userId, drafts: [] });
    setStorageError("");
    if (!userId) return;
    try {
      const raw = localStorage.getItem(storageKey(userId));
      const stored: unknown = raw ? JSON.parse(raw) : [];
      const loaded = Array.isArray(stored)
        ? stored.filter(validDraft).map(draft => ({
            ...draft,
            status: draft.status === "syncing" || (draft.status === "failed" && navigator.onLine) ? "pending" as const : draft.status,
          }))
        : [];
      draftsRef.current = loaded;
      setState({ owner: userId, drafts: loaded });
    } catch {
      setStorageError("Saved drafts could not be read from this browser.");
    }
  }, [userId]);

  const add = useCallback((input: ManualDraftInput): string | null => {
    if (!userId || !actorRef.current) return null;
    const draft: ManualDraft = {
      id: crypto.randomUUID(),
      kind: input.action === "saveHabit" ? "habit" : "task",
      input,
      status: "pending",
      createdAt: Date.now(),
    };
    return write(userId, [...draftsRef.current, draft]) ? draft.id : null;
  }, [userId, write]);

  const update = useCallback((id: string, input: ManualDraftInput) => {
    if (!userId) return false;
    const next = draftsRef.current.map(draft => draft.id === id ? {
      ...draft,
      kind: input.action === "saveHabit" ? "habit" as const : "task" as const,
      input,
      status: "pending" as const,
    } : draft);
    return write(userId, next);
  }, [userId, write]);

  const remove = useCallback((id: string) => {
    if (userId) write(userId, draftsRef.current.filter(draft => draft.id !== id));
  }, [userId, write]);

  const retry = useCallback((id: string) => {
    if (!userId) return;
    write(userId, draftsRef.current.map(draft => draft.id === id ? { ...draft, status: "pending" } : draft));
  }, [userId, write]);

  const flush = useCallback(async () => {
    const actor = userId;
    if (!actor || !online || anyPending || flushingRef.current) return;
    flushingRef.current = true;
    try {
      for (const draft of [...draftsRef.current]) {
        if (actorRef.current !== actor || !navigator.onLine) break;
        if (draft.status !== "pending") continue;
        const marked = draftsRef.current.map(item => item.id === draft.id ? { ...item, status: "syncing" as const } : item);
        if (!write(actor, marked)) break;
        const result = await run(draft.input, { key: `offline-draft:${draft.id}`, requestId: draft.id });
        if (actorRef.current !== actor) break;
        if (result) {
          write(actor, draftsRef.current.filter(item => item.id !== draft.id));
        } else {
          write(actor, draftsRef.current.map(item => item.id === draft.id ? { ...item, status: "failed" as const } : item));
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [anyPending, online, run, userId, write]);

  useEffect(() => {
    if (online && userId) void flush();
  }, [drafts, flush, online, userId]);

  return { drafts, online, storageError, add, update, remove, retry };
}
