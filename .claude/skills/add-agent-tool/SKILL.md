---
name: add-agent-tool
description: Add a new tool to the coding agent (name, schema, server implementation, approval policy, tests). Use when asked to give the agent a new capability.
---

A tool touches five places; do all of them:

1. `shared/agentTools.ts`: add the name to `TOOL_NAMES`; add it to `READ_ONLY_TOOLS` only if it can never change anything.
2. `src/features/agent/tools.ts`: add the JSON schema entry to `TOOLS` (clear description; mark required params).
3. `server/agent/tools.ts`: implement it in the `runTool` switch. Resolve every path with `safePath`, cap output
   with `clip`, throw `Error` with an actionable message (the model reads it). Commands go through `runCommand`.
4. `src/features/agent/policy.ts`: decide the verdict per mode (`auto` / `ask` / `block`). Default for anything that
   writes or executes: `ask` in Ask mode, never `auto` in Plan mode.
5. `src/features/agent/prompt.ts`: mention it in the rules only if the model needs guidance to use it well.
   `ToolCard` (`src/components/chat/ToolCard.tsx`) shows args generically; add a custom view only if useful.

Tests: policy table in `src/__tests__/characterization.test.ts` or a new `*.test.ts`; server behavior with a temp
dir (include a path-escape case). Finish with the `check` skill.
