/** Some models (even with thinking off) put their reasoning in the reply, ending with </think>. Split it out. */
export function splitThink(raw: string): { content: string; think: string } {
  const close = raw.indexOf('</think>')
  if (close >= 0)
    return { think: raw.slice(0, close).replace(/^\s*<think>/, ''), content: raw.slice(close + 8).replace(/^\s+/, '') }
  const open = raw.indexOf('<think>')
  if (open >= 0) return { think: raw.slice(open + 7), content: raw.slice(0, open) }
  return { content: raw, think: '' }
}
