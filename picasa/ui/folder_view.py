"""
Folder View - Hierarchical display of photos organized by workspace → folder
"""
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QScrollArea, QLabel,
                              QGridLayout, QHBoxLayout,
                              QSizePolicy)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QPixmap, QColor
from pathlib import Path
from typing import List, Dict, Optional
from collections import defaultdict, OrderedDict
from core.models import Photo
from core.thumbnail_cache import ThumbnailCache, ThumbnailSignals

_THUMB_SIZE = 200
_PLACEHOLDER_COLOR = "#2e2e2e"   # dark neutral – visible on both Win & macOS
_TILE_BG     = "#1e1e1e"         # dark tile background
_TILE_BORDER = "#3a3a3a"         # subtle border
_TILE_BG_LOADED = "#252525"      # slightly lighter once image loaded
_MAX_LABEL_CHARS = 24


def _fmt_size(size_bytes: int) -> str:
    for unit, threshold in (("GB", 1 << 30), ("MB", 1 << 20), ("KB", 1 << 10)):
        if size_bytes >= threshold:
            return f"{size_bytes / threshold:.1f} {unit}"
    return f"{size_bytes} B"


def _truncate(name: str, max_chars: int = _MAX_LABEL_CHARS) -> str:
    if len(name) <= max_chars:
        return name
    # Truncate middle if it looks like a long path or name
    mid = max_chars // 2
    return name[:mid-1] + "…" + name[-(mid-1):]


# ---------------------------------------------------------------------------
# PhotoThumbnail
# ---------------------------------------------------------------------------

class PhotoThumbnail(QWidget):
    """Thumbnail tile: image placeholder + filename label, rich tooltip."""

    clicked = pyqtSignal(object)

    def __init__(self, photo: Photo, parent=None):
        super().__init__(parent)
        self.photo = photo

        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(3)

        # Image label
        self._img_label = QLabel()
        pm = QPixmap(_THUMB_SIZE, _THUMB_SIZE)
        pm.fill(QColor(_PLACEHOLDER_COLOR))
        self._img_label.setPixmap(pm)
        self._img_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._img_label.setFixedSize(_THUMB_SIZE, _THUMB_SIZE)
        self._img_label.setStyleSheet(f"background: {_PLACEHOLDER_COLOR}; border: none;")
        layout.addWidget(self._img_label)

        # Filename label
        name_lbl = QLabel(_truncate(photo.filename))
        name_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        name_lbl.setStyleSheet(
            f"font-size: 11px; color: #d0d0d0; background: transparent; border: none;")
        name_lbl.setFixedWidth(_THUMB_SIZE)
        layout.addWidget(name_lbl)

        # Rich tooltip
        dt = photo.get_display_time()
        tooltip = (f"<b>{photo.filename}</b><br>"
                   f"Size: {_fmt_size(photo.size)}<br>"
                   f"Date: {dt.strftime('%Y-%m-%d %H:%M:%S')}")
        self.setToolTip(tooltip)

        self.setStyleSheet(
            f"PhotoThumbnail {{ border: 1px solid {_TILE_BORDER}; background: {_TILE_BG}; }}"
        )
        self.setFixedSize(_THUMB_SIZE + 10, _THUMB_SIZE + 30)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def set_pixmap(self, pixmap: Optional[QPixmap]):
        if pixmap and not pixmap.isNull():
            self._img_label.setPixmap(pixmap.scaled(
                _THUMB_SIZE, _THUMB_SIZE,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation))
            self._img_label.setStyleSheet("background: transparent; border: none;")
            self.setStyleSheet(
                f"PhotoThumbnail {{ border: 1px solid {_TILE_BORDER}; background: {_TILE_BG_LOADED}; }}")

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self.photo)


# ---------------------------------------------------------------------------
# Collapsible section header (used for both workspace and sub-folder bars)
# ---------------------------------------------------------------------------

class CollapsibleHeader(QWidget):
    """A clickable header bar that toggles a content widget's visibility."""

    def __init__(self, title: str, content_widget: QWidget,
                 bg_color: str, text_color: str = "white",
                 font_size: int = 13, indent_px: int = 0,
                 parent=None):
        super().__init__(parent)
        self._content = content_widget
        self._collapsed = False

        layout = QHBoxLayout(self)
        layout.setContentsMargins(indent_px, 2, 6, 2)
        layout.setSpacing(4)

        self._arrow = QLabel("▼")
        self._arrow.setFixedWidth(18)
        self._arrow.setStyleSheet(f"color: {text_color}; background: transparent;")
        layout.addWidget(self._arrow)

        lbl = QLabel(title)
        lbl.setStyleSheet(f"color: {text_color}; background: transparent; "
                          f"font-weight: bold; font-size: {font_size}px;")
        lbl.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        layout.addWidget(lbl)

        self.setStyleSheet(f"CollapsibleHeader {{ background: {bg_color}; }}")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFixedHeight(34)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._collapsed = not self._collapsed
            self._arrow.setText("▶" if self._collapsed else "▼")
            self._content.setVisible(not self._collapsed)


# ---------------------------------------------------------------------------
# FolderSection  – one sub-folder inside a workspace section
# ---------------------------------------------------------------------------

class FolderSection(QWidget):
    """Shows photos for a single folder under a workspace."""

    def __init__(self, folder_path: str, level: int, parent=None):
        super().__init__(parent)
        self.folder_path = folder_path
        self._thumb_widgets: Dict[str, PhotoThumbnail] = {}

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        # Content widget holds the grid
        self._content = QWidget()
        self._grid_layout = QGridLayout(self._content)
        self._grid_layout.setSpacing(8)
        self._grid_layout.setContentsMargins(8, 8, 8, 8)

        # Depth-based colours: slightly lighter per level
        shade = min(0x5a + level * 0x10, 0xaa)
        bg = f"#{0x3a:02x}{shade:02x}{0x3a:02x}"
        indent = level * 16
        display_name = folder_path
        if Path(folder_path).is_absolute():
            try:
                # We'll rely on the caller passing a nicely formatted name 
                # or we convert it here if we had the workspace root.
                pass 
            except: pass

        self._header = CollapsibleHeader(
            display_name, self._content,
            bg_color=bg, font_size=max(11, 13 - level),
            indent_px=indent)

        outer.addWidget(self._header)
        outer.addWidget(self._content)

    # Public
    def get_thumb_widgets(self) -> Dict[str, PhotoThumbnail]:
        return self._thumb_widgets

    def populate(self, photos: List[Photo], photo_clicked_signal,
                 thumbnail_cache: ThumbnailCache, thread_pool,
                 thumb_signals: ThumbnailSignals):
        """Update photos incrementally without clearing the whole grid."""
        current_photos = {str(p.path): p for p in photos}
        existing_paths = set(self._thumb_widgets.keys())
        target_paths = set(current_photos.keys())

        # 1. Remove widgets for photos no longer present
        for path in existing_paths - target_paths:
            thumb = self._thumb_widgets.pop(path)
            self._grid_layout.removeWidget(thumb)
            thumb.deleteLater()

        # 2. Add widgets for new photos
        new_paths = target_paths - existing_paths
        if new_paths:
            # Rebuild order (unfortunately QGridLayout needs manual row/col management)
            # For simplicity, if anything new comes, we rebuild the layout positions
            # but KEEP the existing widgets to avoid expensive re-creation.
            
            # Sort all photos to maintain consistent order
            sorted_photos = sorted(photos, key=lambda p: p.filename)
            
            # Clear layout (but not widgets)
            while self._grid_layout.count():
                self._grid_layout.takeAt(0)

            row, col, max_cols = 0, 0, 5
            for photo in sorted_photos:
                p_str = str(photo.path)
                if p_str in self._thumb_widgets:
                    thumb = self._thumb_widgets[p_str]
                else:
                    thumb = PhotoThumbnail(photo)
                    thumb.clicked.connect(photo_clicked_signal)
                    self._thumb_widgets[p_str] = thumb
                    if thread_pool:
                        thumbnail_cache.request_thumbnail_async(
                            photo.path, thread_pool, thumb_signals)
                
                self._grid_layout.addWidget(thumb, row, col)
                col += 1
                if col >= max_cols:
                    col = 0
                    row += 1


# ---------------------------------------------------------------------------
# WorkspaceSection  – top-level collapsible section for one workspace
# ---------------------------------------------------------------------------

class WorkspaceSection(QWidget):
    """Collapsible top-level block for one workspace."""

    def __init__(self, ws_str: str, ws_name: str, parent=None):
        super().__init__(parent)
        self.ws_str = ws_str
        self._folder_sections: OrderedDict[str, FolderSection] = OrderedDict()

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 4, 0, 4)
        outer.setSpacing(0)

        # Inner container holds all folder sections
        self._inner = QWidget()
        self._inner_layout = QVBoxLayout(self._inner)
        self._inner_layout.setContentsMargins(0, 0, 0, 0)
        self._inner_layout.setSpacing(2)

        # Scanning placeholder label (shown until first photos arrive)
        self._scanning_lbl = QLabel(f"⏳  Scanning {ws_name}…")
        self._scanning_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._scanning_lbl.setStyleSheet(
            "color: #aaaaaa; background: transparent; font-size: 13px; padding: 20px;")
        self._inner_layout.addWidget(self._scanning_lbl)

        self._header = CollapsibleHeader(
            f"📁  {ws_name}", self._inner,
            bg_color="#1e3a5f", font_size=14)

        outer.addWidget(self._header)
        outer.addWidget(self._inner)

    def set_scanning(self, name: str):
        """Reset to scanning state."""
        self._scanning_lbl.setText(f"⏳  Scanning {name}…")
        self._scanning_lbl.setVisible(True)
        for fs in self._folder_sections.values():
            fs.setVisible(False)
            fs.deleteLater()
        self._folder_sections.clear()

    def update_photos(self, photos: List[Photo], ws_path: Path,
                      photo_clicked_signal,
                      thumbnail_cache: ThumbnailCache, thread_pool,
                      thumb_signals: ThumbnailSignals):
        """Rebuild folder sections from a (possibly growing) photo list."""
        self._scanning_lbl.setVisible(False)

        # Group by folder
        by_folder: Dict[str, List[Photo]] = defaultdict(list)
        for p in photos:
            by_folder[str(p.path.parent)].append(p)

        base_depth = len(ws_path.parts)

        # Add or refresh folder sections in sorted order
        existing_keys = set(self._folder_sections.keys())
        new_keys = set(by_folder.keys())

        # Remove folders no longer present
        for key in existing_keys - new_keys:
            w = self._folder_sections.pop(key)
            self._inner_layout.removeWidget(w)
            w.deleteLater()

        for folder_str in sorted(by_folder.keys()):
            folder_path_obj = Path(folder_str)
            level = max(0, len(folder_path_obj.parts) - base_depth)
            
            # Use relative path for the display name if we are inside the workspace
            try:
                display_name = str(folder_path_obj.relative_to(ws_path))
            except Exception:
                display_name = folder_path_obj.name or folder_str

            if folder_str not in self._folder_sections:
                fs = FolderSection(display_name, level)
                self._folder_sections[folder_str] = fs
                # Insert at correct sorted position
                keys_sorted = sorted(self._folder_sections.keys())
                idx = keys_sorted.index(folder_str)
                self._inner_layout.insertWidget(idx, fs)
            else:
                fs = self._folder_sections[folder_str]

            fs.populate(by_folder[folder_str], photo_clicked_signal,
                        thumbnail_cache, thread_pool, thumb_signals)

    def get_all_thumb_widgets(self) -> Dict[str, PhotoThumbnail]:
        result = {}
        for fs in self._folder_sections.values():
            result.update(fs.get_thumb_widgets())
        return result


# ---------------------------------------------------------------------------
# FolderView  – main widget
# ---------------------------------------------------------------------------

class FolderView(QWidget):
    """Folder view showing photos organized by workspace → folder hierarchy."""

    photo_clicked = pyqtSignal(object)

    def __init__(self, thumbnail_cache: ThumbnailCache, thread_pool=None, parent=None):
        super().__init__(parent)
        self.thumbnail_cache = thumbnail_cache
        self.thread_pool = thread_pool

        # workspace_str → WorkspaceSection widget
        self._ws_sections: OrderedDict[str, WorkspaceSection] = OrderedDict()

        # Shared async thumbnail signal (one object for all tasks)
        self._thumb_signals = ThumbnailSignals()
        self._thumb_signals.ready.connect(self._on_thumbnail_ready)

        self._init_ui()

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)

        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        self.container = QWidget()
        self.container_layout = QVBoxLayout(self.container)
        self.container_layout.setContentsMargins(4, 4, 4, 4)
        self.container_layout.setSpacing(4)
        self.container_layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        self.scroll_area.setWidget(self.container)
        main_layout.addWidget(self.scroll_area)

    # ------------------------------------------------------------------
    # Public API called by MainWindow
    # ------------------------------------------------------------------

    def show_workspace_scanning(self, ws_str: str, ws_name: str):
        """Add (or reset) a workspace section showing the scanning spinner."""
        if ws_str in self._ws_sections:
            self._ws_sections[ws_str].set_scanning(ws_name)
        else:
            section = WorkspaceSection(ws_str, ws_name)
            self._ws_sections[ws_str] = section
            self.container_layout.addWidget(section)

    def update_workspace_photos(self, ws_str: str, photos: List[Photo]):
        """Update the folder sections inside a workspace section."""
        if ws_str not in self._ws_sections:
            ws_name = Path(ws_str).name
            self.show_workspace_scanning(ws_str, ws_name)

        section = self._ws_sections[ws_str]
        section.update_photos(
            photos, Path(ws_str),
            self.photo_clicked.emit,
            self.thumbnail_cache, self.thread_pool,
            self._thumb_signals)

    def remove_workspace(self, ws_str: str):
        """Remove a workspace section entirely."""
        if ws_str in self._ws_sections:
            w = self._ws_sections.pop(ws_str)
            self.container_layout.removeWidget(w)
            w.deleteLater()

    def clear(self):
        """Remove all workspace sections."""
        for w in list(self._ws_sections.values()):
            self.container_layout.removeWidget(w)
            w.deleteLater()
        self._ws_sections.clear()

    # Legacy API kept for compatibility
    def show_scanning_indicator(self):
        pass

    def set_photos(self, photos: List[Photo]):
        pass

    def get_ordered_photos(self) -> List[Photo]:
        """Return photos in the exact display order (workspace → folder → position)."""
        result = []
        for ws_section in self._ws_sections.values():
            widgets = ws_section.get_all_thumb_widgets()
            for widget in widgets.values():
                result.append(widget.photo)
        return result

    # ------------------------------------------------------------------
    # Async thumbnail callback
    # ------------------------------------------------------------------

    def _on_thumbnail_ready(self, photo_path, pixmap):
        key = str(photo_path)
        for section in self._ws_sections.values():
            widget = section.get_all_thumb_widgets().get(key)
            if widget:
                widget.set_pixmap(pixmap)
                break
