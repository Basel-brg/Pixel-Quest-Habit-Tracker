---
name: Backdrop focus restoration
description: Why pointer dismissal must cancel the backdrop's native mousedown behavior.
---

When dismissing a dialog on backdrop mousedown, prevent that event's default before unmounting the dialog and restoring trigger focus.

**Why:** The native mousedown focus action can run after synchronous unmount cleanup, moving focus back to the body. X and Escape can pass focus-return checks while backdrop dismissal still fails.

**How to apply:** Keep backdrop event cancellation when refactoring overlay dismissal; test focus return separately for pointer, close-button and keyboard dismissal.
