import { create } from 'zustand'
import { useApp } from '@/stores/settingsStore'
import { db } from '@/services/db'
import { lmstudio } from '@/services/lmstudio'
import { ollama } from '@/services/ollama'
import { cancelAllSaves, cancelSave, saveChat } from '@/services/persistence'
import { uid } from '@/lib/id'
import { answerApproval, resetAllowed, type Answer } from '@/features/agent/approvals'
import { generate } from '@/features/chat/generate'
import { summarize } from '@/features/chat/summarize'
import type { ChatHost, WebMode } from '@/features/chat/host'
import type {
  Attachment,
  Chat,
  ChatSettings,
  Message,
  ModelMeta,
  Preset,
  Prompt,
  RunningModel,
  TagModel,
} from '@/types'

export type View = 'chat' | 'models' | 'library' | 'app'

interface State {
  ready: boolean
  online: boolean | null
  version: string
  view: View
  drawer: boolean
  chats: Chat[]
  presets: Preset[]
  prompts: Prompt[]
  activeId: string | null
  models: TagModel[]
  meta: Record<string, ModelMeta>
  running: RunningModel[]
  streamingId: string | null
  abort: AbortController | null
  draft: string
  webMode: WebMode
  status: string
  setWebMode: (v: WebMode) => void
  compact: () => Promise<void>
  init: () => Promise<void>
  refreshModels: () => Promise<void>
  refreshRunning: () => Promise<void>
  setView: (v: View) => void
  toggleDrawer: (v?: boolean) => void
  setDraft: (s: string) => void
  newChat: () => string
  openChat: (id: string) => void
  patchChat: (id: string, fn: (c: Chat) => Partial<Chat>, persist?: boolean) => void
  updateSettings: (patch: Partial<ChatSettings>) => void
  deleteChat: (id: string) => void
  send: (text: string, images: string[], files?: Attachment[]) => Promise<void>
  regenerate: (messageId?: string) => Promise<void>
  editAndResend: (messageId: string, text: string) => Promise<void>
  deleteMessage: (messageId: string) => void
  stop: () => void
  setAgent: (patch: Partial<NonNullable<Chat['agent']>>) => void
  approve: (callId: string, answer: Answer) => void
  savePreset: (name: string) => void
  deletePreset: (id: string) => void
  savePrompt: (p: Prompt) => void
  deletePrompt: (id: string) => void
  importChats: (chats: Chat[]) => void
  wipe: () => Promise<void>
}

export const useStore = create<State>((set, get) => {
  const active = () => get().chats.find((c) => c.id === get().activeId)

  /** What features/chat needs from this store (see ChatHost). */
  const host: ChatHost = {
    chat: (id) => get().chats.find((c) => c.id === id),
    patchChat: (id, fn, persist) => get().patchChat(id, fn, persist),
    persist: (id, now) =>
      saveChat(
        get().chats.find((c) => c.id === id),
        now,
      ),
    meta: (model) => get().meta[model],
    prompts: () => get().prompts,
    webMode: () => get().webMode,
    searchRewrite: () => useApp.getState().searchRewrite,
    isStreaming: () => !!get().streamingId,
    setRun: (streamingId, abort) => set({ streamingId, abort }),
    setStatus: (status) => set({ status }),
    refreshRunning: () => void get().refreshRunning(),
  }

  return {
    ready: false,
    online: null,
    version: '',
    view: 'chat',
    drawer: false,
    chats: [],
    presets: [],
    prompts: [],
    activeId: null,
    models: [],
    meta: {},
    running: [],
    streamingId: null,
    abort: null,
    draft: '',
    webMode: 'auto',
    status: '',
    setWebMode: (webMode) => set({ webMode }),

    init: async () => {
      const [chats, presets, prompts] = await Promise.all([
        db.chats.toArray(),
        db.presets.toArray(),
        db.prompts.toArray(),
      ])
      chats.sort((a, b) => b.updatedAt - a.updatedAt)
      const used = chats.filter((c) => c.messages.length)
      chats.filter((c) => !c.messages.length).forEach((c) => db.chats.delete(c.id))
      set({ chats: used, presets, prompts, ready: true, activeId: used[0]?.id ?? null })
      await get().refreshModels()
      if (!get().activeId) get().newChat()
    },

    refreshModels: async () => {
      try {
        const [v, tags, lm] = await Promise.all([ollama.version(), ollama.tags(), lmstudio.models()])
        const models = [...tags, ...lm]
        set({ online: true, version: v.version, models })
        const metas = await Promise.all(
          models.map((m) =>
            ollama
              .show(m.name)
              .then((x) => [m.name, x] as const)
              .catch(() => null),
          ),
        )
        const meta: Record<string, ModelMeta> = {}
        for (const e of metas) if (e) meta[e[0]] = e[1]
        set({ meta })
        const app = useApp.getState()
        if (!app.defaults.model || !models.find((m) => m.name === app.defaults.model)) {
          app.set({ defaults: { ...app.defaults, model: models[0]?.name ?? '' } })
        }
        // Chats pointing at a model that no longer exists are left to the user; the UI shows a warning.
        void get().refreshRunning()
      } catch {
        set({ online: false })
      }
    },

    refreshRunning: async () => {
      try {
        set({ running: await ollama.ps() })
      } catch {
        /* offline */
      }
    },

    setView: (view) => set({ view }),
    toggleDrawer: (v) => set((s) => ({ drawer: v ?? !s.drawer })),
    setDraft: (draft) => set({ draft }),

    newChat: () => {
      const existing = active()
      if (existing && existing.messages.length === 0) {
        set({ view: 'chat' })
        return existing.id
      }
      const d = useApp.getState().defaults
      const chat: Chat = {
        id: uid(),
        title: 'New chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        settings: structuredClone({ ...d, model: d.model || get().models[0]?.name || '' }),
        messages: [],
      }
      set((s) => ({ chats: [chat, ...s.chats.filter((c) => c.messages.length)], activeId: chat.id, view: 'chat' }))
      return chat.id
    },

    openChat: (id) =>
      set((s) => ({ activeId: id, view: 'chat', chats: s.chats.filter((c) => c.id === id || c.messages.length) })),

    patchChat: (id, fn, persist = true) => {
      set((s) => ({
        chats: s.chats.map((c) =>
          c.id === id ? { ...c, ...fn(c), ...(persist ? { updatedAt: Date.now() } : {}) } : c,
        ),
      }))
      if (persist) saveChat(get().chats.find((c) => c.id === id))
    },

    updateSettings: (patch) => {
      const c = active()
      if (c) get().patchChat(c.id, (x) => ({ settings: { ...x.settings, ...patch } }))
    },

    deleteChat: (id) => {
      cancelSave(id)
      void db.chats.delete(id)
      set((s) => {
        const chats = s.chats.filter((c) => c.id !== id)
        return { chats, activeId: s.activeId === id ? (chats[0]?.id ?? null) : s.activeId }
      })
      if (!get().activeId) get().newChat()
    },

    send: async (text, images, files) => {
      const c = active()
      if (!c || get().streamingId) return
      const m: Message = {
        id: uid(),
        role: 'user',
        content: text,
        images: images.length ? images : undefined,
        files: files?.length ? files : undefined,
        createdAt: Date.now(),
      }
      get().patchChat(c.id, (x) => ({ messages: [...x.messages, m] }))
      await generate(host, c.id)
    },

    regenerate: async (messageId) => {
      const c = active()
      if (!c || get().streamingId) return
      let msgs = c.messages
      if (messageId) {
        const i = msgs.findIndex((m) => m.id === messageId)
        if (i >= 0) msgs = msgs.slice(0, msgs[i].role === 'assistant' ? i : i + 1)
      } else {
        while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs = msgs.slice(0, -1)
      }
      get().patchChat(c.id, () => ({ messages: msgs }))
      await generate(host, c.id)
    },

    editAndResend: async (messageId, text) => {
      const c = active()
      if (!c || get().streamingId) return
      const i = c.messages.findIndex((m) => m.id === messageId)
      if (i < 0) return
      const msgs = c.messages.slice(0, i + 1).map((m, k) => (k === i ? { ...m, content: text } : m))
      get().patchChat(c.id, () => ({ messages: msgs }))
      await generate(host, c.id)
    },

    deleteMessage: (messageId) => {
      const c = active()
      if (c) get().patchChat(c.id, (x) => ({ messages: x.messages.filter((m) => m.id !== messageId) }))
    },

    stop: () => get().abort?.abort(),

    setAgent: (patch) => {
      const c = active()
      if (!c) return
      if (patch.mode) resetAllowed(c.id)
      get().patchChat(c.id, (x) => ({ agent: { on: false, workspace: '', mode: 'ask', ...x.agent, ...patch } }))
    },

    compact: async () => {
      const c = active()
      if (!c || get().streamingId) return
      set({ streamingId: c.id, abort: new AbortController() })
      const ok = await summarize(host, c.id, false)
      set({ streamingId: null, abort: null, status: ok ? '' : 'Nothing to compact yet.' })
      if (!ok) setTimeout(() => set({ status: '' }), 2500)
    },

    approve: (callId, answer) => {
      if (answerApproval(callId, answer)) return
      // Orphaned prompt (page reloaded mid-run): nothing is waiting on it, so just close the card.
      set((st) => ({
        chats: st.chats.map((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.toolCalls?.some((t) => t.id === callId && t.status === 'pending')
              ? {
                  ...m,
                  toolCalls: m.toolCalls.map((t) =>
                    t.id === callId
                      ? { ...t, status: 'denied' as const, result: 'Run was interrupted; send a message to retry.' }
                      : t,
                  ),
                }
              : m,
          ),
        })),
      }))
    },

    savePreset: (name) => {
      const c = active()
      if (!c) return
      const { model: _model, ...rest } = c.settings
      const p: Preset = { id: uid(), name, settings: structuredClone(rest) }
      void db.presets.put(p)
      set((s) => ({ presets: [...s.presets, p] }))
    },
    deletePreset: (id) => {
      void db.presets.delete(id)
      set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }))
    },
    savePrompt: (p) => {
      void db.prompts.put(p)
      set((s) => ({
        prompts: s.prompts.some((x) => x.id === p.id)
          ? s.prompts.map((x) => (x.id === p.id ? p : x))
          : [...s.prompts, p],
      }))
    },
    deletePrompt: (id) => {
      void db.prompts.delete(id)
      set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) }))
    },

    importChats: (chats) => {
      const fresh = chats.map((c) => ({ ...c, id: uid() }))
      void db.chats.bulkPut(fresh)
      set((s) => ({ chats: [...fresh, ...s.chats] }))
    },

    wipe: async () => {
      cancelAllSaves()
      await Promise.all([db.chats.clear(), db.presets.clear(), db.prompts.clear()])
      set({ chats: [], presets: [], prompts: [], activeId: null })
      get().newChat()
    },
  }
})

export const useActive = () => useStore((s) => s.chats.find((c) => c.id === s.activeId))

/** Select one value from the active chat without re-rendering on unrelated chat changes. */
export function useActiveChat<T>(select: (c: Chat | undefined) => T): T {
  return useStore((s) => select(s.chats.find((c) => c.id === s.activeId)))
}
