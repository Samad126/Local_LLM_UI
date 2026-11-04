// PostToolUse hook: run Prettier on the file Claude just edited/wrote, so diffs never fail `format:check`.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

let raw = ''
for await (const chunk of process.stdin) raw += chunk
let file
try {
  file = JSON.parse(raw)?.tool_input?.file_path
} catch {
  process.exit(0)
}
const formattable = /\.(tsx?|jsx?|mjs|cjs|json|css|md)$/
const ignored = /(^|\/)(node_modules|dist|coverage|\.claude\/plans)\/|package-lock\.json|src\/components\/ui\//
if (!file || !formattable.test(file) || ignored.test(file) || !existsSync(file)) process.exit(0)
const r = spawnSync('npx', ['--no-install', 'prettier', '--write', file], { encoding: 'utf8' })
if (r.status !== 0) {
  console.error(`prettier failed on ${file}:\n${r.stderr || r.stdout}`)
  process.exit(2) // surfaced to Claude so it can fix the syntax error
}
