import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const MAX_READ = 24_000
const DEFAULT_LINES = 400
const MAX_OUT = 30_000
const CMD_TIMEOUT = 120_000
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.venv', '__pycache__', 'target'])

function send(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<any> {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 5_000_000) throw new Error('Request too large')
  }
  return raw ? JSON.parse(raw) : {}
}

// Only loopback hosts/origins: blocks LAN access and DNS-rebinding, since this endpoint can run shell commands.
const loopback = (h?: string) => !!h && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h)
function trusted(req: IncomingMessage) {
  if (!loopback(req.headers.host)) return false
  const origin = req.headers.origin
  if (origin && !loopback(origin.replace(/^https?:\/\//, ''))) return false
  return req.headers['x-agent'] === '1'
}

/** Resolve p inside root, following symlinks, refusing anything that escapes. */
async function safe(root: string, p: unknown): Promise<string> {
  if (typeof p !== 'string') throw new Error('path must be a string')
  const abs = path.resolve(root, p || '.')
  const outside = (x: string) => { const r = path.relative(root, x); return r.startsWith('..') || path.isAbsolute(r) }
  if (outside(abs)) throw new Error('Path is outside the workspace')
  // Follow symlinks on the nearest existing ancestor; the not-yet-existing tail can't be a link.
  let existing = abs
  const tail: string[] = []
  for (;;) {
    try { existing = await fs.realpath(existing); break } catch {
      const up = path.dirname(existing)
      if (up === existing) throw new Error('Path not found')
      tail.unshift(path.basename(existing))
      existing = up
    }
  }
  if (outside(path.join(existing, ...tail))) throw new Error('Path is outside the workspace')
  return abs
}

const clip = (s: string, n = MAX_OUT) => (s.length > n ? s.slice(0, n) + `\n… [truncated ${s.length - n} chars]` : s)

async function walk(dir: string, root: string, out: string[], limit: number) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (out.length >= limit) return
    if (SKIP.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) await walk(full, root, out, limit)
    else if (e.isFile()) out.push(full)
  }
}

// The app itself (Electron + its server) runs on this machine; commands that kill by name/port would take it down too.
const APP_PORT = 5173
const SELF_PIDS = () => new Set([process.pid, process.ppid])
function killGuard(cmd: string): string | null {
  const hint = ' Start servers in the background (`cmd & echo $!`) and stop only that exact PID with `kill <pid>`; use a different port than ' + APP_PORT + '.'
  if (/\b(pkill|killall)\b/.test(cmd)) return 'Refused: pkill/killall can kill this app (Electron/node).' + hint
  if (/\bfuser\b[^|;&]*-\w*k/.test(cmd)) return 'Refused: fuser -k can kill this app.' + hint
  if (/\bkill\b[^|;&]*(\$\(|`)/.test(cmd) || /\|\s*xargs\s+(-\S+\s+)*kill/.test(cmd)) return 'Refused: killing by a computed PID list can kill this app.' + hint
  if (new RegExp(`:${APP_PORT}\\b`).test(cmd) && /\b(kill|lsof|fuser|ss|netstat)\b/.test(cmd)) return `Refused: port ${APP_PORT} belongs to this app.` + hint
  const self = SELF_PIDS()
  for (const m of cmd.matchAll(/\bkill\b([^|;&]*)/g)) {
    for (const n of m[1].match(/-?\d+/g) ?? []) {
      const v = Number(n)
      if (v <= 1 || self.has(Math.abs(v))) return 'Refused: that PID belongs to this app.' + hint
    }
  }
  return null
}

function run(cmd: string, cwd: string, signal: AbortSignal): Promise<string> {
  const refused = killGuard(cmd)
  if (refused) return Promise.resolve(refused)
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, detached: true, env: process.env })
    let out = ''
    let killed = ''
    const add = (b: Buffer) => { if (out.length < MAX_OUT * 2) out += b.toString() }
    child.stdout.on('data', add)
    child.stderr.on('data', add)
    const kill = (why: string) => {
      killed = why
      try { process.kill(-child.pid!, 'SIGKILL') } catch { /* already gone */ }
    }
    const timer = setTimeout(() => kill(`timed out after ${CMD_TIMEOUT / 1000}s`), CMD_TIMEOUT)
    signal.addEventListener('abort', () => kill('cancelled'))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(clip(out.trim()) + `\n[exit ${killed ? killed : code}]`)
    })
    child.on('error', (e) => { clearTimeout(timer); resolve(`Failed to start: ${e.message}`) })
  })
}

async function tool(root: string, name: string, a: any, signal: AbortSignal): Promise<string> {
  switch (name) {
    case 'list_dir': {
      const dir = await safe(root, a.path ?? '.')
      const ents = await fs.readdir(dir, { withFileTypes: true })
      return ents.filter((e) => !SKIP.has(e.name)).map((e) => (e.isDirectory() ? e.name + '/' : e.name)).sort().join('\n') || '(empty)'
    }
    case 'read_file': {
      const file = await safe(root, a.path)
      const st = await fs.stat(file)
      if (st.isDirectory()) throw new Error('That is a directory, use list_dir')
      if (st.size > 5_000_000) throw new Error('File too large')
      const lines = (await fs.readFile(file, 'utf8')).split('\n')
      const start = Math.max(1, Number(a.start_line) || 1)
      const end = Math.min(lines.length, Number(a.end_line) || start + DEFAULT_LINES - 1)
      const body = lines.slice(start - 1, end).map((l, i) => `${start + i}\t${l}`).join('\n')
      return clip(body, MAX_READ) + (end < lines.length ? `\n[showing lines ${start}-${end} of ${lines.length}; pass start_line=${end + 1} to continue]` : '')
    }
    case 'write_file': {
      const file = await safe(root, a.path)
      // Small models send objects (e.g. for .json files) or use another key name; accept those instead of failing.
      const body = a.content ?? a.contents ?? a.text ?? a.code ?? a.file_content
      if (body === undefined || body === null) throw new Error(`write_file needs "content": the full file text as a string. You sent keys: ${Object.keys(a).join(', ') || '(none)'}. Call write_file again with path and content.`)
      a.content = typeof body === 'string' ? body : JSON.stringify(body, null, 2)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, a.content)
      return `Wrote ${a.content.length} chars to ${path.relative(root, file)}`
    }
    case 'edit_file': {
      const file = await safe(root, a.path)
      if (typeof a.old_string !== 'string' || typeof a.new_string !== 'string') throw new Error('old_string and new_string are required')
      if (!a.old_string) throw new Error('old_string must not be empty')
      const src = await fs.readFile(file, 'utf8')
      const count = src.split(a.old_string).length - 1
      if (count === 0) throw new Error('old_string not found. Re-read the file and copy the text exactly.')
      if (count > 1 && !a.replace_all) throw new Error(`old_string matches ${count} places. Add more context or set replace_all.`)
      await fs.writeFile(file, src.split(a.old_string).join(a.new_string))
      return `Edited ${path.relative(root, file)} (${count} replacement${count > 1 ? 's' : ''})`
    }
    case 'search': {
      if (!a.pattern) throw new Error('pattern is required')
      let re: RegExp
      try { re = new RegExp(a.pattern, 'i') } catch { re = new RegExp(String(a.pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
      const base = await safe(root, a.path ?? '.')
      const files: string[] = []
      const st = await fs.stat(base)
      if (st.isFile()) files.push(base)
      else await walk(base, root, files, 5000)
      const hits: string[] = []
      for (const f of files) {
        if (hits.length >= 100) break
        try {
          if ((await fs.stat(f)).size > 1_000_000) continue
          const text = await fs.readFile(f, 'utf8')
          if (text.includes('\0')) continue
          text.split('\n').forEach((l, i) => {
            if (hits.length < 100 && re.test(l)) hits.push(`${path.relative(root, f)}:${i + 1}: ${l.trim().slice(0, 200)}`)
          })
        } catch { /* unreadable */ }
      }
      return hits.join('\n') || 'No matches'
    }
    case 'run_command': {
      if (!a.command || typeof a.command !== 'string') throw new Error('command is required')
      return run(a.command, root, signal)
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? '', 'http://x')
  if (!url.pathname.startsWith('/api/agent/')) return next()
  if (!trusted(req)) return send(res, 403, { error: 'forbidden' })
  const ctrl = new AbortController()
  res.on('close', () => { if (!res.writableEnded) ctrl.abort() })
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
    const body = await readBody(req)
    if (url.pathname === '/api/agent/check') {
      const dir = path.resolve(String(body.workspace ?? ''))
      const st = await fs.stat(dir).catch(() => null)
      if (!st?.isDirectory()) return send(res, 200, { ok: false, error: 'Not a directory' })
      return send(res, 200, { ok: true, path: await fs.realpath(dir) })
    }
    if (url.pathname === '/api/agent/tool') {
      if (!path.isAbsolute(String(body.workspace ?? ''))) return send(res, 400, { error: 'workspace must be an absolute path' })
      const root = await fs.realpath(body.workspace)
      if (!(await fs.stat(root)).isDirectory()) return send(res, 400, { error: 'workspace is not a directory' })
      try {
        return send(res, 200, { ok: true, output: await tool(root, String(body.name), body.args ?? {}, ctrl.signal) })
      } catch (e: any) {
        return send(res, 200, { ok: false, output: e?.message ?? String(e) })
      }
    }
    send(res, 404, { error: 'not found' })
  } catch (e: any) {
    send(res, 500, { error: e?.message ?? String(e) })
  }
}

export function agent(): Plugin {
  return {
    name: 'agent',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  }
}
