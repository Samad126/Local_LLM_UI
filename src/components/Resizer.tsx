import { useCallback, useState } from 'react'

/** Width state for a right-hand panel, persisted, plus a drag handle that sits on its left edge. */
export function useResizable(key: string, initial: number, min = 300, max = 1100) {
  const [w, setW] = useState(() => {
    try {
      return Math.min(max, Math.max(min, Number(localStorage.getItem(key)) || initial))
    } catch {
      return initial
    }
  })
  const onDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX,
        startW = w
      let cur = w
      const move = (ev: PointerEvent) => {
        cur = Math.min(max, Math.max(min, startW + startX - ev.clientX))
        setW(cur)
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        try {
          localStorage.setItem(key, String(cur))
        } catch {
          /* ignore */
        }
      }
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [w, key, min, max],
  )
  const handle = (
    <div
      className="resizer"
      onPointerDown={onDown}
      onDoubleClick={() => setW(initial)}
      title="Drag to resize · double-click to reset"
    />
  )
  return { w, handle }
}
