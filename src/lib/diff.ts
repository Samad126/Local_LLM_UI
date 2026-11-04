export type DiffRow = { t: ' ' | '-' | '+'; s: string }
/** Line diff via LCS: unchanged lines stay as context, like `git diff`. */
export function lineDiff(a: string, b: string): DiffRow[] {
  const x = a.split('\n'),
    y = b.split('\n')
  if (x.length * y.length > 250_000)
    return [...x.map((s) => ({ t: '-' as const, s })), ...y.map((s) => ({ t: '+' as const, s }))]
  const L = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1))
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const out: DiffRow[] = []
  let i = 0,
    j = 0
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      out.push({ t: ' ', s: x[i] })
      i++
      j++
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: '-', s: x[i++] })
    else out.push({ t: '+', s: y[j++] })
  }
  while (i < x.length) out.push({ t: '-', s: x[i++] })
  while (j < y.length) out.push({ t: '+', s: y[j++] })
  return out
}
