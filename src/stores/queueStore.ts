import { create } from 'zustand'
import { uid } from '@/lib/id'
import type { Attachment } from '@/types'

/** A message typed while the model was busy; it is sent automatically once the run finishes. */
export interface QueuedMessage {
  id: string
  chatId: string
  text: string
  images: string[]
  files: Attachment[]
}

interface QueueState {
  items: QueuedMessage[]
  add: (m: Omit<QueuedMessage, 'id'>) => void
  remove: (id: string) => void
  /** Take the oldest queued message of a chat (FIFO), or undefined. */
  shift: (chatId: string) => QueuedMessage | undefined
  clearChat: (chatId: string) => void
}

export const useQueue = create<QueueState>((set, get) => ({
  items: [],
  add: (m) => set((s) => ({ items: [...s.items, { ...m, id: uid() }] })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  shift: (chatId) => {
    const first = get().items.find((i) => i.chatId === chatId)
    if (first) set((s) => ({ items: s.items.filter((i) => i.id !== first.id) }))
    return first
  },
  clearChat: (chatId) => set((s) => ({ items: s.items.filter((i) => i.chatId !== chatId) })),
}))
