# Photo Manager Electron Port

This repository contains the code for the Electron port of the PyQt6 Photo Manager, with an added backup system that writes uncompressed zip container parts and a root-level SQLite cache per backup target.

## Implementation status — Done vs To Do (updated 2026-03-19)

This section maps the original request and design to what has been implemented in this repository so far and what still remains to be done. Use this as the single source of truth while I continue implementing features.

### High-level goal recap
- Port the PyQt6 Photo Manager to Electron and add a backup system that writes uncompressed zip container parts (default max 10 GiB), plus a root-level SQLite cache per backup target so another instance can use the backup as a data source.
- Provide a Backup tab, left workspace panel (grouped by drive/volume), right backup-target panel, non-blocking background processing, robust ArchiveWriter with multi-part rotation, thumbnail cache inside the backup root, and viewer integration.

---

### Features implemented (Done)
- **PyQt6 Feature Port (Mirroring UI)** (Done 2026-03-19)
  - **Folder View**: Collapsible sections for workspaces and subfolders. (Done)
  - **Timeline View**: Sorting by Creation, Modified, Size, and Geolocation. (Done)
  - **Map View**: Interactive Leaflet integration with markers and popups. (Done)
  - **Photo Preview**: Modal with Zoom/Pan, Navigation, and Location Editor. (Done)
  - **Scanner Improvements**: Full EXIF extraction (GPS, Date, Camera). (Done)
  - **Aesthetics**: Premium dark-mode design with glassmorphism. (Done)

- Project scaffold and build basics
  - package.json created with scripts: `dev`, `build:renderer`, `build`, `start`, `test`. (Done)
  - TypeScript config (`tsconfig.json`) set to ES2020. (Done)
  - Vite config for renderer added (`vite.config.ts`). (Done)

- Main process pieces
  - `src/main/main.ts` — Electron main bootstrap with BrowserWindow creation and IPC handlers wired for: `list-backup-targets`, `add-backup-target`, `remove-backup-target`, `start-backup`, `compute-diff`, `scan-folder`, `generate-thumbnails`. (Done)
  - `src/main/db.ts` — SQLite initialization using `better-sqlite3` and the agreed schema (backups, files, thumbnails, display_cache, indexes). (Done)
  - `src/main/backup_manager.ts` — `BackupManager` implemented and extended to:
    - persist a simple list of backup targets under `config/backup_targets.json` and expose list/add/remove methods. (Done)
    - call the `ArchiveWriter` when running a backup job and write a minimal record into `backup_metadata.sqlite` (Done — minimal metadata). (Done)

- Archive writing
  - `src/main/archive_writer.ts` — `ArchiveWriter` implemented to:
    - stream files into uncompressed zip parts (store mode)
    - write parts to `.tmp` filenames and rename atomically to final `.partNNN.zip` on success
    - rotate parts when part-size + next file size > maxPartSizeBytes (default 10 GiB)
    - handle the case where a single file exceeds max part size by creating a stand-alone part for that file (behavior: single-file-in-own-part). (Done)

- Background processing & job queue
  - `src/main/job_queue.ts` — `JobQueue` stub implemented with queueing and `enqueueWorker` support for `worker_threads`. (Done)
  - Worker scripts:
    - `src/main/workers/scanner_worker.js` — recursive filesystem scanner worker that returns file list (Done)
    - `src/main/workers/thumbnail_worker.js` — thumbnail generator using `sharp` that emits per-file events (Done)

- Preload & renderer integration
  - `src/preload/preload.ts` — secure contextBridge exposing the minimal IPC API used by the renderer: list/add/remove targets, scan folder, generate thumbnails, compute diff, start backup, and progress event listeners (Done)
  - Renderer skeleton (React + Vite):
    - `src/renderer/src/index.tsx` and `src/renderer/src/App.tsx` — UI with tabs (Folder/Timeline/Map/Backup), left workspace input + scan button, right backup-target add/remove UI, center Backup controls to start backup & request thumbnailing, and progress display (Done)
    - `src/renderer/index.html` updated for Vite dev module entry (Done)

- Utilities, libs & tests
  - `src/lib/splitter.js` — simple file-to-parts splitter algorithm (Done)
  - `src/lib/diff.js` — a simple compute-diff helper (Done)
  - `tests/test_split_logic.js`, `tests/test_diff.js` — small node tests for splitter & diff (they run with `npm test` and passed locally) (Done)

- README and documentation
  - `README.md` created with basic developer instructions and how to run tests. (Done)
  - `features_pyqt6.md` already contains the full Electron + backup design and architecture (Done earlier). (Done)

---

### Items implemented but intentionally minimal / TODO to enhance
- `BackupManager.runBackup()` currently iterates sources and uses `ArchiveWriter.addFile()` to stream files into parts and writes a minimal `backups` row in SQLite. Improvements needed (see To Do). (Partially Done)
- The `ArchiveWriter` is implemented but annotated as `// @ts-nocheck` in this scaffold to avoid TypeScript/typing noise in this environment; add typed deps and remove `@ts-nocheck` in a follow-up. (Partially Done)
- `JobQueue.enqueueWorker()` spawns worker threads for scanning/thumbnailing; the queue does not yet enforce concurrency limits or priorities. (Partially Done)

---

### Remaining work (To Do)
The following items are next priorities — I can implement them in order you prefer. Each item lists the reason and a short plan.

1) Full per-file DB writes and batched transactions (high priority)
   - Why: `backup_metadata.sqlite` must include one `files` row per archived file (archive part, offset, size, sha256, crc32) for accurate diffs and viewer integration.
   - Plan: During backup, buffer file metadata and write them in transactions (e.g., groups of 1000 rows), compute sha256 optionally (configurable). Insert thumbnails table entries when thumbnails are generated.

2) Thumbnails indexing & storing in `thumbnails/` with DB records (high priority)
   - Why: Viewer must read thumbnails from `backup_root/thumbnails` and map them via `thumbnails` table.
   - Plan: After writing a file to archive, schedule thumbnail creation in `thumbnail_worker.js` (or create a dedicated thumbnail job) and store thumbnail path + sha256 in the DB. Provide `getThumbnail` method in `BackupSqlitePhotoProvider` (future change).

3) Compute-diff implementation using heuristics and optional content-hash mode (high priority)
   - Why: Backup tab diff preview must be accurate and fast.
   - Plan: Implement a two-pass diff: (A) fast compare by rel_path + size + mtime; (B) optionally compute SHA256 for suspicious cases; stream results to renderer via IPC.

4) Robust pause / resume / cancel for backup jobs (medium priority)
   - Why: User may need to pause backups, cancel long backups; we must support cooperative pause/cancel without corrupting archives.
   - Plan: Add JobToken to JobQueue with states (running/paused/cancelled). `ArchiveWriter` will periodically check token and pause file reads; on cancel, gracefully finalize current part and optionally mark job cancelled in DB.

5) Worker concurrency and priority control (medium priority)
   - Why: To avoid saturating CPU or disk. Thumbnails and hashing are CPU-intensive; archive writing should be limited.
   - Plan: Add queue slots: e.g., max 2 archive writers, max 4 thumbnail workers, thumbnail jobs coalesced per folder.

6) Native folder/file pickers & path normalization in the UI (low effort)
   - Why: Text inputs are inconvenient; using `dialog.showOpenDialog` with directories is standard UX.
   - Plan: Add `openFolderDialog` IPC and button in renderer.

7) Crash recovery & tmp-part reclamation (important for reliability)
   - Why: If the app/crash/system kills a backup, `.tmp` parts and DB may be inconsistent.
   - Plan: On app startup inspect backup roots (from stored targets), detect `.tmp` files, and surface a recovery prompt to the user (import/retry/discard). Implement transactions so `backup_metadata.sqlite` only records parts after rename.

8) Viewer integration for backup folders (medium/high)
   - Why: The viewer must treat a backup folder as a workspace using `backup_metadata.sqlite` + `thumbnails/` to display photos.
   - Plan: Implement `PhotoProvider` abstraction and `BackupSqlitePhotoProvider` that reads `files` and `thumbnails` tables.

9) Path normalization / drive grouping / cross-platform drive separation
   - Why: The archive must preserve drive grouping (Windows drive letters, macOS volume names). The UI must group workspaces by these drives.
   - Plan: Implement `VolumeNormalizer` helper used during scan + archiving to create `DRIVE_NAME/<relative_path>` rel_paths in the archive and DB.

10) Performance & disk space checks (pre-backup estimation)
    - Why: Prevent starting backups that will fail due to insufficient disk space.
    - Plan: Before starting backup, estimate total size and ensure `free >= estimated + buffer` or warn the user.

11) Tests & CI (if you want automated checks)
    - Why: Ensure correctness of diff / splitting logic and DB integrity.
    - Plan: Add integration tests that simulate many files with different sizes to validate part rotation and DB writes. (You said you will test UI; still recommend CI for core logic.)

12) Packaging & platform builds
    - Why: Create distributables for macOS/Windows/Linux.
    - Plan: Use `electron-builder` and include the native binary and the renderer build.

13) Optional advanced features
    - Deduplication by hash across sources (store only once) + manifest referencing (advanced)
    - Backup encryption / signing per user requirement (security)
    - Progressive rehydration / selective restore UI

---

### What I updated in the repo just now (summary)
- App-level: wired `ArchiveWriter` into `BackupManager` for multi-part writes.
- Added worker threads for scanning and thumbnail generation and hooked them into `JobQueue` and main IPC.
- Expanded the preload bridge and renderer UI to support the end-to-end demo flow: add/remove backup targets, scan a workspace, generate thumbnails, and start a backup; progress events are streamed to renderer.

---

### Next step I can implement immediately (pick one)
- Implement per-file DB writes and batched transactions during backup (recommended next step). This will make the backups fully queryable and enable compute-diff to work correctly. (Estimated: 1–2 PRs, ~2–6 hours depending on edge-case handling).
- Add pause/resume/cancel logic to the JobQueue/ArchiveWriter (also high value). (Estimated: 4–8 hours.)
- Replace text inputs with native folder pickers and wire improvements to renderer (quick win, ~30–60 min).

Tell me which one you want me to do next (I will proceed right away and update this Markdown file again to reflect progress), or say "do per-file DB writes" and I'll start that now and update the document as I go.

---

### Progress update (added 2026-03-18  — automatic thumbnails during backup)
- Implemented automatic thumbnail generation as part of the backup run: after archive parts finalize, `BackupManager.runBackup()` spawns `thumbnail_worker.js` to create thumbnails for all backed-up files and inserts them into the backup root's `backup_metadata.sqlite` (thumbnails table) as BLOBs using `viewer_db.insertThumbnail()`. (Done)
- This means backup roots now become self-contained datasets: they include `archives/` (file bytes), `backup_metadata.sqlite` (files + thumbnails + display cache), and `thumbnails/` (optional on-disk JPEGs). (Done)

Status mapping update
- Automatic generation of thumbnails during backup and insertion into `<backupRoot>/backup_metadata.sqlite` — Done
- Batch insert per-file metadata during backup — Done

Updated remaining priorities (progressed)
- (Previously To Do #3) Save thumbnails into `backup_metadata.sqlite` during backup runs — Now Done (automatic worker and DB insert implemented)

Next actions I will take automatically (unless you tell me otherwise)
1. Implement optional per-file SHA256 calculation and populate the `files.sha256` column during backup (configurable toggle). This improves diff accuracy and enables dedupe. (Next; I'll start this unless you prefer a different item.)
2. Add optional `archive_offset` recording (investigate archiver capabilities or record in a follow-up using a different zip writer). (Later)
3. Implement pause/resume/cancel semantics for running backup jobs (after content hashing). (Later)

I'll update `features_electron.md` to reflect the automatic thumbnail-in-backup behavior and then re-run the static checks on the project files I edited.

### Clarification: diff behavior (added 2026-03-18)
- `computeDiff` now performs metadata-only comparisons by default (size + mtime). This matches the mirror semantics you requested (Fast, similar to FreeFileSync). SHA256 hashing is optional and only performed when `computeSha256` is explicitly enabled for a backup run.

### New items implemented (2026-03-18)
- Add `backups.status` column to `backup_metadata.sqlite` with values `running|completed|cancelled` and migration for existing DBs. (Done)
- Implement volume fingerprinting and trailing-rel fallback to handle remapped drive letters / mount points across reconnects so identical content isn't duplicated. (Done)
