import { describe, expect, it } from 'vitest'
import { isLmStudio, lmId, toOpenAiMessages } from './lmstudio'

describe('lmstudio', () => {
  it('detects and strips the prefix', () => {
    expect(isLmStudio('lmstudio:qwen/qwen3')).toBe(true)
    expect(isLmStudio('llama3')).toBe(false)
    expect(lmId('lmstudio:qwen/qwen3')).toBe('qwen/qwen3')
  })

  it('links tool results to the preceding tool call', () => {
    const out = toOpenAiMessages([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '', tool_calls: [{ function: { name: 'ls', arguments: { p: '.' } } }] },
      { role: 'tool', content: 'a.txt', tool_name: 'ls' },
    ]) as any[]
    expect(out[1].tool_calls[0].id).toBe(out[2].tool_call_id)
    expect(out[1].tool_calls[0].function.arguments).toBe('{"p":"."}')
  })
})
