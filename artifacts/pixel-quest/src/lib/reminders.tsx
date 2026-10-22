import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRpg } from '@/lib/rpg-context';

interface Prefs { enabled: boolean; times: Record<string, string> }
type Perm = NotificationPermission | 'unsupported';
interface RemCtx { prefs: Prefs; permission: Perm; setTime: (habitId: number, time: string | null) => void; setEnabled: (on: boolean) => void; }
const Ctx = createContext<RemCtx | null>(null);
export function useReminders(): RemCtx { const c = useContext(Ctx); if (!c) throw new Error('no reminders'); return c; }
const empty: Prefs = { enabled: false, times: {} };
const supported = () => typeof Notification !== 'undefined';
const getPerm = (): Perm => (supported() ? Notification.permission : 'unsupported');
/** Close account-bound notifications, retaining deduplication markers per account. */
export function clearReminderState() {
  window.dispatchEvent(new Event('pq:close-reminders'));
}

export function RemindersProvider({ children }: { children: ReactNode }) {
  const { snap, userId } = useRpg();
  const [prefs, setPrefs] = useState<Prefs>(empty);
  const [permission, setPermission] = useState<Perm>(getPerm());
  const openNotifications = useRef<Notification[]>([]);
  useEffect(() => {
    const close = () => { openNotifications.current.forEach(n => n.close()); openNotifications.current = []; };
    window.addEventListener('pq:close-reminders', close);
    return () => { close(); window.removeEventListener('pq:close-reminders', close); };
  }, [userId]);
  const key = userId ? `pq:reminders:${userId}` : null;
  useEffect(() => {
    if (!key) { setPrefs(empty); return; }
    try { setPrefs({ ...empty, ...(JSON.parse(localStorage.getItem(key) || 'null') ?? {}) }); } catch { setPrefs(empty); }
  }, [key]);
  const save = useCallback((next: Prefs) => { setPrefs(next); if (key) localStorage.setItem(key, JSON.stringify(next)); }, [key]);
  const ask = useCallback(() => {
    if (!supported() || Notification.permission !== 'default') return;
    void Notification.requestPermission().then((p) => setPermission(p));
  }, []);
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const setTime = useCallback((id: number, time: string | null) => {
    const times = { ...prefsRef.current.times };
    if (time) times[String(id)] = time; else delete times[String(id)];
    save({ enabled: time ? true : prefsRef.current.enabled, times }); if (time) ask();
  }, [save, ask]);
  const setEnabled = useCallback((on: boolean) => { save({ ...prefsRef.current, enabled: on }); if (on) ask(); }, [save, ask]);

  useEffect(() => {
    if (!snap || !userId || !prefs.enabled || permission !== 'granted') return;
    const check = () => {
      const now = new Intl.DateTimeFormat('en-GB', { timeZone: snap.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: snap.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const part = (type: string) => parts.find(p => p.type === type)?.value;
      if (`${part('year')}-${part('month')}-${part('day')}` !== snap.today) return; // Await the fresh local-day snapshot.
      if (snap.campingToday) return;
      snap.habits.forEach((h) => {
        const t = prefs.times[String(h.id)];
        if (!t || h.archived || !h.scheduledToday || h.progress >= h.target || now < t) return;
        const fired = `pq:rem-fired:${userId}:${h.id}:${snap.today}`;
        if (localStorage.getItem(fired)) return;
        localStorage.setItem(fired, '1');
        try {
          const n = new Notification(`Pixel Quest: ${h.title}`, { body: `Scheduled for ${t}. Today's progress ${h.progress}/${h.target} ${h.unit}`.trim(), tag: fired });
          n.onclick = () => { window.focus(); window.location.assign(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/habits`); n.close(); };
          openNotifications.current.push(n);
        } catch { /* Unsupported notification constructors remain best-effort. */ }
      });
    };
    check();
    const id = window.setInterval(check, 30000);
    const vis = () => { if (document.visibilityState === 'visible') { setPermission(getPerm()); check(); } };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [snap, userId, prefs, permission]);

  const value = useMemo(() => ({ prefs, permission, setTime, setEnabled }), [prefs, permission, setTime, setEnabled]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
