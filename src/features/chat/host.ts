import type { Chat, ModelMeta, Prompt } from '@/types'

export type WebMode = 'auto' | 'on' | 'off'

/**
 * What the chat logic needs from the app store. Keeping it an interface means features/chat has no
 * dependency on Zustand (or on stores/chatStore), and can be exercised with a plain fake.
 */
export interface ChatHost {
  chat(id: string): Chat | undefined
  patchChat(id: string, fn: (c: Chat) => Partial<Chat>, persist?: boolean): void
  persist(id: string, now?: boolean): void
  meta(model: string): ModelMeta | undefined
  prompts(): Prompt[]
  webMode(): WebMode
  /** Whether follow-up questions are rewritten into a standalone search query first. */
  searchRewrite(): boolean
  isStreaming(): boolean
  /** Mark a run as started (or finished, with nulls). */
  setRun(streamingId: string | null, abort: AbortController | null): void
  setStatus(text: string): void
  refreshRunning(): void
}
