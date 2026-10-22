---
name: Account ownership migration
description: Privacy decision for pre-authentication Pixel Quest records
---

Pre-authentication shared game records must remain preserved and unassigned unless the user explicitly chooses a verified owner. New authenticated accounts start with private, empty progress.

**Why:** There is no trusted ownership mapping for the old shared profile. Giving it to the first signer could expose the creator's data to another visitor.

**How to apply:** Any future import or transfer must ask which signed-in account should own the legacy records and require explicit confirmation. Do not infer ownership from sign-in order.
