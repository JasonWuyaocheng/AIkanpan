import { useEffect, useRef, useState } from 'react'
import { api, type SuggestItem } from '../../api/client'
import { useDebounced } from '../../hooks/usePolling'

interface Props {
  onPick: (item: SuggestItem) => void
  placeholder?: string
}

export function SearchBox({ onPick, placeholder = '搜索代码/名称/拼音' }: Props) {
  const [input, setInput] = useState('')
  const [items, setItems] = useState<SuggestItem[]>([])
  const [open, setOpen] = useState(false)
  const debounced = useDebounced(input, 300)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!debounced.trim()) {
      setItems([])
      return
    }
    let alive = true
    api
      .search(debounced.trim())
      .then((r) => {
        if (alive) {
          setItems(r.items)
          setOpen(true)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [debounced])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div className="searchbox" ref={boxRef}>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        placeholder={placeholder}
      />
      {open && items.length > 0 && (
        <div className="dropdown">
          {items.map((it) => (
            <div
              key={it.secid}
              className="item"
              onClick={() => {
                setOpen(false)
                setInput('')
                onPick(it)
              }}
            >
              <span>{it.name}</span>
              <span className="tag">{it.symbol}</span>
              <span className="tag">{it.market}</span>
              <span className="add">查看</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
