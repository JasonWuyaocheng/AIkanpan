import { Router, type Response } from 'express'

const clients = new Map<Response, ReturnType<typeof setInterval>>()

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
  for (const client of clients.keys()) {
    try {
      send(client, 'alert.triggered', payload)
    } catch {
      clients.delete(client)
    }
  }
}

export function closeSseClients() {
  for (const [client, heartbeat] of clients) {
    clearInterval(heartbeat)
    client.end()
  }
  clients.clear()
}

export const sseRoutes = Router()

sseRoutes.get('/', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write('retry: 3000\n\n')
  const heartbeat = setInterval(() => {
    try {
      res.write(':hb\n\n')
    } catch {
      clearInterval(heartbeat)
      clients.delete(res)
    }
  }, 25_000)
  clients.set(res, heartbeat)
  req.on('close', () => {
    clearInterval(heartbeat)
    clients.delete(res)
  })
})
