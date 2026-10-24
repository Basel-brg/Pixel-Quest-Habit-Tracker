---
name: Expo authentication verification limits
description: Identity and origin checks required before mobile account testing
---

Do not treat a main-web test-helper session as an authenticated Expo session.
Before mutating any account prepared by a helper, compare the actual signed-in
identity with the explicitly requested dedicated test identity.

**Why:** The helper produced a signed-in main-web session whose email did not
match the requested fresh test identity, even with documented top-level
identity arguments. Expo signup was independently blocked by a human
verification challenge. Neither observation establishes successful Expo auth.

**How to apply:** Use a supported Expo-origin login with a verified dedicated
account. Never rewrite the web helper's handshake onto Expo, alter a mismatched
account, or bypass a human-verification challenge. Keep authenticated checks
explicitly unverified until that login succeeds. Browser persistence cannot
prove native SecureStore or process-restart behavior.

Use the dedicated Expo preview origin at `/`, not the shared web host's `/mobile/` path, when checking Expo web rendering.

**Why:** The shared host can return Expo HTML but leave an empty root and failed resources even when the dedicated Expo origin renders normally. This is not evidence that native routing is broken.

**How to apply:** Use the mobile artifact screenshot target or the development Expo domain; allow the initial Metro load to settle before diagnosing a blank screen. Never transfer a web-auth handshake to that origin.
