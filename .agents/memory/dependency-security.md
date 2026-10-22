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

Do not trust a patched dependency directory name as proof that its contents are
patched.

**Why:** A restored workspace contained pristine braces source under the correct
pnpm patch-hash directory. An ordinary frozen install reported it up to date;
forced re-import restored the tracked patch and made the exploit checks pass.

**How to apply:** When installed behavior contradicts a tracked patch, compare the
actual source and use a frozen forced reinstall before changing a correct patch.
