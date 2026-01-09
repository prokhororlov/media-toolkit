// Type declarations for Electron API exposed via preload script
interface ElectronAPI {
  isElectron: boolean
  platform: string
  getVersion: () => Promise<string>
  openExternal: (url: string) => void
  minimize: () => void
  maximize: () => void
  close: () => void
  getBackendStatus: () => Promise<{ running: boolean; pid: number | null }>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
