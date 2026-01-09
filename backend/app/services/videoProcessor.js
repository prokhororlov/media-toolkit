import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import { createRequire } from 'module'

// Setup ffmpeg paths - check environment variables first (Electron), then bundled, then system
const require = createRequire(import.meta.url)

function setupFfmpegPaths() {
  // Priority 1: Environment variables (set by Electron main process)
  const envFfmpegPath = process.env.FFMPEG_PATH
  const envFfprobePath = process.env.FFPROBE_PATH

  if (envFfmpegPath && envFfprobePath) {
    try {
      const ffmpegExists = fsSync.existsSync(envFfmpegPath)
      const ffprobeExists = fsSync.existsSync(envFfprobePath)

      if (ffmpegExists) {
        ffmpeg.setFfmpegPath(envFfmpegPath)
        console.log('Using Electron-provided ffmpeg:', envFfmpegPath)
      }
      if (ffprobeExists) {
        ffmpeg.setFfprobePath(envFfprobePath)
        console.log('Using Electron-provided ffprobe:', envFfprobePath)
      }

      if (ffmpegExists && ffprobeExists) {
        return // Successfully configured from env
      }
    } catch (e) {
      console.log('Electron-provided ffmpeg paths not accessible:', e.message)
    }
  }

  // Priority 2: Bundled binaries via npm packages
  try {
    const ffmpegPath = require('ffmpeg-static')
    const ffprobePath = require('@ffprobe-installer/ffprobe').path

    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath)
      console.log('Using bundled ffmpeg:', ffmpegPath)
    }
    if (ffprobePath) {
      ffmpeg.setFfprobePath(ffprobePath)
      console.log('Using bundled ffprobe:', ffprobePath)
    }
  } catch (e) {
    console.log('Using system ffmpeg (bundled not available):', e.message)
  }
}

setupFfmpegPaths()

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
 * Process video with specified options
 * @param {Object} file - Uploaded file
 * @param {Object} options - Processing options
 * @returns {Object} Result with processed file info
 */
export async function processVideo(file, options) {
  const {
    format = 'mp4',
    resize = 100,
    bitrate = '2M',
    preset = 'web',
    audio = true,
    resizeMode = 'percent', // 'percent' or 'absolute'
    width = null,
    height = null,
    crop = 'none' // 'none' or 'cover'
  } = options

  return new Promise(async (resolve, reject) => {
    try {
      const originalSize = (await fs.stat(file.path)).size

      // Get original filename without extension
      const baseFilename = path.basename(
        file.originalname,
        path.extname(file.originalname)
      )

      // Use the uploads directory directly to avoid path issues
      const uploadsDir = path.dirname(file.path)
      const outputFilename = await getUniqueFilename(uploadsDir, baseFilename, format)
      const outputPath = path.join(uploadsDir, outputFilename)

      // Use absolute paths resolved properly for Windows
      const inputPath = path.resolve(file.path)
      const normalizedOutputPath = path.resolve(outputPath)

      // Verify input file exists and is fully written before processing
      try {
        await fs.access(inputPath)
        // Check file size matches expected size (if available)
        const stats = await fs.stat(inputPath)
        if (stats.size === 0) {
          throw new Error('Input file is empty')
        }
        console.log(`Input file verified: ${inputPath} (${stats.size} bytes)`)
      } catch (accessError) {
        throw new Error(`Input file not accessible: ${inputPath} - ${accessError.message}`)
      }

      let command = ffmpeg(inputPath)

      // GIF has special handling
      if (format === 'gif') {
        // Build GIF filter chain with optional resize
        let gifScale = '480:-1'
        if (resizeMode === 'absolute' && width) {
          gifScale = `${width}:-1`
        } else if (resize !== 100) {
          const scale = resize / 100
          gifScale = `iw*${scale}:-1`
        }

        command = command
          .outputOptions([
            '-vf', `fps=10,scale=${gifScale}:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`
          ])
          .noAudio()
      } else {
        // Non-GIF formats

        // Set video codec based on format
        if (format === 'mp4' || format === 'mov' || format === 'mkv') {
          command = command.outputOptions(['-c:v', 'libx264'])
        } else if (format === 'webm') {
          command = command.outputOptions(['-c:v', 'libvpx-vp9'])
        }

        // Apply preset for x264
        if (format === 'mp4' || format === 'mov' || format === 'mkv') {
          const presetMap = {
            'web': 'medium',
            'quality': 'slow',
            'fast': 'veryfast'
          }
          command = command.outputOptions(['-preset', presetMap[preset] || 'medium'])

          // Use CRF for quality control instead of bitrate (more reliable)
          // Convert bitrate string to CRF value (lower = better quality)
          const bitrateNum = parseInt(bitrate)
          let crf = 23 // default
          if (bitrateNum >= 5) crf = 18
          else if (bitrateNum >= 3) crf = 20
          else if (bitrateNum >= 2) crf = 23
          else if (bitrateNum >= 1) crf = 28
          else crf = 32
          command = command.outputOptions(['-crf', String(crf)])
        }

        // movflags for MP4/MOV
        if (format === 'mp4' || format === 'mov') {
          command = command.outputOptions(['-movflags', '+faststart'])
        }

        // Apply resize based on mode
        if (resizeMode === 'absolute' && (width || height)) {
          let scaleFilter
          if (width && height) {
            if (crop === 'cover') {
              scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`
            } else {
              scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease`
            }
          } else if (width) {
            scaleFilter = `scale=${width}:-2`
          } else {
            scaleFilter = `scale=-2:${height}`
          }
          command = command.outputOptions(['-vf', scaleFilter])
        } else if (resize !== 100) {
          const scale = resize / 100
          command = command.outputOptions(['-vf', `scale=iw*${scale}:ih*${scale}`])
        }

        // Handle audio
        if (audio) {
          command = command.outputOptions(['-c:a', 'aac', '-b:a', '128k'])
        } else {
          command = command.noAudio()
        }
      }

      // Add -y flag to overwrite output file if exists
      command = command.outputOptions(['-y'])

      command
        .output(normalizedOutputPath)
        .on('end', async () => {
          try {
            const processedSize = (await fs.stat(normalizedOutputPath)).size
            const savings = ((originalSize - processedSize) / originalSize * 100).toFixed(2)

            // Clean up original file
            await fs.unlink(file.path)

            resolve({
              name: file.originalname,
              originalSize,
              filename: outputFilename,
              processedSize,
              savings,
              status: 'success'
            })
          } catch (error) {
            reject(error)
          }
        })
        .on('error', async (error) => {
          console.error('FFmpeg error:', error.message)
          console.error('Input path:', inputPath)
          console.error('Output path:', normalizedOutputPath)
          // Check if input file still exists
          try {
            const inputStats = await fs.stat(inputPath)
            console.error('Input file exists, size:', inputStats.size, 'bytes')
          } catch (e) {
            console.error('Input file does NOT exist at error time')
          }
          // Don't clean up input file for debugging
          // try {
          //   await fs.unlink(file.path)
          // } catch (e) {
          //   console.error('Cleanup error:', e)
          // }
          try {
            await fs.unlink(normalizedOutputPath)
          } catch (e) {
            // Output file might not exist
          }
          reject(error)
        })
        .run()

    } catch (error) {
      reject(error)
    }
  })
}
