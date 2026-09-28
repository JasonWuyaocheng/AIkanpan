import fs from 'node:fs'
import path from 'node:path'

export class JsonStore<T> {
  private cache: T | undefined
  private hasCache = false

  constructor(private filePath: string, private fallback: T) {}

  read(): T {
    if (this.hasCache) return this.cache as T
    try {
      this.cache = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
    } catch {
      this.cache = this.fallback
    }
    this.hasCache = true
    return this.cache as T
  }

  write(data: T): void {
    this.cache = data
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const tmp = this.filePath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
    fs.renameSync(tmp, this.filePath)
  }
}
