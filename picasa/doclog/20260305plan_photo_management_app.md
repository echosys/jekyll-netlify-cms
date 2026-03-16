# Photo Management App - Implementation Plan

**Date:** March 5, 2026  
**Type:** Plan  
**Summary:** Complete architecture for cross-platform photo management app

## Overview
Building a simplified Picasa clone using Python + PyQt6 for Windows and macOS with folder-based storage.

## Architecture

### Core Components

1. **Main Window (main_window.py)**
   - Left panel (15% width): Workspace tree with checkboxes
   - Right panel (85% width): Tab widget with 3 views
   - Menu bar and toolbar

2. **Workspace Manager (workspace_manager.py)**
   - Add/remove workspaces (folders)
   - Track active workspaces
   - Persist workspace list to config file

3. **Photo Scanner (photo_scanner.py)**
   - Background thread-based folder scanning
   - Support for images: JPG, PNG, GIF, BMP, TIFF, RAW formats
   - Support for videos: MP4, MOV, AVI, MKV
   - Extract EXIF data (GPS, timestamps)
   - Generate thumbnails
   - Progress reporting

4. **Views**
   - **Folder View (folder_view.py)**: Hierarchical display with folder bars and thumbnails
   - **Timeline View (timeline_view.py)**: Sorted by creation/modified time or size
   - **Map View (map_view.py)**: Heat map with GPS coordinates, clickable markers

5. **Models (models.py)**
   - Photo data model
   - Workspace data model
   - Database/cache for metadata

6. **Utilities**
   - **thumbnail_generator.py**: Fast thumbnail generation with caching
   - **exif_reader.py**: Extract EXIF/GPS data
   - **config_manager.py**: Store app settings

## Key Features

### Performance Optimizations
- QThreadPool for background operations
- Lazy loading of thumbnails
- LRU cache for thumbnails
- Incremental UI updates (display photos as they load)
- Progress bars for long operations

### UI Layout
```
+------------------------------------------+
|  Menu Bar                                |
+------------------------------------------+
| Workspaces  |  Folder | Timeline | Map   |
| (15%)       |         (85%)              |
|             |                            |
| □ Workspace1|  [Photos displayed here]   |
| ☑ Workspace2|                            |
| □ Workspace3|  [Thumbnails grid]         |
|             |                            |
|             |  Progress: Loading...      |
+------------------------------------------+
```

## Technology Stack
- **PyQt6**: UI framework
- **Pillow**: Image processing
- **piexif**: EXIF data extraction
- **rawpy**: RAW image support
- **imageio + ffmpeg**: Video thumbnail generation
- **folium**: Map visualization
- **PyQtWebEngine**: Display web-based maps

## Implementation Phases

### Phase 1: Core Structure (Today)
- Main window layout
- Workspace panel with checkboxes
- Tab widget for views
- Basic folder scanning

### Phase 2: Photo Loading
- Background thread scanning
- Thumbnail generation
- EXIF data extraction
- Progress reporting

### Phase 3: Views Implementation
- Folder view with hierarchical display
- Timeline view with sorting options
- Map view with GPS visualization

### Phase 4: Polish & Performance
- Caching system
- Video support
- UI refinements
- Cross-platform testing

## File Structure
```
picasa/
├── main.py                    # Entry point
├── requirements.txt
├── ui/
│   ├── main_window.py        # Main application window
│   ├── workspace_panel.py    # Left panel with workspaces
│   ├── folder_view.py        # Folder hierarchical view
│   ├── timeline_view.py      # Timeline sorted view
│   └── map_view.py           # GPS map view
├── core/
│   ├── workspace_manager.py  # Workspace logic
│   ├── photo_scanner.py      # Background scanning
│   ├── thumbnail_cache.py    # Thumbnail management
│   └── models.py             # Data models
├── utils/
│   ├── exif_reader.py        # EXIF extraction
│   ├── config_manager.py     # Settings persistence
│   └── file_utils.py         # File operations
└── docs/
    └── 20260305plan_photo_management_app.md
```

## Next Steps
1. Install dependencies
2. Create project structure
3. Implement main window with layout
4. Build workspace panel
5. Implement basic folder scanning
6. Add thumbnail generation
7. Create each view
8. Test and optimize
