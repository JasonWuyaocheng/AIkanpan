import { Router } from 'express'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DATA } from '../config.js'
import { JsonStore } from '../lib/storage.js'

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

const store = new JsonStore<{ items: Position[] }>(path.join(DATA, 'positions.json'), { items: [] })
export { store as positionStore }

export const positionRoutes = Router()

positionRoutes.get('/positions', (_req, res) => res.json(store.read()))

positionRoutes.post('/positions', (req, res) => {
  const { secid, symbol, name, buyPrice, quantity, buyDate, note } = req.body ?? {}
  if (!secid || !symbol || !name || typeof buyPrice !== 'number' || typeof quantity !== 'number') {
    return res.status(400).json({ error: 'secid, symbol, name, buyPrice, quantity required' })
  }
  const position: Position = {
    id: randomUUID(),
    secid,
    symbol,
    name,
    buyPrice,
    quantity,
    buyDate: String(buyDate || new Date().toISOString().slice(0, 10)),
    note: String(note ?? ''),
  }
  const data = store.read()
  data.items.push(position)
  store.write(data)
  res.status(201).json(position)
})

positionRoutes.delete('/positions/:id', (req, res) => {
  const data = store.read()
  const before = data.items.length
  data.items = data.items.filter((i) => i.id !== req.params.id)
  if (data.items.length === before) return res.status(404).json({ error: 'not found' })
  store.write(data)
  res.json({ ok: true })
})
