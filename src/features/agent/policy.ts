import type { AgentMode } from '@/types'
import { READ_ONLY_TOOLS } from '@shared/agentTools'
export { isDangerous, killsApp } from '@shared/commandGuard'
import { isDangerous, killsApp } from '@shared/commandGuard'
import type { ToolArgs } from './tools'

export const MODES: AgentMode[] = ['ask', 'edits', 'plan', 'auto']
export const MODE_INFO: Record<AgentMode, { label: string; hint: string }> = {
  ask: { label: 'Ask', hint: 'Asks before every file change and command' },
  edits: { label: 'Edits', hint: 'Edits files automatically, asks before commands' },
  plan: { label: 'Plan', hint: 'Read-only: explores and writes a plan, changes nothing' },
  auto: { label: 'Auto', hint: 'Runs everything without asking (risky commands still ask)' },
}

export type Verdict = 'auto' | 'ask' | 'block'

/** What to do with a tool call in a given mode. */
export function policy(name: string, args: ToolArgs, mode: AgentMode): Verdict {
  if (READ_ONLY_TOOLS.has(name)) return 'auto'
  if (mode === 'plan') return 'block'
  if (name === 'run_command' && killsApp(args.command)) return 'block'
  if (mode === 'ask') return 'ask'
  if (name === 'run_command') return mode === 'auto' && !isDangerous(args.command) ? 'auto' : 'ask'
  return 'auto'
}
