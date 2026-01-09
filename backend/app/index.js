import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import rateLimit from 'express-rate-limit'
import processRouter from './routes/process.js'
import { startCleanupScheduler, clearAllUploads } from './utils/fileCleanup.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3210
const isProduction = process.env.NODE_ENV === 'production'
const disableLimits = process.env.DISABLE_LIMITS === 'true'
const isElectronApp = process.env.ELECTRON_APP === 'true'
const resourcesPath = process.env.RESOURCES_PATH || ''

// Trust proxy in production (required for rate limiting behind reverse proxy)
if (isProduction) {
  app.set('trust proxy', 1)
}

// CORS configuration - restrictive for production
const corsOptions = {
  origin: isProduction
    ? (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
    : true, // Allow all origins in development
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
}

// If no origins configured in production, allow same-origin only
if (isProduction && corsOptions.origin.length === 0) {
  corsOptions.origin = false // Disallow CORS entirely, only same-origin requests
}

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff')

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY')

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block')

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Content Security Policy for production
  if (isProduction) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';"
    )
  }

  // Strict Transport Security (only in production with HTTPS)
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  next()
}

// Skip middleware helper (passes through when limits are disabled)
const skipIfLimitsDisabled = (req, res, next) => next()

// Rate limiter for processing endpoints (images, video, archive)
// 10 requests per minute per IP
const processingLimiter = disableLimits ? skipIfLimitsDisabled : rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the rate limit of 10 processing requests per minute. Please wait before trying again.',
    retryAfter: 60
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message)
  }
})

// Rate limiter for download endpoints
// 30 requests per minute per IP
const downloadLimiter = disableLimits ? skipIfLimitsDisabled : rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the rate limit of 30 download requests per minute. Please wait before trying again.',
    retryAfter: 60
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message)
  }
})

// Rate limiter for health check endpoint
// 100 requests per minute per IP
const healthLimiter = disableLimits ? skipIfLimitsDisabled : rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the rate limit of 100 health check requests per minute. Please wait before trying again.',
    retryAfter: 60
  },
  handler: (req, res, next, options) => {
    res.status(429).json(options.message)
  }
})

// Apply security headers to all requests
app.use(securityHeaders)

// CORS middleware with configuration
app.use(cors(corsOptions))

// Body parsing middleware with size limits
app.use(express.json({ limit: '10kb' })) // Limit JSON body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// Disable powered-by header (security through obscurity, but still recommended)
app.disable('x-powered-by')

// Serve static files from frontend dist
// In Electron packaged app, frontend is in resources path
const frontendPath = isElectronApp && resourcesPath
  ? path.join(resourcesPath, 'frontend', 'dist')
  : path.join(__dirname, '../../frontend/dist')
app.use(express.static(frontendPath, {
  // Security options for static files
  dotfiles: 'deny',
  index: 'index.html'
}))

// API Routes with rate limiting
// Apply processing limiter to POST endpoints (images, video, archive)
app.use('/api/process/images', processingLimiter)
app.use('/api/process/video', processingLimiter)
app.use('/api/process/archive', processingLimiter)

// Apply download limiter to download endpoint
app.use('/api/process/download', downloadLimiter)

// Mount the process router
app.use('/api/process', processRouter)

// Health check with rate limiting
app.get('/api/health', healthLimiter, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Config endpoint - expose settings to frontend
app.get('/api/config', (req, res) => {
  res.json({
    disableLimits,
    isElectronApp
  })
})

// Serve frontend for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'))
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: isProduction ? 'An unexpected error occurred' : err.message
  })
})

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Environment: ${isProduction ? 'production' : 'development'}`)
  console.log(`Limits: ${disableLimits ? 'DISABLED' : 'enabled'}`)
  console.log(`Frontend served from: ${frontendPath}`)

  // Clear all uploads on startup when limits are disabled (Electron mode)
  if (disableLimits) {
    console.log('[Startup] Clearing uploads directory (DISABLE_LIMITS=true)')
    await clearAllUploads()
  }

  // Start file cleanup scheduler
  startCleanupScheduler()
})

export default app
