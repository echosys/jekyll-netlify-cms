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
- Adding a new workspace **immediately triggers a scan** (fixed signal-blocking bug)

---

## Scanning
- Runs entirely in background `QRunnable` threads — UI never freezes
- **Per-workspace independent scanners** — adding workspace2 never cancels workspace1
- Phase 1: enumerate all media files (rglob) — progress bar shows indeterminate spinner
- Phase 2: process files (stat + EXIF) — progress bar shows `current/total`
- Incremental UI updates every 20 photos during scan
- Status bar shows `"Scanning <name>… counting files…"` immediately on add
- Supported image extensions: `.jpg .jpeg .png .gif .bmp .tiff .tif .webp .heic .heif .raw .cr2 .nef .arw .dng`
- Supported video extensions: `.mp4 .mov .avi .mkv .wmv .flv .webm .m4v .mpg .mpeg`

---

## Thumbnail Cache
- Generated in background workers (never blocks main thread)
- Stored as JPEG on disk; keyed by `hash(path)_mtime.jpg`
- **RGBA / palette / greyscale → converted to RGB** before JPEG save
- Files **> 500 MB** skipped; a labelled grey default tile shown instead
- `Image.MAX_IMAGE_PIXELS = 300_000_000` (300 MP decompression bomb limit)
- Signal `ThumbnailSignals.ready(path, pixmap)` always delivered **asynchronously** (after widget dict populated)

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
   - **New GPS coords or empty-cached** → calls Nominatim reverse-geocode API (rate-limited at 1 req/s), stores result in cache **only if non-empty**.
   - **No GPS** → skipped.
4. Each geocoded photo emits a signal → `MainWindow._on_photo_geocoded` → updates the canonical `Photo` object directly via `_path_to_photo` index (O(1)) → forwards to `TimelineView`.
5. `LocationScannerWorker` also calls `ExifWriter.write_location()` for every non-empty result, persisting the location to the JPEG file on disk — so **next restart reads location from EXIF directly** without any network calls.
6. `PhotoScanner` reads `location_city/state/country` from EXIF `UserComment` JSON on every scan (via `ExifReader._read_location_comment`).

### Geocode Cache — poisoning protection
- `has()` and `get_cached()` return `False`/`None` for entries where all of city/state/country are empty
- Results are only persisted to `geocode_cache.json` if at least one field is non-empty
- `purge_empty()` runs automatically on cache load to evict stale empty entries from previous failed runs

### Location Persistence (EXIF)
- `ExifWriter.write_location(path, lat, lon, city, county, state, country, display)` writes:
  1. **GPS IFD** — only `GPSLatitude/Ref` and `GPSLongitude/Ref` are updated; **all other existing GPS tags** (altitude, bearing, speed, DOP, satellites, etc.) are **preserved**. The GPS IFD is never replaced wholesale.
  2. **UserComment** (EXIF tag `0x9286`) — JSON blob `{"_picasa_location": true, "city": ..., "state": ..., "country": ..., "display": "...full Nominatim display_name..."}` with `ASCII\x00\x00\x00` header
- Original GPS coordinates from the camera are **never altered** — `lat`/`lon` passed to `write_location` always come from `p.gps_latitude`/`p.gps_longitude` (read from the file), not from any external source
- Supported only for JPEG (`.jpg`/`.jpeg`); silently skipped for RAW/PNG/HEIC
- Skip write if `photo.location_city` is already populated (avoids redundant disk writes)

### Proxy Resolution (geocoding)
`MainWindow._get_proxy_url()` priority order:
1. `config["map_proxy"]` — explicit config value
2. `HTTPS_PROXY` env var
3. `HTTP_PROXY` env var (applied to both http **and** https — corporate proxies are often only set here)
4. `https_proxy` / `http_proxy` lowercase variants
5. Empty string → no proxy

### Location Grouping Rules
- Photos sorted **newest-first** before grouping.
- A new group starts when **any** of these conditions are met:
  - The photo's **state** differs from the current group's state AND the group has ≥ 30 photos.
  - The photo's date is **> 6 months** before the first photo in the current group.
- Photos **without location data** (no GPS, or geocode pending) stay in the current group.
- **Example**: Photos from Chandler AZ + Tempe AZ → same group (same state). First photo from Miami FL after ≥ 30 AZ photos → new group.

### Group Header
- Shows **top-3 city names** by frequency + state, joined with `·`
  - e.g. `Chandler  ·  Tempe  ·  Arizona`
  - Falls back to `Unknown Location` if no geocode data yet.

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
- Disappears automatically when complete

### Proxy Support
- Uses `map_proxy` config setting if set, otherwise auto-detects `HTTPS_PROXY` / `HTTP_PROXY` env vars (system proxy)

### Geocode Cache
- Stored at `config/<hostname>/geocode_cache.json`
- Key: `lat,lon` rounded to 3 decimal places (~100 m precision)
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
| `true` (default) | All JS/CSS inlined into HTML (~673KB) | Offline, behind firewall, no proxy |
| `false` (CDN) | Raw folium HTML, CDN URLs loaded by WebEngine | If you prefer fresh CDN versions |

### Proxy support (config `map_proxy`)
- Auto-detected from `HTTPS_PROXY` / `HTTP_PROXY` env vars if not set in config
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
Dependencies (install once):
```bash
pip install PyQt6 Pillow piexif imageio requests
```

