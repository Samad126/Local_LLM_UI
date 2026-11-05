import { spawn } from 'node:child_process'
import { killReason } from '../../shared/commandGuard'

const CMD_TIMEOUT = 120_000
export const MAX_OUT = 30_000

export const clip = (s: string, n = MAX_OUT) =>
  s.length > n ? s.slice(0, n) + `\n… [truncated ${s.length - n} chars]` : s

const selfPids = () => new Set([process.pid, process.ppid])

export function runCommand(cmd: string, cwd: string, signal: AbortSignal): Promise<string> {
  const refused = killReason(cmd, selfPids())
  if (refused) return Promise.resolve(refused)
  return new Promise((resolve) => {
    const child = spawn(cmd, { cwd, shell: true, detached: true, env: process.env })
    let out = ''
    let killed = ''
    const add = (b: Buffer) => {
      if (out.length < MAX_OUT * 2) out += b.toString()
    }
    child.stdout.on('data', add)
    child.stderr.on('data', add)
    let done = false
    const finish = (text: string) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(text)
    }
    const result = (code: number | null) => clip(out.trim()) + `\n[exit ${killed || code}]`
    const kill = (why: string) => {
      killed = why
      try {
        process.kill(-child.pid!, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
      // A grandchild that escaped the process group can keep the pipes open, so 'close'
      // may never fire. Don't wait for it: drop the pipes and report after a short grace.
      setTimeout(() => {
        child.stdout.destroy()
        child.stderr.destroy()
        finish(result(null))
      }, 1000)
    }
    const timer = setTimeout(() => kill(`timed out after ${CMD_TIMEOUT / 1000}s`), CMD_TIMEOUT)
    if (signal.aborted) kill('cancelled')
    else signal.addEventListener('abort', () => kill('cancelled'), { once: true })
    child.on('close', (code) => finish(result(code)))
    // `cmd &` leaves a background process holding the output pipes, so 'close' only fires when
    // it dies. The shell itself has exited: give buffered output a moment, then return.
    child.on('exit', (code) =>
      setTimeout(() => {
        child.stdout.destroy()
        child.stderr.destroy()
        finish(result(code))
      }, 300),
    )
    child.on('error', (e) => {
      finish(`Failed to start: ${e.message}`)
    })
  })
}
