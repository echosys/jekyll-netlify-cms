# Photo Manager (PyQt6) – Feature Reference
> Detailed technical specification of the original Python/PyQt6 application. Sufficient to recreate the app from scratch.

---

## Technical Stack
| Layer | Choice | Implementation Details |
|---|---|---|
| **Language** | Python 3.11+ | Uses `dataclasses`, `pathlib`, `typing`. |
| **UI Framework** | PyQt6 | Native performance, signals/slots for async state updates. |
| **Web Engine** | QWebEngineView | Used for Leaflet maps; requires `AA_ShareOpenGLContexts` and specific profile settings. |
| **Concurrency** | QThreadPool | Background tasks via `QRunnable` (Scanners, Geocoders, Thumbnailers). |
| **Image Engine** | Pillow (PIL) | Used for decoding, resizing, and coordinate parsing. |
| **Metadata** | piexif | Used for structured EXIF reading/writing (DateTime, Camera, UserComment). |
| **Geocoding** | Nominatim (OSM) | Reverse geocoding via `requests`. Rate-limited at 1 req/sec. |

---

## Architecture & Project Structure
```
picasa/
├── main.py                   # App entry; Configures WebEngine profiles & global settings
├── core/
│   ├── models.py             # Data models: Photo, Workspace (dataclasses)
│   ├── photo_scanner.py      # Background scanner (rglob based, cache-aware)
│   ├── scanner_cache.db      # SQLite persistent storage for photo metadata
│   ├── thumbnail_cache.py    # Async generator; stores JPEGs in cache/
│   ├── location_scanner.py   # Background worker for Nominatim geocoding
│   └── workspace_manager.py  # Logic to manage/persist workspace paths
├── ui/
│   ├── main_window.py        # Shell; QSplitter (Sidebar | Tabs), Status Bar, Menu Bar
│   ├── workspace_panel.py    # Left Sidebar; QTreeWidget with checkboxes & context menus
│   ├── folder_view.py        # Tab 1; Hierarchical collapsible folder view
│   ├── timeline_view.py      # Tab 2; Grouped by Time/Size/Location with Jump Index
│   ├── map_view.py           # Tab 3; QWebEngineView for interactive Leaflet maps
│   └── photo_preview.py      # Modal dialog with ZoomableView & Location Editor
└── utils/
    ├── config_manager.py     # JSON settings persistence (per-machine config)
    ├── exif_reader.py        # Logic for parsing GPS/DateTime & UserComment JSON
    ├── file_utils.py         # Media extension filters and file system helpers
    └── geocoder.py           # GeocoderCache with atomic disk persistence
```

---

## Global Initialization (`main.py`)
- **OpenGL**: Sets `AA_ShareOpenGLContexts` before `QApplication` instantiation.
- **Signals**: Restores `SIGINT` behavior (`signal.SIG_DFL`) for Ctrl+C support.
- **Web Security**: Modifies the `defaultProfile()` settings:
    - `LocalContentCanAccessRemoteUrls = True` (Required for CDN Leaflet assets).
    - `LocalContentCanAccessFileUrls = True`
    - `JavascriptEnabled = True`

---

## Data Models (`core/models.py`)

### `Photo`
- **Identity**: `path` (Path), `filename` (str).
- **Filesystem**: `size` (int), `created_time` (datetime), `modified_time` (datetime).
- **EXIF**: `exif_datetime`, `width`, `height`, `camera_make`, `camera_model`.
- **GPS**: `gps_latitude`, `gps_longitude`.
- **Location (Geocoded)**: `location_city`, `location_county`, `location_state`, `location_country`, `location_display`.
- **Type**: `is_video` (bool), `file_type` (str).

---

## Scanning Logic (`core/photo_scanner.py`)
- **Discovery**: Uses `workspace_path.rglob("*")`.
- **Exclusions**: Skips directories ending in `.app` (macOS bundles) and non-media files.
- **Cache Validation**: Performs O(1) checks against `ScannerCache` by comparing `size` and `mtime` (with 0.1s tolerance).
- **Concurrency**: Scans run in a separate `QRunnable`. Multiple workspaces scan concurrently.
- **Incremental UI**: Emits `photo_found` signal; `MainWindow` updates UI every **25 photos** to maintain responsiveness.

---

## Metadata & EXIF (`utils/exif_reader.py`)
- **Reading**:
    - Uses PIL `get_ifd(0x8825)` for GPS coordinates.
    - Uses `piexif` for `DateTimeOriginal` and Camera metadata.
    - **Persistence**: Reads a JSON blob from the EXIF `UserComment` field (Tag `0x9286`) to restore city/state data saved in previous sessions.
- **Writing (`ExifWriter`)**:
    - Writes `GPSLatitude/Ref` and `GPSLongitude/Ref` to the GPS IFD.
    - Preserves existing GPS tags (Altitude, Bearing, etc.) during writes.
    - Stores Location Metadata as a JSON string in `UserComment`, prefixed with `ASCII\x00\x00\x00`.
    - **Constraint**: Only supports `.jpg` and `.jpeg`.

---

## UI: Sidebar (`ui/workspace_panel.py`)
- **Width**: Hardcoded to ~210px in `MainWindow` splitter.
- **Checkboxes**: Uses `QTreeWidget` with `ItemIsUserCheckable`.
- **Visibility**: Checking/Unchecking a workspace adds/removes its content from the views **instantly** without a full rescan.
- **Context Menu**:
    - *Remove Workspace*: Deletes from config and view.
    - *Open in File Manager*: Launches `Finder` (macOS), `Explorer` (Windows), or `xdg-open` (Linux).

---

## UI: Timeline View (`ui/timeline_view.py`)
### Grouping Logic
1. **Time**: `YYYY  ·  Month` (e.g., `2026  ·  March`).
2. **Size**: Predefined buckets (`≥ 10 GB`, `1 GB – 10 GB`, `100 MB – 1 GB`, etc.).
3. **Location**:
    - **Rules**: Splits group when `state` changes AND count ≥ 30, OR if time span > 180 days.
    - **Headers**: Shows top-3 cities + state (e.g., `Chander  ·  Tempe  ·  Arizona`).

### Jump Index (Right Sidebar, 110px)
- Displays compact labels for every group section.
- Highlights the active label based on current scroll position.
- Smoothly scrolls the view when clicked.

---

## UI: Map View (`ui/map_view.py`)
- **Implementation**: Injects Folium (Python) generated HTML into a `QWebEngineView`.
- **Features**:
    - **Cluster Markers**: Automatically groups nearby photos.
    - **Heatmap**: Visualizes photo density.
    - **Proxy Support**: Propagates `map_proxy` settings to the WebEngine application proxy.

---

## UI: Photo Preview (`ui/photo_preview.py`)
- **ZoomableView**: A custom QWidget using `QPainter` for high-performance pan and zoom (0.1x to 10.0x).
- **Deferred Loading**: Uses a `QTimer` to show the dialog shell instantly while high-res images decode in the background.
- **Location Editor**:
    - Shows raw coordinates and geocoded address.
    - **Forward Geocoding**: Search for an address → Update GPS → Save back to file.
    - **Navigation**: Arrow keys navigate through the same sorted list shown in the parent view (Folder/Timeline).

---

## Persistence (`config/`)
- **config.json**: JSON dictionary of workspaces, settings, and base64-encoded `window_geometry`.
- **geocode_cache.json**: Dictionary mapping `"{lat},{lon}"` (rounded to 3 decimals) to location JSON objects.
- **scanner_cache.db**: SQLite database with a `photos` table indexed by file path.

---
