"""
Scanner Cache - Persistent storage for photo metadata to speed up rescanning
"""
import sqlite3
import json
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict
from core.models import Photo

class ScannerCache:
    """Manages a SQLite database for caching Photo metadata"""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        print(f"[ScannerCache] database path: {self.db_path}")
        self._init_db()

    def _init_db(self):
        """Create tables if they don't exist"""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS photos (
                    path TEXT PRIMARY KEY,
                    filename TEXT,
                    size INTEGER,
                    mtime REAL,
                    ctime REAL,
                    exif_datetime TEXT,
                    gps_lat REAL,
                    gps_lon REAL,
                    width INTEGER,
                    height INTEGER,
                    make TEXT,
                    model TEXT,
                    loc_city TEXT,
                    loc_county TEXT,
                    loc_state TEXT,
                    loc_country TEXT,
                    loc_display TEXT,
                    is_video INTEGER,
                    file_type TEXT
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_mtime ON photos(mtime)")

    def get_photo(self, file_path: Path, conn: Optional[sqlite3.Connection] = None) -> Optional[Photo]:
        """Retrieve cached photo metadata if size and mtime match"""
        try:
            stat = file_path.stat()
            size = stat.st_size
            mtime = stat.st_mtime
        except OSError:
            return None

        _conn = conn
        should_close = False
        if _conn is None:
            _conn = sqlite3.connect(self.db_path)
            _conn.row_factory = sqlite3.Row
            should_close = True

        try:
            row = _conn.execute(
                "SELECT * FROM photos WHERE path = ?",
                (str(file_path),)
            ).fetchone()

            if row and row['size'] == size and abs(row['mtime'] - mtime) < 0.1:
                # Cache hit
                photo = Photo(
                    path=file_path,
                    filename=row['filename'],
                    size=row['size'],
                    created_time=datetime.fromtimestamp(row['ctime']),
                    modified_time=datetime.fromtimestamp(row['mtime']),
                    is_video=bool(row['is_video']),
                    file_type=row['file_type']
                )
                if row['exif_datetime']:
                    try:
                        photo.exif_datetime = datetime.fromisoformat(row['exif_datetime'])
                    except: pass
                photo.gps_latitude = row['gps_lat']
                photo.gps_longitude = row['gps_lon']
                photo.width = row['width']
                photo.height = row['height']
                photo.camera_make = row['make']
                photo.camera_model = row['model']
                photo.location_city = row['loc_city'] or ""
                photo.location_county = row['loc_county'] or ""
                photo.location_state = row['loc_state'] or ""
                photo.location_country = row['loc_country'] or ""
                photo.location_display = row['loc_display'] or ""
                return photo
        finally:
            if should_close:
                _conn.close()
        return None

    def upsert_photo(self, photo: Photo, conn: Optional[sqlite3.Connection] = None):
        """Save or update photo metadata in cache"""
        try:
            stat = photo.path.stat()
            mtime = stat.st_mtime
            ctime = stat.st_ctime
        except OSError:
            mtime = photo.modified_time.timestamp()
            ctime = photo.created_time.timestamp()

        _conn = conn
        should_close = False
        if _conn is None:
            _conn = sqlite3.connect(self.db_path)
            should_close = True

        try:
            _conn.execute("""
                INSERT OR REPLACE INTO photos (
                    path, filename, size, mtime, ctime,
                    exif_datetime, gps_lat, gps_lon, width, height,
                    make, model, loc_city, loc_county, loc_state, loc_country, loc_display,
                    is_video, file_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(photo.path),
                photo.filename,
                photo.size,
                mtime,
                ctime,
                photo.exif_datetime.isoformat() if photo.exif_datetime else None,
                photo.gps_latitude,
                photo.gps_longitude,
                photo.width,
                photo.height,
                photo.camera_make,
                photo.camera_model,
                photo.location_city,
                photo.location_county,
                photo.location_state,
                photo.location_country,
                photo.location_display,
                1 if photo.is_video else 0,
                photo.file_type
            ))
            if should_close:
                _conn.commit()
        finally:
            if should_close:
                _conn.close()

    def remove_photos_not_in_list(self, workspace_path: Path, current_paths: List[Path], 
                                  conn: Optional[sqlite3.Connection] = None):
        """Cleanup cache for files no longer present in a workspace"""
        prefix = str(workspace_path)
        path_strs = set(str(p) for p in current_paths)
        
        _conn = conn
        should_close = False
        if _conn is None:
            _conn = sqlite3.connect(self.db_path)
            should_close = True

        try:
            # This could be slow for huge DBs, but okay for thousands
            to_delete = []
            rows = _conn.execute("SELECT path FROM photos WHERE path LIKE ?", (f"{prefix}%",)).fetchall()
            for row in rows:
                if row[0] not in path_strs:
                    to_delete.append(row[0])
            
            if to_delete:
                _conn.executemany("DELETE FROM photos WHERE path = ?", [(p,) for p in to_delete])
                if should_close:
                    _conn.commit()
        finally:
            if should_close:
                _conn.close()

    def get_workspace_photos_map(self, workspace_path: Path,
                                 conn: Optional[sqlite3.Connection] = None) -> Dict[str, Photo]:
        """Bulk load all cached photos for a workspace into a dict {path_str: Photo}"""
        prefix = str(workspace_path)
        result = {}
        _conn = conn or sqlite3.connect(self.db_path)
        if conn is None: _conn.row_factory = sqlite3.Row

        try:
            cursor = _conn.execute("SELECT * FROM photos WHERE path LIKE ?", (f"{prefix}%",))
            for row in cursor:
                p_path = Path(row['path'])
                photo = Photo(
                    path=p_path,
                    filename=row['filename'],
                    size=row['size'],
                    created_time=datetime.fromtimestamp(row['ctime']),
                    modified_time=datetime.fromtimestamp(row['mtime']),
                    is_video=bool(row['is_video']),
                    file_type=row['file_type']
                )
                if row['exif_datetime']:
                    try: photo.exif_datetime = datetime.fromisoformat(row['exif_datetime'])
                    except: pass
                # Populate other fields...
                photo.gps_latitude = row['gps_lat']; photo.gps_longitude = row['gps_lon']
                photo.width = row['width']; photo.height = row['height']
                photo.location_city = row['loc_city'] or ""; photo.location_state = row['loc_state'] or ""
                photo.location_country = row['loc_country'] or ""; photo.location_display = row['loc_display'] or ""
                result[row['path']] = photo
        finally:
            if conn is None: _conn.close()
        return result

    def get_workspace_photos(self, workspace_path: Path,
                             conn: Optional[sqlite3.Connection] = None) -> List[Photo]:
        """Get all cached photos for a given workspace prefix (optimized bulk load)"""
        return list(self.get_workspace_photos_map(workspace_path, conn).values())
