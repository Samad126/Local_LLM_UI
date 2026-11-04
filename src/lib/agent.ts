import type { AgentMode, Message, ToolCall } from '../types'

export type { AgentMode }
export const MODES: AgentMode[] = ['ask', 'edits', 'plan', 'auto']
export const MODE_INFO: Record<AgentMode, { label: string; hint: string }> = {
  ask: { label: 'Ask', hint: 'Asks before every file change and command' },
  edits: { label: 'Edits', hint: 'Edits files automatically, asks before commands' },
  plan: { label: 'Plan', hint: 'Read-only: explores and writes a plan, changes nothing' },
  auto: { label: 'Auto', hint: 'Runs everything without asking (risky commands still ask)' },
}

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and folders in a directory of the workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative directory path, "." for the workspace root' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a text file. Output has line numbers (not part of the file). Use start_line/end_line for large files.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, start_line: { type: 'number' }, end_line: { type: 'number' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description:
        'Search file contents with a regex (case-insensitive). Returns path:line: text. Skips node_modules and .git.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string', description: 'Optional subfolder or file' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Create a file or overwrite it completely with the given content. Prefer edit_file for small changes to existing files.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Replace old_string with new_string in a file. old_string must match the file exactly (including whitespace) and be unique unless replace_all is true.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
          replace_all: { type: 'boolean' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Run a shell command in the workspace root (tests, build, git, etc.). 2 minute timeout. Returns combined output and exit code.',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    },
  },
]

const NAMES = new Set(TOOLS.map((t) => t.function.name))
const READ_ONLY = new Set(['list_dir', 'read_file', 'search'])

export type Verdict = 'auto' | 'ask' | 'block'

// Commands that still need a human even in Auto mode.
const DANGEROUS = [
  /\bsudo\b/,
  /\bmkfs\b/,
  /\bdd\b[^|;&]*\bof=/,
  /:\(\)\s*\{/,
  /\brm\b[^|;&]*-\w*[rf]\w*[^|;&]*(\s|^)(\/|~|\$HOME|\.\.|\*)(\s|$|\/)/,
  /\bgit\s+push\b[^|;&]*(--force|-f\b)/,
  /\bgit\s+reset\s+--hard/,
  /\bgit\s+clean\b[^|;&]*-\w*f/,
  /(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z)?sh\b/,
  /\bchmod\s+-R\b/,
  /\bchown\s+-R\b/,
  />\s*\/(etc|usr|bin|boot|dev)\b/,
  /\b(shutdown|reboot|poweroff)\b/,
]
export const isDangerous = (cmd: unknown) => typeof cmd === 'string' && DANGEROUS.some((r) => r.test(cmd))

/** Commands that would kill this app (Electron + vite) along with the agent's own processes. */
export const killsApp = (cmd: unknown) =>
  typeof cmd === 'string' &&
  (/\b(pkill|killall)\b/.test(cmd) ||
    /\bfuser\b[^|;&]*-\w*k/.test(cmd) ||
    /\bkill\b[^|;&]*(\$\(|`)/.test(cmd) ||
    /\|\s*xargs\s+(-\S+\s+)*kill/.test(cmd) ||
    (/:5173\b/.test(cmd) && /\b(kill|lsof|fuser|ss|netstat)\b/.test(cmd)))

/** What to do with a tool call in a given mode. */
export function policy(name: string, args: Record<string, any>, mode: AgentMode): Verdict {
  if (READ_ONLY.has(name)) return 'auto'
  if (mode === 'plan') return 'block'
  if (name === 'run_command' && killsApp(args.command)) return 'block'
  if (mode === 'ask') return 'ask'
  if (name === 'run_command') return mode === 'auto' && !isDangerous(args.command) ? 'auto' : 'ask'
  return 'auto'
}

export const toolsFor = (mode: AgentMode) =>
  mode === 'plan' ? TOOLS.filter((t) => READ_ONLY.has(t.function.name)) : TOOLS

export const agentPrompt = (
  workspace: string,
  mode: AgentMode = 'ask',
) => `You are a coding agent working inside the user's project folder: ${workspace}${
  mode === 'plan'
    ? `
PLAN MODE: you can only read. Explore the code with the tools, then reply with a clear numbered plan (files to change and what to change). Do not try to modify anything.`
    : ''
}
Use the tools to explore and change files. All paths are relative to that folder.
Rules:
- Look before you act: list_dir / search / read_file first. Never guess file contents.
- Make minimal, targeted changes. Prefer edit_file over rewriting a whole file with write_file.
- After changing code, verify it with run_command (tests, build, or running it) when possible.
- Never use pkill, killall, fuser -k or kill by name/port: that kills the app you run inside. Start servers with "cmd & echo $!" and stop only that PID.
- If a tool returns an error, read it, fix your call, and try again.
- Call one tool at a time when the next step depends on the result.
- To create or change a file you MUST call write_file or edit_file. Putting file contents in a code block in your answer does NOT change any file.
- Act by calling the tools directly. Never write a tool call as text, JSON, or a code block in your answer, and never describe what you "would" do instead of doing it.
- When the task is done, reply with a short summary of what you changed. Do not paste whole files into the chat.`

/** Some Qwen templates emit <tool_call>{...}</tool_call> as plain text instead of structured tool_calls. */
export function extractTextToolCalls(content: string): { content: string; calls: { name: string; args: any }[] } {
  const calls: { name: string; args: any }[] = []
  // Smaller models (e.g. qwen2.5-coder:7b) reply with the bare JSON, optionally in a code fence, and no tags.
  const bare = content
    .trim()
    .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1')
    .trim()
  if (/^[\[{]/.test(bare) && !content.includes('<tool_call>')) {
    try {
      const j = JSON.parse(bare)
      const list = Array.isArray(j) ? j : [j]
      if (list.length && list.every((c) => c && validCall(c.name))) {
        return {
          content: '',
          calls: list.map((c) => ({ name: c.name, args: parseArgs(c.arguments ?? c.parameters ?? {}) })),
        }
      }
    } catch {
      /* ordinary text/JSON answer */
    }
  }
  // Weak models also narrate: prose with the call in a ```json fence or on its own line. Run the first one;
  // later steps depend on its result anyway, and the user still approves risky ones.
  if (!content.includes('<tool_call>')) {
    const asCall = (t: string) => {
      try {
        const j = JSON.parse(t.trim())
        return j && !Array.isArray(j) && validCall(j.name)
          ? { name: j.name as string, args: parseArgs(j.arguments ?? j.parameters ?? {}) }
          : null
      } catch {
        return null
      }
    }
    for (const m of content.matchAll(/```(?:json|tool_call)?\s*([\s\S]*?)```|^\s*(\{\s*"name"[^\n]*\})\s*$/gm)) {
      const c = asCall(m[1] ?? m[2] ?? '')
      if (c) return { content: (content.slice(0, m.index) + content.slice(m.index! + m[0].length)).trim(), calls: [c] }
    }
  }
  const rest = content.replace(/<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/g, (_, body: string) => {
    try {
      const j = JSON.parse(body)
      if (j && typeof j.name === 'string') {
        calls.push({ name: j.name, args: parseArgs(j.arguments ?? j.parameters ?? {}) })
        return ''
      }
    } catch {
      /* malformed: leave visible so the user can see it */
    }
    return _
  })
  return { content: rest.trim(), calls }
}

/** Models that dump files as "Update `src/App.jsx`" + a code block instead of calling write_file. */
export function extractCodeFileWrites(content: string): { content: string; calls: { name: string; args: any }[] } {
  const calls: { name: string; args: any }[] = []
  const pathRe = /(?:^|[\s`'"(*])((?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)*\.[A-Za-z][A-Za-z0-9]{0,5})(?=[\s`'")*:]|$)/g
  const rest = content.replace(
    /(^|\n)([^\n]*)\n+```([\w+-]*)[ \t]*\n([\s\S]*?)\n```/g,
    (whole, lead: string, before: string, lang: string, code: string) => {
      if (calls.length >= 6 || /^(bash|sh|shell|zsh|console|text|diff|sql)$/i.test(lang)) return whole
      let path: string | undefined
      for (const m of before.matchAll(pathRe)) path = m[1]
      if (!path) {
        const first = code.split('\n', 1)[0].match(/^(?:\/\/|#|<!--|\/\*)\s*([\w./-]+\.[A-Za-z0-9]{1,6})/)
        path = first?.[1]
      }
      if (!path || /^https?:/.test(path) || path.includes('..') || path.startsWith('/')) return whole
      calls.push({ name: 'write_file', args: { path: path.replace(/^\.\//, ''), content: code + '\n' } })
      return lead + before
    },
  )
  return calls.length ? { content: rest.trim(), calls } : { content, calls: [] }
}

export function parseArgs(a: unknown): Record<string, any> {
  if (typeof a === 'string') {
    try {
      return JSON.parse(a)
    } catch {
      return {}
    }
  }
  return a && typeof a === 'object' ? (a as Record<string, any>) : {}
}

export function validCall(name: string): boolean {
  return NAMES.has(name)
}

export async function checkWorkspace(workspace: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  const r = await fetch('/api/agent/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent': '1' },
    body: JSON.stringify({ workspace }),
  })
  return r.json()
}

export async function runTool(
  workspace: string,
  tc: Pick<ToolCall, 'name' | 'args'>,
  signal: AbortSignal,
): Promise<{ ok: boolean; output: string }> {
  const r = await fetch('/api/agent/tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent': '1' },
    body: JSON.stringify({ workspace, name: tc.name, args: tc.args }),
    signal,
  })
  const d = await r.json()
  if (!r.ok) return { ok: false, output: d.error ?? `HTTP ${r.status}` }
  return d
}

/** Expand an assistant message that used tools into the assistant + tool messages Ollama expects. */
export function toolMessages(m: Message): any[] {
  const calls = m.toolCalls ?? []
  const out: any[] = [
    {
      role: 'assistant',
      content: m.content,
      ...(calls.length ? { tool_calls: calls.map((c) => ({ function: { name: c.name, arguments: c.args } })) } : {}),
    },
  ]
  for (const c of calls) {
    out.push({
      role: 'tool',
      tool_name: c.name,
      content: c.status === 'denied' ? 'The user denied this action.' : (c.result ?? 'No result (cancelled).'),
    })
  }
  return out
}

/** Rough token estimate (code-heavy text is ~3.5 chars/token). */
export const estTokens = (msgs: any[]) => Math.ceil(JSON.stringify(msgs).length / 3.5)

const clipText = (t: string, n: number) => (t.length > n ? t.slice(0, n) + `\n… [${t.length - n} more chars cut]` : t)

/**
 * Shrink the request history: keep the last `keep` tool results in full and replace older ones (and the file
 * bodies in old write/edit calls) with one-line stubs. Called only when the prompt is getting big, because
 * changing old messages invalidates Ollama's prompt cache from that point on.
 */
export function compactMessages(msgs: any[], keep = 2): any[] {
  const toolIdx = msgs.flatMap((m, i) => (m.role === 'tool' ? [i] : []))
  const fresh = new Set(toolIdx.slice(-keep))
  const firstFresh = Math.min(...fresh, Infinity)
  return msgs.map((m, i) => {
    if (m.role === 'tool') {
      const c = String(m.content ?? '')
      if (fresh.has(i)) return c.length > 6000 ? { ...m, content: clipText(c, 6000) } : m
      if (c.length <= 300) return m
      return {
        ...m,
        content: `[${m.tool_name} output omitted (${c.length} chars). Call the tool again if you still need it.]`,
      }
    }
    // An assistant turn is stale when every one of its tool results comes before the first fresh result.
    if (m.role === 'assistant' && m.tool_calls?.length && i + m.tool_calls.length < firstFresh) {
      return {
        ...m,
        tool_calls: m.tool_calls.map((tc: any) => {
          const a = { ...(tc.function?.arguments ?? {}) }
          for (const k of ['content', 'old_string', 'new_string']) {
            if (typeof a[k] === 'string' && a[k].length > 300) a[k] = `[${a[k].length} chars omitted]`
          }
          return { ...tc, function: { ...tc.function, arguments: a } }
        }),
      }
    }
    return m
  })
}
