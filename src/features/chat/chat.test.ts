import { describe, expect, it } from 'vitest'
import type { Chat, Message } from '@/types'
import { buildRequest, shouldNudge, applyFileIntentHint } from './buildRequest'
import { ctxOf, displayCtx, needsCompaction } from './context'
import { fileIntent } from './fileIntent'
import { splitThink } from './splitThink'
import { shouldSearch } from './webContext'

const chat = (over: Partial<Chat> = {}, messages: Message[] = []): Chat => ({
  id: 'c',
  title: 't',
  createdAt: 0,
  updatedAt: 0,
  messages,
  settings: { model: 'm', system: '', options: {}, stop: [], think: 'default', keepAlive: '30m', format: '' },
  ...over,
})
const msg = (role: Message['role'], content: string): Message => ({ id: content, role, content, createdAt: 0 })

describe('splitThink', () => {
  it('splits closed, open and absent think blocks', () => {
    expect(splitThink('<think>a</think>\n\nb')).toEqual({ think: 'a', content: 'b' })
    expect(splitThink('x<think>partial')).toEqual({ think: 'partial', content: 'x' })
    expect(splitThink('plain')).toEqual({ think: '', content: 'plain' })
  })
})

describe('fileIntent', () => {
  it.each([
    ['make a powerpoint about cats', 'pptx'],
    ['create slides on rust', 'pptx'],
    ['export as pdf', 'pdf'],
    ['write it in word', 'docx'],
    ['a spreadsheet of sales', 'xlsx'],
    ['hello there', null],
  ])('%s -> %s', (t, k) => expect(fileIntent(t)).toBe(k))
})

describe('shouldSearch', () => {
  it('searches for fresh-info prompts only', () => {
    expect(shouldSearch('what is the latest react version')).toBe(true)
    expect(shouldSearch('explain recursion to me')).toBe(false)
    expect(shouldSearch('/fix')).toBe(false)
  })
})

describe('context', () => {
  it('ctxOf raises the floor for agent chats', () => {
    expect(ctxOf(chat())).toBe(8192)
    expect(ctxOf(chat({ agent: { on: true, workspace: '/w', mode: 'ask' } }))).toBe(16384)
  })
  it('displayCtx never yields NaN when the model has no default', () => {
    expect(displayCtx(chat(), undefined)).toBe(0)
    expect(displayCtx(chat(), { capabilities: [], defaults: { num_ctx: '4096' } })).toBe(4096)
  })
  it('needsCompaction triggers only for long, near-full chats', () => {
    const big = Array.from({ length: 8 }, (_, i) => msg(i % 2 ? 'assistant' : 'user', 'x'.repeat(5000) + i))
    expect(needsCompaction(chat({}, big))).toBe(true)
    expect(needsCompaction(chat({}, big.slice(0, 3)))).toBe(false)
  })
})

describe('shouldNudge', () => {
  it('nudges narrated intent, not finished work', () => {
    expect(shouldNudge("Let's edit the file now")).toBe(true)
    expect(shouldNudge("I'll do it. All done successfully")).toBe(false)
    expect(shouldNudge('Here is the answer.')).toBe(false)
  })
})

describe('buildRequest', () => {
  it('maps keep_alive, think and agent overrides', () => {
    const c = chat({ settings: { ...chat().settings, keepAlive: '-1', think: 'on', format: 'json', stop: ['x'] } })
    const r = buildRequest(c, [], { capabilities: ['thinking'], defaults: {} })
    expect(r).toMatchObject({ keep_alive: -1, think: true, format: 'json', options: { stop: ['x'] } })
    const a = buildRequest(chat({ agent: { on: true, workspace: '/w', mode: 'ask' } }), [], undefined)
    expect(a.format).toBeUndefined()
    expect(a.options?.num_ctx).toBe(16384)
  })
  it('appends the output-format reminder to the last user turn', () => {
    const msgs = [{ role: 'user' as const, content: 'hi' }]
    applyFileIntentHint(msgs, [msg('user', 'make a pdf of this')], false)
    expect(msgs[0].content).toMatch(/Output format.*`pdf`/s)
    const same = [{ role: 'user' as const, content: 'hi' }]
    applyFileIntentHint(same, [msg('user', 'make a pdf')], true)
    expect(same[0].content).toBe('hi')
  })
})
