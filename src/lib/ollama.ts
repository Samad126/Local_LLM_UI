import { useApp } from '../appStore'
import type { ModelMeta, Options, RunningModel, TagModel } from '../types'

const base = () => useApp.getState().host.replace(/\/$/, '')

async function j<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(base() + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export async function* ndjson<T = any>(res: Response): AsyncGenerator<T> {
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || `HTTP ${res.status}`)
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      const obj = JSON.parse(line)
      if (obj.error) throw new Error(obj.error)
      yield obj
    }
  }
  if (buf.trim()) yield JSON.parse(buf)
}

async function* stream<T>(path: string, body: unknown, signal?: AbortSignal) {
  const res = await fetch(base() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  yield* ndjson<T>(res)
}

export const ollama = {
  version: () => j<{ version: string }>('/api/version'),
  tags: async () => (await j<{ models: TagModel[] }>('/api/tags')).models,
  ps: async () => (await j<{ models: RunningModel[] }>('/api/ps')).models,
  show: async (model: string): Promise<ModelMeta> => {
    const d = await j<any>('/api/show', { model })
    const defaults: Record<string, string> = {}
    for (const line of String(d.parameters ?? '').split('\n')) {
      const m = line.trim().match(/^(\S+)\s+(.+)$/)
      if (m && m[1] !== 'stop') defaults[m[1]] = m[2].replace(/^"|"$/g, '')
    }
    const info = d.model_info ?? {}
    const ctxKey = Object.keys(info).find((k) => k.endsWith('.context_length'))
    return {
      capabilities: d.capabilities ?? ['completion'],
      contextLength: ctxKey ? info[ctxKey] : undefined,
      defaults,
      modelfile: d.modelfile,
      template: d.template,
      details: d.details,
      family: d.details?.family,
    }
  },
  chat: (body: unknown, signal: AbortSignal) => stream<any>('/api/chat', body, signal),
  chatOnce: (body: unknown) => j<any>('/api/chat', { ...(body as object), stream: false }),
  pull: (model: string, signal: AbortSignal) => stream<any>('/api/pull', { model, stream: true }, signal),
  create: (body: unknown) => stream<any>('/api/create', { ...(body as object), stream: true }),
  delete: async (model: string) => {
    const res = await fetch(base() + '/api/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    })
    if (!res.ok) throw new Error(await res.text())
  },
  copy: async (source: string, destination: string) => {
    const res = await fetch(base() + '/api/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, destination }),
    })
    if (!res.ok) throw new Error(await res.text())
  },
  unload: (model: string) => j('/api/chat', { model, messages: [], keep_alive: 0 }),
  load: (model: string, keep_alive = '30m') => j('/api/chat', { model, messages: [], keep_alive }),
}

export interface OptionDef {
  key: keyof Options
  label: string
  group: string
  min: number
  max: number
  step: number
  help: string
}

export const OPTION_DEFS: OptionDef[] = [
  {
    key: 'temperature',
    label: 'Temperature',
    group: 'Sampling',
    min: 0,
    max: 2,
    step: 0.05,
    help: 'Randomness. Lower = focused, higher = creative.',
  },
  {
    key: 'top_k',
    label: 'Top K',
    group: 'Sampling',
    min: 0,
    max: 200,
    step: 1,
    help: 'Sample from the K most likely tokens. 0 disables.',
  },
  {
    key: 'top_p',
    label: 'Top P',
    group: 'Sampling',
    min: 0,
    max: 1,
    step: 0.01,
    help: 'Nucleus sampling cumulative probability cutoff.',
  },
  {
    key: 'min_p',
    label: 'Min P',
    group: 'Sampling',
    min: 0,
    max: 1,
    step: 0.01,
    help: 'Minimum probability relative to the top token.',
  },
  {
    key: 'typical_p',
    label: 'Typical P',
    group: 'Sampling',
    min: 0,
    max: 1,
    step: 0.01,
    help: 'Locally typical sampling.',
  },
  {
    key: 'seed',
    label: 'Seed',
    group: 'Sampling',
    min: 0,
    max: 2147483647,
    step: 1,
    help: 'Fixed seed for reproducible output.',
  },
  {
    key: 'repeat_penalty',
    label: 'Repeat penalty',
    group: 'Penalties',
    min: 0,
    max: 2,
    step: 0.01,
    help: 'Penalize repeated tokens (1 = off).',
  },
  {
    key: 'repeat_last_n',
    label: 'Repeat last N',
    group: 'Penalties',
    min: -1,
    max: 8192,
    step: 1,
    help: 'Window for repeat penalty. 0 off, -1 = num_ctx.',
  },
  {
    key: 'presence_penalty',
    label: 'Presence penalty',
    group: 'Penalties',
    min: -2,
    max: 2,
    step: 0.05,
    help: 'Penalize tokens already present.',
  },
  {
    key: 'frequency_penalty',
    label: 'Frequency penalty',
    group: 'Penalties',
    min: -2,
    max: 2,
    step: 0.05,
    help: 'Penalize tokens by how often they appeared.',
  },
  {
    key: 'num_ctx',
    label: 'Context window',
    group: 'Context & output',
    min: 512,
    max: 262144,
    step: 512,
    help: 'Tokens of context. Larger uses more VRAM.',
  },
  {
    key: 'num_predict',
    label: 'Max output tokens',
    group: 'Context & output',
    min: -2,
    max: 32768,
    step: 1,
    help: '-1 infinite, -2 fill context.',
  },
  {
    key: 'mirostat',
    label: 'Mirostat',
    group: 'Mirostat',
    min: 0,
    max: 2,
    step: 1,
    help: '0 off, 1 Mirostat, 2 Mirostat 2.0.',
  },
  {
    key: 'mirostat_tau',
    label: 'Mirostat tau',
    group: 'Mirostat',
    min: 0,
    max: 10,
    step: 0.1,
    help: 'Target entropy (coherence vs diversity).',
  },
  { key: 'mirostat_eta', label: 'Mirostat eta', group: 'Mirostat', min: 0, max: 1, step: 0.01, help: 'Learning rate.' },
  {
    key: 'num_batch',
    label: 'Batch size',
    group: 'Hardware',
    min: 1,
    max: 4096,
    step: 1,
    help: 'Prompt processing batch size.',
  },
  {
    key: 'num_gpu',
    label: 'GPU layers',
    group: 'Hardware',
    min: -1,
    max: 200,
    step: 1,
    help: 'Layers offloaded to GPU. -1 auto, 0 CPU only.',
  },
  { key: 'num_thread', label: 'CPU threads', group: 'Hardware', min: 0, max: 128, step: 1, help: '0 = auto.' },
]

export const hasCap = (meta: ModelMeta | undefined, cap: string) => !!meta?.capabilities.includes(cap)
