/**
 * Helper script to run Electron in development mode.
 *
 * The issue: The `electron` npm package (devDependency) shadows Electron's
 * built-in module when running `npx electron .` directly.
 *
 * Solution: Temporarily rename the node_modules/electron folder so that
 * require('electron') is handled by Electron's internal module loader.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const electronModulePath = path.join(projectRoot, 'node_modules', 'electron');
const backupPath = path.join(projectRoot, 'node_modules', '.electron-backup');

let backupCreated = false;

// Restore function - can be called multiple times safely
function restore() {
  if (fs.existsSync(backupPath)) {
    console.log('Restoring electron folder...');
    try {
      if (fs.existsSync(electronModulePath)) {
        fs.rmSync(electronModulePath, { recursive: true, force: true });
      }
      fs.renameSync(backupPath, electronModulePath);
      console.log('Restored.');
      backupCreated = false;
    } catch (err) {
      console.error('Failed to restore:', err.message);
      console.error('Manually rename node_modules/.electron-backup to node_modules/electron');
    }
  }
}

async function main() {
  console.log('Preparing to run Electron in development mode...');

  // Check if electron module exists
  if (!fs.existsSync(electronModulePath)) {
    // Check if backup exists from previous failed run
    if (fs.existsSync(backupPath)) {
      console.log('Restoring from previous failed run...');
      restore();
    } else {
      console.error('Error: electron npm package not found at', electronModulePath);
      console.error('Run "npm install" first.');
      process.exit(1);
    }
  }

  // Get electron path before renaming
  const pathTxt = fs.readFileSync(path.join(electronModulePath, 'path.txt'), 'utf-8').trim();
  const electronPath = path.join(electronModulePath, 'dist', pathTxt);

  // Verify electron executable exists
  if (!fs.existsSync(electronPath)) {
    console.error('Error: Electron executable not found at', electronPath);
    console.error('Run "npm install" to download Electron.');
    process.exit(1);
  }

  // Backup electron folder
  console.log('Temporarily hiding electron npm package...');
  try {
    // Clean up any existing backup
    if (fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { recursive: true, force: true });
    }
    fs.renameSync(electronModulePath, backupPath);
    backupCreated = true;
  } catch (err) {
    console.error('Failed to backup electron folder:', err.message);
    process.exit(1);
  }

  // Update electron path to use backup location
  const actualElectronPath = path.join(backupPath, 'dist', pathTxt);
  console.log('Starting Electron from:', actualElectronPath);

  // Spawn electron with the project directory
  const electronProcess = spawn(actualElectronPath, ['.'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_DEV_MODE: 'true'
    }
  });

  // Handle signals
  process.on('SIGINT', () => {
    console.log('\\nReceived SIGINT...');
    electronProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('\\nReceived SIGTERM...');
    electronProcess.kill('SIGTERM');
  });

  electronProcess.on('exit', (code) => {
    restore();
    process.exit(code || 0);
  });

  electronProcess.on('error', (err) => {
    console.error('Failed to start Electron:', err.message);
    restore();
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Error:', err);
  restore();
  process.exit(1);
});
