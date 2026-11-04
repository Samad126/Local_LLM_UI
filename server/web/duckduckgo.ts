import { decode, strip, UA, type Hit } from './html'

export async function duckDuckGo(q: string, n: number): Promise<Hit[]> {
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ q }),
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`DuckDuckGo returned HTTP ${res.status}`)
  const html = await res.text()
  const hits: Hit[] = []
  for (const chunk of html.split(/(?=<a[^>]+class="result__a")/).slice(1)) {
    const m = chunk.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    if (!m) continue
    let url = decode(m[1])
    const u = url.match(/[?&]uddg=([^&]+)/)
    if (u) url = decodeURIComponent(u[1])
    else if (url.startsWith('//')) url = 'https:' + url
    if (!/^https?:/.test(url) || url.includes('duckduckgo.com/y.js')) continue
    const sn = chunk.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
    hits.push({ title: strip(m[2]), url, snippet: strip(sn?.[1] ?? '') })
    if (hits.length >= n) break
  }
  if (!hits.length && /anomaly|captcha|challenge/i.test(html))
    throw new Error('DuckDuckGo is rate-limiting this IP. Try again shortly or use SearXNG.')
  return hits
}
