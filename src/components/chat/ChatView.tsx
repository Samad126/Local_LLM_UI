import { useActive, useStore } from '@/stores/chatStore'
import { ChatHeader } from '@/components/chat/ChatHeader'
import { MessageList } from '@/components/chat/MessageList'
import { Composer } from '@/components/chat/composer/Composer'
import { SettingsPanel } from '@/components/pages/SettingsPanel'
import { PreviewPane } from '@/components/preview/PreviewPane'

export function ChatView() {
  const chat = useActive()
  const drawer = useStore((s) => s.drawer)
  if (!chat) return null
  return (
    <div className="chatview">
      <div className="chatmain">
        <ChatHeader chat={chat} />
        <MessageList chat={chat} />
        <Composer />
      </div>
      <PreviewPane />
      {drawer && <SettingsPanel />}
    </div>
  )
}
