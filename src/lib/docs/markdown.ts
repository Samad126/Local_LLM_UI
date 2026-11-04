import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

export type Node = any

/** Models sometimes emit raw HTML (<details>, <strong>…) in documents; turn it into plain markdown. */
export const cleanDoc = (md: string) =>
  md
    .replace(/<\/?(strong|b)>/gi, '**')
    .replace(/<\/?(em|i)>/gi, '*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(details|summary|div|span|p|u|font|center)\b[^>]*>/gi, '')
export const parse = (md: string): Node => unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(cleanDoc(md))
export const plain = (n: Node): string => n.value ?? (n.children ?? []).map(plain).join('')
