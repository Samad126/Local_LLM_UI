import type { Chat } from '@/types'
import type { PreviewItem } from '@/stores/previewStore'
import { docName, isDocKind, normalizeFences } from '@/lib/docs'
import { fileIntent } from '@/features/chat/fileIntent'

export type Artifact = PreviewItem & { id: string }

const KINDS = new Set(['html', 'svg', 'markdown', 'md', 'pdf', 'docx', 'xlsx', 'pptx'])

const GENERIC = new Set(['markdown', 'md', 'text', 'txt', ''])

/** The document inside a reply: the biggest fenced block (models often wrap it as ```markdown), else the whole reply. */
export function docSource(content: string): string {
  let best = ''
  for (const m of content.matchAll(/```([\w-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g))
    if (GENERIC.has(m[1].toLowerCase()) && m[2].length > best.length) best = m[2]
  return best.trim() ? best : content
}

/** Everything previewable/downloadable in a chat: html/svg/markdown blocks and generated pdf/docx/xlsx files. */
export function chatArtifacts(chat: Chat): Artifact[] {
  const out: Artifact[] = []
  chat.messages.forEach((m, mi) => {
    if (m.role === 'user') {
      m.files?.forEach(
        (f, i) => f.kind !== 'quote' && out.push({ id: `${m.id}:f${i}`, kind: 'file', code: f.text, title: f.name }),
      )
      m.images?.forEach((b64, i) =>
        out.push({ id: `${m.id}:i${i}`, kind: 'image', code: b64, title: `image-${i + 1}.png` }),
      )
      return
    }
    if (m.role !== 'assistant' || !m.content) return
    let found = false,
      k = 0
    const intent = fileIntent(chat.messages[mi - 1]?.role === 'user' ? chat.messages[mi - 1].content : '')
    for (const match of normalizeFences(m.content).matchAll(/(`{3,})([\w-]+)[^\n]*\n([\s\S]*?)\n?\1(?!`)/g)) {
      const lang = match[2].toLowerCase()
      if (!KINDS.has(lang)) continue
      found = true
      const kind = (intent && GENERIC.has(lang) ? intent : lang === 'md' ? 'markdown' : lang) as PreviewItem['kind']
      out.push({
        id: `${m.id}:${k++}`,
        kind,
        code: match[3],
        title: isDocKind(kind) ? docName(kind, match[3]) : `${kind} preview`,
      })
    }
    if (!found) {
      if (intent) {
        const code = docSource(m.content)
        out.push({ id: `${m.id}:doc`, kind: intent, code, title: docName(intent, code) })
      }
    }
  })
  return out
}
