---
paths:
  - 'server/**'
  - 'shared/**'
---

- Every middleware goes through `middlewarePlugin()` in `server/http.ts`; do not hand-roll `configureServer`.
- Endpoints that run commands or fetch URLs must call `isLoopbackRequest(req)` first; the agent also requires `X-Agent: 1`.
- Read bodies with `readJson`/`readBuffer` (size-capped, decoded once). Never concatenate chunks as strings.
- Any fetch of a user-supplied URL must use `assertPublicUrl` on every redirect hop (`redirect: 'manual'`).
- File tools must resolve paths via `safePath` (follows symlinks). Never `path.join(root, userInput)` directly.
- `server/` and `shared/` can't import from `src/`. Node-only code stays out of `shared/`.
- Security changes need a test (`server/**/*.test.ts` or `shared/*.test.ts`).
