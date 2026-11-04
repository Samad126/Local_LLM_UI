import { useContext, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePreview } from '@/stores/previewStore'
import { buildDoc, docName, saveBlob, type DocKind } from '@/lib/docs'
import { LiveCtx } from './LiveContext'

const KIND_ICON: Record<DocKind, string> = { pdf: 'PDF', docx: 'DOC', xlsx: 'XLS', pptx: 'PPT' }

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
          if (st.blob) saveBlob(kind, src, st.blob)
        }}
      >
        Download
      </Button>
    </div>
  )
}
