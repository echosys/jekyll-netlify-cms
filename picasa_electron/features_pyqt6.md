# Photo Manager – Feature Reference
> Living document. Updated with every feature change. Sufficient to recreate the app from scratch.

---

## Stack
| Layer | Choice | Reason |
|---|---|---|
| Language | Python 3.11+ | Cross-platform, rich ecosystem |
| UI | PyQt6 | Native performance, Qt6 signals/slots, no Electron overhead |
| Image decode | Pillow (PIL) | Read/resize/EXIF for all common image formats |
| EXIF | piexif | piexif is used for EXIF write/read of DateTime/0th/Exif tags and for in-place JPEG writes |
| Video thumbnails | imageio | First-frame extraction (used only for cache generation) |
| Video playback | OS system player | Zero codec work; `open`/`start`/`xdg-open` |
| Reverse geocoding | requests + Nominatim (OSM) | Free, no API key, rate-limited (see GeocoderCache._RATE_LIMIT_S) |

---

## Architecture

```
picasa/
├── main.py                   Entry point
├── core/
│   ├── models.py             Photo, Workspace dataclasses (+ location_city/state/country/county fields)
│   ├── photo_scanner.py      Background QRunnable scanner (per-workspace)
│   ├── thumbnail_cache.py    Async thumbnail generation + disk cache
│   ├── location_scanner.py   Background QRunnable geocoder (LocationScannerWorker)
│   └── workspace_manager.py  Add/remove/toggle/persist workspaces
├── ui/
│   ├── main_window.py        Main window, per-workspace photo store, geocoder wiring
│   ├── workspace_panel.py    Left panel – workspace checkboxes
│   ├── folder_view.py        Folder tab – collapsible workspace/folder sections
│   ├── timeline_view.py      Timeline tab – grouped by year/month, size, or location
│   ├── map_view.py           Map tab – GPS heatmap
│   └── photo_preview.py      Click-to-preview dialog (images + videos)
└── utils/
    ├── config_manager.py     JSON config + thumbnail dir (repo-local, per machine)
    ├── exif_reader.py        GPS, datetime, camera from EXIF (reads/writes UserComment JSON via piexif)
    ├── geocoder.py           GeocoderCache – Nominatim reverse geocode + disk cache
    └── file_utils.py         Supported extensions, type helpers
```

---

## Config & Cache paths
Stored **inside the repo**, namespaced by machine hostname — never committed (in `.gitignore`):
```
config/<hostname>/config.json          # workspaces list, window geometry, settings
config/<hostname>/geocode_cache.json   # persistent reverse-geocode results (lat/lon → city/state/country)
cache/<hostname>/thumbnails/           # generated JPEG thumbnails
```

---

## Workspace Panel (left, ~15 % width)
- **Add Workspace** button → folder picker dialog
- Each workspace shown as a **checkbox item** in a tree
- ✅ Checked = active (scanned and shown in right panel)
- ☐ Unchecked = hidden (photos removed from view instantly, no rescan)
- Right-click context menu: **Remove Workspace**, **Open in File Manager**
- Workspaces persist across restarts (saved in `config.json`)
- Adding a new workspace **immediately triggers a background scan** (queued as a QRunnable in the app thread-pool)

---

## Scanning
- Runs entirely in background `QRunnable` threads — UI never freezes
- **Per-workspace independent scanners** — scans for different workspaces run independently (starting a scan for workspace B does not cancel an ongoing scan for workspace A); starting a new scan for the same workspace cancels the previous scan for that workspace only
- Phase 1: enumerate all media files (rglob) — progress bar shows indeterminate spinner while counting
- Phase 2: process files (stat + EXIF) — progress bar shows `current/total`
- Incremental UI updates every 20 photos during scan (UI updated when the per-workspace photo list length % 20 == 0)
- Status bar shows `"Scanning <name>… counting files…"` immediately on add
- Supported image extensions: (see `utils/file_utils.py`) `.jpg .jpeg .png .gif .bmp .tiff .tif .webp .heic .heif .raw .cr2 .nef .arw .dng`
- Supported video extensions: `.mp4 .mov .avi .mkv .wmv .flv .webm .m4v .mpg .mpeg`

---

## Thumbnail Cache
- Generated in background workers (never blocks main thread)
- Stored as JPEG on disk; keyed by the pattern `{hash(str(path))}_{int(mtime)}.jpg` (thumbnail filenames are produced with the photo path hash plus the file's mtime)
- `ThumbnailCache.get_thumbnail_path()` uses `f"{hash(str(photo_path))}_{int(mtime)}.jpg"`
- **RGBA / palette / greyscale → converted to RGB** before JPEG save to ensure compatibility
- Files **> 500 MB** skipped; a labelled grey default tile shown instead
- `Image.MAX_IMAGE_PIXELS = 300_000_000` (300 MP decompression bomb limit)
- Signal `ThumbnailSignals.ready(path, pixmap)` always delivered **asynchronously** (worker emits the signal after generation so the UI's widget dict is already populated)

---

## Folder View (tab 1)

### Layout hierarchy
```
📁 Workspace A   ← dark-blue collapsible header ▼/▶
   ▼ subfolder-1   ← green collapsible header (depth-shaded)
     [thumbnail grid]
   ▼ subfolder-2
     [thumbnail grid]
📁 Workspace B   ← independent section
   ...
```

### Thumbnail tiles
- **Grey placeholder** shown immediately; real thumbnail fills in async
- **Filename label** below image, truncated at 18 chars with `…`
- **Hover tooltip**: full filename · file size · creation date
- Click → opens **Photo Preview dialog**

### Workspace toggle behaviour
- Check workspace → scan only that workspace, add its section to view
- Uncheck → remove only that workspace's section; others untouched
- No full rescan on toggle

---

## Timeline View (tab 2)

### Sort modes (combo box)
| Mode | Groups |
|---|---|
| Creation Time | `2025  ·  February` — year + month, newest first |
| Modified Time | same grouping by modified date |
| File Size | `≥ 10 GB` → `1 GB–10 GB` → `100 MB–1 GB` → `10–100 MB` → `1–10 MB` → `< 1 MB` |
| **By Location** | Location groups — see below |

- Each group is a **collapsible dark-blue header** (▼/▶)
- Within each group, photos sorted newest-first (time) or largest-first (size)
- Same async thumbnail + filename label + tooltip as Folder view

### Group Jump Index (right sidebar)
- Narrow 110 px panel pinned to the right of the scroll area
- Lists all groups as compact clickable labels (e.g. `2025  Feb`, `≥ 10 GB`, `2026-02`)
- **Click any label** → instantly scrolls to that group section
- **Active group** highlighted in blue as you scroll (auto-tracks scroll position)
- Tooltip shows the full group name on hover

---

## Timeline – By Location Mode

### How it works
1. **Auto-start after scan**: `MainWindow._auto_start_geocoding()` triggers immediately after every workspace scan finishes — no need to open the Location tab first.
2. A `LocationScannerWorker` QRunnable runs in the background thread pool.
3. Worker iterates all photos:
   - **Already-cached GPS coords (non-empty)** → delivers city/state/country from `geocode_cache.json` instantly (no network).
   - **New GPS coords or empty-cached** → calls Nominatim reverse-geocode API (rate-limited at ~1 req/s; the code uses `GeocoderCache._RATE_LIMIT_S = 1.1` seconds), stores result in cache **only if non-empty**.
   - **No GPS** → skipped.
4. Each geocoded photo emits a signal → `MainWindow._on_photo_geocoded` → updates the canonical `Photo` object directly via `_path_to_photo` index (O(1)) → forwards to `TimelineView`.
5. `LocationScannerWorker` will attempt to persist useful non-empty results to the JPEG EXIF via `ExifWriter.write_location()` but only when it makes sense: it writes when the photo does not already have location fields in EXIF or when a `display`/`display_name` value is present but missing from the photo (i.e. backfilling a missing display_name). Writes are skipped for non-JPEG files.
6. `PhotoScanner` reads `location_city/state/country` from EXIF `UserComment` JSON on every scan (via `ExifReader._read_location_comment`) and restores those fields into the in-memory `Photo` object.

### Geocode Cache — poisoning protection
- `has()` and `get_cached()` return `False`/`None` for entries where all of city/state/country are empty
- Results are only persisted to `geocode_cache.json` if at least one field is non-empty
- `purge_empty()` runs automatically on cache load to evict stale empty entries from previous failed runs

### Location Persistence (EXIF)
- `ExifWriter.write_location(path, lat, lon, city, county, state, country, display)` writes:
  1. **GPS IFD** — existing GPS tags are preserved; only `GPSLatitudeRef`/`GPSLatitude` and `GPSLongitudeRef`/`GPSLongitude` are updated. The code also sets `GPSVersionID` to `(2,3,0,0)` when writing.
  2. **UserComment** (EXIF tag `0x9286`) — JSON blob `{"_picasa_location": true, "city": ..., "state": ..., "country": ..., "display": "...full Nominatim display_name..."}` prefixed with the ASCII header `ASCII\x00\x00\x00`.
- Original GPS coordinates from the camera are **never altered** — `lat`/`lon` passed to `write_location` always come from `p.gps_latitude`/`p.gps_longitude` (read from the file), not from any external source
- Supported only for JPEG (`.jpg`/`.jpeg`); silently skipped for RAW/PNG/HEIC
- The LocationScanner (and UI save) intentionally avoids redundant writes: skip write if `photo.location_city` is already populated and display_name/backfill conditions don't apply

### Proxy Resolution (geocoding)
`MainWindow._get_proxy_url()` and `GeocoderCache._build_proxies()` priority order:
1. `config["map_proxy"]` — explicit config value
2. `HTTPS_PROXY` env var
3. `https_proxy` env var (lowercase)
4. `HTTP_PROXY` env var
5. `http_proxy` env var (lowercase)
6. Empty string / None → no proxy

(Reason: HTTPS-capable env vars are preferred; HTTP env vars are used as a fallback and applied to both http and https when used.)

### Location Grouping Rules
- Photos sorted **newest-first** before grouping.
- A new group starts when **any** of these conditions are met:
  - The photo's **state** differs from the current group's state AND the group has ≥ 30 photos.
  - The photo's date is **> 6 months** before the first photo in the current group (code uses ~180 days / 6*30 days).
- Photos **without location data** (no GPS, or geocode pending) stay in the current group.
- **Example**: Photos from Chandler AZ + Tempe AZ → same group (same state). First photo from Miami FL after ≥ 30 AZ photos → new group.

### Group Header
- Shows **top-3 city names** by frequency + state, joined with `·`
  - e.g. `Chandler  ·  Tempe  ·  Arizona`
  - Falls back to `Unknown Location` / `Scanning…` if no geocode data yet.

### Jump Index (right sidebar in location mode)
- Shows **`YYYY-MM`** of the most-recent photo in each group (e.g. `2026-02`, `2025-08`)
- Click jumps to that group

### Search Bar (location mode only)
- Appears in toolbar next to sort combo when "By Location" is active
- Placeholder: `city, state, country…`
- Filters groups in real time — searches city, county, state, country of every photo in the group
- Example: typing `florida` finds groups containing Miami FL photos

### Progress Bar
- Thin green bar inside the Timeline widget (not the main window progress bar)
- Shows `Geocoding… 42%  (420/1000)` while worker is running
- Timeline rebuilds its location groups incrementally: the UI will rebuild every 10 geocoded photos so headers stay up-to-date without excessive churn (throttle implemented in `TimelineView._on_geocode_ready`)
- Disappears automatically when complete

### Proxy Support
- Uses `map_proxy` config setting if set, otherwise auto-detects env vars using the priority listed above

### Geocode Cache
- Stored at `config/<hostname>/geocode_cache.json`
- Key: `lat,lon` rounded to 3 decimal places (≈ 100 m precision) — implemented with Python's round(..., 3)
- Value: `{city, county, state, country, display}`
- Survives app restarts — each coord only fetched once ever
- Written atomically (`.tmp` → rename) to avoid corruption

### Photo Model additions
`Photo` dataclass gains five new string fields (default `""`):
- `location_city`, `location_county`, `location_state`, `location_country`
- `location_display` — full Nominatim `display_name` string (e.g. `长城, 延庆区, 北京市, 中国`)

---

## Map View (tab 3)
- Displays photos with GPS EXIF data on an interactive Leaflet map (via folium)
- Heatmap layer showing photo density by location
- Cluster markers (green/blue/red by count); click popup shows filenames
- Photos without GPS excluded; status bar shows GPS vs non-GPS counts
- Auto zoom: worldwide spread → zoom 3, regional → zoom 6, local → zoom 10

### Asset loading mode (config `map_use_local_assets`)
| Mode | How | When to use |
|---|---|---|
| `true` (default in fresh config) | All JS/CSS inlined into HTML (~673KB) | Offline, behind firewall, no proxy |
| `false` (CDN) | Raw folium HTML, CDN URLs loaded by WebEngine | If you prefer fresh CDN versions |

- The app can download CDN assets into `cache/<hostname>/map_assets/` using `download_map_assets.py`
- When in CDN mode the app attempts to push proxy settings into Qt WebEngine via `QNetworkProxy.setApplicationProxy()` so the embedded web view can reach CDN URLs (see `ui/map_view._apply_webengine_proxy`)

### Proxy support (config `map_proxy`)
- Auto-detected from `map_proxy` config or environment variables using the same priority list used for geocoding (config → HTTPS/https → HTTP/http)
- Local mode: proxy used to download missing cache assets on-demand
- CDN mode: proxy pushed to `QNetworkProxy.setApplicationProxy()` for WebEngine
- Run `python3 download_map_assets.py [proxy_url]` to pre-download all assets

### GPS EXIF parsing (`utils/exif_reader.py`)
- Uses `img.getexif().get_ifd(0x8825)` to read GPS sub-IFD
- Handles PIL `IFDRational` floats and piexif `(num, den)` rational tuples
- Rejects `0xFFFFFF` sentinel (no GPS lock) and validates WGS-84 range

---

## Photo Preview Dialog
Opened by clicking any thumbnail in Folder or Timeline views.

### Images
- Dark-background modal dialog (1100×800, resizable)
- Full-resolution load via PIL, capped at 4K for performance
- `ZoomableView` — custom `QWidget` with zoom + pan (no scroll area limitation)
- Load is **deferred** (`QTimer.singleShot`) so dialog paints before PIL decodes

### View-aware navigation
- **Navigation order matches the active view** at click time:
  - Clicked from **Folder tab** → navigates through photos in folder/workspace display order
  - Clicked from **Timeline tab** → navigates through the current sort order and active location filter
  - Clicked from **Map tab** → navigates through all photos
- Each view exposes `get_ordered_photos() → List[Photo]` used by `MainWindow.open_preview()`

### Keyboard focus
- Dialog grabs keyboard focus immediately on open (no need to click first)
- An `eventFilter` on the dialog intercepts navigation keys from all child widgets
  (scroll area, splitter, location panel) — arrow keys always navigate

### Zoom & Pan (images only)
| Gesture / Input | Action |
|---|---|
| macOS two-finger pinch on trackpad | Zoom in/out (Ctrl+scroll fallback) |
| Ctrl + scroll wheel | Zoom in/out centred on cursor |
| Scroll (no Ctrl) | Pan image when zoomed in |
| Click-drag | Pan image when zoomed in |
| Double-click | Reset to fit-to-window |
| `+` / `=` key | Zoom in step |
| `-` key | Zoom out step |
| `0` key | Reset to fit-to-window |
| `－` / `＋` toolbar buttons | Zoom out / in |
| `⊡ Fit` toolbar button | Reset to fit-to-window |

Zoom percentage shown in toolbar (`Fit` when in fit-to-window mode, `150%` when zoomed).

### Videos
- **No in-app decoder** — video is opened in the **OS default system player**
  - macOS: `open <file>`
  - Windows: `start "" <file>`
  - Linux: `xdg-open <file>`
- Dialog shows a 🎬 placeholder with the filename and instructions
- **▶ Open in Player** button in toolbar

### Navigation (both images and videos)
| Action | Result |
|---|---|
| ◀ Prev button | Previous photo/video |
| ← / ↑ / Backspace | Previous photo/video |
| Next ▶ button | Next photo/video |
| → / ↓ / Space | Next photo/video |
| Enter key | Open in system player (videos only) |
| Esc | Close dialog |

### Location Editor Panel (right side)
Shown alongside the image in a horizontal splitter (draggable divider):

| Element | Description |
|---|---|
| Info grid | Latitude, Longitude, City, County, State, Country, Full Address — all selectable/copyable |
| Address input | Pre-filled from `location_display` (full address) if available, otherwise city/state/country; full-width text box |
| 🌐 Gen GPS from Address | Forward-geocodes the typed address via Nominatim in a background thread |
| Status label | `✓ display_name` on success, `✗ error text` on failure (fully selectable/copyable) |
| 💾 Save | Writes lat/lon + city/state/country to the in-memory `Photo` object **and** to the JPEG EXIF on disk (persists across restarts when JPEG) |
| Cancel | Reverts to original values |

- Gen GPS also runs a reverse-geocode on the result to fill in city/state/country
- Save is disabled until Gen GPS returns a result
- Non-JPEG files: in-memory save only; status note shown

### Info bar (bottom)
File size · Date · Resolution (images) · Camera model (if EXIF available)

---

## Menu Bar
| Menu | Item | Action |
|---|---|---|
| File | Refresh All (Ctrl+R) | Re-scan all active workspaces |
| File | Exit (Ctrl+Q) | Quit |
| View | Clear Thumbnail Cache | Delete all cached thumbnails and re-scan |
| Help | About | App info dialog |

---

## How to run
```bash
cd /path/to/picasa
/path/to/python main.py
```
Dependencies (install once):
```bash
pip install -r requirements.txt
```



# Photo Manager – Feature Reference
> Living document. Updated with every feature change. Sufficient to recreate the app from scratch.

---

## Stack
| Layer | Choice | Reason |
|---|---|---|
| Language | Python 3.11+ | Cross-platform, rich ecosystem |
| UI | PyQt6 | Native performance, Qt6 signals/slots, no Electron overhead |
| Image decode | Pillow (PIL) | Read/resize/EXIF for all common image formats |
| EXIF | piexif | Structured GPS + datetime extraction |
| Video thumbnails | imageio | First-frame extraction (used only for cache generation) |
| Video playback | OS system player | Zero codec work; `open`/`start`/`xdg-open` |
| Reverse geocoding | requests + Nominatim (OSM) | Free, no API key, rate-limited at 1 req/s |

---

## Architecture

```
picasa/
├── main.py                   Entry point
├── core/
│   ├── models.py             Photo, Workspace dataclasses (+ location_city/state/country/county fields)
│   ├── photo_scanner.py      Background QRunnable scanner (per-workspace)
│   ├── thumbnail_cache.py    Async thumbnail generation + disk cache
│   ├── location_scanner.py   Background QRunnable geocoder (LocationScannerWorker)
│   └── workspace_manager.py  Add/remove/toggle/persist workspaces
├── ui/
│   ├── main_window.py        Main window, per-workspace photo store, geocoder wiring
│   ├── workspace_panel.py    Left panel – workspace checkboxes
│   ├── folder_view.py        Folder tab – collapsible workspace/folder sections
│   ├── timeline_view.py      Timeline tab – grouped by year/month, size, or location
│   ├── map_view.py           Map tab – GPS heatmap
│   └── photo_preview.py      Click-to-preview dialog (images + videos)
└── utils/
    ├── config_manager.py     JSON config + thumbnail dir (repo-local, per machine)
    ├── exif_reader.py        GPS, datetime, camera from EXIF
    ├── geocoder.py           GeocoderCache – Nominatim reverse geocode + disk cache
    └── file_utils.py         Supported extensions, type helpers
```

---

## Config & Cache paths
Stored **inside the repo**, namespaced by machine hostname — never committed (in `.gitignore`):
```
config/<hostname>/config.json          # workspaces list, window geometry, settings
config/<hostname>/geocode_cache.json   # persistent reverse-geocode results (lat/lon → city/state/country)
cache/<hostname>/thumbnails/           # generated JPEG thumbnails
```

---

## Workspace Panel (left, ~15 % width)
- **Add Workspace** button → folder picker dialog
- Each workspace shown as a **checkbox item** in a tree
- ✅ Checked = active (scanned and shown in right panel)
- ☐ Unchecked = hidden (photos removed from view instantly, no rescan)
- Right-click context menu: **Remove Workspace**, **Open in File Manager**
- Workspaces persist across restarts (saved in `config.json`)
- Adding a new workspace **immediately triggers a scan** (signal/slot wiring in `WorkspacePanel` → `MainWindow`)

---

## Scanning
- Runs entirely in background `QRunnable` threads — UI never freezes
- **Per-workspace independent scanners** — adding workspace2 never cancels workspace1
- Phase 1: enumerate all media files (rglob) — main window progress bar shows indeterminate spinner while counting
- Phase 2: process files (stat + EXIF) — progress bar shows `current/total`
- Incremental UI updates: the app flushes updates to the Folder view every 20 discovered photos during a scan
- Status bar shows `"Scanning <name>… counting files…"` immediately on add
- Supported image extensions: `.jpg .jpeg .png .gif .bmp .tiff .tif .webp .heic .heif .raw .cr2 .nef .arw .dng`
- Supported video extensions: `.mp4 .mov .avi .mkv .wmv .flv .webm .m4v .mpg .mpeg`

---

## Thumbnail Cache
- Generated in background workers (never blocks main thread)
- Stored as JPEG on disk; thumbnail filenames used by `ThumbnailCache` are formatted as `hash(path)_<mtime>.jpg` (mtime-based suffix ensures updates when source file changes)
- Note: `ConfigManager.get_thumbnail_path()` exposes a legacy helper that returns `hash(path).jpg` (no mtime); the live `ThumbnailCache` class appends the mtime when creating thumbnails.
- **RGBA / palette / greyscale → converted to RGB** before JPEG save
- Files **> 500 MB** are skipped and a labelled grey default tile is shown instead
- `Image.MAX_IMAGE_PIXELS` is raised in code to `300_000_000` to avoid decompression-bomb errors for very large images
- Signal `ThumbnailSignals.ready(path, pixmap)` is emitted from worker threads and is always delivered asynchronously so view widgets are present when the callback runs

---

## Folder View (tab 1)

### Layout hierarchy
```
📁 Workspace A   ← dark-blue collapsible header ▼/▶
   ▼ subfolder-1   ← depth-shaded collapsible header
     [thumbnail grid]
   ▼ subfolder-2
     [thumbnail grid]
📁 Workspace B   ← independent section
   ...
```

### Thumbnail tiles
- **Grey placeholder** shown immediately; real thumbnail fills in asynchronously when generated
- **Filename label** below image, truncated at 18 chars with `…`
- **Hover tooltip**: full filename · file size · creation date (uses `Photo.get_display_time()`)
- Click → opens **Photo Preview dialog**

### Workspace toggle behaviour
- Check workspace → scan only that workspace, add its section to view
- Uncheck → remove only that workspace's section; others untouched
- No full rescan on toggle

---

## Timeline View (tab 2)

### Sort modes (combo box)
| Mode | Groups |
|---|---|
| Creation Time | `YYYY  ·  Month` — year + month, newest first |
| Modified Time | same grouping by modified date |
| File Size | `≥ 10 GB` → `1 GB – 10 GB` → `100 MB – 1 GB` → `10 MB – 100 MB` → `1 MB – 10 MB` → `< 1 MB` |
| **By Location** | Location groups — see below |

- Each group is a **collapsible dark-blue header** (▼/▶)
- Within each group, photos sorted newest-first (time) or largest-first (size)
- Same async thumbnail + filename label + tooltip as Folder view

### Group Jump Index (right sidebar)
- Narrow 110 px panel pinned to the right of the scroll area
- Lists all groups as compact clickable labels (e.g. `2025  Feb`, `≥ 10 GB`, `2026-02`)
- **Click any label** → instantly scrolls to that group section
- **Active group** highlighted in blue as you scroll (auto-tracks scroll position)
- Tooltip shows the full group name on hover

---

## Timeline – By Location Mode

### How it works
1. **Auto-start after scan**: `MainWindow._auto_start_geocoding()` is invoked after every workspace scan finishes; it will start background geocoding only when there are GPS-equipped photos that lack location fields.
2. A `LocationScannerWorker` QRunnable runs in the background thread pool and performs reverse geocoding.
3. Worker iterates all photos:
   - **Already-cached GPS coords (non-empty)** → delivers city/state/country from `geocode_cache.json` instantly (no network).
   - **New GPS coords or empty-cached** → calls Nominatim reverse-geocode API (rate-limited at ~1 req/s), stores result in cache **only if at least one of city/state/country is non-empty**.
   - **No GPS** → skipped.
4. Each geocoded photo emits a signal → `MainWindow._on_photo_geocoded` updates the canonical `Photo` object via the `_path_to_photo` index (O(1)) and forwards the result to `TimelineView`.
5. The worker will call `ExifWriter.write_location()` for non-empty results when appropriate; this persists a JSON location payload into EXIF `UserComment` and updates the GPS IFD (see details below), so subsequent scans can read the location back from EXIF without network access.
6. `PhotoScanner` reads `location_city/state/country` from EXIF `UserComment` JSON on every scan (via `ExifReader._read_location_comment()`).

### Geocode Cache — poisoning protection
- `has()` and `get_cached()` return `False`/`None` for entries where all of city/state/country are empty
- Results are only persisted to `geocode_cache.json` if at least one field is non-empty
- `purge_empty()` runs automatically on cache load to evict stale empty entries from previous failed runs

### Location Persistence (EXIF)
- `ExifWriter.write_location(image_path, lat, lon, city, county, state, country, display)` writes:
  1. **GPS IFD** — updates `GPSLatitude`, `GPSLatitudeRef`, `GPSLongitude`, `GPSLongitudeRef` while preserving any other existing GPS tags (altitude, bearing, speed, DOP, satellites, etc.). The GPS IFD is merged, not replaced.
  2. **UserComment** (EXIF tag `0x9286`) — JSON blob with `_picasa_location` marker (`{"_picasa_location": true, "city": ..., "state": ..., "country": ..., "display": "..."}`) stored using the 8-byte `ASCII\x00\x00\x00` header followed by UTF‑8.
- Only JPEG files (`.jpg`/`.jpeg`) are supported for in-place EXIF writes; other formats (RAW/PNG/HEIC) are skipped with a logged message.
- When the worker decides to write EXIF it follows this rule: write when the photo has no location fields already stored in EXIF (first write), or when the display name is missing and the geocoder returned a display name (backfilling). This avoids unnecessary repeated writes; the code therefore may write on first discovery or to backfill a missing `display` even if `location_city` already exists.

### Proxy Resolution (geocoding)
`MainWindow._get_proxy_url()` priority order (exactly as implemented):
1. `config["map_proxy"]` — explicit config value (non-empty string)
2. `HTTPS_PROXY` env var
3. `https_proxy` env var
4. `HTTP_PROXY` env var
5. `http_proxy` env var
6. Empty string → no proxy

(Several modules follow the same lookup order when building `requests` proxies or when downloading map assets.)

### Location Grouping Rules
- Photos sorted **newest-first** before grouping.
- A new group starts when **any** of these conditions are met:
  - The incoming photo's **state** differs from the current group's state AND the current group already has ≥ 30 photos.
  - The incoming photo's date is **> 6 months** (implemented as ~180 days) earlier than the group's first photo.
- Photos **without location data** (no GPS, or geocode still pending) remain in the current group until a boundary condition forces a split.

### Group Header
- Shows **top-3 city names** by frequency + state, joined with `·` (falls back to county, then country if necessary)

### Jump Index (right sidebar in location mode)
- Shows **`YYYY-MM`** of the most-recent photo in each group (e.g. `2026-02`, `2025-08`)
- Click jumps to that group

### Search Bar (location mode only)
- Appears in toolbar next to sort combo when "By Location" is active
- Placeholder: `city, state, country…`
- Filters groups in real time — searches city, county, state, country of every photo in the group

### Progress Bar
- Thin green bar inside the Timeline widget (not the main window progress bar)
- Shows `Geocoding… 42%  (420/1000)` while worker is running
- Disappears automatically when complete

### Proxy Support
- Uses `map_proxy` config setting if set, otherwise auto-detects `HTTPS_PROXY`/`https_proxy`/`HTTP_PROXY`/`http_proxy` environment variables

### Geocode Cache
- Stored at `config/<hostname>/geocode_cache.json`
- Key: `lat,lon` rounded to 3 decimal places (≈ 100 m precision)
- Value: `{city, county, state, country, display}`
- Survives app restarts — each coord only fetched once (the cache only persists non-empty results)
- Written atomically (`.tmp` → rename) to avoid corruption

### Photo Model additions
`Photo` dataclass fields (in addition to standard fields):
- `location_city`, `location_county`, `location_state`, `location_country` (strings, default `""`)
- `location_display` — full Nominatim `display_name` string

---

## Map View (tab 3)
- Displays photos with GPS EXIF data on an interactive Leaflet map (via folium)
- Heatmap layer showing photo density by location (optional; best-effort)
- Cluster markers (green/blue/red by count); click popup shows filenames
- Photos without GPS excluded; status bar shows GPS vs non-GPS counts
- Auto zoom: worldwide spread → zoom 3, regional → zoom 6, local → zoom 10

### Asset loading mode (config `map_use_local_assets`)
| Mode | How | When to use |
|---|---|---|
| `true` (default) | All JS/CSS are inlined into the generated HTML from cached files under `cache/<hostname>/map_assets/` (fallback to network if missing) | Offline or behind firewall; avoids runtime CDN calls |
| `false` (CDN) | Raw folium HTML served directly; WebEngine will load CDN URLs at runtime | If you prefer fresh CDN assets |

### Proxy support (config `map_proxy`)
- Auto-detected from `HTTPS_PROXY`/`https_proxy`/`HTTP_PROXY`/`http_proxy` env vars if not set in config
- Local mode: proxy (or env proxy) is used when downloading missing cache assets on-demand
- CDN mode: when a proxy is configured it is pushed to `QNetworkProxy.setApplicationProxy()` for the Qt WebEngine process
- Run `python3 download_map_assets.py [proxy_url]` to pre-download the typical folium/CDN assets to `cache/<hostname>/map_assets/`

### GPS EXIF parsing (`utils/exif_reader.py`)
- Uses `img.getexif().get_ifd(0x8825)` to read GPS sub-IFD when available
- Handles PIL `IFDRational` floats and piexif `(num, den)` rational tuples
- Rejects `0xFFFFFF` sentinel (no GPS lock) and validates WGS-84 ranges for sanity

---

## Photo Preview Dialog
Opened by clicking any thumbnail in Folder or Timeline views.

### Images
- Dark-background modal dialog (resizable)
- Full-resolution load via PIL (the app caps internal handling for very large images for performance)
- `ZoomableView` — custom `QWidget` with zoom + pan
- Load is **deferred** (`QTimer.singleShot`) so dialog paints before PIL decodes

### View-aware navigation
- **Navigation order matches the active view** at click time:
  - Clicked from **Folder tab** → navigates through photos in folder/workspace display order
  - Clicked from **Timeline tab** → navigates through the current sort order and active location filter
  - Clicked from **Map tab** → navigates through all photos
- Each view exposes `get_ordered_photos() → List[Photo]` used by `MainWindow.open_preview()`

### Keyboard focus
- Dialog grabs keyboard focus immediately on open (arrow keys navigate without extra clicks)

### Zoom & Pan (images only)
| Gesture / Input | Action |
|---|---|
| macOS two-finger pinch on trackpad | Zoom in/out (Ctrl+scroll fallback) |
| Ctrl + scroll wheel | Zoom in/out centred on cursor |
| Scroll (no Ctrl) | Pan image when zoomed in |
| Click-drag | Pan image when zoomed in |
| Double-click | Reset to fit-to-window |
| `+` / `=` key | Zoom in step |
| `-` key | Zoom out step |
| `0` key | Reset to fit-to-window |

### Videos
- **No in-app decoder** — video is opened in the **OS default system player** (macOS: `open`, Windows: `start`, Linux: `xdg-open`)
- Dialog shows a 🎬 placeholder with the filename and instructions
- **▶ Open in Player** button in toolbar

### Navigation (both images and videos)
| Action | Result |
|---|---|
| ◀ Prev button | Previous photo/video |
| ← / ↑ / Backspace | Previous photo/video |
| Next ▶ button | Next photo/video |
| → / ↓ / Space | Next photo/video |
| Enter key | Open in system player (videos only) |
| Esc | Close dialog |

### Location Editor Panel (right side)
Shown alongside the image in a horizontal splitter (draggable divider):

| Element | Description |
|---|---|
| Info grid | Latitude, Longitude, City, County, State, Country, Full Address — all selectable/copyable |
| Address input | Pre-filled from `location_display` (full address) if available, otherwise city/state/country; full-width text box |
| 🌐 Gen GPS from Address | Forward-geocodes the typed address via Nominatim in a background thread |
| Status label | `✓ display_name` on success, `✗ error text` on failure (fully selectable/copyable) |
| 💾 Save | Writes lat/lon + city/state/country to the in-memory `Photo` object **and** to the JPEG EXIF on disk (persists across restarts) |
| Cancel | Reverts to original values |

- Gen GPS also runs a reverse-geocode on the result to fill in city/state/country
- Save is disabled until Gen GPS returns a result
- Non-JPEG files: in-memory save only; status note shown

### Info bar (bottom)
File size · Date · Resolution (images) · Camera model (if EXIF available)

---

## Menu Bar
| Menu | Item | Action |
|---|---|---|
| File | Refresh All (Ctrl+R) | Re-scan all active workspaces |
| File | Exit (Ctrl+Q) | Quit |
| View | Clear Thumbnail Cache | Delete all cached thumbnails and re-scan |
| Help | About | App info dialog |

---

## How to run
```bash
cd /path/to/picasa
/path/to/python main.py
```

Install dependencies using the provided `requirements.txt`:

```bash
python3 -m pip install -r requirements.txt
```

Current `requirements.txt` includes (example / authoritative source in repo):
- PyQt6>=6.6.0
- Pillow>=10.0.0
- piexif>=1.1.3
- rawpy>=0.18.0
- imageio>=2.33.0
- imageio-ffmpeg>=0.4.9
- folium>=0.15.0
- PyQt6-WebEngine>=6.6.0
- requests>=2.28.0

(If you prefer a minimal quick-check you can run `python3 test_installation.py` which validates imports and expected files.)

---

## Electron Port + Backup — Design & Specification
> This section describes how to port the PyQt6 Photo Manager to an Electron-based desktop app and adds a fully-designed backup system that stores selected files into uncompressed zip container(s) with an accompanying SQLite cache. The design focuses on non-blocking background work, cross-instance cache compatibility, and clear backup layout so another instance of the app can open and read the backup folder directly.

### Goals (high level)
- Recreate the Photo Manager feature-set in Electron (UI, Folder/Timeline/Map/Preview) and add a first-class Backup system.
- Backup: store chosen files into uncompressed zip containers (no compression) with a 10 GiB per-archive maximum.
- Provide a root-level SQLite cache in each backup target so another instance can read thumbnails and manifest quickly.
- UI responsiveness: all expensive work runs off the renderer thread (main process or worker threads), with safe IPC and clear progress reporting. The UI never blocks while scanning, building views, or performing backups.
- Cross-platform drive grouping (drive letter on Windows, volume name/mount point on macOS/Linux).

### Recommended stack (Electron ecosystem)
- Electron (>= 26) with a separate main process and renderer (React + Vite recommended for renderer).
- Preload script exposing minimal secure IPC surface using contextBridge.
- Node-side libraries (main/worker):
  - better-sqlite3 (fast synchronous SQLite access in main/worker; safe inside worker threads)
  - archiver (zip streaming with store option + forceZip64 for >4GB entries)
  - sharp (thumbnail generation)
  - node-fetch / axios (if external network requests needed)
  - worker_threads (for CPU-heavy tasks) and child_process for long-running streaming work
  - chokidar (optional) for watching backup/workspace folders

### Suggested repo layout (electron)
```
electron-app/
├── package.json
├── src/
│   ├── main/                 # main process: ipc handlers, db manager, job queue
│   │   ├── main.ts
│   │   ├── ipc_handlers.ts
│   │   ├── backup_manager.ts # orchestrates backup jobs, archive writers
│   │   └── db/               # sqlite helper + schema migration
│   ├── preload/              # small API for renderer via contextBridge
│   ├── renderer/             # React/Vite app — UI / panels / views
│   └── workers/              # worker threads: scanners, thumbnailers
├── build/
└── docs/
```

### UI changes (important)
- Top-level tabs: Folder | Timeline | Map | Backup
- Left panel (~15%): Workspaces, grouped by drive/volume (collapsible). Each workspace checkbox toggles active/hidden state. Rapid toggle must not block UI.
- Right panel (~10%): Backup Folders list (the user adds backup-target folders here). Grouped by drive/volume. Each backup target shows its name and current status (ready / busy / last backup date).
- Backup tab (center): shows a diff/preview between selected source workspaces (left) and selected backup target(s) (right). Controls:
  - Diff Preview (list of changed/new files)
  - Backup Now (starts a job)
  - Pause / Resume / Cancel
  - Settings (max archive size, skip > limit, deterministic relative paths)
- Status bar (bottom): global task queue count, currently active job, per-job progress (files/bytes), last error/warnings.

### Backup folder structure (root of user-selected backup target)
All files required for a backup target are stored under the root folder the user adds to the right panel. A typical root layout:

```
<backup-root>/
  backup_metadata.sqlite        # PRIMARY manifest + cache used by this backup folder
  thumbnails/                   # generated thumbnails (JPEG) keyed by file-hash.jpg
  display_cache/                # any UI display caches (JSON files) to speed rendering
  archives/                     # archive files (zip) created for backups (store=no compression)
    backup_20260210T103012.part001.zip
    backup_20260210T103012.part002.zip
    ...
  manifest.json                 # human-readable summary (optional)
  .lock                         # optional lock file used during active writes
```

Notes:
- `backup_metadata.sqlite` is the canonical cache and is written atomically and in transactions. It makes the backup folder a first-class dataset other app instances can open.
- `thumbnails/` contains thumbnails sized the same as the viewer expects (e.g. 320px), saved as JPEG. Keys: `<sha256_hex_of_path+mtime>.jpg`.
- `archives/` stores one or more zip files per backup run. They are uncompressed (store) and use Zip64 when needed. Max file size per archive file is 10 GiB (configurable but default 10 GiB). If the set does not fit into a single archive, new parts are created sequentially.

### Naming rules for archives
- Base name uses ISO timestamp + optional backup name: `backup_<timestamp>_N.zip` or `backup_<timestamp>.partNNN.zip`.
- Example: `backup_20260210T103012.part001.zip`, `backup_20260210T103012.part002.zip`.
- Each archive contains file entries with relative paths that mirror their source canonical relative layout under top-level drive separators (see below for path normalization).
- Archives are created via streaming (no buffering whole files) and closed atomically. Half-written parts use a `.tmp` suffix and are renamed after completion.

### Drive/volume grouping and relative paths
- On Windows: top-level directories in the archive are the drive letters (e.g. `C/Users/me/Pictures/...`).
- On macOS/Linux: use the volume name or mount point name (e.g. `MacintoshHD/Users/...` or `mnt_external/Photos`).
- This drive separation mirrors the left/right panels so users can browse backups by drive group.
- Within an archive each file entry path is `DRIVE_NORMALIZED/<relative_path_from_volume_root>`.

### Backup SQLite schema (high level)
- Use a single DB at `backup_metadata.sqlite` with the following minimal schema to support the viewer and to enable diffs:

SQL DDL (example):

CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY,
  name TEXT,
  timestamp_utc TEXT,
  settings_json TEXT,
  parts_json TEXT, -- JSON array of archive part filenames and sizes
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  backup_id INTEGER REFERENCES backups(id),
  original_path TEXT,        -- absolute path on source machine when backed up
  rel_path TEXT NOT NULL,    -- the path stored inside the archive (DRIVE/...)
  size INTEGER,
  mtime INTEGER,             -- epoch seconds
  sha256 TEXT,               -- content fingerprint
  archive_part TEXT,         -- which part file this entry was written to
  archive_offset INTEGER,    -- optional (for future fast extraction)
  crc32 INTEGER,
  added_at_utc TEXT
);

CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256);
CREATE INDEX IF NOT EXISTS idx_files_rel_path ON files(rel_path);

-- Thumbnails stored on disk in thumbnails/, but we index them here for quick lookup
CREATE TABLE IF NOT EXISTS thumbnails (
  sha256 TEXT PRIMARY KEY,
  thumbnail_path TEXT,
  width INTEGER,
  height INTEGER,
  updated_at_utc TEXT
);

CREATE TABLE IF NOT EXISTS display_cache (
  key TEXT PRIMARY KEY,
  json TEXT,
  updated_at_utc TEXT
);

Notes:
- Use transactions for batch inserts/updates for speed.
- `sha256` is computed from the file bytes; the index allows quick duplicate detection across sources.

### Diff algorithm (what Backup tab shows)
1. Renderer asks main process for a snapshot of the source selection (list of source file paths + mtime + size + sha256 (optional)).
2. Main process consults backup_metadata.sqlite in the selected target(s) and compares by (rel_path) or (sha256) depending on user preference.
3. The diff result classifies files as: New, Modified (mtime/size differs), Identical, Skipped (too-large), Missing Source.
4. The UI shows counts and a paginated list. The user can filter by type or path.

Performance note: computing SHA256 for every file can be IO heavy. The initial scan uses size+mtime heuristics and only computes sha256 when needed (e.g. when user selects "content-based dedupe").

### Archive writing rules and splitting
- Archive writer streams files one by one into the current zip part using `archiver` with store mode (no compression). Use `forceZip64` to handle >4GB entries when needed.
- Maintain a running bytes counter. Before adding a file, check if (current_part_size + file_size) > MAX_PART_SIZE (default 10 GiB). If so, finalize the current part and start a new one.
- If a single source file size > MAX_PART_SIZE: by default skip it and report an error/warning; optionally user can enable a "allow large files" setting which will store the file in its own single-part archive (if user wants, but it must still be < allowed maximum of filesystem). Splitting files across parts is not supported.
- Write archive parts to temporary filenames first (e.g. `.partNNN.zip.tmp`) and rename after successful finalization.
- Update `backup_metadata.sqlite` inside a single transaction after the archive part(s) close successfully to ensure atomic state.

### Thumbnail generation & the backup cache
- Thumbnails are generated for all backed-up files that are images (configurable set of extensions). Use `sharp` to read/resize and write JPEG.
- Thumbnails are saved under `<backup-root>/thumbnails/<sha256>.jpg` and their entries are recorded in the SQLite `thumbnails` table.
- Thumbnails are generated in background workers and the UI is updated via IPC events (`thumbnail-ready`), but the UI never waits for them to display an initial placeholder.
- All thumbnails are deterministic (same size & quality) so another instance mounting the backup root will display the cached thumbnails immediately.

### Viewer integration with backup folders
- When backup folders are added to the right panel and selected by the user, the viewer should treat them like workspaces: it queries the `backup_metadata.sqlite` and the `archives/` index and lists files as if they were in a workspace. Thumbnails are read from `thumbnails/`.
- The UI uses the same view components, only the metadata source differs (local filesystem scanning vs backup sqlite). Implement a small abstraction layer `PhotoProvider` with methods:
  - listFolders()
  - listPhotosInFolder(folder)
  - getThumbnail(photo)
  - getPhotoMetadata(photo)
  Two concrete implementations: FilesystemPhotoProvider and BackupSqlitePhotoProvider.

### IPC contract (main ↔ renderer) — key channels
- `scan-workspace` (start scan for a workspace path)
- `scan-progress` (progress updates from worker)
- `get-workspace-snapshot` (list of files in workspace, returns paginated results)
- `list-backup-targets` / `add-backup-target` / `remove-backup-target`
- `compute-diff` (sourcePaths[], backupTargetId) -> diff result stream
- `start-backup` (diffId / jobSpec) -> returns jobId
- `backup-progress` (jobId, filesProcessed, bytesProcessed, currentFile)
- `backup-complete` (jobId, summary)
- `pause-job` / `resume-job` / `cancel-job`
- `thumbnail-ready` (sha256, path)

IPC security: expose only these channels in preload, validate arguments on main side strictly.

### Background concurrency model
- A centralized JobQueue (in main process) manages jobs: scan, thumbnail generation, geocoding (if any), archive writing.
- Each job spawns a worker: `worker_threads` for CPU-bound (thumbnail generation, hashing), `child_process` streaming for long-file IO (archiver streaming piping).
- The JobQueue allows: concurrency limits (e.g., 2 archive writers, 4 thumbnail workers), per-workspace cancellation, and pause/resume (for archiver pause: pause reading input stream from disk; implement cooperative pausing using async iterators and check a token).
- UI interactions (rapid toggles between left panel workspaces) enqueue a lightweight "rebuild view" job that is debounced (for example 200–500 ms) and low-priority. If the user toggles many times quickly, the queue reduces churn by coalescing similar actions.
- All long-running I/O occurs off the main renderer thread; IPC events update UI when safe.

### Handling fast user toggling without freezing
- Rebuild view actions are incremental and read the local cache (SQLite) for initial data. The UI renders placeholders from cached metadata immediately; thumbnails load async.
- Implement a two-phase update:
  1. Fast metadata phase (from SQLite or quick rglob): produce folder & filename lists with basic metadata (mtime, size) — this runs fast and is displayed immediately.
  2. Deferred enhancement phase: expensive tasks (sha256, thumbnail generation, EXIF parsing) are scheduled at lower priority; their results patch the view.
- Use cancellation tokens: if a newer rebuild request arrives, workers cancel older low-priority tasks.

### Atomicity & crash recovery
- While writing archives, create a `.lock` file in the backup root with process id and job id. Remove it after successful completion.
- Part files are first written as `.tmp`; incomplete `.tmp` files are ignored on startup (or optionally imported as "recoverable parts" only after user confirmation).
- SQLite writes are transactional. On startup, the app inspects the `backup_metadata.sqlite` and any `.tmp` in `archives/` and reports inconsistencies to the user with options to recover or delete.

### Edge cases and rules
- Files > MAX_PART_SIZE: skipped by default (reported to user). Option to store in its own archive part allowed when enabled.
- Hardlinks / symlinks: record metadata but copy the resolved file contents; do not attempt to preserve complex filesystem features inside the zip unless user opts for an advanced mode.
- Path normalization: sanitize names to avoid `..` or absolute-transfers; stored paths must be relative.
- Permissions and ownership: zip will not preserve Unix ownership by default; record such metadata in display_cache if needed.
- Disk space: estimate required space before a backup and warn if insufficient.

### Implementation checklist (concrete steps)
1. Scaffold Electron app + renderer framework (React + Vite suggested). Add TypeScript for safety.
2. Implement `PhotoProvider` abstraction and two providers: Filesystem and BackupSqlite.
3. Implement main-process JobQueue and worker API for scanning, thumbnail generation, and archiving.
4. Create `backup_manager.ts` that manages archive splitting, part temp writes, finalize/rename, and sqlite update in transaction.
5. Implement UI: left workspace panel grouped by drive, right backup targets panel grouped by drive, center tab with diff & backup actions, status bar.
6. Add pause/resume/cancel API and test it with synthetic large sets.
7. Implement thumbnail cache writing inside backup root and the `backup_metadata.sqlite` schema.
8. Add tests: unit test for diff algorithm, integration test for archive splitting, and unit tests for sqlite integrity checks.

### Example SQL usage patterns
- Batch insert files after a successful backup:
  - BEGIN TRANSACTION; INSERT INTO backups(...); INSERT INTO files(... multiple rows ...); COMMIT;
- Query for diff (simple heuristic): SELECT rel_path, max(mtime) FROM files WHERE rel_path = ?;

### Security & privacy notes
- The backup root is chosen by the user; never auto-add external folders without consent.
- Do not ship the app with default auto-uploading of backups.

### Small UX details
- Diff lists are virtualized (e.g., react-window) to handle large result sets without memory or UI slowdowns.
- The Backup tab shows a fast summary first (counts, estimated bytes) then starts streaming in detailed rows as the diff is computed.
- Each backup target card on the right shows a small badge: `last: 2026-02-10 • 1.2 TiB • parts: 7`.

---

### Backwards/forwards compatibility with the PyQt6 version
- The Backup design is independent of the PyQt6 app. However, the viewer code should expose the same `Photo` model fields when reading from `backup_metadata.sqlite` so the rest of the UI (folder/timeline/map/preview) can work unchanged.
- A migration utility can be provided to translate the PyQt6 JSON caches (if any) into the Electron backup SQLite format.

---

## Next steps & priorities for implementation
- Minimal viable implementation (MVP): scanning + view (left panel + central Folder view) + right panel backup target add/remove + compute diff + create one archive part (no splitting) + write `backup_metadata.sqlite` and thumbnails. Make sure the UI is responsive and runs scanning in a worker thread.
- Iteration 2: archive splitting, pause/resume, multi-target support, UI polish.
- Iteration 3: robust error recovery, more metadata preservation, map integration (read backup GPS EXIF), tests, and packaging.
