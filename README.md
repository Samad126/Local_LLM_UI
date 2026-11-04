# Local LLM UI

A fast, fully local chat UI for [Ollama](https://ollama.com): streaming chat with thinking/vision support, a sandboxed
coding agent, web search, and one-click PDF / DOCX / XLSX / PPTX generation. Runs in the browser or as an Electron app.
Chats are stored in your browser (IndexedDB); nothing leaves your machine except web searches you enable.

## Run

```sh
npm install
npm run dev        # http://localhost:5173 (needs Ollama on :11434)
npm start          # production build + preview server
npm run desktop    # Electron app (builds first)
```

Optional: install LibreOffice (`soffice`) for higher-fidelity PDF output and PPTX previews. Without it the app falls
back to a built-in PDF renderer.

## Scripts

| Script                    | What it does                                                 |
| ------------------------- | ------------------------------------------------------------ |
| `npm run check`           | typecheck + lint + tests + format check (run before commits) |
| `npm test` / `test:watch` | Vitest unit tests                                            |
| `npm run lint`            | oxlint                                                       |
| `npm run format`          | Prettier (`format:check` to verify only)                     |
| `npm run typecheck`       | `tsc --noEmit`                                               |

## Architecture

```
shared/     Code used by both the browser and the Node side: constants, tool names, and the shell-command guard.
server/     Vite middleware that acts as the local backend (no separate process):
              agent/    sandboxed file + shell tools for the coding agent   (/api/agent/*)
              web/      DuckDuckGo/SearXNG search and page fetch, SSRF-guarded (/api/web/*)
              convert/  DOCX/PPTX -> PDF via LibreOffice                    (/api/convert/*)
              http.ts   shared helpers: JSON/body reading, loopback check, plugin wrapper
electron/   Desktop shell (main process + preload). Serves the built app and exposes a native folder picker.
src/
  stores/     Zustand state: chats (chatStore), settings, preview pane, lightbox, composer inbox
  services/   I/O boundaries: typed Ollama client, agent/web/convert API clients, IndexedDB, debounced persistence
  features/
    chat/     One assistant turn: request building, web context, streaming, summarising, auto-title (no Zustand
              dependency; talks to the app through the ChatHost interface in host.ts)
    agent/    Tool schemas, approval policy, tool-call recovery from text, history compaction, the tool-run loop
    artifacts/ Collects previewable/downloadable outputs of a chat
  lib/        Pure helpers; lib/docs builds each file format (docx, pdf, pptx, xlsx, math, csv)
  components/ UI grouped by area (chat, composer, markdown, preview, sidebar, pages, overlays, common); ui/ is shadcn
  types/      Domain types and Ollama wire types
```

Dependency direction: `components → stores → features → services/lib`, with `shared/` importable from anywhere.
`features/` has no runtime dependency on the app stores; it receives a `ChatHost`, which keeps the chat logic testable without React.

## Security model

The agent can run shell commands and edit files, so the backend is deliberately strict:

- `/api/agent/*`, `/api/web/*` and `/api/convert/*` only answer requests addressed to a **loopback host** from a loopback
  origin (blocks LAN access and DNS rebinding). The agent endpoint additionally requires an `X-Agent: 1` header.
- File tools resolve every path through symlinks and refuse anything outside the chosen workspace folder.
- **Approval policy** (client, `features/agent/policy.ts`): Ask / Edits / Plan / Auto modes. Plan is read-only. Risky
  commands (`sudo`, `rm -rf /`, force-push, `curl | sh`, …) always need a human, even in Auto mode.
- Commands that would kill the app itself (`pkill`, `killall`, `kill` of its own PIDs, anything touching its port)
  are refused by both the client and the server, from the same rules in `shared/commandGuard.ts`.
- Web page fetching refuses private, loopback, link-local and CGNAT addresses and re-checks every redirect hop.

## Conventions

- Imports use the `@/` (src) and `@shared/` aliases, never deep relative paths.
- Put logic that can be pure in `lib/` or `features/` and cover it with a `*.test.ts` next to it.
- Use the in-app `Confirm` / `PromptDialog` instead of `window.confirm/prompt/alert` (Electron does not support them).
