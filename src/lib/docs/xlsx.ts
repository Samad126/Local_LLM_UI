import { parseCsv } from './csv'

export async function buildXlsx(text: string) {
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
