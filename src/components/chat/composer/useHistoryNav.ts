import { useEffect, useRef } from 'react'

/** Up/Down in the composer walks back through messages previously sent in this chat. */
export function useHistoryNav(chatId: string | null, draft: string, setDraft: (s: string) => void, sent: string[]) {
  const idx = useRef(-1)
  const saved = useRef('')
  useEffect(() => {
    idx.current = -1
  }, [chatId])

  /** Move through history; returns whether the key press was consumed. */
  const walk = (dir: -1 | 1): boolean => {
    if (!sent.length) return false
    if (dir === -1) {
      if (idx.current === -1) {
        saved.current = draft
        idx.current = sent.length - 1
      } else if (idx.current > 0) idx.current--
      else return true
    } else {
      if (idx.current === -1) return false
      idx.current++
    }
    if (idx.current >= sent.length) {
      idx.current = -1
      setDraft(saved.current)
    } else setDraft(sent[idx.current])
    return true
  }
  return { walk, browsing: () => idx.current !== -1, reset: () => (idx.current = -1) }
}
