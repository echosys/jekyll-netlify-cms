# 20260305 Debug – Thumbnail UI Freeze & Config Path

## Issues Fixed

### 1. Config & Cache stored outside the repo
**Problem:** Config and thumbnails were written to the system's `AppConfigLocation` (`~/Library/Application Support/…`) making it hard to find and non-portable per machine.

**Fix:** `utils/config_manager.py`  
- Removed `QStandardPaths` dependency.  
- Config now written to `<repo>/config/<machine_hostname>/config.json`  
- Thumbnail cache written to `<repo>/cache/<machine_hostname>/thumbnails/`  
- Both `config/` and `cache/` added to `.gitignore`.

---

### 2. UI freezes while generating thumbnails
**Problem:** `ThumbnailCache.get_thumbnail()` was called synchronously inside `FolderView.refresh_view()`, blocking the Qt main thread while PIL decoded every image.

**Fix:** `core/thumbnail_cache.py` + `ui/folder_view.py`

- Added `ThumbnailSignals(QObject)` with a `ready(path, QPixmap)` signal.
- Added `ThumbnailTask(QRunnable)` – generates one thumbnail off the main thread, then emits `ready`.
- Added `ThumbnailCache.request_thumbnail_async(path, thread_pool, signals)` – queues a `ThumbnailTask`; returns cached pixmap immediately if already on disk.
- `FolderView` now:
  - Renders grey placeholder tiles immediately (no PIL call on main thread).
  - Queues async generation for every photo via `request_thumbnail_async`.
  - Slots `_on_thumbnail_ready` swaps the placeholder with the real thumbnail when the worker finishes.

---

### 3. `cannot write mode RGBA as JPEG`
**Problem:** PNG files with transparency (mode `RGBA`) were saved directly as JPEG, which JPEG does not support.

**Fix:** `core/thumbnail_cache.py` `_gen_image()`  
```python
if img.mode != 'RGB':
    img = img.convert('RGB')
```
Handles `RGBA`, `P` (palette), `L` (greyscale), `CMYK`, etc. before saving.

---

### 4. Decompression bomb (180 MP image)
**Problem:** PIL raised `DecompressionBombError` for images > ~178 MP.

**Fix:** `core/thumbnail_cache.py` – raised the limit at module load:
```python
Image.MAX_IMAGE_PIXELS = 300_000_000   # 300 MP
```
Images larger than this still get a `DecompressionBombWarning` but will open. Truly pathological files (>300 MP) are caught by the `except` and skipped.

---

### 5. No feedback when workspace is first added
**Problem:** After clicking "Add Workspace" there was no visual indicator until the file count arrived (could be several seconds on large trees).

**Fix:** `ui/main_window.py` + `ui/folder_view.py`

- `scan_workspaces()` now immediately:
  - Calls `folder_view.show_scanning_indicator()` → shows "⏳ Scanning workspace, please wait…"
  - Sets the progress bar to **indeterminate** mode (`setMaximum(0)`)
  - Sets status bar to `"Scanning <name>…  counting files…"`
- Once `on_scan_progress` fires with the real `total`, the progress bar switches to determinate mode automatically (`setMaximum(total) > 0`).

---

## Files Changed
| File | Change |
|---|---|
| `utils/config_manager.py` | Repo-local config/cache paths |
| `core/thumbnail_cache.py` | Async generation, RGBA fix, bomb limit |
| `ui/folder_view.py` | Placeholder tiles, async slot, scanning indicator |
| `ui/main_window.py` | Pass thread_pool to FolderView, immediate feedback |
| `.gitignore` | Added `cache/` |

## All markdown files renamed to convention
```
20260305debug_workspace_toggle_error.md
20260305feature_photo_management_app.md
20260305plan_photo_management_app.md
20260305plan_project_summary.md
20260305plan_quickstart.md
20260305plan_readme.md
20260305plan_start_here.md
20260305debug_thumbnail_freeze_config_path.md  ← this file
```

