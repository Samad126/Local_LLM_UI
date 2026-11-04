import { describe, expect, it } from 'vitest'
import { parseChatImport } from './importChats'

const chat = { id: 'a', title: 'T', messages: [], settings: { model: 'm' } }

describe('parseChatImport', () => {
  it('accepts arrays, single chats and backups', () => {
    expect(parseChatImport(JSON.stringify([chat]))).toHaveLength(1)
    expect(parseChatImport(JSON.stringify(chat))).toHaveLength(1)
    expect(parseChatImport(JSON.stringify({ chats: [chat, chat], presets: [] }))).toHaveLength(2)
  })
  it('drops malformed entries and rejects empty results', () => {
    expect(parseChatImport(JSON.stringify([chat, { title: 'x' }]))).toHaveLength(1)
    expect(() => parseChatImport('{"foo":1}')).toThrow(/No chats/)
    expect(() => parseChatImport('nope')).toThrow()
  })
})
