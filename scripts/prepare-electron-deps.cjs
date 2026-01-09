/**
 * Prepares backend dependencies for Electron packaging.
 *
 * In an npm workspace, dependencies are hoisted to the root node_modules.
 * This script creates a standalone copy of backend dependencies that
 * can be bundled with the Electron app.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const depsDir = path.join(projectRoot, '.electron-backend-deps');
const backendDir = path.join(projectRoot, 'backend');

console.log('Preparing backend dependencies for Electron packaging...');

// Clean and create deps directory
if (fs.existsSync(depsDir)) {
  console.log('Cleaning existing deps directory...');
  fs.rmSync(depsDir, { recursive: true, force: true });
}
fs.mkdirSync(depsDir, { recursive: true });

// Read backend package.json and modify it for standalone install
const backendPkg = JSON.parse(fs.readFileSync(path.join(backendDir, 'package.json'), 'utf-8'));

// Remove the workspace self-reference if present
if (backendPkg.dependencies && backendPkg.dependencies['media-toolkit']) {
  delete backendPkg.dependencies['media-toolkit'];
}

// Write modified package.json
fs.writeFileSync(
  path.join(depsDir, 'package.json'),
  JSON.stringify(backendPkg, null, 2)
);

// Copy package-lock.json if it exists
const lockFile = path.join(backendDir, 'package-lock.json');
if (fs.existsSync(lockFile)) {
  fs.copyFileSync(lockFile, path.join(depsDir, 'package-lock.json'));
}

// Install dependencies without workspace hoisting
console.log('Installing backend dependencies (this may take a minute)...');
try {
  execSync('npm install --production --legacy-peer-deps --ignore-scripts', {
    cwd: depsDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_workspace: '' // Disable workspace
    }
  });
} catch (error) {
  console.error('Failed to install dependencies:', error.message);
  process.exit(1);
}

// Run postinstall scripts for native modules
console.log('Running postinstall scripts for native modules...');

// Sharp's postinstall downloads platform-specific binaries
try {
  const sharpDir = path.join(depsDir, 'node_modules', 'sharp');
  if (fs.existsSync(sharpDir)) {
    console.log('Running sharp postinstall...');
    execSync('npm run install', {
      cwd: sharpDir,
      stdio: 'inherit'
    });
  }
} catch (error) {
  console.log('Note: Sharp postinstall may have warnings, continuing...');
}

// ffmpeg-static's install script downloads the ffmpeg binary
try {
  const ffmpegStaticDir = path.join(depsDir, 'node_modules', 'ffmpeg-static');
  if (fs.existsSync(ffmpegStaticDir)) {
    console.log('Running ffmpeg-static install to download binary...');
    execSync('node install.js', {
      cwd: ffmpegStaticDir,
      stdio: 'inherit'
    });
  }
} catch (error) {
  console.log('Note: ffmpeg-static install may have issues:', error.message);
}

// @ffprobe-installer/ffprobe install script downloads the ffprobe binary
try {
  const ffprobeDir = path.join(depsDir, 'node_modules', '@ffprobe-installer', 'ffprobe');
  if (fs.existsSync(ffprobeDir)) {
    console.log('Running ffprobe-installer postinstall...');
    execSync('node index.js', {
      cwd: ffprobeDir,
      stdio: 'inherit'
    });
  }
} catch (error) {
  console.log('Note: ffprobe-installer postinstall may have issues:', error.message);
}

// Verify key dependencies exist
const requiredDeps = ['express', 'sharp', 'fluent-ffmpeg', 'cors', 'multer'];
const missingDeps = [];

for (const dep of requiredDeps) {
  const depPath = path.join(depsDir, 'node_modules', dep);
  if (!fs.existsSync(depPath)) {
    missingDeps.push(dep);
  }
}

if (missingDeps.length > 0) {
  console.error('ERROR: Missing required dependencies:', missingDeps.join(', '));
  process.exit(1);
}

// Verify ffmpeg binary exists
const ffmpegBinary = path.join(depsDir, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
if (fs.existsSync(ffmpegBinary)) {
  console.log('FFmpeg binary found:', ffmpegBinary);
} else {
  console.warn('WARNING: FFmpeg binary not found at', ffmpegBinary);
  console.warn('Video processing may not work in the packaged app.');
}

// Count installed packages
const nodeModulesDir = path.join(depsDir, 'node_modules');
const installedPackages = fs.readdirSync(nodeModulesDir).filter(f => {
  return !f.startsWith('.') && fs.statSync(path.join(nodeModulesDir, f)).isDirectory();
});

console.log(`\nSuccessfully prepared ${installedPackages.length} packages for Electron bundling.`);
console.log('Dependencies are ready in:', depsDir);
