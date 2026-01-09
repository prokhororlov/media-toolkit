# App Icons

Place your app icons here:

- `icon.png` - PNG icon (256x256 or larger, for Linux)
- `icon.ico` - Windows icon
- `icon.icns` - macOS icon

## Creating Icons

You can use tools like:
- [electron-icon-builder](https://github.com/nicjohnson145/electron-icon-builder)
- [icon-gen](https://github.com/nicjohnson145/electron-icon-builder)
- Online converters

### From a single PNG (256x256 or 512x512):

```bash
# Install icon generator
npm install -g electron-icon-builder

# Generate all formats from a single PNG
electron-icon-builder --input=./icon.png --output=./
```

Or manually:
1. Create a 512x512 or 1024x1024 PNG
2. Use ImageMagick to convert:
   ```bash
   # For ICO (Windows)
   convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

   # For ICNS (macOS) - use iconutil on Mac
   ```
