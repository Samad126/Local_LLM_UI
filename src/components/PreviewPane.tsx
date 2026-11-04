import { useResizable } from './Resizer'
import { useEffect, useState } from 'react'
import { PdfViewer, DocxViewer } from './Viewers'
import { usePreview } from '../previewStore'
import { useActive } from '../store'
import { chatArtifacts, type Artifact } from '../lib/artifacts'
import { Markdown } from './Markdown'
import { Button } from '@/components/ui/button'
import { Icon } from './Icon'
import { Maximize2, Minimize2, ArrowLeft, Code2, FileText, Table2, Globe, Image as ImageIcon } from 'lucide-react'
import { download } from '../lib/util'
import { buildDoc, pptxPdf, type DocKind, downloadDoc, isDocKind, toPreviewMarkdown } from '../lib/docs'

const ICON: Record<string, any> = {
  file: FileText,
  image: ImageIcon,
  html: Globe,
  svg: ImageIcon,
  markdown: FileText,
  pdf: FileText,
  docx: FileText,
  xlsx: Table2,
}

function saveText(a: { kind: string; code: string; title?: string }, name?: string) {
  if (a.kind === 'file') return download(name ?? a.title ?? 'file.txt', a.code, 'text/plain;charset=utf-8')
  if (a.kind === 'image') {
    const bin = atob(a.code)
    const u = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
    const l = document.createElement('a')
    l.href = URL.createObjectURL(new Blob([u], { type: 'image/png' }))
    l.download = name ?? a.title ?? 'image.png'
    l.click()
    return
  }
  const ext = a.kind === 'markdown' ? 'md' : a.kind
  download(
    name ?? `preview.${ext}`,
    a.code,
    a.kind === 'html' ? 'text/html' : a.kind === 'svg' ? 'image/svg+xml' : 'text/markdown',
  )
}

function ArtifactList() {
  const chat = useActive()
  const { open, close } = usePreview()
  const items = chat ? chatArtifacts(chat) : []
  const downloadAll = async () => {
    for (const a of items) {
      if (isDocKind(a.kind)) {
        try {
          await downloadDoc(a.kind, a.code)
        } catch {
          /* skip failed file */
        }
      } else saveText(a, a.title.replace(/\s+/g, '-') + '.' + (a.kind === 'markdown' ? 'md' : a.kind))
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  return (
    <>
      <div className="preview-head">
        <b>Artifacts</b>
        <Button variant="ghost" size="sm" onClick={downloadAll} disabled={!items.length}>
          <Icon n="download" /> Download all
        </Button>
        <Button variant="ghost" size="icon" className="size-8" title="Close" onClick={close}>
          <Icon n="x" />
        </Button>
      </div>
      <div className="preview-doc artlist">
        {!items.length && <p className="muted">Nothing generated in this chat yet.</p>}
        {items.map((a: Artifact) => {
          const I = ICON[a.kind] ?? Code2
          return (
            <button key={a.id} className="artitem" onClick={() => open(a)}>
              <span className="articon">
                <I size={18} />
              </span>
              <span className="artinfo">
                <b>{a.title}</b>
                <small>
                  {a.kind === 'file'
                    ? `Uploaded · ${(a.title.split('.').pop() ?? 'file').toUpperCase()}`
                    : a.kind === 'image'
                      ? 'Uploaded · Image'
                      : isDocKind(a.kind)
                        ? `Document · ${a.kind.toUpperCase()}`
                        : a.kind === 'markdown'
                          ? 'Document · MD'
                          : `Preview · ${a.kind.toUpperCase()}`}
                </small>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function host(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

function SourcesList() {
  const { sources: v, close } = usePreview()
  if (!v) return null
  return (
    <>
      <div className="preview-head">
        <b>Sources</b>
        <Button variant="ghost" size="icon" className="size-8" title="Close" onClick={close}>
          <Icon n="x" />
        </Button>
      </div>
      <div className="preview-doc artlist">
        {v.query && <p className="muted">Results for “{v.query}”</p>}
        {v.sources.map((s, i) => (
          <a key={i} className="srcitem" href={s.url} target="_blank" rel="noreferrer">
            <span className="srchost">
              <img
                src={`https://www.google.com/s2/favicons?domain=${host(s.url)}&sz=32`}
                alt=""
                width={16}
                height={16}
              />
              {host(s.url)}
            </span>
            <b>{s.title || s.url}</b>
            {s.snippet && <small>{s.snippet}</small>}
          </a>
        ))}
      </div>
    </>
  )
}

/** Real viewers: pdf.js for PDFs (and decks, via LibreOffice), docx-preview for Word files, a table for sheets. */
function DocBody({ kind, code }: { kind: DocKind; code: string }) {
  const [st, setSt] = useState<{ blob?: Blob; err?: string; fallback?: boolean } | null>(null)
  useEffect(() => {
    let dead = false
    setSt(null)
    ;(async () => {
      try {
        if (kind === 'pdf' || kind === 'docx') {
          const blob = await buildDoc(kind, code)
          if (!dead) setSt({ blob })
        } else if (kind === 'pptx') {
          const blob = await pptxPdf(code)
          if (!dead) setSt(blob ? { blob } : { fallback: true })
        } else if (!dead) setSt({ fallback: true })
      } catch (e) {
        if (!dead) setSt({ err: String((e as Error).message ?? e) })
      }
    })()
    return () => {
      dead = true
    }
  }, [kind, code])
  if (!st) return <div className="preview-doc muted">Building preview…</div>
  if (st.err)
    return (
      <div className="preview-doc">
        <p className="text-destructive">Could not build the file: {st.err}</p>
      </div>
    )
  if (st.fallback)
    return (
      <div className="preview-doc">
        <Markdown text={toPreviewMarkdown(kind, code)} />
      </div>
    )
  return kind === 'docx' ? <DocxViewer blob={st.blob!} /> : <PdfViewer blob={st.blob!} />
}

export function PreviewPane() {
  const { item, list, sources, full, setFull, close, showList } = usePreview()
  const { w, handle } = useResizable('preview-w', 560, 320, 1200)
  if (!item && !list && !sources) return null
  if (sources && !item)
    return (
      <aside className="preview" style={{ width: w }}>
        {handle}
        <SourcesList />
      </aside>
    )
  if (!item)
    return (
      <aside className="preview" style={{ width: w }}>
        {handle}
        <ArtifactList />
      </aside>
    )
  const doc = isDocKind(item.kind)
  const save = () => {
    if (isDocKind(item.kind)) return downloadDoc(item.kind, item.code)
    saveText(item, item.kind === 'file' || item.kind === 'image' ? item.title : undefined)
  }
  const srcDoc =
    item.kind === 'svg'
      ? `<body style="margin:0;display:grid;place-items:center;min-height:100vh">${item.code}</body>`
      : item.code
  return (
    <aside className={'preview' + (full ? ' full' : '')} style={full ? undefined : { width: w }}>
      {!full && handle}
      <div className="preview-head">
        <Button variant="ghost" size="icon" className="size-8" title="All artifacts" onClick={() => showList()}>
          <ArrowLeft size={16} />
        </Button>
        <b>{item.title}</b>
        <Button variant="ghost" size="sm" onClick={save}>
          <Icon n="download" /> Download
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title={full ? 'Exit full screen' : 'Full screen'}
          onClick={() => setFull(!full)}
        >
          {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </Button>
        <Button variant="ghost" size="icon" className="size-8" title="Close" onClick={close}>
          <Icon n="x" />
        </Button>
      </div>
      {item.kind === 'image' ? (
        <div className="preview-doc" style={{ display: 'grid', placeItems: 'center' }}>
          <img
            src={`data:image/png;base64,${item.code}`}
            alt={item.title}
            style={{ maxWidth: '100%', borderRadius: 8 }}
          />
        </div>
      ) : item.kind === 'file' ? (
        <div className="preview-doc">
          <pre className="pre" style={{ maxHeight: 'none' }}>
            {item.code}
          </pre>
        </div>
      ) : item.kind === 'html' || item.kind === 'svg' ? (
        <iframe title="Preview" sandbox="allow-scripts" srcDoc={srcDoc} />
      ) : doc ? (
        <DocBody kind={item.kind as DocKind} code={item.code} />
      ) : (
        <div className="preview-doc">
          <Markdown text={item.code} />
        </div>
      )}
    </aside>
  )
}
