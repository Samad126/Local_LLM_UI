import { useMemo, useState } from 'react'
import { slashSegments } from '@/lib/slash'
import type { Prompt } from '@/types'

const MAX_ITEMS = 6

/** A `/word` being typed at the end of the draft opens the saved-prompt menu; picking one inserts `/name `. */
export function useSlashMenu(draft: string, prompts: Prompt[], setDraft: (s: string) => void) {
  const [sel, setSel] = useState(0)
  const tok = /(^|\s)\/([\w-]*)$/.exec(draft)
  const query = tok?.[2].toLowerCase()
  const items = useMemo(
    () => (query === undefined ? [] : prompts.filter((p) => p.name.toLowerCase().includes(query)).slice(0, MAX_ITEMS)),
    [query, prompts],
  )
  const names = useMemo(() => prompts.map((p) => p.name), [prompts])
  const segments = useMemo(() => slashSegments(draft, names), [draft, names])
  const pick = (name: string) => {
    if (tok) setDraft(draft.slice(0, tok.index + tok[1].length) + '/' + name + ' ')
  }
  return { items, sel, setSel, pick, segments, open: items.length > 0 }
}
