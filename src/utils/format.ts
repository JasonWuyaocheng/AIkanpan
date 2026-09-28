export function pctClass(v: number): string {
  if (v > 0) return 'up'
  if (v < 0) return 'down'
  return 'flat'
}

export function fmtPct(v: number): string {
  const s = v > 0 ? '+' : ''
  return `${s}${v.toFixed(2)}%`
}

export function fmtNum(v: number, digits = 2): string {
  return v.toFixed(digits)
}

export function fmtAmount(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}万亿`
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${(v / 1e4).toFixed(2)}万`
  return v.toFixed(0)
}

export function fmtVolumeHand(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}百万手`
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万手`
  return `${v}手`
}

export const ALERT_TYPE_LABEL: Record<string, string> = {
  price_above: '价格 ≥',
  price_below: '价格 ≤',
  pct_above: '涨幅 ≥',
  pct_below: '跌幅 ≤',
}
