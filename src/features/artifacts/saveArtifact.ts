import { download, saveBase64Image } from '@/lib/download'

/** Save a non-document artifact (uploaded file/image, html, svg, markdown) to disk. */
export function saveArtifact(a: { kind: string; code: string; title?: string }, name?: string) {
  if (a.kind === 'file') return download(name ?? a.title ?? 'file.txt', a.code, 'text/plain;charset=utf-8')
  if (a.kind === 'image') return saveBase64Image(a.code, name ?? a.title ?? 'image.png')
  const ext = a.kind === 'markdown' ? 'md' : a.kind
  const type = a.kind === 'html' ? 'text/html' : a.kind === 'svg' ? 'image/svg+xml' : 'text/markdown'
  download(name ?? `preview.${ext}`, a.code, type)
}
