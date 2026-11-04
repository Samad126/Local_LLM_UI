import { useEffect } from 'react'
import { useGlobalShortcuts } from '@/app/useGlobalShortcuts'
import { useTheme } from '@/app/useTheme'
import { useStore } from '@/stores/chatStore'
import { usePreview } from '@/stores/previewStore'
import { DropOverlay } from '@/components/overlays/DropOverlay'
import { Lightbox } from '@/components/overlays/Lightbox'
import { SelectionReply } from '@/components/overlays/SelectionReply'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ChatView } from '@/components/chat/ChatView'
import { ModelManager } from '@/components/pages/ModelManager'
import { Library } from '@/components/pages/Library'
import { AppSettings } from '@/components/pages/AppSettings'

export function App() {
  const view = useStore((s) => s.view)
  const ready = useStore((s) => s.ready)
  const activeId = useStore((s) => s.activeId)
  const init = useStore((s) => s.init)

  useTheme()
  useGlobalShortcuts()
  useEffect(() => {
    void init()
  }, [init])
  // Previews belong to a chat: close them when switching, opening, creating or deleting chats.
  useEffect(() => {
    usePreview.getState().close()
  }, [activeId, view])

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
