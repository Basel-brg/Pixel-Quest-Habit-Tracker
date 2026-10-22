---
name: Auth UI bundling
description: Why the web app explicitly bundles Clerk UI
---

Preserve the explicitly bundled Clerk UI when revising the web auth provider. Do not substitute disabling UI preload.

**Why:** Remote UI loading stalled initialization on the proxied development host even though the browser SDK script returned successfully. Disabling preload restored sessions but made built-in sign-in forms fail because UI components were absent. Bundling the UI avoids that dependency.

**How to apply:** Verify both an authenticated page and the public sign-in form after provider changes. A successful script download or programmatic session test does not prove the built-in auth forms work. Keep visible loading feedback around protected content.
