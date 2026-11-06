import type { ChatChunk, ChatRequest, OllamaMessage } from '@/types/ollama'
import type { TagModel } from '@/types'

/** LM Studio exposes an OpenAI-compatible API; its models are namespaced with this prefix in the model list. */
export const LMSTUDIO_PREFIX = 'lmstudio:'
const BASE = '/lmstudio/v1'

export const isLmStudio = (model: string) => model.startsWith(LMSTUDIO_PREFIX)
export const lmId = (model: string) => model.slice(LMSTUDIO_PREFIX.length)

export function toOpenAiMessages(msgs: OllamaMessage[]) {
  return msgs.map((m, i) => {
    if (m.role === 'assistant' && m.tool_calls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc, j) => ({
          id: `call_${i}_${j}`,
          type: 'function',
          function: { name: tc.function.name, arguments: JSON.stringify(tc.function.arguments) },
        })),
      }
    }
    if (m.role === 'tool') {
      // Match the id of the nearest preceding assistant tool call with this name.
      let id = `call_${i}`
      for (let k = i - 1; k >= 0; k--) {
        const calls = msgs[k].tool_calls
        const j = calls?.findIndex((c) => c.function.name === m.tool_name) ?? -1
        if (j >= 0) {
          id = `call_${k}_${j}`
          break
        }
      }
      return { role: 'tool', tool_call_id: id, content: m.content }
    }
    if (m.images?.length) {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content },
          ...m.images.map((b) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${b}` } })),
        ],
      }
    }
    return { role: m.role, content: m.content }
  })
}

export function toOpenAiBody(req: ChatRequest, stream: boolean) {
  const o = req.options ?? {}
  return {
    model: lmId(req.model),
    messages: toOpenAiMessages(req.messages),
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    ...(req.tools?.length ? { tools: req.tools } : {}),
    ...(o.temperature != null ? { temperature: o.temperature } : {}),
    ...(o.top_p != null ? { top_p: o.top_p } : {}),
    ...(o.num_predict != null && o.num_predict > 0 ? { max_tokens: o.num_predict } : {}),
    ...(o.seed != null ? { seed: o.seed } : {}),
    ...(req.format === 'json' ? { response_format: { type: 'json_object' } } : {}),
  }
}

async function post(body: unknown, signal?: AbortSignal) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `HTTP ${res.status}`)
  return res
}

export const lmstudio = {
  /** Loads a model via LM Studio's REST API. Sends no load options, so it's up to LM Studio which settings apply. */
  load: async (model: string) => {
    const res = await fetch('/lmstudio/api/v1/models/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: lmId(model) }),
    })
    if (!res.ok) throw new Error((await res.text().catch(() => '')) || `HTTP ${res.status}`)
  },

  /** Resolves to [] when LM Studio isn't running. */
  models: async (): Promise<TagModel[]> => {
    try {
      const res = await fetch(`${BASE}/models`, { signal: AbortSignal.timeout(2500) })
      if (!res.ok) return []
      const d = (await res.json()) as { data?: { id: string }[] }
      return (d.data ?? [])
        .filter((m) => !/embed/i.test(m.id))
        .map((m) => ({ name: LMSTUDIO_PREFIX + m.id, size: 0, modified_at: '', details: {} }))
    } catch {
      return []
    }
  },

  async *chat(req: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatChunk> {
    const res = await post(toOpenAiBody(req, true), signal)
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    const t0 = performance.now()
    const acc = new Map<number, { name: string; args: string }>()
    let buf = ''
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        const obj = JSON.parse(data)
        if (obj.error) throw new Error(obj.error.message ?? String(obj.error))
        if (obj.usage) usage = obj.usage
        const delta = obj.choices?.[0]?.delta
        if (!delta) continue
        for (const tc of delta.tool_calls ?? []) {
          const cur = acc.get(tc.index ?? 0) ?? { name: '', args: '' }
          if (tc.function?.name) cur.name = tc.function.name
          if (tc.function?.arguments) cur.args += tc.function.arguments
          acc.set(tc.index ?? 0, cur)
        }
        const thinking = delta.reasoning_content ?? delta.reasoning
        if (delta.content || thinking) yield { message: { content: delta.content ?? '', thinking } }
      }
    }
    const ns = (performance.now() - t0) * 1e6
    yield {
      message: {
        tool_calls: [...acc.values()].map((c) => ({ function: { name: c.name, arguments: c.args } })),
      },
      done: true,
      eval_count: usage?.completion_tokens,
      eval_duration: ns,
      prompt_eval_count: usage?.prompt_tokens,
      total_duration: ns,
    }
  },

  async chatOnce(req: ChatRequest): Promise<ChatChunk> {
    const res = await post(toOpenAiBody(req, false))
    const d = await res.json()
    return { message: { content: d.choices?.[0]?.message?.content ?? '' }, done: true }
  },
}
