import type { DocKind } from './kinds'
import { cleanDoc } from './markdown'

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else q = false
      } else cell += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

/** Markdown preview for any doc kind (xlsx is CSV → table). */
export function toPreviewMarkdown(kind: DocKind, text: string) {
  if (kind === 'pptx') return cleanDoc(text).replace(/^\s*---\s*$/gm, '\n---\n')
  if (kind !== 'xlsx') return cleanDoc(text)
  const rows = parseCsv(text)
  if (!rows.length) return ''
  const esc = (s: string) => s.replace(/\|/g, '\\|')
  return [
    `| ${rows[0].map(esc).join(' | ')} |`,
    `|${rows[0].map(() => '---').join('|')}|`,
    ...rows.slice(1).map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n')
}
