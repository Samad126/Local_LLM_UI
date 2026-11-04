import type { ToolCall } from '@/types'

const HEADERS = { 'Content-Type': 'application/json', 'X-Agent': '1' }

export async function checkWorkspace(workspace: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  const r = await fetch('/api/agent/check', { method: 'POST', headers: HEADERS, body: JSON.stringify({ workspace }) })
  return r.json()
}

export async function runTool(
  workspace: string,
  tc: Pick<ToolCall, 'name' | 'args'>,
  signal: AbortSignal,
): Promise<{ ok: boolean; output: string }> {
  const r = await fetch('/api/agent/tool', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ workspace, name: tc.name, args: tc.args }),
    signal,
  })
  const d = await r.json()
  if (!r.ok) return { ok: false, output: d.error ?? `HTTP ${r.status}` }
  return d
}
