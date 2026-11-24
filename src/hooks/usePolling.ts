import { useCallback, useEffect, useRef, useState } from 'react'

export interface PollingResult<T> {
  data: T | null
  error: string | null
  loading: boolean
  refreshing: boolean
  stale: boolean
  lastUpdated: number | null
  refresh: () => Promise<T>
}

export function usePolling<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[] = []): PollingResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const fnRef = useRef(fn)
  const dataRef = useRef<T | null>(null)
  const requestId = useRef(0)
  fnRef.current = fn

  const execute = useCallback(async (): Promise<T> => {
    const id = ++requestId.current
    if (dataRef.current !== null) setRefreshing(true)
    else {
      setLoading(true)
      setError(null)
    }
    try {
      const result = await fnRef.current()
      if (id === requestId.current) {
        dataRef.current = result
        setData(result)
        setError(null)
        setLastUpdated(Date.now())
      }
      return result
    } catch (err: any) {
      if (id === requestId.current) setError(err?.message ?? '请求失败')
      throw err
    } finally {
      if (id === requestId.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    requestId.current += 1
    dataRef.current = null
    setData(null)
    setError(null)
    setLoading(true)
    setRefreshing(false)
    setLastUpdated(null)

    const tick = async () => {
      try {
        await execute()
      } catch {
        // 错误已由 execute 暴露给界面；轮询继续运行。
      }
      if (alive) timer = setTimeout(tick, intervalMs)
    }
    tick()
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // deps 由调用方显式控制，避免每次渲染重启轮询。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, execute, ...deps])

  return {
    data,
    error,
    loading,
    refreshing,
    stale: error !== null && data !== null,
    lastUpdated,
    refresh: execute,
  }
}

export function useSse(onEvent: (event: string, data: any) => void) {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    const token = window.aikanpanDesktop?.token
    const es = new EventSource(token ? `/sse?token=${encodeURIComponent(token)}` : '/sse')
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
