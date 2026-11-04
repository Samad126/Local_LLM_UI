import { useCallback, useEffect, useRef, useState } from 'react'
import { ollama } from '@/services/ollama'

export interface PullState {
  status: string
  pct: number
}

/** Runs any number of model pulls concurrently; each has its own progress and abort controller. */
export function usePulls(onSettled: () => void, onError: (msg: string) => void) {
  const [pulls, setPulls] = useState<Record<string, PullState>>({})
  const aborts = useRef(new Map<string, AbortController>())

  const start = useCallback(
    async (name: string) => {
      if (aborts.current.has(name)) return
      const ac = new AbortController()
      aborts.current.set(name, ac)
      setPulls((p) => ({ ...p, [name]: { status: 'starting', pct: 0 } }))
      try {
        for await (const c of ollama.pull(name, ac.signal)) {
          const pct = c.total ? ((c.completed ?? 0) / c.total) * 100 : 0
          setPulls((p) => ({ ...p, [name]: { status: c.status, pct: pct || p[name]?.pct || 0 } }))
        }
      } catch (e: any) {
        if (!ac.signal.aborted) onError(`${name}: ${e?.message ?? String(e)}`)
      } finally {
        aborts.current.delete(name)
        setPulls(({ [name]: _gone, ...rest }) => rest)
        onSettled()
      }
    },
    [onSettled, onError],
  )

  const cancel = useCallback((name: string) => aborts.current.get(name)?.abort(), [])

  useEffect(() => {
    const map = aborts.current
    return () => map.forEach((a) => a.abort())
  }, [])

  return { pulls, start, cancel }
}
