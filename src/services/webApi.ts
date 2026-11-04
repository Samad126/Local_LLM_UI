import { useApp } from '@/stores/settingsStore'

import type { Source } from '@/types'

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
    await Promise.all(
      results.map(async (r) => {
        try {
          r.text = (await get<{ text: string }>('fetch', { url: r.url, max: String(a.searchPageChars) }, signal)).text
        } catch {
          /* fall back to snippet */
        }
      }),
    )
  }
  return results
}
