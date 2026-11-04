import { memo, useState } from 'react'
import { SlashText } from '@/components/common/SlashText'
import { AttachCard } from '@/components/common/AttachCard'
import { useLightbox } from '@/stores/lightboxStore'
import { docSource } from '@/features/artifacts/artifacts'
import { Markdown, FileCard } from '@/components/markdown/Markdown'
import { DOC_KINDS, downloadDoc, type DocKind } from '@/lib/docs'
import { Icon } from '@/components/common/Icon'
import { useStore } from '@/stores/chatStore'
import { fileIntent } from '@/features/chat/fileIntent'
import { usePreview } from '@/stores/previewStore'
import { useApp } from '@/stores/settingsStore'
import type { Message as Msg, ToolCall } from '@/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

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
              {msg.sources.slice(0, 3).map((s, i) => (
                <img
                  key={i}
                  src={`https://www.google.com/s2/favicons?domain=${new URL(s.url).hostname}&sz=32`}
                  alt=""
                  width={16}
                  height={16}
                />
              ))}
            </span>
            {msg.sources.length} sources
          </button>
        ) : null}

        {msg.toolCalls?.map((tc) => (
          <ToolCard key={tc.id} tc={tc} />
        ))}

        {msg.error && <div className="banner bad">{msg.error}</div>}

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
                  onClick={() => downloadDoc(k, msg.content).catch((e) => alert('Could not build file: ' + e.message))}
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

type DiffRow = { t: ' ' | '-' | '+'; s: string }
/** Line diff via LCS: unchanged lines stay as context, like `git diff`. */
function lineDiff(a: string, b: string): DiffRow[] {
  const x = a.split('\n'),
    y = b.split('\n')
  if (x.length * y.length > 250_000)
    return [...x.map((s) => ({ t: '-' as const, s })), ...y.map((s) => ({ t: '+' as const, s }))]
  const L = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1))
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const out: DiffRow[] = []
  let i = 0,
    j = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      out.push({ t: ' ', s: x[i] })
      i++
      j++
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: '-', s: x[i++] })
    else out.push({ t: '+', s: y[j++] })
  }
  while (i < x.length) out.push({ t: '-', s: x[i++] })
  while (j < y.length) out.push({ t: '+', s: y[j++] })
  return out
}

function Diff({ a, b }: { a: string; b: string }) {
  const rows = lineDiff(a, b)
  const add = rows.filter((r) => r.t === '+').length,
    del = rows.filter((r) => r.t === '-').length
  let o = 0,
    n = 0
  return (
    <div className="diffbox">
      <div className="diffstat">
        <span className="add">+{add}</span> <span className="del">−{del}</span>
      </div>
      <pre className="diff">
        {rows.map((r, k) => {
          if (r.t !== '+') o++
          if (r.t !== '-') n++
          return (
            <div key={k} className={'dl ' + (r.t === '+' ? 'add' : r.t === '-' ? 'del' : 'ctx')}>
              <span className="ln">{r.t === '+' ? '' : o}</span>
              <span className="ln">{r.t === '-' ? '' : n}</span>
              <span className="sg">{r.t}</span>
              {r.s || ' '}
            </div>
          )
        })}
      </pre>
    </div>
  )
}

const APPROVED: Record<string, string> = { auto: 'auto-approved', user: 'allowed', always: 'always allowed' }

const ToolCard = memo(function ToolCard({ tc }: { tc: ToolCall }) {
  const approve = useStore((s) => s.approve)
  const [open, setOpen] = useState(tc.status === 'pending')
  // Pending calls pop open so the user sees what they are approving.
  if (tc.status === 'pending' && !open) setOpen(true)
  const label =
    tc.status === 'running' ? 'running…' : tc.status === 'done' && tc.approved ? APPROVED[tc.approved] : tc.status
  return (
    <details className={'toolcall ' + tc.status} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <Icon n={tc.name === 'run_command' ? 'terminal' : 'folder'} size={14} />
        <b>{tc.name}</b>
        <span className="muted toolarg">{tc.args.command ?? tc.args.path ?? tc.args.pattern ?? ''}</span>
        <span className="toolstatus">{label}</span>
      </summary>
      {open && (
        <div className="toolbody">
          {tc.name === 'edit_file' ? (
            <Diff a={String(tc.args.old_string ?? '')} b={String(tc.args.new_string ?? '')} />
          ) : tc.name === 'write_file' ? (
            <pre>{String(tc.args.content ?? '').slice(0, 4000)}</pre>
          ) : tc.name === 'run_command' ? (
            <pre>$ {String(tc.args.command ?? '')}</pre>
          ) : null}
          {tc.result && <pre className="toolresult">{tc.result.slice(0, 4000)}</pre>}
        </div>
      )}
      {tc.status === 'pending' && (
        <div className="row toolapprove">
          <Button variant="default" size="sm" onClick={() => approve(tc.id, 'allow')}>
            Allow
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => approve(tc.id, 'always')}
            title="Stop asking for this tool until you change mode"
          >
            Allow always
          </Button>
          <Button variant="outline" size="sm" onClick={() => approve(tc.id, 'deny')}>
            Deny
          </Button>
        </div>
      )}
    </details>
  )
})
