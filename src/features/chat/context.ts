import { AGENT_MIN_CTX, DEFAULT_CTX } from '@shared/constants'
import type { Chat, ModelMeta } from '@/types'
import type { OllamaMessage } from '@/types/ollama'

/** Context window the chat will actually run with (agent runs need extra room for tools and file contents). */
export const ctxOf = (c: Chat) => Math.max(c.settings.options.num_ctx ?? DEFAULT_CTX, c.agent?.on ? AGENT_MIN_CTX : 0)

/** Context window to show in the UI: the chat's setting, else the model's default, else unknown (0). */
export const displayCtx = (c: Chat, meta?: ModelMeta) =>
  Math.max(c.settings.options.num_ctx ?? (Number(meta?.defaults.num_ctx) || 0), c.agent?.on ? AGENT_MIN_CTX : 0)

/** Rough token estimate (code-heavy text is ~3.5 chars/token). */
export const estTokens = (msgs: OllamaMessage[]) => Math.ceil(JSON.stringify(msgs).length / 3.5)

/** True when the stored conversation alone is close to filling the context window. */
export function needsCompaction(chat: Chat): boolean {
  const live = chat.messages.slice(chat.summaryCount ?? 0)
  const chars =
    (chat.summary?.length ?? 0) +
    live.reduce(
      (n, m) =>
        n +
        m.content.length +
        (m.toolCalls ?? []).reduce((k, t) => k + JSON.stringify(t.args).length + (t.result?.length ?? 0), 0),
      0,
    )
  return live.length > 6 && chars / 3.5 > ctxOf(chat) * 0.8
}
