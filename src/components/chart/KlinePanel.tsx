import { useEffect, useRef, useState } from 'react'
import { init, dispose, type Chart, type KLineData } from 'klinecharts'
import { api, type Quote, type KlineResponse } from '../../api/client'
import { fmtNum, pctClass, fmtPct } from '../../utils/format'

const PERIODS = [
  { klt: 101 as const, label: '日K' },
  { klt: 102 as const, label: '周K' },
  { klt: 103 as const, label: '月K' },
]

const MAIN_INDICATORS = [
  { name: 'MA', label: 'MA' },
  { name: 'BOLL', label: 'BOLL' },
]

const SUB_INDICATORS = [
  { name: 'VOL', label: '成交量' },
  { name: 'MACD', label: 'MACD' },
  { name: 'KDJ', label: 'KDJ' },
  { name: 'RSI', label: 'RSI' },
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
  const [kline, setKline] = useState<KlineResponse | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active || !containerRef.current) return
    const chart = init(containerRef.current)
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
      dispose(containerRef.current!)
      chartRef.current = null
    }
  }, [active, secid])

  useEffect(() => {
    if (!active || !secid) return
    let alive = true
    const load = async () => {
      try {
        const [k, q] = await Promise.all([api.kline(secid, klt), api.stock(secid)])
        if (!alive) return
        setKline(k)
        setQuote(q)
        setError(null)
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
        if (alive) setError(err?.message ?? '加载失败')
      }
    }
    load()
    const timer = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(timer)
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
    <div>
      <div className="stock-header">
        <span className="name">{kline?.name || quote?.name || secid}</span>
        <span className={`price ${pctClass(quote?.changePct ?? 0)}`}>{quote ? fmtNum(quote.price) : '--'}</span>
        <span className={pctClass(quote?.changePct ?? 0)}>
          {quote ? `${quote.change > 0 ? '+' : ''}${fmtNum(quote.change)}  ${fmtPct(quote.changePct)}` : ''}
        </span>
        <span className="meta">
          今开 {fmtNum(quote?.open ?? 0)} · 最高 {fmtNum(quote?.high ?? 0)} · 最低 {fmtNum(quote?.low ?? 0)} · 昨收{' '}
          {fmtNum(quote?.prevClose ?? 0)} · 换手 {quote?.turnoverRate?.toFixed(2) ?? '-'}% · PE {quote?.peRatio?.toFixed(2) ?? '-'}
        </span>
        {kline?.stale && <span className="meta">（缓存）</span>}
      </div>
      <div className="toolbar">
        <div className="seg">
          {PERIODS.map((p) => (
            <button key={p.klt} className={klt === p.klt ? 'active' : ''} onClick={() => setKlt(p.klt)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="seg">
          {[...MAIN_INDICATORS, ...SUB_INDICATORS].map((ind) => (
            <button key={ind.name} className={enabled[ind.name] ? 'active' : ''} onClick={() => toggle(ind.name)}>
              {ind.label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <div className="empty">K线加载失败：{error}</div>
      ) : (
        <div className="chart-wrap">
          <div id="kline-chart" ref={containerRef} />
        </div>
      )}
    </div>
  )
}
