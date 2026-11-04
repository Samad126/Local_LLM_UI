import { promises as fs } from 'node:fs'
import path from 'node:path'

/** Resolve p inside root, following symlinks, refusing anything that escapes. */
export async function safePath(root: string, p: unknown): Promise<string> {
  if (typeof p !== 'string') throw new Error('path must be a string')
  const abs = path.resolve(root, p || '.')
  const outside = (x: string) => {
    const r = path.relative(root, x)
    return r.startsWith('..') || path.isAbsolute(r)
  }
  if (outside(abs)) throw new Error('Path is outside the workspace')
  // Follow symlinks on the nearest existing ancestor; the not-yet-existing tail can't be a link.
  let existing = abs
  const tail: string[] = []
  for (;;) {
    try {
      existing = await fs.realpath(existing)
      break
    } catch {
      const up = path.dirname(existing)
      if (up === existing) throw new Error('Path not found')
      tail.unshift(path.basename(existing))
      existing = up
    }
  }
  if (outside(path.join(existing, ...tail))) throw new Error('Path is outside the workspace')
  return abs
}
