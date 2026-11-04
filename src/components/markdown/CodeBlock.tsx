import { useRef } from 'react'
import { download } from '@/lib/download'
import { isDocKind } from '@/lib/docs'
import { usePreview } from '@/stores/previewStore'
import { FileCard } from './FileCard'

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

/** Pick a file name from a first-line hint like `// file: app.py` or `<!-- index.html -->`, else a generic one. */
function fileNameFor(code: string, lang?: string) {
  const hint = code.split('\n', 1)[0].match(/(?:file(?:name)?\s*[:=]\s*)?([\w./-]+\.[a-z0-9]{1,6})\b/i)
  if (hint && /^(\/\/|#|<!--|\/\*|--)/.test(code.trim()) && /file|\.[a-z]+/i.test(hint[0]))
    return hint[1].split('/').pop()!
  const ext = EXT[lang ?? ''] ?? lang ?? 'txt'
  return ext === 'Dockerfile' ? ext : `snippet.${ext}`
}

export function CodeBlock({ children }: { children?: React.ReactNode }) {
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
