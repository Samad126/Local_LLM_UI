import type { DocKind } from './kinds'
import { cleanDoc } from './markdown'

export function docName(kind: DocKind, text: string) {
  const first =
    cleanDoc(text)
      .split('\n')
      .find((l) => l.trim()) ?? ''
  const base = (kind === 'xlsx' ? '' : first.replace(/^#{1,3}\s+/, '').replace(/[*_`]/g, '')) || 'document'
  return (
    base
      .replace(/[^\w\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60)
      .toLowerCase() +
    '.' +
    kind
  )
}
