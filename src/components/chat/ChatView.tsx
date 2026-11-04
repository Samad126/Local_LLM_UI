import { Fragment, useEffect, useRef, useState } from 'react'
import { useStore, useActive } from '@/stores/chatStore'
import { hasCap } from '@/services/ollama'
import { Message } from '@/components/chat/Message'
import { Composer } from '@/components/chat/Composer'
import { SettingsPanel } from '@/components/pages/SettingsPanel'
import { ArtifactsMenu } from '@/components/chat/ArtifactsMenu'
import { PreviewPane } from '@/components/preview/PreviewPane'
import { Icon } from '@/components/common/Icon'
import { download } from '@/lib/download'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function ChatView() {
  const chat = useActive()
  const meta = useStore((s) => s.meta)
  const streamingId = useStore((s) => s.streamingId)
  const drawer = useStore((s) => s.drawer)
  const toggleDrawer = useStore((s) => s.toggleDrawer)
  const compact = useStore((s) => s.compact)
  const online = useStore((s) => s.online)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [, force] = useState(0)

  // Follow the stream, but only when content actually changed and coalesced into one frame.
  const tail = chat?.messages[chat.messages.length - 1]
  const tailKey = chat
    ? `${chat.messages.length}:${tail?.content.length}:${tail?.thinking?.length}:${tail?.toolCalls?.length}`
    : ''
  useEffect(() => {
    if (!stick.current) return
    const id = requestAnimationFrame(() => {
      const el = scroller.current
      if (el && stick.current) el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [tailKey])
  useEffect(() => {
    stick.current = true
    force((x) => x + 1)
  }, [chat?.id])

  if (!chat) return null
  const m = meta[chat.settings.model]
  const last = [...chat.messages].reverse().find((x) => x.stats?.promptEvalCount)
  const used = last ? (last.stats!.promptEvalCount ?? 0) + (last.stats!.evalCount ?? 0) : 0
  const ctx = Math.max(chat.settings.options.num_ctx ?? Number(m?.defaults.num_ctx) ?? 0, chat.agent?.on ? 16384 : 0)
  const pct = ctx ? Math.min(100, (used / ctx) * 100) : 0

  const exportMd = () =>
    download(`${chat.title}.md`, chat.messages.map((x) => `## ${x.role}\n\n${x.content}`).join('\n\n'), 'text/markdown')

  const compactNote = (open = false) => (
    <details className="compactnote" open={open}>
      <summary>Earlier messages above were compacted into a summary (the model no longer sees them)</summary>
      <p>{chat.summary}</p>
    </details>
  )

  return (
    <div className="chatview">
      <div className="chatmain">
        <header className="topbar">
          <div className="topbar-title">{chat.title}</div>
          <Badge variant="secondary">{chat.settings.model || 'no model'}</Badge>
          {hasCap(m, 'thinking') && <Badge variant="secondary">thinking</Badge>}
          {hasCap(m, 'vision') && <Badge variant="secondary">vision</Badge>}
          {hasCap(m, 'tools') && <Badge variant="secondary">tools</Badge>}
          <div className="spacer" />
          {used > 0 && (
            <div className="ctxmeter" title={`${used} / ${ctx || '?'} tokens`}>
              <div style={{ width: pct + '%' }} className={pct > 85 ? 'warn' : ''} />
              <span>
                {used}
                {ctx ? ` / ${ctx}` : ''}
              </span>
            </div>
          )}
          <ArtifactsMenu chat={chat} />
          <Button
            variant="ghost"
            size="sm"
            title="Compact conversation: summarize older messages to free context (or type /compact)"
            disabled={!!streamingId || chat.messages.length < 3}
            onClick={() => compact()}
          >
            <Icon n="refresh" /> Compact
          </Button>
          <Button variant="ghost" size="sm" title="Export Markdown" onClick={exportMd}>
            <Icon n="download" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Export JSON"
            onClick={() => download(`${chat.title}.json`, JSON.stringify(chat, null, 2))}
          >
            <Icon n="upload" />
          </Button>
          <Button
            variant={drawer ? 'secondary' : 'ghost'}
            size="sm"
            title="Settings (Ctrl+,)"
            onClick={() => toggleDrawer()}
          >
            <Icon n="sliders" /> Settings
          </Button>
        </header>
        <div
          className="scroller"
          ref={scroller}
          onWheel={(e) => {
            if (e.deltaY < 0) stick.current = false
          }}
          onTouchMove={() => {
            const el = scroller.current
            if (el && el.scrollHeight - el.scrollTop - el.clientHeight > 24) stick.current = false
          }}
          onKeyDown={(e) => {
            if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) stick.current = false
          }}
          onScroll={(e) => {
            const el = e.currentTarget
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) stick.current = true
          }}
        >
          {online === false && (
            <div className="banner bad">
              Can't reach Ollama. Start it with <code>ollama serve</code> or check the host in App settings.
            </div>
          )}
          {chat.messages.length === 0 ? (
            <div className="empty">
              <h1>What can I help with?</h1>
              <p className="muted">{chat.settings.model || 'Pick a model in Settings'} · runs fully on your machine</p>
            </div>
          ) : (
            <div className="messages">
              {chat.messages.map((msg, i) => (
                <Fragment key={msg.id}>
                  {chat.summary && i === (chat.summaryCount ?? 0) && compactNote()}
                  <Message
                    msg={msg}
                    streaming={streamingId === chat.id && i === chat.messages.length - 1}
                    isLast={i === chat.messages.length - 1}
                    ask={chat.messages[i - 1]?.role === 'user' ? chat.messages[i - 1].content : ''}
                  />
                </Fragment>
              ))}
              {chat.summary && (chat.summaryCount ?? 0) >= chat.messages.length && compactNote(true)}
            </div>
          )}
        </div>
        <Composer />
      </div>
      <PreviewPane />
      {drawer && <SettingsPanel />}
    </div>
  )
}
