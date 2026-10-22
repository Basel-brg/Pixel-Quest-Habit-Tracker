const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

const receiverName = 'com.pixelquest.reminders.HabitReminderClockReceiver';
const actions = ['android.intent.action.TIMEZONE_CHANGED', 'android.intent.action.TIME_SET'];

// Expo's stock receiver restores alarms after reboot, but not clock/timezone changes.
// Reuse that same restore path so daily/weekly calendar components are recalculated
// even while JS is suspended. This plugin requires a native build, not Expo Go.
const receiverSource = `package com.pixelquest.reminders;

import android.content.Context;
import android.content.Intent;
import expo.modules.notifications.service.NotificationsService;

public class HabitReminderClockReceiver extends NotificationsService {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent != null && (Intent.ACTION_TIMEZONE_CHANGED.equals(intent.getAction())
        || Intent.ACTION_TIME_CHANGED.equals(intent.getAction()))) {
      super.onReceive(context, new Intent(Intent.ACTION_BOOT_COMPLETED));
    }
  }
}
`;

module.exports = function withReminderClock(config) {
  config = withAndroidManifest(config, config => {
    const application = config.modResults.manifest.application[0];
    application.receiver ??= [];
    if (!application.receiver.some(r => r.$['android:name'] === receiverName)) {
      application.receiver.push({
        $: { 'android:name': receiverName, 'android:enabled': 'true', 'android:exported': 'false' },
        'intent-filter': [{ action: actions.map(name => ({ $: { 'android:name': name } })) }],
      });
    }
    return config;
  });
  return withDangerousMod(config, ['android', async config => {
    const dir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/java/com/pixelquest/reminders');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'HabitReminderClockReceiver.java'), receiverSource);
    return config;
  }]);
};
