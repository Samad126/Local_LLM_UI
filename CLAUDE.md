# Local LLM UI

React 19 + Vite 8 + Zustand chat UI for Ollama, with a sandboxed coding agent, web search and PDF/DOCX/XLSX/PPTX
generation. Runs in the browser or Electron. The "backend" is Vite middleware in `server/` (no separate process).
See README.md for the architecture overview and security model.

## Commands

- `npm run check` — typecheck + oxlint + vitest + prettier check. **Run before declaring work done.**
- `npm test` / `npm run test:watch` · `npm run lint` · `npm run typecheck` · `npm run format`
- `npm run dev` (http://localhost:5173, needs Ollama on :11434) · `npm run desktop` (Electron)

## Layout and dependency direction

`components → stores → features → services/lib`; `shared/` is importable from anywhere (client and server).

- `features/` must not import a Zustand store at runtime; it talks to the app through `ChatHost` (`features/chat/host.ts`).
- `server/` must not import from `src/`. Share code through `shared/` only.
- Imports use `@/` (src) and `@shared/` (shared). No deep relative paths.
- `src/components/ui/` is shadcn-generated: don't hand-edit, don't add files unless they are used.

## Rules of thumb

- Put pure logic in `lib/` or `features/` with a `*.test.ts` beside it; keep components thin.
- Never use `window.alert/confirm/prompt` (unsupported in Electron): use `Confirm` / `PromptDialog` or inline error text.
- Don't add `any` at API boundaries; Ollama wire types live in `src/types/ollama.ts`.
- Shell-command safety rules exist once, in `shared/commandGuard.ts`. Change them there, with tests.
- Chat deletion must call `cancelSave` (services/persistence.ts) so a debounced save can't resurrect the chat.
- Keep files under ~300 lines; split by responsibility, not by size alone.

## Security-sensitive areas (be careful, add tests)

`server/agent/*` (path sandbox, shell), `server/web/ssrf.ts`, `server/http.ts` (loopback check),
`shared/commandGuard.ts`, `src/features/agent/policy.ts` (approval modes).
