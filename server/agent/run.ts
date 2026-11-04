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
    const kill = (why: string) => {
      killed = why
      try {
        process.kill(-child.pid!, 'SIGKILL')
      } catch {
        /* already gone */
      }
    }
    const timer = setTimeout(() => kill(`timed out after ${CMD_TIMEOUT / 1000}s`), CMD_TIMEOUT)
    signal.addEventListener('abort', () => kill('cancelled'))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(clip(out.trim()) + `\n[exit ${killed || code}]`)
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve(`Failed to start: ${e.message}`)
    })
  })
}
