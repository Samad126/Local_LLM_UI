import { UA, type Hit } from './html'

interface SearxResult {
  title?: string
  url: string
  content?: string
}

export async function searxng(base: string, q: string, n: number): Promise<Hit[]> {
  const res = await fetch(`${base.replace(/\/$/, '')}/search?` + new URLSearchParams({ q, format: 'json' }), {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`SearXNG returned HTTP ${res.status} (is format=json enabled in its settings?)`)
  const d = (await res.json()) as { results?: SearxResult[] }
  return (d.results ?? []).slice(0, n).map((r) => ({ title: r.title ?? '', url: r.url, snippet: r.content ?? '' }))
}
