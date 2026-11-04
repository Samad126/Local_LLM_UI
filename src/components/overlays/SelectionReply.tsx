import { useEffect, useState } from 'react'
import { Reply } from 'lucide-react'
import { useComposerInbox } from '@/stores/composerStore'

/** Floating "Reply" button over any text selected inside a chat message; quotes it into the composer. */
export function SelectionReply() {
  const [pos, setPos] = useState<{ x: number; y: number; text: string } | null>(null)

  useEffect(() => {
    const read = () => {
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      const node = sel?.anchorNode
      const el = node && (node.nodeType === 1 ? (node as Element) : node.parentElement)
      if (!sel || sel.isCollapsed || !text || !el?.closest('.msg .body') || el.closest('textarea, input, .editbox'))
        return setPos(null)
      const r = sel.getRangeAt(0).getBoundingClientRect()
      if (!r.width && !r.height) return setPos(null)
      setPos({
        x: Math.min(Math.max(r.left + r.width / 2, 50), window.innerWidth - 50),
        y: Math.max(r.top - 8, 48),
        text,
      })
    }
    // Wait for mouse/keyboard to finish selecting so the button doesn't chase the drag.
    const up = () => setTimeout(read, 10)
    const hide = (e: Event) => {
      if (!(e.target as Element)?.closest?.('.selreply')) setPos(null)
    }
    document.addEventListener('mouseup', up)
    document.addEventListener('keyup', up)
    document.addEventListener('mousedown', hide)
    const clear = () => setPos(null)
    document.addEventListener('scroll', clear, true)
    return () => {
      document.removeEventListener('mouseup', up)
      document.removeEventListener('keyup', up)
      document.removeEventListener('mousedown', hide)
      document.removeEventListener('scroll', clear, true)
    }
  }, [])

  if (!pos) return null
  const reply = () => {
    useComposerInbox.getState().addQuote(pos.text)
    window.getSelection()?.removeAllRanges()
    setPos(null)
  }
  return (
    <button
      className="selreply"
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={reply}
    >
      <Reply size={14} /> Reply
    </button>
  )
}
