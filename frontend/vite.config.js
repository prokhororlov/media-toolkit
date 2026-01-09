import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Use VITE_BASE_PATH env var if set, otherwise default based on mode
  // For production web deployment: /projects/media-toolkit/
  // For Electron or local: /
  const basePath = process.env.VITE_BASE_PATH || (mode === 'production' ? '/projects/media-toolkit/' : '/')

  return {
    base: basePath,
    plugins: [react()],
    server: {
      port: 5173,
      open: false
    },
    build: {
      outDir: 'dist',
      sourcemap: true
    }
  }
})
