import { isDocKind } from './kinds'

/**
 * A pdf/docx/pptx/xlsx block often contains its own ```python blocks, which would end the outer fence early and
 * spill the rest of the document into the chat. Track nesting and widen the outer fence (````) so it stays one block.
 */
export function normalizeFences(text: string): string {
  if (!/```(pdf|docx|pptx|xlsx)/.test(text)) return text
  const lines = text.split('\n')
  let start = -1,
    depth = 0,
    inner = 3
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(`{3,})([\w-]*)\s*$/.exec(lines[i])
    if (!m) continue
    if (start < 0) {
      if (isDocKind(m[2]) && m[1].length === 3) {
        start = i
        depth = 0
        inner = 3
      }
      continue
    }
    inner = Math.max(inner, m[1].length)
    if (m[2]) depth++
    else if (depth > 0) depth--
    else {
      const fence = '`'.repeat(inner + 1)
      lines[start] = lines[start].replace(/`{3,}/, fence)
      lines[i] = fence
      start = -1
    }
  }
  if (start >= 0) lines[start] = lines[start].replace(/`{3,}/, '`'.repeat(inner + 1))
  return lines.join('\n')
}
