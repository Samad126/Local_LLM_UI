import { useEffect, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { useStore } from '@/stores/chatStore'

/** Full-window drop zone: blurs the app while files are dragged over it, then hands them to the composer. */
export function DropOverlay() {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const view = useStore((s) => s.view)

  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current++
      setOver(true)
    }
    const overEv = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'copy'
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (!depth.current) setOver(false)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setOver(false)
      const files = [...e.dataTransfer!.files]
      if (files.length) {
        useStore.getState().setView('chat')
        setTimeout(() => window.dispatchEvent(new CustomEvent('app:files', { detail: files })), 0)
      }
    }
    const end = () => {
      depth.current = 0
      setOver(false)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', overEv)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    window.addEventListener('dragend', end)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', overEv)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      window.removeEventListener('dragend', end)
    }
  }, [])

  if (!over) return null
  return (
    <div className="dropzone" aria-hidden>
      <div className="dropcard">
        <span className="dropicon">
          <FileUp size={34} strokeWidth={1.6} />
        </span>
        <h2>Drop files to add them to the chat</h2>
        <p>PDFs, text and code files{view === 'chat' ? ', and images for vision models' : ''}</p>
      </div>
    </div>
  )
}
