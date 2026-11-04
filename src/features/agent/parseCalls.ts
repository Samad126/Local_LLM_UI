import { validCall } from './tools'
import type { ToolArgs } from './tools'

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
