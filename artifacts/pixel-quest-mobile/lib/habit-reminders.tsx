import { useAuth } from '@clerk/expo';
import { getGetHabitsQueryKey, useGetHabits } from '@workspace/api-client-react';
import type { Habit } from '@workspace/api-client-react';
import { router, useRootNavigationState } from 'expo-router';
import { AppState } from 'react-native';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { responseDestination, REMINDER_KIND, type ReminderSetting, type ReminderSettings } from './habit-reminder-engine';
import { habitReminderEngine as engine, nativeNotifications, reminderPermission, remindersSupported } from './reminder-notifications';

type ReminderContextValue = {
  settings: ReminderSettings;
  ready: boolean;
  busy: boolean;
  supported: boolean;
  permission: boolean | null;
  error: string;
  retry: () => void;
  enablePermission: () => Promise<boolean>;
  save: (id: number, value: ReminderSetting) => Promise<void>;
  syncHabit: (habit: Habit) => Promise<void>;
  prepareSignOut: () => Promise<void>;
};
const Context = createContext<ReminderContextValue | null>(null);

export function HabitRemindersProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const owner = isLoaded && enabled ? userId ?? null : null;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const nav = useRootNavigationState();
  const [settings, setSettings] = useState<ReminderSettings>({});
  const [readyOwner, setReadyOwner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<Record<string, unknown> | null>(null);
  const handledResponse = useRef<string | null>(null);
  const activeHabits = useRef<Habit[]>([]);
  const habits = useGetHabits({ archived: false }, { query: {
    queryKey: getGetHabitsQueryKey({ archived: false }),
    enabled: !!owner && readyOwner === owner && remindersSupported,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
  } });
  const report = (e: unknown) => setError(e instanceof Error ? e.message : 'Reminders could not be updated. Please retry.');

  useEffect(() => {
    let current = true;
    setReadyOwner(null); setSettings({}); setError(''); setPermission(null);
    activeHabits.current = [];
    void engine.activate(owner).then(saved => {
      if (!current) return;
      setSettings(saved); setReadyOwner(owner);
    }).catch(e => { if (current) report(e); });
    return () => { current = false; };
  }, [owner, revision]);

  useEffect(() => {
    if (!owner || readyOwner !== owner || !habits.data) return;
    let current = true;
    activeHabits.current = habits.data;
    void engine.sync(owner, habits.data).then(() => reminderPermission()).then(allowed => {
      if (current) { setPermission(allowed); setError(''); }
    }).catch(e => { if (current) report(e); });
    return () => { current = false; };
  }, [owner, readyOwner, habits.data, habits.dataUpdatedAt]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' || !owner || readyOwner !== owner) return;
      // Reconcile native calendar triggers after timezone/clock/permission changes.
      // Clear/recreate at resume: Android stores the already-computed next alarm.
      setRevision(v => v + 1);
      void habits.refetch();
    });
    return () => subscription.remove();
  }, [owner, readyOwner, habits.refetch]);

  useEffect(() => {
    if (!remindersSupported) return;
    let disposed = false;
    let subscription: { remove(): void } | undefined;
    void nativeNotifications().then(n => {
      if (disposed) return;
      n.setNotificationHandler({ handleNotification: async notification => {
        const data = notification.request.content.data;
        const show = data?.kind === REMINDER_KIND && !!ownerRef.current && data.owner === ownerRef.current;
        return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
      } });
      const receive = (r: import('expo-notifications').NotificationResponse | null) => {
        if (!r || disposed || r.notification.request.content.data?.kind !== REMINDER_KIND) return;
        const id = `${r.notification.request.identifier}:${r.notification.date}:${r.actionIdentifier}`;
        if (handledResponse.current === id) return;
        handledResponse.current = id;
        setResponse(r.notification.request.content.data);
        void n.clearLastNotificationResponseAsync().catch(report);
      };
      subscription = n.addNotificationResponseReceivedListener(receive);
      void n.getLastNotificationResponseAsync().then(receive).catch(report);
    }).catch(report);
    return () => { disposed = true; subscription?.remove(); };
  }, []);

  useEffect(() => {
    if (!response || !isLoaded || !nav?.key) return;
    // Wait for token wiring before deciding which signed-in account may navigate.
    if (userId && !enabled) return;
    const destination = responseDestination(response, userId);
    if (destination === 'sign-in') {
      router.replace('/(auth)/sign-in');
      // Keep the intent until login, but only the original owner can use it.
    } else {
      if (destination === 'habits') router.replace('/(tabs)/habits');
      setResponse(null);
    }
  }, [response, isLoaded, userId, enabled, nav?.key]);

  const ready = !!owner && readyOwner === owner && !!habits.data && remindersSupported;
  return <Context.Provider value={{
    settings: readyOwner === owner ? settings : {},
    ready, busy, supported: remindersSupported, permission,
    error: error || (habits.error ? 'Could not load habits to update reminders. Check your connection and retry.' : ''),
    retry: () => { setRevision(v => v + 1); void habits.refetch(); },
    enablePermission: async () => {
      const allowed = await reminderPermission(true);
      if (ownerRef.current === owner) setPermission(allowed);
      return allowed;
    },
    save: async (id, value) => {
      if (!owner || !ready) throw new Error('Wait for your habits to load.');
      setBusy(true);
      try {
        const saved = await engine.save(owner, id, value);
        if (ownerRef.current === owner) { setSettings(saved); setError(''); }
      } finally { setBusy(false); }
    },
    syncHabit: async habit => {
      if (!owner) return;
      const next = activeHabits.current.filter(h => h.id !== habit.id);
      if (!habit.archived) next.push(habit);
      activeHabits.current = next;
      try { await engine.sync(owner, next); } catch (e) { report(e); }
    },
    prepareSignOut: async () => { await engine.activate(null); },
  }}>{children}</Context.Provider>;
}

export function useHabitReminders() {
  const value = useContext(Context);
  if (!value) throw new Error('HabitRemindersProvider is missing.');
  return value;
}
