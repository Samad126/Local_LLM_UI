import { useMemo, useState } from 'react'
import { useStore, type View } from '@/stores/chatStore'
import { Icon } from '@/components/common/Icon'
import { useApp } from '@/stores/settingsStore'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChatListItem } from '@/components/sidebar/ChatListItem'

const NAV: { v: View; icon: string; label: string }[] = [
  { v: 'chat', icon: 'chat', label: 'Chat' },
  { v: 'models', icon: 'cpu', label: 'Models' },
  { v: 'library', icon: 'book', label: 'Library' },
  { v: 'app', icon: 'gear', label: 'App' },
]

export function Sidebar() {
  const chats = useStore((s) => s.chats)
  const activeId = useStore((s) => s.activeId)
  const view = useStore((s) => s.view)
  const online = useStore((s) => s.online)
  const version = useStore((s) => s.version)
  const running = useStore((s) => s.running)
  const newChat = useStore((s) => s.newChat)
  const setView = useStore((s) => s.setView)
  const collapsed = useApp((s) => s.sidebarCollapsed)
  const setApp = useApp((s) => s.set)
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const t = q.toLowerCase()
    return chats
      .filter((c) => c.messages.length > 0)
      .filter(
        (c) => !t || c.title.toLowerCase().includes(t) || c.messages.some((m) => m.content.toLowerCase().includes(t)),
      )
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)
  }, [chats, q])

  if (collapsed) {
    return (
      <aside className="sidebar rail">
        <Button variant="ghost" size="icon" title="Expand sidebar" onClick={() => setApp({ sidebarCollapsed: false })}>
          <PanelLeftOpen size={18} />
        </Button>
        <Button size="icon" title="New chat (Ctrl+K)" onClick={() => newChat()}>
          <Icon n="plus" />
        </Button>
        <div className="spacer" />
        {NAV.map((n) => (
          <Button
            key={n.v}
            variant={view === n.v ? 'secondary' : 'ghost'}
            size="icon"
            title={n.label}
            onClick={() => setView(n.v)}
          >
            <Icon n={n.icon} />
          </Button>
        ))}
        <span
          className={'dot ' + (online ? 'ok' : online === false ? 'bad' : '')}
          style={{ margin: '8px auto 0' }}
          title={online ? `Ollama ${version}` : 'Ollama offline'}
        />
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <div className="row">
        <Button variant="default" size="sm" className="min-w-0 flex-1" onClick={() => newChat()}>
          <Icon n="plus" /> New chat <kbd>Ctrl K</kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          title="Collapse sidebar"
          onClick={() => setApp({ sidebarCollapsed: true })}
        >
          <PanelLeftClose size={18} />
        </Button>
      </div>
      <Input placeholder="Search chats…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chatlist">
        {list.map((c) => (
          <ChatListItem key={c.id} chat={c} active={c.id === activeId && view === 'chat'} />
        ))}
        {!list.length && <div className="muted pad">No chats</div>}
      </div>
      <nav className="nav">
        {NAV.map((n) => (
          <button key={n.v} className={view === n.v ? 'active' : ''} onClick={() => setView(n.v)} title={n.label}>
            <Icon n={n.icon} /> <span>{n.label}</span>
          </button>
        ))}
      </nav>
      <div className="status">
        <span className={'dot ' + (online ? 'ok' : online === false ? 'bad' : '')} />
        {online ? `Ollama ${version}` : online === false ? 'Ollama offline' : 'Connecting…'}
        {running.length > 0 && <span className="muted"> · {running.map((r) => r.name).join(', ')} loaded</span>}
      </div>
    </aside>
  )
}
