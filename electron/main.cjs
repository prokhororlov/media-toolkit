// Electron main process
// Handle the electron npm package shadowing issue by checking if require returns Electron APIs

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Setup logging for packaged app debugging
const logFile = path.join(process.env.TEMP || '/tmp', 'media-toolkit-electron.log');
function log(...args) {
  const message = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  console.log(...args);
  try {
    fs.appendFileSync(logFile, message);
  } catch (e) {
    // Ignore logging errors
  }
}

log('=== Electron Main Process Starting ===');
log('Log file:', logFile);

// Try to get the Electron module
let app, BrowserWindow, shell, ipcMain;

// First check if process.type indicates we're in the main process
// and if process.versions.electron exists
if (!process.versions.electron) {
  log('This script must be run with Electron, not Node.js');
  log('Usage: npx electron .');
  process.exit(1);
}

try {
  // Attempt to require electron
  const electronModule = require('electron');

  // Check if we got the real Electron module or just a path string
  if (typeof electronModule === 'string' || typeof electronModule === 'function') {
    // We got the npm package, not Electron APIs
    // This can happen when node_modules/electron shadows the built-in

    // Try using process._linkedBinding which is Electron's internal way
    // to access native modules
    throw new Error('Got npm electron package instead of Electron APIs');
  }

  // Check for app property to verify we have the real module
  if (!electronModule.app) {
    throw new Error('Electron module missing app property');
  }

  ({ app, BrowserWindow, shell, ipcMain } = electronModule);

} catch (err) {
  log('Failed to load Electron module:', err.message);
  log('');
  log('This is likely because the electron npm package is shadowing');
  log('the built-in Electron module.');
  log('');
  log('Solutions:');
  log('1. Build the packaged app: npm run electron:build');
  log('2. Or temporarily rename/move node_modules/electron directory');
  log('');
  process.exit(1);
}

let mainWindow = null;
let backendProcess = null;

function getIsDev() {
  return !app.isPackaged;
}

function getResourcesPath() {
  if (getIsDev()) {
    return path.join(__dirname, '..');
  }
  return process.resourcesPath;
}

function getBackendPath() {
  return path.join(getResourcesPath(), 'backend', 'app', 'index.js');
}

function getBackendCwd() {
  return path.join(getResourcesPath(), 'backend');
}

function getUploadsDir() {
  // In packaged app, use a writable location in user's app data
  if (!getIsDev()) {
    const uploadsDir = path.join(app.getPath('userData'), 'uploads');
    // Ensure the directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    return uploadsDir;
  }
  // In dev mode, use the backend/uploads directory
  return path.join(getResourcesPath(), 'backend', 'uploads');
}

function clearUploadsDir() {
  const uploadsDir = getUploadsDir();
  log('Clearing uploads directory:', uploadsDir);

  try {
    if (!fs.existsSync(uploadsDir)) {
      log('Uploads directory does not exist, nothing to clear');
      return;
    }

    const files = fs.readdirSync(uploadsDir);
    let cleared = 0;

    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (!stats.isDirectory()) {
          fs.unlinkSync(filePath);
          cleared++;
        }
      } catch (err) {
        log('Error deleting file:', file, err.message);
      }
    }

    log(`Cleared ${cleared} files from uploads directory`);
  } catch (err) {
    log('Error clearing uploads directory:', err.message);
  }
}

function getFfmpegPath() {
  const resourcesPath = getResourcesPath();
  const platform = process.platform;

  if (getIsDev()) {
    try {
      return require('ffmpeg-static');
    } catch (e) {
      log('ffmpeg-static not found in dev, using system ffmpeg');
      return null;
    }
  }

  let ffmpegBinary = 'ffmpeg';
  if (platform === 'win32') {
    ffmpegBinary = 'ffmpeg.exe';
  }

  return path.join(
    resourcesPath,
    'backend',
    'node_modules',
    'ffmpeg-static',
    ffmpegBinary
  );
}

function getFfprobePath() {
  const resourcesPath = getResourcesPath();
  const platform = process.platform;

  if (getIsDev()) {
    try {
      return require('@ffprobe-installer/ffprobe').path;
    } catch (e) {
      log('ffprobe not found in dev, using system ffprobe');
      return null;
    }
  }

  let ffprobeBinary = 'ffprobe';
  if (platform === 'win32') {
    ffprobeBinary = 'ffprobe.exe';
  }

  return path.join(
    resourcesPath,
    'backend',
    'node_modules',
    '@ffprobe-installer',
    platform,
    ffprobeBinary
  );
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = getBackendPath();
    const backendCwd = getBackendCwd();
    const ffmpegPath = getFfmpegPath();
    const ffprobePath = getFfprobePath();
    const uploadsDir = getUploadsDir();

    const env = {
      ...process.env,
      PORT: '3210',
      NODE_ENV: 'production',
      DISABLE_LIMITS: 'true',
      DISABLE_IMAGEMAGICK: 'true',
      FFMPEG_PATH: ffmpegPath || '',
      FFPROBE_PATH: ffprobePath || '',
      ELECTRON_APP: 'true',
      RESOURCES_PATH: getResourcesPath(),
      UPLOADS_DIR: uploadsDir
    };

    log('Starting backend from:', backendPath);
    log('Backend CWD:', backendCwd);
    log('FFmpeg path:', ffmpegPath);
    log('FFprobe path:', ffprobePath);
    log('Resources path:', getResourcesPath());
    log('Uploads dir:', uploadsDir);

    const nodeExecutable = process.execPath;
    const args = getIsDev()
      ? [backendPath]
      : ['--no-warnings', backendPath];

    if (!getIsDev()) {
      env.ELECTRON_RUN_AS_NODE = '1';
    }

    log('Node executable:', nodeExecutable);
    log('Args:', args);

    backendProcess = spawn(nodeExecutable, args, {
      env,
      cwd: backendCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    let resolved = false;

    backendProcess.stdout.on('data', (data) => {
      const message = data.toString();
      log('Backend:', message);
      if (message.includes('Server running') && !resolved) {
        resolved = true;
        resolve();
      }
    });

    backendProcess.stderr.on('data', (data) => {
      log('Backend error:', data.toString());
    });

    backendProcess.on('error', (error) => {
      log('Failed to start backend:', error);
      if (!resolved) {
        resolved = true;
        reject(error);
      }
    });

    backendProcess.on('exit', (code) => {
      log('Backend exited with code:', code);
      backendProcess = null;
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        log('Backend startup timeout, proceeding anyway...');
        resolve();
      }
    }, 15000);
  });
}

function stopBackend() {
  if (backendProcess) {
    log('Stopping backend...');
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
    } else {
      backendProcess.kill('SIGTERM');
    }
    backendProcess = null;
  }
}

function getIconPath() {
  if (getIsDev()) {
    return path.join(__dirname, 'icons', 'icon.png');
  }
  // In production, use the icon from buildResources
  if (process.platform === 'win32') {
    return path.join(process.resourcesPath, 'icon.ico');
  } else if (process.platform === 'darwin') {
    return path.join(process.resourcesPath, 'icon.icns');
  }
  return path.join(process.resourcesPath, 'icon.png');
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: preloadPath
    },
    icon: getIconPath(),
    show: false,
    titleBarStyle: 'default',
    autoHideMenuBar: true
  });

  const loadUrl = 'http://localhost:3210';

  const loadWithRetry = async (attempts = 5) => {
    for (let i = 0; i < attempts; i++) {
      try {
        log(`Loading URL attempt ${i + 1}/${attempts}`);
        await mainWindow.loadURL(loadUrl);
        log('URL loaded successfully');
        return;
      } catch (err) {
        log(`Failed to load URL (attempt ${i + 1}):`, err.message);
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    log('All load attempts failed');
  };

  loadWithRetry();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (getIsDev()) {
    mainWindow.webContents.openDevTools();
  }
}

function setupIpcHandlers() {
  ipcMain.handle('get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('get-backend-status', () => {
    return {
      running: backendProcess !== null,
      pid: backendProcess ? backendProcess.pid : null
    };
  });

  ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });
}

app.whenReady().then(async () => {
  log('Electron app ready, isDev:', getIsDev());
  log('App path:', app.getAppPath());
  log('Resources path:', process.resourcesPath);

  setupIpcHandlers();

  try {
    await startBackend();
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    log('Failed to start backend:', error);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Clear uploads directory before quitting (DISABLE_LIMITS is always true in Electron)
  clearUploadsDir();
  stopBackend();
});

process.on('uncaughtException', (error) => {
  log('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  log('Unhandled rejection at:', promise, 'reason:', reason);
});
