import { create } from 'zustand'
import { useApp } from './appStore'
import { db } from './db'
import { ollama, hasCap } from './lib/ollama'
import { uid } from './lib/util'
import { buildContext, shouldSearch, webSearch } from './lib/web'
import { filesPrefix } from './lib/files'
import { expandSlash } from './lib/slash'
import { TOOLS, agentPrompt, compactMessages, estTokens, extractCodeFileWrites, extractTextToolCalls, isDangerous, killsApp, parseArgs, policy, runTool, toolMessages, toolsFor, validCall } from './lib/agent'
import type { Attachment, Chat, ChatSettings, Message, ModelMeta, Preset, Prompt, RunningModel, TagModel, ToolCall } from './types'

export type View = 'chat' | 'models' | 'library' | 'app'

interface State {
  ready: boolean
  online: boolean | null
  version: string
  view: View
  drawer: boolean
  chats: Chat[]
  presets: Preset[]
  prompts: Prompt[]
  activeId: string | null
  models: TagModel[]
  meta: Record<string, ModelMeta>
  running: RunningModel[]
  streamingId: string | null
  abort: AbortController | null
  draft: string
  webMode: 'auto' | 'on' | 'off'
  status: string
  setWebMode: (v: 'auto' | 'on' | 'off') => void
  compact: () => Promise<void>
  init: () => Promise<void>
  refreshModels: () => Promise<void>
  refreshRunning: () => Promise<void>
  setView: (v: View) => void
  toggleDrawer: (v?: boolean) => void
  setDraft: (s: string) => void
  newChat: () => string
  openChat: (id: string) => void
  patchChat: (id: string, fn: (c: Chat) => Partial<Chat>, persist?: boolean) => void
  updateSettings: (patch: Partial<ChatSettings>) => void
  deleteChat: (id: string) => void
  send: (text: string, images: string[], files?: Attachment[]) => Promise<void>
  regenerate: (messageId?: string) => Promise<void>
  editAndResend: (messageId: string, text: string) => Promise<void>
  deleteMessage: (messageId: string) => void
  stop: () => void
  setAgent: (patch: Partial<NonNullable<Chat['agent']>>) => void
  approve: (callId: string, answer: Answer) => void
  savePreset: (name: string) => void
  deletePreset: (id: string) => void
  savePrompt: (p: Prompt) => void
  deletePrompt: (id: string) => void
  importChats: (chats: Chat[]) => void
  wipe: () => Promise<void>
}

const MAX_STEPS = 100
type Answer = 'allow' | 'always' | 'deny'
const approvals = new Map<string, (a: Answer) => void>()
const sessionAllow = new Map<string, Set<string>>()

const saveTimers = new Map<string, number>()
function persistChat(c: Chat | undefined, now = false) {
  if (!c) return
  clearTimeout(saveTimers.get(c.id))
  // A chat with no messages is only a draft: it is not saved (or listed) until the first message is sent.
  const run = () => (c.messages.length ? db.chats.put(JSON.parse(JSON.stringify(c))) : db.chats.delete(c.id))
  if (now) run()
  else saveTimers.set(c.id, window.setTimeout(run, 400))
}

/** Some models (even with thinking off) put their reasoning in the reply, ending with </think>. Move it to the thinking block. */
export function splitThink(raw: string): { content: string; think: string } {
  const close = raw.indexOf('</think>')
  if (close >= 0) return { think: raw.slice(0, close).replace(/^\s*<think>/, ''), content: raw.slice(close + 8).replace(/^\s+/, '') }
  const open = raw.indexOf('<think>')
  if (open >= 0) return { think: raw.slice(open + 7), content: raw.slice(0, open) }
  return { content: raw, think: '' }
}

export const fileIntent = (t: string): 'pdf' | 'docx' | 'xlsx' | 'pptx' | null =>
  /\b(pptx?|powerpoint|slide ?deck|slideshow)\b/i.test(t) || /\b(create|make|build|generate|prepare|produce|write)\b[^.?!]{0,60}\b(presentation|slides|deck)\b/i.test(t) ? 'pptx'
  : /\bpdf\b/i.test(t) ? 'pdf' : /\bdocx?\b|\b(ms|microsoft) word\b|\bword (doc|document|file)\b|\b(in|as|into) (a )?word\b/i.test(t) ? 'docx' : /\b(xlsx|excel|spreadsheet)\b/i.test(t) ? 'xlsx' : null

const FILE_HINT = 'File output: this app can turn fenced blocks into downloadable files. Only when the user asks for a document/file: for a PDF or Word document, reply with one fenced block whose language is `pdf` or `docx` containing the whole document as Markdown (start with a `# Title`; headings, lists, tables and bold/italic work). For a presentation, use language `pptx` with Markdown: separate slides with a line containing only `---`; each slide starts with `# Slide title` (the first slide is the title slide: `# Title` plus one subtitle line), then at most 5 short bullets, a table, or a few sentences; optionally add a line `Notes: …` for speaker notes. For a spreadsheet, use a fenced block with language `xlsx` containing CSV (header row first). For web pages use `html`, for images `svg`. Use plain Markdown only (no HTML tags; write math as LaTeX: $x^2$ inline, $$...$$ for display, it is typeset in the file). Never wrap the document in a second code block; add only a brief sentence outside the block.'

export const useStore = create<State>((set, get) => {
  const active = () => get().chats.find((c) => c.id === get().activeId)

  const ctxOf = (c: Chat) => Math.max(c.settings.options.num_ctx ?? 8192, c.agent?.on ? 16384 : 0)

  /** Replace the conversation so far with a model-written summary (messages stay visible, but are not sent). */
  async function summarize(chatId: string, keepLast: boolean): Promise<boolean> {
    const c = get().chats.find((x) => x.id === chatId)
    if (!c) return false
    const from = c.summaryCount ?? 0
    const lastUser = c.messages.map((m) => m.role).lastIndexOf('user')
    const to = keepLast && lastUser > from ? lastUser : c.messages.length
    if (to - from < 2) return false
    const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n) + '…' : t)
    const lines: string[] = []
    for (const m of c.messages.slice(from, to)) {
      if (m.role === 'user') lines.push('User: ' + clip(m.content, 1500))
      else if (m.role === 'assistant') {
        if (m.content.trim()) lines.push('Assistant: ' + clip(m.content, 1200))
        for (const t of m.toolCalls ?? []) lines.push(`[tool ${t.name} ${clip(String(t.args.path ?? t.args.command ?? t.args.pattern ?? ''), 80)} -> ${t.status}${t.result ? ': ' + clip(t.result.replace(/\s+/g, ' '), 160) : ''}]`)
      }
    }
    const transcript = (c.summary ? 'Earlier summary:\n' + c.summary + '\n\nThen:\n' : '') + lines.join('\n')
    set({ status: 'Compacting conversation…' })
    try {
      const meta = get().meta[c.settings.model]
      const r = await ollama.chatOnce({
        model: c.settings.model,
        messages: [{ role: 'user', content: `Summarize this conversation so work can continue from the summary alone. Include: the user's goal, decisions made, files created or changed (with paths), commands run and their outcomes, errors still open, and what remains to do. Be concise (under 350 words), no preamble.\n\n${transcript.slice(-14000)}` }],
        options: { num_predict: 700, temperature: 0.2, num_ctx: 8192 },
        ...(hasCap(meta, 'thinking') ? { think: false } : {}),
        keep_alive: c.settings.keepAlive || undefined,
      })
      const text = String(r.message?.content ?? '').trim()
      if (!text) return false
      get().patchChat(chatId, () => ({ summary: text, summaryCount: to }))
      persistChat(get().chats.find((x) => x.id === chatId), true)
      return true
    } catch { return false } finally { set({ status: '' }) }
  }

  async function generate(chatId: string) {
    let chat = get().chats.find((c) => c.id === chatId)
    if (!chat || get().streamingId) return
    // Auto-compact: the stored conversation alone is near the context limit.
    const live = chat.messages.slice(chat.summaryCount ?? 0)
    const chars = (chat.summary?.length ?? 0) + live.reduce((n, m) => n + m.content.length + (m.toolCalls ?? []).reduce((k, t) => k + JSON.stringify(t.args).length + (t.result?.length ?? 0), 0), 0)
    if (live.length > 6 && chars / 3.5 > ctxOf(chat) * 0.8) {
      set({ streamingId: chatId, abort: new AbortController() })
      await summarize(chatId, true)
      set({ streamingId: null, abort: null })
      chat = get().chats.find((c) => c.id === chatId)
      if (!chat) return
    }
    const s = chat.settings
    const meta = get().meta[s.model]
    const history = chat.messages.slice(chat.summaryCount ?? 0).filter((m) => !m.error || m.content)
    const assistant: Message = { id: uid(), role: 'assistant', content: '', model: s.model, createdAt: Date.now() }
    const ctrl = new AbortController()
    get().patchChat(chatId, (c) => ({ messages: [...c.messages, assistant] }))
    set({ streamingId: chatId, abort: ctrl })

    const agentOn = !!chat.agent?.on && !!chat.agent.workspace
    const msgs: any[] = []
    const curMode = () => get().chats.find((c) => c.id === chatId)?.agent?.mode ?? 'ask'
    const sysFor = (mode: ReturnType<typeof curMode>) => [s.system.trim(), FILE_HINT, chat.summary ? `Summary of the earlier conversation (older messages were compacted):\n${chat.summary}` : '', agentOn ? agentPrompt(chat.agent!.workspace, mode) : ''].filter(Boolean).join('\n\n')
    const sys = sysFor(curMode())
    if (sys) msgs.push({ role: 'system', content: sys })
    for (const m of history) {
      if (m.role === 'assistant' && m.toolCalls?.length) { msgs.push(...toolMessages(m)); continue }
      msgs.push({
        role: m.role,
        content: filesPrefix(m.files) + (m.role === 'user' ? expandSlash(m.content, get().prompts) : m.content),
        ...(m.images?.length && hasCap(meta, 'vision') ? { images: m.images } : {}),
      })
    }
    let sources: Message['sources']
    let searchQuery: string | undefined
    let searchError: string | undefined
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user')
    const webMode = get().webMode
    const wantSearch = webMode === 'on' || (webMode === 'auto' && !agentOn && shouldSearch(history.filter((m) => m.role === 'user').pop()?.content ?? ''))
    if (wantSearch && lastUser >= 0) {
      const app = useApp.getState()
      try {
        let q = String(msgs[lastUser].content).trim()
        if (app.searchRewrite && history.filter((m) => m.role === 'user').length > 1) {
          set({ status: 'Writing search query…' })
          const convo = history.slice(-6).map((m) => `${m.role}: ${m.content.slice(0, 400)}`).join('\n')
          const r = await ollama.chatOnce({
            model: s.model,
            messages: [{ role: 'user', content: `Given this conversation, write one standalone web search query (max 12 words) for the last user message. Reply with the query only.\n\n${convo}` }],
            options: { num_predict: 40, temperature: 0, num_ctx: 4096 },
            ...(hasCap(meta, 'thinking') ? { think: false } : {}),
            keep_alive: s.keepAlive || undefined,
          }).catch(() => null)
          const rq = String(r?.message?.content ?? '').replace(/["\n]/g, ' ').trim()
          if (rq) q = rq
        }
        q = q.slice(0, 250)
        searchQuery = q
        set({ status: `Searching the web for “${q.slice(0, 60)}”…` })
        const found = await webSearch(q, ctrl.signal)
        if (found.length) {
          sources = found.map(({ title, url, snippet }) => ({ title, url, snippet }))
          msgs[lastUser] = { ...msgs[lastUser], content: buildContext(q, found) + msgs[lastUser].content }
        } else searchError = 'Web search returned no results.'
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          set({ status: '', streamingId: null, abort: null })
          get().patchChat(chatId, (c) => ({ messages: c.messages.filter((m) => m.id !== assistant.id) }))
          return
        }
        searchError = 'Web search failed: ' + (e?.message ?? e)
      }
      set({ status: '' })
    }

    // The user asked for a file: remind the model, in the turn itself, to put the document in a fenced file block.
    const askKind = agentOn ? null : fileIntent(history.filter((m) => m.role === 'user').pop()?.content ?? '')
    if (askKind) {
      const li = msgs.map((m) => m.role).lastIndexOf('user')
      if (li >= 0) msgs[li] = { ...msgs[li], content: msgs[li].content + `\n\n[Output format: put the complete document inside ONE fenced code block whose language is \`${askKind}\` (${askKind === 'xlsx' ? 'CSV content' : askKind === 'pptx' ? 'Markdown slides separated by lines containing only ---, each starting with # Title, max 5 short bullets per slide; first slide is the title slide' : 'Markdown content, no HTML; write math as LaTeX with $...$ inline or $$...$$ for display, it is typeset in the file'}). Work out every answer correctly BEFORE writing; the document must be clean and final, with no self-corrections or notes to yourself. Put each multiple-choice option on its own line. Outside the block write only one short sentence. Do not repeat the document in the chat.]` }
    }
    const body: any = {
      model: s.model,
      messages: msgs,
      stream: true,
      options: { ...s.options, ...(s.stop.length ? { stop: s.stop } : {}) },
    }
    if (s.keepAlive) body.keep_alive = /^-?\d+$/.test(s.keepAlive) ? Number(s.keepAlive) : s.keepAlive
    if (s.format.trim()) {
      try { body.format = s.format.trim() === 'json' ? 'json' : JSON.parse(s.format) } catch { /* ignore invalid */ }
    }
    if (hasCap(meta, 'thinking') && s.think !== 'default') body.think = s.think === 'on'
    if (agentOn) {
      delete body.format
      body.options = { ...body.options, num_ctx: Math.max(body.options.num_ctx ?? 0, 16384) }
    }

    const workspace = chat.agent?.workspace ?? ''
    const patchMsg = (id: string, fn: (m: Message) => Partial<Message>, persist = true) =>
      get().patchChat(chatId, (c) => ({ messages: c.messages.map((m) => (m.id === id ? { ...m, ...fn(m) } : m)) }), persist)
    const patchCall = (msgId: string, callId: string, p: Partial<ToolCall>) =>
      patchMsg(msgId, (m) => ({ toolCalls: m.toolCalls?.map((t) => (t.id === callId ? { ...t, ...p } : t)) }))

    let cur = assistant
    let nudges = 0
    let firstContent = ''
    let error: string | undefined
    for (let step = 0; step < MAX_STEPS; step++) {
      let content = ''
      let thinking = ''
      let stats: Message['stats']
      let calls: ToolCall[] = []
      let timer = 0
      const first = step === 0
      // Big prompt: stub out old tool output (kept off until needed so Ollama's prompt cache stays valid).
      if (estTokens(body.messages) > ctxOf(get().chats.find((c) => c.id === chatId) ?? chat!) * 0.5) body.messages = compactMessages(body.messages)
      if (agentOn) {
        const mode = curMode()
        body.tools = toolsFor(mode)
        if (body.messages[0]?.role === 'system') body.messages[0] = { role: 'system', content: sysFor(mode) }
      }
      const flush = () => {
        timer = 0
        const sp = splitThink(content)
        patchMsg(cur.id, () => ({ content: sp.content, thinking: thinking + sp.think || undefined, stats, ...(first ? { sources, searchQuery } : {}) }), false)
      }
      try {
        for await (const chunk of ollama.chat(body, ctrl.signal)) {
          if (chunk.message?.content) content += chunk.message.content
          if (chunk.message?.thinking) thinking += chunk.message.thinking
          for (const tc of chunk.message?.tool_calls ?? []) {
            calls.push({ id: uid(), name: tc.function?.name ?? '', args: parseArgs(tc.function?.arguments), status: 'pending' })
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
          if (!timer) timer = window.setTimeout(flush, 40)
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') error = e?.message ?? String(e)
      }
      clearTimeout(timer)
      if (agentOn && !calls.length && content) {
        const x = extractTextToolCalls(content)
        content = x.content
        calls = x.calls.map((c) => ({ id: uid(), name: c.name, args: c.args, status: 'pending' as const }))
      }
      if (agentOn && !calls.length && content && curMode() !== 'plan') {
        const w = extractCodeFileWrites(content)
        if (w.calls.length) {
          content = w.content
          calls = w.calls.map((c) => ({ id: uid(), name: c.name, args: c.args, status: 'pending' as const, inferred: true }))
        }
      }
      { const sp = splitThink(content); content = sp.content; thinking += sp.think }
      if (first) firstContent = content
      patchMsg(cur.id, () => ({
        content, thinking: thinking || undefined, stats, toolCalls: calls.length ? calls : undefined,
        ...(first ? { sources, searchQuery, error: error ?? searchError } : { error }),
      }))
      if (error || ctrl.signal.aborted) break
      if (!calls.length) {
        // Weak models often say "Let's edit X" and stop. Nudge them to actually call the tool (max twice per run).
        const said = content.trim().split(/\n\s*\n/).pop() ?? ''
        if (agentOn && step > 0 && nudges < 2 && curMode() !== 'plan' && /\b(let'?s|let us|i'?ll|i will|we'?ll|we will|next,|going to|need to)\b/i.test(said) && !/\b(done|complete[d]?|finished|all set|successfully)\b/i.test(said)) {
          nudges++
          body.messages = [...body.messages, { role: 'assistant', content }, { role: 'user', content: 'Go ahead: call the tool now instead of describing it.' }]
          cur = { id: uid(), role: 'assistant', content: '', model: s.model, createdAt: Date.now() }
          get().patchChat(chatId, (c) => ({ messages: [...c.messages, cur] }))
          continue
        }
        break
      }

      // Run the tool calls of this turn, asking the user first for anything that changes things.
      for (const tc of calls) {
        if (ctrl.signal.aborted) break
        if (!validCall(tc.name)) {
          patchCall(cur.id, tc.id, { status: 'error', result: `Unknown tool "${tc.name}". Available: ${TOOLS.map((t) => t.function.name).join(', ')}` })
          continue
        }
        const mode = curMode()
        let verdict = policy(tc.name, tc.args, mode)
        if (tc.inferred && verdict === 'auto') verdict = 'ask'
        let how: ToolCall['approved'] = 'auto'
        if (verdict === 'ask' && !tc.inferred && sessionAllow.get(chatId)?.has(tc.name) && !(tc.name === 'run_command' && isDangerous(tc.args.command))) {
          verdict = 'auto'
          how = 'always'
        }
        if (verdict === 'block') {
          patchCall(cur.id, tc.id, { status: 'error', result: killsApp(tc.args.command) ? 'Blocked: this command would kill the app you are running inside. Start servers with `cmd & echo $!` and stop only that exact PID with `kill <pid>`; never kill by name or port.' : `Not allowed in ${mode} mode. Describe the change in your answer instead of making it.` })
          continue
        }
        if (verdict === 'ask') {
          const answer = await new Promise<Answer>((resolve) => {
            approvals.set(tc.id, resolve)
            ctrl.signal.addEventListener('abort', () => resolve('deny'), { once: true })
          })
          approvals.delete(tc.id)
          if (answer === 'deny') {
            patchCall(cur.id, tc.id, { status: 'denied' })
            continue
          }
          how = 'user'
          if (answer === 'always') sessionAllow.set(chatId, (sessionAllow.get(chatId) ?? new Set()).add(tc.name))
        }
        patchCall(cur.id, tc.id, { status: 'running', approved: how })
        try {
          const r = await runTool(workspace, tc, ctrl.signal)
          patchCall(cur.id, tc.id, { status: r.ok ? 'done' : 'error', result: r.output })
        } catch (e: any) {
          patchCall(cur.id, tc.id, { status: 'error', result: e?.name === 'AbortError' ? 'Cancelled.' : e?.message ?? String(e) })
        }
      }
      if (ctrl.signal.aborted) {
        const left = get().chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === cur.id)?.toolCalls ?? []
        for (const t of left) if (t.status === 'pending' || t.status === 'running') patchCall(cur.id, t.id, { status: 'denied' })
        break
      }

      // Feed results back and let the model continue in a fresh assistant message.
      const done = get().chats.find((c) => c.id === chatId)?.messages.find((m) => m.id === cur.id)
      if (done) body.messages = [...body.messages, ...toolMessages(done)]
      cur = { id: uid(), role: 'assistant', content: '', model: s.model, createdAt: Date.now() }
      get().patchChat(chatId, (c) => ({ messages: [...c.messages, cur] }))
      if (step === MAX_STEPS - 1) error = `Stopped after ${MAX_STEPS} tool steps. Send a message to continue.`
    }
    if (error && cur.id !== assistant.id) patchMsg(cur.id, () => ({ error }))
    persistChat(get().chats.find((c) => c.id === chatId), true)
    set({ streamingId: null, abort: null })
    get().refreshRunning()
    if (!error && chat.title === 'New chat' && firstContent) autoTitle(chatId)
  }

  async function autoTitle(chatId: string) {
    const c = get().chats.find((x) => x.id === chatId)
    if (!c) return
    const first = c.messages.find((m) => m.role === 'user')?.content.slice(0, 500)
    if (!first) return
    // Provisional title immediately, refined by the model below.
    get().patchChat(chatId, () => ({ title: first.slice(0, 40) }))
    try {
      const meta = get().meta[c.settings.model]
      const r = await ollama.chatOnce({
        model: c.settings.model,
        messages: [{ role: 'user', content: `Write a concise 3-6 word title for a chat that starts with this message. Reply with the title only, no quotes.\n\n${first}` }],
        options: { num_predict: 24, temperature: 0.3, num_ctx: 2048 },
        ...(hasCap(meta, 'thinking') ? { think: false } : {}),
        keep_alive: c.settings.keepAlive || undefined,
      })
      const t = String(r.message?.content ?? '').replace(/["\n]/g, ' ').trim().slice(0, 60)
      if (t) get().patchChat(chatId, () => ({ title: t }))
    } catch { /* keep provisional */ }
  }

  return {
    ready: false, online: null, version: '', view: 'chat', drawer: false,
    chats: [], presets: [], prompts: [], activeId: null,
    models: [], meta: {}, running: [], streamingId: null, abort: null, draft: '', webMode: 'auto', status: '',
    setWebMode: (webMode) => set({ webMode }),

    init: async () => {
      const [chats, presets, prompts] = await Promise.all([db.chats.toArray(), db.presets.toArray(), db.prompts.toArray()])
      chats.sort((a, b) => b.updatedAt - a.updatedAt)
      const used = chats.filter((c) => c.messages.length)
      chats.filter((c) => !c.messages.length).forEach((c) => db.chats.delete(c.id))
      set({ chats: used, presets, prompts, ready: true, activeId: used[0]?.id ?? null })
      await get().refreshModels()
      if (!get().activeId) get().newChat()
    },

    refreshModels: async () => {
      try {
        const [v, models] = await Promise.all([ollama.version(), ollama.tags()])
        set({ online: true, version: v.version, models })
        const metas = await Promise.all(models.map((m) => ollama.show(m.name).then((x) => [m.name, x] as const).catch(() => null)))
        const meta: Record<string, ModelMeta> = {}
        for (const e of metas) if (e) meta[e[0]] = e[1]
        set({ meta })
        const app = useApp.getState()
        if (!app.defaults.model || !models.find((m) => m.name === app.defaults.model)) {
          app.set({ defaults: { ...app.defaults, model: models[0]?.name ?? '' } })
        }
        // Fix chats pointing at a model that no longer exists is left to the user; show warning in UI.
        get().refreshRunning()
      } catch {
        set({ online: false })
      }
    },

    refreshRunning: async () => {
      try { set({ running: await ollama.ps() }) } catch { /* offline */ }
    },

    setView: (view) => set({ view }),
    toggleDrawer: (v) => set((s) => ({ drawer: v ?? !s.drawer })),
    setDraft: (draft) => set({ draft }),

    newChat: () => {
      const existing = active()
      if (existing && existing.messages.length === 0) { set({ view: 'chat' }); return existing.id }
      const d = useApp.getState().defaults
      const chat: Chat = {
        id: uid(), title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(),
        settings: JSON.parse(JSON.stringify({ ...d, model: d.model || get().models[0]?.name || '' })),
        messages: [],
      }
      set((s) => ({ chats: [chat, ...s.chats.filter((c) => c.messages.length)], activeId: chat.id, view: 'chat' }))
      return chat.id
    },

    openChat: (id) => set((s) => ({ activeId: id, view: 'chat', chats: s.chats.filter((c) => c.id === id || c.messages.length) })),

    patchChat: (id, fn, persist = true) => {
      set((s) => ({
        chats: s.chats.map((c) => (c.id === id ? { ...c, ...fn(c), ...(persist ? { updatedAt: Date.now() } : {}) } : c)),
      }))
      if (persist) persistChat(get().chats.find((c) => c.id === id))
    },

    updateSettings: (patch) => {
      const c = active()
      if (c) get().patchChat(c.id, (x) => ({ settings: { ...x.settings, ...patch } }))
    },

    deleteChat: (id) => {
      db.chats.delete(id)
      set((s) => {
        const chats = s.chats.filter((c) => c.id !== id)
        return { chats, activeId: s.activeId === id ? chats[0]?.id ?? null : s.activeId }
      })
      if (!get().activeId) get().newChat()
    },

    send: async (text, images, files) => {
      const c = active()
      if (!c || get().streamingId) return
      const m: Message = { id: uid(), role: 'user', content: text, images: images.length ? images : undefined, files: files?.length ? files : undefined, createdAt: Date.now() }
      get().patchChat(c.id, (x) => ({ messages: [...x.messages, m] }))
      await generate(c.id)
    },

    regenerate: async (messageId) => {
      const c = active()
      if (!c || get().streamingId) return
      let msgs = c.messages
      if (messageId) {
        const i = msgs.findIndex((m) => m.id === messageId)
        if (i >= 0) msgs = msgs.slice(0, msgs[i].role === 'assistant' ? i : i + 1)
      } else {
        while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs = msgs.slice(0, -1)
      }
      get().patchChat(c.id, () => ({ messages: msgs }))
      await generate(c.id)
    },

    editAndResend: async (messageId, text) => {
      const c = active()
      if (!c || get().streamingId) return
      const i = c.messages.findIndex((m) => m.id === messageId)
      if (i < 0) return
      const msgs = c.messages.slice(0, i + 1).map((m, k) => (k === i ? { ...m, content: text } : m))
      get().patchChat(c.id, () => ({ messages: msgs }))
      await generate(c.id)
    },

    deleteMessage: (messageId) => {
      const c = active()
      if (c) get().patchChat(c.id, (x) => ({ messages: x.messages.filter((m) => m.id !== messageId) }))
    },

    stop: () => get().abort?.abort(),

    setAgent: (patch) => {
      const c = active()
      if (!c) return
      if (patch.mode) sessionAllow.delete(c.id)
      get().patchChat(c.id, (x) => ({ agent: { on: false, workspace: '', mode: 'ask', ...x.agent, ...patch } }))
    },

    compact: async () => {
      const c = active()
      if (!c || get().streamingId) return
      set({ streamingId: c.id, abort: new AbortController() })
      const ok = await summarize(c.id, false)
      set({ streamingId: null, abort: null, status: ok ? '' : 'Nothing to compact yet.' })
      if (!ok) setTimeout(() => set({ status: '' }), 2500)
    },

    approve: (callId, answer) => {
      const r = approvals.get(callId)
      if (r) return r(answer)
      // Orphaned prompt (page reloaded mid-run): nothing is waiting on it, so just close the card.
      set((st) => ({
        chats: st.chats.map((c) => ({
          ...c,
          messages: c.messages.map((m) => (m.toolCalls?.some((t) => t.id === callId && t.status === 'pending')
            ? { ...m, toolCalls: m.toolCalls.map((t) => (t.id === callId ? { ...t, status: 'denied' as const, result: 'Run was interrupted; send a message to retry.' } : t)) }
            : m)),
        })),
      }))
    },

    savePreset: (name) => {
      const c = active()
      if (!c) return
      const { model: _m, ...rest } = c.settings
      const p: Preset = { id: uid(), name, settings: JSON.parse(JSON.stringify(rest)) }
      db.presets.put(p)
      set((s) => ({ presets: [...s.presets, p] }))
    },
    deletePreset: (id) => { db.presets.delete(id); set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })) },
    savePrompt: (p) => {
      db.prompts.put(p)
      set((s) => ({ prompts: s.prompts.some((x) => x.id === p.id) ? s.prompts.map((x) => (x.id === p.id ? p : x)) : [...s.prompts, p] }))
    },
    deletePrompt: (id) => { db.prompts.delete(id); set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) })) },

    importChats: (chats) => {
      const fresh = chats.map((c) => ({ ...c, id: uid() }))
      db.chats.bulkPut(fresh)
      set((s) => ({ chats: [...fresh, ...s.chats] }))
    },

    wipe: async () => {
      await Promise.all([db.chats.clear(), db.presets.clear(), db.prompts.clear()])
      set({ chats: [], presets: [], prompts: [], activeId: null })
      get().newChat()
    },
  }
})

export const useActive = () => useStore((s) => s.chats.find((c) => c.id === s.activeId))
