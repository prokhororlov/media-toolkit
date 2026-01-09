import fs from 'fs/promises'
import path from 'path'
import { getUploadsDir } from './paths.js'

// File expiry time in milliseconds (10 minutes, matching frontend)
const FILE_EXPIRY_MS = 10 * 60 * 1000

// Cleanup interval (run every minute)
const CLEANUP_INTERVAL_MS = 60 * 1000

/**
 * Safely delete a file with retry logic for Windows file locking
 */
async function safeUnlink(filePath, retries = 3, delay = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.unlink(filePath)
      return true
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EBUSY') {
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
        } else {
          // Don't log warning for cleanup - just return false
          return false
        }
      } else if (err.code === 'ENOENT') {
        // File already deleted
        return true
      } else {
        throw err
      }
    }
  }
  return false
}

/**
 * Clean up expired files from the uploads directory
 * Files older than FILE_EXPIRY_MS will be deleted
 */
async function cleanupExpiredFiles() {
  try {
    const uploadsDir = getUploadsDir()

    // Ensure uploads directory exists
    try {
      await fs.access(uploadsDir)
    } catch {
      // Directory doesn't exist, nothing to clean
      return { cleaned: 0, errors: 0 }
    }

    const files = await fs.readdir(uploadsDir)
    const now = Date.now()
    let cleaned = 0
    let errors = 0

    for (const file of files) {
      const filePath = path.join(uploadsDir, file)

      try {
        const stats = await fs.stat(filePath)

        // Skip directories
        if (stats.isDirectory()) continue

        // Check if file is expired (based on modification time)
        const fileAge = now - stats.mtimeMs

        if (fileAge > FILE_EXPIRY_MS) {
          const deleted = await safeUnlink(filePath)
          if (deleted) {
            cleaned++
            console.log(`[Cleanup] Deleted expired file: ${file} (age: ${Math.round(fileAge / 1000)}s)`)
          } else {
            // File locked, will be cleaned up in next cycle
            errors++
          }
        }
      } catch (err) {
        errors++
        console.error(`[Cleanup] Error processing file ${file}:`, err.message)
      }
    }

    if (cleaned > 0 || errors > 0) {
      console.log(`[Cleanup] Completed: ${cleaned} files deleted, ${errors} errors`)
    }

    return { cleaned, errors }
  } catch (err) {
    console.error('[Cleanup] Error during cleanup:', err.message)
    return { cleaned: 0, errors: 1 }
  }
}

/**
 * Start the automatic file cleanup scheduler
 */
function startCleanupScheduler() {
  console.log(`[Cleanup] Starting file cleanup scheduler (interval: ${CLEANUP_INTERVAL_MS / 1000}s, expiry: ${FILE_EXPIRY_MS / 1000}s)`)

  // Run cleanup immediately on startup
  cleanupExpiredFiles()

  // Schedule periodic cleanup
  const intervalId = setInterval(cleanupExpiredFiles, CLEANUP_INTERVAL_MS)

  // Return cleanup function for graceful shutdown
  return () => {
    clearInterval(intervalId)
    console.log('[Cleanup] File cleanup scheduler stopped')
  }
}

/**
 * Clear all files from uploads directory (used for Electron app cleanup)
 */
async function clearAllUploads() {
  try {
    const uploadsDir = getUploadsDir()

    // Ensure uploads directory exists
    try {
      await fs.access(uploadsDir)
    } catch {
      // Directory doesn't exist, nothing to clean
      return { cleared: 0, errors: 0 }
    }

    const files = await fs.readdir(uploadsDir)
    let cleared = 0
    let errors = 0

    for (const file of files) {
      const filePath = path.join(uploadsDir, file)

      try {
        const stats = await fs.stat(filePath)

        // Skip directories
        if (stats.isDirectory()) continue

        const deleted = await safeUnlink(filePath)
        if (deleted) {
          cleared++
        } else {
          errors++
        }
      } catch (err) {
        errors++
        console.error(`[Cleanup] Error deleting file ${file}:`, err.message)
      }
    }

    if (cleared > 0 || errors > 0) {
      console.log(`[Cleanup] Cleared all uploads: ${cleared} files deleted, ${errors} errors`)
    }

    return { cleared, errors }
  } catch (err) {
    console.error('[Cleanup] Error clearing uploads:', err.message)
    return { cleared: 0, errors: 1 }
  }
}

export { cleanupExpiredFiles, startCleanupScheduler, clearAllUploads, FILE_EXPIRY_MS }
