import type { Chat } from '@/types'
import { db } from './db'

const SAVE_DELAY_MS = 400
const timers = new Map<string, number>()

/**
 * Save a chat to IndexedDB, debounced per chat (or immediately with `now`).
 * A chat with no messages is only a draft: it is not saved (or listed) until the first message is sent.
 */
export function saveChat(c: Chat | undefined, now = false) {
  if (!c) return
  cancelSave(c.id)
  const run = () => (c.messages.length ? db.chats.put(structuredClone(c)) : db.chats.delete(c.id))
  if (now) void run()
  else timers.set(c.id, window.setTimeout(run, SAVE_DELAY_MS))
}

/** Drop a pending debounced save (call before deleting, so the chat can't be written back). */
export function cancelSave(id: string) {
  clearTimeout(timers.get(id))
  timers.delete(id)
}

export function cancelAllSaves() {
  timers.forEach((t) => clearTimeout(t))
  timers.clear()
}
