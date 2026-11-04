import { CodeBlock } from './CodeBlock'
import { hostname } from '@/lib/url'
import type { Source } from '@/types'

/** Turn [1] / [1][4] markers into #cite-N links (outside code) so they can render as hoverable chips. */
export function linkCitations(text: string, n: number) {
  if (!n) return text
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 ? part : part.replace(/\[(\d{1,2})\](?!\()/g, (m, d) => (+d >= 1 && +d <= n ? `[${d}](#cite-${d})` : m)),
    )
    .join('')
}

export function makeComponents(sources: Source[]) {
  return {
    pre: CodeBlock as any,
    a: ({ href, children, ...p }: any) => {
      const m = /^#cite-(\d+)$/.exec(href ?? '')
      const src = m && sources[+m[1] - 1]
      if (!src)
        return (
          <a {...p} href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        )
      return (
        <span className="cite">
          <a href={src.url} target="_blank" rel="noreferrer">
            {m![1]}
          </a>
          <a className="citecard" href={src.url} target="_blank" rel="noreferrer">
            <b>{src.title || hostname(src.url)}</b>
            <span className="muted">{hostname(src.url)}</span>
            {src.snippet && <span>{src.snippet.slice(0, 220)}</span>}
            <span className="citeurl">{src.url}</span>
          </a>
        </span>
      )
    },
  }
}
export const NO_SOURCES: Source[] = []
export const PLAIN_COMPONENTS = makeComponents(NO_SOURCES)
