// Turns model-written markdown/CSV into downloadable pdf / docx / xlsx / pptx files, entirely in the browser.
import { officeToPdf } from '@/services/convertApi'
import { saveBlob as saveBlobAs } from '@/lib/download'
import { buildDocx } from './docx'
import { buildPdf } from './pdf'
import { buildPptx } from './pptx'
import { buildXlsx } from './xlsx'
import { docName } from './names'
import type { DocKind } from './kinds'

export { DOC_KINDS, isDocKind, type DocKind } from './kinds'
export { normalizeFences } from './fences'
export { latexToText } from './math'
export { cleanDoc } from './markdown'
export { docName } from './names'
export { parseCsv, toPreviewMarkdown } from './csv'

const MAX_CACHED = 12
const docCache = new Map<string, Promise<Blob>>()

/** Build (and memoize) a file so the card, preview and download share one result. */
export function buildDoc(kind: DocKind, text: string): Promise<Blob> {
  const key = kind + '\0' + text
  let p = docCache.get(key)
  if (!p) {
    p =
      kind === 'pdf'
        ? buildPdf(text, () => buildDoc('docx', text))
        : kind === 'docx'
          ? buildDocx(text)
          : kind === 'pptx'
            ? buildPptx(text)
            : buildXlsx(text)
    p.catch(() => docCache.delete(key))
    docCache.set(key, p)
    if (docCache.size > MAX_CACHED) docCache.delete(docCache.keys().next().value!)
  }
  return p
}

/** PDF rendition of a deck, for the viewer. */
export async function pptxPdf(text: string): Promise<Blob | null> {
  return officeToPdf(await buildDoc('pptx', text), 'pptx')
}

export const saveBlob = (kind: DocKind, text: string, blob: Blob) => saveBlobAs(docName(kind, text), blob)

export async function downloadDoc(kind: DocKind, text: string) {
  saveBlob(kind, text, await buildDoc(kind, text))
}
