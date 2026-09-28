import { Router, type Response } from 'express'

type Client = Response

const clients = new Set<Client>()

function send(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

export function broadcastAlert(payload: {
  id: string
  secid: string
  symbol: string
  name: string
  message: string
  triggeredAt: string
}) {
  for (const client of clients) {
    try {
      send(client, 'alert.triggered', payload)
    } catch {
      clients.delete(client)
    }
  }
}

export const sseRoutes = Router()

sseRoutes.get('/', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write('retry: 3000\n\n')
  clients.add(res)
  req.on('close', () => clients.delete(res))
})

const HEARTBEAT_MS = 25_000
setInterval(() => {
  for (const client of clients) {
    try {
      client.write(':hb\n\n')
    } catch {
      clients.delete(client)
    }
  }
}, HEARTBEAT_MS).unref()
