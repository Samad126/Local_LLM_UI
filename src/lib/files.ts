import type { Attachment } from '../types'

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|scss|js|jsx|ts|tsx|mjs|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|bash|zsh|sql|yaml|yml|toml|ini|cfg|conf|env|log|tex|rst|swift|lua|r|dart|vue|svelte)$/i

export const isImage = (f: File) => f.type.startsWith('image/')
export const isSupportedDoc = (f: File) => f.type === 'application/pdf' || f.type.startsWith('text/') || TEXT_EXT.test(f.name) || f.type === 'application/json'

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const c = await (await pdf.getPage(i)).getTextContent()
    pages.push(`--- page ${i} ---\n` + c.items.map((it: any) => it.str + (it.hasEOL ? '\n' : '')).join(' '))
  }
  return pages.join('\n\n')
}

export async function readDoc(file: File): Promise<Attachment> {
  const text = file.type === 'application/pdf' ? await pdfText(file) : await file.text()
  if (!text.trim()) throw new Error(`${file.name}: no readable text (scanned PDF?)`)
  return { name: file.name, text, size: file.size }
}

export function filesPrefix(files?: Attachment[]) {
  if (!files?.length) return ''
  return files.map((f) => f.kind === 'quote'
    ? `<quoted_excerpt note="The user is replying to this excerpt of the earlier conversation">\n${f.text}\n</quoted_excerpt>`
    : `<document name="${f.name}">\n${f.text}\n</document>`).join('\n\n') + '\n\n'
}

export const approxTokens = (s: string) => Math.ceil(s.length / 3.6)
