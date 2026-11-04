import type { Node } from './markdown'

export type MathImg = { data: Uint8Array; w: number; h: number }
let mjReady: Promise<any> | null = null
const loadMathJax = () =>
  (mjReady ??= (async () => {
    ;(window as any).MathJax = { svg: { fontCache: 'none' }, startup: { typeset: false } }
    await import('mathjax-full/es5/tex-svg.js' as string)
    const MJ = (window as any).MathJax
    await MJ.startup.promise
    return MJ
  })())
const mathCache = new Map<string, MathImg>()

async function mathToPng(tex: string, display: boolean): Promise<MathImg | null> {
  const key = (display ? 'D' : 'I') + tex
  if (mathCache.has(key)) return mathCache.get(key)!
  try {
    const MJ = await loadMathJax()
    const svg: string = MJ.tex2svg(tex, { display }).querySelector('svg').outerHTML
    const exW = parseFloat(svg.match(/width="([\d.]+)ex"/)?.[1] ?? '0'),
      exH = parseFloat(svg.match(/height="([\d.]+)ex"/)?.[1] ?? '0')
    if (!exW || !exH) return null
    const EX = display ? 9 : 7.4 // px per ex at the document font size
    const w = Math.max(1, Math.round(exW * EX)),
      h = Math.max(1, Math.round(exH * EX)),
      k = 3
    const img = new Image()
    const svgFixed = svg
      .replace(/(width|height)="[\d.]+ex"/g, '')
      .replace('<svg', `<svg width="${w * k}" height="${h * k}" fill="black"`)
      .replace(/currentColor/g, '#000')
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('math render'))
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgFixed)
    })
    const c = document.createElement('canvas')
    c.width = w * k
    c.height = h * k
    c.getContext('2d')!.drawImage(img, 0, 0, w * k, h * k)
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
    const out = { data: new Uint8Array(await blob.arrayBuffer()), w, h }
    mathCache.set(key, out)
    return out
  } catch (e) {
    console.warn('math render failed', e)
    return null
  }
}

const SUP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  n: 'ⁿ',
  x: 'ˣ',
  i: 'ⁱ',
}
const SUB: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  n: 'ₙ',
  x: 'ₓ',
  i: 'ᵢ',
}
const GREEK: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  sigma: 'σ',
  phi: 'φ',
  omega: 'ω',
  Delta: 'Δ',
  Sigma: 'Σ',
  Omega: 'Ω',
}
const SYM: Record<string, string> = {
  times: '×',
  div: '÷',
  cdot: '·',
  pm: '±',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  infty: '∞',
  to: '→',
  rightarrow: '→',
  Rightarrow: '⇒',
  circ: '°',
  sum: 'Σ',
  int: '∫',
  in: '∈',
  ldots: '…',
  cdots: '⋯',
}

/** Plain-text approximation of LaTeX, for the PDF fallback that cannot draw equations. */
export function latexToText(tex: string): string {
  let t = tex
  for (let i = 0; i < 4; i++)
    t = t
      .replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
      .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, '$1')
  t = t.replace(
    /\\([a-zA-Z]+)/g,
    (m, w) => GREEK[w] ?? SYM[w] ?? (['left', 'right', 'displaystyle'].includes(w) ? '' : m),
  )
  t = t.replace(/\^\{([^{}]*)\}|\^(\w)/g, (_m, a, b) => {
    const s = a ?? b
    return [...s].every((c: string) => SUP[c]) ? [...s].map((c: string) => SUP[c]).join('') : '^(' + s + ')'
  })
  t = t.replace(/_\{([^{}]*)\}|_(\w)/g, (_m, a, b) => {
    const s = a ?? b
    return [...s].every((c: string) => SUB[c]) ? [...s].map((c: string) => SUB[c]).join('') : '_(' + s + ')'
  })
  return t
    .replace(/\\[,;! ]/g, ' ')
    .replace(/\\%/g, '%')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function prerenderMath(tree: Node) {
  const jobs: Promise<void>[] = []
  const walk = (n: Node) => {
    if (n.type === 'inlineMath' || n.type === 'math')
      jobs.push(
        mathToPng(n.value, n.type === 'math').then((img) => {
          n.img = img
        }),
      )
    n.children?.forEach(walk)
  }
  walk(tree)
  await Promise.all(jobs)
}
