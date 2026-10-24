---
name: Voice-entry safeguards
description: Product rules for voice-based task capture and offline manual drafts.
---

# Voice-entry safeguards

Voice transcription and parsing require an internet connection. If the user is offline, explain that voice needs connectivity and discard the recording. Show every extracted task and habit in an editable preview with include/skip controls; never save any item from the parsing step or auto-create based on model confidence. Persist only after the user explicitly confirms.

Manual task and habit entries may be saved as account-scoped local drafts while offline, then synchronized when connectivity returns.

**Why:** The user asked to review and correct speech recognition before anything is created, while still being able to enter tasks and habits manually without a connection.

**How to apply:** Keep recording audio temporary, avoid logging transcripts, and make the confirmation step the only path from parsed voice suggestions to RPG mutations. Keep offline manual drafts isolated by account and safe to retry.
