import { useState } from 'react'
import { approxTokens, fileToBase64, isImage, isSupportedDoc, readDoc } from '@/lib/files'
import type { Attachment } from '@/types'

const PASTE_CHARS = 1500
const PASTE_LINES = 25

/** Pending images and documents for the message being written, plus the errors from adding them. */
export function useAttachments(vision: boolean) {
  const [images, setImages] = useState<string[]>([])
  const [docs, setDocs] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

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
    if (rest.length > ok.length) {
      const bad = rest.filter((f) => !isSupportedDoc(f)).map((f) => f.name)
      setErr(`Unsupported: ${bad.join(', ')} (use text, code, or PDF)`)
    }
    if (!ok.length) return
    setBusy(true)
    for (const f of ok) {
      try {
        const d = await readDoc(f)
        setDocs((p) => [...p, d])
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      }
    }
    setBusy(false)
  }

  const addQuote = (text: string) => setDocs((p) => [...p, { name: 'Reply', text, size: text.length, kind: 'quote' }])

  /** Long pastes become an attachment (like claude.ai) instead of flooding the box. Returns true when handled. */
  const addPaste = (text: string): boolean => {
    if (text.length < PASTE_CHARS && text.split('\n').length < PASTE_LINES) return false
    const n = docs.filter((d) => d.kind === 'paste').length + 1
    setDocs((p) => [...p, { name: `Pasted text${n > 1 ? ' ' + n : ''}`, text, size: text.length, kind: 'paste' }])
    return true
  }

  const clear = () => {
    setImages([])
    setDocs([])
  }

  return {
    images,
    docs,
    busy,
    err,
    setErr,
    addFiles,
    addQuote,
    addPaste,
    clear,
    removeDoc: (i: number) => setDocs((p) => p.filter((_, k) => k !== i)),
    removeImage: (i: number) => setImages((p) => p.filter((_, k) => k !== i)),
    isEmpty: !images.length && !docs.length,
    docTokens: docs.reduce((n, d) => n + approxTokens(d.text), 0),
  }
}
