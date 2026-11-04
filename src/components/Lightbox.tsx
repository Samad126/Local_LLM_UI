import { Copy, Download } from 'lucide-react'
import { useLightbox } from '../lightbox'
import { download } from '../lib/util'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function saveImage(b64: string, name: string) {
  const bin = atob(b64); const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u], { type: 'image/png' })); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/** Pop-up viewer for attachments: pasted/uploaded text, reply quotes and images. */
export function Lightbox() {
  const { item, close } = useLightbox()
  const image = item?.kind === 'image'
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && close()}>
      <DialogContent className={image ? 'max-w-[min(92vw,1100px)] sm:max-w-[min(92vw,1100px)] gap-3 grid-cols-[minmax(0,1fr)] overflow-hidden' : 'max-w-3xl sm:max-w-3xl gap-3 grid-cols-[minmax(0,1fr)] overflow-hidden'}>
        {item && (
          <>
            <DialogHeader className="min-w-0">
              <DialogTitle className="truncate pr-10" title={item.title}>{item.title}</DialogTitle>
              <DialogDescription>{image ? 'Image attachment' : item.kind === 'quote' ? 'Quoted reply' : `${item.body.length.toLocaleString()} characters`}</DialogDescription>
            </DialogHeader>
            {image
              ? <img src={`data:image/png;base64,${item.body}`} alt={item.title} className="max-h-[75vh] w-full rounded-lg object-contain" />
              : <pre className="max-h-[60vh] min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-lg bg-secondary p-4 font-mono text-sm leading-relaxed">{item.body}</pre>}
            <div className="flex justify-end gap-2">
              {!image && <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(item.body)}><Copy size={14} /> Copy</Button>}
              {item.kind !== 'quote' && (
                <Button size="sm" onClick={() => image ? saveImage(item.body, item.title) : download(item.title.includes('.') ? item.title : item.title + '.txt', item.body, 'text/plain;charset=utf-8')}>
                  <Download size={14} /> Download
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
