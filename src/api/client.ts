export interface Quote {
  secid: string
  symbol: string
  name: string
  price: number
  change: number
  changePct: number
  open: number
  high: number
  low: number
  prevClose: number
  volume: number
  amount: number
  turnoverRate?: number
  peRatio?: number
}

export interface WatchItem {
  secid: string
  symbol: string
  name: string
  addedAt: string
}

export interface SuggestItem {
  secid: string
  symbol: string
  name: string
  market: string
}

export interface KlineBar {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
  amount: number
  amplitude: number
  changePct: number
  change: number
  turnover: number
}

export interface KlineResponse {
  symbol: string
  name: string
  bars: KlineBar[]
  stale?: boolean
}

export interface RankItem {
  symbol: string
  name: string
  price: number
  changePct: number
  change: number
  volume: number
  amount: number
  turnoverRate: number
}

export interface Alert {
  id: string
  secid: string
  symbol: string
  name: string
  type: 'price_above' | 'price_below' | 'pct_above' | 'pct_below'
  threshold: number
  enabled: boolean
  status: 'active' | 'triggered'
  oneShot: boolean
  lastTriggeredAt: string | null
  createdAt: string
}

export interface Position {
  id: string
  secid: string
  symbol: string
  name: string
  buyPrice: number
  quantity: number
  buyDate: string
  note: string
}

export interface PositionWithPnl extends Position {
  price: number
  changePct: number
  pnlAmount: number
  pnlPct: number
}

export interface SettingsResponse {
  deepseekBaseUrl: string
  model: string
  refreshIntervalMs: number
  alertCheckIntervalMs: number
  hasKey: boolean
  keySource: 'env' | 'settings' | 'none'
  maskedKey: string
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as any).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  quotes: (secids: string[]) =>
    req<{ items: Quote[]; stale?: boolean }>(`/api/quotes?secids=${encodeURIComponent(secids.join(','))}`),
  stock: (secid: string) => req<Quote>(`/api/stock?secid=${encodeURIComponent(secid)}`),
  watchlist: () => req<{ items: WatchItem[] }>('/api/watchlist'),
  addWatch: (item: { secid: string; symbol: string; name: string }) =>
    req<unknown>('/api/watchlist', { method: 'POST', body: JSON.stringify(item) }),
  removeWatch: (secid: string) => req<unknown>(`/api/watchlist/${encodeURIComponent(secid)}`, { method: 'DELETE' }),
  search: (input: string) => req<{ items: SuggestItem[] }>(`/api/search?input=${encodeURIComponent(input)}`),
  kline: (secid: string, klt: 101 | 102 | 103, lmt = 120) =>
    req<KlineResponse>(`/api/kline?secid=${encodeURIComponent(secid)}&klt=${klt}&lmt=${lmt}`),
  rank: (type: 'gainers' | 'losers', count = 20) =>
    req<{ items: RankItem[] }>(`/api/rank?type=${type}&count=${count}`),
  alerts: () => req<{ items: Alert[] }>('/api/alerts'),
  addAlert: (a: { secid: string; symbol: string; name: string; type: Alert['type']; threshold: number }) =>
    req<Alert>('/api/alerts', { method: 'POST', body: JSON.stringify(a) }),
  toggleAlert: (id: string, enabled: boolean) =>
    req<Alert>(`/api/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
  removeAlert: (id: string) => req<unknown>(`/api/alerts/${id}`, { method: 'DELETE' }),
  positions: () => req<{ items: Position[] }>('/api/positions'),
  addPosition: (p: { secid: string; symbol: string; name: string; buyPrice: number; quantity: number; buyDate?: string; note?: string }) =>
    req<Position>('/api/positions', { method: 'POST', body: JSON.stringify(p) }),
  removePosition: (id: string) => req<unknown>(`/api/positions/${id}`, { method: 'DELETE' }),
  settings: () => req<SettingsResponse>('/api/settings'),
  saveSettings: (patch: Record<string, unknown>) =>
    req<unknown>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  aiStatus: () => req<{ hasKey: boolean; source: string; maskedKey: string }>('/api/ai/status'),
  aiTest: (apiKey?: string) =>
    req<{ ok: boolean; reply?: string; error?: string }>('/api/ai/test', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    }),
}

export async function streamAi(
  path: 'diagnose' | 'review',
  payload: Record<string, unknown>,
  onDelta: (text: string) => void,
  onError: (msg: string) => void,
  onDone: () => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const res = await fetch(`/api/ai/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}))
      onError((body as any).error ?? `HTTP ${res.status}`)
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        let event = 'message'
        const dataLines: string[] = []
        for (const line of frame.split('\n')) {
          if (line.startsWith('event: ')) event = line.slice(7)
          else if (line.startsWith('data: ')) dataLines.push(line.slice(6))
        }
        if (dataLines.length === 0) continue
        const data = dataLines.join('\n')
        if (event === 'delta') onDelta(JSON.parse(data))
        else if (event === 'error') onError(JSON.parse(data))
        else if (event === 'done') onDone()
      }
    }
    onDone()
  } catch (err: any) {
    if (err?.name !== 'AbortError') onError(err?.message ?? '请求失败')
  }
}
