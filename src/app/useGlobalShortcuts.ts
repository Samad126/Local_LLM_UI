import { useEffect } from 'react'
import { useStore } from '@/stores/chatStore'
import { usePreview } from '@/stores/previewStore'
import { useApp } from '@/stores/settingsStore'

/** Ctrl/Cmd+K new chat · Ctrl/Cmd+, settings drawer · Ctrl/Cmd+B sidebar · Esc closes full-screen preview / drawer. */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const chat = useStore.getState()
      if (mod && key === 'k') {
        e.preventDefault()
        chat.newChat()
      } else if (mod && e.key === ',') {
        e.preventDefault()
        chat.toggleDrawer()
      } else if (mod && key === 'b') {
        e.preventDefault()
        const app = useApp.getState()
        app.set({ sidebarCollapsed: !app.sidebarCollapsed })
      } else if (e.key === 'Escape') {
        const preview = usePreview.getState()
        if (preview.full) preview.setFull(false)
        else chat.toggleDrawer(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
