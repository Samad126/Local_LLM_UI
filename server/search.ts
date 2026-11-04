import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

interface Hit { title: string; url: string; snippet: string }

async function ddg(q: string, n: number): Promise<Hit[]> {
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
  if (!hits.length && /anomaly|captcha|challenge/i.test(html)) throw new Error('DuckDuckGo is rate-limiting this IP. Try again shortly or use SearXNG.')
  return hits
}

async function searx(base: string, q: string, n: number): Promise<Hit[]> {
  const res = await fetch(`${base.replace(/\/$/, '')}/search?` + new URLSearchParams({ q, format: 'json' }), {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`SearXNG returned HTTP ${res.status} (is format=json enabled in its settings?)`)
  const d: any = await res.json()
  return (d.results ?? []).slice(0, n).map((r: any) => ({ title: r.title ?? '', url: r.url, snippet: r.content ?? '' }))
}

function isPrivate(ip: string) {
  return (
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip)
  )
}

async function readable(url: string, max: number) {
  const u = new URL(url)
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs')
  const ip = isIP(u.hostname) ? u.hostname : (await lookup(u.hostname)).address
  if (isPrivate(ip)) throw new Error('Refusing to fetch private address')
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain' }, redirect: 'follow', signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const type = res.headers.get('content-type') ?? ''
  if (!/text\/|html|json|xml/.test(type)) throw new Error('Unsupported content type ' + type)
  let html = (await res.text()).slice(0, 2_000_000)
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
  html = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  const main = html.match(/<(article|main)[\s\S]*?<\/\1>/i)?.[0] ?? html
  const text = decode(main.replace(/<\/(p|div|li|h\d|tr|br)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
  return { title, text: text.slice(0, max) }
}

function send(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? '', 'http://x')
  if (!url.pathname.startsWith('/api/web/')) return next()
  try {
    if (url.pathname === '/api/web/search') {
      const q = url.searchParams.get('q')?.trim()
      if (!q) return send(res, 400, { error: 'missing q' })
      const n = Math.min(Number(url.searchParams.get('n') ?? 5) || 5, 15)
      const searxUrl = url.searchParams.get('searx')
      const results = searxUrl ? await searx(searxUrl, q, n) : await ddg(q, n)
      return send(res, 200, { results })
    }
    if (url.pathname === '/api/web/fetch') {
      const target = url.searchParams.get('url')
      if (!target) return send(res, 400, { error: 'missing url' })
      const max = Math.min(Number(url.searchParams.get('max') ?? 4000) || 4000, 20000)
      return send(res, 200, await readable(target, max))
    }
    send(res, 404, { error: 'not found' })
  } catch (e: any) {
    send(res, 502, { error: e?.message ?? String(e) })
  }
}

export function webSearch(): Plugin {
  return {
    name: 'web-search',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  }
}
