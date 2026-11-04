import { runTool } from '@/services/agentApi'
import type { AgentMode, ToolCall } from '@/types'
import { patchers } from '@/features/chat/patch'
import type { ChatHost } from '@/features/chat/host'
import { allowAlways, isAlwaysAllowed, requestApproval } from './approvals'
import { isDangerous, killsApp, policy } from './policy'
import { TOOLS, validCall } from './tools'

interface Input {
  host: ChatHost
  chatId: string
  msgId: string
  calls: ToolCall[]
  workspace: string
  signal: AbortSignal
  /** Current mode, read per call so the user can switch mid-run. */
  mode: () => AgentMode
}

const KILL_MSG =
  'Blocked: this command would kill the app you are running inside. Start servers with `cmd & echo $!` and stop only that exact PID with `kill <pid>`; never kill by name or port.'

/** Run one turn's tool calls in order, asking the user first for anything that changes things. */
export async function runToolCalls({ host, chatId, msgId, calls, workspace, signal, mode }: Input): Promise<void> {
  const { patchCall } = patchers(host, chatId)
  for (const tc of calls) {
    if (signal.aborted) break
    if (!validCall(tc.name)) {
      patchCall(msgId, tc.id, {
        status: 'error',
        result: `Unknown tool "${tc.name}". Available: ${TOOLS.map((t) => t.function.name).join(', ')}`,
      })
      continue
    }
    const m = mode()
    let verdict = policy(tc.name, tc.args, m)
    // Calls recovered from a code block in the reply always need a human.
    if (tc.inferred && verdict === 'auto') verdict = 'ask'
    let how: ToolCall['approved'] = 'auto'
    if (
      verdict === 'ask' &&
      !tc.inferred &&
      isAlwaysAllowed(chatId, tc.name) &&
      !(tc.name === 'run_command' && isDangerous(tc.args.command))
    ) {
      verdict = 'auto'
      how = 'always'
    }
    if (verdict === 'block') {
      patchCall(msgId, tc.id, {
        status: 'error',
        result: killsApp(tc.args.command)
          ? KILL_MSG
          : `Not allowed in ${m} mode. Describe the change in your answer instead of making it.`,
      })
      continue
    }
    if (verdict === 'ask') {
      const answer = await requestApproval(tc.id, signal)
      if (answer === 'deny') {
        patchCall(msgId, tc.id, { status: 'denied' })
        continue
      }
      how = 'user'
      if (answer === 'always') allowAlways(chatId, tc.name)
    }
    patchCall(msgId, tc.id, { status: 'running', approved: how })
    try {
      const r = await runTool(workspace, tc, signal)
      patchCall(msgId, tc.id, { status: r.ok ? 'done' : 'error', result: r.output })
    } catch (e) {
      const cancelled = e instanceof Error && e.name === 'AbortError'
      patchCall(msgId, tc.id, {
        status: 'error',
        result: cancelled ? 'Cancelled.' : e instanceof Error ? e.message : String(e),
      })
    }
  }
}
