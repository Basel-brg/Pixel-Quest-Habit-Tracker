# Dependency security patches

Run `pnpm install --frozen-lockfile` and `pnpm run test:security` to verify these
fixes against the dependencies resolved by their actual consumers. This project
uses Node.js 24; query-string's ESM interop also relies on that runtime's
synchronous `require(esm)` support. Expo's Metro bundler supports the same
default-export interop.

If the nesting checks fail even though the lockfile lists the patch hash, run
`pnpm install --frozen-lockfile --force` to re-import dependencies, then rerun
`pnpm run test:security`. An existing dependency directory can contain unpatched
files despite its patched directory name; an ordinary up-to-date install does
not repair it. Never treat the directory name or lockfile hash alone as proof
that the installed code is protected. The suite also checks that Expo's Metro
and code-signing consumers and the sandbox resolve to the exploit-tested copies.

The post-merge setup runs these checks after installing dependencies. If they
fail, it forces one frozen-lockfile re-import and checks again. A second failure
stops setup before database changes, rather than accepting unprotected code.

## node-forge 1.4.0 — GHSA-86w9-cpqp-85rv

No fixed release is available as of 2026-10-22. The patch enforces the nested
DigestAlgorithm element count: exactly one OID and, if present, one empty NULL.
It rejects extra children, wrong-type optional parameters, and nonempty NULLs.
Valid SHA-256 with absent NULL parameters and normal SHA-256/SHA-1/MD5 signatures
remain supported.

Reference: https://github.com/digitalbazaar/forge/pull/1152

## braces 3.0.3 — GHSA-vfj7-8cjw-p6xm

No fixed release is available as of 2026-10-22. Parsing limits total brace and
parenthesis nesting to 128 stack entries before the recursive walkers run.
Compile, expand, and stringify also enforce a recursion bound for caller-supplied
ASTs. Excessively deep inputs throw an explicit SyntaxError rather than exhausting
the JavaScript call stack. Normal glob patterns and range expansion are unchanged.

## query-string 7.1.3 — fixed decoder compatibility

The workspace overrides decode-uri-component to 0.5.0 to fix
GHSA-vcc3-ghjq-m6fr. That release is ESM, whereas Expo Router's query-string 7
consumer is CommonJS. The small interop patch unwraps its default export without
changing query-string's API or upgrading Expo Router.

## Other fixed releases

- uuid 11.1.1 fixes GHSA-w5hq-g745-h8pq while retaining the CommonJS entry point
  used by Expo's xcode tooling. Newer major releases are ESM-only.
- postcss-selector-parser 7.1.7 fixes GHSA-rj75-hqrm-r3gf. This overrides the
  vulnerable exact pin still used by @tailwindcss/typography.
- body-parser 2.4.0 fixes GHSA-27r3-jxmh-p828 in Express's compressed body reader.
- undici 7.30.1 fixes GHSA-xjj6-f33q-929c, GHSA-4qv8-2p9j-2685, and
  GHSA-f72v-6w45-q472 without changing the major version used by Scalar.
- fast-uri 3.1.9 fixes GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr,
  GHSA-333x-w4r6-6crp, and GHSA-xhq7-xmqj-769h, retaining AJV's major version.
- Zod 4.6.7 replaces vulnerable Zod 4 copies (GHSA-mrhx-c7xc-m3w5).

## Zod 3.25.76 — GHSA-mrhx-c7xc-m3w5

No fixed Zod 3 release is available as of 2026-10-24. Expo's CLI and existing
schema/error consumers still require Zod 3, so forcing a major-version override
is not safe. The tracked patch rejects arrays larger than **10,000 items** with
a normal `too_big` validation issue, before allocating per-element results,
issues, or async promises. This is an intentional fail-closed size limit,
including for otherwise valid arrays. Arrays up to the limit retain their normal
validation, transformation, refinement, and error-path behavior.

The patch covers both Zod 3 and the embedded Zod 4/mini implementation, in CommonJS,
ESM, and TypeScript source. Regression tests exercise oversized inputs against
each runtime entry point, verify no element callback runs, and check the boundary.
The suite also checks HTTP parsing, response integrity, EventSource state limits,
and URI-confusion attacks against the versions resolved by their real consumers.

## Audit interpretation and maintenance

Version-only audits can still report node-forge 1.4.0, braces 3.0.3, and Zod
3.25.76 because local
patches do not alter package versions. These advisories are **not** suppressed or
ignored in audit configuration. The tracked pnpm patches and their lockfile hashes
apply on fresh installs, and the regression tests exercise their attack paths.
Replace these local patches with upstream fixed releases when available, keeping
the regression tests. A clean version-only audit is not claimed.
