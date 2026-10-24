---
name: Creation assistant model
description: User's model requirement for creation-form AI assistance.
---

Use Gemma 4 only for habit, quest and reward autofill. Do not substitute a Gemini model or silently add a Gemini fallback.

**Why:** The user explicitly corrected the proposed Gemini connection: "لا بدي gemma 4 بس".

**How to apply:** Keep the model selection explicit when updating creation assistants. Google's service may be named Gemini API, but the model must be Gemma 4. Report a configuration or provider failure instead of switching model families.
