/** Trigger a browser download of `blob` as `name`. */
export function saveBlob(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export function download(name: string, text: string, type = 'application/json') {
  saveBlob(name, new Blob([text], { type }))
}

export function base64ToBlob(b64: string, type = 'image/png'): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

export const saveBase64Image = (b64: string, name: string) => saveBlob(name, base64ToBlob(b64))
