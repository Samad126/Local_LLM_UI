import { beforeEach, describe, expect, it } from 'vitest'
import { useQueue } from './queueStore'

const msg = (chatId: string, text: string) => ({ chatId, text, images: [], files: [] })

describe('queueStore', () => {
  beforeEach(() => useQueue.setState({ items: [] }))

  it('shifts messages FIFO per chat', () => {
    const q = useQueue.getState()
    q.add(msg('a', '1'))
    q.add(msg('b', 'x'))
    q.add(msg('a', '2'))
    expect(q.shift('a')?.text).toBe('1')
    expect(q.shift('a')?.text).toBe('2')
    expect(q.shift('a')).toBeUndefined()
    expect(useQueue.getState().items).toHaveLength(1)
  })

  it('removes one item and clears a chat', () => {
    const q = useQueue.getState()
    q.add(msg('a', '1'))
    q.add(msg('a', '2'))
    q.add(msg('b', '3'))
    q.remove(useQueue.getState().items[0].id)
    expect(useQueue.getState().items.map((i) => i.text)).toEqual(['2', '3'])
    q.clearChat('a')
    expect(useQueue.getState().items.map((i) => i.text)).toEqual(['3'])
  })
})
