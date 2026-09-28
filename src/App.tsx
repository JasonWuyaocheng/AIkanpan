import { useEffect, useState } from 'react'
import type { SuggestItem } from './api/client'
import { api } from './api/client'
import { useSse } from './hooks/usePolling'
import { SearchBox } from './components/quote/SearchBox'
import { WatchlistPanel } from './components/quote/WatchlistPanel'
import { RankPanel } from './components/quote/RankPanel'
import { KlinePanel } from './components/chart/KlinePanel'
import { PositionPanel } from './components/position/PositionPanel'
import { AlertPanel } from './components/alert/AlertPanel'
import { AiPanel } from './components/ai/AiPanel'
import { SettingsPanel } from './components/settings/SettingsPanel'

type TabKey = 'watchlist' | 'kline' | 'rank' | 'position' | 'alert' | 'ai' | 'settings'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'watchlist', label: '自选行情' },
  { key: 'kline', label: 'K线图' },
  { key: 'rank', label: '排行榜' },
  { key: 'position', label: '持仓' },
  { key: 'alert', label: '预警' },
  { key: 'ai', label: 'AI分析' },
  { key: 'settings', label: '设置' },
]

interface Toast {
  id: number
  title: string
  body: string
}

function marketStateText(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = get('weekday')
  if (weekday === 'Sat' || weekday === 'Sun') return '周末休市'
  const minutes = Number(get('hour')) * 60 + Number(get('minute'))
  if (minutes >= 570 && minutes < 690) return '早盘交易中'
  if (minutes >= 690 && minutes < 780) return '午间休市'
  if (minutes >= 780 && minutes < 900) return '午盘交易中'
  return '已收盘'
}

export default function App() {
  const [tab, setTab] = useState<TabKey>('watchlist')
  const [secid, setSecid] = useState('1.600519')
  const [marketState, setMarketState] = useState(marketStateText())
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const t = setInterval(() => setMarketState(marketStateText()), 30_000)
    return () => clearInterval(t)
  }, [])

  useSse((event, data) => {
    if (event !== 'alert.triggered') return
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, title: `${data.name} 预警触发`, body: data.message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 15_000)
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`${data.name} 预警触发`, { body: data.message })
    }
  })

  const pickStock = async (item: SuggestItem) => {
    setSecid(item.secid)
    setTab('kline')
    // 顺手加入自选（重复添加会被后端 409 忽略）
    try {
      await api.addWatch({ secid: item.secid, symbol: item.symbol, name: item.name })
    } catch {
      // already in watchlist
    }
  }

  return (
    <>
      <div className="topbar">
        <span className="logo">AIkanpan</span>
        <span className="market-state">{marketState}</span>
        <div className="spacer" />
        <SearchBox onPick={pickStock} />
      </div>
      <div className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="main">
        <WatchlistPanel
          active={tab === 'watchlist'}
          onSelectStock={(s) => {
            setSecid(s)
            setTab('kline')
          }}
        />
        <KlinePanel active={tab === 'kline'} secid={secid} />
        <RankPanel
          active={tab === 'rank'}
          onSelectStock={(s) => {
            setSecid(s)
            setTab('kline')
          }}
        />
        <PositionPanel active={tab === 'position'} />
        <AlertPanel active={tab === 'alert'} />
        <AiPanel active={tab === 'ai'} secid={secid} />
        <SettingsPanel active={tab === 'settings'} />
      </div>
      <div className="toasts">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <div className="title">{t.title}</div>
            <div>{t.body}</div>
          </div>
        ))}
      </div>
    </>
  )
}
