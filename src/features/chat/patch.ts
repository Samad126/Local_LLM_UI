import type { Message, ToolCall } from '@/types'
import type { ChatHost } from './host'

/** Helpers to update one message, or one tool call inside a message, of a chat. */
export function patchers(host: ChatHost, chatId: string) {
  const patchMsg = (id: string, fn: (m: Message) => Partial<Message>, persist = true) =>
    host.patchChat(
      chatId,
      (c) => ({ messages: c.messages.map((m) => (m.id === id ? { ...m, ...fn(m) } : m)) }),
      persist,
    )
  const patchCall = (msgId: string, callId: string, p: Partial<ToolCall>) =>
    patchMsg(msgId, (m) => ({ toolCalls: m.toolCalls?.map((t) => (t.id === callId ? { ...t, ...p } : t)) }))
  return { patchMsg, patchCall }
}
