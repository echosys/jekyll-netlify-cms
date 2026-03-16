"""
Timeline View – Display photos grouped by time, size, or location.

Location mode
-------------
* When the user selects "By Location", a background LocationScannerWorker
  starts reverse-geocoding every photo that has GPS coordinates.
* Results stream in via signals; the view rebuilds its groups incrementally.
* A dedicated progress bar (inside this widget) shows geocoding progress.
* A search box filters the location groups in real time.

Location grouping rules
-----------------------
* Photos sorted newest-first.
* Iterate and assign to groups:
    - Start a new group when state changes (after ≥ MIN_GROUP_SIZE photos),
      or when the date span exceeds 6 months.
    - Photos with no GPS stay in the current group ("unknown").
* Group header shows top-3 city names + state.
* Right-side jump index shows "YYYY-MM" of the most-recent photo in the group.
"""

from __future__ import annotations

from collections import defaultdict, OrderedDict
from typing import List, Dict, Optional

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QPixmap, QColor
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QScrollArea,
    QLabel, QGridLayout, QComboBox, QSizePolicy,
    QPushButton, QLineEdit, QProgressBar,
)

from core.models import Photo
from core.thumbnail_cache import ThumbnailSignals

_THUMB_SIZE = 200
_MAX_LABEL_CHARS = 18

_MAX_GROUP_SPAN_DAYS = 6 * 30   # ~6 months
_MIN_GROUP_SIZE      = 30


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt_size(size_bytes: int) -> str:
    for unit, threshold in (("GB", 1 << 30), ("MB", 1 << 20), ("KB", 1 << 10)):
        if size_bytes >= threshold:
            return f"{size_bytes / threshold:.1f} {unit}"
    return f"{size_bytes} B"


def _truncate(name: str, max_chars: int = _MAX_LABEL_CHARS) -> str:
    return name if len(name) <= max_chars else name[:max_chars - 1] + "…"


def _size_bucket(size_bytes: int) -> str:
    GB = 1 << 30; MB = 1 << 20
    if size_bytes >= 10 * GB:   return "≥ 10 GB"
    if size_bytes >= GB:        return "1 GB – 10 GB"
    if size_bytes >= 100 * MB:  return "100 MB – 1 GB"
    if size_bytes >= 10 * MB:   return "10 MB – 100 MB"
    if size_bytes >= MB:        return "1 MB – 10 MB"
    return "< 1 MB"


_SIZE_BUCKET_ORDER = [
    "≥ 10 GB", "1 GB – 10 GB", "100 MB – 1 GB",
    "10 MB – 100 MB", "1 MB – 10 MB", "< 1 MB",
]


# ---------------------------------------------------------------------------
# Location grouping logic
# ---------------------------------------------------------------------------

class _LocationGroup:
    """Mutable accumulator for one location group."""

    def __init__(self, first_photo: Photo):
        self.photos:      List[Photo] = [first_photo]
        self.first_dt     = first_photo.get_display_time()
        self.state:       str = first_photo.location_state or ""
        self._city_cnt:   Dict[str, int] = defaultdict(int)
        self._county_cnt: Dict[str, int] = defaultdict(int)
        self._add_counts(first_photo)

    def _add_counts(self, photo: Photo):
        if photo.location_city:
            self._city_cnt[photo.location_city] += 1
        if photo.location_county:
            self._county_cnt[photo.location_county] += 1

    def add(self, photo: Photo):
        self.photos.append(photo)
        self._add_counts(photo)
        if not self.state and photo.location_state:
            self.state = photo.location_state

    def header_label(self) -> str:
        # Top-3 cities by frequency
        top3 = sorted(self._city_cnt, key=lambda c: -self._city_cnt[c])[:3]
        parts = [c for c in top3 if c]

        # If no cities, fall back to top-3 counties
        if not parts:
            top3c = sorted(self._county_cnt, key=lambda c: -self._county_cnt[c])[:3]
            parts = [c for c in top3c if c]

        # Append state (deduplicate if it already appears in parts)
        if self.state and self.state not in parts:
            parts.append(self.state)

        if parts:
            return "  ·  ".join(parts)

        # Last resort: country from any photo that has one
        for p in self.photos:
            if p.location_country:
                return p.location_country

        # Still nothing — geocoding must still be in progress
        return "Scanning…"

    def jump_label(self) -> str:
        return self.first_dt.strftime("%Y-%m")

    def matches_filter(self, q: str) -> bool:
        haystack = " ".join([
            self.state,
            self.header_label(),
            " ".join(self._city_cnt.keys()),
            " ".join(self._county_cnt.keys()),
            *[" ".join([p.location_city, p.location_county,
                        p.location_state, p.location_country])
              for p in self.photos]
        ]).lower()
        return q in haystack


def _build_location_groups(photos: List[Photo]) -> List[_LocationGroup]:
    if not photos:
        return []
    sorted_photos = sorted(photos, key=lambda p: p.get_display_time(), reverse=True)
    groups: List[_LocationGroup] = []
    current: Optional[_LocationGroup] = None

    for photo in sorted_photos:
        if current is None:
            current = _LocationGroup(photo)
            continue

        age_days   = (current.first_dt - photo.get_display_time()).days
        same_state = (
            not photo.location_state
            or not current.state
            or photo.location_state == current.state
        )
        state_split = not same_state and len(current.photos) >= _MIN_GROUP_SIZE
        span_split  = age_days > _MAX_GROUP_SPAN_DAYS

        if state_split or span_split:
            groups.append(current)
            current = _LocationGroup(photo)
        else:
            current.add(photo)

    if current:
        groups.append(current)
    return groups


# ---------------------------------------------------------------------------
# PhotoThumbnail
# ---------------------------------------------------------------------------

class PhotoThumbnail(QWidget):
    clicked = pyqtSignal(object)

    def __init__(self, photo: Photo, parent=None):
        super().__init__(parent)
        self.photo = photo

        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(3)

        self._img_label = QLabel()
        pm = QPixmap(_THUMB_SIZE, _THUMB_SIZE)
        pm.fill(QColor("#e0e0e0"))
        self._img_label.setPixmap(pm)
        self._img_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._img_label.setFixedSize(_THUMB_SIZE, _THUMB_SIZE)
        layout.addWidget(self._img_label)

        name_lbl = QLabel(_truncate(photo.filename))
        name_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        name_lbl.setStyleSheet("font-size: 11px; color: #333;")
        name_lbl.setFixedWidth(_THUMB_SIZE)
        layout.addWidget(name_lbl)

        dt = photo.get_display_time()
        tooltip = (f"<b>{photo.filename}</b><br>"
                   f"Size: {_fmt_size(photo.size)}<br>"
                   f"Date: {dt.strftime('%Y-%m-%d %H:%M:%S')}")
        loc_parts = [x for x in (photo.location_city,
                                  photo.location_state,
                                  photo.location_country) if x]
        if loc_parts:
            tooltip += f"<br>Location: {', '.join(loc_parts)}"
        self.setToolTip(tooltip)
        self.setStyleSheet("QWidget { border: 1px solid #ccc; background: #f0f0f0; }")
        self.setFixedSize(_THUMB_SIZE + 10, _THUMB_SIZE + 30)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def set_pixmap(self, pixmap: Optional[QPixmap]):
        if pixmap and not pixmap.isNull():
            self._img_label.setPixmap(pixmap.scaled(
                _THUMB_SIZE, _THUMB_SIZE,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation))
            self.setStyleSheet("QWidget { border: 1px solid #ccc; background: white; }")

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self.photo)


# ---------------------------------------------------------------------------
# CollapsibleSection
# ---------------------------------------------------------------------------

class CollapsibleSection(QWidget):
    def __init__(self, title: str, parent=None):
        super().__init__(parent)
        self._collapsed = False
        self._thumb_widgets: Dict[str, PhotoThumbnail] = {}

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 2, 0, 2)
        outer.setSpacing(0)

        header = QWidget()
        header.setFixedHeight(32)
        header.setStyleSheet("background: #2c5282;")
        header.setCursor(Qt.CursorShape.PointingHandCursor)
        h_layout = QHBoxLayout(header)
        h_layout.setContentsMargins(10, 0, 10, 0)

        self._arrow = QLabel("▼")
        self._arrow.setStyleSheet("color: white; background: transparent; font-size: 12px;")
        self._arrow.setFixedWidth(18)
        h_layout.addWidget(self._arrow)

        self._title_lbl = QLabel(title)
        self._title_lbl.setStyleSheet(
            "color: white; background: transparent; font-weight: bold; font-size: 13px;")
        self._title_lbl.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        h_layout.addWidget(self._title_lbl)

        outer.addWidget(header)

        self._content = QWidget()
        content_layout = QVBoxLayout(self._content)
        content_layout.setContentsMargins(8, 8, 8, 8)
        self._grid = QGridLayout()
        self._grid.setSpacing(10)
        self._grid.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        content_layout.addLayout(self._grid)
        outer.addWidget(self._content)

        header.mousePressEvent = self._toggle  # type: ignore[method-assign]

    def update_title(self, title: str):
        self._title_lbl.setText(title)

    def _toggle(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._collapsed = not self._collapsed
            self._arrow.setText("▶" if self._collapsed else "▼")
            self._content.setVisible(not self._collapsed)

    def populate(self, photos: List[Photo], photo_clicked_signal,
                 thumbnail_cache, thread_pool, thumb_signals: ThumbnailSignals):
        while self._grid.count():
            item = self._grid.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        self._thumb_widgets.clear()

        row, col, max_cols = 0, 0, 5
        for photo in photos:
            thumb = PhotoThumbnail(photo)
            thumb.clicked.connect(photo_clicked_signal)
            self._grid.addWidget(thumb, row, col)
            self._thumb_widgets[str(photo.path)] = thumb
            col += 1
            if col >= max_cols:
                col = 0
                row += 1
            if thread_pool:
                thumbnail_cache.request_thumbnail_async(
                    photo.path, thread_pool, thumb_signals)

    def get_thumb_widgets(self) -> Dict[str, PhotoThumbnail]:
        return self._thumb_widgets


# ---------------------------------------------------------------------------
# GroupIndexPanel
# ---------------------------------------------------------------------------

class GroupIndexPanel(QWidget):
    jump_requested = pyqtSignal(str)

    _ACTIVE_STYLE = ("QPushButton { background: #2c5282; color: white; border: none; "
                     "padding: 3px 6px; border-radius: 3px; font-size: 10px; "
                     "text-align: left; }"
                     "QPushButton:hover { background: #3a6ea8; }")
    _IDLE_STYLE   = ("QPushButton { background: transparent; color: #555; border: none; "
                     "padding: 3px 6px; border-radius: 3px; font-size: 10px; "
                     "text-align: left; }"
                     "QPushButton:hover { background: #e8eef4; color: #2c5282; }")

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedWidth(110)
        self.setStyleSheet("background: #f7f9fc; border-left: 1px solid #ddd;")
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(4, 8, 4, 8)
        self._layout.setSpacing(2)
        self._layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self._buttons: Dict[str, QPushButton] = {}
        self._active_key: Optional[str] = None

        hdr = QLabel("Jump to")
        hdr.setStyleSheet("color: #999; font-size: 9px; font-weight: bold; "
                          "padding: 0 6px 4px 6px;")
        hdr.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._layout.addWidget(hdr)

    def set_groups(self, keys: List[str],
                   labels: Optional[List[str]] = None):
        for btn in self._buttons.values():
            self._layout.removeWidget(btn)
            btn.deleteLater()
        self._buttons.clear()
        self._active_key = None

        for i, key in enumerate(keys):
            display = labels[i] if labels else key
            short = self._shorten(display)
            btn = QPushButton(short)
            btn.setStyleSheet(self._IDLE_STYLE)
            btn.setToolTip(key)
            btn.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
            btn.clicked.connect(lambda checked, k=key: self.jump_requested.emit(k))
            self._buttons[key] = btn
            self._layout.addWidget(btn)

        self._layout.addStretch()

    def highlight(self, key: str):
        if self._active_key and self._active_key in self._buttons:
            self._buttons[self._active_key].setStyleSheet(self._IDLE_STYLE)
        self._active_key = key
        if key in self._buttons:
            self._buttons[key].setStyleSheet(self._ACTIVE_STYLE)

    @staticmethod
    def _shorten(label: str) -> str:
        if "·" in label:
            parts = [p.strip() for p in label.split("·")]
            if len(parts) == 2:
                return f"{parts[0]}  {parts[1][:3]}"
        return label if len(label) <= 14 else label[:13] + "…"


# ---------------------------------------------------------------------------
# TimelineView
# ---------------------------------------------------------------------------

class TimelineView(QWidget):
    """Timeline – grouped by year/month, size, or location."""

    photo_clicked = pyqtSignal(object)

    # Internal cross-thread delivery for geocode results
    _geocode_sig = pyqtSignal(str, str, str, str, str)

    def __init__(self, thumbnail_cache, thread_pool=None, parent=None):
        super().__init__(parent)
        self.thumbnail_cache = thumbnail_cache
        self.thread_pool     = thread_pool
        self.photos:          List[Photo] = []
        self.sort_by          = "created_time"

        self._geocoding_active = False
        self._geocode_done     = 0
        self._geocode_total    = 0
        self._geocode_update_counter = 0   # counts _on_geocode_ready calls for throttle
        self._path_to_photo:   Dict[str, Photo] = {}
        self._loc_groups:      List[_LocationGroup] = []
        self._sections:        OrderedDict[str, CollapsibleSection] = OrderedDict()

        self._thumb_signals = ThumbnailSignals()
        self._thumb_signals.ready.connect(self._on_thumbnail_ready)
        self._geocode_sig.connect(self._on_geocode_ready)

        self._init_ui()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def set_thread_pool(self, thread_pool):
        self.thread_pool = thread_pool

    def set_photos(self, photos: List[Photo]):
        self.photos = photos
        self._path_to_photo = {str(p.path): p for p in photos}
        self.refresh_view()

    def get_ordered_photos(self) -> List[Photo]:
        """Return photos in the exact display order currently shown.
        Used by MainWindow so the preview dialog navigates within this view."""
        if self.sort_by == "location":
            # Respect active search filter
            ftext = self._search_box.text().strip().lower()
            groups = [g for g in self._loc_groups if g.matches_filter(ftext)] \
                     if ftext else self._loc_groups
            result: List[Photo] = []
            for grp in groups:
                result.extend(grp.photos)
            return result
        else:
            # Non-location: collect from rendered sections in order
            result = []
            for section in self._sections.values():
                for path_str, widget in section.get_thumb_widgets().items():
                    result.append(widget.photo)
            return result if result else list(self.photos)

    def apply_geocode_result(self, path: str, city: str, county: str,
                              state: str, country: str):
        """Thread-safe: called from main_window, delivered on UI thread."""
        self._geocode_sig.emit(path, city, county, state, country)

    def notify_geocode_progress(self, done: int, total: int):
        self._geocode_done  = done
        self._geocode_total = total
        if total > 0:
            self._geo_progress.setMaximum(total)
            self._geo_progress.setValue(done)
            self._geo_progress.setVisible(True)
            pct = int(done / total * 100)
            self._geo_status.setText(f"Geocoding… {pct}%  ({done}/{total})")
            self._geo_status.setVisible(True)
        else:
            self._geo_progress.setVisible(False)
            self._geo_status.setVisible(False)

    def notify_geocode_finished(self):
        self._geocoding_active = False
        self._geocode_update_counter = 0
        self._geo_progress.setVisible(False)
        self._geo_status.setVisible(False)
        # Always rebuild on finish so labels update whether scan was silent or not
        if self.sort_by == "location":
            self._rebuild_location_view()

    def mark_geocoding_started(self):
        """Called for user-triggered (non-silent) geocoding passes."""
        self._geocoding_active = True
        self._geocode_update_counter = 0

    def mark_geocoding_started_silent(self):
        """Called for background auto-geocoding — no progress bar shown."""
        self._geocode_update_counter = 0

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(5, 5, 5, 5)
        main_layout.setSpacing(4)

        # Toolbar
        toolbar = QHBoxLayout()
        toolbar.addWidget(QLabel("Sort by:"))
        self.sort_combo = QComboBox()
        self.sort_combo.addItems(["Creation Time", "Modified Time",
                                  "File Size", "By Location"])
        self.sort_combo.currentIndexChanged.connect(self._on_sort_changed)
        toolbar.addWidget(self.sort_combo)
        toolbar.addSpacing(16)

        self._search_label = QLabel("Search location:")
        self._search_label.setVisible(False)
        toolbar.addWidget(self._search_label)

        self._search_box = QLineEdit()
        self._search_box.setPlaceholderText("city, state, country…")
        self._search_box.setMaximumWidth(220)
        self._search_box.setVisible(False)
        self._search_box.textChanged.connect(self._on_search_changed)
        toolbar.addWidget(self._search_box)
        toolbar.addStretch()
        main_layout.addLayout(toolbar)

        # Geocoding progress row
        geo_row = QHBoxLayout()
        self._geo_status = QLabel()
        self._geo_status.setStyleSheet("color: #555; font-size: 11px;")
        self._geo_status.setVisible(False)
        geo_row.addWidget(self._geo_status)

        self._geo_progress = QProgressBar()
        self._geo_progress.setMaximumHeight(8)
        self._geo_progress.setVisible(False)
        self._geo_progress.setStyleSheet(
            "QProgressBar { border: none; background: #ddd; border-radius: 4px; }"
            "QProgressBar::chunk { background: #2c8a5a; border-radius: 4px; }")
        geo_row.addWidget(self._geo_progress, 1)
        main_layout.addLayout(geo_row)

        # Body: scroll area + index panel
        body = QHBoxLayout()
        body.setContentsMargins(0, 0, 0, 0)
        body.setSpacing(0)

        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll_area.verticalScrollBar().valueChanged.connect(self._on_scroll)

        self.container = QWidget()
        self.container_layout = QVBoxLayout(self.container)
        self.container_layout.setContentsMargins(0, 0, 0, 0)
        self.container_layout.setSpacing(4)
        self.container_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.scroll_area.setWidget(self.container)
        body.addWidget(self.scroll_area, 1)

        self._index_panel = GroupIndexPanel()
        self._index_panel.jump_requested.connect(self._scroll_to_group)
        body.addWidget(self._index_panel)

        main_layout.addLayout(body, 1)

    # ------------------------------------------------------------------
    # Sort / search
    # ------------------------------------------------------------------

    def _on_sort_changed(self, index: int):
        self.sort_by = ["created_time", "modified_time", "size", "location"][index]
        loc_mode = self.sort_by == "location"
        self._search_label.setVisible(loc_mode)
        self._search_box.setVisible(loc_mode)
        self.refresh_view()
        # Tell MainWindow to start geocoding when location mode is selected
        if loc_mode:
            self._request_geocoding()

    def _request_geocoding(self):
        """Ask the parent MainWindow to start a geocoding pass (user triggered)."""
        parent = self.parent()
        while parent is not None:
            if hasattr(parent, "start_location_scan"):
                parent.start_location_scan(silent=False)
                break
            parent = parent.parent()

    def _on_search_changed(self, text: str):
        if self.sort_by == "location":
            self._render_location_groups(self._loc_groups,
                                         filter_text=text.strip().lower())

    # ------------------------------------------------------------------
    # Refresh
    # ------------------------------------------------------------------

    def refresh_view(self):
        self._clear_container()
        self._sections.clear()

        if not self.photos:
            lbl = QLabel("No photos found")
            lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            lbl.setStyleSheet("color: #888; font-size: 16px; padding: 50px;")
            self.container_layout.addWidget(lbl)
            self._index_panel.set_groups([])
            return

        if self.sort_by == "location":
            self._rebuild_location_view()
        else:
            groups  = self._group_photos(self.photos)
            ordered = self._ordered_keys(groups)
            for gk in ordered:
                section = CollapsibleSection(gk)
                section.populate(groups[gk], self.photo_clicked.emit,
                                 self.thumbnail_cache, self.thread_pool,
                                 self._thumb_signals)
                self._sections[gk] = section
                self.container_layout.addWidget(section)
            self.container_layout.addStretch()
            self._index_panel.set_groups(ordered)
            if ordered:
                self._index_panel.highlight(ordered[0])

    # ------------------------------------------------------------------
    # Location view
    # ------------------------------------------------------------------

    def _rebuild_location_view(self):
        self._loc_groups = _build_location_groups(self.photos)
        ftext = self._search_box.text().strip().lower()
        self._render_location_groups(self._loc_groups, filter_text=ftext)

    def _render_location_groups(self, groups: List[_LocationGroup],
                                  filter_text: str = ""):
        self._clear_container()
        self._sections.clear()

        visible = [g for g in groups if g.matches_filter(filter_text)] \
                  if filter_text else groups

        if not visible:
            msg = ("No location groups match your search."
                   if filter_text else
                   "Scanning GPS data…  groups will appear here.")
            lbl = QLabel(msg)
            lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            lbl.setStyleSheet("color: #888; font-size: 14px; padding: 30px;")
            self.container_layout.addWidget(lbl)
            self._index_panel.set_groups([])
            return

        keys: List[str] = []
        labels: List[str] = []
        for i, grp in enumerate(visible):
            key   = f"loc_{i}_{id(grp)}"
            title = grp.header_label()
            section = CollapsibleSection(title)
            section.populate(grp.photos, self.photo_clicked.emit,
                             self.thumbnail_cache, self.thread_pool,
                             self._thumb_signals)
            self._sections[key] = section
            self.container_layout.addWidget(section)
            keys.append(key)
            labels.append(grp.jump_label())

        self.container_layout.addStretch()
        self._index_panel.set_groups(keys, labels)
        if keys:
            self._index_panel.highlight(keys[0])

    # ------------------------------------------------------------------
    # Geocode result handler (main thread via signal)
    # ------------------------------------------------------------------

    def _on_geocode_ready(self, path: str, city: str, county: str,
                           state: str, country: str):
        photo = self._path_to_photo.get(path)
        if not photo:
            return
        photo.location_city    = city
        photo.location_county  = county
        photo.location_state   = state
        photo.location_country = country

        # Update tooltip if thumbnail already rendered
        for section in self._sections.values():
            widget = section.get_thumb_widgets().get(path)
            if widget:
                loc_parts = [x for x in (city, state, country) if x]
                if loc_parts and "Location:" not in widget.toolTip():
                    widget.setToolTip(
                        widget.toolTip() + f"<br>Location: {', '.join(loc_parts)}")
                break

        # Rebuild location view every 10 geocoded photos so headers update.
        # Use our own counter so cached-photo fast-paths also trigger rebuilds.
        if self.sort_by == "location":
            self._geocode_update_counter += 1
            if self._geocode_update_counter % 10 == 0:
                self._rebuild_location_view()

    # ------------------------------------------------------------------
    # Scroll helpers
    # ------------------------------------------------------------------

    def _scroll_to_group(self, key: str):
        section = self._sections.get(key)
        if section:
            self.scroll_area.ensureWidgetVisible(section, 0, 0)
            self._index_panel.highlight(key)

    def _on_scroll(self, value: int):
        best_key: Optional[str] = None
        best_pos = None
        for key, section in self._sections.items():
            pos = section.mapTo(self.container, section.rect().topLeft()).y()
            if pos <= value + 10:
                if best_pos is None or pos > best_pos:
                    best_pos = pos
                    best_key = key
        if best_key is None and self._sections:
            best_key = next(iter(self._sections))
        if best_key:
            self._index_panel.highlight(best_key)

    # ------------------------------------------------------------------
    # Time / size grouping (unchanged)
    # ------------------------------------------------------------------

    def _group_photos(self, photos: List[Photo]) -> Dict[str, List[Photo]]:
        groups: Dict[str, List[Photo]] = defaultdict(list)
        if self.sort_by == "size":
            for p in photos:
                groups[_size_bucket(p.size)].append(p)
            for b in groups:
                groups[b].sort(key=lambda p: p.size, reverse=True)
        else:
            key_fn = ((lambda p: p.get_display_time()) if self.sort_by == "created_time"
                      else (lambda p: p.modified_time))
            for p in photos:
                groups[key_fn(p).strftime("%Y  ·  %B")].append(p)
            for lbl in groups:
                groups[lbl].sort(key=key_fn, reverse=True)
        return groups

    def _ordered_keys(self, groups: Dict[str, List[Photo]]) -> List[str]:
        if self.sort_by == "size":
            return [k for k in _SIZE_BUCKET_ORDER if k in groups]
        return sorted(groups.keys(), reverse=True)

    # ------------------------------------------------------------------
    # Thumbnail ready
    # ------------------------------------------------------------------

    def _on_thumbnail_ready(self, photo_path, pixmap):
        key = str(photo_path)
        for section in self._sections.values():
            widget = section.get_thumb_widgets().get(key)
            if widget:
                widget.set_pixmap(pixmap)
                break

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def _clear_container(self):
        for w in self._sections.values():
            w.deleteLater()
        while self.container_layout.count():
            item = self.container_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

    def clear(self):
        self.photos = []
        self._path_to_photo.clear()
        self.refresh_view()
