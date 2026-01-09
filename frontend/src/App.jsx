import { useState, useEffect } from 'react'
import Header from './components/Header'
import FileDropZone from './components/FileDropZone'
import ProcessingOptions from './components/ProcessingOptions'
import Results from './components/Results'
import FileConversionOptions from './components/FileConversionOptions'
import { ToastProvider, useToast } from './components/Toast'
import { processImages, processVideo, getConfig } from './services/api'

// Default limits (can be disabled via DISABLE_LIMITS env var)
const DEFAULT_MAX_QUEUE_SIZE = 20
const DEFAULT_IMAGE_SIZE_LIMIT = 100 * 1024 * 1024 // 100MB total for images
const DEFAULT_VIDEO_SIZE_LIMIT = 500 * 1024 * 1024 // 500MB for videos

// Helper function to check if a file is an image
const isImageFile = (file) => {
  const ext = file.name.split('.').pop().toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp', 'tiff', 'svg'].includes(ext)
}

// Helper function to check if a file is a video
const isVideoFile = (file) => {
  const ext = file.name.split('.').pop().toLowerCase()
  return ['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'wmv', 'm4v'].includes(ext)
}

function App() {
  const { showToast } = useToast()
  const [mode, setMode] = useState('images') // 'images' or 'video'
  // Separate file queues per mode
  const [files, setFiles] = useState({
    images: [],
    video: []
  })
  const [processing, setProcessing] = useState(false)
  // Separate results per mode
  const [results, setResults] = useState({
    images: [],
    video: []
  })
  const [queueLimitMessage, setQueueLimitMessage] = useState(null)
  const [options, setOptions] = useState({
    images: {
      quality: 80,
      resize: 100,
      formats: ['webp']
    },
    svg: {
      precision: 2,
      removeViewBox: false,
      cleanupIDs: true
    },
    video: {
      format: 'mp4',
      resize: 100,
      bitrate: '2M',
      preset: 'web',
      audio: true
    }
  })
  // Per-file options (overrides global options if set) - separate per mode
  const [fileOptions, setFileOptions] = useState({
    images: {},
    video: {}
  })
  // File options modal state
  const [showFileOptionsModal, setShowFileOptionsModal] = useState(false)
  const [selectedFileIndex, setSelectedFileIndex] = useState(null)
  // Track if initial load from localStorage is complete
  const [isInitialized, setIsInitialized] = useState(false)
  // Track the last processed queue to detect changes
  const [lastProcessedQueue, setLastProcessedQueue] = useState({
    images: null,
    video: null
  })
  // Config from server (limits disabled in Electron mode)
  const [disableLimits, setDisableLimits] = useState(false)

  // Computed limits based on config
  const MAX_QUEUE_SIZE = disableLimits ? Infinity : DEFAULT_MAX_QUEUE_SIZE
  const IMAGE_SIZE_LIMIT = disableLimits ? Infinity : DEFAULT_IMAGE_SIZE_LIMIT
  const VIDEO_SIZE_LIMIT = disableLimits ? Infinity : DEFAULT_VIDEO_SIZE_LIMIT

  const STORAGE_KEY = 'media-toolkit-session'

  // Fetch config and load state from localStorage on mount
  useEffect(() => {
    async function initialize() {
      // Fetch config from server first
      try {
        const config = await getConfig()
        setDisableLimits(config.disableLimits)

        // Skip localStorage when limits are disabled (Electron mode)
        if (config.disableLimits) {
          // Clear any existing session data
          localStorage.removeItem(STORAGE_KEY)
          localStorage.removeItem('media-toolkit-results-timestamp-images')
          localStorage.removeItem('media-toolkit-results-timestamp-video')
          setIsInitialized(true)
          return
        }
      } catch (error) {
        console.error('Failed to fetch config:', error)
      }

      // Load state from localStorage (only when limits are enabled)
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.mode) setMode(parsed.mode)
          if (parsed.options) setOptions(parsed.options)
          // Handle new per-mode results format (migrate from old format if needed)
          if (parsed.results) {
            if (Array.isArray(parsed.results)) {
              // Old format - migrate to new format
              setResults({ images: parsed.results, video: [] })
            } else {
              setResults(parsed.results)
            }
          }
          // Handle new per-mode fileOptions format (migrate from old format if needed)
          if (parsed.fileOptions) {
            if (!parsed.fileOptions.images && !parsed.fileOptions.video) {
              // Old format - migrate to new format
              setFileOptions({ images: parsed.fileOptions, video: {} })
            } else {
              setFileOptions(parsed.fileOptions)
            }
          }
        }
      } catch (error) {
        console.error('Failed to load session from localStorage:', error)
      }
      setIsInitialized(true)
    }

    initialize()
  }, [])

  // Save state to localStorage when it changes (skip when limits are disabled)
  useEffect(() => {
    if (!isInitialized) return // Don't save during initial load
    if (disableLimits) return // Don't save when limits are disabled (Electron mode)

    try {
      const session = {
        mode,
        options,
        results,
        fileOptions
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    } catch (error) {
      console.error('Failed to save session to localStorage:', error)
    }
  }, [mode, options, results, fileOptions, isInitialized, disableLimits])

  const handleFilesAdded = (newFiles) => {
    // Clear any previous limit message
    setQueueLimitMessage(null)

    if (newFiles.length === 0) {
      return
    }

    // Filter files based on current mode
    const isValidFile = mode === 'images' ? isImageFile : isVideoFile
    const sizeLimit = mode === 'images' ? IMAGE_SIZE_LIMIT : VIDEO_SIZE_LIMIT
    const limitLabel = disableLimits ? 'unlimited' : (mode === 'images' ? '100MB' : '500MB')
    const fileTypeLabel = mode === 'images' ? 'image' : 'video'

    // Filter only files matching the current mode
    const modeFiles = newFiles.filter(isValidFile)
    const wrongTypeCount = newFiles.length - modeFiles.length

    if (modeFiles.length === 0) {
      if (wrongTypeCount > 0) {
        setQueueLimitMessage(`No valid ${fileTypeLabel} files found. Please add ${fileTypeLabel} files.`)
      }
      return
    }

    setFiles(prev => {
      const currentQueue = prev[mode]

      // Create a Set of existing file identifiers (name + size + lastModified)
      const existingFiles = new Set(
        currentQueue.map(f => `${f.name}-${f.size}-${f.lastModified}`)
      )

      // Filter out duplicates from modeFiles
      const uniqueNewFiles = modeFiles.filter(file => {
        const fileId = `${file.name}-${file.size}-${file.lastModified}`
        return !existingFiles.has(fileId)
      })

      if (uniqueNewFiles.length === 0) {
        return prev
      }

      // Calculate how many files can be added (queue limit)
      const remainingSlots = MAX_QUEUE_SIZE - currentQueue.length

      if (remainingSlots <= 0) {
        setQueueLimitMessage(`Queue is full. Maximum ${MAX_QUEUE_SIZE} files allowed.`)
        return prev
      }

      // Apply queue limit
      let filesToAdd = uniqueNewFiles.slice(0, remainingSlots)
      const queueRejected = uniqueNewFiles.length - filesToAdd.length

      // Calculate current total size
      const currentSize = currentQueue.reduce((sum, f) => sum + f.size, 0)
      const newTotal = filesToAdd.reduce((sum, f) => sum + f.size, 0)

      const messages = []

      // Check size limit
      let acceptedFiles = []
      if (currentSize + newTotal > sizeLimit) {
        // Try to add as many files as possible
        let remainingBudget = sizeLimit - currentSize
        for (const file of filesToAdd) {
          if (file.size <= remainingBudget) {
            acceptedFiles.push(file)
            remainingBudget -= file.size
          }
        }
        const rejectedCount = filesToAdd.length - acceptedFiles.length
        if (rejectedCount > 0) {
          messages.push(`${rejectedCount} file(s) rejected - total ${fileTypeLabel} size limit is ${limitLabel}`)
        }
      } else {
        acceptedFiles = filesToAdd
      }

      // Add queue limit message if applicable
      if (queueRejected > 0) {
        messages.push(`${queueRejected} file(s) rejected - queue limit is ${MAX_QUEUE_SIZE} files`)
      }

      // Add wrong type message if applicable
      if (wrongTypeCount > 0) {
        messages.push(`${wrongTypeCount} non-${fileTypeLabel} file(s) ignored`)
      }

      // Set combined message
      if (messages.length > 0) {
        setQueueLimitMessage(messages.join('. '))
      }

      if (acceptedFiles.length === 0) {
        return prev
      }

      return {
        ...prev,
        [mode]: [...currentQueue, ...acceptedFiles]
      }
    })
  }

  const handleRemoveFile = (index) => {
    setFiles(prev => ({
      ...prev,
      [mode]: prev[mode].filter((_, i) => i !== index)
    }))
    // Also remove file-specific options for current mode
    setFileOptions(prev => {
      const modeOptions = { ...prev[mode] }
      delete modeOptions[index]
      // Reindex remaining options
      const reindexed = {}
      Object.keys(modeOptions).forEach(key => {
        const oldIndex = parseInt(key)
        if (oldIndex > index) {
          reindexed[oldIndex - 1] = modeOptions[key]
        } else {
          reindexed[key] = modeOptions[key]
        }
      })
      return {
        ...prev,
        [mode]: reindexed
      }
    })
  }

  const handleFileOptionsChange = (fileIndex, newOptions) => {
    setFileOptions(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        [fileIndex]: newOptions
      }
    }))
  }

  const handleOpenFileOptions = (fileIndex) => {
    setSelectedFileIndex(fileIndex)
    setShowFileOptionsModal(true)
  }

  const handleCloseFileOptions = () => {
    setShowFileOptionsModal(false)
    setSelectedFileIndex(null)
  }

  // Get current mode's files
  const currentFiles = files[mode]
  const currentFileOptions = fileOptions[mode]
  const currentResults = results[mode]

  // Check if queue has changed since last processing
  const currentQueueSnapshot = currentFiles.map(f => `${f.name}-${f.size}-${f.lastModified}`).join('|')
  const hasQueueChanged = lastProcessedQueue[mode] === null || currentQueueSnapshot !== lastProcessedQueue[mode]

  const handleProcessClick = () => {
    if (currentFiles.length === 0) return
    handleProcess()
  }

  const handleProcess = async () => {
    if (currentFiles.length === 0) return

    setProcessing(true)
    // Save the current queue snapshot to detect future changes
    const queueSnapshot = currentFiles.map(f => `${f.name}-${f.size}-${f.lastModified}`).join('|')
    setLastProcessedQueue(prev => ({
      ...prev,
      [mode]: queueSnapshot
    }))
    // Clear only current mode's results
    setResults(prev => ({
      ...prev,
      [mode]: []
    }))

    try {
      if (mode === 'images') {
        // All files in images queue are already image files
        const imageFiles = currentFiles

        if (imageFiles.length === 0) {
          showToast('No image files in the queue. Please add image files.', 'warning')
          setProcessing(false)
          return
        }

        // Check if any files have custom options
        const hasCustomOptions = Object.keys(currentFileOptions).length > 0

        if (hasCustomOptions) {
          // Process images individually with their specific options
          const processedResults = []

          for (let i = 0; i < currentFiles.length; i++) {
            const file = currentFiles[i]

            // Build file-specific options
            let fileSpecificOptions
            if (currentFileOptions[i]) {
              const isSvg = file.name.toLowerCase().endsWith('.svg')

              if (isSvg && currentFileOptions[i].svgMode === 'optimize') {
                // SVG optimization mode - use SVG options only
                fileSpecificOptions = {
                  ...options.svg,
                  ...currentFileOptions[i],
                  formats: ['svg'] // Force SVG output
                }
              } else if (isSvg && currentFileOptions[i].svgMode === 'convert') {
                // SVG to raster conversion - use raster options
                fileSpecificOptions = {
                  ...options.images,
                  ...currentFileOptions[i]
                }
              } else {
                // Regular raster image
                fileSpecificOptions = {
                  ...options.images,
                  ...currentFileOptions[i]
                }
              }
            } else {
              // No custom options - use defaults
              const isSvg = file.name.toLowerCase().endsWith('.svg')
              if (isSvg) {
                // SVG files default to optimize mode (no raster conversion)
                fileSpecificOptions = {
                  ...options.svg,
                  formats: ['svg'] // Force SVG output only
                }
              } else {
                // Regular raster image
                fileSpecificOptions = {
                  ...options.images
                }
              }
            }

            try {
              const response = await processImages([file], fileSpecificOptions)

              if (response.success && response.results.length > 0) {
                processedResults.push({
                  name: response.results[0].name,
                  beforeSize: response.results[0].originalSize,
                  processedFiles: response.results[0].processedFiles,
                  status: response.results[0].status,
                  error: response.results[0].error
                })
              }
            } catch (error) {
              processedResults.push({
                name: file.name,
                status: 'error',
                error: error.message
              })
            }
            setResults(prev => ({
              ...prev,
              images: [...processedResults]
            }))
          }
        } else {
          // Process all images with same options (batch)
          // Separate SVG files from raster files
          const svgFiles = imageFiles.filter(f => f.name.toLowerCase().endsWith('.svg'))
          const rasterFiles = imageFiles.filter(f => !f.name.toLowerCase().endsWith('.svg'))

          const processedResults = []

          // Process raster files with raster options
          if (rasterFiles.length > 0) {
            const rasterOptions = {
              ...options.images
            }
            const response = await processImages(rasterFiles, rasterOptions)
            if (response.success) {
              response.results.forEach(result => {
                processedResults.push({
                  name: result.name,
                  beforeSize: result.originalSize,
                  processedFiles: result.processedFiles,
                  status: result.status,
                  error: result.error
                })
              })
            }
          }

          // Process SVG files with SVG options (optimize by default)
          if (svgFiles.length > 0) {
            const svgProcessingOptions = {
              ...options.svg,
              formats: ['svg'] // Force SVG output (optimization mode)
            }
            const response = await processImages(svgFiles, svgProcessingOptions)
            if (response.success) {
              response.results.forEach(result => {
                processedResults.push({
                  name: result.name,
                  beforeSize: result.originalSize,
                  processedFiles: result.processedFiles,
                  status: result.status,
                  error: result.error
                })
              })
            }
          }

          setResults(prev => ({
            ...prev,
            images: processedResults
          }))
        }
      } else {
        // All files in video queue are already video files
        const videoFiles = currentFiles

        if (videoFiles.length === 0) {
          showToast('No video files in the queue. Please add video files.', 'warning')
          setProcessing(false)
          return
        }

        // Process videos one by one with their specific options
        const processedResults = []

        for (let i = 0; i < currentFiles.length; i++) {
          const file = currentFiles[i]

          const fileSpecificOptions = currentFileOptions[i] || options.video

          try {
            const response = await processVideo(file, fileSpecificOptions)

            if (response.success) {
              processedResults.push({
                name: response.result.name,
                beforeSize: response.result.originalSize,
                afterSize: response.result.processedSize,
                savings: response.result.savings,
                filename: response.result.filename,
                status: 'success'
              })
            }
          } catch (error) {
            processedResults.push({
              name: file.name,
              status: 'error',
              error: error.message
            })
          }
          setResults(prev => ({
            ...prev,
            video: [...processedResults]
          }))
        }
      }
    } catch (error) {
      console.error('Processing error:', error)
      showToast(`Processing failed: ${error.message}`, 'error')
    } finally {
      setProcessing(false)
    }
  }

  const handleClear = () => {
    // Clear only current mode's files, results, and fileOptions
    setFiles(prev => ({
      ...prev,
      [mode]: []
    }))
    setResults(prev => ({
      ...prev,
      [mode]: []
    }))
    setFileOptions(prev => ({
      ...prev,
      [mode]: {}
    }))
    // Clear results timestamp for current mode
    localStorage.removeItem(`media-toolkit-results-timestamp-${mode}`)
  }

  return (
    <div className="min-h-screen bg-terminal-bg relative overflow-hidden">
      {/* Scanline effect */}
      <div className="terminal-scanline absolute inset-0 pointer-events-none"></div>

      {/* File Options Modal */}
      {showFileOptionsModal && selectedFileIndex !== null && (
        <FileConversionOptions
          file={currentFiles[selectedFileIndex]}
          fileIndex={selectedFileIndex}
          mode={mode}
          globalOptions={currentFileOptions[selectedFileIndex] || options[mode]}
          onSave={handleFileOptionsChange}
          onClose={handleCloseFileOptions}
        />
      )}

      {/* Main content */}
      <div className="relative z-10">
        <Header />

        <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
          {/* Mode Selector */}
          <div className="flex gap-2 sm:gap-4">
            <button
              onClick={() => setMode('images')}
              className={`flex-1 py-2 sm:py-3 font-mono font-bold text-sm sm:text-base border-2 transition-all duration-200 ${
                mode === 'images'
                  ? 'bg-terminal-neon-green text-terminal-bg border-terminal-neon-green'
                  : 'bg-terminal-surface text-terminal-text border-terminal-border hover:border-terminal-neon-green'
              }`}
            >
              <span className="hidden sm:inline">[ IMAGE PROCESSING ]</span>
              <span className="sm:hidden">[ IMAGES ]</span>
            </button>
            <button
              onClick={() => setMode('video')}
              className={`flex-1 py-2 sm:py-3 font-mono font-bold text-sm sm:text-base border-2 transition-all duration-200 ${
                mode === 'video'
                  ? 'bg-terminal-neon-green text-terminal-bg border-terminal-neon-green'
                  : 'bg-terminal-surface text-terminal-text border-terminal-border hover:border-terminal-neon-green'
              }`}
            >
              <span className="hidden sm:inline">[ VIDEO PROCESSING ]</span>
              <span className="sm:hidden">[ VIDEO ]</span>
            </button>
          </div>

          {/* File Drop Zone with integrated queue */}
          <FileDropZone
            mode={mode}
            onFilesAdded={handleFilesAdded}
            files={currentFiles}
            onRemove={handleRemoveFile}
            onFileOptions={handleOpenFileOptions}
            fileOptions={currentFileOptions}
            disabled={processing}
            maxFiles={MAX_QUEUE_SIZE}
            queueLimitMessage={queueLimitMessage}
            onClearLimitMessage={() => setQueueLimitMessage(null)}
            imageSizeLimit={IMAGE_SIZE_LIMIT}
            videoSizeLimit={VIDEO_SIZE_LIMIT}
            disableLimits={disableLimits}
          />

          {/* Processing Options */}
          <ProcessingOptions
            mode={mode}
            options={options[mode]}
            svgOptions={options.svg}
            onOptionsChange={(newOptions) => setOptions(prev => ({
              ...prev,
              [mode]: newOptions
            }))}
            onSvgOptionsChange={(newSvgOptions) => setOptions(prev => ({
              ...prev,
              svg: newSvgOptions
            }))}
            disabled={processing}
            files={currentFiles}
          />

          {/* Action Buttons - show only when queue changed OR no results (for Clear button) */}
          {currentFiles.length > 0 && (hasQueueChanged || currentResults.length === 0) && (
            <div className="flex gap-2 sm:gap-4">
              {/* Show Process Files button only when queue has changed */}
              {hasQueueChanged && (
                <button
                  onClick={handleProcessClick}
                  disabled={processing}
                  className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base py-2 sm:py-3"
                >
                  {processing ? '[ PROCESSING... ]' : '[ PROCESS FILES ]'}
                </button>
              )}
              {/* Show Clear button only when there are no results (otherwise Clear Session is in Results) */}
              {currentResults.length === 0 && (
                <button
                  onClick={handleClear}
                  disabled={processing}
                  className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  [ CLEAR ]
                </button>
              )}
            </div>
          )}

          {/* Results */}
          {currentResults.length > 0 && (
            <Results results={currentResults} processing={processing} onClear={handleClear} mode={mode} />
          )}
        </main>

        {/* Footer */}
        <footer className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 mt-8 sm:mt-16 border-t-2 border-terminal-border">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-terminal-muted font-mono text-xs sm:text-sm">
            <div className="text-center sm:text-left">
              <span className="neon-text">SERVER PROCESSING</span> - Sharp + SVGO + FFmpeg
            </div>
            <div>
              Media Toolkit v1.0
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

function AppWithToast() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  )
}

export default AppWithToast
