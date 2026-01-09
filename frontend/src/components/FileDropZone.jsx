import { useState, useRef, useEffect } from 'react'

export default function FileDropZone({ mode, onFilesAdded, disabled, files = [], onRemove, onFileOptions, fileOptions = {}, maxFiles = 20, queueLimitMessage, onClearLimitMessage, imageSizeLimit, videoSizeLimit, disableLimits = false }) {
  const [isDragging, setIsDragging] = useState(false)
  const [previews, setPreviews] = useState({})
  const fileInputRef = useRef(null)

  const isAtLimit = !disableLimits && files.length >= maxFiles

  const acceptedTypes = {
    images: '.png,.jpg,.jpeg,.webp,.svg,.avif',
    video: '.mp4,.webm,.mov,.mkv,.avi,.flv,.wmv,.m4v'
  }

  // Separate files into images and videos
  const imageFiles = files.filter(file => {
    const ext = file.name.split('.').pop().toLowerCase()
    return ['png', 'jpg', 'jpeg', 'webp', 'svg', 'avif', 'gif', 'bmp', 'tiff'].includes(ext)
  })

  const videoFiles = files.filter(file => {
    const ext = file.name.split('.').pop().toLowerCase()
    return ['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'wmv', 'm4v'].includes(ext)
  })

  const handleDragOver = (e) => {
    e.preventDefault()
    if (!disabled && !isAtLimit) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)

    if (disabled || isAtLimit) return

    const droppedFiles = Array.from(e.dataTransfer.files)
    onFilesAdded(droppedFiles)
  }

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files)
    onFilesAdded(selectedFiles)
    // Reset input value to allow re-selecting the same files
    e.target.value = ''
  }

  const handleClick = () => {
    if (!disabled && !isAtLimit) {
      fileInputRef.current?.click()
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  // Get the current size limit based on mode
  const currentSizeLimit = mode === 'images' ? imageSizeLimit : videoSizeLimit
  const sizeLimitLabel = disableLimits ? 'Unlimited' : (mode === 'images' ? '100MB' : '500MB')

  // Generate preview URLs for image files
  // Use file object itself as key to avoid index issues when removing files
  useEffect(() => {
    // Get keys for current image files only
    const currentImageFileKeys = new Set(
      files
        .filter(f => f.type && f.type.startsWith('image/'))
        .map(f => `${f.name}-${f.size}-${f.lastModified}`)
    )

    // Find new previews needed
    const newPreviews = {}
    files.forEach((file) => {
      if (file.type && file.type.startsWith('image/')) {
        const fileKey = `${file.name}-${file.size}-${file.lastModified}`
        if (!previews[fileKey]) {
          newPreviews[fileKey] = URL.createObjectURL(file)
        }
      }
    })

    // Find previews that are no longer needed (removed image files)
    const keysToRemove = []
    Object.keys(previews).forEach(key => {
      if (!currentImageFileKeys.has(key)) {
        keysToRemove.push(key)
      }
    })

    // Only update if there are changes
    if (Object.keys(newPreviews).length > 0 || keysToRemove.length > 0) {
      setPreviews(prev => {
        const updated = { ...prev, ...newPreviews }
        // Remove old previews and revoke URLs
        keysToRemove.forEach(key => {
          if (updated[key]) {
            URL.revokeObjectURL(updated[key])
            delete updated[key]
          }
        })
        return updated
      })
    }
  }, [files])

  const hasFiles = files.length > 0
  const displayFiles = mode === 'images' ? imageFiles : videoFiles
  const hasDisplayFiles = displayFiles.length > 0

  return (
    <div className="bg-terminal-surface border-2 border-terminal-border">
      {/* Queue limit message */}
      {queueLimitMessage && (
        <div className="p-3 bg-terminal-neon-yellow bg-opacity-20 border-b-2 border-terminal-neon-yellow flex items-center justify-between">
          <span className="font-mono text-xs text-terminal-neon-yellow font-bold">
            {queueLimitMessage}
          </span>
          <button
            onClick={onClearLimitMessage}
            className="font-mono text-xs text-terminal-neon-yellow hover:text-terminal-text px-2"
          >
            [DISMISS]
          </button>
        </div>
      )}

      {/* Drop zone header / compact zone when files exist */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!hasDisplayFiles ? handleClick : undefined}
        className={`
          relative transition-all duration-300
          ${!hasDisplayFiles ? 'cursor-pointer' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${isDragging
            ? mode === 'images'
              ? 'border-b-2 border-terminal-neon-green bg-terminal-neon-green bg-opacity-10'
              : 'border-b-2 border-terminal-neon-green bg-terminal-neon-green bg-opacity-10'
            : hasDisplayFiles ? 'border-b-2 border-terminal-border' : ''
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes[mode]}
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />

        {!hasDisplayFiles ? (
          // Full drop zone when no files
          <div className={`p-12 border-2 border-dashed m-4 ${
            isDragging
              ? mode === 'images'
                ? 'border-terminal-neon-green'
                : 'border-terminal-neon-green'
              : mode === 'images'
                ? 'border-terminal-border hover:border-terminal-neon-green'
                : 'border-terminal-border hover:border-terminal-neon-green'
          }`}>
            <div className="text-center">
              <div className={`text-5xl mb-3 ${isDragging ? 'animate-pulse' : ''}`}>
                {mode === 'images' ? '🖼️' : '🎬'}
              </div>
              <h3 className="font-mono text-lg font-bold mb-2 text-terminal-text">
                {isDragging ? 'DROP FILES HERE' : `DRAG & DROP ${mode.toUpperCase()}`}
              </h3>
              <p className="font-mono text-xs text-terminal-muted mb-3">
                or click to browse files
              </p>
              <div className="inline-block px-3 py-1 border border-terminal-border font-mono text-xs text-terminal-muted mb-3">
                {mode === 'images'
                  ? 'PNG, JPG, WebP, SVG, AVIF'
                  : 'MP4, WebM, MOV, MKV, AVI'
                }
              </div>
              <div className="font-mono text-xs text-terminal-muted mb-1">
                Max total size: <span className="text-terminal-neon-green font-bold">{sizeLimitLabel}</span>
              </div>
              <div className="font-mono text-xs text-terminal-muted">
                {disableLimits ? `${files.length} files in queue` : `${files.length}/${maxFiles} files in queue`}
              </div>
            </div>
          </div>
        ) : (
          // Compact header when files exist
          <div className="p-3 flex items-center justify-between">
            <h3 className="font-mono text-sm font-bold text-terminal-text">
              {'>'} {mode === 'images' ? 'IMAGE' : 'VIDEO'} QUEUE ({disableLimits ? files.length : `${files.length}/${maxFiles}`}) - {
                isAtLimit
                  ? <span className="text-terminal-neon-yellow">QUEUE FULL</span>
                  : isDragging
                    ? 'DROP TO ADD MORE'
                    : <>Drag files or{' '}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleClick()
                          }}
                          className="text-terminal-neon-green hover:underline"
                          disabled={disabled || isAtLimit}
                        >
                          click to add
                        </button>
                      </>
              }
            </h3>
            {!disabled && (
              <div className={`font-mono text-xs px-2 py-1 font-bold ${
                isAtLimit
                  ? 'bg-terminal-neon-yellow text-terminal-bg'
                  : 'bg-terminal-neon-green text-terminal-bg'
              }`}>
                {isAtLimit ? 'FULL' : 'READY'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* File list */}
      {hasDisplayFiles && (
        <div className="max-h-64 overflow-y-auto">
          {displayFiles.map((file, index) => {
            // Find the original index in the full files array
            const originalIndex = files.indexOf(file)
            return (
              <div
                key={originalIndex}
                className="flex items-center justify-between p-3 border-b border-terminal-border hover:bg-terminal-bg transition-colors"
              >
                {/* Preview thumbnail */}
                {(() => {
                  const fileKey = `${file.name}-${file.size}-${file.lastModified}`
                  return previews[fileKey] && (
                    <div className="flex-shrink-0 mr-3">
                      <div className={`w-12 h-12 border overflow-hidden bg-terminal-bg flex items-center justify-center ${
                        mode === 'images' ? 'border-terminal-neon-green' : 'border-terminal-neon-green'
                      }`}>
                        <img
                          src={previews[fileKey]}
                          alt={file.name}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    </div>
                  )
                })()}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-xs font-bold text-terminal-text truncate">
                      {file.name}
                    </div>
                    {fileOptions[originalIndex] && (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 border font-mono text-[10px] font-bold whitespace-nowrap ${
                        mode === 'images'
                          ? 'bg-terminal-neon-green border-terminal-neon-green text-terminal-bg'
                          : 'bg-terminal-neon-green border-terminal-neon-green text-terminal-bg'
                      }`}>
                        ⚙ CUSTOM
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs text-terminal-muted">
                    {formatFileSize(file.size)}
                    {!fileOptions[originalIndex] && (
                      <span className="ml-2 text-terminal-text opacity-50">● Using defaults</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 ml-3">
                  <button
                    onClick={() => onFileOptions(originalIndex)}
                    disabled={disabled}
                    className={`px-2 py-1 font-mono text-xs border-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      fileOptions[originalIndex]
                        ? 'border-terminal-neon-green bg-terminal-neon-green text-terminal-bg'
                        : mode === 'images'
                          ? 'border-terminal-border text-terminal-text hover:border-terminal-neon-green hover:text-terminal-neon-green'
                          : 'border-terminal-border text-terminal-text hover:border-terminal-neon-green hover:text-terminal-neon-green'
                    }`}
                    title={fileOptions[originalIndex] ? "Edit custom options" : "Set custom conversion options for this file"}
                  >
                    ⚙
                  </button>
                  <button
                    onClick={() => onRemove(originalIndex)}
                    disabled={disabled}
                    className="px-2 py-1 font-mono text-xs border border-terminal-border
                             text-terminal-text hover:border-terminal-neon-yellow hover:text-terminal-neon-yellow
                             transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
