import { Router } from 'express'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DATA } from '../config.js'
import { JsonStore } from '../lib/storage.js'
import { broadcastAlert } from '../sse.js'

export type AlertType = 'price_above' | 'price_below' | 'pct_above' | 'pct_below'

export interface Alert {
  id: string
  secid: string
  symbol: string
  name: string
  type: AlertType
  threshold: number
  enabled: boolean
  status: 'active' | 'triggered'
  oneShot: boolean
  lastTriggeredAt: string | null
  createdAt: string
}

const store = new JsonStore<{ items: Alert[] }>(path.join(DATA, 'alerts.json'), { items: [] })
export { store as alertStore }

export function listAlertSecids(): string[] {
  return store
    .read()
    .items.filter((i) => i.enabled)
    .map((i) => i.secid)
}

export const alertRoutes = Router()

alertRoutes.get('/alerts', (_req, res) => res.json(store.read()))

alertRoutes.post('/alerts', (req, res) => {
  const { secid, symbol, name, type, threshold } = req.body ?? {}
  if (!secid || !symbol || !name || !type || typeof threshold !== 'number') {
    return res.status(400).json({ error: 'secid, symbol, name, type, threshold required' })
  }
  if (!['price_above', 'price_below', 'pct_above', 'pct_below'].includes(type)) {
    return res.status(400).json({ error: 'invalid type' })
  }
  const alert: Alert = {
    id: randomUUID(),
    secid,
    symbol,
    name,
    type,
    threshold,
    enabled: true,
    status: 'active',
    oneShot: true,
    lastTriggeredAt: null,
    createdAt: new Date().toISOString(),
  }
  const data = store.read()
  data.items.push(alert)
  store.write(data)
  res.status(201).json(alert)
})

alertRoutes.patch('/alerts/:id', (req, res) => {
  const data = store.read()
  const alert = data.items.find((i) => i.id === req.params.id)
  if (!alert) return res.status(404).json({ error: 'not found' })
  if (typeof req.body?.enabled === 'boolean') {
    alert.enabled = req.body.enabled
    if (alert.enabled) alert.status = 'active'
  }
  store.write(data)
  res.json(alert)
})

alertRoutes.delete('/alerts/:id', (req, res) => {
  const data = store.read()
  const before = data.items.length
  data.items = data.items.filter((i) => i.id !== req.params.id)
  if (data.items.length === before) return res.status(404).json({ error: 'not found' })
  store.write(data)
  res.json({ ok: true })
})

const TYPE_LABEL: Record<AlertType, string> = {
  price_above: '价格突破',
  price_below: '价格跌破',
  pct_above: '涨幅超过',
  pct_below: '跌幅超过',
}

function checkAlert(alert: Alert, price: number, changePct: number): string | null {
  switch (alert.type) {
    case 'price_above':
      return price >= alert.threshold ? `价格 ${price} 已突破 ${alert.threshold}` : null
    case 'price_below':
      return price <= alert.threshold ? `价格 ${price} 已跌破 ${alert.threshold}` : null
    case 'pct_above':
      return changePct >= alert.threshold ? `涨幅 ${changePct}% 超过 ${alert.threshold}%` : null
    case 'pct_below':
      return changePct <= alert.threshold ? `跌幅 ${changePct}% 低于 ${alert.threshold}%` : null
  }
}

export function runAlertCheck(quoteMap: Map<string, { price: number; changePct: number }>) {
  const data = store.read()
  let changed = false
  for (const alert of data.items) {
    if (!alert.enabled) continue
    const quote = quoteMap.get(alert.secid)
    if (!quote) continue
    const message = checkAlert(alert, quote.price, quote.changePct)
    if (message) {
      alert.status = 'triggered'
      alert.lastTriggeredAt = new Date().toISOString()
      if (alert.oneShot) alert.enabled = false
      changed = true
      broadcastAlert({
        id: alert.id,
        secid: alert.secid,
        symbol: alert.symbol,
        name: alert.name,
        message: `${TYPE_LABEL[alert.type]}：${message}`,
        triggeredAt: alert.lastTriggeredAt,
      })
    }
  }
  if (changed) store.write(data)
}
