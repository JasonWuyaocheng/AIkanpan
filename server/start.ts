import path from 'node:path'

process.env.AIKANPAN_DATA_DIR ??= path.resolve(process.cwd(), 'data')

const { startBackend } = await import('./index.js')
const backend = await startBackend({
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '127.0.0.1',
  staticDir: process.env.AIKANPAN_STATIC_DIR || path.resolve(process.cwd(), 'dist'),
})

console.log(`[server] listening on http://${backend.host}:${backend.port}`)

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await backend.close()
  process.exit(0)
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)
