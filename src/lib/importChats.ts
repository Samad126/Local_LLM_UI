import type { Chat } from '@/types'

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

/** A chat is usable when it has a message list and a settings object; anything else would crash the UI later. */
export function isChat(x: unknown): x is Chat {
  return isObj(x) && Array.isArray(x.messages) && isObj(x.settings) && typeof x.title === 'string'
}

/** Accepts a bare chat array, a single chat, or an "export everything" backup. Throws on an unusable file. */
export function parseChatImport(json: string): Chat[] {
  const d: unknown = JSON.parse(json)
  const list = Array.isArray(d) ? d : isObj(d) && Array.isArray(d.chats) ? d.chats : isChat(d) ? [d] : []
  const chats = list.filter(isChat)
  if (!chats.length) throw new Error('No chats found in this file')
  return chats
}
