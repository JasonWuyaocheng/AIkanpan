import { Router } from 'express'
import { loadSettings, saveSettings, resolveApiKey } from '../config.js'
import { getClient, streamDiagnose, streamReview, type PortfolioItem } from '../lib/ai.js'
import { fetchQuotesBatch, fetchKline, type StockQuote } from '../lib/emClient.js'
import { watchStore } from './watchlist.js'
import { positionStore } from './positions.js'

export const aiRoutes = Router()
export const settingsRoutes = Router()

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '***'
  return `${key.slice(0, 5)}***${key.slice(-4)}`
}

settingsRoutes.get('/settings', (_req, res) => {
  const settings = loadSettings()
  const { key, source } = resolveApiKey()
  res.json({
    deepseekBaseUrl: settings.deepseekBaseUrl,
    model: settings.model,
    refreshIntervalMs: settings.refreshIntervalMs,
    alertCheckIntervalMs: settings.alertCheckIntervalMs,
    hasKey: Boolean(key),
    keySource: source,
    maskedKey: maskKey(key),
  })
})

settingsRoutes.put('/settings', (req, res) => {
  const { deepseekBaseUrl, model, deepseekApiKey } = req.body ?? {}
  const patch: Record<string, unknown> = {}
  if (typeof deepseekBaseUrl === 'string' && deepseekBaseUrl.trim()) patch.deepseekBaseUrl = deepseekBaseUrl.trim()
  if (typeof model === 'string' && model.trim()) patch.model = model.trim()
  if (typeof deepseekApiKey === 'string' && deepseekApiKey.trim() && !deepseekApiKey.includes('***')) {
    patch.deepseekApiKey = deepseekApiKey.trim()
  }
  saveSettings(patch)
  res.json({ ok: true })
})

aiRoutes.get('/ai/status', (_req, res) => {
  const { key, source } = resolveApiKey()
  res.json({ hasKey: Boolean(key), source, maskedKey: maskKey(key) })
})

aiRoutes.post('/ai/test', async (req, res) => {
  const bodyKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : ''
  if (bodyKey && !bodyKey.includes('***')) {
    saveSettings({ deepseekApiKey: bodyKey })
  }
  const got = getClient()
  if (!got) return res.status(400).json({ ok: false, error: '未配置 API Key' })
  try {
    const completion = await got.client.chat.completions.create({
      model: got.model,
      max_tokens: 16,
      messages: [{ role: 'user', content: '回复：连通正常' }],
    })
    res.json({ ok: true, reply: completion.choices[0]?.message?.content ?? '' })
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err?.message ?? '连接失败' })
  }
})

async function fetchQuotes(secids: string[]): Promise<StockQuote[]> {
  return fetchQuotesBatch(secids)
}

aiRoutes.post('/ai/diagnose', async (req, res) => {
  const secid = String(req.body?.secid ?? '')
  if (!secid) return res.status(400).json({ error: 'secid required' })
  try {
    const quotes = await fetchQuotesBatch([secid])
    if (quotes.length === 0) throw new Error('股票不存在')
    const quote = quotes[0]
    const { bars } = await fetchKline(secid, 'day', 120)
    streamSse(res, streamDiagnose(quote, bars))
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? '获取行情失败' })
  }
})

aiRoutes.post('/ai/review', async (_req, res) => {
  try {
    const watchSecids = watchStore.read().items.map((i) => i.secid)
    const quotes = await fetchQuotes(watchSecids)
    const positions = positionStore.read().items
    const posQuotes = await fetchQuotes([...new Set(positions.map((p) => p.secid))])
    const quoteMap = new Map(posQuotes.map((q) => [q.secid, q]))
    const portfolio: PortfolioItem[] = positions.flatMap((p) => {
      const q = quoteMap.get(p.secid)
      if (!q) return []
      const pnlPct = ((q.price - p.buyPrice) / p.buyPrice) * 100
      return [
        {
          name: p.name,
          symbol: p.symbol,
          price: q.price,
          changePct: q.changePct,
          buyPrice: p.buyPrice,
          pnlPct,
          quantity: p.quantity,
          pnlAmount: (q.price - p.buyPrice) * p.quantity,
        },
      ]
    })
    streamSse(res, streamReview(quotes, portfolio))
  } catch (err: any) {
    res.status(502).json({ error: err?.message ?? '获取行情失败' })
  }
})

function streamSse(res: import('express').Response, gen: AsyncGenerator<string>) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write('retry: 1000\n\n')
  ;(async () => {
    try {
      for await (const delta of gen) {
        res.write(`event: delta\ndata: ${JSON.stringify(delta)}\n\n`)
      }
      res.write('event: done\ndata: {}\n\n')
    } catch (err: any) {
      const msg = err?.message === 'NO_API_KEY' ? '未配置 API Key，请到设置页填写' : err?.message ?? 'AI 请求失败'
      res.write(`event: error\ndata: ${JSON.stringify(msg)}\n\n`)
    }
    res.end()
  })()
}
