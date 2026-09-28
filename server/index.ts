import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PORT, DATA, loadSettings } from './config.js'
import { quotesRoutes } from './routes/quotes.js'
import { watchlistRoutes, watchStore } from './routes/watchlist.js'
import { positionRoutes } from './routes/positions.js'
import { alertRoutes, runAlertCheck, listAlertSecids } from './routes/alerts.js'
import { aiRoutes, settingsRoutes } from './routes/ai.js'
import { sseRoutes } from './sse.js'
import { TtlCache } from './lib/market.js'
import { fetchQuotesBatch } from './lib/emClient.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const app = express()
app.use(express.json())

app.get('/api/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }))
app.use('/api', quotesRoutes)
app.use('/api', watchlistRoutes)
app.use('/api', positionRoutes)
app.use('/api', alertRoutes)
app.use('/api', aiRoutes)
app.use('/api', settingsRoutes)
app.use('/sse', sseRoutes)

const distDir = path.join(ROOT, 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^\/(?!api|sse).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

fs.mkdirSync(DATA, { recursive: true })

// 预警引擎：复用行情缓存，独立轮询检查
const quoteCache = new TtlCache(30_000)
async function pollAlerts() {
  const interval = loadSettings().alertCheckIntervalMs
  const watchSecids = watchStore.read().items.map((i) => i.secid)
  const allSecids = [...new Set([...watchSecids, ...listAlertSecids()])]
  if (allSecids.length > 0) {
    try {
      const { value } = await quoteCache.get(`alerts-quotes:${allSecids.join(',')}`, 4000, () =>
        fetchQuotesBatch(allSecids),
      )
      const map = new Map(
        (value as Array<{ secid: string; price: number; changePct: number }>).map((q) => [
          q.secid,
          { price: q.price, changePct: q.changePct },
        ]),
      )
      runAlertCheck(map)
    } catch {
      // 上游失败等下轮再试
    }
  }
  setTimeout(pollAlerts, interval)
}

setTimeout(pollAlerts, 2000)

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
