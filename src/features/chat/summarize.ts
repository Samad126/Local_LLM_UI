import type { ChatHost } from './host'
import { summaryPrompt } from './prompts'
import { quickChat } from './quickChat'

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n) + '…' : t)

/** Replace the conversation so far with a model-written summary (messages stay visible, but are not sent). */
export async function summarize(host: ChatHost, chatId: string, keepLast: boolean): Promise<boolean> {
  const c = host.chat(chatId)
  if (!c) return false
  const from = c.summaryCount ?? 0
  const lastUser = c.messages.map((m) => m.role).lastIndexOf('user')
  const to = keepLast && lastUser > from ? lastUser : c.messages.length
  if (to - from < 2) return false
  const lines: string[] = []
  for (const m of c.messages.slice(from, to)) {
    if (m.role === 'user') lines.push('User: ' + clip(m.content, 1500))
    else if (m.role === 'assistant') {
      if (m.content.trim()) lines.push('Assistant: ' + clip(m.content, 1200))
      for (const t of m.toolCalls ?? []) {
        const target = clip(String(t.args.path ?? t.args.command ?? t.args.pattern ?? ''), 80)
        const result = t.result ? ': ' + clip(t.result.replace(/\s+/g, ' '), 160) : ''
        lines.push(`[tool ${t.name} ${target} -> ${t.status}${result}]`)
      }
    }
  }
  const transcript = (c.summary ? 'Earlier summary:\n' + c.summary + '\n\nThen:\n' : '') + lines.join('\n')
  host.setStatus('Compacting conversation…')
  try {
    const text = await quickChat({
      model: c.settings.model,
      keepAlive: c.settings.keepAlive,
      meta: host.meta(c.settings.model),
      prompt: summaryPrompt(transcript.slice(-14000)),
      numPredict: 700,
      numCtx: 8192,
      temperature: 0.2,
    })
    if (!text) return false
    host.patchChat(chatId, () => ({ summary: text, summaryCount: to }))
    host.persist(chatId, true)
    return true
  } catch {
    return false
  } finally {
    host.setStatus('')
  }
}
