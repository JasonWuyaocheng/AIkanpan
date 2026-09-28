interface CacheEntry {
  value: any
  expiresAt: number
  inflight?: Promise<any>
  failedUntil?: number
}

export class TtlCache {
  private store = new Map<string, CacheEntry>()

  constructor(private failedCooldownMs = 30_000) {}

  async get(key: string, ttlMs: number, loader: () => Promise<any>): Promise<{ value: any; stale: boolean }> {
    const now = Date.now()
    let entry = this.store.get(key)

    if (entry && entry.failedUntil && entry.failedUntil > now) {
      return { value: entry.value, stale: true }
    }

    if (entry && entry.expiresAt > now) {
      return { value: entry.value, stale: false }
    }

    if (entry?.inflight) {
      return { value: await entry.inflight, stale: false }
    }

    const inflight = loader()
      .then((value) => {
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
        return value
      })
      .catch((err) => {
        const prev = this.store.get(key)
        this.store.set(key, {
          value: prev?.value ?? null,
          expiresAt: 0,
          failedUntil: Date.now() + this.failedCooldownMs,
        })
        throw err
      })
      .finally(() => {
        const cur = this.store.get(key)
        if (cur) cur.inflight = undefined
      })

    entry = this.store.get(key) ?? { value: null, expiresAt: 0 }
    entry.inflight = inflight
    this.store.set(key, entry)

    return { value: await inflight, stale: false }
  }
}
