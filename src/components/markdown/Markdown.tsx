import { memo, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { normalizeFences } from '@/lib/docs'
import type { Source } from '@/types'
import { LiveCtx } from './LiveContext'
import { NO_SOURCES, PLAIN_COMPONENTS, linkCitations, makeComponents } from './citations'

const REMARK = [remarkGfm, remarkMath]
// No language auto-detection: it is very slow and only fenced languages are highlighted.
const REHYPE: any[] = [rehypeKatex, [rehypeHighlight, { detect: false, ignoreMissing: true }]]

/** While streaming, re-parse markdown at most every 150ms instead of on every token flush. */
function useThrottled(text: string, live: boolean) {
  const [v, setV] = useState(text)
  const last = useRef(0)
  useEffect(() => {
    if (!live) {
      setV(text)
      return
    }
    const wait = last.current + 150 - Date.now()
    if (wait <= 0) {
      last.current = Date.now()
      setV(text)
      return
    }
    // Fire at the end of the window with the newest text; new tokens must not reset this timer.
    const t = setTimeout(() => {
      last.current = Date.now()
      setV(text)
    }, wait)
    return () => clearTimeout(t)
  }, [text, live])
  return live ? v : text
}

export const Markdown = memo(function Markdown({
  text,
  live = false,
  sources = NO_SOURCES,
}: {
  text: string
  live?: boolean
  sources?: Source[]
}) {
  const raw = useThrottled(text, live)
  const shown = useMemo(() => linkCitations(normalizeFences(raw), sources.length), [raw, sources])
  const components = useMemo(() => (sources.length ? makeComponents(sources) : PLAIN_COMPONENTS), [sources])
  return (
    <div className="md">
      <LiveCtx.Provider value={live}>
        <ReactMarkdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={components}>
          {shown}
        </ReactMarkdown>
      </LiveCtx.Provider>
    </div>
  )
})
