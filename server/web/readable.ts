import { decode, strip, UA } from './html'
import { assertPublicUrl } from './ssrf'

const MAX_REDIRECTS = 5

/** Fetch with manual redirects so every hop is checked against the private-address rules. */
async function fetchPublic(url: string): Promise<Response> {
  let target = new URL(url)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(target)
    const res = await fetch(target, {
      headers: { 'User-Agent': UA, Accept: 'text/html,text/plain' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    })
    const loc = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && loc) {
      target = new URL(loc, target)
      continue
    }
    return res
  }
  throw new Error('Too many redirects')
}

export async function readable(url: string, max: number) {
  const res = await fetchPublic(url)
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
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
  return { title, text: text.slice(0, max) }
}
