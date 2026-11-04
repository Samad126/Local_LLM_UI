import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { useApp } from '../appStore'
import { hasCap } from '../lib/ollama'
import { checkWorkspace, MODES, MODE_INFO } from '../lib/agent'
import { fileToBase64 } from '../lib/util'
import { approxTokens, isImage, isSupportedDoc, readDoc } from '../lib/files'
import type { Attachment } from '../types'
import { Icon } from './Icon'
import { useLightbox } from '../lightbox'
import { slashSegments } from '../lib/slash'
import { AttachCard } from './AttachCard'
import { Button } from '@/components/ui/button'

export function Composer() {
  const chatId = useStore((s) => s.activeId)
  const model = useStore((s) => s.chats.find((c) => c.id === s.activeId)?.settings.model ?? '')
  const numCtx = useStore((s) => s.chats.find((c) => c.id === s.activeId)?.settings.options.num_ctx)
  const agent = useStore((s) => s.chats.find((c) => c.id === s.activeId)?.agent)
  const draft = useStore((s) => s.draft)
  const setDraft = useStore((s) => s.setDraft)
  const send = useStore((s) => s.send)
  const stop = useStore((s) => s.stop)
  const streamingId = useStore((s) => s.streamingId)
  const meta = useStore((s) => s.meta)
  const prompts = useStore((s) => s.prompts)
  const models = useStore((s) => s.models)
  const webMode = useStore((s) => s.webMode)
  const setWebMode = useStore((s) => s.setWebMode)
  const compact = useStore((s) => s.compact)
  const setAgent = useStore((s) => s.setAgent)
  const sendOnEnter = useApp((s) => s.sendOnEnter)
  const [images, setImages] = useState<string[]>([])
  const [docs, setDocs] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const vision = hasCap(meta[model], 'vision')
  const streaming = !!streamingId

  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 260) + 'px'
  }, [draft])
  useEffect(() => {
    ta.current?.focus()
  }, [chatId])

  // A `/word` being typed at the end of the draft opens the prompt menu; picking one inserts `/name` as a blue command.
  const slashTok = /(^|\s)\/([\w-]*)$/.exec(draft)
  const slash = useMemo(() => {
    if (!slashTok) return []
    const q = slashTok[2].toLowerCase()
    return prompts.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6)
  }, [draft, prompts])
  const pick = (name: string) => setDraft(draft.slice(0, slashTok!.index + slashTok![1].length) + '/' + name + ' ')
  const segs = useMemo(
    () =>
      slashSegments(
        draft,
        prompts.map((p) => p.name),
      ),
    [draft, prompts],
  )
  const mirror = useRef<HTMLDivElement>(null)
  // Up/Down in the composer walks through messages previously sent in this chat.
  const hist = useStore((s) => s.chats.find((c) => c.id === s.activeId)?.messages)
  const histIdx = useRef(-1)
  const histDraft = useRef('')
  useEffect(() => {
    histIdx.current = -1
  }, [chatId])
  const sent = () => (hist ?? []).filter((m) => m.role === 'user' && m.content).map((m) => m.content)
  const walk = (dir: -1 | 1) => {
    const h = sent()
    if (!h.length) return false
    if (dir === -1) {
      if (histIdx.current === -1) {
        histDraft.current = draft
        histIdx.current = h.length - 1
      } else if (histIdx.current > 0) histIdx.current--
      else return true
    } else {
      if (histIdx.current === -1) return false
      histIdx.current++
    }
    setDraft(histIdx.current >= h.length ? ((histIdx.current = -1), histDraft.current) : h[histIdx.current])
    return true
  }

  const addFiles = async (files: FileList | File[]) => {
    setErr('')
    const list = [...files]
    const imgs = list.filter(isImage)
    const rest = list.filter((f) => !isImage(f))
    if (imgs.length && !vision) setErr('Images ignored: selected model has no vision capability.')
    if (imgs.length && vision) {
      const b64 = await Promise.all(imgs.map(fileToBase64))
      setImages((p) => [...p, ...b64])
    }
    const ok = rest.filter(isSupportedDoc)
    if (rest.length > ok.length)
      setErr(
        `Unsupported: ${rest
          .filter((f) => !isSupportedDoc(f))
          .map((f) => f.name)
          .join(', ')} (use text, code, or PDF)`,
      )
    if (!ok.length) return
    setBusy(true)
    for (const f of ok) {
      try {
        const d = await readDoc(f)
        setDocs((p) => [...p, d])
      } catch (e: any) {
        setErr(e?.message ?? String(e))
      }
    }
    setBusy(false)
  }

  const agentOn = !!agent?.on && !!agent.workspace
  const pickFolder = async () => {
    setErr('')
    let dir: string | null
    if (window.desktop) dir = await window.desktop.pickFolder()
    else dir = prompt('Absolute path of the project folder:', agent?.workspace || '')?.trim() || null
    if (!dir) return false
    const r = await checkWorkspace(dir).catch(
      () => ({ ok: false, error: 'Server unreachable' }) as { ok: boolean; path?: string; error?: string },
    )
    if (!r.ok) {
      setErr(`Folder not usable: ${r.error ?? dir}`)
      return false
    }
    setAgent({ on: true, workspace: r.path ?? dir })
    return true
  }
  const mode = agent?.mode ?? 'ask'
  const setMode = (m: (typeof MODES)[number]) => {
    if (m === 'auto') {
      let seen = false
      try {
        seen = localStorage.getItem('agent-auto-ok') === '1'
      } catch {
        /* storage blocked */
      }
      if (!seen) {
        if (
          !confirm(
            'Auto mode lets the model edit files and run shell commands in this folder without asking.\n\nRisky commands (sudo, rm -rf, force-push…) still ask. Enable Auto mode?',
          )
        )
          return
        try {
          localStorage.setItem('agent-auto-ok', '1')
        } catch {
          /* ignore */
        }
      }
    }
    setAgent({ mode: m })
  }
  const cycleMode = () => setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length])
  const toggleAgent = async () => {
    if (agentOn) return setAgent({ on: false })
    if (agent?.workspace) return setAgent({ on: true })
    await pickFolder()
  }

  const submit = () => {
    const t = draft.trim()
    if (t === '/compact') {
      setDraft('')
      compact()
      return
    }
    if ((!t && !images.length && !docs.length) || streaming || busy) return
    if (!model) return alert('Select a model in Settings first.')
    histIdx.current = -1
    send(t, images, docs)
    setDraft('')
    setImages([])
    setDocs([])
  }

  // Files dropped anywhere on the window arrive through DropOverlay.
  const openImage = useLightbox((s) => s.open)
  const addRef = useRef(addFiles)
  addRef.current = addFiles
  useEffect(() => {
    const on = (e: Event) => addRef.current((e as CustomEvent<File[]>).detail)
    const quote = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      setDocs((p) => [...p, { name: 'Reply', text, size: text.length, kind: 'quote' }])
      setTimeout(() => ta.current?.focus(), 30)
    }
    window.addEventListener('app:files', on)
    window.addEventListener('app:quote', quote)
    return () => {
      window.removeEventListener('app:files', on)
      window.removeEventListener('app:quote', quote)
    }
  }, [])

  return (
    <div className="composer">
      {slash.length > 0 && (
        <div className="slashmenu">
          {slash.map((p, i) => (
            <div
              key={p.id}
              className={i === sel ? 'on' : ''}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(p.name)
              }}
            >
              <b>/{p.name}</b> <span className="muted">{p.text.slice(0, 70)}</span>
            </div>
          ))}
        </div>
      )}
      {(busy || err || docs.some((d) => d.kind !== 'quote')) && (
        <div className="docchips">
          {busy && <span className="muted">Reading…</span>}
          {docs.length > 0 &&
            (() => {
              const t = docs.reduce((n, d) => n + approxTokens(d.text), 0)
              const ctx = numCtx ?? 4096
              return t > ctx * 0.7 ? (
                <span className="warnText">
                  ⚠ ~{t.toLocaleString()} tokens vs {ctx.toLocaleString()} context — raise Context window in Settings or
                  the start will be cut off
                </span>
              ) : null
            })()}
          {err && <span className="warnText">{err}</span>}
        </div>
      )}
      <div className="composerbox">
        {(docs.length > 0 || images.length > 0) && (
          <div className="attachrow">
            {docs.map((d, i) => (
              <AttachCard key={'d' + i} a={d} onRemove={() => setDocs(docs.filter((_, k) => k !== i))} />
            ))}
            {images.map((b, i) => (
              <div
                key={'i' + i}
                className="attachcard img clickable"
                onClick={() => openImage({ kind: 'image', title: `image-${i + 1}.png`, body: b })}
              >
                <img src={`data:image/png;base64,${b}`} />
                <button
                  className="attachx"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    setImages(images.filter((_, k) => k !== i))
                  }}
                >
                  <Icon n="x" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="taWrap">
          <div className="mirror" ref={mirror} aria-hidden>
            {segs.map((s, i) =>
              s.cmd ? (
                <span key={i} className="slashcmd">
                  {s.text}
                </span>
              ) : (
                s.text
              ),
            )}
            {'\u200b'}
          </div>
          <textarea
            onScroll={(e) => {
              if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop
            }}
            ref={ta}
            rows={1}
            value={draft}
            placeholder={models.length ? 'Message… (type / for saved prompts)' : 'No models found'}
            onChange={(e) => {
              setDraft(e.target.value)
              setSel(0)
            }}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault()
                addFiles(e.clipboardData.files)
                return
              }
              const t = e.clipboardData.getData('text/plain')
              // Long pastes become an attachment (like claude.ai) instead of flooding the box.
              if (t.length >= 1500 || t.split('\n').length >= 25) {
                e.preventDefault()
                const n = docs.filter((d) => d.kind === 'paste').length + 1
                setDocs((p) => [
                  ...p,
                  { name: `Pasted text${n > 1 ? ' ' + n : ''}`, text: t, size: t.length, kind: 'paste' },
                ])
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && e.shiftKey && agentOn) {
                e.preventDefault()
                cycleMode()
                return
              }
              if (slash.length && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) {
                e.preventDefault()
                if (slash[sel]) pick(slash[sel].name)
                return
              }
              if (slash.length && e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((sel + 1) % slash.length)
                return
              }
              if (slash.length && e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((sel + slash.length - 1) % slash.length)
                return
              }
              const t = e.currentTarget
              if (!slash.length && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
                if (
                  e.key === 'ArrowUp' &&
                  t.selectionStart === t.selectionEnd &&
                  !draft.slice(0, t.selectionStart).includes('\n') &&
                  walk(-1)
                ) {
                  e.preventDefault()
                  return
                }
                if (
                  e.key === 'ArrowDown' &&
                  histIdx.current !== -1 &&
                  t.selectionStart === t.selectionEnd &&
                  !draft.slice(t.selectionEnd).includes('\n') &&
                  walk(1)
                ) {
                  e.preventDefault()
                  return
                }
              }
              if (
                e.key === 'Enter' &&
                !e.nativeEvent.isComposing &&
                (sendOnEnter ? !e.shiftKey : e.ctrlKey || e.metaKey)
              ) {
                e.preventDefault()
                submit()
              }
            }}
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
            title={
              {
                auto: 'Web search: Auto (searches only when your message needs fresh info). Click to change.',
                on: 'Web search: Always on. Click to change.',
                off: 'Web search: Off. Click to change.',
              }[webMode]
            }
            onClick={() => setWebMode(webMode === 'auto' ? 'on' : webMode === 'on' ? 'off' : 'auto')}
          >
            <Icon n="globe" /> <small>{webMode}</small>
          </Button>
          <Button
            variant={agentOn ? 'secondary' : 'ghost'}
            size="sm"
            className={agentOn ? 'text-primary' : ''}
            title={agentOn ? `Agent ON · ${agent?.workspace}` : 'Coding agent: pick a project folder'}
            onClick={toggleAgent}
          >
            <Icon n="terminal" />
          </Button>
          {agentOn && (
            <Button variant="ghost" size="sm" title={agent?.workspace + ' (click to change)'} onClick={pickFolder}>
              <Icon n="folder" /> <small>{agent?.workspace.split('/').filter(Boolean).pop()}</small>
            </Button>
          )}
          {agentOn && (
            <Button
              variant="secondary"
              size="sm"
              className={
                'h-7 rounded-full text-xs ' +
                (mode === 'auto' ? 'text-destructive' : mode === 'plan' ? 'text-primary' : '')
              }
              title={`${MODE_INFO[mode].hint} (Shift+Tab to switch)`}
              onClick={cycleMode}
            >
              {MODE_INFO[mode].label}
            </Button>
          )}
          <input
            ref={file}
            type="file"
            accept={
              (vision ? 'image/*,' : '') +
              '.pdf,text/*,.md,.csv,.json,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.c,.cpp,.h,.sh,.sql,.yaml,.yml,.toml,.html,.css,.xml,.log'
            }
            multiple
            hidden
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <span className="spacer" />
          {streaming ? (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={stop}
              title="Stop"
            >
              <Icon n="stop" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="rounded-full"
              onClick={submit}
              disabled={(!draft.trim() && !images.length && !docs.length) || busy}
              title="Send"
            >
              <Icon n="send" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
