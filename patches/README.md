# Dependency security patches

Run `pnpm install --frozen-lockfile` and `pnpm run test:security` to verify these
fixes against the dependencies resolved by their actual consumers. This project
uses Node.js 24; query-string's ESM interop also relies on that runtime's
synchronous `require(esm)` support. Expo's Metro bundler supports the same
default-export interop.

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

## Audit interpretation and maintenance

Version-only audits still report node-forge 1.4.0 and braces 3.0.3 because local
patches do not alter package versions. These advisories are **not** suppressed or
ignored in audit configuration. The tracked pnpm patches and their lockfile hashes
apply on fresh installs, and the regression tests exercise their attack paths.
Replace these local patches with upstream fixed releases when available, keeping
the regression tests. A clean version-only audit is not claimed.
