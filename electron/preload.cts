const { contextBridge } = require('electron') as typeof import('electron')

const token = process.env.AIKANPAN_ACCESS_TOKEN
if (token) {
  contextBridge.exposeInMainWorld('aikanpanDesktop', Object.freeze({
    token,
    version: process.env.AIKANPAN_APP_VERSION ?? '',
    dataDir: process.env.AIKANPAN_DATA_DIR ?? '',
  }))
}
