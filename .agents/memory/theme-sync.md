---
name: Account theme synchronization
description: User-confirmed scope of the six-theme preference across web and native mobile
---

«على حسب اختيار المستخدم اذا غير الثيم في حسابة تتم مزامنة هذا الاختيار بين الويب وبين التطبيق».

Apply the selected visual theme on both the web interface and the native app. A local cache is only for immediate rendering; the account's persisted preference is authoritative.

**Why:** The user explicitly confirmed this behavior. Syncing only a stored setting without applying the native appearance does not satisfy the request.

**How to apply:** Future theme work must support changing from either client, refreshing the other client, account isolation, and preserving existing sessions and game progress. Do not substitute device light/dark settings for the user's chosen theme.

