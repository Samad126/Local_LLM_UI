import { memo, useState } from 'react'
import { SlashText } from '@/components/common/SlashText'
import { AttachCard } from '@/components/common/AttachCard'
import { useLightbox } from '@/stores/lightboxStore'
import { docSource } from '@/features/artifacts/artifacts'
import { Markdown } from '@/components/markdown/Markdown'
import { FileCard } from '@/components/markdown/FileCard'
import { DOC_KINDS, downloadDoc, type DocKind } from '@/lib/docs'
import { Icon } from '@/components/common/Icon'
import { faviconUrl } from '@/lib/url'
import { useStore } from '@/stores/chatStore'
import { fileIntent } from '@/features/chat/fileIntent'
import { usePreview } from '@/stores/previewStore'
import { useApp } from '@/stores/settingsStore'
import type { Message as Msg } from '@/types'
import { ToolCard } from '@/components/chat/ToolCard'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export const Message = memo(function Message({
  msg,
  streaming,
  isLast,
  ask = '',
}: {
  msg: Msg
  streaming: boolean
  isLast: boolean
  ask?: string
}) {
  const regenerate = useStore((s) => s.regenerate)
  const deleteMessage = useStore((s) => s.deleteMessage)
  const editAndResend = useStore((s) => s.editAndResend)
  const streamingId = useStore((s) => s.streamingId)
  const status = useStore((s) => (streaming ? s.status : ''))
  const planMode = useStore((s) => isLast && s.chats.find((c) => c.id === s.activeId)?.agent?.mode === 'plan')
  const setAgent = useStore((s) => s.setAgent)
  const send = useStore((s) => s.send)
  const showSources = usePreview((s) => s.showSources)
  const openImage = useLightbox((s) => s.open)
  const showStats = useApp((s) => s.showStats)
  const [editing, setEditing] = useState(false)
  const [exportError, setExportError] = useState('')
  const [text, setText] = useState(msg.content)
  const busy = !!streamingId
  const isUser = msg.role === 'user'
  const s = msg.stats
  const wanted: DocKind | null =
    !isUser && msg.content && !/```(pdf|docx|xlsx|pptx)\b/.test(msg.content) ? fileIntent(ask) : null
  const tps = s?.evalCount && s.evalDuration ? s.evalCount / (s.evalDuration / 1e9) : 0

  return (
    <div className={'msg ' + msg.role}>
      <div className="avatar">{isUser ? 'You' : 'AI'}</div>
      <div className="body">
        {msg.images?.length ? (
          <div className="imgs">
            {msg.images.map((b, i) => (
              <img
                key={i}
                className="zoomable"
                title="Click to enlarge"
                src={`data:image/png;base64,${b}`}
                onClick={() => openImage({ kind: 'image', title: `image-${i + 1}.png`, body: b })}
              />
            ))}
          </div>
        ) : null}

        {msg.files?.length ? (
          <div className="attachrow sent">
            {msg.files.map((f, i) => (
              <AttachCard key={i} a={f} />
            ))}
          </div>
        ) : null}

        {streaming && !msg.content && !msg.thinking && status && (
          <div className="searching">
            <Icon n="globe" size={14} /> {status}
          </div>
        )}

        {msg.thinking && (
          <details className="think" open={streaming && !msg.content}>
            <summary>
              <Icon n="brain" size={14} /> {streaming && !msg.content ? 'Thinking…' : 'Thought process'}
            </summary>
            <div className="thinkbody">{msg.thinking}</div>
          </details>
        )}

        {editing ? (
          <div className="editbox">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(12, text.split('\n').length + 1)}
              autoFocus
            />
            <div className="row">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setEditing(false)
                  editAndResend(msg.id, text)
                }}
              >
                Save & resend
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(false)
                  setText(msg.content)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : isUser ? (
          <div className="usertext">
            <SlashText text={msg.content} />
          </div>
        ) : (
          <>
            {wanted ? (
              <>
                <FileCard kind={wanted} src={docSource(msg.content)} live={streaming} />
                <details className="sources">
                  <summary>Show document text</summary>
                  <Markdown text={msg.content} sources={msg.sources} />
                </details>
              </>
            ) : msg.content ? (
              <Markdown text={msg.content} live={streaming} sources={msg.sources} />
            ) : (
              streaming && !msg.thinking && <span className="cursor" />
            )}
            {streaming && msg.content && <span className="cursor" />}
          </>
        )}

        {msg.sources?.length && !streaming ? (
          <button className="srcbtn" onClick={() => showSources({ query: msg.searchQuery, sources: msg.sources! })}>
            <span className="srcfavs">
              {msg.sources.slice(0, 3).map((src, i) => (
                <img key={i} src={faviconUrl(src.url)} alt="" width={16} height={16} />
              ))}
            </span>
            {msg.sources.length} sources
          </button>
        ) : null}

        {msg.toolCalls?.map((tc) => (
          <ToolCard key={tc.id} tc={tc} />
        ))}

        {(msg.error || exportError) && <div className="banner bad">{msg.error || exportError}</div>}

        {planMode && !streaming && !isUser && msg.content && !msg.error && (
          <div className="row planbar">
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                setAgent({ mode: 'auto' })
                send('Proceed with the plan.', [])
              }}
            >
              Approve plan &amp; start (Auto mode)
            </Button>
            <span className="muted">or reply to refine it</span>
          </div>
        )}

        {!streaming && !editing && (
          <div className="msgbar">
            <button title="Copy" onClick={() => navigator.clipboard.writeText(msg.content)}>
              <Icon n="copy" size={14} />
            </button>
            {isUser && (
              <button
                title="Edit"
                disabled={busy}
                onClick={() => {
                  setText(msg.content)
                  setEditing(true)
                }}
              >
                <Icon n="edit" size={14} />
              </button>
            )}
            {(!isUser || isLast) && (
              <button title="Regenerate" disabled={busy} onClick={() => regenerate(msg.id)}>
                <Icon n="refresh" size={14} />
              </button>
            )}
            {!isUser &&
              msg.content &&
              DOC_KINDS.filter((k) => k !== 'xlsx' && k !== 'pptx').map((k) => (
                <button
                  key={k}
                  title={`Download reply as ${k.toUpperCase()}`}
                  className="exportbtn"
                  onClick={() =>
                    downloadDoc(k, msg.content).catch((e: Error) =>
                      setExportError('Could not build file: ' + e.message),
                    )
                  }
                >
                  {k.toUpperCase()}
                </button>
              ))}
            <button title="Delete" disabled={busy} onClick={() => deleteMessage(msg.id)}>
              <Icon n="trash" size={14} />
            </button>
            {showStats && s && !isUser && (
              <span className="stats">
                {tps ? `${tps.toFixed(1)} tok/s · ` : ''}
                {s.evalCount ?? 0} out · {s.promptEvalCount ?? 0} in
                {s.totalDuration ? ` · ${(s.totalDuration / 1e9).toFixed(1)}s` : ''}
                {msg.model ? ` · ${msg.model}` : ''}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
