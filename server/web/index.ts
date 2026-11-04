import { errorMessage, isLoopbackRequest, middlewarePlugin, sendJson } from '../http'
import { duckDuckGo } from './duckduckgo'
import { readable } from './readable'
import { searxng } from './searxng'

export const webSearch = () =>
  middlewarePlugin('web-search', '/api/web/', async (req, res) => {
    if (!isLoopbackRequest(req)) return sendJson(res, 403, { error: 'forbidden' })
    const url = new URL(req.url ?? '', 'http://x')
    const param = (k: string) => url.searchParams.get(k)
    try {
      if (url.pathname === '/api/web/search') {
        const q = param('q')?.trim()
        if (!q) return sendJson(res, 400, { error: 'missing q' })
        const n = Math.min(Number(param('n') ?? 5) || 5, 15)
        const searx = param('searx')
        return sendJson(res, 200, { results: searx ? await searxng(searx, q, n) : await duckDuckGo(q, n) })
      }
      if (url.pathname === '/api/web/fetch') {
        const target = param('url')
        if (!target) return sendJson(res, 400, { error: 'missing url' })
        const max = Math.min(Number(param('max') ?? 4000) || 4000, 20000)
        return sendJson(res, 200, await readable(target, max))
      }
      sendJson(res, 404, { error: 'not found' })
    } catch (e) {
      sendJson(res, 502, { error: errorMessage(e) })
    }
  })
