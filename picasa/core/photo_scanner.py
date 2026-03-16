"""
Photo Scanner - Background scanning of folders for photos and videos
"""
import sqlite3
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict
from PyQt6.QtCore import QObject, QRunnable, pyqtSignal, pyqtSlot
from core.models import Photo
from core.scanner_cache import ScannerCache
from utils.file_utils import is_media_file, get_file_type, is_video_file
from utils.exif_reader import ExifReader


class ScannerSignals(QObject):
    """Signals for a single workspace scan"""
    progress = pyqtSignal(str, int, int)   # workspace_path, current, total
    photo_found = pyqtSignal(str, object)  # workspace_path, Photo
    finished = pyqtSignal(str, list)       # workspace_path, List[Photo]
    error = pyqtSignal(str, str)           # workspace_path, error message


class PhotoScannerTask(QRunnable):
    """Runnable task for scanning one workspace folder in background"""

    def __init__(self, workspace_path: Path, cache: Optional[ScannerCache] = None):
        super().__init__()
        self.workspace_path = workspace_path
        self.cache = cache
        self.signals = ScannerSignals()
        self._is_running = True

    def stop(self):
        self._is_running = False

    @pyqtSlot()
    def run(self):
        photos: List[Photo] = []
        ws_str = str(self.workspace_path)
        print(f"[PhotoScanner] started scanning: {self.workspace_path}")

        conn = None
        if self.cache:
            conn = sqlite3.connect(self.cache.db_path)
            conn.row_factory = sqlite3.Row

        try:
            # 1. Bulk load cache for this workspace
            cached_map = {}
            if self.cache:
                cached_map = self.cache.get_workspace_photos_map(self.workspace_path, conn)

            # 2. Enumerate all media files on disk
            media_files = []
            for file_path in self.workspace_path.rglob("*"):
                if not self._is_running:
                    if conn: conn.close()
                    return
                if any(part.lower().endswith(".app") for part in file_path.parts):
                    continue
                if file_path.is_file() and is_media_file(file_path):
                    media_files.append(file_path)

            total = len(media_files)
            print(f"[PhotoScanner] found {total} media files in {self.workspace_path} "
                  f"({len(cached_map)} cached)")

            if total == 0:
                if self.cache: self.cache.remove_photos_not_in_list(self.workspace_path, [], conn)
                if conn:
                    conn.commit()
                    conn.close()
                self.signals.finished.emit(ws_str, [])
                return

            # 3. Process files (using cache map for O(1) lookups)
            for idx, file_path in enumerate(media_files):
                if not self._is_running:
                    if conn: conn.close()
                    return
                
                try:
                    p_str = str(file_path)
                    cached_photo = cached_map.get(p_str)
                    
                    # Verify cache is still valid (fast size/mtime check)
                    is_valid = False
                    if cached_photo:
                        try:
                            stat = file_path.stat()
                            if cached_photo.size == stat.st_size and \
                               abs(cached_photo.modified_time.timestamp() - stat.st_mtime) < 0.1:
                                is_valid = True
                        except Exception: pass

                    if is_valid:
                        photo = cached_photo
                    else:
                        photo = self._process_file(file_path)
                        if photo and self.cache:
                            self.cache.upsert_photo(photo, conn)
                            # Signal UI that a NEW or CHANGED photo was found
                            self.signals.photo_found.emit(ws_str, photo)
                            if idx % 50 == 0:
                                conn.commit()
                    
                    if photo:
                        photos.append(photo)
                    
                    if idx % 50 == 0 or idx == total - 1:
                        self.signals.progress.emit(ws_str, idx + 1, total)

                except Exception as e:
                    print(f"[PhotoScanner] error processing {file_path}: {e}")

            if self.cache and conn:
                print(f"[PhotoScanner] cleaning stale cache for {ws_str}")
                self.cache.remove_photos_not_in_list(self.workspace_path, media_files, conn)
                conn.commit()

            print(f"[PhotoScanner] scan complete: {len(photos)}/{total} photos processed")
            self.signals.finished.emit(ws_str, photos)

        except Exception as e:
            print(f"[PhotoScanner] fatal error: {e}")
            self.signals.error.emit(ws_str, str(e))
        finally:
            if conn:
                conn.close()

    def _process_file(self, file_path: Path) -> Optional[Photo]:
        try:
            stat = file_path.stat()
            is_video = is_video_file(file_path)
            photo = Photo(
                path=file_path,
                filename=file_path.name,
                size=stat.st_size,
                created_time=datetime.fromtimestamp(stat.st_ctime),
                modified_time=datetime.fromtimestamp(stat.st_mtime),
                is_video=is_video,
                file_type=get_file_type(file_path)
            )
            if not is_video:
                try:
                    exif_data = ExifReader.read_exif(file_path)
                    photo.exif_datetime  = exif_data.get('datetime')
                    photo.gps_latitude   = exif_data.get('gps_latitude')
                    photo.gps_longitude  = exif_data.get('gps_longitude')
                    photo.width          = exif_data.get('width')
                    photo.height         = exif_data.get('height')
                    photo.camera_make    = exif_data.get('camera_make')
                    photo.camera_model   = exif_data.get('camera_model')
                    # Restore location fields persisted by ExifWriter
                    photo.location_city    = exif_data.get('location_city', '')
                    photo.location_county  = exif_data.get('location_county', '')
                    photo.location_state   = exif_data.get('location_state', '')
                    photo.location_country = exif_data.get('location_country', '')
                    photo.location_display = exif_data.get('location_display', '')
                    if photo.location_city or photo.location_state:
                        print(f"[PhotoScanner] restored location for {file_path.name}: "
                              f"{photo.location_city}, {photo.location_state}")
                except Exception as e:
                    print(f"[PhotoScanner] EXIF read failed for {file_path.name}: {e}")
            return photo
        except Exception as e:
            print(f"[PhotoScanner] error building Photo for {file_path}: {e}")
            return None


class PhotoScanner(QObject):
    """Manages per-workspace photo scanning – multiple workspaces scan concurrently."""

    # All signals carry workspace_path as first arg so MainWindow can route them
    progress = pyqtSignal(str, int, int)   # workspace_path, current, total
    photo_found = pyqtSignal(str, object)  # workspace_path, Photo
    finished = pyqtSignal(str, list)       # workspace_path, photos
    error = pyqtSignal(str, str)           # workspace_path, message

    def __init__(self, thread_pool, cache: Optional[ScannerCache] = None):
        super().__init__()
        self.thread_pool = thread_pool
        self.cache = cache
        self._tasks: Dict[str, PhotoScannerTask] = {}

    def scan_workspace(self, workspace_path: Path):
        """Start (or restart) scanning a single workspace."""
        ws_str = str(workspace_path)
        # Stop any existing scan for this workspace
        if ws_str in self._tasks:
            self._tasks[ws_str].stop()

        task = PhotoScannerTask(workspace_path, self.cache)
        task.signals.progress.connect(self.progress.emit)
        task.signals.photo_found.connect(self.photo_found.emit)
        task.signals.finished.connect(self._on_finished)
        task.signals.error.connect(self.error.emit)
        self._tasks[ws_str] = task
        self.thread_pool.start(task)

    def _on_finished(self, ws_str: str, photos: list):
        self._tasks.pop(ws_str, None)
        self.finished.emit(ws_str, photos)

    def stop_workspace(self, workspace_path: Path):
        """Stop scan for a specific workspace."""
        ws_str = str(workspace_path)
        if ws_str in self._tasks:
            self._tasks[ws_str].stop()
            self._tasks.pop(ws_str, None)

    def stop_scan(self):
        """Stop all running scans."""
        for task in self._tasks.values():
            task.stop()
        self._tasks.clear()
