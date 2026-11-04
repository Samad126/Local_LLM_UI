import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { download } from '@/lib/util'
import { Button } from '@/components/ui/button'
import { usePreview } from '@/stores/previewStore'
import { normalizeFences, isDocKind, docName, buildDoc, saveBlob, type DocKind } from '@/lib/docs'

const EXT: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  python: 'py',
  py: 'py',
  html: 'html',
  css: 'css',
  json: 'json',
  bash: 'sh',
  sh: 'sh',
  shell: 'sh',
  zsh: 'sh',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yml',
  toml: 'toml',
  markdown: 'md',
  md: 'md',
  xml: 'xml',
  svg: 'svg',
  go: 'go',
  rust: 'rs',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  php: 'php',
  ruby: 'rb',
  swift: 'swift',
  kotlin: 'kt',
  csv: 'csv',
  text: 'txt',
  txt: 'txt',
  diff: 'diff',
  dockerfile: 'Dockerfile',
}
const MIME: Record<string, string> = {
  html: 'text/html',
  svg: 'image/svg+xml',
  json: 'application/json',
  css: 'text/css',
  csv: 'text/csv',
  md: 'text/markdown',
}
const PREVIEWABLE = new Set(['html', 'svg', 'markdown', 'md'])
const KIND_ICON: Record<DocKind, string> = { pdf: 'PDF', docx: 'DOC', xlsx: 'XLS', pptx: 'PPT' }

/** Pick a file name from a first-line hint like `// file: app.py` or `<!-- index.html -->`, else a generic one. */
function fileNameFor(code: string, lang?: string) {
  const hint = code.split('\n', 1)[0].match(/(?:file(?:name)?\s*[:=]\s*)?([\w./-]+\.[a-z0-9]{1,6})\b/i)
  if (hint && /^(\/\/|#|<!--|\/\*|--)/.test(code.trim()) && /file|\.[a-z]+/i.test(hint[0]))
    return hint[1].split('/').pop()!
  const ext = EXT[lang ?? ''] ?? lang ?? 'txt'
  return ext === 'Dockerfile' ? ext : `snippet.${ext}`
}

const LiveCtx = createContext(false)

/** Builds the file as soon as the text is complete (not while still streaming), so Download is instant. */
export function FileCard({ kind, src, live }: { kind: DocKind; src: string; live?: boolean }) {
  const open = usePreview((s) => s.open)
  const ctxLive = useContext(LiveCtx)
  const streaming = live ?? ctxLive
  const [st, setSt] = useState<{ state: 'building' | 'ready' | 'error'; blob?: Blob; err?: string }>({
    state: 'building',
  })
  useEffect(() => {
    if (streaming) {
      setSt({ state: 'building' })
      return
    }
    let dead = false
    setSt({ state: 'building' })
    buildDoc(kind, src).then(
      (blob) => !dead && setSt({ state: 'ready', blob }),
      (e) => !dead && setSt({ state: 'error', err: String(e?.message ?? e) }),
    )
    return () => {
      dead = true
    }
  }, [kind, src, streaming])
  const name = docName(kind, src)
  const kb = st.blob
    ? st.blob.size < 1024 * 1024
      ? `${Math.max(1, Math.round(st.blob.size / 1024))} KB`
      : `${(st.blob.size / 1048576).toFixed(1)} MB`
    : ''
  return (
    <div
      className={'filecard' + (streaming ? '' : ' clickable')}
      role="button"
      tabIndex={streaming ? -1 : 0}
      title={streaming ? undefined : 'Click to preview'}
      onClick={() => !streaming && open({ kind, code: src, title: name })}
      onKeyDown={(e) => {
        if (!streaming && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          open({ kind, code: src, title: name })
        }
      }}
    >
      <span className="fileicon">{KIND_ICON[kind]}</span>
      <div className="fileinfo">
        <b>{name}</b>
        <span className={st.state === 'error' ? 'text-destructive text-xs' : 'muted'}>
          {st.state === 'building'
            ? streaming
              ? 'Writing…'
              : 'Building file…'
            : st.state === 'error'
              ? `Build failed: ${st.err}`
              : `${kind.toUpperCase()} · ${kb}`}
        </span>
      </div>
      <Button
        size="sm"
        disabled={st.state !== 'ready'}
        onClick={(e) => {
          e.stopPropagation()
          st.blob && saveBlob(kind, src, st.blob)
        }}
      >
        Download
      </Button>
    </div>
  )
}

function Pre({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null)
  const open = usePreview((s) => s.open)
  const lang = String((children as any)?.props?.className ?? '').match(/language-([\w-]+)/)?.[1]
  const text = () => ref.current?.textContent ?? ''
  const flash = (b: HTMLElement, msg: string) => {
    const t = b.textContent
    b.textContent = msg
    setTimeout(() => (b.textContent = t), 1200)
  }

  if (isDocKind(lang)) {
    return (
      <>
        <FileCard kind={lang} src={String((children as any)?.props?.children ?? '')} />
        <pre ref={ref} hidden>
          {children}
        </pre>
      </>
    )
  }
  const canPreview = !!lang && PREVIEWABLE.has(lang)
  return (
    <div className="codeblock">
      <div className="codebar">
        <span>{lang ?? 'code'}</span>
        <span className="codeacts">
          {canPreview && (
            <button
              onClick={() =>
                open({ kind: lang === 'md' ? 'markdown' : (lang as any), code: text(), title: lang! + ' preview' })
              }
            >
              Preview
            </button>
          )}
          <button
            onClick={() => {
              const code = text()
              const name = fileNameFor(code, lang)
              download(name, code, (MIME[name.split('.').pop()!] ?? 'text/plain') + ';charset=utf-8')
            }}
          >
            Download
          </button>
          <button
            onClick={(e) => {
              navigator.clipboard.writeText(text())
              flash(e.currentTarget, 'Copied')
            }}
          >
            Copy
          </button>
        </span>
      </div>
      <pre ref={ref}>{children}</pre>
    </div>
  )
}

const REMARK = [remarkGfm, remarkMath]
// No language auto-detection: it is very slow and only fenced languages are highlighted.
const REHYPE: any[] = [rehypeKatex, [rehypeHighlight, { detect: false, ignoreMissing: true }]]
type Source = { title: string; url: string; snippet?: string }
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

/** Turn [1] / [1][4] markers into #cite-N links (outside code) so they can render as hoverable chips. */
function linkCitations(text: string, n: number) {
  if (!n) return text
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 ? part : part.replace(/\[(\d{1,2})\](?!\()/g, (m, d) => (+d >= 1 && +d <= n ? `[${d}](#cite-${d})` : m)),
    )
    .join('')
}

function makeComponents(sources: Source[]) {
  return {
    pre: Pre as any,
    a: ({ href, children, ...p }: any) => {
      const m = /^#cite-(\d+)$/.exec(href ?? '')
      const src = m && sources[+m[1] - 1]
      if (!src)
        return (
          <a {...p} href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        )
      return (
        <span className="cite">
          <a href={src.url} target="_blank" rel="noreferrer">
            {m![1]}
          </a>
          <a className="citecard" href={src.url} target="_blank" rel="noreferrer">
            <b>{src.title || host(src.url)}</b>
            <span className="muted">{host(src.url)}</span>
            {src.snippet && <span>{src.snippet.slice(0, 220)}</span>}
            <span className="citeurl">{src.url}</span>
          </a>
        </span>
      )
    },
  }
}
const NO_SOURCES: Source[] = []
const PLAIN = makeComponents(NO_SOURCES)

/** While streaming, re-parse markdown at most every 150ms instead of on every token flush. */
function useThrottled(text: string, live: boolean) {
  const [v, setV] = useState(text)
  const last = useRef(0)
  useEffect(() => {
    if (!live) {
      setV(text)
      return
    }
    const wait = last.current + 150 - Date.now()
    if (wait <= 0) {
      last.current = Date.now()
      setV(text)
      return
    }
    // Fire at the end of the window with the newest text; new tokens must not reset this timer.
    const t = setTimeout(() => {
      last.current = Date.now()
      setV(text)
    }, wait)
    return () => clearTimeout(t)
  }, [text, live])
  return live ? v : text
}

export const Markdown = memo(function Markdown({
  text,
  live = false,
  sources = NO_SOURCES,
}: {
  text: string
  live?: boolean
  sources?: Source[]
}) {
  const raw = useThrottled(text, live)
  const shown = useMemo(() => linkCitations(normalizeFences(raw), sources.length), [raw, sources])
  const components = useMemo(() => (sources.length ? makeComponents(sources) : PLAIN), [sources])
  return (
    <div className="md">
      <LiveCtx.Provider value={live}>
        <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={components}>
          {shown}
        </ReactMarkdown>
      </LiveCtx.Provider>
    </div>
  )
})
