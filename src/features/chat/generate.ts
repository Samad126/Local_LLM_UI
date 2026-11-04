import { compactMessages } from '@/features/agent/compact'
import { extractCodeFileWrites, extractTextToolCalls, parseArgs } from '@/features/agent/parseCalls'
import { runToolCalls } from '@/features/agent/runLoop'
import { toolMessages } from '@/features/agent/compact'
import { toolsFor } from '@/features/agent/tools'
import { uid } from '@/lib/id'
import { ollama } from '@/services/ollama'
import type { AgentMode, Message, ToolCall } from '@/types'
import type { ChatRequest } from '@/types/ollama'
import { applyWebContext, shouldSearch } from './webContext'
import { autoTitle } from './autoTitle'
import {
  applyFileIntentHint,
  buildMessages,
  buildRequest,
  buildSystemPrompt,
  isAgentOn,
  lastUserText,
  shouldNudge,
} from './buildRequest'
import { ctxOf, estTokens, needsCompaction } from './context'
import type { ChatHost } from './host'
import { NUDGE } from './prompts'
import { patchers } from './patch'
import { splitThink } from './splitThink'
import { summarize } from './summarize'

const MAX_STEPS = 100
const MAX_NUDGES = 2
const FLUSH_MS = 40

const newAssistant = (model: string): Message => ({
  id: uid(),
  role: 'assistant',
  content: '',
  model,
  createdAt: Date.now(),
})

interface TurnResult {
  content: string
  thinking: string
  stats: Message['stats']
  calls: ToolCall[]
  error?: string
}

/** Stream one model response into message `msgId`, flushing partial text to the store at most every FLUSH_MS. */
async function streamTurn(
  host: ChatHost,
  chatId: string,
  msgId: string,
  body: ChatRequest,
  signal: AbortSignal,
  firstExtras: Partial<Message> | null,
): Promise<TurnResult> {
  const { patchMsg } = patchers(host, chatId)
  let content = ''
  let thinking = ''
  let stats: Message['stats']
  let error: string | undefined
  const calls: ToolCall[] = []
  let timer = 0
  const flush = () => {
    timer = 0
    const sp = splitThink(content)
    patchMsg(
      msgId,
      () => ({ content: sp.content, thinking: thinking + sp.think || undefined, stats, ...firstExtras }),
      false,
    )
  }
  try {
    for await (const chunk of ollama.chat(body, signal)) {
      if (chunk.message?.content) content += chunk.message.content
      if (chunk.message?.thinking) thinking += chunk.message.thinking
      for (const tc of chunk.message?.tool_calls ?? []) {
        calls.push({
          id: uid(),
          name: tc.function?.name ?? '',
          args: parseArgs(tc.function?.arguments),
          status: 'pending',
        })
      }
      if (chunk.done) {
        stats = {
          evalCount: chunk.eval_count,
          evalDuration: chunk.eval_duration,
          promptEvalCount: chunk.prompt_eval_count,
          totalDuration: chunk.total_duration,
          loadDuration: chunk.load_duration,
        }
      }
      if (!timer) timer = window.setTimeout(flush, FLUSH_MS)
    }
  } catch (e) {
    if (!(e instanceof Error && e.name === 'AbortError')) error = e instanceof Error ? e.message : String(e)
  }
  clearTimeout(timer)
  return { content, thinking, stats, calls, error }
}

/** Weak models write tool calls as text or dump files in code blocks; recover those as real tool calls. */
function recoverCalls(content: string, mode: AgentMode): { content: string; calls: ToolCall[] } {
  const pending = (c: { name: string; args: ToolCall['args'] }, inferred?: boolean): ToolCall => ({
    id: uid(),
    name: c.name,
    args: c.args,
    status: 'pending',
    ...(inferred ? { inferred } : {}),
  })
  const x = extractTextToolCalls(content)
  if (x.calls.length) return { content: x.content, calls: x.calls.map((c) => pending(c)) }
  if (mode !== 'plan') {
    const w = extractCodeFileWrites(content)
    if (w.calls.length) return { content: w.content, calls: w.calls.map((c) => pending(c, true)) }
  }
  return { content: x.content, calls: [] }
}

/**
 * Run one assistant turn for a chat: build the request, optionally add web results, then stream the reply and
 * (for agent chats) loop executing tool calls until the model is done, the user stops it, or MAX_STEPS is hit.
 */
export async function generate(host: ChatHost, chatId: string): Promise<void> {
  let chat = host.chat(chatId)
  if (!chat || host.isStreaming()) return

  // Auto-compact: the stored conversation alone is near the context limit.
  if (needsCompaction(chat)) {
    host.setRun(chatId, new AbortController())
    await summarize(host, chatId, true)
    host.setRun(null, null)
    chat = host.chat(chatId)
    if (!chat) return
  }

  const s = chat.settings
  const meta = host.meta(s.model)
  const agentOn = isAgentOn(chat)
  const history = chat.messages.slice(chat.summaryCount ?? 0).filter((m) => !m.error || m.content)
  const assistant = newAssistant(s.model)
  const ctrl = new AbortController()
  const { patchMsg } = patchers(host, chatId)
  host.patchChat(chatId, (c) => ({ messages: [...c.messages, assistant] }))
  host.setRun(chatId, ctrl)

  const curMode = (): AgentMode => host.chat(chatId)?.agent?.mode ?? 'ask'
  const latest = chat // settings/summary/agent workspace are fixed for the whole run
  const msgs = buildMessages(history, buildSystemPrompt(latest, curMode()), host.prompts(), meta)

  let web: Awaited<ReturnType<typeof applyWebContext>> = {}
  const mode = host.webMode()
  if (mode === 'on' || (mode === 'auto' && !agentOn && shouldSearch(lastUserText(history)))) {
    web = await applyWebContext({ host, model: s.model, keepAlive: s.keepAlive, history, msgs, signal: ctrl.signal })
    if (web.aborted) {
      host.setRun(null, null)
      host.patchChat(chatId, (c) => ({ messages: c.messages.filter((m) => m.id !== assistant.id) }))
      return
    }
  }
  applyFileIntentHint(msgs, history, agentOn)

  const body = buildRequest(latest, msgs, meta)
  let cur = assistant
  let nudges = 0
  let firstContent = ''
  let error: string | undefined

  for (let step = 0; step < MAX_STEPS; step++) {
    const first = step === 0
    // Big prompt: stub out old tool output (kept off until needed so Ollama's prompt cache stays valid).
    if (estTokens(body.messages) > ctxOf(host.chat(chatId) ?? latest) * 0.5)
      body.messages = compactMessages(body.messages)
    if (agentOn) {
      body.tools = toolsFor(curMode())
      if (body.messages[0]?.role === 'system')
        body.messages[0] = { role: 'system', content: buildSystemPrompt(latest, curMode()) }
    }

    const extras = first ? { sources: web.sources, searchQuery: web.searchQuery } : null
    const turn = await streamTurn(host, chatId, cur.id, body, ctrl.signal, extras)
    let { content, calls } = turn
    let thinking = turn.thinking
    error = turn.error
    if (agentOn && !calls.length && content) {
      const r = recoverCalls(content, curMode())
      content = r.content
      calls = r.calls
    }
    const sp = splitThink(content)
    content = sp.content
    thinking += sp.think
    if (first) firstContent = content
    patchMsg(cur.id, () => ({
      content,
      thinking: thinking || undefined,
      stats: turn.stats,
      toolCalls: calls.length ? calls : undefined,
      ...(first ? { ...extras, error: error ?? web.searchError } : { error }),
    }))
    if (error || ctrl.signal.aborted) break

    if (!calls.length) {
      if (agentOn && step > 0 && nudges < MAX_NUDGES && curMode() !== 'plan' && shouldNudge(content)) {
        nudges++
        body.messages = [...body.messages, { role: 'assistant', content }, { role: 'user', content: NUDGE }]
        cur = newAssistant(s.model)
        const next = cur
        host.patchChat(chatId, (c) => ({ messages: [...c.messages, next] }))
        continue
      }
      break
    }

    await runToolCalls({
      host,
      chatId,
      msgId: cur.id,
      calls,
      workspace: latest.agent?.workspace ?? '',
      signal: ctrl.signal,
      mode: curMode,
    })
    const done = host.chat(chatId)?.messages.find((m) => m.id === cur.id)
    if (ctrl.signal.aborted) {
      const { patchCall } = patchers(host, chatId)
      for (const t of done?.toolCalls ?? [])
        if (t.status === 'pending' || t.status === 'running') patchCall(cur.id, t.id, { status: 'denied' })
      break
    }

    // Feed results back and let the model continue in a fresh assistant message.
    if (done) body.messages = [...body.messages, ...toolMessages(done)]
    cur = newAssistant(s.model)
    const next = cur
    host.patchChat(chatId, (c) => ({ messages: [...c.messages, next] }))
    if (step === MAX_STEPS - 1) error = `Stopped after ${MAX_STEPS} tool steps. Send a message to continue.`
  }

  if (error && cur.id !== assistant.id) patchMsg(cur.id, () => ({ error }))
  host.persist(chatId, true)
  host.setRun(null, null)
  host.refreshRunning()
  if (!error && chat.title === 'New chat' && firstContent) void autoTitle(host, chatId)
}
