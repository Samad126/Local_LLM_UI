import { useEffect, useState } from 'react'
import { Markdown } from '@/components/markdown/Markdown'
import { DocxViewer, PdfViewer } from '@/components/preview/Viewers'
import { buildDoc, pptxPdf, toPreviewMarkdown, type DocKind } from '@/lib/docs'

/** Real viewers: pdf.js for PDFs (and decks, via LibreOffice), docx-preview for Word files, a table for sheets. */
export function DocBody({ kind, code }: { kind: DocKind; code: string }) {
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
