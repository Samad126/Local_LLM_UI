import { X } from 'lucide-react'
import type { Attachment } from '@/types'
import { useLightbox } from '@/stores/lightboxStore'

/** Compact preview card for a quoted reply, pasted text or document; removable when `onRemove` is given. */
export function AttachCard({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  const open = useLightbox((s) => s.open)
  const quote = a.kind === 'quote'
  const label = quote
    ? 'Reply'
    : a.kind === 'paste'
      ? 'Pasted'
      : (a.name.split('.').pop() ?? 'file').toUpperCase().slice(0, 5)
  return (
    <div
      className={'attachcard' + (quote ? ' quote' : '') + ' clickable'}
      title={quote ? 'Click to view' : a.name}
      onClick={() => open({ kind: quote ? 'quote' : 'text', title: quote ? 'Quoted reply' : a.name, body: a.text })}
    >
      {quote ? (
        <p className="quotetext">{a.text}</p>
      ) : (
        <>
          <b className="attachname">{a.name}</b>
          <p className="attachtext">{a.text}</p>
          <span className="attachtag">{label}</span>
        </>
      )}
      {onRemove && (
        <button
          className="attachx"
          title="Remove"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
