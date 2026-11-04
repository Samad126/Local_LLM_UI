import { useEffect, useRef } from 'react'

const NEAR_BOTTOM_PX = 24

/**
 * Keep a scroll container pinned to the bottom while content streams in, until the user scrolls up;
 * scrolling back to the bottom re-engages it. `changeKey` should change whenever the content grows.
 */
export function useStickToBottom(resetKey: string | undefined, changeKey: string) {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  // Coalesce updates into one scroll per frame.
  useEffect(() => {
    if (!stick.current) return
    const id = requestAnimationFrame(() => {
      const el = ref.current
      if (el && stick.current) el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [changeKey])
  useEffect(() => {
    stick.current = true
  }, [resetKey])

  const distance = (el: HTMLElement) => el.scrollHeight - el.scrollTop - el.clientHeight
  return {
    ref,
    handlers: {
      onWheel: (e: React.WheelEvent) => {
        if (e.deltaY < 0) stick.current = false
      },
      onTouchMove: () => {
        if (ref.current && distance(ref.current) > NEAR_BOTTOM_PX) stick.current = false
      },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) stick.current = false
      },
      onScroll: (e: React.UIEvent<HTMLElement>) => {
        if (distance(e.currentTarget) < NEAR_BOTTOM_PX) stick.current = true
      },
    },
  }
}
