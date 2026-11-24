export { }

declare global {
  interface Window {
    aikanpanDesktop?: {
      token: string
      version: string
      dataDir: string
    }
  }
}
