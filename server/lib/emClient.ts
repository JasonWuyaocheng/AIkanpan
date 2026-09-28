// 数据源：腾讯行情(qt.gtimg.cn / web.ifzq.gtimg.cn) + 新浪(suggest/排行)
// 东财 push2 在本机触发过风控，保留 searchadapter 但不作为主源
const TIMEOUT_MS = 5000

async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      if (attempt === 1) throw err
    }
  }
  throw new Error('unreachable')
}

function gbkToUtf8(buf: ArrayBuffer): string {
  return new TextDecoder('gbk').decode(buf)
}

export async function tencentGet(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return gbkToUtf8(await res.arrayBuffer())
}

export async function sinaGet(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Referer: 'https://finance.sina.com.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return gbkToUtf8(await res.arrayBuffer())
}

export interface StockQuote {
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
  volume: number // 手
  amount: number // 元
  turnoverRate?: number
  peRatio?: number
}

// secid("1.600519") → 腾讯代码(sh600519)
export function secidToTencent(secid: string): string {
  const [mkt, code] = secid.split('.')
  if (mkt === '1') return `sh${code}`
  if (code.startsWith('4') || code.startsWith('8') || code.startsWith('92')) return `bj${code}`
  return `sz${code}`
}

export function tencentToSecid(t: string): string {
  const mkt = t.slice(0, 2)
  const code = t.slice(2)
  if (mkt === 'sh') return `1.${code}`
  if (mkt === 'bj') return `0.${code}`
  return `0.${code}`
}

// 腾讯 qt 字段位（0 基）：
// 0市场 1名称 2代码 3现价 4昨收 5今开 6成交量(手) 7外盘 8内盘 9-28买卖五档
// 30时间 31涨跌 32涨跌% 33最高 34最低 35价/量/额 36成交量(手) 37成交额(万)
// 38换手率 39PE 41最高 42最低 43振幅 44流通市值(亿) 45总市值(亿) 46PB 47涨停 48跌停
export function parseTencentQuote(t: string, raw: string): StockQuote {
  const f = raw.split('~')
  return {
    secid: tencentToSecid(t),
    symbol: f[2],
    name: f[1],
    price: +f[3] || 0,
    prevClose: +f[4] || 0,
    open: +f[5] || 0,
    volume: +f[36] || 0,
    amount: (+f[37] || 0) * 10000,
    change: +f[31] || 0,
    changePct: +f[32] || 0,
    high: +f[33] || 0,
    low: +f[34] || 0,
    turnoverRate: +f[38] || 0,
    peRatio: +f[39] || 0,
  }
}

export async function fetchQuotesBatch(secids: string[]): Promise<StockQuote[]> {
  if (secids.length === 0) return []
  const codes = secids.map(secidToTencent).join(',')
  const text = await tencentGet(`https://qt.gtimg.cn/q=${codes}`)
  const out: StockQuote[] = []
  for (const m of text.matchAll(/v_(\w+)="([^"]*)"/g)) {
    if (m[2]) out.push(parseTencentQuote(m[1], m[2]))
  }
  return out
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

// period: day|week|month
export async function fetchKline(secid: string, period: 'day' | 'week' | 'month', count: number): Promise<{ symbol: string; name: string; bars: KlineBar[] }> {
  const code = secidToTencent(secid)
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},${period},,,${count},qfq`
  const text = await getText(url)
  const json = JSON.parse(text)
  const data = json?.data?.[code]
  if (!data) throw new Error('no kline data')
  const arr = data[`qfq${period}`] ?? data[`${period}`] ?? []
  const qt = data.qt?.[code]
  const name = qt?.[1] ?? ''
  const prevClose = qt ? +qt[4] : 0
  let lastClose = 0
  const bars: KlineBar[] = arr.map((row: string[]) => {
    const [date, open, close, high, low, volume] = row
    const c = +close
    const base = lastClose || (period === 'day' ? prevClose : c)
    const change = c - base
    const changePct = base ? (change / base) * 100 : 0
    const amplitude = base ? ((+high - +low) / base) * 100 : 0
    lastClose = c
    return {
      date,
      open: +open,
      close: c,
      high: +high,
      low: +low,
      volume: +volume,
      amount: 0,
      amplitude,
      changePct,
      change,
      turnover: 0,
    }
  })
  // 首根涨跌幅用前收盘或开盘价兜底
  if (bars.length > 0 && bars[0].changePct === 0 && bars[0].open > 0) {
    bars[0].change = bars[0].close - bars[0].open
    bars[0].changePct = ((bars[0].close - bars[0].open) / bars[0].open) * 100
  }
  return { symbol: secid.split('.')[1], name, bars }
}

export interface SuggestItem {
  secid: string
  symbol: string
  name: string
  market: string
}

export async function fetchSuggest(input: string): Promise<SuggestItem[]> {
  const text = await sinaGet(`https://suggest3.sinajs.cn/suggest/type=11,12&key=${encodeURIComponent(input)}&name=suggestdata`)
  const m = text.match(/"(.*)"/s)
  if (!m || !m[1]) return []
  const out: SuggestItem[] = []
  for (const line of m[1].split(';')) {
    const f = line.split(',')
    // f[0]名称 f[1]类型(11=沪 12=深) f[2]代码 f[3]=sh600519 f[4]全称
    if (!f[3] || !/^(sh|sz|bj)\d{6}$/.test(f[3])) continue
    const type = f[1]
    if (type !== '11' && type !== '12') continue
    out.push({
      secid: tencentToSecid(f[3]),
      symbol: f[2],
      name: f[4] || f[0],
      market: f[3].startsWith('sh') ? '沪A' : f[3].startsWith('sz') ? '深A' : '北A',
    })
  }
  return out.slice(0, 8)
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

// node=hs_a 沪深A股；asc=0 降序(涨幅榜) asc=1 升序(跌幅榜)
export async function fetchRank(desc: boolean, count: number): Promise<RankItem[]> {
  const asc = desc ? 0 : 1
  const text = await sinaGet(
    `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=1&num=${count}&sort=changepercent&asc=${asc}&node=hs_a`,
  )
  const list = JSON.parse(text)
  if (!Array.isArray(list)) return []
  return list.map((d: any) => ({
    symbol: d.code,
    name: d.name,
    price: +d.trade,
    changePct: +d.changepercent,
    change: +d.pricechange,
    volume: +d.volume,
    amount: +d.amount,
    turnoverRate: +d.turnoverratio,
  }))
}
