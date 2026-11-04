import { create } from 'zustand'
import type { DocKind } from './lib/docs'

export type PreviewItem = { kind: 'html' | 'svg' | 'markdown' | 'file' | 'image' | DocKind; code: string; title: string }

export type SourcesView = { query?: string; sources: { title: string; url: string; snippet?: string }[] }

interface PreviewState {
  item: PreviewItem | null
  sources: SourcesView | null
  showSources: (v: SourcesView) => void
  list: boolean
  full: boolean
  open: (i: PreviewItem) => void
  /** Show the artifacts list in the right sidebar. */
  showList: (on?: boolean) => void
  close: () => void
  setFull: (f: boolean) => void
}

export const usePreview = create<PreviewState>((set) => ({
  item: null, sources: null, list: false, full: false,
  showSources: (sources) => set({ sources, item: null, list: false, full: false }),
  open: (item) => set({ item, list: false, sources: null }),
  showList: (on = true) => set({ list: on, item: null, sources: null, full: false }),
  close: () => set({ item: null, sources: null, list: false, full: false }),
  setFull: (full) => set({ full }),
}))
