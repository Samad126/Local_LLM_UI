import { AGENT_MIN_CTX } from '@shared/constants'
import { agentPrompt } from '@/features/agent/prompt'
import { toolMessages } from '@/features/agent/compact'
import { filesPrefix } from '@/lib/files'
import { expandSlash } from '@/lib/slash'
import { hasCap } from '@/services/ollama'
import type { AgentMode, Chat, ThinkMode, Message, ModelMeta, Prompt } from '@/types'
import type { ChatRequest, OllamaMessage } from '@/types/ollama'
import { fileIntent } from './fileIntent'
import { FILE_HINT, outputFormatReminder } from './prompts'

/** gpt-oss can't disable thinking and ignores booleans; it only takes a level. */
export const isLevelThinker = (model: string) => /gpt-oss/i.test(model)
/** Request value for `think`. Level-only models use the minimum level unless thinking is explicitly on. */
export const thinkValue = (model: string, mode: ThinkMode): ChatRequest['think'] => {
  if (!isLevelThinker(model)) return mode === 'default' ? undefined : mode !== 'off'
  return mode === 'high' || mode === 'medium' ? mode : 'low'
}

export const isAgentOn = (chat: Chat) => !!chat.agent?.on && !!chat.agent.workspace

/** System prompt: user's own, file-output hint, compaction summary, and (for agent runs) the coding-agent rules. */
export function buildSystemPrompt(chat: Chat, mode: AgentMode): string {
  return [
    chat.settings.system.trim(),
    FILE_HINT,
    chat.summary ? `Summary of the earlier conversation (older messages were compacted):\n${chat.summary}` : '',
    isAgentOn(chat) ? agentPrompt(chat.agent!.workspace, mode) : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Stored messages -> the messages Ollama expects (tool turns expanded, slash prompts expanded, images only for vision). */
export function buildMessages(
  history: Message[],
  system: string,
  prompts: Prompt[],
  meta: ModelMeta | undefined,
): OllamaMessage[] {
  const msgs: OllamaMessage[] = []
  if (system) msgs.push({ role: 'system', content: system })
  for (const m of history) {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      msgs.push(...toolMessages(m))
      continue
    }
    msgs.push({
      role: m.role,
      content: filesPrefix(m.files) + (m.role === 'user' ? expandSlash(m.content, prompts) : m.content),
      ...(m.images?.length && hasCap(meta, 'vision') ? { images: m.images } : {}),
    })
  }
  return msgs
}

/** When the user asks for a file, remind the model (inside that turn) to use the fenced-file format. */
export function applyFileIntentHint(msgs: OllamaMessage[], history: Message[], agentOn: boolean): void {
  const kind = agentOn ? null : fileIntent(lastUserText(history))
  const i = msgs.map((m) => m.role).lastIndexOf('user')
  if (kind && i >= 0) msgs[i] = { ...msgs[i], content: msgs[i].content + outputFormatReminder(kind) }
}

/** The streaming chat request for the chat's settings. */
export function buildRequest(chat: Chat, msgs: OllamaMessage[], meta: ModelMeta | undefined): ChatRequest {
  const s = chat.settings
  const body: ChatRequest = {
    model: s.model,
    messages: msgs,
    stream: true,
    options: { ...s.options, ...(s.stop.length ? { stop: s.stop } : {}) },
  }
  if (s.keepAlive) body.keep_alive = /^-?\d+$/.test(s.keepAlive) ? Number(s.keepAlive) : s.keepAlive
  if (s.format.trim()) {
    try {
      body.format = s.format.trim() === 'json' ? 'json' : JSON.parse(s.format)
    } catch {
      /* ignore invalid schema */
    }
  }
  if (hasCap(meta, 'thinking')) {
    const t = thinkValue(s.model, s.think)
    if (t !== undefined) body.think = t
  }
  if (isAgentOn(chat)) {
    delete body.format
    body.options = { ...body.options, num_ctx: Math.max(body.options?.num_ctx ?? 0, AGENT_MIN_CTX) }
  }
  return body
}

/** Weak models often say "Let's edit X" and stop. True when the reply looks like that (and not like a finished task). */
export function shouldNudge(content: string): boolean {
  const said =
    content
      .trim()
      .split(/\n\s*\n/)
      .pop() ?? ''
  return (
    /\b(let'?s|let us|i'?ll|i will|we'?ll|we will|next,|going to|need to)\b/i.test(said) &&
    !/\b(done|complete[d]?|finished|all set|successfully)\b/i.test(said)
  )
}

export const lastUserText = (history: Message[]): string =>
  history.filter((m) => m.role === 'user').pop()?.content ?? ''
