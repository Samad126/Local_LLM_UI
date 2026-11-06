import { thinkValue } from './buildRequest'
import { hasCap, ollama } from '@/services/ollama'
import type { ModelMeta } from '@/types'

interface QuickChatOpts {
  model: string
  keepAlive?: string
  meta?: ModelMeta
  prompt: string
  numPredict: number
  numCtx: number
  temperature: number
}

/** One-shot, non-streaming completion for housekeeping tasks (summaries, titles, search queries). */
export async function quickChat(o: QuickChatOpts): Promise<string> {
  const r = await ollama.chatOnce({
    model: o.model,
    messages: [{ role: 'user', content: o.prompt }],
    options: { num_predict: o.numPredict, temperature: o.temperature, num_ctx: o.numCtx },
    ...(hasCap(o.meta, 'thinking') ? { think: thinkValue(o.model, 'off') } : {}),
    keep_alive: o.keepAlive || undefined,
  })
  return String(r.message?.content ?? '').trim()
}
