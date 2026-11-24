import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import { DATA, loadSettings } from './config.js'
import { quotesRoutes } from './routes/quotes.js'
import { watchlistRoutes, watchStore } from './routes/watchlist.js'
import { positionRoutes } from './routes/positions.js'
import { alertRoutes, runAlertCheck, listAlertSecids, type TriggeredAlert } from './routes/alerts.js'
import { aiRoutes, settingsRoutes } from './routes/ai.js'
import { sseRoutes, closeSseClients } from './sse.js'
import { TtlCache } from './lib/market.js'
import { fetchQuotesBatch } from './lib/emClient.js'

export interface BackendOptions {
  port?: number
  host?: string
  staticDir?: string
  accessToken?: string
  onAlert?: (alert: TriggeredAlert) => void
}

export interface BackendHandle {
  port: number
  host: string
  close: () => Promise<void>
}

function tokenMatches(provided: string, expected: string) {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function isLoopback(address: string | undefined) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

export async function startBackend(options: BackendOptions = {}): Promise<BackendHandle> {
  const host = options.host ?? '127.0.0.1'
  const accessToken = options.accessToken?.trim()
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json())

  if (accessToken) {
    app.use((req, res, next) => {
      if (!isLoopback(req.socket.remoteAddress) || !['127.0.0.1', 'localhost'].includes(req.hostname)) {
        res.status(403).json({ error: '仅允许本机访问' })
        return
      }
      next()
    })
    app.use('/api', (req, res, next) => {
      const header = req.get('authorization') ?? ''
      const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
      if (!tokenMatches(provided, accessToken)) {
        res.status(401).json({ error: '本地访问令牌无效' })
        return
      }
      next()
    })
    app.use('/sse', (req, res, next) => {
      const provided = typeof req.query.token === 'string' ? req.query.token : ''
      if (!tokenMatches(provided, accessToken)) {
        res.status(401).json({ error: '本地访问令牌无效' })
        return
      }
      next()
    })
  }

  app.get('/api/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }))
  app.use('/api', quotesRoutes)
  app.use('/api', watchlistRoutes)
  app.use('/api', positionRoutes)
  app.use('/api', alertRoutes)
  app.use('/api', aiRoutes)
  app.use('/api', settingsRoutes)
  app.use('/sse', sseRoutes)

  if (options.staticDir) {
    const distDir = path.resolve(options.staticDir)
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir))
      app.get(/^\/(?!api|sse).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
    }
  }

  fs.mkdirSync(DATA, { recursive: true })

  const quoteCache = new TtlCache(30_000)
  let closed = false
  let alertTimer: ReturnType<typeof setTimeout> | undefined

  async function pollAlerts() {
    if (closed) return
    try {
      const interval = loadSettings().alertCheckIntervalMs
      const watchSecids = watchStore.read().items.map((i) => i.secid)
      const allSecids = [...new Set([...watchSecids, ...listAlertSecids()])]
      if (allSecids.length > 0) {
        try {
          const { value } = await quoteCache.get(`alerts-quotes:${allSecids.join(',')}`, 4000, () =>
            fetchQuotesBatch(allSecids),
          )
          if (closed) return
          const map = new Map(
            (value as Array<{ secid: string; price: number; changePct: number }>).map((q) => [
              q.secid,
              { price: q.price, changePct: q.changePct },
            ]),
          )
          runAlertCheck(map, options.onAlert)
        } catch {
          // Upstream failures are retried on the next tick.
        }
      }
      if (!closed) alertTimer = setTimeout(pollAlerts, interval)
    } finally {
      if (closed) {
        clearTimeout(alertTimer)
        alertTimer = undefined
      }
    }
  }

  const server = app.listen(options.port ?? 0, host)
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('无法获取后端监听地址')
  }

  if (!closed) alertTimer = setTimeout(pollAlerts, 2000)

  return {
    port: address.port,
    host,
    close: async () => {
      if (closed) return
      closed = true
      clearTimeout(alertTimer)
      closeSseClients()
      await new Promise<void>((resolve) => {
        let forceClose: ReturnType<typeof setTimeout> | undefined
        server.close(() => {
          clearTimeout(forceClose)
          resolve()
        })
        server.closeIdleConnections()
        forceClose = setTimeout(() => server.closeAllConnections(), 1_000)
        forceClose.unref()
      })
    },
  }
}
