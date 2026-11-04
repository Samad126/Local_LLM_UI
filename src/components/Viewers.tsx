import { useEffect, useRef, useState } from 'react'

/** Renders every page of a PDF blob with pdf.js, fitted to the panel width. */
export function PdfViewer({ blob }: { blob: Blob }) {
  const box = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState(0)
  const [err, setErr] = useState('')
  useEffect(() => {
    let dead = false
    let doc: any
    let timer = 0
    const render = async () => {
      const el = box.current; if (!el || !doc) return
      const width = el.clientWidth - 32
      if (width < 50) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const frag: HTMLElement[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i); if (dead) return
        const base = page.getViewport({ scale: 1 })
        const vp = page.getViewport({ scale: (width / base.width) * dpr })
        const c = document.createElement('canvas')
        c.width = vp.width; c.height = vp.height; c.style.width = width + 'px'; c.style.height = vp.height / dpr + 'px'
        c.className = 'pdfpage'
        await page.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: vp }).promise
        frag.push(c)
      }
      if (!dead) el.replaceChildren(...frag)
    }
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
        if (dead) return
        setPages(doc.numPages); await render()
      } catch (e) { if (!dead) setErr(String((e as Error).message ?? e)) }
    })()
    const ro = new ResizeObserver(() => { clearTimeout(timer); timer = window.setTimeout(render, 250) })
    if (box.current) ro.observe(box.current)
    return () => { dead = true; ro.disconnect(); clearTimeout(timer) }
  }, [blob])
  return (
    <div className="viewer">
      <div className="viewer-bar">{err ? 'Could not render PDF' : pages ? `${pages} page${pages > 1 ? 's' : ''}` : 'Rendering…'}</div>
      <div className="viewer-scroll" ref={box}>{err && <p className="muted">{err}</p>}</div>
    </div>
  )
}

/** Renders a .docx blob the way Word lays it out (pages, tables, images). */
export function DocxViewer({ blob }: { blob: Blob }) {
  const box = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let dead = false
    // Word pages are fixed-width; scale them down to the panel instead of scrolling sideways.
    const fit = () => {
      const el = box.current; const page = el?.querySelector<HTMLElement>('section.docx')
      if (!el || !page) return
      ;(el.querySelector('.docx-wrapper') as HTMLElement).style.zoom = String(Math.min(1, (el.clientWidth - 24) / page.offsetWidth))
    }
    const ro = new ResizeObserver(fit); if (box.current) ro.observe(box.current)
    ;(async () => {
      try {
        const { renderAsync } = await import('docx-preview')
        if (dead || !box.current) return
        box.current.replaceChildren()
        await renderAsync(blob, box.current, undefined, { inWrapper: true, ignoreWidth: false, breakPages: true, className: 'docx' })
        fit()
      } catch (e) { if (!dead) setErr(String((e as Error).message ?? e)) }
    })()
    return () => { dead = true; ro.disconnect() }
  }, [blob])
  return (
    <div className="viewer">
      <div className="viewer-bar">{err ? 'Could not render document' : 'Word document'}</div>
      <div className="viewer-scroll docxwrap" ref={box}>{err && <p className="muted">{err}</p>}</div>
    </div>
  )
}
