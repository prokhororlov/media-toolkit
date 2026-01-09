import archiver from 'archiver'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import {
  isPathTraversalSafe,
  isWithinDirectory
} from '../utils/security.js'
import { getUploadsDir } from '../utils/paths.js'

/**
 * Create a ZIP archive of processed files
 * @param {Array} files - Array of filenames to archive (already sanitized by caller)
 * @returns {Promise<string>} Path to created archive
 */
export async function createArchive(files) {
  return new Promise(async (resolve, reject) => {
    try {
      const UPLOAD_DIR = getUploadsDir()

      // Generate a secure archive filename
      const timestamp = Date.now()
      const random = Math.floor(Math.random() * 1e9).toString(36)
      const archivePath = path.join(UPLOAD_DIR, `archive-${timestamp}-${random}.zip`)

      // Ensure uploads directory exists
      await fsPromises.mkdir(UPLOAD_DIR, { recursive: true })

      const output = fs.createWriteStream(archivePath)
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      })

      output.on('close', () => {
        resolve(archivePath)
      })

      output.on('error', (err) => {
        reject(err)
      })

      archive.on('error', (err) => {
        reject(err)
      })

      archive.on('warning', (err) => {
        if (err.code !== 'ENOENT') {
          console.warn('Archive warning:', err)
        }
      })

      archive.pipe(output)

      // Add files to archive with security validation
      let addedFiles = 0
      for (const filename of files) {
        // Double-check security even though caller should have validated
        if (!isPathTraversalSafe(filename)) {
          console.warn(`Skipping unsafe filename in archive: ${filename}`)
          continue
        }

        // Use original filename for file lookup (files are saved with original names)
        const filePath = path.join(UPLOAD_DIR, filename)

        // Verify path stays within upload directory
        if (!isWithinDirectory(filePath, UPLOAD_DIR)) {
          console.warn(`Skipping file outside uploads in archive: ${filename}`)
          continue
        }

        // Check if file exists before adding
        try {
          await fsPromises.access(filePath)
          // Use original filename in the archive to preserve spaces
          // Security is already validated above (path traversal, directory escape)
          archive.file(filePath, { name: filename })
          addedFiles++
        } catch (err) {
          console.warn(`File not found for archive: ${filename}`)
        }
      }

      if (addedFiles === 0) {
        reject(new Error('No valid files to archive'))
        return
      }

      archive.finalize()

    } catch (error) {
      reject(error)
    }
  })
}
