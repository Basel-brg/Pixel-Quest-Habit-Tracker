// Platform-independent scheduling logic. Native delivery lives in reminder-notifications.ts.
export type ReminderSetting = { enabled: boolean; hour: number; minute: number };
export type ReminderSettings = Record<string, ReminderSetting>;
export type ReminderHabit = { id: number; title: string; frequency: string; days: number[]; archived: boolean };
export type ReminderRequest = {
  id: string;
  owner: string;
  habitId: number;
  title: string;
  hour: number;
  minute: number;
  weekday?: number; // Expo: Sunday = 1
  signature: string;
};
export type ScheduledReminder = { id: string; owner?: string; signature?: string };
export interface ReminderPort {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  allowed(): Promise<boolean>;
  list(): Promise<ScheduledReminder[]>;
  cancel(id: string): Promise<void>;
  dismiss(): Promise<void>;
  schedule(request: ReminderRequest): Promise<string>;
}

export const REMINDER_KIND = 'pixelquest-habit-reminder';
export const reminderKey = (owner: string) => `pixelquest:habit-reminders:v1:${owner}`;
export const validTime = (hour: number, minute: number) =>
  Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59;

export function parseSettings(raw: string | null): ReminderSettings {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Saved reminder settings are invalid.');
  const result: ReminderSettings = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (!/^\d+$/.test(id) || !value || typeof value !== 'object') throw new Error('Saved reminder settings are invalid.');
    const s = value as ReminderSetting;
    if (typeof s.enabled !== 'boolean' || !validTime(s.hour, s.minute)) throw new Error('Saved reminder settings are invalid.');
    result[id] = { enabled: s.enabled, hour: s.hour, minute: s.minute };
  }
  return result;
}

export function buildReminders(owner: string, habits: ReminderHabit[], settings: ReminderSettings): ReminderRequest[] {
  return habits.flatMap((habit) => {
    const s = settings[String(habit.id)];
    if (habit.archived || !s?.enabled || !validTime(s.hour, s.minute)) return [];
    const days = habit.frequency === 'daily' ? [undefined] :
      [...new Set(habit.days)].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort().map(d => d + 1);
    return days.map(weekday => {
      const id = `pq-habit:${owner}:${habit.id}:${weekday ?? 'daily'}`;
      const signature = JSON.stringify([habit.title, s.hour, s.minute, weekday ?? null]);
      return { id, owner, habitId: habit.id, title: habit.title, hour: s.hour, minute: s.minute, weekday, signature };
    });
  });
}

export function responseDestination(data: Record<string, unknown>, owner: string | null | undefined) {
  if (data.kind !== REMINDER_KIND || typeof data.owner !== 'string') return null;
  if (!owner) return 'sign-in';
  return data.owner === owner ? 'habits' : null;
}

export class HabitReminderEngine {
  private owner: string | null = null;
  private generation = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private settings: ReminderSettings = {};
  private habits: ReminderHabit[] | null = null;
  private port: ReminderPort;
  constructor(port: ReminderPort) { this.port = port; }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this.tail.then(job);
    this.tail = result.catch(() => undefined);
    return result;
  }

  // Invalidate in-flight work synchronously; all native operations are serialized.
  activate(owner: string | null): Promise<ReminderSettings> {
    this.owner = owner;
    const generation = ++this.generation;
    this.settings = {};
    this.habits = null;
    return this.enqueue(async () => {
      for (const item of await this.port.list()) await this.port.cancel(item.id);
      await this.port.dismiss();
      if (generation !== this.generation || !owner) return {};
      const settings = parseSettings(await this.port.read(reminderKey(owner)));
      if (generation !== this.generation) return {};
      this.settings = settings;
      return { ...settings };
    });
  }

  sync(owner: string, habits: ReminderHabit[]): Promise<void> {
    const generation = this.generation;
    return this.enqueue(async () => {
      if (owner !== this.owner || generation !== this.generation) return;
      this.habits = habits;
      await this.reconcile(generation);
    });
  }

  save(owner: string, habitId: number, setting: ReminderSetting): Promise<ReminderSettings> {
    const generation = this.generation;
    return this.enqueue(async () => {
      if (owner !== this.owner || generation !== this.generation) throw new Error('Account changed. Open this habit again.');
      if (!validTime(setting.hour, setting.minute)) throw new Error('Use a local time from 00:00 to 23:59.');
      if (!this.habits) throw new Error('Load your habits before saving a reminder.');
      const next = { ...this.settings, [habitId]: setting };
      if (buildReminders(owner, this.habits, next).length > 60) {
        throw new Error('This device can hold 60 reminder schedules. Turn off another reminder first (each weekly day uses one).');
      }
      // Persist intent before scheduling so a process restart can repair interrupted work.
      await this.port.write(reminderKey(owner), JSON.stringify(next));
      if (generation !== this.generation) throw new Error('Account changed. Open this habit again.');
      this.settings = next;
      await this.reconcile(generation);
      return { ...next };
    });
  }

  private async reconcile(generation: number) {
    const owner = this.owner;
    if (!owner || !this.habits || generation !== this.generation) return;
    const desired = await this.port.allowed() ? buildReminders(owner, this.habits, this.settings) : [];
    if (generation !== this.generation) return;
    const existing = await this.port.list();
    const expected = new Map(desired.map(r => [r.id, r]));
    for (const r of existing) {
      if (r.owner !== owner || !expected.has(r.id) || expected.get(r.id)?.signature !== r.signature) await this.port.cancel(r.id);
    }
    if (desired.length > 60) throw new Error('Too many reminder schedules. Turn off some reminders to stay below 60.');
    try {
      for (const r of desired) {
        if (generation !== this.generation) return;
        if (existing.some(e => e.id === r.id && e.owner === owner && e.signature === r.signature)) continue;
        const id = await this.port.schedule(r);
        // A sign-out during the native await must not leave an old account's alarm.
        if (generation !== this.generation) await this.port.cancel(id);
      }
    } catch (error) {
      // Never leave a partly applied weekly schedule looking successful.
      for (const r of await this.port.list()) await this.port.cancel(r.id);
      throw error;
    }
  }
}
