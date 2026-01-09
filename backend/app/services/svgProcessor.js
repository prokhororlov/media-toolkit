import { optimize } from 'svgo'
import fs from 'fs/promises'
import path from 'path'

/**
 * Safely delete a file with retry logic for Windows file locking
 */
async function safeUnlink(filePath, retries = 3, delay = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.unlink(filePath)
      return
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EBUSY') {
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
        } else {
          console.warn(`Could not delete file ${filePath}: ${err.message}. File will be cleaned up later.`)
        }
      } else {
        throw err
      }
    }
  }
}

/**
 * Generate a unique output filename, using original name with new extension.
 * Adds a counter suffix if file already exists.
 * @param {string} dir - Directory path
 * @param {string} baseName - Original filename without extension
 * @param {string} format - Target format/extension
 * @returns {Promise<string>} Unique filename
 */
async function getUniqueFilename(dir, baseName, format) {
  let filename = `${baseName}.${format}`
  let filePath = path.join(dir, filename)
  let counter = 1

  while (true) {
    try {
      await fs.access(filePath)
      filename = `${baseName}_${counter}.${format}`
      filePath = path.join(dir, filename)
      counter++
    } catch {
      break
    }
  }

  return filename
}

/**
 * Optimize SVG files using SVGO
 * @param {Array} files - Array of uploaded SVG files
 * @param {Object} options - Processing options
 * @returns {Array} Results with optimized file info
 */
export async function optimizeSVGs(files, options = {}) {
  const results = []

  // Extract SVG-specific options
  const {
    precision = 2,
    removeViewBox = false,
    cleanupIDs = true
  } = options

  // Build SVGO config based on options
  const svgoConfig = {
    floatPrecision: precision,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            // Keep viewBox for proper scaling unless user wants to remove it
            removeViewBox: removeViewBox,
            // Clean up IDs if enabled
            cleanupIds: cleanupIDs
          }
        }
      }
    ]
  }

  for (const file of files) {
    try {
      const originalSize = (await fs.stat(file.path)).size
      const svgContent = await fs.readFile(file.path, 'utf8')

      // Optimize SVG
      const result = optimize(svgContent, svgoConfig)

      // Get original filename without extension and keep it
      const baseFilename = path.basename(file.originalname, path.extname(file.originalname))
      const outputDir = path.dirname(file.path)
      const outputFilename = await getUniqueFilename(outputDir, baseFilename, 'svg')
      const outputPath = path.join(outputDir, outputFilename)

      // Write optimized SVG
      await fs.writeFile(outputPath, result.data, 'utf8')

      const optimizedSize = (await fs.stat(outputPath)).size
      const savings = ((originalSize - optimizedSize) / originalSize * 100).toFixed(2)

      // Clean up original file if different from output
      if (file.path !== outputPath) {
        await safeUnlink(file.path)
      }

      results.push({
        name: file.originalname,
        originalSize,
        processedFiles: [{
          format: 'svg',
          filename: outputFilename,
          size: optimizedSize,
          savings
        }],
        status: 'success'
      })

    } catch (error) {
      console.error(`Error optimizing ${file.originalname}:`, error)
      results.push({
        name: file.originalname,
        status: 'error',
        error: error.message
      })
    }
  }

  return results
}
