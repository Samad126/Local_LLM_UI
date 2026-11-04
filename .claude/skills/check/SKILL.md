---
name: check
description: Run the full verification suite (typecheck, lint, tests, format check, build) and report failures. Use before finishing any code change or when asked to verify/validate the project.
---

Run these from the project root and stop at the first failing step, fixing it before continuing:

1. `npm run check` (typecheck + oxlint + vitest + prettier check)
2. `npx vite build`

If formatting fails, run `npm run format` and re-check. Report: what passed, what failed (with the exact error),
and what you changed to fix it. Never skip or weaken a test/lint rule to make a step pass.
