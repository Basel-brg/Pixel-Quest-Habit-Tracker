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

Verify exploit behavior during environment setup, not only when editing patches.

**Why:** Restoring dependencies can silently lose local patch contents without
changing tracked files, so a previously passing security test is not evidence
that the restored environment is still protected.

**How to apply:** Keep setup fail-closed: allow one locked re-import to repair
installed drift, then require the exploit checks to pass before continuing.

Keep security fixes within the dependency's compatible major version when
tooling depends on legacy schema and error APIs.

**Why:** Zod 3 has no fixed upstream release, but Expo's CLI and existing error
consumers still depend on it. Forcing every consumer onto Zod 4 solely to clear
version-based warnings risks breaking mobile tooling.

**How to apply:** Preserve the tested local mitigation until a compatible fixed
release or a separately verified consumer migration is available. Clearly
document any fail-closed input limits; do not silently remove them on upgrade.
