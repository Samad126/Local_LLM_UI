import { APP_PORT } from './constants'

/**
 * Shell-command checks shared by the client (approval policy) and the server (last line of defence).
 * Keeping them in one place means the UI and the server can never disagree about what is blocked.
 */

/** Commands that still need a human even in Auto mode. */
const DANGEROUS: RegExp[] = [
  /\bsudo\b/,
  /\bmkfs\b/,
  /\bdd\b[^|;&]*\bof=/,
  /:\(\)\s*\{/, // fork bomb
  /\brm\b[^|;&]*-\w*[rf]\w*[^|;&]*(\s|^)(\/|~|\$HOME|\.\.|\*)(\s|$|\/)/,
  /\bgit\s+push\b[^|;&]*(--force|-f\b)/,
  /\bgit\s+reset\s+--hard/,
  /\bgit\s+clean\b[^|;&]*-\w*f/,
  /(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z)?sh\b/,
  /\bchmod\s+-R\b/,
  /\bchown\s+-R\b/,
  />\s*\/(etc|usr|bin|boot|dev)\b/,
  /\b(shutdown|reboot|poweroff)\b/,
]

export const isDangerous = (cmd: unknown): boolean => typeof cmd === 'string' && DANGEROUS.some((r) => r.test(cmd))

const HINT =
  ' Start servers in the background (`cmd & echo $!`) and stop only that exact PID with `kill <pid>`;' +
  ` use a different port than ${APP_PORT}.`

const PORT_RE = new RegExp(`:${APP_PORT}\\b`)

/**
 * Why a command would kill this app (Electron + its server) along with the agent's own processes, or null.
 * `selfPids` lets the server also refuse `kill <its own pid>`; the client has no PIDs to pass.
 */
export function killReason(cmd: unknown, selfPids: ReadonlySet<number> = new Set()): string | null {
  if (typeof cmd !== 'string') return null
  if (/\b(pkill|killall)\b/.test(cmd)) return 'Refused: pkill/killall can kill this app (Electron/node).' + HINT
  if (/\bfuser\b[^|;&]*-\w*k/.test(cmd)) return 'Refused: fuser -k can kill this app.' + HINT
  if (/\bkill\b[^|;&]*(\$\(|`)/.test(cmd) || /\|\s*xargs\s+(-\S+\s+)*kill/.test(cmd))
    return 'Refused: killing by a computed PID list can kill this app.' + HINT
  if (PORT_RE.test(cmd) && /\b(kill|lsof|fuser|ss|netstat)\b/.test(cmd))
    return `Refused: port ${APP_PORT} belongs to this app.` + HINT
  if (selfPids.size) {
    for (const m of cmd.matchAll(/\bkill\b([^|;&]*)/g)) {
      for (const v of killTargets(m[1])) {
        if (v <= 1 || selfPids.has(Math.abs(v))) return 'Refused: that PID belongs to this app.' + HINT
      }
    }
  }
  return null
}

/** PIDs (negative = process group) targeted by the arguments of a `kill`, skipping the signal option. */
export function killTargets(args: string): number[] {
  const t = args.trim().split(/\s+/).filter(Boolean)
  let i = 0
  if (t[0] === '-s' || t[0] === '-n') i = 2
  else if (t[0]?.startsWith('-') && t[0] !== '--') i = 1 // -9, -TERM, -SIGKILL
  if (t[i] === '--') i++
  return t
    .slice(i)
    .filter((x) => /^-?\d+$/.test(x))
    .map(Number)
}

export const killsApp = (cmd: unknown): boolean => killReason(cmd) !== null
