export type Role = 'system' | 'user' | 'assistant'

export interface Stats {
  evalCount?: number
  evalDuration?: number
  promptEvalCount?: number
  totalDuration?: number
  loadDuration?: number
}

export interface Attachment { name: string; text: string; size: number; kind?: 'quote' | 'paste' }

export interface ToolCall {
  id: string
  name: string
  args: Record<string, any>
  status: 'pending' | 'running' | 'done' | 'error' | 'denied'
  approved?: 'auto' | 'user' | 'always'
  inferred?: boolean // built from a code block in the reply, so always needs approval
  result?: string
}

export type AgentMode = 'ask' | 'edits' | 'plan' | 'auto'

export interface Message {
  id: string
  toolCalls?: ToolCall[]
  role: Role
  content: string
  thinking?: string
  images?: string[] // base64, no data: prefix
  files?: Attachment[]
  model?: string
  stats?: Stats
  error?: string
  sources?: { title: string; url: string; snippet?: string }[]
  searchQuery?: string
  createdAt: number
}

export type Options = Partial<{
  temperature: number
  top_k: number
  top_p: number
  min_p: number
  typical_p: number
  repeat_penalty: number
  repeat_last_n: number
  presence_penalty: number
  frequency_penalty: number
  seed: number
  num_predict: number
  num_ctx: number
  num_batch: number
  num_gpu: number
  num_thread: number
  mirostat: number
  mirostat_tau: number
  mirostat_eta: number
  penalize_newline: boolean
}>

export type ThinkMode = 'default' | 'on' | 'off'

export interface ChatSettings {
  model: string
  system: string
  options: Options
  stop: string[]
  think: ThinkMode
  keepAlive: string // '' = server default
  format: string // '' | 'json' | JSON schema text
}

export interface Chat {
  id: string
  title: string
  pinned?: boolean
  createdAt: number
  updatedAt: number
  settings: ChatSettings
  messages: Message[]
  agent?: { on: boolean; workspace: string; mode: AgentMode }
  summary?: string // compacted earlier conversation
  summaryCount?: number // how many leading messages the summary replaces
}

export interface Preset {
  id: string
  name: string
  settings: Omit<ChatSettings, 'model'>
}

export interface Prompt {
  id: string
  name: string
  text: string
}

export interface ModelMeta {
  capabilities: string[]
  contextLength?: number
  defaults: Record<string, string>
  modelfile?: string
  template?: string
  details?: Record<string, unknown>
  family?: string
}

export interface TagModel {
  name: string
  size: number
  modified_at: string
  details: { family?: string; parameter_size?: string; quantization_level?: string }
}

export interface RunningModel {
  name: string
  size: number
  size_vram: number
  expires_at: string
  context_length?: number
}
