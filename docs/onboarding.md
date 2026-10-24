# Account onboarding

## Persistence and safety

- `GET /api/pixelquest/rpg` and the legacy profile response expose the account's completion marker, setup draft, revision, focus preference, and active theme.
- Authenticated `POST /api/pixelquest/rpg/actions` accepts `onboardingDraft`, `completeOnboarding`, and `skipOnboarding`. The OpenAPI contract generates both clients and server validators.
- Draft writes are full replacements, not merges. Draft and completion requests must include `expectedOnboardingRevision`; a mismatch returns HTTP 409 and the client offers to reload the server-confirmed draft.
- Step advancement validates earlier selections. Saving a draft grants no XP and creates no habits or rewards.
- Completion and skip share the existing account transaction lock. The completion marker is terminal across request IDs, including complete/skip races. Finalization creates the optional daily habit and its real-life reward and records a durable 50-XP award with no stat or Gold component.
- Coffee always requires level 2 **and** three days on the linked habit; the meal requires level 2 **and** five days. The item starts at level 2 only; a user may add a streak explicitly. There is no implicit Gold cost or savings transaction.
- Account/theme synchronization reuses the existing preference and timestamp. Local preview/cache values cannot prove setup completion. Native query caches are recreated on identity changes.

## Migration

Run `pnpm --filter @workspace/db run migrate:onboarding` before schema push on an older database. The additive migration marks existing owned profiles complete without changing progression or adopting unowned records. Newly created profiles retain the false default. It is safe to rerun and safe before the initial schema push on an empty database.

The post-merge script runs migration before schema push. Do not reverse this order: once the column has been added by a generic schema push, the migration cannot infer which accounts predate onboarding.

## Verification (2026-10-24)

Passed:

- Shared API generation and full workspace TypeScript checks.
- Real-database RPG regression suite, including migration old/new/unowned profiles, ownership, replacement/resume, revision conflicts, unique names, rollback, exact starter XP, duplicate requests, terminal replay, complete/skip races, proof enforcement, reward linkage, and AND unlocking.
- Existing dependency exploit, voice-intake, habit/quest-assistant, and reward-assistant suites.
- Authenticated desktop web journey using fresh dedicated identities verified before mutation: direct protected-link gating, six preview assets, live theme selection, radar focus without points, Arabic habit/proof, coffee gates, Back/Next, step-four refresh, pending bonus, completion, real Rewards visibility, and terminal redirect.
- A second fresh identity verified skip with no game records or XP, responsive 390×844 Arabic form controls, and account switching without leaking game state.
- Browser mute/reduced-motion settings and signed-out web routing.
- Expo web preview at the registered dedicated Expo origin settled on the native app's sign-in screen; script/font/Clerk resources returned successfully, with no page errors. The shared web host's `/mobile/` path is not an equivalent preview target.

Not established by those checks:

- Physical iOS/Android authentication, SecureStore/process restart, device handoff, native keyboards, screen readers, hardware audio/haptics, or real camera verification. Browser layout checks do not establish native-device behavior.
- The second-tab conflict **UI** was not exercised in the first browser pass; server conflict behavior is covered by real-database tests.

The signed-out Expo preview check is separate from native-device verification; a browser session is not proof of a native session.
