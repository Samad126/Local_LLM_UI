import { parse, plain, type Node } from './markdown'
import { latexToText, prerenderMath } from './math'

/** Markdown -> slides. Slides are separated by `---` (or, without any, by each `#`/`##` heading). */
export async function buildPptx(text: string) {
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
