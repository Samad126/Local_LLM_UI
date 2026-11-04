import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { errorMessage, isLoopbackRequest, middlewarePlugin, readBuffer, sendJson, sendText } from '../http'

const BIN = ['soffice', 'libreoffice'].find((b) => !spawnSync(b, ['--version'], { stdio: 'ignore' }).error)
const MAX_UPLOAD = 30 * 1024 * 1024
const EXTS = new Set(['docx', 'pptx'])

/** DOCX/PPTX -> PDF through LibreOffice (when installed), like a hosted document pipeline. */
async function officeToPdf(input: Buffer, ext: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'llm-docx-'))
  try {
    const file = path.join(dir, 'in.' + ext)
    await writeFile(file, input)
    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        BIN!,
        [
          '--headless',
          '--norestore',
          `-env:UserInstallation=file://${dir}/profile`,
          '--convert-to',
          'pdf',
          '--outdir',
          dir,
          file,
        ],
        { stdio: 'ignore' },
      )
      const t = setTimeout(() => {
        p.kill('SIGKILL')
        reject(new Error('LibreOffice timed out'))
      }, 90000)
      p.on('exit', (code) => {
        clearTimeout(t)
        if (code === 0) resolve()
        else reject(new Error('LibreOffice exited with ' + code))
      })
      p.on('error', reject)
    })
    return await readFile(path.join(dir, 'in.pdf'))
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export const convert = () =>
  middlewarePlugin('convert', '/api/convert/', async (req, res) => {
    if (!isLoopbackRequest(req)) return sendJson(res, 403, { error: 'forbidden' })
    const url = new URL(req.url ?? '', 'http://x')
    if (url.pathname === '/api/convert/status') return sendJson(res, 200, { pdf: !!BIN })
    if (url.pathname !== '/api/convert/pdf' || req.method !== 'POST') return sendText(res, 404, 'not found')
    const ext = url.searchParams.get('ext') ?? 'docx'
    if (!EXTS.has(ext)) return sendText(res, 400, 'bad ext')
    if (!BIN) return sendText(res, 501, 'LibreOffice not installed')
    try {
      const pdf = await officeToPdf(await readBuffer(req, MAX_UPLOAD), ext)
      res.setHeader('Content-Type', 'application/pdf')
      res.end(pdf)
    } catch (e) {
      sendText(res, 500, errorMessage(e))
    }
  })
