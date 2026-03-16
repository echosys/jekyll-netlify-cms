# Photo Manager

A lightweight, cross-platform photo management application for Windows and macOS.

## Features

- **Workspace Management**: Add multiple folders as workspaces, toggle them on/off
- **Multiple Views**:
  - **Folder View**: Hierarchical display organized by folder structure
  - **Timeline View**: Sort photos by creation time, modification time, or size
  - **Map View**: Display photos with GPS data on an interactive map with heatmap
- **Background Loading**: Non-blocking UI with progress indicators
- **Format Support**: Images (JPG, PNG, GIF, BMP, TIFF, RAW formats) and videos (MP4, MOV, AVI, MKV)
- **EXIF Support**: Extract GPS coordinates, timestamps, and camera information
- **Thumbnail Caching**: Fast thumbnail generation with persistent cache

## Requirements

- Python 3.8+
- PyQt6
- See `requirements.txt` for full dependencies

## Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Run the application
python main.py
```

## Usage

1. **Add a workspace**: Click "+ Add Workspace" button and select a folder
2. **Toggle workspaces**: Check/uncheck workspaces in the left panel to activate/deactivate them
3. **Switch views**: Use the tabs (Folders, Timeline, Map) to switch between different photo views
4. **View photos**: Photos load in the background and appear incrementally

## Architecture

- **PyQt6**: Native UI framework for cross-platform support
- **Background threading**: QThreadPool for non-blocking photo scanning
- **Thumbnail caching**: Persistent cache for fast loading
- **EXIF extraction**: Read metadata from images including GPS coordinates

## Project Structure

```
picasa/
├── main.py                    # Entry point
├── requirements.txt
├── ui/                        # UI components
│   ├── main_window.py
│   ├── workspace_panel.py
│   ├── folder_view.py
│   ├── timeline_view.py
│   └── map_view.py
├── core/                      # Core logic
│   ├── models.py
│   ├── workspace_manager.py
│   ├── photo_scanner.py
│   └── thumbnail_cache.py
└── utils/                     # Utilities
    ├── config_manager.py
    ├── exif_reader.py
    └── file_utils.py
```

## License

MIT License
