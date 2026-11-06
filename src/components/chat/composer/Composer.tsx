import { useEffect, useRef } from 'react'
import { useStore, useActiveChat } from '@/stores/chatStore'
import { useApp } from '@/stores/settingsStore'
import { useComposerInbox } from '@/stores/composerStore'
import { useQueue } from '@/stores/queueStore'
import { hasCap } from '@/services/ollama'
import { Icon } from '@/components/common/Icon'
import { Button } from '@/components/ui/button'
import { AgentButtons, useAgentControls } from './useAgentControls'
import { AttachmentRow } from './AttachmentRow'
import { SlashMenu } from './SlashMenu'
import { useAttachments } from './useAttachments'
import { useHistoryNav } from './useHistoryNav'
import { useSlashMenu } from './useSlashMenu'

const WEB_TITLES = {
  auto: 'Web search: Auto (searches only when your message needs fresh info). Click to change.',
  on: 'Web search: Always on. Click to change.',
  off: 'Web search: Off. Click to change.',
}
const NEXT_WEB = { auto: 'on', on: 'off', off: 'auto' } as const
const ACCEPT =
  '.pdf,text/*,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.c,.cpp,.h,.sh,.sql,.yaml,.yml,.toml,.html,.css,.xml,.log'
const MAX_HEIGHT = 260

export function Composer() {
  const chatId = useStore((s) => s.activeId)
  const model = useActiveChat((c) => c?.settings.model ?? '')
  const numCtx = useActiveChat((c) => c?.settings.options.num_ctx)
  const agent = useActiveChat((c) => c?.agent)
  const messages = useActiveChat((c) => c?.messages)
  const { draft, setDraft, send, stop, compact, setAgent, setWebMode, webMode, streamingId, prompts, models } =
    useStore()
  const vision = useStore((s) => hasCap(s.meta[model], 'vision'))
  const sendOnEnter = useApp((s) => s.sendOnEnter)
  const streaming = !!streamingId
  const queued = useQueue((s) => s.items).filter((i) => i.chatId === chatId)

  const ta = useRef<HTMLTextAreaElement>(null)
  const mirror = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)

  const att = useAttachments(vision)
  const slash = useSlashMenu(draft, prompts, setDraft)
  const sent = (messages ?? []).filter((m) => m.role === 'user' && m.content).map((m) => m.content)
  const nav = useHistoryNav(chatId, draft, setDraft, sent)
  const agentUi = useAgentControls({ agent, setAgent, onError: att.setErr })

  // Grow the textarea with its content; refocus when switching chats.
  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + 'px'
  }, [draft])
  useEffect(() => {
    ta.current?.focus()
  }, [chatId])

  // Files dropped on the window and text quoted from a reply arrive through the inbox store.
  const inboxFiles = useComposerInbox((s) => s.files)
  const inboxQuotes = useComposerInbox((s) => s.quotes)
  useEffect(() => {
    if (!inboxFiles.length && !inboxQuotes.length) return
    const { files, quotes } = useComposerInbox.getState().drain()
    if (files.length) void att.addFiles(files)
    if (quotes.length) {
      quotes.forEach(att.addQuote)
      setTimeout(() => ta.current?.focus(), 30)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drain once per delivery; `att` changes every render
  }, [inboxFiles, inboxQuotes])

  const submit = () => {
    const t = draft.trim()
    if (t === '/compact') {
      setDraft('')
      void compact()
      return
    }
    if ((!t && att.isEmpty) || att.busy) return
    if (!model) return att.setErr('Select a model in Settings first.')
    nav.reset()
    if (streaming && chatId) {
      useQueue.getState().add({ chatId, text: t, images: att.images, files: att.docs })
    } else void send(t, att.images, att.docs)
    setDraft('')
    att.clear()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && e.shiftKey && agentUi.agentOn) {
      e.preventDefault()
      return agentUi.cycleMode()
    }
    if (slash.open) {
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const p = slash.items[slash.sel]
        if (p) slash.pick(p.name)
        return
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : slash.items.length - 1
        slash.setSel((slash.sel + d) % slash.items.length)
        return
      }
    } else if (!e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const t = e.currentTarget
      const caretAlone = t.selectionStart === t.selectionEnd
      if (e.key === 'ArrowUp' && caretAlone && !draft.slice(0, t.selectionStart).includes('\n') && nav.walk(-1)) {
        return e.preventDefault()
      }
      if (
        e.key === 'ArrowDown' &&
        nav.browsing() &&
        caretAlone &&
        !draft.slice(t.selectionEnd).includes('\n') &&
        nav.walk(1)
      ) {
        return e.preventDefault()
      }
    }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && (sendOnEnter ? !e.shiftKey : e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      submit()
    }
  }

  const ctx = numCtx ?? 4096
  const overflow = att.docs.length > 0 && att.docTokens > ctx * 0.7

  return (
    <div className="composer">
      <SlashMenu items={slash.items} sel={slash.sel} onPick={slash.pick} />
      {(att.busy || att.err || att.docs.some((d) => d.kind !== 'quote')) && (
        <div className="docchips">
          {att.busy && <span className="muted">Reading…</span>}
          {overflow && (
            <span className="warnText">
              ⚠ ~{att.docTokens.toLocaleString()} tokens vs {ctx.toLocaleString()} context — raise Context window in
              Settings or the start will be cut off
            </span>
          )}
          {att.err && <span className="warnText">{att.err}</span>}
        </div>
      )}
      {queued.length > 0 && (
        <div className="queuelist">
          {queued.map((q) => (
            <div key={q.id} className="queueitem">
              <span className="muted">Queued</span>
              <span className="queuetext">{q.text || `${q.images.length + q.files.length} attachment(s)`}</span>
              <button className="queuex" title="Remove from queue" onClick={() => useQueue.getState().remove(q.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="composerbox">
        <AttachmentRow
          docs={att.docs}
          images={att.images}
          onRemoveDoc={att.removeDoc}
          onRemoveImage={att.removeImage}
        />
        <div className="taWrap">
          <div className="mirror" ref={mirror} aria-hidden>
            {slash.segments.map((s, i) =>
              s.cmd ? (
                <span key={i} className="slashcmd">
                  {s.text}
                </span>
              ) : (
                s.text
              ),
            )}
            {'​'}
          </div>
          <textarea
            ref={ta}
            rows={1}
            value={draft}
            placeholder={models.length ? 'Message… (type / for saved prompts)' : 'No models found'}
            onScroll={(e) => {
              if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop
            }}
            onChange={(e) => {
              setDraft(e.target.value)
              slash.setSel(0)
            }}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault()
                void att.addFiles(e.clipboardData.files)
              } else if (att.addPaste(e.clipboardData.getData('text/plain'))) e.preventDefault()
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="composerbar">
          <Button
            variant="ghost"
            size="sm"
            title={vision ? 'Attach documents (PDF, text, code) or images' : 'Attach documents (PDF, text, code)'}
            onClick={() => file.current?.click()}
          >
            <Icon n="clip" />
          </Button>
          <Button
            variant={webMode === 'on' ? 'secondary' : 'ghost'}
            size="sm"
            className={webMode === 'on' ? 'text-primary' : ''}
            title={WEB_TITLES[webMode]}
            onClick={() => setWebMode(NEXT_WEB[webMode])}
          >
            <Icon n="globe" /> <small>{webMode}</small>
          </Button>
          <AgentButtons agent={agent} c={agentUi} />
          <input
            ref={file}
            type="file"
            accept={(vision ? 'image/*,' : '') + ACCEPT}
            multiple
            hidden
            onChange={(e) => e.target.files && void att.addFiles(e.target.files)}
          />
          <span className="spacer" />
          {streaming && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={stop}
              title="Stop"
            >
              <Icon n="stop" />
            </Button>
          )}
          {(!streaming || draft.trim() || !att.isEmpty) && (
            <Button
              size="icon"
              className="rounded-full"
              onClick={submit}
              disabled={(!draft.trim() && att.isEmpty) || att.busy}
              title={streaming ? 'Queue message (sent when the reply finishes)' : 'Send'}
            >
              <Icon n="send" />
            </Button>
          )}
        </div>
      </div>
      {agentUi.dialogs}
    </div>
  )
}
