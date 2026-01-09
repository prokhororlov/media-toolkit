/**
 * @type {import('electron-builder').Configuration}
 */
const config = {
  appId: 'com.mediatoolkit.app',
  productName: 'Media Toolkit',
  copyright: 'Copyright (c) 2024',

  directories: {
    output: 'dist-electron',
    buildResources: 'electron/icons'
  },

  files: [
    'electron/**/*',
    '!electron/icons/**/*',
    'package.json'
  ],

  extraResources: [
    {
      from: 'backend',
      to: 'backend',
      filter: [
        '**/*',
        '!node_modules/**/*'
      ]
    },
    {
      from: 'frontend/dist',
      to: 'frontend/dist'
    },
    // Backend node_modules - must be prepared by scripts/prepare-electron-deps.cjs
    {
      from: '.electron-backend-deps/node_modules',
      to: 'backend/node_modules'
    }
  ],

  // Don't use asar for backend to allow native module execution
  asar: false,

  // Windows configuration
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      }
    ],
    icon: 'electron/icons/icon.ico',
    artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
    // Disable code signing for local builds (set CSC_IDENTITY_AUTO_DISCOVERY=false)
    signAndEditExecutable: false
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Media Toolkit',
    installerIcon: 'electron/icons/icon.ico',
    uninstallerIcon: 'electron/icons/icon.ico'
  },

  // macOS configuration
  mac: {
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64']
      }
    ],
    icon: 'electron/icons/icon.icns',
    category: 'public.app-category.utilities',
    artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
    hardenedRuntime: true,
    gatekeeperAssess: false
  },

  dmg: {
    contents: [
      {
        x: 130,
        y: 220
      },
      {
        x: 410,
        y: 220,
        type: 'link',
        path: '/Applications'
      }
    ],
    window: {
      width: 540,
      height: 400
    }
  },

  // Linux configuration
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['x64']
      },
      {
        target: 'deb',
        arch: ['x64']
      }
    ],
    icon: 'electron/icons',
    category: 'Utility',
    artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
    maintainer: 'Media Toolkit Team'
  },

  appImage: {
    artifactName: '${productName}-${version}.${ext}'
  },

  deb: {
    depends: [],
    artifactName: '${productName}-${version}.${ext}'
  },

  // Publish to GitHub Releases
  publish: {
    provider: 'github',
    releaseType: 'release'
  }
}

module.exports = config
