#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Restored node_modules can contain pristine files under patched directory names.
# Verify actual consumer behavior; re-import once if the installed patches drifted.
if ! pnpm run test:security; then
  echo "Dependency security checks failed; restoring locked, patched dependencies." >&2
  pnpm install --frozen-lockfile --force
  pnpm run test:security
fi
pnpm --filter db push
