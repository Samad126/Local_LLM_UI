import { Icon } from '@/components/common/Icon'
import { ArtifactsMenu } from '@/components/chat/ArtifactsMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { displayCtx } from '@/features/chat/context'
import { download } from '@/lib/download'
import { hasCap } from '@/services/ollama'
import { useStore } from '@/stores/chatStore'
import type { Chat } from '@/types'

const CAPABILITY_BADGES = ['thinking', 'vision', 'tools']
const WARN_PCT = 85

/** Tokens used by the most recent reply (prompt + output), from Ollama's own counters. */
function tokensUsed(chat: Chat) {
  const last = chat.messages.findLast((x) => x.stats?.promptEvalCount)
  return last ? (last.stats!.promptEvalCount ?? 0) + (last.stats!.evalCount ?? 0) : 0
}

export function ChatHeader({ chat }: { chat: Chat }) {
  const meta = useStore((s) => s.meta[chat.settings.model])
  const streamingId = useStore((s) => s.streamingId)
  const drawer = useStore((s) => s.drawer)
  const toggleDrawer = useStore((s) => s.toggleDrawer)
  const compact = useStore((s) => s.compact)
  const used = tokensUsed(chat)
  const ctx = displayCtx(chat, meta)
  const pct = ctx ? Math.min(100, (used / ctx) * 100) : 0
  const exportMd = () =>
    download(`${chat.title}.md`, chat.messages.map((x) => `## ${x.role}\n\n${x.content}`).join('\n\n'), 'text/markdown')

  return (
    <header className="topbar">
      <div className="topbar-title">{chat.title}</div>
      <Badge variant="secondary">{chat.settings.model || 'no model'}</Badge>
      {CAPABILITY_BADGES.filter((c) => hasCap(meta, c)).map((c) => (
        <Badge key={c} variant="secondary">
          {c}
        </Badge>
      ))}
      <div className="spacer" />
      {used > 0 && (
        <div className="ctxmeter" title={`${used} / ${ctx || '?'} tokens`}>
          <div style={{ width: pct + '%' }} className={pct > WARN_PCT ? 'warn' : ''} />
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
        onClick={() => void compact()}
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
  )
}
