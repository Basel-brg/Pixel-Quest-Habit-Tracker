---
name: Habit reminder product boundaries
description: Device-local account separation and the limits of web/Expo Go evidence
---

Habit reminder times are intentionally per-device, optional, and isolated by
account. They must not sync across devices, change server day/streak calculations,
or complete habits/award XP when an alert is opened.

**Why:** These are explicit product boundaries requested for personal mobile
reminders, not gaps to fill through a server or web-notification implementation.

**How to apply:** Preserve these boundaries when extending reminders. Treat
schedule intent separately from habit completion.

Do not report successful native delivery based on a web preview, successful
Hermes bundle, or an in-memory scheduling test. Expo Go can exercise local
notifications, but cannot exercise app-specific native configuration.

**Why:** No native device/emulator was available during initial implementation;
background clock-change behavior depends on native app configuration that Expo
Go does not include.

**How to apply:** State which runtime was actually tested and explicitly separate
native delivery, process-restart persistence, and closed-app clock changes from
logic tests. Keep a native-build test for app-specific receiver behavior.
