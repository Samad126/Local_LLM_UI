import { create } from 'zustand'

export type LightboxItem = { kind: 'text' | 'quote' | 'image'; title: string; body: string }

export const useLightbox = create<{ item: LightboxItem | null; open: (i: LightboxItem) => void; close: () => void }>((set) => ({
  item: null,
  open: (item) => set({ item }),
  close: () => set({ item: null }),
}))
