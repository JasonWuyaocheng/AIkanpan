import { Router } from 'express'
import {
  fetchQuotesBatch,
  fetchKline,
  fetchSuggest,
  fetchRank,
  type StockQuote,
} from '../lib/emClient.js'
import { TtlCache } from '../lib/market.js'
import { isTradingHours } from '../lib/tradingHours.js'

export const quotesRoutes = Router()
const cache = new TtlCache(30_000)

quotesRoutes.get('/quotes', async (req, res) => {
  const secids = String(req.query.secids ?? '').trim()
  if (!secids) return res.json({ items: [] })
  const idList = secids.split(',')
  try {
    const { value, stale } = await cache.get(`quotes:${secids}`, 4000, () => fetchQuotesBatch(idList))
    res.json({ items: value, stale })
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? 'upstream error' })
  }
})

quotesRoutes.get('/stock', async (req, res) => {
  const secid = String(req.query.secid ?? '').trim()
  if (!secid) return res.status(400).json({ error: 'secid required' })
  try {
    const { value, stale } = await cache.get(`stock:${secid}`, 4000, async () => {
      const list = await fetchQuotesBatch([secid])
      if (list.length === 0) throw new Error('股票不存在')
      return list[0]
    })
    res.json({ ...value, stale })
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? 'upstream error' })
  }
})

const PERIOD_KLT: Record<string, 'day' | 'week' | 'month'> = {
  '101': 'day',
  '102': 'week',
  '103': 'month',
}

quotesRoutes.get('/kline', async (req, res) => {
  const secid = String(req.query.secid ?? '').trim()
  const klt = String(req.query.klt ?? '101')
  const lmt = Math.min(Number(req.query.lmt ?? 120), 800)
  if (!secid) return res.status(400).json({ error: 'secid required' })
  const period = PERIOD_KLT[klt]
  if (!period) return res.status(400).json({ error: 'klt must be 101|102|103' })
  const ttl = isTradingHours() ? 60_000 : 10 * 60_000
  try {
    const { value, stale } = await cache.get(`kline:${secid}:${period}:${lmt}`, ttl, () =>
      fetchKline(secid, period, lmt),
    )
    res.json({ ...value, stale })
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? 'upstream error' })
  }
})

quotesRoutes.get('/search', async (req, res) => {
  const input = String(req.query.input ?? '').trim()
  if (!input) return res.json({ items: [] })
  try {
    const { value } = await cache.get(`search:${input}`, 30_000, () => fetchSuggest(input))
    res.json({ items: value })
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? 'upstream error' })
  }
})

quotesRoutes.get('/rank', async (req, res) => {
  const type = String(req.query.type ?? 'gainers')
  const count = Math.min(Number(req.query.count ?? 20), 80)
  if (!['gainers', 'losers'].includes(type)) return res.status(400).json({ error: 'type must be gainers|losers' })
  try {
    const { value, stale } = await cache.get(`rank:${type}:${count}`, 10_000, () =>
      fetchRank(type === 'gainers', count),
    )
    res.json({ items: value, stale })
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? 'upstream error' })
  }
})

export type { StockQuote }
