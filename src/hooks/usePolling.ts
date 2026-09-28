import { useEffect, useRef, useState } from 'react'

export function usePolling<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        const d = await fnRef.current()
        if (alive) {
          setData(d)
          setError(null)
        }
      } catch (err: any) {
        if (alive) setError(err?.message ?? '请求失败')
      }
      if (alive) timer = setTimeout(tick, intervalMs)
    }
    tick()
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps])

  function tickNow() {
    return fnRef.current()
  }

  return { data, error, refresh: tickNow }
}

export function useSse(onEvent: (event: string, data: any) => void) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    const es = new EventSource('/sse')
    const types = ['alert.triggered']
    const listeners: Array<[string, (e: MessageEvent) => void]> = []
    for (const type of types) {
      const fn = (e: MessageEvent) => handlerRef.current(type, JSON.parse(e.data))
      es.addEventListener(type, fn)
      listeners.push([type, fn])
    }
    return () => {
      for (const [type, fn] of listeners) es.removeEventListener(type, fn)
      es.close()
    }
  }, [])
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
