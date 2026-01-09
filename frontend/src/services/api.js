const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3210/api').replace(/\/+$/, '')

// Cache for config to avoid repeated API calls
let cachedConfig = null

/**
 * Get application config from server
 * @returns {Promise<{disableLimits: boolean, isElectronApp: boolean}>}
 */
export async function getConfig() {
  if (cachedConfig) {
    return cachedConfig
  }

  try {
    const response = await fetch(`${API_BASE_URL}/config`)
    if (!response.ok) {
      throw new Error('Failed to fetch config')
    }
    cachedConfig = await response.json()
    return cachedConfig
  } catch (error) {
    console.error('Failed to fetch config:', error)
    // Return defaults if config fetch fails
    return { disableLimits: false, isElectronApp: false }
  }
}

/**
 * Process images on the server
 * @param {File[]} files - Array of image files
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing results
 */
export async function processImages(files, options) {
  const formData = new FormData()

  files.forEach(file => {
    formData.append('files', file)
  })

  formData.append('options', JSON.stringify(options))

  const response = await fetch(`${API_BASE_URL}/process/images`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Image processing failed')
  }

  return response.json()
}

/**
 * Process video on the server
 * @param {File} file - Video file
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result
 */
export async function processVideo(file, options) {
  const formData = new FormData()

  formData.append('file', file)
  formData.append('options', JSON.stringify(options))

  const response = await fetch(`${API_BASE_URL}/process/video`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Video processing failed')
  }

  return response.json()
}

/**
 * Get download URL for processed file
 * @param {string} filename - Filename to download
 * @returns {string} Download URL
 */
export function getDownloadUrl(filename) {
  return `${API_BASE_URL}/process/download/${encodeURIComponent(filename)}`
}

/**
 * Download archive of processed files
 * @param {string[]} filenames - Array of filenames to archive
 * @returns {Promise<Blob>} Archive blob
 */
export async function downloadArchive(filenames) {
  const response = await fetch(`${API_BASE_URL}/process/archive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ files: filenames })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Archive creation failed')
  }

  return response.blob()
}
