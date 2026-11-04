import type { Message } from '@/types'
import type { OllamaMessage } from '@/types/ollama'

/** Expand an assistant message that used tools into the assistant + tool messages Ollama expects. */
export function toolMessages(m: Message): OllamaMessage[] {
  const calls = m.toolCalls ?? []
  const out: OllamaMessage[] = [
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
export const estTokens = (msgs: OllamaMessage[]) => Math.ceil(JSON.stringify(msgs).length / 3.5)

const clipText = (t: string, n: number) => (t.length > n ? t.slice(0, n) + `\n… [${t.length - n} more chars cut]` : t)

/**
 * Shrink the request history: keep the last `keep` tool results in full and replace older ones (and the file
 * bodies in old write/edit calls) with one-line stubs. Called only when the prompt is getting big, because
 * changing old messages invalidates Ollama's prompt cache from that point on.
 */
export function compactMessages(msgs: OllamaMessage[], keep = 2): OllamaMessage[] {
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
