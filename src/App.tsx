import { useEffect } from 'react'
import { useApp } from '@/stores/settingsStore'
import { useStore } from '@/stores/chatStore'
import { usePreview } from '@/stores/previewStore'
import { SelectionReply } from '@/components/overlays/SelectionReply'
import { Lightbox } from '@/components/overlays/Lightbox'
import { DropOverlay } from '@/components/overlays/DropOverlay'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ChatView } from '@/components/chat/ChatView'
import { ModelManager } from '@/components/pages/ModelManager'
import { Library } from '@/components/pages/Library'
import { AppSettings } from '@/components/pages/AppSettings'

export function App() {
  const theme = useApp((s) => s.theme)
  const fontSize = useApp((s) => s.fontSize)
  const view = useStore((s) => s.view)
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const newChat = useStore((s) => s.newChat)
  const toggleDrawer = useStore((s) => s.toggleDrawer)

  const activeId = useStore((s) => s.activeId)
  useEffect(() => {
    init()
  }, [init])
  // Previews belong to a chat: close them when switching, opening, creating or deleting chats.
  useEffect(() => {
    usePreview.getState().close()
  }, [activeId, view])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.style.fontSize = fontSize + 'px'
  }, [fontSize])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        newChat()
      }
      if (mod && e.key === ',') {
        e.preventDefault()
        toggleDrawer()
      }
      if (e.key === 'Escape') {
        if (usePreview.getState().full) usePreview.getState().setFull(false)
        else toggleDrawer(false)
      }
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        const a = useApp.getState()
        a.set({ sidebarCollapsed: !a.sidebarCollapsed })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newChat, toggleDrawer])

  if (!ready) return <div className="boot">Loading…</div>
  return (
    <div className="app">
      <DropOverlay />
      <Lightbox />
      <SelectionReply />
      <Sidebar />
      <main className="main">
        {view === 'chat' && <ChatView />}
        {view === 'models' && <ModelManager />}
        {view === 'library' && <Library />}
        {view === 'app' && <AppSettings />}
      </main>
    </div>
  )
}
