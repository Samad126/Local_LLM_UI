/** Office file -> PDF through LibreOffice on the local server (null when unavailable). */
export async function officeToPdf(blob: Blob, ext: 'docx' | 'pptx'): Promise<Blob | null> {
  try {
    const r = await fetch('/api/convert/pdf?ext=' + ext, { method: 'POST', body: blob })
    return r.ok ? new Blob([await r.arrayBuffer()], { type: 'application/pdf' }) : null
  } catch {
    return null
  }
}
