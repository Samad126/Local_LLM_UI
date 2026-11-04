import { promises as fs } from 'node:fs'
import path from 'node:path'
import { errorMessage, isLoopbackRequest, middlewarePlugin, readJson, sendJson } from '../http'
import { runTool } from './tools'

interface AgentBody {
  workspace?: unknown
  name?: unknown
  args?: Record<string, unknown>
}

export const agent = () =>
  middlewarePlugin('agent', '/api/agent/', async (req, res) => {
    // Shell access: also require the custom header so a plain cross-site form/img request can't trigger it.
    if (!isLoopbackRequest(req) || req.headers['x-agent'] !== '1') return sendJson(res, 403, { error: 'forbidden' })
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
    const ctrl = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) ctrl.abort()
    })
    const url = new URL(req.url ?? '', 'http://x')
    const body = await readJson<AgentBody>(req)
    const workspace = String(body.workspace ?? '')

    if (url.pathname === '/api/agent/check') {
      const dir = path.resolve(workspace)
      const st = await fs.stat(dir).catch(() => null)
      if (!st?.isDirectory()) return sendJson(res, 200, { ok: false, error: 'Not a directory' })
      return sendJson(res, 200, { ok: true, path: await fs.realpath(dir) })
    }
    if (url.pathname === '/api/agent/tool') {
      if (!path.isAbsolute(workspace)) return sendJson(res, 400, { error: 'workspace must be an absolute path' })
      const root = await fs.realpath(workspace)
      if (!(await fs.stat(root)).isDirectory()) return sendJson(res, 400, { error: 'workspace is not a directory' })
      try {
        return sendJson(res, 200, {
          ok: true,
          output: await runTool(root, String(body.name), body.args ?? {}, ctrl.signal),
        })
      } catch (e) {
        return sendJson(res, 200, { ok: false, output: errorMessage(e) })
      }
    }
    sendJson(res, 404, { error: 'not found' })
  })
