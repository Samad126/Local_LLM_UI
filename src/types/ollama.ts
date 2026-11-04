import type { Options } from './index'

/** Wire types for the parts of the Ollama HTTP API this app uses. */

export interface OllamaToolCall {
  function?: { name?: string; arguments?: unknown }
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  images?: string[]
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[]
  tool_name?: string
}

export interface ChatRequest {
  model: string
  messages: OllamaMessage[]
  stream?: boolean
  options?: Options
  think?: boolean
  keep_alive?: string | number
  format?: 'json' | Record<string, unknown>
  tools?: unknown[]
}

export interface ChatChunk {
  message?: { content?: string; thinking?: string; tool_calls?: OllamaToolCall[] }
  done?: boolean
  eval_count?: number
  eval_duration?: number
  prompt_eval_count?: number
  total_duration?: number
  load_duration?: number
}

export interface ShowResponse {
  parameters?: string
  capabilities?: string[]
  model_info?: Record<string, unknown>
  modelfile?: string
  template?: string
  details?: { family?: string } & Record<string, unknown>
}

export interface ProgressChunk {
  status: string
  total?: number
  completed?: number
}

export interface CreateRequest {
  model: string
  from: string
  system?: string
  template?: string
  parameters?: Record<string, string | number>
}
