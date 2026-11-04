import type { Prompt } from '../types'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const matcher = (names: string[]) => (names.length ? new RegExp(`(^|\\s)(/(?:${names.map(esc).sort((a, b) => b.length - a.length).join('|')}))(?=\\s|$)`, 'g') : null)

/** Replace every `/prompt-name` in the text with that saved prompt's text (what the model actually sees). */
export function expandSlash(text: string, prompts: Prompt[]): string {
  const re = matcher(prompts.map((p) => p.name))
  if (!re || !text.includes('/')) return text
  const by = new Map(prompts.map((p) => ['/' + p.name, p.text]))
  return text.replace(re, (_m, pre, cmd) => pre + (by.get(cmd) ?? cmd))
}

/** Split text into plain and `/command` segments, for blue highlighting. */
export function slashSegments(text: string, names: string[]): { text: string; cmd: boolean }[] {
  const re = matcher(names)
  if (!re || !text.includes('/')) return [{ text, cmd: false }]
  const out: { text: string; cmd: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const start = (m.index ?? 0) + m[1].length
    if (start > last) out.push({ text: text.slice(last, start), cmd: false })
    out.push({ text: m[2], cmd: true }); last = start + m[2].length
  }
  if (last < text.length) out.push({ text: text.slice(last), cmd: false })
  return out
}
