import { describe, expect, it } from 'vitest'
import { lineDiff } from './diff'

describe('lineDiff', () => {
  it('keeps unchanged lines as context and marks changes', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toEqual([
      { t: ' ', s: 'a' },
      { t: '-', s: 'b' },
      { t: '+', s: 'x' },
      { t: ' ', s: 'c' },
    ])
  })
  it('handles pure insertions and deletions', () => {
    expect(lineDiff('', 'a').filter((r) => r.t === '+')).toHaveLength(1)
    expect(lineDiff('a\nb', 'a').filter((r) => r.t === '-')).toEqual([{ t: '-', s: 'b' }])
  })
  it('falls back to remove-all/add-all for huge inputs', () => {
    const big = Array.from({ length: 600 }, (_, i) => 'l' + i).join('\n')
    const out = lineDiff(big, big + '\nz')
    expect(out.some((r) => r.t === ' ')).toBe(false)
  })
})
