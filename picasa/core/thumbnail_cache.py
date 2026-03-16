"""
Thumbnail Cache - Generate and cache thumbnails for photos and videos
"""
from pathlib import Path
from typing import Optional
from PIL import Image, ImageOps
from PyQt6.QtGui import QPixmap, QPainter, QColor, QFont
from PyQt6.QtCore import QObject, QRunnable, pyqtSignal, pyqtSlot, Qt, QRect
from utils.file_utils import is_video_file

# Allow large images – raise the decompression bomb limit
Image.MAX_IMAGE_PIXELS = 300_000_000

# Max file size we'll attempt to thumbnail (bytes). Above this → default thumb.
_MAX_FILE_BYTES = 500 * 1024 * 1024   # 500 MB


def _make_default_pixmap(size: int, label: str = "?") -> QPixmap:
    """Create a simple grey placeholder with a centred label."""
    pm = QPixmap(size, size)
    pm.fill(QColor("#c8c8c8"))
    painter = QPainter(pm)
    painter.setPen(QColor("#666666"))
    font = QFont()
    font.setPixelSize(size // 4)
    font.setBold(True)
    painter.setFont(font)
    painter.drawText(QRect(0, 0, size, size), Qt.AlignmentFlag.AlignCenter, label)
    painter.end()
    return pm


import hashlib

def _get_thumb_name(photo_path: Path) -> str:
    """Generate a stable, unique filename for a photo's thumbnail."""
    mtime = photo_path.stat().st_mtime if photo_path.exists() else 0
    # Use MD5 of the path to be deterministic across Python processes/runs
    h = hashlib.md5(str(photo_path).encode('utf-8')).hexdigest()
    return f"{h}_{int(mtime)}.jpg"

class ThumbnailSignals(QObject):
    """Signals emitted when async thumbnail generation completes"""
    ready = pyqtSignal(object, object)  # photo_path (Path), QPixmap


class ThumbnailTask(QRunnable):
    """Background task that generates a single thumbnail"""

    def __init__(self, photo_path: Path, thumb_path: Path,
                 thumbnail_size: int, signals: ThumbnailSignals):
        super().__init__()
        self.photo_path = photo_path
        self.thumb_path = thumb_path
        self.thumbnail_size = thumbnail_size
        self.signals = signals
        self.setAutoDelete(True)

    @pyqtSlot()
    def run(self):
        pixmap = None
        # Last-second check in case another thread just finished it
        if self.thumb_path.exists():
            try:
                pixmap = QPixmap(str(self.thumb_path))
            except: pass
            
        if not pixmap or pixmap.isNull():
            pixmap = _generate_thumbnail(self.photo_path, self.thumb_path, self.thumbnail_size)
            
        if pixmap is None:
            # Generation failed – use a labelled default so the tile is never blank
            ext = self.photo_path.suffix.upper().lstrip('.') or '?'
            pixmap = _make_default_pixmap(self.thumbnail_size, ext)
        self.signals.ready.emit(self.photo_path, pixmap)


class ThumbnailCache:
    """Manages thumbnail generation and caching"""

    def __init__(self, cache_dir: Path, thumbnail_size: int = 200):
        self.cache_dir = cache_dir
        self.thumbnail_size = thumbnail_size
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def get_thumbnail_path(self, photo_path: Path) -> Path:
        """Get the path where thumbnail should be stored"""
        return self.cache_dir / _get_thumb_name(photo_path)

    def get_thumbnail(self, photo_path: Path) -> Optional[QPixmap]:
        """Return cached thumbnail synchronously (None if not yet cached)."""
        thumb_path = self.get_thumbnail_path(photo_path)
        if thumb_path.exists():
            try:
                pixmap = QPixmap(str(thumb_path))
                if not pixmap.isNull():
                    return pixmap
            except Exception:
                pass
        return None

    def request_thumbnail_async(self, photo_path: Path,
                                thread_pool,
                                signals: ThumbnailSignals):
        """Load thumbnail from disk cache immediately (no thread) or queue generation.

        If the thumbnail JPEG already exists on disk we load it synchronously --
        reading a small JPEG from local storage is fast enough that spawning a
        thread just adds overhead and produces noisy log spam.  Only when the
        thumbnail is absent do we hand off to the thread pool for full generation.
        """
        thumb_path = self.get_thumbnail_path(photo_path)

        if thumb_path.exists():
            # Fast path: load cached thumbnail without a worker thread
            try:
                pixmap = QPixmap(str(thumb_path))
                if not pixmap.isNull():
                    signals.ready.emit(photo_path, pixmap)
                    return
            except Exception:
                pass  # Fall through to worker if load fails

        # Slow path: thumbnail doesn't exist yet – generate it in background
        task = ThumbnailTask(photo_path, thumb_path, self.thumbnail_size, signals)
        thread_pool.start(task)

    def clear_cache(self):
        """Clear all cached thumbnails"""
        for thumb_file in self.cache_dir.glob("*.jpg"):
            try:
                thumb_file.unlink()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Module-level helper (runs in worker threads – no Qt widgets allowed here)
# ---------------------------------------------------------------------------

def _generate_thumbnail(photo_path: Path, thumb_path: Path,
                        thumbnail_size: int) -> Optional[QPixmap]:
    try:
        file_size = photo_path.stat().st_size
        if file_size > _MAX_FILE_BYTES:
            print(f"[ThumbnailCache] skipping oversized file ({file_size // 1024 // 1024} MB): "
                  f"{photo_path.name} – using default thumbnail")
            return None   # caller will substitute default pixmap

        print(f"[ThumbnailCache] generating thumbnail for: {photo_path.name}")
        if is_video_file(photo_path):
            return _gen_video(photo_path, thumb_path, thumbnail_size)
        else:
            return _gen_image(photo_path, thumb_path, thumbnail_size)
    except Exception as e:
        print(f"[ThumbnailCache] error for {photo_path.name}: {e}")
        return None


def _gen_image(image_path: Path, thumb_path: Path,
               thumbnail_size: int) -> Optional[QPixmap]:
    try:
        img = Image.open(image_path)

        # Respect EXIF orientation
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass

        # Always convert to RGB before saving as JPEG (handles RGBA, P, L, etc.)
        if img.mode != 'RGB':
            print(f"[ThumbnailCache] converting mode {img.mode}→RGB for {image_path.name}")
            img = img.convert('RGB')

        img.thumbnail((thumbnail_size, thumbnail_size), Image.Resampling.LANCZOS)
        img.save(thumb_path, 'JPEG', quality=85)
        print(f"[ThumbnailCache] thumbnail saved: {thumb_path.name}")
        return QPixmap(str(thumb_path))

    except Exception as e:
        print(f"[ThumbnailCache] _gen_image failed for {image_path.name}: {e}")
        return None


def _gen_video(video_path: Path, thumb_path: Path,
               thumbnail_size: int) -> Optional[QPixmap]:
    try:
        import imageio.v3 as iio
        frame = iio.imread(video_path, index=0)
        img = Image.fromarray(frame)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        img.thumbnail((thumbnail_size, thumbnail_size), Image.Resampling.LANCZOS)
        img.save(thumb_path, 'JPEG', quality=85)
        print(f"[ThumbnailCache] video thumbnail saved: {thumb_path.name}")
        return QPixmap(str(thumb_path))
    except Exception as e:
        print(f"[ThumbnailCache] _gen_video failed for {video_path.name}: {e}")
        return None

