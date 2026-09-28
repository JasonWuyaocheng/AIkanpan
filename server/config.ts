import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'data')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')

export interface AppSettings {
  deepseekApiKey: string
  deepseekBaseUrl: string
  model: string
  refreshIntervalMs: number
  alertCheckIntervalMs: number
}

const DEFAULT_SETTINGS: AppSettings = {
  deepseekApiKey: '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  refreshIntervalMs: 5000,
  alertCheckIntervalMs: 5000,
}

export function loadSettings(): AppSettings {
  let fileSettings: Partial<AppSettings> = {}
  try {
    fileSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
  } catch {
    // no settings file yet
  }
  return { ...DEFAULT_SETTINGS, ...fileSettings }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const merged = { ...loadSettings(), ...patch }
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = SETTINGS_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2))
  fs.renameSync(tmp, SETTINGS_FILE)
  return merged
}

export function resolveApiKey(): { key: string; source: 'env' | 'settings' | 'none' } {
  const envKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (envKey) return { key: envKey, source: 'env' }
  const fileKey = loadSettings().deepseekApiKey.trim()
  if (fileKey) return { key: fileKey, source: 'settings' }
  return { key: '', source: 'none' }
}

export const PORT = Number(process.env.PORT || 8787)
export const DATA = DATA_DIR
