#!/usr/bin/env node

/**
 * Release script for Media Toolkit
 * Creates a new version tag and builds the project
 *
 * Usage:
 *   npm run release           - bump patch version (1.0.1 -> 1.0.2)
 *   npm run release minor     - bump minor version (1.0.1 -> 1.1.0)
 *   npm run release major     - bump major version (1.0.1 -> 2.0.0)
 *   npm run release 1.2.3     - set specific version
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');

function exec(command, options = {}) {
  console.log(`\n> ${command}`);
  return execSync(command, {
    cwd: rootDir,
    stdio: 'inherit',
    ...options
  });
}

function execSilent(command) {
  return execSync(command, { cwd: rootDir, encoding: 'utf8' }).trim();
}

function getCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return pkg.version;
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

function isValidVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function updatePackageVersion(newVersion) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
}

function checkGitClean() {
  try {
    const status = execSilent('git status --porcelain');
    // Allow only package.json changes from version bump
    const lines = status.split('\n').filter(line => line.trim());
    const nonPackageChanges = lines.filter(line => !line.includes('package.json'));

    if (nonPackageChanges.length > 0) {
      console.error('\n❌ Error: Working directory has uncommitted changes.');
      console.error('Please commit or stash your changes before releasing.\n');
      console.error('Changed files:');
      nonPackageChanges.forEach(line => console.error(`  ${line}`));
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error checking git status:', error.message);
    process.exit(1);
  }
}

function main() {
  console.log('🚀 Media Toolkit Release Script\n');
  console.log('================================');

  // Get version type from args
  const arg = process.argv[2] || 'patch';
  const currentVersion = getCurrentVersion();
  let newVersion;

  if (isValidVersion(arg)) {
    newVersion = arg;
  } else if (['major', 'minor', 'patch'].includes(arg)) {
    newVersion = bumpVersion(currentVersion, arg);
  } else {
    console.error(`❌ Invalid argument: ${arg}`);
    console.error('Usage: npm run release [patch|minor|major|x.y.z]');
    process.exit(1);
  }

  console.log(`📦 Current version: ${currentVersion}`);
  console.log(`📦 New version: ${newVersion}`);

  // Check for uncommitted changes (except package.json)
  console.log('\n🔍 Checking git status...');
  checkGitClean();
  console.log('✅ Git working directory is clean');

  // Update version in package.json
  console.log('\n📝 Updating package.json version...');
  updatePackageVersion(newVersion);
  console.log(`✅ Version updated to ${newVersion}`);

  // Build frontend
  console.log('\n🔨 Building frontend...');
  exec('npm run build');
  console.log('✅ Frontend built successfully');

  // Git commit and tag
  console.log('\n📌 Creating git commit and tag...');
  exec('git add package.json');
  exec(`git commit -m "chore: bump version to ${newVersion}"`);
  exec(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
  console.log(`✅ Created tag v${newVersion}`);

  // Push to remote
  console.log('\n📤 Pushing to remote...');
  exec('git push origin master --tags');
  console.log('✅ Pushed to remote');

  // Summary
  console.log('\n================================');
  console.log('✅ Release completed successfully!\n');
  console.log(`Version: ${newVersion}`);
  console.log(`Tag: v${newVersion}`);
  console.log('\nOptional next step:');
  console.log('  npm run electron:build          # Build Electron app');
  console.log('');
}

main();
