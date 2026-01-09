// Preload script - runs in renderer context with Node.js available
// Exposes safe APIs to renderer via contextBridge

const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods that allow the renderer process to use
// specific IPC channels. This is more secure than exposing ipcRenderer directly.
contextBridge.exposeInMainWorld('electronAPI', {
  // Get app version
  getVersion: () => ipcRenderer.invoke('get-version'),

  // Check if running in Electron
  isElectron: true,

  // Platform info
  platform: process.platform,

  // Open external URLs (e.g., for "open in browser" links)
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // App control
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Get backend status
  getBackendStatus: () => ipcRenderer.invoke('get-backend-status')
})

// Log that preload script ran
console.log('Electron preload script loaded')
