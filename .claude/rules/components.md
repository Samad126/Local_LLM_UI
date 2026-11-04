---
paths:
  - 'src/components/**'
  - 'src/App.tsx'
---

- Components render and wire events; non-trivial logic goes in a hook (`useX.ts`) or `features/`/`lib/`.
- Group by area under `components/{chat,composer,markdown,preview,sidebar,pages,overlays,common}`; `ui/` is shadcn only.
- Read the active chat with `useActiveChat(selector)` to avoid re-rendering on unrelated changes.
- Use `Confirm` / `PromptDialog` (not `window.*` dialogs). Show recoverable errors inline.
- Use `hostname()` / `faviconUrl()` from `lib/url.ts` instead of `new URL()` in render (it can throw).
- Repeated option lists (e.g. `THINK_OPTIONS`) live in `common/Fields.tsx`.
- Wrap browser storage access in try/catch (it can be blocked).
