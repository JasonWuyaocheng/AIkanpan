import { useEffect, useRef, useState } from 'react'
import { api, type SuggestItem } from '../../api/client'
import { useDebounced } from '../../hooks/usePolling'
import { LoadingState } from '../RequestState'

interface Props {
  onPick: (item: SuggestItem) => void
  placeholder?: string
}

export function SearchBox({ onPick, placeholder = '搜索代码 / 名称 / 拼音' }: Props) {
  const [input, setInput] = useState('')
  const [items, setItems] = useState<SuggestItem[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const debounced = useDebounced(input, 300)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const query = debounced.trim()
    if (!query) {
      setItems([])
      setLoading(false)
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    api
      .search(query)
      .then((r) => {
        if (!alive) return
        setItems(r.items)
        setOpen(true)
      })
      .catch((err: any) => {
        if (!alive) return
        setError(err?.message ?? '搜索失败')
        setOpen(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [debounced, retryKey])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (item: SuggestItem) => {
    setOpen(false)
    setInput('')
    setItems([])
    onPick(item)
  }

  return (
    <div className="searchbox" ref={boxRef}>
      <input
        ref={inputRef}
        role="combobox"
        aria-label="搜索股票"
        aria-expanded={open}
        aria-controls="stock-search-results"
        aria-autocomplete="list"
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          setOpen(true)
        }}
        onFocus={() => (items.length > 0 || loading || error) && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
          if (e.key === 'Enter' && items[0]) {
            e.preventDefault()
            pick(items[0])
          }
          if (e.key === 'ArrowDown' && open) {
            e.preventDefault()
            boxRef.current?.querySelector<HTMLButtonElement>('.search-result')?.focus()
          }
        }}
        placeholder={placeholder}
      />
      {open && (loading || error || items.length > 0) && (
        <div className="dropdown" id="stock-search-results" role="listbox" aria-label="搜索结果">
          {loading && <LoadingState compact label="正在搜索…" />}
          {error && (
            <div className="search-error" role="alert">
              <span>搜索失败：{error}</span>
              <button type="button" className="btn small" onClick={() => setRetryKey((n) => n + 1)}>
                重试
              </button>
            </div>
          )}
          {!loading && !error && items.length === 0 && <div className="empty compact">没有找到匹配股票</div>}
          {!loading && items.map((it) => (
            <button
              type="button"
              role="option"
              aria-selected="false"
              key={it.secid}
              className="item search-result"
              onClick={() => pick(it)}
            >
              <span>{it.name}</span>
              <span className="tag">{it.symbol}</span>
              <span className="tag">{it.market}</span>
              <span className="add">查看并加自选</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
