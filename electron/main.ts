import { app, BrowserWindow, Menu, Notification, Tray, dialog, nativeImage, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { hasUserData, markImportSkipped, migrateLegacyData, MIGRATION_MARKER } from './dataMigration.js'

interface DesktopBackend {
  port: number
  host: string
  close: () => Promise<void>
}

app.setName('AIkanpan')
if (process.platform === 'win32') app.setAppUserModelId('com.aikanpan.desktop')

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let backend: DesktopBackend | undefined
let backendUrl = ''
let quitting = false
let quitStarted = false
let rendererReloads = 0
let dataDir = ''
let iconPath = ''

function log(...messages: unknown[]) {
  const line = `${new Date().toISOString()} ${messages.map((item) => item instanceof Error ? item.stack ?? item.message : String(item)).join(' ')}\n`
  console.log(line.trimEnd())
  try {
    fs.appendFileSync(path.join(dataDir, 'logs', 'desktop.log'), line)
  } catch {
    // Logging must not prevent startup or shutdown.
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray() {
  if (tray || !iconPath) return
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return
  tray = new Tray(image.resize({ width: 16, height: 16 }))
  tray.setToolTip('AIkanpan · AI 看盘助手')
  tray.on('double-click', showMainWindow)
  tray.on('click', showMainWindow)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开主窗口', click: showMainWindow },
    { type: 'separator' },
    { label: '真正退出', click: () => app.quit() },
  ]))
}

async function prepareData() {
  dataDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : path.join(app.getAppPath(), 'data')
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true })
  if (!app.isPackaged || hasUserData(dataDir) || fs.existsSync(path.join(dataDir, MIGRATION_MARKER))) return

  const choice = await dialog.showMessageBox({
    type: 'question',
    title: '首次使用 AIkanpan',
    message: '是否导入旧版看盘助手的数据？',
    detail: '可以导入自选、持仓、预警和设置。取消或暂时不需要时，将作为全新应用开始；旧文件不会被修改。',
    buttons: ['选择旧版 data 文件夹', '暂不导入，直接开始'],
    defaultId: 1,
    cancelId: 1,
  })
  if (choice.response !== 0) {
    markImportSkipped(dataDir)
    return
  }

  const selected = await dialog.showOpenDialog({
    title: '选择旧版 AIkanpan 的 data 文件夹',
    properties: ['openDirectory'],
  })
  if (selected.canceled || selected.filePaths.length === 0) {
    markImportSkipped(dataDir)
    return
  }
  const result = migrateLegacyData(selected.filePaths[0], dataDir)
  log(`[migration] imported=${result.imported.join(',') || '-'} skipped=${result.skipped.join(',') || '-'}`)
}

async function startDesktopBackend() {
  process.env.AIKANPAN_DATA_DIR = dataDir
  process.env.AIKANPAN_ACCESS_TOKEN = randomBytes(32).toString('hex')
  const modulePath = path.join(app.getAppPath(), 'out', 'server', 'index.js')
  const { startBackend } = await import(pathToFileURL(modulePath).href) as {
    startBackend: (options: {
      port: number
      host: string
      staticDir: string
      accessToken: string
      onAlert: (alert: { name: string; message: string }) => void
    }) => Promise<DesktopBackend>
  }
  backend = await startBackend({
    port: 0,
    host: '127.0.0.1',
    staticDir: path.join(app.getAppPath(), 'dist'),
    accessToken: process.env.AIKANPAN_ACCESS_TOKEN,
    onAlert: (alert) => {
      log('[alert]', alert.name, alert.message)
      if (!Notification.isSupported()) return
      const notification = new Notification({
        title: `${alert.name} 预警触发`,
        body: alert.message,
        icon: iconPath,
      })
      notification.on('click', showMainWindow)
      notification.show()
    },
  })
  backendUrl = `http://127.0.0.1:${backend.port}/`
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#101014',
    autoHideMenuBar: true,
    title: 'AIkanpan · AI 看盘助手',
    icon: iconPath,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'out', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })
  mainWindow.once('ready-to-show', showMainWindow)
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== new URL(backendUrl).origin) event.preventDefault()
    } catch {
      event.preventDefault()
    }
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log(`[renderer] ${details.reason}`)
    if (quitting) return
    if (rendererReloads < 1) {
      rendererReloads += 1
      mainWindow?.reload()
      return
    }
    dialog.showErrorBox('界面暂时无法恢复', '应用将退出。请查看用户数据目录 logs/desktop.log，然后重新打开 AIkanpan。')
    app.quit()
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (quitting || errorCode === -3 || !validatedURL.startsWith(backendUrl)) return
    log(`[renderer] load failed: ${errorCode} ${errorDescription}`)
    dialog.showErrorBox('页面加载失败', '本地服务可能启动异常。请查看用户数据目录 logs/desktop.log，然后重新打开 AIkanpan。')
    app.quit()
  })
  void mainWindow.loadURL(backendUrl)
}

async function shutdown() {
  try {
    await backend?.close()
  } catch (error) {
    log('[shutdown]', error)
  } finally {
    backend = undefined
    tray?.destroy()
    tray = null
  }
}

async function bootstrap() {
  await app.whenReady()
  process.env.AIKANPAN_APP_VERSION = app.getVersion()
  try {
    const candidate = path.join(app.getAppPath(), 'build', 'icon.ico')
    iconPath = fs.existsSync(candidate) ? candidate : ''
    await prepareData()
    await startDesktopBackend()
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (!details.url.startsWith(backendUrl)) {
        callback({})
        return
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          ],
        },
      })
    })
    createTray()
    createWindow()
    log(`[app] ready on ${backendUrl}`)

    app.on('second-instance', showMainWindow)
    app.on('activate', showMainWindow)
    app.on('before-quit', (event) => {
      if (quitStarted) return
      event.preventDefault()
      quitStarted = true
      quitting = true
      void shutdown().finally(() => {
        app.quit()
      })
    })
    app.on('will-quit', () => {
      quitting = true
    })
    process.on('uncaughtException', (error) => {
      log('[uncaughtException]', error)
      dialog.showErrorBox('AIkanpan 发生异常', '应用将安全退出。请查看用户数据目录 logs/desktop.log。')
      app.quit()
    })
    process.on('unhandledRejection', (reason) => {
      log('[unhandledRejection]', reason)
    })
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  } catch (error) {
    quitting = true
    log('[startup]', error)
    await shutdown()
    dialog.showErrorBox('AIkanpan 启动失败', `${error instanceof Error ? error.message : String(error)}\n\n请检查用户数据目录 logs/desktop.log。`)
    app.exit(1)
  }
}

async function main() {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  await bootstrap()
}

void main()
