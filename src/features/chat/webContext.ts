import type { Source } from '@/types'
import { useApp } from '@/stores/settingsStore'
import { webSearch } from '@/services/webApi'
import { searchQueryPrompt } from './prompts'
import { quickChat } from './quickChat'
import type { ChatHost } from './host'
import type { Message } from '@/types'
import type { OllamaMessage } from '@/types/ollama'

/** Auto mode: search only when the prompt needs fresh or external facts (no extra model call). */
export function shouldSearch(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t.length < 8 || t.startsWith('/')) return false
  if (/\b(search|google|look ?up|browse|web ?search|find online|on the (web|internet))\b/.test(t)) return true
  if (
    /\b(latest|newest|recent(ly)?|today|tonight|yesterday|this (week|month|year)|right now|currently|breaking|news|headlines|score|weather|forecast|stock|price of|exchange rate|release date|released|who won|trending)\b/.test(
      t,
    )
  )
    return true
  if (/\b(20(2[4-9]|3\d))\b/.test(t)) return true
  if (/https?:\/\//.test(t)) return false
  return false
}

export function buildContext(query: string, sources: Source[]) {
  const today = new Date().toISOString().slice(0, 10)
  const body = sources.map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.text || s.snippet || ''}`).join('\n\n')
  return `Today's date: ${today}\nWeb search results for "${query}":\n\n${body}\n\nUse these results to answer the question below. Cite sources inline as [1], [2]. If they don't contain the answer, say so.\n\nQuestion: `
}

export interface WebResult {
  sources?: Message['sources']
  searchQuery?: string
  searchError?: string
  /** The user stopped the run while the search was in flight. */
  aborted?: boolean
}

interface WebInput {
  host: ChatHost
  model: string
  keepAlive: string
  history: Message[]
  /** The request messages; the last user message is rewritten in place to carry the results. */
  msgs: OllamaMessage[]
  signal: AbortSignal
}

/** Run the web search for the latest user message and prepend the results to it. */
export async function applyWebContext({ host, model, keepAlive, history, msgs, signal }: WebInput): Promise<WebResult> {
  const lastUser = msgs.map((m) => m.role).lastIndexOf('user')
  if (lastUser < 0) return {}
  const app = useApp.getState()
  const userTurns = history.filter((m) => m.role === 'user')
  let searchQuery: string | undefined
  try {
    let q = msgs[lastUser].content.trim()
    if (app.searchRewrite && userTurns.length > 1) {
      host.setStatus('Writing search query…')
      const convo = history
        .slice(-6)
        .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
        .join('\n')
      const rq = await quickChat({
        model,
        keepAlive,
        meta: host.meta(model),
        prompt: searchQueryPrompt(convo),
        numPredict: 40,
        numCtx: 4096,
        temperature: 0,
      })
        .then((t) => t.replace(/["\n]/g, ' ').trim())
        .catch(() => '')
      if (rq) q = rq
    }
    q = q.slice(0, 250)
    searchQuery = q
    host.setStatus(`Searching the web for “${q.slice(0, 60)}”…`)
    const found = await webSearch(q, signal)
    host.setStatus('')
    if (!found.length) return { searchQuery, searchError: 'Web search returned no results.' }
    msgs[lastUser] = { ...msgs[lastUser], content: buildContext(q, found) + msgs[lastUser].content }
    return { searchQuery, sources: found.map(({ title, url, snippet }) => ({ title, url, snippet })) }
  } catch (e) {
    host.setStatus('')
    if (e instanceof Error && e.name === 'AbortError') return { aborted: true }
    return { searchQuery, searchError: 'Web search failed: ' + (e instanceof Error ? e.message : String(e)) }
  }
}
