import type { ChatHost } from './host'
import { titlePrompt } from './prompts'
import { quickChat } from './quickChat'

/** Give a new chat a title: provisional (first words) at once, then refined by the model. */
export async function autoTitle(host: ChatHost, chatId: string) {
  const c = host.chat(chatId)
  const first = c?.messages.find((m) => m.role === 'user')?.content.slice(0, 500)
  if (!c || !first) return
  host.patchChat(chatId, () => ({ title: first.slice(0, 40) }))
  try {
    const raw = await quickChat({
      model: c.settings.model,
      keepAlive: c.settings.keepAlive,
      meta: host.meta(c.settings.model),
      prompt: titlePrompt(first),
      numPredict: 24,
      numCtx: 2048,
      temperature: 0.3,
    })
    const title = raw.replace(/["\n]/g, ' ').trim().slice(0, 60)
    if (title) host.patchChat(chatId, () => ({ title }))
  } catch {
    /* keep the provisional title */
  }
}
