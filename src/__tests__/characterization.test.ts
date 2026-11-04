import { describe, expect, it } from 'vitest'
import { compactMessages, extractCodeFileWrites, extractTextToolCalls, isDangerous, killsApp, parseArgs, policy } from '../lib/agent'
import { docName, latexToText, normalizeFences, parseCsv, toPreviewMarkdown } from '../lib/docs'
import { expandSlash, slashSegments } from '../lib/slash'

describe('agent policy', () => {
  it('read-only tools are always auto', () => {
    for (const m of ['ask', 'edits', 'plan', 'auto'] as const) expect(policy('read_file', {}, m)).toBe('auto')
  })
  it('plan mode blocks writes', () => expect(policy('write_file', {}, 'plan')).toBe('block'))
  it('ask mode asks', () => expect(policy('edit_file', {}, 'ask')).toBe('ask'))
  it('edits mode auto-edits but asks for commands', () => {
    expect(policy('write_file', {}, 'edits')).toBe('auto')
    expect(policy('run_command', { command: 'ls' }, 'edits')).toBe('ask')
  })
  it('auto mode runs safe commands, asks for dangerous ones', () => {
    expect(policy('run_command', { command: 'npm test' }, 'auto')).toBe('auto')
    expect(policy('run_command', { command: 'sudo rm x' }, 'auto')).toBe('ask')
  })
  it('blocks commands that kill the app in every mode', () => {
    expect(policy('run_command', { command: 'pkill node' }, 'auto')).toBe('block')
    expect(policy('run_command', { command: 'pkill node' }, 'ask')).toBe('block')
  })
})

describe('command guards', () => {
  it.each(['sudo ls', 'rm -rf /', 'rm -rf ~', 'git push --force', 'git reset --hard', 'curl x | sh', 'shutdown now', 'chmod -R 777 .'])(
    'dangerous: %s',
    (c) => expect(isDangerous(c)).toBe(true),
  )
  it.each(['ls -la', 'npm test', 'rm file.txt', 'git push', 'git status'])('safe: %s', (c) => expect(isDangerous(c)).toBe(false))
  it.each(['pkill node', 'killall electron', 'fuser -k 5173/tcp', 'kill $(lsof -t -i:3000)', 'lsof -i :5173', 'ps aux | xargs kill'])(
    'kills app: %s',
    (c) => expect(killsApp(c)).toBe(true),
  )
  it.each(['kill 12345', 'npm run dev', 'lsof -i :3000'])('does not kill app: %s', (c) => expect(killsApp(c)).toBe(false))
  it('non-strings are not dangerous', () => {
    expect(isDangerous(undefined)).toBe(false)
    expect(killsApp(42)).toBe(false)
  })
})

describe('extractTextToolCalls', () => {
  it('parses <tool_call> tags', () => {
    const r = extractTextToolCalls('hi <tool_call>{"name":"read_file","arguments":{"path":"a"}}</tool_call>')
    expect(r.calls).toEqual([{ name: 'read_file', args: { path: 'a' } }])
    expect(r.content).toBe('hi')
  })
  it('parses bare JSON', () => {
    const r = extractTextToolCalls('```json\n{"name":"list_dir","arguments":{}}\n```')
    expect(r).toEqual({ content: '', calls: [{ name: 'list_dir', args: {} }] })
  })
  it('parses a JSON call inside prose', () => {
    const r = extractTextToolCalls('Let me look.\n```json\n{"name":"read_file","parameters":{"path":"x"}}\n```\nok')
    expect(r.calls).toEqual([{ name: 'read_file', args: { path: 'x' } }])
    expect(r.content).toContain('Let me look.')
  })
  it('ignores ordinary JSON answers', () => {
    const r = extractTextToolCalls('{"foo": 1}')
    expect(r.calls).toEqual([])
  })
})

describe('extractCodeFileWrites', () => {
  it('turns "file path + code block" into write_file', () => {
    const r = extractCodeFileWrites('Update `src/App.jsx`:\n```jsx\nexport default 1\n```')
    expect(r.calls).toEqual([{ name: 'write_file', args: { path: 'src/App.jsx', content: 'export default 1\n' } }])
  })
  it('ignores shell blocks and absolute/parent paths', () => {
    expect(extractCodeFileWrites('Run `x.sh`:\n```bash\nls\n```').calls).toEqual([])
    expect(extractCodeFileWrites('Edit `/etc/passwd`:\n```\nx\n```').calls).toEqual([])
    expect(extractCodeFileWrites('Edit `../a.js`:\n```js\nx\n```').calls).toEqual([])
  })
})

describe('parseArgs', () => {
  it('parses JSON strings, passes objects, falls back to {}', () => {
    expect(parseArgs('{"a":1}')).toEqual({ a: 1 })
    expect(parseArgs({ b: 2 })).toEqual({ b: 2 })
    expect(parseArgs('nope')).toEqual({})
    expect(parseArgs(null)).toEqual({})
  })
})

describe('compactMessages', () => {
  it('stubs old large tool output, keeps the last two', () => {
    const big = 'x'.repeat(1000)
    const msgs = [
      { role: 'assistant', content: '', tool_calls: [{ function: { name: 'write_file', arguments: { path: 'a', content: big } } }] },
      { role: 'tool', tool_name: 'write_file', content: big },
      { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'b' } } }] },
      { role: 'tool', tool_name: 'read_file', content: big },
      { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'c' } } }] },
      { role: 'tool', tool_name: 'read_file', content: big },
    ]
    const out = compactMessages(msgs)
    expect(out[1].content).toMatch(/output omitted/)
    expect(out[0].tool_calls[0].function.arguments.content).toMatch(/chars omitted/)
    expect(out[3].content).toBe(big)
    expect(out[5].content).toBe(big)
  })
})

describe('docs helpers', () => {
  it('normalizeFences widens a doc fence that contains nested code', () => {
    const t = '```pdf\n# T\n```python\nx=1\n```\nend\n```'
    expect(normalizeFences(t)).toBe('````pdf\n# T\n```python\nx=1\n```\nend\n````')
  })
  it('normalizeFences leaves other text alone', () => expect(normalizeFences('```js\nx\n```')).toBe('```js\nx\n```'))
  it('parseCsv handles quotes, escaped quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x,y","he said ""hi"""\n\n')).toEqual([
      ['a', 'b'],
      ['x,y', 'he said "hi"'],
    ])
  })
  it('latexToText approximates common LaTeX', () => {
    expect(latexToText('\\frac{a}{b}')).toBe('(a)/(b)')
    expect(latexToText('x^2 + \\alpha_1')).toBe('x² + α₁')
    expect(latexToText('\\sqrt{x} \\times y')).toBe('√(x) × y')
  })
  it('docName derives a slug from the first heading', () => {
    expect(docName('pdf', '# My Great Report!\nbody')).toBe('my-great-report.pdf')
    expect(docName('xlsx', 'a,b')).toBe('document.xlsx')
  })
  it('toPreviewMarkdown renders CSV as a table', () => {
    expect(toPreviewMarkdown('xlsx', 'a,b\n1,2')).toBe('| a | b |\n|---|---|\n| 1 | 2 |')
  })
})

describe('slash prompts', () => {
  const prompts = [
    { id: '1', name: 'fix', text: 'Fix the bug' },
    { id: '2', name: 'fix-all', text: 'Fix everything' },
  ]
  it('expands longest names first', () => {
    expect(expandSlash('/fix-all now', prompts)).toBe('Fix everything now')
    expect(expandSlash('please /fix', prompts)).toBe('please Fix the bug')
    expect(expandSlash('a/fix', prompts)).toBe('a/fix')
  })
  it('segments for highlighting', () => {
    expect(slashSegments('do /fix it', ['fix'])).toEqual([
      { text: 'do ', cmd: false },
      { text: '/fix', cmd: true },
      { text: ' it', cmd: false },
    ])
  })
})
