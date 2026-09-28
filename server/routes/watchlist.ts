import { Router } from 'express'
import path from 'node:path'
import { DATA } from '../config.js'
import { JsonStore } from '../lib/storage.js'

export interface WatchItem {
  secid: string
  symbol: string
  name: string
  addedAt: string
}

const store = new JsonStore<{ items: WatchItem[] }>(path.join(DATA, 'watchlist.json'), { items: [] })
export { store as watchStore }

export const watchlistRoutes = Router()

watchlistRoutes.get('/watchlist', (_req, res) => {
  res.json(store.read())
})

watchlistRoutes.post('/watchlist', (req, res) => {
  const { secid, symbol, name } = req.body ?? {}
  if (!secid || !symbol || !name) return res.status(400).json({ error: 'secid, symbol, name required' })
  const data = store.read()
  if (data.items.some((i) => i.secid === secid)) {
    return res.status(409).json({ error: 'already in watchlist' })
  }
  data.items.push({ secid, symbol, name, addedAt: new Date().toISOString() })
  store.write(data)
  res.status(201).json(store.read())
})

watchlistRoutes.delete('/watchlist/:secid', (req, res) => {
  const data = store.read()
  const before = data.items.length
  data.items = data.items.filter((i) => i.secid !== req.params.secid)
  if (data.items.length === before) return res.status(404).json({ error: 'not found' })
  store.write(data)
  res.json(store.read())
})
