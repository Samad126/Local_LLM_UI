import { useMemo, useState } from 'react'
import { useStore, type View } from '../store'
import { Icon } from './Icon'
import { useApp } from '../appStore'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { timeAgo } from '../lib/util'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Confirm } from './Confirm'

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
  const openChat = useStore((s) => s.openChat)
  const deleteChat = useStore((s) => s.deleteChat)
  const patchChat = useStore((s) => s.patchChat)
  const setView = useStore((s) => s.setView)
  const collapsed = useApp((s) => s.sidebarCollapsed)
  const setApp = useApp((s) => s.set)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

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
          <div
            key={c.id}
            className={'chatitem' + (c.id === activeId && view === 'chat' ? ' active' : '')}
            onClick={() => openChat(c.id)}
          >
            {editing === c.id ? (
              <input
                autoFocus
                className="input"
                defaultValue={c.title}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  patchChat(c.id, () => ({ title: e.target.value || c.title }))
                  setEditing(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
                }}
              />
            ) : (
              <>
                <span className="title">
                  {c.pinned && <Icon n="pin" size={12} />} {c.title}
                </span>
                <span className="when">{timeAgo(c.updatedAt)}</span>
                <span className="acts" onClick={(e) => e.stopPropagation()}>
                  <button title="Pin" onClick={() => patchChat(c.id, () => ({ pinned: !c.pinned }))}>
                    <Icon n="pin" size={13} />
                  </button>
                  <button title="Rename" onClick={() => setEditing(c.id)}>
                    <Icon n="edit" size={13} />
                  </button>
                  <Confirm
                    title="Delete this chat?"
                    description="The conversation is removed permanently."
                    action="Delete"
                    onConfirm={() => deleteChat(c.id)}
                  >
                    <button title="Delete">
                      <Icon n="trash" size={13} />
                    </button>
                  </Confirm>
                </span>
              </>
            )}
          </div>
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
