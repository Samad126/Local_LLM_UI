import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatSettings } from './types'

export const BASE_SETTINGS: ChatSettings = {
  model: '',
  system: '',
  options: { num_ctx: 8192 },
  stop: [],
  think: 'default',
  keepAlive: '30m',
  format: '',
}

interface AppState {
  host: string
  theme: 'dark' | 'light' | 'system'
  fontSize: number
  sendOnEnter: boolean
  showStats: boolean
  searchEngine: 'ddg' | 'searxng'
  searxUrl: string
  searchResults: number
  searchFetchPages: boolean
  searchPageChars: number
  searchRewrite: boolean
  sidebarCollapsed: boolean
  defaults: ChatSettings
  set: (p: Partial<Omit<AppState, 'set'>>) => void
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      host: '/ollama',
      theme: 'dark',
      fontSize: 15,
      sendOnEnter: true,
      showStats: true,
      searchEngine: 'ddg',
      searxUrl: 'http://localhost:8080',
      searchResults: 5,
      searchFetchPages: true,
      searchPageChars: 3000,
      searchRewrite: true,
      sidebarCollapsed: false,
      defaults: BASE_SETTINGS,
      set: (p) => set(p),
    }),
    { name: 'local-llm-ui-app' },
  ),
)
