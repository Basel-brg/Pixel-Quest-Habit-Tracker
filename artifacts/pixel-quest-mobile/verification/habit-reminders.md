# Habit reminders: verification and device limits

Date: 2026-10-22

## Implemented behavior

- Each existing habit has an expandable reminder editor on the Habits screen:
  optional toggle, local 24-hour time, save/cancel, and device settings access.
  Add a habit first, then configure its reminder.
- Settings live only in this installation's AsyncStorage, namespaced by account.
  They are not sent to the API, synchronized to other devices, or migrated from
  anonymous data. Archive preserves the setting but removes its pending alarms.
- Daily reminders use a native daily calendar trigger; weekly reminders use one
  native weekly trigger per selected weekday (Sunday = 1 in Expo).
- Stable identifiers and serialized reconciliation replace outdated schedules,
  recover persisted intent after interrupted scheduling, and prevent concurrent
  account changes from leaving alarms behind. Explicit logout awaits cancellation
  and removal of delivered habit notifications before signing out.
- At cold start/account change, old alarms are canceled first. The correct
  account's settings are loaded, and active habits must load successfully before
  scheduling resumes. If offline at cold start, settings remain saved but
  notifications wait for habit loading/retry. Already scheduled native reminders
  can otherwise run without the app or network.
- Active habits refresh every minute while mounted and on resume. Changes made
  elsewhere cannot update a closed app's local reminders until its next sync.
- Permission is requested only through an explicitly explained enable/save
  action. Denial retains the draft and offers device settings; revocation cancels
  pending reminders during the next reconciliation. Android channel blocking is
  checked as well as application permission. Disabled settings can be saved
  without granting permission.
- Notification responses only select the fixed sign-in/Habits destinations.
  Signed-out responses retain their intent through login, and only the original
  account may navigate to Habits. No habit-completion or XP mutation runs.
- A conservative limit of 60 native schedules prevents iOS pending-notification
  truncation; each weekly weekday consumes one schedule. Exceeding it is explicit.

## Checks performed

| Check | Result |
| --- | --- |
| `pnpm --filter @workspace/pixel-quest-mobile run typecheck` | Passed |
| `pnpm --filter @workspace/pixel-quest-mobile run test:reminders` | 11 passing Node tests of the scheduling engine; uses an in-memory notification/storage adapter, not a native device |
| `expo export --platform all` | Web, iOS Hermes, and Android Hermes bundles exported successfully to `/tmp`; this is bundling, not native installation or delivery verification |
| `expo config --type introspect --json` | Passed; Android manifest includes the clock/timezone receiver |
| Mobile workflow | Running; optional desktop React Native DevTools cannot load `libglib-2.0.so.0` in this Linux host, but Metro serves the app |
| Public mobile sign-in screenshot | App loads; screenshot caught the Clerk loading state, with browser logs subsequently reaching the sign-in password input |

Engine tests cover daily/weekly mapping, invalid settings/time, edits without
duplicates, archive/restore, simulated process restart, logout/relogin and
account switching, sign-out during an in-flight native scheduling call, stale
callbacks, permission revocation/restoration, scheduling failures/retry, the
schedule limit, and account-checked notification destinations.

## Native verification limits — not claimed as passed

This Linux workspace has no connected device, Android emulator/ADB, or iOS
simulator. Native notification delivery, actual permission dialogs, notification
taps, AsyncStorage after a real process restart, and the generated Java receiver
have **not** been exercised on a native runtime. No authenticated browser journey
was run as a substitute for those checks.

SDK 57 documentation explicitly supports **local** notifications in Expo Go:
https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
Remote push, web notifications, push tokens, and server scheduling are not used.

For normal local-reminder testing, use an SDK-57-compatible Expo Go on a phone.
For **Android timezone/manual-clock changes while the app is closed**, use a
native development/release build containing `plugins/with-reminder-clock.cjs`.
Expo Go cannot include that app-specific receiver; it repairs alarms when the
app resumes instead. The receiver uses Expo's existing reboot restoration path
to recompute calendar alarms when Android broadcasts TIME_SET/TIMEZONE_CHANGED.
iOS calendar triggers use floating device-local date components.

Expo's compatibility checker recommends newer patch releases of Expo, Router,
and Location. Its attempted `expo install --fix` was blocked by the workspace's
minimum package release-age policy. Existing SDK-57 versions were retained;
no security/maturity policy was bypassed. Notification package 57.0.23 matches
the SDK-57 documentation.

### Device acceptance checklist

1. Sign in with a dedicated account; create a harmless daily habit. Set its
   reminder a few minutes ahead; allow notifications. Background the app and
   confirm one notification, then tap it: Habits opens, completion/XP unchanged.
2. Deny access first on a fresh install; confirm the explanation and settings
   link. Grant access through device settings, return, and save. Revoke access
   again and return; the UI reports the blocked state and cancels alarms.
3. Edit time repeatedly; inspect native pending schedules for one daily alarm
   (or one per selected weekly day), with no obsolete time/day/title. Verify
   only selected weekdays fire.
4. Archive, inspect cancellation, restore, and confirm the saved time returns.
   Disable and confirm no pending alarms remain.
5. Terminate/reopen the app on the same device while signed in; after habits
   load, the same settings return and no duplicate schedules exist.
6. Log out before the alarm time; inspect cancellation and notification-center
   cleanup. Sign in as a different account, including overlapping habit IDs,
   and confirm no settings/alarms leak. Relogin to the original account and
   confirm only its reminders return.
7. Tap a saved notification when signed out; sign in as the same account and
   confirm Habits opens. A different account must not consume that destination.
8. In a native Android build, change timezone/manual clock while the process
   is closed and confirm the alarm follows the new local time. Repeat across
   a DST transition on Android/iOS. On Expo Go Android, reopen after changing
   the clock to trigger reconciliation.

Android battery optimizations/Doze, force-stop, channel settings, and OS
notification limits may delay or suppress delivery. This feature does not
request exact-alarm privileges and does not promise alarm-clock precision.
