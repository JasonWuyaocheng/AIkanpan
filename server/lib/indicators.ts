import type { KlineBar } from './emClient.js'

export function sma(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i]
    if (i >= period) sum -= closes[i - period]
    out.push(i >= period - 1 ? sum / period : null)
  }
  return out
}

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  let prev = values[0] ?? 0
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast)
  const emaSlow = ema(closes, slow)
  const dif = closes.map((_, i) => emaFast[i] - emaSlow[i])
  const dea = ema(dif, signal)
  const hist = dif.map((d, i) => (d - dea[i]) * 2)
  return { dif, dea, hist }
}

export function kdj(bars: KlineBar[], n = 9, m1 = 3, m2 = 3) {
  const k: number[] = []
  const d: number[] = []
  const j: number[] = []
  let prevK = 50
  let prevD = 50
  for (let i = 0; i < bars.length; i++) {
    const start = Math.max(0, i - n + 1)
    let hh = -Infinity
    let ll = Infinity
    for (let t = start; t <= i; t++) {
      hh = Math.max(hh, bars[t].high)
      ll = Math.min(ll, bars[t].low)
    }
    const rsv = hh === ll ? 50 : ((bars[i].close - ll) / (hh - ll)) * 100
    prevK = (m1 - 1) / m1 * prevK + 1 / m1 * rsv
    prevD = (m2 - 1) / m2 * prevD + 1 / m2 * prevK
    k.push(prevK)
    d.push(prevD)
    j.push(3 * prevK - 2 * prevD)
  }
  return { k, d, j }
}

export function rsi(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [null]
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    const gain = Math.max(change, 0)
    const loss = Math.max(-change, 0)
    if (i <= period) {
      avgGain += gain / period
      avgLoss += loss / period
      out.push(i === period ? rsiValue(avgGain, avgLoss) : null)
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period
      avgLoss = (avgLoss * (period - 1) + loss) / period
      out.push(rsiValue(avgGain, avgLoss))
    }
  }
  return out
}

function rsiValue(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

export function boll(closes: number[], period = 20, mult = 2) {
  const mid: (number | null)[] = []
  const upper: (number | null)[] = []
  const lower: (number | null)[] = []
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      mid.push(null)
      upper.push(null)
      lower.push(null)
      continue
    }
    const win = closes.slice(i - period + 1, i + 1)
    const mean = win.reduce((a, b) => a + b, 0) / period
    const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / period
    const sd = Math.sqrt(variance)
    mid.push(mean)
    upper.push(mean + mult * sd)
    lower.push(mean - mult * sd)
  }
  return { mid, upper, lower }
}

export interface IndicatorSnapshot {
  date: string
  close: number
  changePct: number
  ma5: number | null
  ma10: number | null
  ma20: number | null
  ma60: number | null
  macdDif: number
  macdDea: number
  macdHist: number
  kdjK: number
  kdjD: number
  kdjJ: number
  rsi6: number | null
  rsi12: number | null
  rsi24: number | null
  bollUpper: number | null
  bollMid: number | null
  bollLower: number | null
  turnover: number
  volumeVs5dAvg: number | null
}

export function snapshot(bars: KlineBar[]): IndicatorSnapshot | null {
  if (bars.length === 0) return null
  const closes = bars.map((b) => b.close)
  const ma5 = sma(closes, 5)
  const ma10 = sma(closes, 10)
  const ma20 = sma(closes, 20)
  const ma60 = sma(closes, 60)
  const { dif, dea, hist } = macd(closes)
  const { k, d, j } = kdj(bars)
  const r6 = rsi(closes, 6)
  const r12 = rsi(closes, 12)
  const r24 = rsi(closes, 24)
  const bo = boll(closes)
  const i = bars.length - 1
  const vol5 = sma(bars.map((b) => b.volume), 5)
  const last = bars[i]
  return {
    date: last.date,
    close: last.close,
    changePct: last.changePct,
    ma5: ma5[i],
    ma10: ma10[i],
    ma20: ma20[i],
    ma60: ma60[i],
    macdDif: dif[i],
    macdDea: dea[i],
    macdHist: hist[i],
    kdjK: k[i],
    kdjD: d[i],
    kdjJ: j[i],
    rsi6: r6[i],
    rsi12: r12[i],
    rsi24: r24[i],
    bollUpper: bo.upper[i],
    bollMid: bo.mid[i],
    bollLower: bo.lower[i],
    turnover: last.turnover,
    volumeVs5dAvg: vol5[i] ? last.volume / vol5[i] : null,
  }
}

export function recentBarsSummary(bars: KlineBar[], n = 10): string {
  return bars
    .slice(-n)
    .map((b) => `${b.date} 收${b.close} ${b.changePct > 0 ? '+' : ''}${b.changePct}% 振幅${b.amplitude}% 换手${b.turnover}%`)
    .join('\n')
}
