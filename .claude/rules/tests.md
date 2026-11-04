---
paths:
  - '**/*.test.ts'
---

- Vitest runs in a `node` environment: test pure functions, don't import modules that touch `window`/`document`.
- Co-locate tests (`foo.ts` → `foo.test.ts`); use `it.each` for table cases.
- For filesystem tests use a temp dir and clean up; test symlink escapes for anything path-related.
- Characterization tests in `src/__tests__/` pin legacy behavior: update them only when behavior changes on purpose.
