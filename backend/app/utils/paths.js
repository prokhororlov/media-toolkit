import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Get the uploads directory path.
 * In Electron mode, uses a writable location (app data).
 * In normal server mode, uses the backend/uploads directory.
 */
export function getUploadsDir() {
  // Check for Electron-provided uploads directory
  if (process.env.UPLOADS_DIR) {
    return process.env.UPLOADS_DIR
  }

  // Default: relative to backend directory
  return path.join(__dirname, '../../uploads')
}

/**
 * Ensure the uploads directory exists
 */
export async function ensureUploadsDir() {
  const uploadsDir = getUploadsDir()
  const fsPromises = fs.promises
  await fsPromises.mkdir(uploadsDir, { recursive: true })
  return uploadsDir
}

/**
 * Get the uploads directory path (sync version)
 */
export function getUploadsDirSync() {
  const uploadsDir = getUploadsDir()
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }
  return uploadsDir
}
