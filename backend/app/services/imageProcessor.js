import sharp from 'sharp'
import path from 'path'
import fs from 'fs/promises'
import { optimizeSVGs } from './svgProcessor.js'

/**
 * Safely delete a file with retry logic for Windows file locking
 * @param {string} filePath - Path to delete
 * @param {number} retries - Number of retries
 * @param {number} delay - Delay between retries in ms
 */
async function safeUnlink(filePath, retries = 3, delay = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.unlink(filePath)
      return
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EBUSY') {
        if (i < retries - 1) {
          // Wait and retry - file might still be locked by sharp
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)))
        } else {
          // Final attempt failed, log but don't throw
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

  // Check if file exists and add counter if needed
  while (true) {
    try {
      await fs.access(filePath)
      // File exists, try with counter
      filename = `${baseName}_${counter}.${format}`
      filePath = path.join(dir, filename)
      counter++
    } catch {
      // File doesn't exist, we can use this name
      break
    }
  }

  return filename
}

/**
 * Process images with specified options
 * @param {Array} files - Array of uploaded files
 * @param {Object} options - Processing options
 * @returns {Array} Results with processed file info
 */
export async function processImages(files, options) {
  const {
    quality = 80,
    resize = 100,
    formats = ['webp'],
    useImageMagick = process.env.DISABLE_IMAGEMAGICK !== 'true',
    resizeMode = 'percent', // 'percent' or 'absolute'
    width = null,
    height = null,
    crop = 'none' // 'none' or 'cover'
  } = options

  // Dynamically import ImageMagick processor
  const { shouldUseImageMagick, processWithImageMagick, isImageMagickAvailable } = await import('./imageMagickProcessor.js')

  // Separate files by type
  const svgFiles = files.filter(f => path.extname(f.originalname).toLowerCase() === '.svg')
  const imageMagickFiles = useImageMagick 
    ? files.filter(f => shouldUseImageMagick(f.originalname))
    : []
  const rasterFiles = files.filter(f => 
    path.extname(f.originalname).toLowerCase() !== '.svg' && 
    (useImageMagick ? !shouldUseImageMagick(f.originalname) : true)
  )

  const results = []

  // Determine if SVG files should be converted to raster formats
  const hasRasterFormats = formats.some(f => ['webp', 'avif', 'jpg', 'jpeg', 'png'].includes(f))
  const hasSvgFormat = formats.includes('svg')

  // Process SVG files
  if (svgFiles.length > 0) {
    // IMPORTANT: Convert SVGs to raster formats FIRST (before SVG optimization)
    // because optimizeSVGs deletes the original file, which we need for raster conversion
    if (hasRasterFormats) {
      for (const file of svgFiles) {
        try {
          const originalSize = (await fs.stat(file.path)).size
          const processedFiles = []

          // Filter to only raster formats
          const rasterFormats = formats.filter(f => ['webp', 'avif', 'jpg', 'jpeg', 'png'].includes(f))

          // Get original filename without extension
          const baseFilename = path.basename(
            file.originalname,
            path.extname(file.originalname)
          )

          for (const format of rasterFormats) {
            // Generate unique filename using original name with new extension
            const outputDir = path.dirname(file.path)
            const outputFilename = await getUniqueFilename(outputDir, baseFilename, format)

            const outputPath = path.join(
              outputDir,
              outputFilename
            )

            // Sharp can directly process SVG files
            let processor = sharp(file.path, { density: 300 }) // High DPI for better quality

            // Apply resize based on mode
            if (resizeMode === 'absolute' && (width || height)) {
              const resizeOptions = {}
              if (width) resizeOptions.width = width
              if (height) resizeOptions.height = height

              if (crop === 'cover') {
                resizeOptions.fit = 'cover'
                resizeOptions.position = 'center'
              } else {
                resizeOptions.fit = 'inside'
                resizeOptions.withoutEnlargement = false
              }

              processor = processor.resize(resizeOptions)
            } else if (resize !== 100) {
              const metadata = await processor.metadata()
              const newWidth = Math.round(metadata.width * (resize / 100))
              const newHeight = Math.round(metadata.height * (resize / 100))
              processor = processor.resize(newWidth, newHeight)
            }

            // Convert to target format with quality settings
            switch (format) {
              case 'webp':
                processor = processor.webp({ quality })
                break
              case 'png':
                processor = processor.png({
                  compressionLevel: 9,
                  quality
                })
                break
              case 'avif':
                processor = processor.avif({ quality })
                break
              case 'jpeg':
              case 'jpg':
                processor = processor.jpeg({ quality })
                break
            }

            await processor.toFile(outputPath)

            const processedSize = (await fs.stat(outputPath)).size
            const savings = originalSize > processedSize
              ? ((originalSize - processedSize) / originalSize * 100).toFixed(2)
              : '0.00'

            processedFiles.push({
              format,
              filename: outputFilename,
              size: processedSize,
              savings
            })
          }

          // Don't clean up original SVG file yet if we also need to optimize it
          if (!hasSvgFormat) {
            await safeUnlink(file.path)
          }

          // Only add result if we converted to raster formats
          if (processedFiles.length > 0) {
            results.push({
              name: file.originalname,
              originalSize,
              processedFiles,
              status: 'success'
            })
          }

        } catch (error) {
          console.error(`Error converting SVG ${file.originalname}:`, error)
          results.push({
            name: file.originalname,
            status: 'error',
            error: error.message
          })
        }
      }
    }

    // Optimize SVGs if 'svg' format is requested (do this AFTER raster conversion)
    if (hasSvgFormat) {
      const svgResults = await optimizeSVGs(svgFiles, options)
      results.push(...svgResults)
    }
  }

  // Process ImageMagick files (TIFF, PSD, EPS, etc.) if ImageMagick is available and enabled
  if (imageMagickFiles.length > 0) {
    const isAvailable = await isImageMagickAvailable()
    if (isAvailable) {
      try {
        const imageMagickResults = await processWithImageMagick(imageMagickFiles, options)
        results.push(...imageMagickResults)
      } catch (error) {
        console.error('ImageMagick processing failed, falling back to Sharp:', error)
        // Fall back to Sharp for these files
        rasterFiles.push(...imageMagickFiles)
      }
    } else {
      // ImageMagick not available, use Sharp instead
      console.warn('ImageMagick not available, using Sharp for special formats')
      rasterFiles.push(...imageMagickFiles)
    }
  }

  // Process raster images with Sharp
  for (const file of rasterFiles) {
    try {
      const originalSize = (await fs.stat(file.path)).size
      const processedFiles = []

      // Skip 'svg' format for raster images
      const rasterFormats = formats.filter(f => f !== 'svg')

      // Get original filename without extension
      const baseFilename = path.basename(
        file.originalname,
        path.extname(file.originalname)
      )

      // Process for each requested format
      for (const format of rasterFormats) {
        // Generate unique filename using original name with new extension
        const outputDir = path.dirname(file.path)
        const outputFilename = await getUniqueFilename(outputDir, baseFilename, format)

        const outputPath = path.join(
          outputDir,
          outputFilename
        )

        let processor = sharp(file.path)

        // Apply resize based on mode
        if (resizeMode === 'absolute' && (width || height)) {
          const resizeOptions = {}
          if (width) resizeOptions.width = width
          if (height) resizeOptions.height = height

          if (crop === 'cover') {
            resizeOptions.fit = 'cover'
            resizeOptions.position = 'center'
          } else {
            resizeOptions.fit = 'inside'
            resizeOptions.withoutEnlargement = false
          }

          processor = processor.resize(resizeOptions)
        } else if (resize !== 100) {
          const metadata = await processor.metadata()
          const newWidth = Math.round(metadata.width * (resize / 100))
          const newHeight = Math.round(metadata.height * (resize / 100))
          processor = processor.resize(newWidth, newHeight)
        }

        // Convert to target format with quality settings
        switch (format) {
          case 'webp':
            processor = processor.webp({ quality })
            break
          case 'png':
            processor = processor.png({
              compressionLevel: 9,
              quality
            })
            break
          case 'avif':
            processor = processor.avif({ quality })
            break
          case 'jpeg':
          case 'jpg':
            processor = processor.jpeg({ quality })
            break
          default:
            processor = processor.webp({ quality })
        }

        await processor.toFile(outputPath)

        const processedSize = (await fs.stat(outputPath)).size
        const savings = ((originalSize - processedSize) / originalSize * 100).toFixed(2)

        processedFiles.push({
          format,
          filename: outputFilename,
          size: processedSize,
          savings
        })
      }

      // Clean up original file (with retry for Windows file locking)
      await safeUnlink(file.path)

      results.push({
        name: file.originalname,
        originalSize,
        processedFiles,
        status: 'success'
      })

    } catch (error) {
      console.error(`Error processing ${file.originalname}:`, error)
      results.push({
        name: file.originalname,
        status: 'error',
        error: error.message
      })
    }
  }

  return results
}
