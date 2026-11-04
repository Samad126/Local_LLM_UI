export type Answer = 'allow' | 'always' | 'deny'

/** Resolvers for tool calls currently waiting on the user, keyed by tool-call id. */
const pending = new Map<string, (a: Answer) => void>()
/** Tools the user chose "Allow always" for, per chat, until the mode changes. */
const sessionAllow = new Map<string, Set<string>>()

/** Wait for the user's answer; resolves to 'deny' if the run is aborted first. */
export function requestApproval(callId: string, signal: AbortSignal): Promise<Answer> {
  return new Promise<Answer>((resolve) => {
    pending.set(callId, resolve)
    signal.addEventListener('abort', () => resolve('deny'), { once: true })
  }).finally(() => pending.delete(callId))
}

/** Deliver an answer to a waiting call. Returns false when nothing is waiting (e.g. after a page reload). */
export function answerApproval(callId: string, answer: Answer): boolean {
  const resolve = pending.get(callId)
  if (!resolve) return false
  resolve(answer)
  return true
}

export const isAlwaysAllowed = (chatId: string, tool: string) => !!sessionAllow.get(chatId)?.has(tool)
export const allowAlways = (chatId: string, tool: string) =>
  sessionAllow.set(chatId, (sessionAllow.get(chatId) ?? new Set()).add(tool))
export const resetAllowed = (chatId: string) => void sessionAllow.delete(chatId)
