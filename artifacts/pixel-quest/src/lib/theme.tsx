import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRpg } from '@/lib/rpg-context';
import { reducedMotion } from '@/lib/feedback';

export const THEME_IDS = ['retro', 'anime', 'cyberpunk', 'parchment', 'brutalist', 'cozy'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = 'retro';
export const isTheme = (v: unknown): v is ThemeId => typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
const cacheKey = (uid: string) => `pq:theme:${uid}`;
function readCache(uid: string | null): ThemeId | null {
  if (!uid) return null;
  try { const v = localStorage.getItem(cacheKey(uid)); return isTheme(v) ? v : null; } catch { return null; }
}

interface ThemeCtx { theme: ThemeId; confirmed: ThemeId | null; saving: boolean; error: string; setTheme: (t: ThemeId) => void; retry: () => void; dismissError: () => void }
const Ctx = createContext<ThemeCtx | null>(null);
export function useTheme(): ThemeCtx { const c = useContext(Ctx); if (!c) throw new Error('useTheme outside ThemeProvider'); return c; }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { snap, run, userId, refetch, anyPending } = useRpg();
  const serverTheme = isTheme(snap?.profile.selectedTheme) ? snap!.profile.selectedTheme : null;
  const [optimistic, setOptimistic] = useState<ThemeId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lastTry = useRef<ThemeId | null>(null);
  const savingRef = useRef(false);
  const queued = useRef<ThemeId | null>(null);
  const actor = useRef(userId); actor.current = userId;
  const [cached, setCached] = useState<ThemeId | null>(() => readCache(userId));

  // Server is the source of truth; mirror it into this account's cache.
  useLayoutEffect(() => {
    if (!userId || !serverTheme || savingRef.current) return;
    try { localStorage.setItem(cacheKey(userId), serverTheme); } catch { /* storage unavailable */ }
    setCached(serverTheme);
  }, [serverTheme, userId]);

  // Another tab on the same account changed the cache: refetch authoritative state.
  const refetchRef = useRef(refetch); refetchRef.current = refetch;
  useEffect(() => {
    if (!userId) return;
    const on = (e: StorageEvent) => { if (e.key === cacheKey(userId)) refetchRef.current(); };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, [userId]);

  const theme: ThemeId = userId ? (optimistic ?? serverTheme ?? cached ?? DEFAULT_THEME) : DEFAULT_THEME;
  const first = useRef(true);
  useEffect(() => {
    const el = document.documentElement;
    if (el.dataset.theme === theme) { first.current = false; return; }
    if (!first.current && !reducedMotion()) { el.classList.add('theme-anim'); window.setTimeout(() => el.classList.remove('theme-anim'), 350); }
    first.current = false;
    el.dataset.theme = theme;
  }, [theme]);
  useLayoutEffect(() => () => { actor.current = null; queued.current = null; document.documentElement.dataset.theme = DEFAULT_THEME; }, []);

  const flush = useCallback(async () => {
    if (savingRef.current || anyPending || !actor.current || !queued.current) return;
    const me = actor.current;
    savingRef.current = true; setSaving(true);
    try {
      while (queued.current && actor.current === me) {
        const t: ThemeId = queued.current; queued.current = null;
        const r = await run({ action: 'profile', themeId: t }, { key: 'profile:theme' });
        if (actor.current !== me) return;
        if (r && isTheme(r.profile.selectedTheme)) {
          try { localStorage.setItem(cacheKey(me), r.profile.selectedTheme); } catch { /* ignore */ }
          setCached(r.profile.selectedTheme);
        } else if (!queued.current) {
          setError('We could not confirm the save. Showing your last confirmed theme; reconnect or retry to sync.');
        }
      }
    } finally {
      savingRef.current = false;
      if (actor.current === me) { setSaving(false); if (!queued.current) setOptimistic(null); }
    }
  }, [run, anyPending]);
  const setTheme = useCallback((t: ThemeId) => {
    if (!actor.current || !isTheme(t)) return;
    queued.current = t; lastTry.current = t;
    setOptimistic(t); setError(''); setSaving(true);
    document.documentElement.dataset.theme = t;
    void flush();
  }, [flush]);
  useEffect(() => { if (!anyPending && queued.current) void flush(); }, [anyPending, flush, optimistic]);
  const retry = useCallback(() => { if (lastTry.current) setTheme(lastTry.current); }, [setTheme]);
  const value = useMemo<ThemeCtx>(() => ({ theme, confirmed: serverTheme ?? cached, saving, error, setTheme, retry, dismissError: () => setError('') }), [theme, serverTheme, cached, saving, error, setTheme, retry]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const THEME_META: Record<ThemeId, { name: string; blurb: string; bg: string; panel: string; a: string; b: string; ink: string; radius: number; font: string }> = {
  retro: { name: '8-Bit Retro', blurb: 'Chunky pixels, purple slate.', bg: '#171625', panel: '#211f33', a: '#f5ca62', b: '#73e6df', ink: '#eee8da', radius: 0, font: "'Press Start 2P',monospace" },
  anime: { name: 'System UI', blurb: 'Midnight glass, cyan glow.', bg: '#070d22', panel: '#101c40', a: '#00f0ff', b: '#b78cff', ink: '#e6f6ff', radius: 12, font: "'DM Sans',sans-serif" },
  cyberpunk: { name: 'Cyber Terminal', blurb: 'Hot pink, scanlines, mono.', bg: '#0a0a0f', panel: '#12121a', a: '#ff0055', b: '#d7ff1f', ink: '#e8ffd8', radius: 0, font: 'ui-monospace,Menlo,monospace' },
  parchment: { name: 'Parchment', blurb: 'Leather, crimson, old maps.', bg: '#f5eedc', panel: '#ecdfbf', a: '#9c1f2e', b: '#7a4a1e', ink: '#3b2a1a', radius: 5, font: 'Georgia,serif' },
  brutalist: { name: 'Brutalist Arcade', blurb: 'Yellow, black, hard shadows.', bg: '#fff1b0', panel: '#fffaf0', a: '#ff5a1f', b: '#0a63e8', ink: '#111111', radius: 0, font: "'DM Sans',sans-serif" },
  cozy: { name: 'Cozy Arcade', blurb: 'Mint, peach, lilac pills.', bg: '#e6f8ee', panel: '#fff7ef', a: '#e8643a', b: '#8c68e0', ink: '#3a3350', radius: 16, font: "ui-rounded,'DM Sans',sans-serif" },
};
