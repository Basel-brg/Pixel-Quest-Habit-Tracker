/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HabitReminderEngine, buildReminders, parseSettings, reminderKey, responseDestination, REMINDER_KIND,
  type ReminderHabit, type ReminderPort, type ReminderRequest, type ReminderSettings,
} from '../lib/habit-reminder-engine.ts';

const habit: ReminderHabit = { id: 1, title: 'Morning walk', frequency: 'daily', days: [], archived: false };
const on = { enabled: true, hour: 9, minute: 15 };

function fixture() {
  const storage = new Map<string, string>();
  const scheduled = new Map<string, ReminderRequest>();
  let allowed = true;
  let failSchedule = false;
  let beforeSchedule: (() => Promise<void>) | undefined;
  let dismissed = 0;
  let calls = 0;
  const port: ReminderPort = {
    read: async key => storage.get(key) ?? null,
    write: async (key, value) => { storage.set(key, value); },
    allowed: async () => allowed,
    list: async () => [...scheduled.values()],
    cancel: async id => { scheduled.delete(id); },
    dismiss: async () => { dismissed++; },
    schedule: async request => {
      calls++;
      await beforeSchedule?.();
      if (failSchedule) throw new Error('Native scheduling failed');
      scheduled.set(request.id, request);
      return request.id;
    },
  };
  return {
    storage, scheduled, port,
    get dismissed() { return dismissed; },
    get calls() { return calls; },
    setPermission: (value: boolean) => { allowed = value; },
    setFailure: (value: boolean) => { failSchedule = value; },
    intercept: (fn: () => Promise<void>) => { beforeSchedule = fn; },
  };
}

test('daily uses one local calendar schedule; weekly deduplicates and maps Sunday to Expo 1', () => {
  const settings: ReminderSettings = { 1: on };
  assert.deepEqual(buildReminders('A', [habit], settings).map(r => [r.hour, r.minute, r.weekday]), [[9, 15, undefined]]);
  assert.deepEqual(buildReminders('A', [{ ...habit, frequency: 'weekly', days: [6, 0, 0, -1, 7, 2] }], settings).map(r => r.weekday), [1, 3, 7]);
  assert.deepEqual(buildReminders('A', [{ ...habit, archived: true }], settings), []);
  assert.deepEqual(buildReminders('A', [{ ...habit, frequency: 'weekly', days: [] }], settings), []);
  assert.deepEqual(buildReminders('A', [habit], { 1: { ...on, enabled: false } }), []);
});

test('rejects corrupted settings and invalid local time rather than silently resetting', () => {
  assert.deepEqual(parseSettings(null), {});
  assert.deepEqual(parseSettings(JSON.stringify({ 1: on })), { 1: on });
  for (const raw of ['{', '[]', 'null', '{"1":{"enabled":true,"hour":24,"minute":0}}', '{"1":{"enabled":true,"hour":9,"minute":60}}']) {
    assert.throws(() => parseSettings(raw));
  }
});

test('editing time, title, and weekly days replaces alarms without duplicates; disable cancels', async () => {
  const f = fixture();
  const engine = new HabitReminderEngine(f.port);
  await engine.activate('A');
  await engine.sync('A', [habit]);
  await engine.save('A', 1, on);
  assert.equal(f.scheduled.size, 1);
  await engine.sync('A', [habit]);
  assert.equal(f.calls, 1);
  await engine.save('A', 1, { ...on, hour: 18 });
  assert.equal(f.scheduled.size, 1);
  assert.equal([...f.scheduled.values()][0].hour, 18);
  await engine.sync('A', [{ ...habit, title: 'Walk outside', frequency: 'weekly', days: [1, 4] }]);
  assert.equal(f.scheduled.size, 2);
  assert.deepEqual([...f.scheduled.values()].map(r => r.weekday), [2, 5]);
  assert.ok([...f.scheduled.values()].every(r => r.title === 'Walk outside'));
  await engine.sync('A', [{ ...habit, frequency: 'weekly', days: [6] }]);
  assert.equal(f.scheduled.size, 1);
  await engine.save('A', 1, { ...on, enabled: false });
  assert.equal(f.scheduled.size, 0);
});

test('archive/removal pauses notifications; restoring reuses the saved time', async () => {
  const f = fixture();
  const engine = new HabitReminderEngine(f.port);
  await engine.activate('A');
  await engine.sync('A', [habit]);
  await engine.save('A', 1, on);
  await engine.sync('A', []);
  assert.equal(f.scheduled.size, 0);
  assert.deepEqual(parseSettings(f.storage.get(reminderKey('A'))!)[1], on);
  await engine.sync('A', [habit]);
  assert.equal(f.scheduled.size, 1);
  await engine.sync('A', [{ ...habit, archived: true }]);
  assert.equal(f.scheduled.size, 0);
});

test('device restart, logout, switching accounts and relogin keep settings isolated', async () => {
  const f = fixture();
  let engine = new HabitReminderEngine(f.port);
  await engine.activate('A'); await engine.sync('A', [habit]); await engine.save('A', 1, on);
  engine = new HabitReminderEngine(f.port);
  assert.deepEqual(await engine.activate('A'), { 1: on });
  await engine.sync('A', [habit]);
  assert.equal(f.scheduled.size, 1);
  await engine.activate(null);
  assert.equal(f.scheduled.size, 0);
  assert.deepEqual(await engine.activate('B'), {});
  await engine.sync('B', [habit]);
  assert.equal(f.scheduled.size, 0);
  await engine.save('B', 1, { ...on, hour: 20 });
  assert.ok([...f.scheduled.values()].every(r => r.owner === 'B' && r.hour === 20));
  assert.deepEqual(await engine.activate('A'), { 1: on });
  await engine.sync('A', [habit]);
  assert.ok([...f.scheduled.values()].every(r => r.owner === 'A' && r.hour === 9));
  assert.ok(f.dismissed >= 5);
});

test('sign-out during native scheduling cannot leave an old-account alarm', async () => {
  const f = fixture();
  const engine = new HabitReminderEngine(f.port);
  await engine.activate('A'); await engine.sync('A', [habit]);
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  f.intercept(() => { entered(); return new Promise<void>(resolve => { release = resolve; }); });
  const saving = engine.save('A', 1, on);
  await waiting;
  const signOut = engine.activate(null);
  release();
  await Promise.all([saving, signOut]);
  assert.equal(f.scheduled.size, 0);
});

test('stale callbacks cannot save or restore a previous account', async () => {
  const f = fixture();
  const engine = new HabitReminderEngine(f.port);
  await engine.activate('A'); await engine.sync('A', [habit]);
  await engine.activate('B'); await engine.sync('B', [habit]);
  await assert.rejects(engine.save('A', 1, on), /Account changed/);
  await engine.sync('A', [habit]);
  assert.equal(f.scheduled.size, 0);
  assert.equal(f.storage.has(reminderKey('A')), false);
});

test('permission revocation cancels alarms but preserves intent; settings permission restores them', async () => {
  const f = fixture();
  const engine = new HabitReminderEngine(f.port);
  await engine.activate('A'); await engine.sync('A', [habit]); await engine.save('A', 1, on);
  f.setPermission(false);
  await engine.sync('A', [habit]);
  assert.equal(f.scheduled.size, 0);
  f.setPermission(true);
  await engine.sync('A', [habit]);
  assert.equal(f.scheduled.size, 1);
});

test('native failures remain visible and saved intent repairs on retry', async () => {
  const f = fixture();
  const engine = new HabitReminderEngine(f.port);
  await engine.activate('A'); await engine.sync('A', [{ ...habit, frequency: 'weekly', days: [0, 2] }]);
  f.setFailure(true);
  await assert.rejects(engine.save('A', 1, on), /Native scheduling failed/);
  assert.equal(f.scheduled.size, 0);
  f.setFailure(false);
  await engine.sync('A', [{ ...habit, frequency: 'weekly', days: [0, 2] }]);
  assert.equal(f.scheduled.size, 2);
});

test('schedule limit fails before saving an unsupported reminder', async () => {
  const f = fixture();
  const engine = new HabitReminderEngine(f.port);
  await engine.activate('A');
  const habits = Array.from({ length: 61 }, (_, i) => ({ ...habit, id: i + 1 }));
  await engine.sync('A', habits);
  for (let id = 1; id <= 60; id++) await engine.save('A', id, on);
  await assert.rejects(engine.save('A', 61, on), /60 reminder schedules/);
  assert.equal(f.scheduled.size, 60);
  assert.equal(parseSettings(f.storage.get(reminderKey('A'))!)[61], undefined);
});

test('notification tap has only fixed, account-checked destinations and no completion side effects', () => {
  const data = { kind: REMINDER_KIND, owner: 'A', habitId: 1, url: 'https://not-a-route.invalid' };
  assert.equal(responseDestination(data, null), 'sign-in');
  assert.equal(responseDestination(data, 'A'), 'habits');
  assert.equal(responseDestination(data, 'B'), null);
  assert.equal(responseDestination({ kind: 'something-else', owner: 'A' }, 'A'), null);
});
