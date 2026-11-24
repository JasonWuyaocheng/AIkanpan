import { useEffect, useRef, useState } from 'react'
import { init, dispose, type Chart, type KLineData } from 'klinecharts'
import { api, type Quote, type KlineResponse } from '../../api/client'
import { fmtNum, pctClass, fmtPct } from '../../utils/format'
import { ErrorState, LoadingState } from '../RequestState'

const PERIODS = [
  { klt: 101 as const, label: '日K' },
  { klt: 102 as const, label: '周K' },
  { klt: 103 as const, label: '月K' },
]

const MAIN_INDICATORS = [
  { name: 'MA', label: 'MA', help: '移动平均线，观察价格趋势' },
  { name: 'BOLL', label: 'BOLL', help: '布林带，观察价格波动区间' },
]

const SUB_INDICATORS = [
  { name: 'VOL', label: '成交量', help: '每个周期的成交数量' },
  { name: 'MACD', label: 'MACD', help: '观察趋势与动量变化' },
  { name: 'KDJ', label: 'KDJ', help: '随机指标，观察短期超买超卖' },
  { name: 'RSI', label: 'RSI', help: '相对强弱指标，观察买卖力量' },
]

interface Props {
  active: boolean
  secid: string
}

export function KlinePanel({ active, secid }: Props) {
  const [klt, setKlt] = useState<101 | 102 | 103>(101)
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    MA: true,
    BOLL: false,
    VOL: true,
    MACD: true,
    KDJ: false,
    RSI: false,
  })
  const chartRef = useRef<Chart | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const loadRef = useRef<(() => void) | null>(null)
  const hasKlineRef = useRef(false)
  const [kline, setKline] = useState<KlineResponse | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!active || !containerRef.current) return
    const container = containerRef.current
    const chart = init(container)
    if (!chart) return
    chartRef.current = chart
    chart.setStyles({
      candle: {
        bar: {
          upColor: '#e03131',
          downColor: '#2f9e44',
          upBorderColor: '#e03131',
          downBorderColor: '#2f9e44',
          upWickColor: '#e03131',
          downWickColor: '#2f9e44',
        },
      },
    })
    return () => {
      dispose(container)
      chartRef.current = null
    }
  }, [active, secid])

  useEffect(() => {
    if (!active || !secid) return
    let alive = true
    let requestId = 0
    hasKlineRef.current = false
    setKline(null)
    setQuote(null)
    setError(null)
    setLoading(true)

    const load = async () => {
      const id = ++requestId
      if (hasKlineRef.current) setRefreshing(true)
      else setLoading(true)
      try {
        const [k, q] = await Promise.all([api.kline(secid, klt), api.stock(secid)])
        if (!alive || id !== requestId) return
        setKline(k)
        setQuote(q)
        setError(null)
        hasKlineRef.current = true
        const chart = chartRef.current
        if (chart) {
          const data: KLineData[] = k.bars.map((b) => ({
            timestamp: new Date(b.date).getTime(),
            open: b.open,
            close: b.close,
            high: b.high,
            low: b.low,
            volume: b.volume,
            turnover: b.turnover,
          }))
          chart.applyNewData(data)
        }
      } catch (err: any) {
        if (alive && id === requestId) setError(err?.message ?? '加载失败')
      } finally {
        if (alive && id === requestId) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }
    loadRef.current = () => { load().catch(() => undefined) }
    load()
    const timer = setInterval(load, 60_000)
    return () => {
      alive = false
      requestId += 1
      clearInterval(timer)
      loadRef.current = null
    }
  }, [active, secid, klt])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    for (const ind of [...MAIN_INDICATORS, ...SUB_INDICATORS]) {
      const byPane = chart.getIndicatorByPaneId()
      const existing = byPane instanceof Map ? byPane.get(ind.name) : byPane
      if (enabled[ind.name] && !existing) {
        chart.createIndicator(ind.name, false, MAIN_INDICATORS.some((m) => m.name === ind.name) ? undefined : { id: ind.name })
      } else if (!enabled[ind.name] && existing) {
        chart.removeIndicator(ind.name === 'MA' || ind.name === 'BOLL' ? 'main' : ind.name, ind.name)
      }
    }
  }, [enabled, kline, klt])

  if (!active) return null

  const toggle = (name: string) => setEnabled((e) => ({ ...e, [name]: !e[name] }))

  return (
    <div className="kline-page">
      <div className="stock-header">
        <span className="name">{kline?.name || quote?.name || secid}</span>
        <span className={`price ${pctClass(quote?.changePct ?? 0)}`}>{quote ? fmtNum(quote.price) : '--'}</span>
        <span className={pctClass(quote?.changePct ?? 0)}>
          {quote ? `${quote.change > 0 ? '+' : ''}${fmtNum(quote.change)}  ${fmtPct(quote.changePct)}` : ''}
        </span>
        <span className="meta">
          {quote
            ? `今开 ${fmtNum(quote.open)} · 最高 ${fmtNum(quote.high)} · 最低 ${fmtNum(quote.low)} · 昨收 ${fmtNum(quote.prevClose)} · 换手 ${quote.turnoverRate?.toFixed(2) ?? '-'}% · PE ${quote.peRatio?.toFixed(2) ?? '-'}`
            : '行情加载后显示开盘、最高、最低与换手率'}
        </span>
        {(kline?.stale || (error && kline)) && <span className="stale-badge">缓存数据</span>}
      </div>
      <div className="toolbar toolbar-leading">
        <div className="seg" aria-label="K线周期">
          {PERIODS.map((p) => (
            <button type="button" key={p.klt} className={klt === p.klt ? 'active' : ''} onClick={() => setKlt(p.klt)}>{p.label}</button>
          ))}
        </div>
        <div className="seg indicator-seg" aria-label="技术指标">
          {[...MAIN_INDICATORS, ...SUB_INDICATORS].map((ind) => (
            <button type="button" key={ind.name} title={ind.help} className={enabled[ind.name] ? 'active' : ''} onClick={() => toggle(ind.name)}>{ind.label}</button>
          ))}
        </div>
        {refreshing && <span className="refresh-state" role="status"><span className="spinner" aria-hidden="true" />正在刷新…</span>}
      </div>
      <div className="chart-wrap">
        <div id="kline-chart" ref={containerRef} />
        {loading && !kline && <div className="chart-state"><LoadingState label="正在加载 K 线…" /></div>}
        {error && !kline && <div className="chart-state"><ErrorState message={error} onRetry={() => loadRef.current?.()} /></div>}
        {error && kline && <ErrorState message={error} onRetry={() => loadRef.current?.()} stale compact />}
      </div>
    </div>
  )
}
