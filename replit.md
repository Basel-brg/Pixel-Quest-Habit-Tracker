# Pixel Quest

An account-based, retro habit tracker that turns real discipline into character progress and user-defined real-life rewards.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (managed workflow supplies PORT)
- `pnpm --filter @workspace/pixel-quest run dev` — responsive web app
- `pnpm --filter @workspace/pixel-quest-mobile run dev` — existing Expo companion
- `pnpm --filter @workspace/api-server run test:rpg` — real-database RPG regression suite, isolated temporary accounts with cleanup
- `pnpm run test:security` — dependency exploit regression checks; do not replace these with a version-only audit
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- API build: esbuild (ESM bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API source of truth; regenerate clients/validators after contract changes.
- `lib/db/src/schema/` — original relational records plus an additive, account-owned RPG journal.
- `artifacts/api-server/src/lib/rpg-rules.ts` — calendar math and published mechanics help.
- `artifacts/api-server/src/lib/rpg-game.ts` — transactional rule engine shared by new RPG and legacy mobile endpoints.
- `artifacts/api-server/src/lib/rpg-game.test.ts` — calendar, economy, isolation and migration regression tests.
- `artifacts/pixel-quest/src/pages/` — Camp, Habits, Quests, Inventory, Rewards, Journal, Profile.

## Architecture decisions

- Preserve unowned pre-auth demo records. A first sign-in is not evidence of ownership.
- Keep old mobile endpoint shapes while applying the same economy and ownership checks as web actions.
- Freeze the first actual completion payout, including legacy awards, so undo/redo cannot recalculate a more profitable payout.
- Eligibility and spending are separate: all reward gates must pass; claiming charges only its explicitly configured Gold cost. Savings are virtual/manual, not bank transactions.
- Calendar settlement uses the configured IANA timezone and historical habit schedules. Introducing RPG mechanics never charges for earlier days.

## Product

- Private Clerk accounts, username settings, level-gated avatars and milestone timeline.
- Scheduled binary/numeric habits, partial progress, STR/INT/WIS, 30-day history, streaks and mandatory-habit HP penalties.
- Quests with exact difficulty payouts, stable task-bundle bosses, rare loot, merchant purchases and usable equipment.
- AND-gated real-life rewards, claim history, virtual savings and an optional daily chest with visible probabilities/history.
- Weekly earned-progress reports, a private downloadable pixel player card, persistent sound/scanline preferences, and browser-only reminders.
- Native screens retain the original habit/task/reward/profile flows; new web RPG screen parity is separate from native auth verification and native reminders.

## Gotchas

- Clerk UI is bundled explicitly with `ui={ui}`. Preserve managed-host key/proxy handling.
- Browser reminders require permission and an open web app; they are not native/background push notifications.
- General preferences live only in Settings, not Profile. Mobile web navigation has four daily destinations plus More; keep enough safe-area padding above its fixed bar.
- HP catches up when the account next loads; no always-on worker is required. A faint lasts six hours, halves XP, then recovers 50 HP.
- A claimed reward or defeated-boss member cannot be reopened to farm rewards. Deleting an unfinished boss member retires that boss without payout.
- The optional chest is never a paid draw, has no cash value, and enforces both a local-day limit and a 24-hour cooldown.
- If dependency exploit checks fail despite a matching patch hash, follow the forced re-import instructions in `patches/README.md`; the installed files, not just the lockfile, must pass the checks.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
