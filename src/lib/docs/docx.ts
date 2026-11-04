import { parse, plain, type Node } from './markdown'
import { latexToText, prerenderMath } from './math'

export async function buildDocx(text: string) {
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
        return n.value.split('\n').map(
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
