import { promises as fs } from 'node:fs'
import path from 'node:path'
import { isToolName } from '../../shared/agentTools'
import { safePath } from './sandbox'
import { clip, runCommand } from './run'

const MAX_READ = 24_000
const DEFAULT_LINES = 400
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.venv', '__pycache__', 'target'])

type Args = Record<string, unknown>

async function walk(dir: string, out: string[], limit: number) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (out.length >= limit) return
    if (SKIP.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) await walk(full, out, limit)
    else if (e.isFile()) out.push(full)
  }
}

function toRegExp(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'i')
  } catch {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  }
}

export async function runTool(root: string, name: string, a: Args, signal: AbortSignal): Promise<string> {
  if (!isToolName(name)) throw new Error(`Unknown tool: ${name}`)
  switch (name) {
    case 'list_dir': {
      const dir = await safePath(root, a.path ?? '.')
      const ents = await fs.readdir(dir, { withFileTypes: true })
      return (
        ents
          .filter((e) => !SKIP.has(e.name))
          .map((e) => (e.isDirectory() ? e.name + '/' : e.name))
          .sort()
          .join('\n') || '(empty)'
      )
    }
    case 'read_file': {
      const file = await safePath(root, a.path)
      const st = await fs.stat(file)
      if (st.isDirectory()) throw new Error('That is a directory, use list_dir')
      if (st.size > 5_000_000) throw new Error('File too large')
      const lines = (await fs.readFile(file, 'utf8')).split('\n')
      const start = Math.max(1, Number(a.start_line) || 1)
      const end = Math.min(lines.length, Number(a.end_line) || start + DEFAULT_LINES - 1)
      const body = lines
        .slice(start - 1, end)
        .map((l, i) => `${start + i}\t${l}`)
        .join('\n')
      return (
        clip(body, MAX_READ) +
        (end < lines.length
          ? `\n[showing lines ${start}-${end} of ${lines.length}; pass start_line=${end + 1} to continue]`
          : '')
      )
    }
    case 'write_file': {
      const file = await safePath(root, a.path)
      // Small models send objects (e.g. for .json files) or use another key name; accept those instead of failing.
      const body = a.content ?? a.contents ?? a.text ?? a.code ?? a.file_content
      if (body === undefined || body === null)
        throw new Error(
          `write_file needs "content": the full file text as a string. You sent keys: ${Object.keys(a).join(', ') || '(none)'}. Call write_file again with path and content.`,
        )
      const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, text)
      return `Wrote ${text.length} chars to ${path.relative(root, file)}`
    }
    case 'edit_file': {
      const file = await safePath(root, a.path)
      if (typeof a.old_string !== 'string' || typeof a.new_string !== 'string')
        throw new Error('old_string and new_string are required')
      if (!a.old_string) throw new Error('old_string must not be empty')
      // Older tool calls are shrunk to "[N chars omitted]" in the history; models sometimes copy that literally.
      if (/^\[\d+ chars omitted\]$/.test(a.old_string.trim()) || /^\[\d+ chars omitted\]$/.test(a.new_string.trim()))
        throw new Error(
          'old_string/new_string was the placeholder "[N chars omitted]" that only appears in compacted history. Call read_file, then send the real text of the section to replace.',
        )
      const src = await fs.readFile(file, 'utf8')
      const count = src.split(a.old_string).length - 1
      if (count === 0) throw new Error('old_string not found. Re-read the file and copy the text exactly.')
      if (count > 1 && !a.replace_all)
        throw new Error(`old_string matches ${count} places. Add more context or set replace_all.`)
      await fs.writeFile(file, src.split(a.old_string).join(a.new_string))
      return `Edited ${path.relative(root, file)} (${count} replacement${count > 1 ? 's' : ''})`
    }
    case 'search': {
      if (!a.pattern) throw new Error('pattern is required')
      const re = toRegExp(String(a.pattern))
      const base = await safePath(root, a.path ?? '.')
      const files: string[] = []
      if ((await fs.stat(base)).isFile()) files.push(base)
      else await walk(base, files, 5000)
      const hits: string[] = []
      for (const f of files) {
        if (hits.length >= 100) break
        try {
          if ((await fs.stat(f)).size > 1_000_000) continue
          const text = await fs.readFile(f, 'utf8')
          if (text.includes('\0')) continue
          text.split('\n').forEach((l, i) => {
            if (hits.length < 100 && re.test(l))
              hits.push(`${path.relative(root, f)}:${i + 1}: ${l.trim().slice(0, 200)}`)
          })
        } catch {
          /* unreadable */
        }
      }
      return hits.join('\n') || 'No matches'
    }
    case 'run_command': {
      if (!a.command || typeof a.command !== 'string') throw new Error('command is required')
      return runCommand(a.command, root, signal)
    }
  }
}
