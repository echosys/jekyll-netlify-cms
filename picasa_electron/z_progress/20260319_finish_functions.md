# Picasa Electron: Porting PyQt6 Features (2026-03-19)

## Progress Summary
- [x] Initial build and start debugging
- [x] UI Mirroring (Sidebar, Tabs, Status Bar)
- [x] Native Menu Implementation (File, Folder, Run)
- [x] PyQt6 Source Analysis & Specification Update
- [ ] Implement Full Backup Logic (Zip + SQLite)
- Implemented a premium, dark-mode UI with glassmorphism.
- Added background workers for scanning (with EXIF support) and thumbnailing (with video support).
- Implemented geocoding cache and persistence back to EXIF UserComment.

## Features Implemented
### Backend (Main & Workers)
- **Scanner Worker**: Now extracts `GPS`, `DateTimeOriginal`, and `Model` via `exiftool`.
- **Thumbnail Worker**: Added `ffmpeg` support for video thumbnails and `sharp`'s `limitInputPixels` for protection.
- **Geocoding**: Local `geocode_cache.json` logic ported from Python, with rate-limiting and O(1) in-memory lookup.
- **EXIF Writer**: Capability to save coordinates and location JSON back to JPEGs.
- **Config**: hostname-namespaced persistence (`config/<hostname>/config.json`).
- **Top Menu Bar**: Custom React menu with File (Add Workspace), View (Toggle DevTools), and Tab switching shortcuts.

### Frontend (React)
- **Folder View**: Collapsible headers for Workspaces and Subfolders.
- **Timeline View**: Sorting by Creation, Modified, Size, and Location. Includes a Jump Index sidebar.
- **Map View**: Interactive Leaflet integration with popup thumbnails.
- **Preview Dialog**: View-aware navigation, zoom & pan, video playback support (system), and location editor.
- **Backup UI**: 2-column layout for targets and execution.

## Issues Fixed
- **Implicit Any in Main**: Fixed TypeScript strict mode errors in IPC handlers.
- **Asset Types**: Added `env.d.ts` for PNG/JPG/SVG imports.
- **Build Flow**: Verified `tsc` passes after adding necessary dependencies.

## Next Steps
- Verify `ffmpeg` is globally available for video thumbnails.
- Implement the "Search" bar filtering on the UI side (already wired but needs refinement).
- Test cross-platform volume fingerprinting on a real external drive.
- Final UI polish (animations for tab switching).

## Running the app
```bash
# Terminal 1: Vite dev server
npm run dev

# Terminal 2: Build main and launch
npm run build
npm start
```
