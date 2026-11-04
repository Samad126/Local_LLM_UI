import { describe, expect, it } from 'vitest'
import { normalizePullName, splitPullNames } from './hfModel'

describe('normalizePullName', () => {
  it('leaves Ollama names alone', () => {
    expect(normalizePullName(' qwen3:8b ')).toBe('qwen3:8b')
    expect(normalizePullName('someuser/model:tag')).toBe('someuser/model:tag')
  })
  it('converts Hugging Face URLs', () => {
    expect(normalizePullName('https://huggingface.co/bartowski/Llama-3.2-1B-GGUF')).toBe(
      'hf.co/bartowski/Llama-3.2-1B-GGUF',
    )
    expect(normalizePullName('https://huggingface.co/a/b/tree/main?x=1')).toBe('hf.co/a/b')
  })
  it('keeps hf.co names and quant tags', () => {
    expect(normalizePullName('hf.co/a/b:Q4_K_M')).toBe('hf.co/a/b:Q4_K_M')
    expect(normalizePullName('huggingface.co/a/b:Q8_0')).toBe('hf.co/a/b:Q8_0')
  })
})

describe('splitPullNames', () => {
  it('splits on whitespace/commas and dedupes', () => {
    expect(splitPullNames('a:1, b:2\nA c a:1')).toEqual(['a:1', 'b:2', 'A', 'c'])
  })
})
