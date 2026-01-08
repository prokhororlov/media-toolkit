# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Media Toolkit is a server-side media processing system with a drag-and-drop web interface for batch image and video optimization. All processing runs 100% locally using Node.js with Sharp (images) and FFmpeg (videos). This is a monorepo workspace with separate frontend and backend packages.

## Common Commands

### Installation
```bash
npm run install:all    # Install all dependencies (root, backend, frontend)
npm run setup          # install:all + build frontend
```

### Development
```bash
npm run dev            # Build frontend and start backend (production mode)
npm run dev:frontend   # Start Vite dev server at http://localhost:5173
npm run dev:backend    # Start backend at http://localhost:3001
```

When developing, run `dev:frontend` and `dev:backend` in separate terminals for hot module reloading.

### Production
```bash
npm run build          # Build frontend (outputs to frontend/dist)
npm start              # Start production server (serves built frontend)
```

### Package Commands
```bash
# Backend (from backend/ directory)
npm run dev            # Start backend server
npm start              # Start backend server

# Frontend (from frontend/ directory)
npm run dev            # Start Vite dev server
npm run build          # Build for production
npm run preview        # Preview production build
```

## Architecture

### Monorepo Structure
- **Root**: NPM workspace configuration, orchestrates frontend/backend
- **backend/**: Express server, file uploads, media processing services
- **frontend/**: React + Vite SPA, serves as UI for media processing

### Backend Architecture

**Entry Point**: `backend/app/index.js`
- Express server setup with security middleware
- Rate limiting: 10 processing/min, 30 downloads/min per IP
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- CORS configuration (restrictive in production)
- Serves static frontend from `frontend/dist` (production)
- Handles SPA routing (all routes → index.html)
- API routes mounted at `/api/process`
- Health check endpoint at `/api/health`
- Automatic file cleanup scheduler (10-minute expiry)

**Routes**: `backend/app/routes/process.js`
- `POST /api/process/images` - Batch image processing (up to 50 files)
- `POST /api/process/video` - Single video processing
- `GET /api/process/download/:filename` - Download processed file
- `POST /api/process/archive` - Create ZIP of multiple processed files
- Uses Multer for file uploads (500MB limit per file)
- Files stored temporarily in `backend/uploads/`

**Services Directory**: `backend/app/services/`

Processing services follow a common pattern:
1. Accept uploaded file(s) and processing options
2. Process using Sharp/FFmpeg/SVGO
3. Save output to `backend/uploads/` with descriptive filenames
4. Return metadata (filename, original size, processed size, savings)

**Image Processing** (`imageProcessor.js`):
- Delegates to specialized processors based on file type
- Raster images (PNG, JPG, etc.) → Sharp processor
- SVG files → SVGO processor (can also convert SVG to raster formats)
- TIFF/PSD/EPS → Optional ImageMagick processor (if available)
- Supports multiple output formats per input (WebP, AVIF, JPG, PNG)
- Handles quality, resize (percentage or absolute dimensions), format conversion
- Supports crop mode ('none' or 'cover') for absolute resizing

**Video Processing** (`videoProcessor.js`):
- Uses fluent-ffmpeg wrapper around FFmpeg CLI
- Output formats: MP4, WebM, MOV, MKV, GIF
- Resize: percentage or absolute dimensions with optional crop
- Preset system: 'web' (medium), 'quality' (slow), 'fast' (veryfast)
- Uses CRF for quality control (derived from bitrate setting)
- Optional audio track removal (GIF always has no audio)
- Returns single processed video file

**SVG Processing** (`svgProcessor.js`):
- Uses SVGO for optimization
- Configurable precision, viewBox handling, ID cleanup

**Archive Service** (`archiver.js`):
- Creates ZIP archives of processed files using archiver library
- Used for bulk downloads

**Utilities** (`utils/`):
- `fileCleanup.js` - Automatic cleanup of expired files (10-minute expiry, runs every minute)
- `security.js` - File validation (MIME types, magic bytes), filename sanitization, path traversal prevention, options validation

### Frontend Architecture

**Entry Point**: `frontend/src/main.jsx` → `App.jsx`

**App.jsx** (Main State Container):
- Manages global state: mode selection, files, processing status, results
- Mode state: 'images' or 'video' determines UI and processing flow
- Processing options stored per mode (images, svg, video)
- Supports per-file option overrides via `fileOptions` state
- Orchestrates file processing workflow

**Components**:
- `Header.jsx` - App branding
- `FileDropZone.jsx` - Drag-and-drop file upload UI with file type detection
- `ProcessingOptions.jsx` - Global options (quality, resize, formats) with separate raster/SVG sections
- `FormatSelector.jsx` - Smart format selection based on input file types
- `FileConversionOptions.jsx` - Per-file option overrides (modal)
- `ProcessingQueue.jsx` - Real-time progress display during processing
- `Results.jsx` - Displays processed files with download options
- `Toast.jsx` - Notification component for user feedback

**API Service** (`services/api.js`):
- All backend communication functions
- `processImages()` - POST multipart/form-data to `/api/process/images`
- `processVideo()` - POST multipart/form-data to `/api/process/video`
- `getDownloadUrl()` - Constructs download URL for processed file
- `downloadArchive()` - Creates ZIP of selected files
- API base URL configurable via `VITE_API_URL` env var

### File Processing Flow

1. User drops files into `FileDropZone` → stored in App state
2. User configures global options in `ProcessingOptions`
3. (Optional) User sets per-file overrides via `FileConversionOptions` modal
4. User clicks "Process Files"
5. App determines file types (image vs video) and groups accordingly
6. Files sent to appropriate API endpoint with merged options
7. Backend processes files using Sharp/FFmpeg
8. Results returned to frontend, displayed in `Results` component
9. User downloads individual files or ZIP archive

### Environment Configuration

**Backend** (`.env`):
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `ALLOWED_ORIGINS` - Comma-separated CORS origins (production only, empty = same-origin only)
- `DISABLE_IMAGEMAGICK` - Set to 'true' to disable ImageMagick processor

**Frontend** (`.env`):
- `VITE_API_URL` - Backend API base URL (default: http://localhost:3001/api)

In production mode, frontend is served from backend, so API calls use relative paths.

## Key Technical Details

### Image Format Support
- **Input**: PNG, JPG, WebP, AVIF, GIF, BMP, TIFF, SVG
- **Output**: PNG, JPG, WebP, AVIF, SVG (optimized)
- Multi-format output: Single input can generate multiple output formats

### Video Format Support
- **Input**: MP4, WebM, MOV, MKV, AVI, FLV, WMV, M4V
- **Output**: MP4 (H.264), WebM (VP9), MOV (H.264), MKV (H.264), GIF
- FFmpeg must be installed on system PATH

### File Upload Handling
- Multer diskStorage strategy
- Unique filenames: `{fieldname}-{timestamp}-{random}.{ext}`
- Files saved to `backend/uploads/`
- 500MB per-file limit (configurable in `routes/process.js`)
- Batch limit: 50 images per request

### File Cleanup
- Automatic cleanup scheduler runs every minute
- Files older than 10 minutes are automatically deleted
- ZIP archives are deleted immediately after download completes
- Original uploaded files are deleted after processing

## External Dependencies

**Required**:
- Node.js >= 18.0.0
- FFmpeg (system install) - Required for video processing

**Optional**:
- ImageMagick (system install) - For advanced image format support (GIF, etc.)
  - Can be disabled via `DISABLE_IMAGEMAGICK=true` in backend `.env`

### Security Features
- Rate limiting on all endpoints (express-rate-limit)
- File type validation using magic bytes (file-type library)
- Filename sanitization to prevent path traversal
- SVG content scanning for XSS vectors (script tags, event handlers)
- Security headers in production (CSP, HSTS, X-Frame-Options, etc.)
- CORS restrictions in production mode

## Production Deployment Notes

1. Build frontend first: `npm run build`
2. Backend serves frontend from `frontend/dist/`
3. Set `NODE_ENV=production` in backend environment
4. Configure `ALLOWED_ORIGINS` if cross-origin requests needed
5. Ensure FFmpeg is installed on production system
6. Configure `PORT` for backend if needed (default: 3001)
7. Use HTTPS (required for HSTS)
8. Consider reverse proxy (nginx) for additional security
