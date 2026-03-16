# Quick Start Guide

## Installation

1. **Install Python 3.8+** (if not already installed)

2. **Install Dependencies**
   ```bash
   cd /Users/lge11/GithubP/picasa
   pip install -r requirements.txt
   ```

3. **Verify Installation**
   ```bash
   python test_installation.py
   ```

## Running the Application

```bash
python main.py
```

## First Steps

### 1. Add Your First Workspace
- Click the **"+ Add Workspace"** button in the left panel
- Select a folder containing photos
- The workspace will appear with a checkbox

### 2. View Your Photos
The photos will start loading automatically. You'll see:
- Progress bar at the bottom
- Status updates in the status bar
- Photos appearing as they're loaded

### 3. Explore Views

**Folder View** (Default)
- Shows photos organized by folder hierarchy
- Each folder has a colored bar
- Nested folders are indented

**Timeline View**
- All photos in a grid
- Use dropdown to sort by:
  - Creation Time (default)
  - Modified Time
  - File Size

**Map View**
- Shows photos with GPS data on a map
- Heat map shows photo density
- Click markers to see photos at that location

### 4. Manage Workspaces
- **Toggle**: Uncheck to hide photos from a workspace
- **Remove**: Right-click → "Remove Workspace"
- **Open**: Right-click → "Open in File Manager"
- **Multiple**: Add multiple workspaces and toggle them independently

## Tips

- **Refresh**: Press `Ctrl+R` or File → Refresh to rescan
- **Performance**: Thumbnails are cached, second load is much faster
- **GPS Photos**: For map view, your photos need GPS data (usually from phone cameras)
- **Large Folders**: First scan of large folders may take time, be patient!

## Keyboard Shortcuts

- `Ctrl+R` - Refresh workspaces
- `Ctrl+Q` - Quit application

## Troubleshooting

### Photos not showing?
- Check the status bar for progress
- Make sure workspace checkbox is checked
- Verify folder contains supported formats (JPG, PNG, MP4, etc.)

### Map is empty?
- Map view only shows photos with GPS data
- Most phone cameras include GPS, DSLRs usually don't
- Try with photos taken on your smartphone

### Slow loading?
- First time: Generating thumbnails takes time
- Second time: Should be much faster (cached)
- Clear cache: View → Clear Thumbnail Cache if needed

## Supported Formats

**Images:** JPG, PNG, GIF, BMP, TIFF, WEBP, HEIC, RAW (CR2, NEF, ARW, DNG)

**Videos:** MP4, MOV, AVI, MKV, WMV, FLV, WEBM, M4V, MPG, MPEG

## Configuration

Settings are automatically saved to:
- **macOS**: `~/Library/Application Support/PhotoManager/config.json`
- **Windows**: `%APPDATA%\PhotoManager\config.json`

Thumbnails cached at:
- **macOS**: `~/Library/Application Support/PhotoManager/thumbnails/`
- **Windows**: `%APPDATA%\PhotoManager\thumbnails\`

## Need Help?

Check the full documentation in:
- `20260305plan_photo_management_app.md` - Architecture details
- `20260305feature_photo_management_app.md` - Complete feature list
- `README.md` - Project overview
