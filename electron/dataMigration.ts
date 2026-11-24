import fs from 'node:fs'
import path from 'node:path'

export const DATA_FILES = ['settings.json', 'watchlist.json', 'positions.json', 'alerts.json'] as const
export const MIGRATION_MARKER = '.legacy-import.json'

export function hasUserData(dataDir: string) {
  return DATA_FILES.some((name) => fs.existsSync(path.join(dataDir, name)))
}

export function markImportSkipped(dataDir: string) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, MIGRATION_MARKER), JSON.stringify({ skippedAt: new Date().toISOString() }, null, 2))
}

export function migrateLegacyData(sourceDir: string, targetDir: string) {
  const source = path.resolve(sourceDir)
  const target = path.resolve(targetDir)
  if (source === target) return { imported: [] as string[], skipped: [] as string[] }

  const files = DATA_FILES.filter((name) => fs.existsSync(path.join(source, name)))
  if (files.length === 0) throw new Error('所选文件夹中没有找到旧版数据文件')

  for (const name of files) {
    const value: unknown = JSON.parse(fs.readFileSync(path.join(source, name), 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${name} 不是有效的数据文件`)
    }
    if (name !== 'settings.json' && !Array.isArray((value as { items?: unknown }).items)) {
      throw new Error(`${name} 缺少 items 列表`)
    }
  }

  fs.mkdirSync(target, { recursive: true })
  const stagingDir = fs.mkdtempSync(path.join(target, '.import-'))
  const imported: string[] = []
  const skipped: string[] = []
  const staged: Array<{ name: string; destination: string }> = []
  try {
    for (const name of files) {
      const destination = path.join(target, name)
      if (fs.existsSync(destination)) {
        skipped.push(name)
        continue
      }
      const sourceFile = path.join(source, name)
      const temporary = path.join(stagingDir, name)
      fs.copyFileSync(sourceFile, temporary)
      staged.push({ name, destination })
    }
    const marker = path.join(target, MIGRATION_MARKER)
    const stagedMarker = path.join(stagingDir, MIGRATION_MARKER)
    for (const file of staged) {
      if (fs.existsSync(file.destination)) {
        skipped.push(file.name)
        fs.rmSync(path.join(stagingDir, file.name))
        continue
      }
      fs.renameSync(path.join(stagingDir, file.name), file.destination)
      imported.push(file.name)
    }
    fs.writeFileSync(stagedMarker, JSON.stringify({ importedAt: new Date().toISOString(), sourceDir: source, imported, skipped }, null, 2))
    fs.renameSync(stagedMarker, marker)
  } catch (error) {
    for (const name of imported) fs.rmSync(path.join(target, name), { force: true })
    throw error
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true })
  }
  return { imported, skipped }
}
