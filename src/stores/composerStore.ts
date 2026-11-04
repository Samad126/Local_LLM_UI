import { create } from 'zustand'

/**
 * Hand-off point for things that arrive from outside the Composer (files dropped on the window,
 * text quoted from a reply). The Composer drains it, so it works even if the Composer mounts afterwards.
 */
interface Inbox {
  files: File[]
  quotes: string[]
  addFiles: (f: File[]) => void
  addQuote: (t: string) => void
  drain: () => { files: File[]; quotes: string[] }
}

export const useComposerInbox = create<Inbox>((set, get) => ({
  files: [],
  quotes: [],
  addFiles: (f) => set((s) => ({ files: [...s.files, ...f] })),
  addQuote: (t) => set((s) => ({ quotes: [...s.quotes, t] })),
  drain: () => {
    const { files, quotes } = get()
    set({ files: [], quotes: [] })
    return { files, quotes }
  },
}))
