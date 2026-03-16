# Electron Backup + Viewer Cache (Design)

This document explains how the Electron app stores viewer cache and backup cache, where thumbnails live, and how zip parts are written so that anybody can open them with 7-Zip and view the original folder structure.

## Cache locations
- App viewer cache (per-machine): stored under `config/<hostname>/viewer_cache.sqlite` and `cache/<hostname>/thumbnails/` for legacy file thumbnails. The canonical viewer cache is now an SQLite database (`viewer_cache.sqlite`) that contains the thumbnail binary (BLOB) in a `thumbnails` table.
- Backup cache (per backup root): stored inside the backup root. Each backup target root contains:
  - `backup_metadata.sqlite` — the canonical metadata and viewer cache for that backup root. It contains the `backups`, `files`, `thumbnails`, and `display_cache` tables.
  - `thumbnails/` — optional on-disk thumbnails written during backup run; thumbnails are also stored inside `backup_metadata.sqlite` as BLOBs to make the cache self-contained.
  - `archives/` — the `.partNNN.zip` files containing the archived file bytes (store mode, uncompressed).

## Why thumbnails in SQLite?
- Storing thumbnails as BLOBs inside the viewer/backup SQLite databases ensures the viewer can show thumbnails instantly without coordinating file paths across machines.
- For backup roots, having thumbnails inside `backup_metadata.sqlite` means another instance of the app (or a user) can mount the backup folder and view thumbnails without extracting archives or copying sidecar files.
- We still optionally write thumbnail JPEG files into `thumbnails/` for faster OS-level preview or external use.

## Viewer vs Backup cache semantics
- Workspace added in left panel (viewer mode): the app uses the app-local viewer cache (`config/<hostname>/viewer_cache.sqlite`) to store thumbnails and derived metadata.
- Backup target added in right panel: the app stores per-backup-cache entries in `<backupRoot>/backup_metadata.sqlite` (thumbnails as BLOBs and file metadata), and also writes `archives/` and `thumbnails/` on disk. The viewer can read from both sources using the same PhotoProvider abstraction.

## Archive layout & user expectations (7-Zip compatibility)
- Each archive part is a regular zip file containing full path entries (e.g. `C/Users/me/Pictures/Vacation/IMG001.jpg` on Windows; `MacintoshHD/Users/me/Pictures/...` on macOS). The archive entries preserve the folder structure inside the zip.
- Parts are independent zip files; each part includes a subset of files with their original relative folder paths preserved. Opening a single `.partNNN.zip` in 7-Zip shows the folder subset for that part. To reconstruct the entire dataset, extract all parts into the same destination folder.
- Naming & rotation:
  - Base name: `backup_<timestamp>.partNNN.zip` (e.g. `backup_20260318T103012.part001.zip`).
  - Each file entry has a path that begins with the normalized drive/volume label and the relative path from the drive root or workspace root: `DRIVE_NAME/<relative_path>`.
  - If a file must go into a new part due to size constraints, the entries continue in the new part; the rel_paths may repeat across parts but that reflects the dataset distribution.

## How diffs and viewer use backup SQLite
- The viewer reads `backup_metadata.sqlite` for `files` and `thumbnails` tables to list and display photos without extracting archives.
- The backup `files` table records `rel_path` (path inside the archive), `archive_part`, `size`, `mtime`, and optionally `sha256`.
- The diff algorithm compares workspace snapshot (size+mtime, optionally sha256) vs `files` table entries to determine New/Modified/Identical.

## Diff policy and hashing
- Default behavior: compute diffs using metadata only (file size + mtime). This mirrors behavior you described (like FreeFileSync) and is fast. The `computeDiff` API compares the scanned files (metadata) against the latest backup's `files` table entries and classifies files into New / Modified / Identical / Deleted.
- Optional hashing: `computeSha256` is available as an option during backup runs and is off by default. When enabled, SHA256 values are computed and recorded in `files.sha256`, and can be used for stronger comparisons or deduplication. However it's not used by default for diffs to match the expected fast metadata-based workflow.

## Developer notes & current implementation
- The app scaffold includes `src/main/viewer_db.ts` (SQLite helper) and main process IPC endpoints `generate-thumbnails` and `list-thumbnails` that accept a `cacheDbPath` to decide where to store thumbnails (workspace viewer cache or backup root cache).
- The renderer exposes buttons to view workspace cache and backup cache thumbnails (modal). Use these for quick verification.

## Options
- `computeSha256` (optional, default false): when enabled for a backup run, the backup process computes a SHA256 hash for each file (using a streaming read) and stores it in `files.sha256`. This makes cross-checks, deduplication, and diffs by content reliable but slows backups (IO + CPU).

## Thumbnail generation during backup
- After archive parts finalize, the backup process spawns the thumbnail worker which writes thumbnails to `<backupRoot>/thumbnails/` and inserts the thumbnail binary into `<backupRoot>/backup_metadata.sqlite` (`thumbnails` table) so the backup root becomes a self-contained viewer cache.

## Resume, status and drive remapping

- backups.status
  - Each backup row in `backup_metadata.sqlite` now has a `status` column with one of: `running`, `completed`, or `cancelled`. The app sets `running` at job create time, `completed` when the run finishes normally, and `cancelled` when the user cancels mid-run or the job is stopped. This makes it easy to see partial runs and recovery points.

- Drive remapping / volume fingerprinting (handle changing drive letters)
  - Problem: removable drives (external HDDs) may mount with different drive letters (Windows) or different mount points (macOS) across reconnects. Storing archive entries prefixed by the drive letter/volume name verbatim would cause identical content to appear as new files when the drive is remounted with a different letter.
  - Solution implemented in the app:
    - During both diff and backup runs the app computes a lightweight volume fingerprint for each source mount point. The fingerprint strategy:
      1. Primary: try to read `fs.stat(path).dev` (device id) when available — stable across remounts on many platforms.
      2. Fallback: sample up to N (20) top-level entries at the root of the mount and hash their names/types into a short fingerprint string. This gives a reasonably stable fingerprint for the same filesystem content even if the OS assigns a different drive letter.
    - The app uses the fingerprint as the volume prefix inside archive entries (instead of raw drive letter). Example: `dev_12345/Photos/IMG001.JPG` or `hash_abcdef123456/Photos/IMG001.JPG`.
    - On diff, the app builds a `driveFingerprintMap` for the currently connected mounts and uses it to match incoming scanned file paths to entries already recorded in `files.rel_path` of the latest backup. If no direct fingerprint match is found, the app performs a safe fallback match by trailing relative path only (ignoring the volume prefix) to detect identical files across different drive prefixes. This reduces false positives when a drive letter changed but the content is the same.

- Limitations & tradeoffs
  - The fingerprint fallback (sampling root entries) is heuristics-based and may not be 100% stable in some edge cases (identical-looking but different drives). It strikes a balance between robustness and not requiring platform-specific volume serial APIs.
  - If you need absolute guarantee across all platforms, we can extend the fingerprinting to use platform-specific APIs (Windows volume serial via powershell/wmi or Win32 API, macOS diskutil info, or reading UUIDs from /dev/disk*). That requires extra native calls and cross-platform branches.

- User-visible behavior
  - If you disconnect an external drive and later reconnect it with a different drive letter, the app will (in most cases) recognize the underlying volume as the same and treat files as identical (skip re-copying). If the heuristic fails, the fallback trailing-rel comparison will still often detect identical files.
  - Cancelled runs are marked `cancelled` in `backups.status`. On the next backup run, `computeDiff` will use the DB rows for already-recorded files and only process remaining files.

## Next improvements
- Full per-file DB writes during backup (batched inserts), compute sha256 optionally, and record `archive_offset` for fast extraction. (Planned)
- Pause/resume cancel for backups and improved worker concurrency controls. (Planned)
- Native folder pickers and path normalization improvements for cross-platform volume naming. (Planned)
