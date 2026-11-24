import { useEffect, useRef, useState } from 'react'
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
import { OnboardingGuide, TermHelp } from './components/HelpCenter'

type TabKey = 'watchlist' | 'kline' | 'rank' | 'position' | 'alert' | 'ai' | 'settings'
type NavMode = 'simple' | 'full'
type MenuKey = 'more' | 'help' | null

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'watchlist', label: '自选行情' },
  { key: 'kline', label: 'K线图' },
  { key: 'rank', label: '排行榜' },
  { key: 'position', label: '持仓' },
  { key: 'alert', label: '预警' },
  { key: 'ai', label: 'AI分析' },
  { key: 'settings', label: '设置' },
]
const SIMPLE_KEYS: TabKey[] = ['watchlist', 'kline', 'position', 'alert']
const MORE_KEYS: TabKey[] = ['rank', 'ai', 'settings']
const NAV_STORAGE_KEY = 'aikanpan.nav-mode'
const GUIDE_STORAGE_KEY = 'aikanpan.onboarding.v1'

interface Toast {
  id: number
  title: string
  body: string
}

function readPreference(key: string): string | null {
  try {
    const local = localStorage.getItem(key)
    if (local) return local
  } catch { /* 隐私模式下仍尝试非敏感 Cookie 备份 */ }
  const cookie = document.cookie.split('; ').find((item) => item.startsWith(`${key}=`))
  if (!cookie) return null
  try { return decodeURIComponent(cookie.slice(key.length + 1)) } catch { return null }
}

function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* Cookie 备份继续保存 */ }
  document.cookie = `${key}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`
}

function initialNavMode(): NavMode {
  return readPreference(NAV_STORAGE_KEY) === 'full' ? 'full' : 'simple'
}

function shouldShowGuide(): boolean {
  return !['done', 'skipped'].includes(readPreference(GUIDE_STORAGE_KEY) ?? '')
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
  const [navMode, setNavMode] = useState<NavMode>(initialNavMode)
  const [menu, setMenu] = useState<MenuKey>(null)
  const [guideOpen, setGuideOpen] = useState(shouldShowGuide)
  const [termHelpOpen, setTermHelpOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const desktop = window.aikanpanDesktop

  useEffect(() => {
    const t = setInterval(() => setMarketState(marketStateText()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useSse((event, data) => {
    if (event !== 'alert.triggered') return
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, title: `${data.name} 预警触发`, body: data.message }])
    setTimeout(() => setToasts((items) => items.filter((x) => x.id !== id)), 15_000)
    if (!desktop && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`${data.name} 预警触发`, { body: data.message })
    }
  })

  const changeNavMode = (mode: NavMode) => {
    setNavMode(mode)
    setMenu(null)
    savePreference(NAV_STORAGE_KEY, mode)
  }

  const finishGuide = (value: 'done' | 'skipped') => {
    savePreference(GUIDE_STORAGE_KEY, value)
    setGuideOpen(false)
  }

  const selectTab = (key: TabKey) => {
    setTab(key)
    setMenu(null)
  }

  const pickStock = async (item: SuggestItem) => {
    setSecid(item.secid)
    setTab('kline')
    try {
      await api.addWatch({ secid: item.secid, symbol: item.symbol, name: item.name })
    } catch {
      // 重复添加或网络异常时仍保留查看 K 线的能力。
    }
  }

  const visibleTabs = navMode === 'simple' ? TABS.filter((item) => SIMPLE_KEYS.includes(item.key)) : TABS
  const activeMore = MORE_KEYS.includes(tab)

  return (
    <>
      <header className="topbar">
        <span className="logo">AIkanpan</span>
        {desktop && <span className="desktop-badge">桌面版</span>}
        <span className="market-state"><span className="state-dot" aria-hidden="true" />{marketState}</span>
        <div className="topbar-spacer" />
        <SearchBox onPick={pickStock} />
      </header>
      <nav className="tabbar" aria-label="主导航" ref={menuRef} onKeyDown={(e) => e.key === 'Escape' && setMenu(null)}>
        <div className={menu === 'more' ? 'nav-tabs menu-open' : 'nav-tabs'}>
          {visibleTabs.map((item) => (
            <button
              type="button"
              aria-current={tab === item.key ? 'page' : undefined}
              key={item.key}
              className={tab === item.key ? 'active' : ''}
              onClick={() => selectTab(item.key)}
            >
              {item.label}
            </button>
          ))}
          {navMode === 'simple' && (
            <div className="menu-anchor">
              <button
                type="button"
                className={activeMore || menu === 'more' ? 'active more-trigger' : 'more-trigger'}
                aria-haspopup="menu"
                aria-expanded={menu === 'more'}
                onClick={() => setMenu((current) => current === 'more' ? null : 'more')}
              >
                更多{activeMore ? ` · ${TABS.find((item) => item.key === tab)?.label}` : ''}<span aria-hidden="true">⌄</span>
              </button>
              {menu === 'more' && (
                <div className="nav-menu" role="menu" aria-label="更多功能">
                  {TABS.filter((item) => MORE_KEYS.includes(item.key)).map((item) => (
                    <button type="button" role="menuitem" key={item.key} onClick={() => selectTab(item.key)}>
                      <span>{item.label}</span><small>{item.key === 'rank' ? '涨跌幅榜单' : item.key === 'ai' ? '可选 AI 助手' : 'AI 与本地数据'}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="nav-actions">
          <div className="seg nav-mode" aria-label="导航模式">
            <button type="button" className={navMode === 'simple' ? 'active' : ''} aria-pressed={navMode === 'simple'} onClick={() => changeNavMode('simple')}>简洁</button>
            <button type="button" className={navMode === 'full' ? 'active' : ''} aria-pressed={navMode === 'full'} onClick={() => changeNavMode('full')}>完整</button>
          </div>
          <div className="menu-anchor help-anchor">
            <button type="button" className="help-trigger" aria-haspopup="menu" aria-expanded={menu === 'help'} onClick={() => setMenu((current) => current === 'help' ? null : 'help')}>
              帮助<span aria-hidden="true">⌄</span>
            </button>
            {menu === 'help' && (
              <div className="nav-menu help-menu" role="menu" aria-label="帮助">
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setGuideOpen(true) }}><span>新手引导</span><small>重看四个常用步骤</small></button>
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setTermHelpOpen(true) }}><span>术语帮助</span><small>行情、持仓与技术指标</small></button>
              </div>
            )}
          </div>
        </div>
      </nav>
      <main className="main">
        <WatchlistPanel active={tab === 'watchlist'} onSelectStock={(s) => { setSecid(s); setTab('kline') }} />
        <KlinePanel active={tab === 'kline'} secid={secid} />
        <RankPanel active={tab === 'rank'} onSelectStock={(s) => { setSecid(s); setTab('kline') }} />
        <PositionPanel active={tab === 'position'} />
        <AlertPanel active={tab === 'alert'} />
        <AiPanel active={tab === 'ai'} secid={secid} onOpenSettings={() => selectTab('settings')} />
        <SettingsPanel active={tab === 'settings'} />
      </main>
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div className="toast" key={toast.id} role="status">
            <button type="button" className="toast-close" aria-label="关闭提醒" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}>×</button>
            <div className="title">{toast.title}</div>
            <div>{toast.body}</div>
          </div>
        ))}
      </div>
      {guideOpen && <OnboardingGuide onClose={() => finishGuide('skipped')} onFinish={() => finishGuide('done')} />}
      {termHelpOpen && <TermHelp onClose={() => setTermHelpOpen(false)} />}
    </>
  )
}
