import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

export type Next = () => void
export type Handler = (req: IncomingMessage, res: ServerResponse, next: Next) => void | Promise<void>

export function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function sendText(res: ServerResponse, code: number, text: string): void {
  res.statusCode = code
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(text)
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Read the whole body as bytes, refusing anything over `max`. Decoding happens once, so multi-byte chars are safe. */
export async function readBuffer(req: IncomingMessage, max: number): Promise<Buffer> {
  const parts: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const b = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer)
    size += b.length
    if (size > max) {
      req.destroy()
      throw new HttpError(413, 'Request too large')
    }
    parts.push(b)
  }
  return Buffer.concat(parts)
}

export async function readJson<T = Record<string, unknown>>(req: IncomingMessage, max = 5_000_000): Promise<T> {
  const raw = (await readBuffer(req, max)).toString('utf8')
  if (!raw) return {} as T
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/
const isLoopbackHost = (h?: string) => !!h && LOOPBACK.test(h)

/**
 * Only accept requests addressed to a loopback host from a loopback (or absent) origin.
 * This blocks LAN access and DNS rebinding for endpoints that run commands or fetch URLs.
 */
export function isLoopbackRequest(req: IncomingMessage): boolean {
  if (!isLoopbackHost(req.headers.host)) return false
  const origin = req.headers.origin
  return !origin || isLoopbackHost(origin.replace(/^https?:\/\//, ''))
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Mount `handler` for paths under `prefix` on both the dev and the preview server. */
export function middlewarePlugin(name: string, prefix: string, handler: Handler): Plugin {
  const mw = (req: IncomingMessage, res: ServerResponse, next: Next) => {
    if (!(req.url ?? '').startsWith(prefix)) return next()
    Promise.resolve(handler(req, res, next)).catch((e: unknown) => {
      if (res.headersSent) return void res.end()
      sendJson(res, e instanceof HttpError ? e.status : 500, { error: errorMessage(e) })
    })
  }
  return {
    name,
    configureServer: (s) => void s.middlewares.use(mw),
    configurePreviewServer: (s) => void s.middlewares.use(mw),
  }
}
