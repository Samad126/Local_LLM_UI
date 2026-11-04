import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const BIN = ['soffice', 'libreoffice'].find((b) => !spawnSync(b, ['--version'], { stdio: 'ignore' }).error)
const MAX = 30 * 1024 * 1024

function readBody(req: IncomingMessage) {
  return new Promise<Buffer>((res, rej) => {
    const parts: Buffer[] = []; let n = 0
    req.on('data', (c: Buffer) => { n += c.length; if (n > MAX) { rej(new Error('too large')); req.destroy() } else parts.push(c) })
    req.on('end', () => res(Buffer.concat(parts))); req.on('error', rej)
  })
}

/** DOCX -> PDF through LibreOffice (when installed), like a hosted document pipeline. */
async function docxToPdf(docx: Buffer, ext: string) {
  const dir = await mkdtemp(path.join(tmpdir(), 'llm-docx-'))
  try {
    await writeFile(path.join(dir, 'in.' + ext), docx)
    await new Promise<void>((res, rej) => {
      const p = spawn(BIN!, ['--headless', '--norestore', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', 'pdf', '--outdir', dir, path.join(dir, 'in.' + ext)], { stdio: 'ignore' })
      const t = setTimeout(() => { p.kill('SIGKILL'); rej(new Error('LibreOffice timed out')) }, 90000)
      p.on('exit', (code) => { clearTimeout(t); code === 0 ? res() : rej(new Error('LibreOffice exited with ' + code)) })
      p.on('error', rej)
    })
    return await readFile(path.join(dir, 'in.pdf'))
  } finally { rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = req.url ?? ''
  if (url === '/api/convert/status') { res.setHeader('Content-Type', 'application/json'); return void res.end(JSON.stringify({ pdf: !!BIN })) }
  if (!url.startsWith('/api/convert/pdf') || req.method !== 'POST') return next()
  const ext = new URL(url, 'http://x').searchParams.get('ext') ?? 'docx'
  if (!['docx', 'pptx'].includes(ext)) { res.statusCode = 400; return void res.end('bad ext') }
  if (!BIN) { res.statusCode = 501; return void res.end('LibreOffice not installed') }
  try {
    const pdf = await docxToPdf(await readBody(req), ext)
    res.setHeader('Content-Type', 'application/pdf'); res.end(pdf)
  } catch (e) { res.statusCode = 500; res.end(String((e as Error).message)) }
}

export function convert(): Plugin {
  return {
    name: 'convert',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  }
}
