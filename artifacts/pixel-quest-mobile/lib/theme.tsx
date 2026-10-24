import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useQueryClient } from '@tanstack/react-query';
import { getGetPixelQuestProfileQueryKey, useGetPixelQuestProfile, useUpdatePixelQuestProfile } from '@workspace/api-client-react';
import { THEMES, isThemeId, type ThemeId, type ThemeTokens } from '@/constants/themes';

interface ThemeCtx { tokens: ThemeTokens; themeId: ThemeId; confirmed: ThemeId; saving: boolean; error: string; setTheme: (t: ThemeId) => void; preview: ThemeId | null; setPreview: (t: ThemeId | null) => void; retry: () => void; dismissError: () => void }
const noop = () => undefined;
const Ctx = createContext<ThemeCtx>({ tokens: THEMES.retro, themeId: 'retro', confirmed: 'retro', saving: false, error: '', setTheme: noop, preview: null, setPreview: noop, retry: noop, dismissError: noop });
export const useTheme = () => useContext(Ctx);

const key = (uid: string) => `pq:theme:${uid}`;
const ts = (s?: string | null) => { const n = s ? Date.parse(s) : NaN; return Number.isFinite(n) ? n : 0; };

/** `enabled` must only become true once the auth token getter is registered. */
export function ThemeProvider({ userId, enabled, children }: { userId: string | null | undefined; enabled: boolean; children: ReactNode }) {
  const qc = useQueryClient();
  const uid = userId ?? null;
  const [confirmed, setConfirmed] = useState<ThemeId>('retro');
  const [optimistic, setOptimistic] = useState<ThemeId | null>(null);
  const [saving, setSaving] = useState(false);
  // Local-only preview (onboarding): instant, never saved by this provider.
  const [preview, setPreviewState] = useState<ThemeId | null>(null);
  const setPreview = useCallback((t: ThemeId | null) => setPreviewState(t && isThemeId(t) ? t : null), []);
  const [error, setError] = useState('');
  const confirmedAt = useRef(0);
  const savingRef = useRef(false);
  const uidRef = useRef(uid); uidRef.current = uid;
  const lastTry = useRef<ThemeId | null>(null);
  const queued = useRef<ThemeId | null>(null);

  // Account change: drop previous account's state, then load only this account's cache.
  useEffect(() => {
    confirmedAt.current = 0; savingRef.current = false;
    setConfirmed('retro'); setOptimistic(null); setPreviewState(null); setSaving(false); setError(''); lastTry.current = null;
    if (!uid) return;
    let live = true;
    AsyncStorage.getItem(key(uid)).then((raw) => {
      if (!live || !raw || confirmedAt.current) return;
      try { const v = JSON.parse(raw) as { id?: unknown; at?: unknown }; if (isThemeId(v.id)) setConfirmed(v.id); } catch { /* corrupt cache */ }
    }).catch(noop);
    return () => { live = false; };
  }, [uid]);

  const queryKey = useMemo(() => [...getGetPixelQuestProfileQueryKey(), 'theme', uid], [uid]);
  const query = useGetPixelQuestProfile({ query: { queryKey, enabled: enabled && !!uid, refetchInterval: () => savingRef.current ? false : 30000, staleTime: 10000 } });
  useEffect(() => () => { uidRef.current = null; queued.current = null; }, []);
  const persist = useCallback((id: ThemeId, at: number) => {
    const u = uidRef.current; if (u) void AsyncStorage.setItem(key(u), JSON.stringify({ id, at: new Date(at || Date.now()).toISOString() })).catch(noop);
  }, []);

  // Accept server state only if not saving and not older than what we already confirmed.
  const data = query.data;
  useEffect(() => {
    if (!data || !uid || savingRef.current || !isThemeId(data.selectedTheme)) return;
    const at = ts(data.themeUpdatedAt);
    if (at < confirmedAt.current) return;
    confirmedAt.current = at; setConfirmed(data.selectedTheme); persist(data.selectedTheme, at);
  }, [data, uid, persist]);

  const refetchRef = useRef(query.refetch); refetchRef.current = query.refetch;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && uidRef.current && !savingRef.current) void refetchRef.current(); });
    return () => sub.remove();
  }, []);

  const mutateRef = useRef<ReturnType<typeof useUpdatePixelQuestProfile>['mutateAsync']>(undefined as never);
  const mutation = useUpdatePixelQuestProfile(); mutateRef.current = mutation.mutateAsync;

  const flush = useCallback(async () => {
    const me = uidRef.current;
    if (!me || !enabled || savingRef.current || !queued.current) return;
    savingRef.current = true; setSaving(true);
    try {
      while (queued.current && uidRef.current === me) {
      const t: ThemeId = queued.current; queued.current = null;
      await qc.cancelQueries({ queryKey: getGetPixelQuestProfileQueryKey() });
      if (uidRef.current !== me) return;
      const res = await mutateRef.current({ data: { themeId: t } });
      if (uidRef.current !== me) return;
      const id = isThemeId(res.selectedTheme) ? res.selectedTheme : t;
      const at = Math.max(ts(res.themeUpdatedAt), confirmedAt.current);
      await qc.cancelQueries({ queryKey: getGetPixelQuestProfileQueryKey() });
      if (uidRef.current !== me) return;
      qc.setQueryData(getGetPixelQuestProfileQueryKey(), res);
      qc.setQueryData(queryKey, res);
      confirmedAt.current = at; setConfirmed(id); persist(id, at); setError('');
      }
    } catch {
      if (uidRef.current !== me) return;
      setError('We could not confirm the save. Showing your last confirmed theme; reconnect or retry to sync.');
    } finally {
      if (uidRef.current === me) { savingRef.current = false; setSaving(false); if (!queued.current) setOptimistic(null); void qc.invalidateQueries({ queryKey }); }
    }
  }, [qc, persist, queryKey, enabled]);
  const choose = useCallback((t: ThemeId) => {
    if (!uidRef.current || !isThemeId(t)) return;
    queued.current = t; lastTry.current = t; setOptimistic(t); setError(''); setSaving(true);
    void flush();
  }, [flush]);
  useEffect(() => { if (enabled && queued.current && !savingRef.current) void flush(); }, [enabled, optimistic, saving, flush]);

  const themeId: ThemeId = uid ? (preview ?? optimistic ?? confirmed) : 'retro';
  const tokens = THEMES[themeId];
  const value = useMemo<ThemeCtx>(() => ({
    tokens, themeId, confirmed, saving, error,
    setTheme: choose, preview, setPreview,
    retry: () => { if (lastTry.current) choose(lastTry.current); },
    dismissError: () => setError(''),
  }), [tokens, themeId, confirmed, saving, error, choose, preview, setPreview]);
  return <Ctx.Provider value={value}>
    <StatusBar style={tokens.dark ? 'light' : 'dark'} />
    {children}
    {themeId === 'cyberpunk' && <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 999 }}>
      <Svg width="100%" height="100%"><Defs><Pattern id="terminal-scanlines" patternUnits="userSpaceOnUse" width={4} height={4}><Rect width={4} height={1} fill="#ff0055" opacity={0.12}/></Pattern></Defs><Rect width="100%" height="100%" fill="url(#terminal-scanlines)"/></Svg>
    </View>}
  </Ctx.Provider>;
}
