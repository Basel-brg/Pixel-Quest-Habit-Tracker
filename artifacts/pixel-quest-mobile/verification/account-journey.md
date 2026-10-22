# Mobile account journey verification

Date: 2026-10-22  
Status: **Core journey manually confirmed by the user; automated authenticated
verification remains blocked, with limits recorded below.**

## Environment and method

- Development Expo web preview, directly on the Expo origin, at 400 × 720.
- Custom Expo email/password screens; no rewritten web authentication handshake.
- Dedicated randomly named Clerk development test emails with the documented
  `+clerk_test` suffix. Clerk documents `424242` as the test email code:
  https://clerk.com/docs/guides/development/testing/test-emails-and-phones
- The automated tester used a browser only. The user subsequently confirmed
  testing on a physical phone inside Expo Go and in the browser preview.
  Phone operating system and exact restart method were not specified.
- No auth settings, bot protection, existing user passwords, or legacy progress
  were changed. No test credentials or session tokens are recorded here.

## Confirmed

| Check | Evidence |
| --- | --- |
| Public Expo sign-in screen | Rendered at `/sign-in` on the Expo origin, at phone viewport size. |
| Public Expo signup screen | Rendered and submitted a dedicated test email/password attempt. |
| Mobile TypeScript check | `pnpm --filter @workspace/pixel-quest-mobile run typecheck` passed. |
| Workspace TypeScript check | `pnpm run typecheck` passed. |
| Unauthenticated API protection | `GET /api/pixelquest/profile` without authentication returned HTTP 401. |

These automated checks alone do not establish successful authentication or
authenticated UI behavior. The separate manual results below supply the
user-reported evidence for the core journey.

## User-reported result

After being directed to sign in to Pixel Quest Mobile with the existing web
account, the user reported that sign-in succeeded. They then completed the
requested checks and confirmed the following:

| Check | User-reported result |
| --- | --- |
| Existing-account password sign-in | Succeeded after selecting sign-in rather than new-account registration. |
| Session and progress persistence | Account stayed signed in after reopening; completed test task and points remained saved. |
| Shared account progress | The same task and points appeared on the web app using the same account. |
| Locked avatars | Avatars above the player's level remained locked in the picker. |
| Reward history | Claimed the requested reward and confirmed it remained in Trophy history after reopening. |
| Logout and relogin | Signed out and signed back in; the same progress returned. |
| Test environment | Selected physical phone in Expo Go, with the additional comment “both” in response to Expo Go versus browser preview. |

These are explicit manual confirmations, not an authenticated automated run.
The account's identity and dedicated-test status were not independently
verified by the agent. No credentials were requested in chat.

## Blockers

1. **Signup:** Submitting the custom Expo signup opened Cloudflare's
   “Verifying your request” dialog with a “Verify you are human” checkbox.
   The request stayed pending before reaching the email-code screen.
   The automated tester did not solve or bypass the challenge.
2. **Alternative dedicated-account setup:** The normal Clerk testing helper
   was used on the main web host only. Even when given the documented
   top-level first-name, last-name, and fresh test-email arguments, the
   resulting current-user email did not match the requested test identity.
   No password changes were attempted on that mismatched account. An
   authenticated-looking web dashboard is not proof of the requested identity.

## Remaining verification limits

- Signup email verification, invalid-code handling, and successful completion.
- Client-trust email verification was not separately reported.
- Bearer-token headers were not directly captured from an authenticated Expo
  client. Successful native task mutations and cross-client persistence are
  functional evidence of authenticated API access, not a header-level assertion.
- Username/profile edits were not separately tested.
- Locked-avatar server-side rejection was not directly requested/tested;
  the manual confirmation covers the UI lock only.
- Task and points persistence were confirmed; gold balance changes were not
  separately reported.
- Logout/relogin was confirmed; direct protected-route navigation while signed
  out and cross-account cache isolation were not independently tested.
- Reopening was confirmed on the reported environments; forced process
  termination, inspection of native SecureStore, device reboot, native keyboard
  behavior, and separate iOS versus Android runs were not established.

## Safe continuation

For future automated coverage of the remaining limits, prepare a dedicated
development test account through a supported flow and complete any human
verification manually. Development test email addresses avoid sending real
verification emails. Resume with the existing tester only after an independently
identity-verified setup is available. Supply any required credentials through
the workspace secrets flow, never in chat or this report. Do not disable bot
protection, modify another user's password, assign preserved demo data, or
rewrite a main-host handshake onto Expo.

No reproducible application defect was established during this verification,
so no application logic was changed. Keep manual, automated, and code-inspection
evidence separate when interpreting these results.
