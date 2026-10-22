---
name: Vite peer-context singletons
description: Diagnose duplicate React context libraries across pnpm workspace packages in production builds.
---

For React context libraries shared by an app and linked workspace packages, matching package versions do not guarantee a shared runtime context. pnpm may resolve separate virtual-store copies when their peer dependency sets differ, causing hooks to miss a provider even though the provider tree looks correct. `pnpm why` may not make the peer-specific copies obvious; inspect each package's resolved path and verify the production bundle.

**Why:** a production build loaded separate React Query contexts for the app and generated API client, causing `No QueryClient set` despite a `QueryClientProvider` wrapping the tree. Development mode did not reproduce it.

**How to apply:** when context hooks cross workspace-package boundaries, compare resolved package paths from each importer and configure Vite `resolve.dedupe` for that singleton library.
