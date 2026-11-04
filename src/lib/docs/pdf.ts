import { parse, type Node } from './markdown'
import { latexToText } from './math'
import { officeToPdf } from '@/services/convertApi'

export async function buildPdf(text: string, buildDocx: () => Promise<Blob>) {
  // Preferred: build the DOCX, then convert it with LibreOffice on the local server (equations included).
  try {
    const pdf = await officeToPdf(await buildDocx(), 'docx')
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
