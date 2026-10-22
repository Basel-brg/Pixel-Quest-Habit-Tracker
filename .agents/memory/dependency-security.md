---
name: Dependency security maintenance
description: Why local security patches are needed and how to interpret version-only audit results
---

Use tracked pnpm patches when the latest upstream release remains vulnerable;
do not suppress its advisory just to obtain a clean version-only audit.

**Why:** The latest node-forge and braces releases had no published fixes when
their signature-validation and deeply nested pattern advisories were addressed.
Upgrading the entire Expo stack would still include these vulnerable releases.
Version-only scanners cannot recognize the local fixes.

**How to apply:** Check the patch documentation and run the exploit regression
tests before replacing or removing patches. Prefer fixed upstream releases once
available, and preserve the CommonJS compatibility needed by Expo's tooling.
