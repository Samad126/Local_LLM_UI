---
paths:
  - 'src/features/**'
  - 'src/services/**'
---

- No runtime import of anything in `src/stores/` or `src/components/`. Need app state? Add a method to `ChatHost` and implement it in `stores/chatStore.ts`.
- Type Ollama requests/responses with `src/types/ollama.ts`; avoid `any`.
- Housekeeping model calls (title, summary, search query) go through `quickChat`, not ad-hoc `chatOnce` calls.
- Prompt text lives in `features/chat/prompts.ts` / `features/agent/prompt.ts`, not inline in logic.
- Magic numbers (context sizes, limits) come from `shared/constants.ts` or a named const.
- New pure functions get a `*.test.ts` next to them.
