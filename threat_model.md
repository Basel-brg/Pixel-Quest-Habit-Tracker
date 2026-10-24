# Threat Model

## Project Overview

Pixel Quest is an account-based retro habit tracker that turns real-life discipline
into RPG character progress and user-defined rewards. It is a pnpm monorepo:

- **API server** (`artifacts/api-server`) — Express 5, PostgreSQL + Drizzle ORM,
  Clerk authentication, deployed as a Replit autoscale service.
- **Web app** (`artifacts/pixel-quest`) — React/Vite SPA, authenticates with Clerk
  session cookies on the deployed domain.
- **Mobile app** (`artifacts/pixel-quest-mobile`) — Expo companion; authenticates with
  Clerk bearer tokens (`setAuthTokenGetter`) and ships a zero-dependency static server
  (`server/serve.js`).
- **Design sandbox** (`artifacts/mockup-sandbox`, `/__mockup`) — dev-only canvas.
- **Shared libs** (`lib/db`, `lib/api-zod`, `lib/api-client-react`, `lib/api-spec`).

Deployment: public autoscale deployment at `pixel-quest-habit-tracker.replit.app`.

## Assets

- **User accounts / sessions** — Clerk identities, session cookies/tokens. Compromise
  allows impersonation and full access to a user's journal.
- **Per-user game state** — habits, quests, rewards, XP, gold, inventory, journal JSON.
  Private to each user; no cross-user leaderboard or shared economy.
- **Application secrets** — `DATABASE_URL`, `CLERK_SECRET_KEY`, `GEMINI_API_KEY`.
  Gemini key gates paid multimodal AI calls (voice transcription, photo verification).
- **PII** — usernames, uploaded voice clips and photos (processed transiently, not stored).

## Trust Boundaries

- **Browser/Mobile → API** — all requests cross this boundary; the API authenticates
  via Clerk (`getAuth`) and must authorize every object and action server-side.
- **API → PostgreSQL** — Drizzle parameterized queries; one raw advisory-lock statement
  and one username-uniqueness statement, both parameterized.
- **API → Gemini** — outbound calls with a fixed URL and server-side API key.
- **Public vs authenticated** — only `/api/healthz` and the Clerk proxy
  (`/api/__clerk`) are unauthenticated. All `/api/pixelquest/*` and `/api/ai/*` routes
  are gated by per-prefix auth middleware.

## Scan Anchors

- Production entry points: `artifacts/api-server/src/routes/pixel-quest.ts`
  (all game endpoints), `artifacts/api-server/src/app.ts` (middleware chain).
- Authorization core: `artifacts/api-server/src/lib/rpg-game.ts` — every DB query is
  scoped by `userId`; `own()` enforces per-user object ownership; a per-account advisory
  lock serializes mutations. This is the single enforcement point for all read/write/
  delete/economy actions and is consistently applied. No IDOR observed.
- Auth middleware: `artifacts/api-server/src/routes/pixel-quest.ts:56-71`,
  `middlewares/clerkProxyMiddleware.ts`.
- AI/cost-sensitive paths: `lib/voice-intake.ts`, `lib/photo-verification.ts`
  (in-memory per-user rate limits in `routes/pixel-quest.ts`).
- Input validation: `lib/api-zod` (generated Zod from OpenAPI) + bespoke decoders;
  base64 media decoders enforce strict size/mime/round-trip checks.
- Dev-only, usually ignore unless proven reachable: `artifacts/mockup-sandbox`.
- SAST path-traversal flags in `pixel-quest-mobile/server/serve.js` are mitigated by
  `path.normalize` + leading-`../` strip + `startsWith(STATIC_ROOT)` guard and header
  allow-listing — treated as false positives.

## Threat Categories

### Spoofing / Improper Authentication

Authentication is delegated to Clerk and verified server-side on every request via
`getAuth`. The derived subject is `sessionClaims.userId` (a signed claim) falling back
to `auth.userId`; both come from the Clerk-verified JWT and are not attacker-controllable.
Web auth relies on same-domain session cookies; mobile uses bearer tokens.

### Tampering / Elevation of Privilege

The economy (XP, gold, awards, boss payouts, chest draws) is computed entirely
server-side; clients never supply balances. Ownership is enforced by `own()` on
user-scoped row sets, and all writes are additionally constrained with
`where(... userId = uid)`. Photo-proof habits/quests cannot be completed without a
server-verified proof token, including via the legacy mobile and generic
`/rpg/actions` paths. No mass assignment of `userId`/`role`/`xp`/`gold` is possible.

### Information Disclosure

API responses are per-user scoped. CORS is configured to reflect any origin with
credentials, which is a misconfiguration (see findings) partially mitigated by
cookie SameSite defaults and the token-based mobile design.

### Denial of Service / Cost Abuse

The paid Gemini endpoints are rate-limited per user, but the limiter is in-process and
therefore weakened on an autoscale deployment with multiple instances (see findings).
Request body size is capped (12 MB) and media decoders enforce 5-6 MB limits.
