import { useApp } from '../appStore'

export interface Source { title: string; url: string; snippet?: string; text?: string }

async function get<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api/web/${path}?` + new URLSearchParams(params), { signal })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
  return d
}

export async function webSearch(query: string, signal?: AbortSignal): Promise<Source[]> {
  const a = useApp.getState()
  const params: Record<string, string> = { q: query, n: String(a.searchResults) }
  if (a.searchEngine === 'searxng') params.searx = a.searxUrl
  const { results } = await get<{ results: Source[] }>('search', params, signal)
  if (a.searchFetchPages) {
    await Promise.all(results.map(async (r) => {
      try {
        r.text = (await get<{ text: string }>('fetch', { url: r.url, max: String(a.searchPageChars) }, signal)).text
      } catch { /* fall back to snippet */ }
    }))
  }
  return results
}

/** Auto mode: search only when the prompt needs fresh or external facts (no extra model call). */
export function shouldSearch(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (t.length < 8 || t.startsWith('/')) return false
  if (/\b(search|google|look ?up|browse|web ?search|find online|on the (web|internet))\b/.test(t)) return true
  if (/\b(latest|newest|recent(ly)?|today|tonight|yesterday|this (week|month|year)|right now|currently|breaking|news|headlines|score|weather|forecast|stock|price of|exchange rate|release date|released|who won|trending)\b/.test(t)) return true
  if (/\b(20(2[4-9]|3\d))\b/.test(t)) return true
  if (/https?:\/\//.test(t)) return false
  return false
}

export function buildContext(query: string, sources: Source[]) {
  const today = new Date().toISOString().slice(0, 10)
  const body = sources.map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.text || s.snippet || ''}`).join('\n\n')
  return `Today's date: ${today}\nWeb search results for "${query}":\n\n${body}\n\nUse these results to answer the question below. Cite sources inline as [1], [2]. If they don't contain the answer, say so.\n\nQuestion: `
}
