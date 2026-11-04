// Turns model-written markdown/CSV into downloadable pdf / docx / xlsx files, entirely in the browser.
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

export type DocKind = 'pdf' | 'docx' | 'xlsx' | 'pptx'
export const DOC_KINDS: DocKind[] = ['pdf', 'docx', 'xlsx', 'pptx']
/**
 * A pdf/docx/pptx/xlsx block often contains its own ```python blocks, which would end the outer fence early and
 * spill the rest of the document into the chat. Track nesting and widen the outer fence (````) so it stays one block.
 */
export function normalizeFences(text: string): string {
  if (!/```(pdf|docx|pptx|xlsx)/.test(text)) return text
  const lines = text.split('\n')
  let start = -1,
    depth = 0,
    inner = 3
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(`{3,})([\w-]*)\s*$/.exec(lines[i])
    if (!m) continue
    if (start < 0) {
      if (isDocKind(m[2]) && m[1].length === 3) {
        start = i
        depth = 0
        inner = 3
      }
      continue
    }
    inner = Math.max(inner, m[1].length)
    if (m[2]) depth++
    else if (depth > 0) depth--
    else {
      const fence = '`'.repeat(inner + 1)
      lines[start] = lines[start].replace(/`{3,}/, fence)
      lines[i] = fence
      start = -1
    }
  }
  if (start >= 0) lines[start] = lines[start].replace(/`{3,}/, '`'.repeat(inner + 1))
  return lines.join('\n')
}

export const isDocKind = (l?: string): l is DocKind => !!l && (DOC_KINDS as string[]).includes(l)

type Node = any
// ---------- LaTeX ----------
type MathImg = { data: Uint8Array; w: number; h: number }
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

async function prerenderMath(tree: Node) {
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

/** Models sometimes emit raw HTML (<details>, <strong>…) in documents; turn it into plain markdown. */
export const cleanDoc = (md: string) =>
  md
    .replace(/<\/?(strong|b)>/gi, '**')
    .replace(/<\/?(em|i)>/gi, '*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(details|summary|div|span|p|u|font|center)\b[^>]*>/gi, '')
const parse = (md: string): Node => unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(cleanDoc(md))
const plain = (n: Node): string => n.value ?? (n.children ?? []).map(plain).join('')

export function docName(kind: DocKind, text: string) {
  const first =
    cleanDoc(text)
      .split('\n')
      .find((l) => l.trim()) ?? ''
  const base = (kind === 'xlsx' ? '' : first.replace(/^#{1,3}\s+/, '').replace(/[*_`]/g, '')) || 'document'
  return (
    base
      .replace(/[^\w\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60)
      .toLowerCase() +
    '.' +
    kind
  )
}

// ---------- CSV ----------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else q = false
      } else cell += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

/** Markdown preview for any doc kind (xlsx is CSV → table). */
export function toPreviewMarkdown(kind: DocKind, text: string) {
  if (kind === 'pptx') return cleanDoc(text).replace(/^\s*---\s*$/gm, '\n---\n')
  if (kind !== 'xlsx') return cleanDoc(text)
  const rows = parseCsv(text)
  if (!rows.length) return ''
  const esc = (s: string) => s.replace(/\|/g, '\\|')
  return [
    `| ${rows[0].map(esc).join(' | ')} |`,
    `|${rows[0].map(() => '---').join('|')}|`,
    ...rows.slice(1).map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n')
}

// ---------- XLSX ----------
async function buildXlsx(text: string) {
  const mod: any = await import('exceljs')
  const wb = new (mod.default ?? mod).Workbook()
  const ws = wb.addWorksheet('Sheet1')
  for (const r of parseCsv(text)) ws.addRow(r.map((c) => (c.trim() !== '' && !isNaN(Number(c)) ? Number(c) : c)))
  ws.getRow(1).font = { bold: true }
  ws.columns.forEach((col: any) => {
    let w = 8
    col.eachCell?.({ includeEmpty: false }, (c: any) => {
      w = Math.max(w, String(c.value ?? '').length + 2)
    })
    col.width = Math.min(w, 60)
  })
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// ---------- DOCX ----------
async function buildDocx(text: string) {
  const d = await import('docx')
  const HEAD = [
    d.HeadingLevel.HEADING_1,
    d.HeadingLevel.HEADING_1,
    d.HeadingLevel.HEADING_2,
    d.HeadingLevel.HEADING_3,
    d.HeadingLevel.HEADING_4,
    d.HeadingLevel.HEADING_5,
    d.HeadingLevel.HEADING_6,
  ]
  const runs = (n: Node, st: any = {}): any[] => {
    switch (n.type) {
      case 'text':
        return [new d.TextRun({ text: n.value, ...st })]
      case 'strong':
        return n.children.flatMap((c: Node) => runs(c, { ...st, bold: true }))
      case 'emphasis':
        return n.children.flatMap((c: Node) => runs(c, { ...st, italics: true }))
      case 'delete':
        return n.children.flatMap((c: Node) => runs(c, { ...st, strike: true }))
      case 'inlineCode':
        return [new d.TextRun({ text: n.value, font: 'Consolas', ...st })]
      case 'break':
        return [new d.TextRun({ text: '', break: 1 })]
      case 'inlineMath':
        return n.img
          ? [
              new d.ImageRun({
                type: 'png',
                data: n.img.data,
                transformation: { width: n.img.w, height: n.img.h },
                altText: { name: 'math', title: 'math', description: n.value },
              }),
            ]
          : [new d.TextRun({ text: latexToText(n.value), italics: true, ...st })]
      case 'link':
        return n.children.flatMap((c: Node) => runs(c, { ...st, color: '2563EB', underline: {} }))
      default:
        return n.children
          ? n.children.flatMap((c: Node) => runs(c, st))
          : n.value
            ? [new d.TextRun({ text: n.value, ...st })]
            : []
    }
  }
  const block = (n: Node, level = 0, num?: number): any[] => {
    switch (n.type) {
      case 'heading':
        return [new d.Paragraph({ heading: HEAD[n.depth], children: runs(n), spacing: { before: 240, after: 120 } })]
      case 'paragraph':
        return [new d.Paragraph({ children: runs(n), spacing: { after: 120 } })]
      case 'math':
        return [
          new d.Paragraph({
            alignment: d.AlignmentType.CENTER,
            spacing: { before: 120, after: 160 },
            children: n.img
              ? [
                  new d.ImageRun({
                    type: 'png',
                    data: n.img.data,
                    transformation: { width: n.img.w, height: n.img.h },
                    altText: { name: 'math', title: 'math', description: n.value },
                  }),
                ]
              : [new d.TextRun({ text: latexToText(n.value), italics: true })],
          }),
        ]
      case 'code':
        return n.value
          .split('\n')
          .map(
            (l: string) =>
              new d.Paragraph({
                children: [new d.TextRun({ text: l, font: 'Consolas', size: 20 })],
                shading: { type: d.ShadingType.CLEAR, fill: 'F4F4F5' },
              }),
          )
      case 'blockquote':
        return n.children.flatMap((c: Node) => block(c, level)).map((p: any) => p)
      case 'thematicBreak':
        return [
          new d.Paragraph({ border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } } }),
        ]
      case 'list':
        return n.children.flatMap((li: Node, i: number) =>
          li.children.flatMap((c: Node) => {
            if (c.type === 'list') return block(c, level + 1)
            if (c.type !== 'paragraph') return block(c, level)
            return [
              new d.Paragraph(
                n.ordered
                  ? {
                      children: [new d.TextRun({ text: `${(n.start ?? 1) + i}. ` }), ...runs(c)],
                      indent: { left: 360 * (level + 1) },
                    }
                  : { children: runs(c), bullet: { level: Math.min(level, 8) } },
              ),
            ]
          }),
        )
      case 'table': {
        const cols = n.children[0].children.length
        return [
          new d.Table({
            width: { size: 100, type: d.WidthType.PERCENTAGE },
            rows: n.children.map(
              (r: Node, ri: number) =>
                new d.TableRow({
                  tableHeader: ri === 0,
                  children: r.children.map(
                    (c: Node) =>
                      new d.TableCell({
                        width: { size: 100 / cols, type: d.WidthType.PERCENTAGE },
                        shading: ri === 0 ? { type: d.ShadingType.CLEAR, fill: 'E4E4E7' } : undefined,
                        children: [new d.Paragraph({ children: runs(c, ri === 0 ? { bold: true } : {}) })],
                      }),
                  ),
                }),
            ),
          }),
          new d.Paragraph({}),
        ]
      }
      default:
        return n.children ? n.children.flatMap((c: Node) => block(c, level)) : []
    }
  }
  const tree = parse(text)
  await prerenderMath(tree)
  const doc = new d.Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: tree.children.flatMap((n: Node) => block(n)) }],
  })
  return d.Packer.toBlob(doc)
}

// ---------- PDF ----------
async function buildPdf(text: string) {
  // Preferred: build the DOCX, then convert it with LibreOffice on the local server (equations included).
  try {
    const pdf = await officeToPdf(await buildDoc('docx', text), 'docx')
    if (pdf) return pdf
  } catch {
    /* fall through to the built-in renderer */
  }
  return buildPdfBasic(text)
}

async function buildPdfBasic(text: string) {
  const pdfMake: any = (await import('pdfmake/build/pdfmake' as string)).default
  const vfs: any = (await import('pdfmake/build/vfs_fonts' as string)).default
  pdfMake.addVirtualFileSystem(vfs)
  const inl = (n: Node, st: any = {}): any[] => {
    switch (n.type) {
      case 'text':
        return [{ text: n.value, ...st }]
      case 'strong':
        return n.children.flatMap((c: Node) => inl(c, { ...st, bold: true }))
      case 'emphasis':
        return n.children.flatMap((c: Node) => inl(c, { ...st, italics: true }))
      case 'delete':
        return n.children.flatMap((c: Node) => inl(c, { ...st, decoration: 'lineThrough' }))
      case 'inlineCode':
        return [{ text: n.value, background: '#f4f4f5', ...st }]
      case 'break':
        return [{ text: '\n' }]
      case 'inlineMath':
        return [{ text: latexToText(n.value), italics: true, ...st }]
      case 'link':
        return n.children.flatMap((c: Node) => inl(c, { ...st, color: '#2563eb', link: n.url }))
      default:
        return n.children ? n.children.flatMap((c: Node) => inl(c, st)) : n.value ? [{ text: n.value, ...st }] : []
    }
  }
  const SIZES = [0, 22, 18, 15, 13, 12, 11]
  const blk = (n: Node): any => {
    switch (n.type) {
      case 'heading':
        return { text: inl(n), fontSize: SIZES[n.depth], bold: true, margin: [0, n.depth === 1 ? 4 : 10, 0, 6] }
      case 'paragraph':
        return { text: inl(n), margin: [0, 0, 0, 8] }
      case 'math':
        return { text: latexToText(n.value), italics: true, alignment: 'center', margin: [0, 4, 0, 10] }
      case 'code':
        return {
          table: {
            widths: ['*'],
            body: [[{ text: n.value, font: 'Roboto', fontSize: 9, preserveLeadingSpaces: true }]],
          },
          layout: { fillColor: () => '#f4f4f5', hLineWidth: () => 0, vLineWidth: () => 0 },
          margin: [0, 0, 0, 8],
        }
      case 'blockquote':
        return { stack: n.children.map(blk), margin: [12, 0, 0, 8], color: '#52525b' }
      case 'thematicBreak':
        return {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }],
          margin: [0, 6, 0, 10],
        }
      case 'list': {
        const items = n.children.map((li: Node) => ({ stack: li.children.map(blk) }))
        return n.ordered
          ? { ol: items, start: n.start ?? 1, margin: [0, 0, 0, 8] }
          : { ul: items, margin: [0, 0, 0, 8] }
      }
      case 'table':
        return {
          table: {
            headerRows: 1,
            widths: n.children[0].children.map(() => '*'),
            body: n.children.map((r: Node, ri: number) =>
              r.children.map((c: Node) => ({ text: inl(c), bold: ri === 0, fontSize: 10 })),
            ),
          },
          layout: {
            fillColor: (i: number) => (i === 0 ? '#e4e4e7' : null),
            hLineColor: () => '#d4d4d8',
            vLineColor: () => '#d4d4d8',
          },
          margin: [0, 0, 0, 10],
        }
      default:
        return n.children ? { stack: n.children.map(blk) } : { text: '' }
    }
  }
  const def = {
    pageSize: 'A4',
    pageMargins: [40, 48, 40, 48],
    defaultStyle: { fontSize: 11, lineHeight: 1.25 },
    content: parse(text).children.map(blk),
  }
  return await pdfMake.createPdf(def).getBlob()
}

// ---------- PPTX ----------
/** Markdown -> slides. Slides are separated by `---` (or, without any, by each `#`/`##` heading). */
async function buildPptx(text: string) {
  const PptxGenJS: any = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  const ACCENT = '2563EB',
    INK = '18181B',
    MUTED = '52525B'
  const tree = parse(text)
  await prerenderMath(tree)
  let groups: Node[][] = [[]]
  const hasRule = tree.children.some((n: Node) => n.type === 'thematicBreak')
  for (const n of tree.children) {
    if (n.type === 'thematicBreak') groups.push([])
    else if (!hasRule && n.type === 'heading' && n.depth <= 2 && groups[groups.length - 1].length) groups.push([n])
    else groups[groups.length - 1].push(n)
  }
  groups = groups.filter((g) => g.length)
  const runs = (n: Node, st: any = {}): any[] => {
    switch (n.type) {
      case 'text':
        return [{ text: n.value, options: { ...st } }]
      case 'strong':
        return n.children.flatMap((c: Node) => runs(c, { ...st, bold: true }))
      case 'emphasis':
        return n.children.flatMap((c: Node) => runs(c, { ...st, italic: true }))
      case 'inlineCode':
        return [{ text: n.value, options: { ...st, fontFace: 'Consolas' } }]
      case 'inlineMath':
        return [{ text: latexToText(n.value), options: { ...st, italic: true } }]
      case 'break':
        return [{ text: ' ', options: { ...st } }]
      default:
        return n.children
          ? n.children.flatMap((c: Node) => runs(c, st))
          : n.value
            ? [{ text: n.value, options: { ...st } }]
            : []
    }
  }
  groups.forEach((g, si) => {
    const slide = pptx.addSlide()
    const h = g.find((n) => n.type === 'heading')
    const body = g.filter((n) => n !== h)
    const notes: string[] = []
    const items: any[] = []
    const addItems = (n: Node, level = 0) => {
      if (n.type === 'paragraph') {
        const t = plain(n)
        if (/^notes?:/i.test(t)) {
          notes.push(t.replace(/^notes?:\s*/i, ''))
          return
        }
        items.push(
          ...runs(n, { color: MUTED }).map((r, i, a) =>
            i === a.length - 1 ? { ...r, options: { ...r.options, breakLine: true } } : r,
          ),
        )
      } else if (n.type === 'list') {
        n.children.forEach((li: Node) =>
          li.children.forEach((c: Node) => {
            if (c.type === 'list') addItems(c, level + 1)
            else
              items.push(
                ...runs(c).map((r, i, a) => ({
                  ...r,
                  options: {
                    ...r.options,
                    ...(i === 0 ? { bullet: true, indentLevel: level } : {}),
                    breakLine: i === a.length - 1,
                  },
                })),
              )
          }),
        )
      } else if (n.type === 'math')
        items.push({ text: latexToText(n.value), options: { italic: true, breakLine: true, align: 'center' } })
      else if (n.type === 'code')
        items.push({ text: n.value, options: { fontFace: 'Consolas', fontSize: 14, breakLine: true } })
    }
    body.filter((n) => n.type !== 'table').forEach((n) => addItems(n))
    const table = body.find((n) => n.type === 'table')
    const title = h ? plain(h) : ''
    const titleSlide = si === 0 && h?.depth === 1 && !body.some((n) => n.type === 'list' || n.type === 'table')
    if (titleSlide) {
      slide.background = { color: '0B1220' }
      slide.addShape('rect', { x: 0.7, y: 3.55, w: 1.4, h: 0.08, fill: { color: ACCENT }, line: { color: ACCENT } })
      slide.addText(title, {
        x: 0.7,
        y: 1.6,
        w: 11.9,
        h: 1.9,
        fontSize: 44,
        bold: true,
        color: 'FFFFFF',
        valign: 'bottom',
        fontFace: 'Calibri',
      })
      if (items.length)
        slide.addText(
          items.map((r) => ({ ...r, options: { ...r.options, color: 'A1A1AA' } })),
          { x: 0.7, y: 3.85, w: 11.9, h: 1.6, fontSize: 22, valign: 'top', fontFace: 'Calibri' },
        )
    } else {
      slide.background = { color: 'FFFFFF' }
      slide.addShape('rect', { x: 0, y: 0, w: 0.25, h: 7.5, fill: { color: ACCENT }, line: { color: ACCENT } })
      if (title)
        slide.addText(title, {
          x: 0.8,
          y: 0.45,
          w: 11.8,
          h: 1,
          fontSize: 32,
          bold: true,
          color: INK,
          valign: 'middle',
          fontFace: 'Calibri',
        })
      const chars = items.reduce((n, r) => n + String(r.text).length, 0)
      const size = chars > 900 ? 14 : chars > 600 ? 16 : chars > 350 ? 18 : 22
      const tableRows = table ? table.children.length : 0
      if (items.length)
        slide.addText(
          items.map((r) => ({ ...r, options: { color: INK, ...r.options } })),
          {
            x: 0.8,
            y: 1.6,
            w: 11.8,
            h: table ? 1.6 : 5.2,
            fontSize: size,
            valign: 'top',
            paraSpaceAfter: 8,
            fontFace: 'Calibri',
          },
        )
      if (table) {
        const rows = table.children.map((r: Node, ri: number) =>
          r.children.map((c: Node) => ({
            text: plain(c),
            options: {
              bold: ri === 0,
              color: ri === 0 ? 'FFFFFF' : INK,
              fill: { color: ri === 0 ? ACCENT : ri % 2 ? 'F4F4F5' : 'FFFFFF' },
              fontSize: tableRows > 8 ? 12 : 16,
            },
          })),
        )
        slide.addTable(rows, {
          x: 0.8,
          y: items.length ? 3.4 : 1.7,
          w: 11.8,
          border: { type: 'solid', color: 'D4D4D8', pt: 0.5 },
          fontFace: 'Calibri',
        })
      }
      slide.addText(String(si + 1), { x: 12.2, y: 6.95, w: 0.6, h: 0.3, fontSize: 11, color: '71717A', align: 'right' })
    }
    if (notes.length) slide.addNotes(notes.join('\n'))
  })
  return (await pptx.write({ outputType: 'blob' })) as Blob
}

const docCache = new Map<string, Promise<Blob>>()
/** Build (and memoize) a file so the card, preview and download share one result. */
export function buildDoc(kind: DocKind, text: string): Promise<Blob> {
  const key = kind + '\0' + text
  let p = docCache.get(key)
  if (!p) {
    p =
      kind === 'pdf'
        ? buildPdf(text)
        : kind === 'docx'
          ? buildDocx(text)
          : kind === 'pptx'
            ? buildPptx(text)
            : buildXlsx(text)
    p.catch(() => docCache.delete(key))
    docCache.set(key, p)
    if (docCache.size > 12) docCache.delete(docCache.keys().next().value!)
  }
  return p
}

/** Office file -> PDF through LibreOffice on the local server (null when unavailable). */
export async function officeToPdf(blob: Blob, ext: 'docx' | 'pptx'): Promise<Blob | null> {
  try {
    const r = await fetch('/api/convert/pdf?ext=' + ext, { method: 'POST', body: blob })
    return r.ok ? new Blob([await r.arrayBuffer()], { type: 'application/pdf' }) : null
  } catch {
    return null
  }
}

/** PDF rendition of a deck, for the viewer. */
export async function pptxPdf(text: string): Promise<Blob | null> {
  return officeToPdf(await buildDoc('pptx', text), 'pptx')
}

export function saveBlob(kind: DocKind, text: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = docName(kind, text)
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export async function downloadDoc(kind: DocKind, text: string) {
  saveBlob(kind, text, await buildDoc(kind, text))
}
