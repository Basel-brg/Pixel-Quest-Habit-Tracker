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
