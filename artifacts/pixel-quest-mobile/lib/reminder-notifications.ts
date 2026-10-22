import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { HabitReminderEngine, REMINDER_KIND, type ReminderPort } from './habit-reminder-engine';

export const remindersSupported = Platform.OS === 'ios' || Platform.OS === 'android';
const channelId = 'habit-reminders';
// Do not load the native module or request browser notification permissions on web.
export const nativeNotifications = () => import('expo-notifications');

export async function reminderPermission(request = false): Promise<boolean> {
  if (!remindersSupported) return false;
  const n = await nativeNotifications();
  if (Platform.OS === 'android') {
    await n.setNotificationChannelAsync(channelId, {
      name: 'Habit reminders', importance: n.AndroidImportance.DEFAULT, sound: 'default',
    });
  }
  let permission = await n.getPermissionsAsync();
  if (request && !permission.granted && permission.canAskAgain) {
    permission = await n.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
  }
  const granted = permission.granted || permission.ios?.status === n.IosAuthorizationStatus.PROVISIONAL;
  if (granted && Platform.OS === 'android') {
    const channel = await n.getNotificationChannelAsync(channelId);
    return !!channel && channel.importance !== n.AndroidImportance.NONE;
  }
  return granted;
}

const port: ReminderPort = {
  read: key => AsyncStorage.getItem(key),
  write: (key, value) => AsyncStorage.setItem(key, value),
  allowed: () => reminderPermission(),
  list: async () => {
    if (!remindersSupported) return [];
    const n = await nativeNotifications();
    return (await n.getAllScheduledNotificationsAsync())
      .filter(r => r.content.data?.kind === REMINDER_KIND)
      .map(r => ({ id: r.identifier, owner: r.content.data?.owner as string, signature: r.content.data?.signature as string }));
  },
  cancel: async id => { if (remindersSupported) await (await nativeNotifications()).cancelScheduledNotificationAsync(id); },
  dismiss: async () => {
    if (!remindersSupported) return;
    const n = await nativeNotifications();
    for (const r of await n.getPresentedNotificationsAsync()) {
      if (r.request.content.data?.kind === REMINDER_KIND) await n.dismissNotificationAsync(r.request.identifier);
    }
  },
  schedule: async r => {
    const n = await nativeNotifications();
    return n.scheduleNotificationAsync({
      identifier: r.id,
      content: {
        title: 'Time for your habit',
        body: r.title,
        sound: 'default',
        data: { kind: REMINDER_KIND, owner: r.owner, habitId: r.habitId, signature: r.signature },
      },
      trigger: r.weekday === undefined
        ? { type: n.SchedulableTriggerInputTypes.DAILY, hour: r.hour, minute: r.minute, channelId }
        : { type: n.SchedulableTriggerInputTypes.WEEKLY, weekday: r.weekday, hour: r.hour, minute: r.minute, channelId },
    });
  },
};

export const habitReminderEngine = new HabitReminderEngine(port);
