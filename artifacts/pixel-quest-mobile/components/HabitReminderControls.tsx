import { useState } from 'react';
import { Linking, Platform, Switch } from 'react-native';
import type { Habit } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from '@/components/Themed';
import { Field, MetaText, PixelButton } from '@/components/PixelUI';
import { useColors } from '@/hooks/useColors';
import { useHabitReminders } from '@/lib/habit-reminders';

const pad = (n: number) => String(n).padStart(2, '0');
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function HabitReminderControls({ habit }: { habit: Habit }) {
  const reminders = useHabitReminders();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState('09');
  const [minute, setMinute] = useState('00');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const saved = reminders.settings[habit.id];
  const time = saved ? `${pad(saved.hour)}:${pad(saved.minute)}` : '09:00';
  const blocked = reminders.permission === false && saved?.enabled;
  const summary = !reminders.supported ? 'REMINDERS · MOBILE ONLY'
    : saved?.enabled ? `REMINDER · ${time}${habit.archived ? ' · PAUSED' : blocked ? ' · PERMISSION NEEDED' : ''}` : 'REMINDER · OFF';

  const save = async () => {
    setMessage('');
    if (!/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute) || Number(hour) > 23 || Number(minute) > 59) {
      setMessage('Enter a valid local time: hours 00–23 and minutes 00–59.');
      return;
    }
    setSaving(true);
    try {
      if (enabled && !await reminders.enablePermission()) {
        setMessage('Notifications are not allowed. Open device settings, allow notifications for this app, then save again.');
        return;
      }
      await reminders.save(habit.id, { enabled, hour: Number(hour), minute: Number(minute) });
      setOpen(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The reminder could not be saved. Try again.');
    } finally { setSaving(false); }
  };

  return <View style={{ gap: 10 }}>
    <Pressable
      accessibilityRole="button" accessibilityLabel={`Reminder settings for ${habit.title}`}
      accessibilityState={{ expanded: open }}
      testID={`habit-reminder-${habit.id}`}
      onPress={() => {
        if (!open) {
          setEnabled(saved?.enabled ?? false); setHour(pad(saved?.hour ?? 9)); setMinute(pad(saved?.minute ?? 0)); setMessage('');
        }
        setOpen(value => !value);
      }}
      style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <Feather name={saved?.enabled ? 'bell' : 'bell-off'} size={16} color={colors.cyan} />
      <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 11, color: colors.cyan, flex: 1 }}>{summary}</Text>
      <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
    </Pressable>
    {open ? !reminders.supported ? <MetaText>Local reminders work in the iOS or Android app, not in this web preview. No web notifications will be requested.</MetaText> : <View style={{ gap: 12 }}>
      <MetaText>Optional notifications for this habit, on this device only. Enabling asks for notification access. Opening a reminder never completes the habit or awards XP.</MetaText>
      {habit.archived ? <MetaText>Paused while archived. Your saved time will resume when this habit is restored.</MetaText> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.foreground }}>Remind me</Text>
        <Switch accessibilityLabel={`Enable reminder for ${habit.title}`} testID={`reminder-enabled-${habit.id}`} value={enabled} onValueChange={setEnabled} disabled={saving || reminders.busy} trackColor={{ true: colors.cyan, false: colors.border }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Field label="HOUR · 00–23" accessibilityLabel="Reminder hour" value={hour} onChangeText={setHour} keyboardType="number-pad" maxLength={2} testID={`reminder-hour-${habit.id}`} /></View>
        <View style={{ flex: 1 }}><Field label="MINUTE · 00–59" accessibilityLabel="Reminder minute" value={minute} onChangeText={setMinute} keyboardType="number-pad" maxLength={2} testID={`reminder-minute-${habit.id}`} /></View>
      </View>
      <MetaText>Device local time · {habit.frequency === 'daily' ? 'Every day' : habit.days.map(d => dayNames[d]).join(', ') || 'No scheduled days'}. Timing may vary with device battery settings.</MetaText>
      {message ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{message}</Text> : null}
      {reminders.permission === false || message.includes('not allowed') ? <>
        <MetaText>Notifications are blocked or not yet allowed. You can still use your habits without reminders. Also check the Habit reminders notification channel on Android.</MetaText>
        <PixelButton label="OPEN DEVICE SETTINGS" compact tone="quiet" testID={`reminder-settings-${habit.id}`} onPress={() => {
          const action = Platform.OS === 'ios' ? Linking.openURL('app-settings:') : Linking.openSettings();
          void action.catch(() => setMessage('Could not open settings. Open your device settings and find this app’s notifications.'));
        }} />
      </> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <PixelButton label={saving ? 'SAVING...' : enabled && reminders.permission !== true ? 'ALLOW & SAVE' : 'SAVE REMINDER'} compact testID={`reminder-save-${habit.id}`} disabled={saving || reminders.busy || !reminders.ready} onPress={() => void save()} />
        <PixelButton label="CANCEL" compact tone="quiet" disabled={saving} onPress={() => setOpen(false)} testID={`reminder-cancel-${habit.id}`} />
      </View>
    </View> : null}
  </View>;
}
