"""
Photo Preview Dialog – full-screen-style viewer with pinch/scroll zoom + pan.
Videos are opened in the system default player (cross-platform, zero codec work).
Includes a collapsible Location Editor panel for GPS / reverse-geocode info.
"""
from PyQt6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel,
                              QPushButton, QWidget, QSizePolicy, QLineEdit,
                              QFrame, QGridLayout, QMessageBox, QSplitter,
                              QScrollArea, QTableWidget, QTableWidgetItem,
                              QHeaderView, QAbstractItemView)
from PyQt6.QtCore import Qt, QTimer, QPoint, QPointF, QRectF, QThread, pyqtSignal, QObject
from PyQt6.QtGui import QPixmap, QKeyEvent, QWheelEvent, QMouseEvent, QPainter, QColor
from typing import List, Optional, Dict, Any
import subprocess, platform
from core.models import Photo
from utils.file_utils import is_video_file
from utils.exif_reader import ExifWriter


def _fmt_size(size_bytes: int) -> str:
    for unit, threshold in (("GB", 1 << 30), ("MB", 1 << 20), ("KB", 1 << 10)):
        if size_bytes >= threshold:
            return f"{size_bytes / threshold:.1f} {unit}"
    return f"{size_bytes} B"


def _open_system_player(path) -> None:
    system = platform.system()
    try:
        if system == "Darwin":
            subprocess.Popen(["open", str(path)])
        elif system == "Windows":
            subprocess.Popen(["start", "", str(path)], shell=True)
        else:
            subprocess.Popen(["xdg-open", str(path)])
    except Exception as e:
        print(f"[Preview] failed to open system player: {e}")


# ---------------------------------------------------------------------------
# Forward-geocode worker (address → lat/lon)
# ---------------------------------------------------------------------------

class _ForwardGeocodeSignals(QObject):
    result = pyqtSignal(float, float, str, str, str, str, str)  # lat, lon, display, city, county, state, country
    error  = pyqtSignal(str)

class _ForwardGeocodeWorker(QThread):
    """Runs Nominatim forward geocode + reverse geocode in a thread."""

    def __init__(self, address: str, proxy_url: str = ""):
        super().__init__()
        self.address   = address
        self.proxy_url = proxy_url
        self.signals   = _ForwardGeocodeSignals()

    def run(self):
        print(f"[ForwardGeocode] starting for address: {self.address!r}")
        try:
            import requests, os, urllib3
            url = self.proxy_url.strip()
            if not url:
                url = (os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or
                       os.environ.get("HTTP_PROXY")  or os.environ.get("http_proxy", ""))
            proxies = {"http": url, "https": url} if url else None
            print(f"[ForwardGeocode] proxy={proxies}")

            def _req(endpoint, params, verify: bool):
                return requests.get(
                    endpoint,
                    params=params,
                    headers={"User-Agent": "picasa-photo-manager/1.0"},
                    proxies=proxies, timeout=10, verify=verify,
                )

            def _get(endpoint, params):
                try:
                    return _req(endpoint, params, verify=True)
                except requests.exceptions.SSLError as e:
                    print(f"[ForwardGeocode] SSL error, retrying without verify: {e}")
                    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                    return _req(endpoint, params, verify=False)

            # Step 1: forward geocode address → lat/lon
            print(f"[ForwardGeocode] calling Nominatim search...")
            resp = _get("https://nominatim.openstreetmap.org/search",
                        {"q": self.address, "format": "json", "addressdetails": 1, "limit": 1})
            resp.raise_for_status()
            data = resp.json()
            print(f"[ForwardGeocode] search result count: {len(data)}")
            if not data:
                self.signals.error.emit(f"No results for: {self.address!r}")
                return

            r = data[0]
            lat = float(r["lat"])
            lon = float(r["lon"])
            display = r.get("display_name", "")
            print(f"[ForwardGeocode] found: lat={lat}, lon={lon}, display={display[:60]}")

            # Step 2: reverse geocode the result to get structured city/state/country
            print(f"[ForwardGeocode] calling Nominatim reverse for lat={lat}, lon={lon}...")
            rev_resp = _get("https://nominatim.openstreetmap.org/reverse",
                            {"lat": lat, "lon": lon, "format": "json", "addressdetails": 1})
            rev_resp.raise_for_status()
            rev_data = rev_resp.json()
            addr = rev_data.get("address", {})
            city = (addr.get("city") or addr.get("town") or addr.get("village") or
                    addr.get("hamlet") or addr.get("suburb") or
                    addr.get("neighbourhood") or addr.get("municipality", ""))
            county  = addr.get("county", "")
            state   = addr.get("state", "")
            country = addr.get("country", "")
            print(f"[ForwardGeocode] reverse result: city={city!r}, state={state!r}, country={country!r}")

            self.signals.result.emit(lat, lon, display, city, county, state, country)

        except Exception as exc:
            print(f"[ForwardGeocode] error: {exc}")
            self.signals.error.emit(str(exc))


# ---------------------------------------------------------------------------
# ZoomableView  – pinch / Ctrl+scroll zoom + click-drag pan
# ---------------------------------------------------------------------------

class ZoomableView(QWidget):
    """
    Displays a QPixmap with:
    - Two-finger pinch (macOS trackpad) or Ctrl+scroll → zoom
    - Normal scroll (no Ctrl) → pan vertically
    - Click-drag → pan
    - Double-click → reset to fit
    - +/- keys → zoom steps
    Fit-to-window mode active until the user zooms.
    """

    _ZOOM_MIN = 0.05
    _ZOOM_MAX = 20.0
    _ZOOM_STEP = 1.15   # per keyboard press / scroll tick

    def __init__(self, parent=None):
        super().__init__(parent)
        self._source: Optional[QPixmap] = None
        self._zoom = 1.0          # current zoom factor
        self._fit_mode = True     # True → always scale to widget size
        self._offset = QPointF(0, 0)   # pan offset in widget coords
        self._drag_start: Optional[QPoint] = None
        self._drag_offset_start = QPointF(0, 0)

        self.setStyleSheet("background: #1a1a1a;")
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.setMinimumSize(200, 200)
        self.setMouseTracking(True)
        # Accept touch events so macOS trackpad pinch works
        self.grabGesture(Qt.GestureType.PinchGesture)

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def set_source(self, pixmap: QPixmap):
        self._source = pixmap
        self._fit_mode = True
        self._offset = QPointF(0, 0)
        self.update()

    def clear_source(self):
        self._source = None
        self.update()

    def zoom_to_fit(self):
        self._fit_mode = True
        self._offset = QPointF(0, 0)
        self.update()

    def zoom_by(self, factor: float, anchor: Optional[QPointF] = None):
        """Multiply zoom by factor, keeping anchor point fixed on screen."""
        if self._source is None:
            return
        self._fit_mode = False
        if anchor is None:
            anchor = QPointF(self.width() / 2, self.height() / 2)
        anc: QPointF = anchor   # type narrowed for arithmetic below
        old_zoom = self._zoom
        new_zoom = max(self._ZOOM_MIN, min(self._ZOOM_MAX, old_zoom * factor))
        ratio = new_zoom / old_zoom
        self._offset = anc + (self._offset - anc) * ratio
        self._zoom = new_zoom
        self.update()

    # ------------------------------------------------------------------
    # Qt overrides
    # ------------------------------------------------------------------

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self._fit_mode:
            self.update()

    def paintEvent(self, event):
        if self._source is None or self._source.isNull():
            return
        painter = QPainter(self)
        painter.fillRect(self.rect(), QColor("#1a1a1a"))

        w, h = self.width(), self.height()
        pw, ph = self._source.width(), self._source.height()

        if self._fit_mode:
            scale = min(w / pw, h / ph)
            dw, dh = pw * scale, ph * scale
            x, y = (w - dw) / 2, (h - dh) / 2
        else:
            dw, dh = pw * self._zoom, ph * self._zoom
            x = self._offset.x() + (w - dw) / 2
            y = self._offset.y() + (h - dh) / 2

        target = QRectF(x, y, dw, dh)
        painter.drawPixmap(target, self._source, QRectF(self._source.rect()))
        painter.end()

    def wheelEvent(self, event: QWheelEvent):
        # macOS two-finger pinch arrives as a wheel event with Ctrl modifier
        # Regular two-finger scroll (no Ctrl) → just pan
        mods = event.modifiers()
        is_zoom = bool(mods & Qt.KeyboardModifier.ControlModifier)

        if is_zoom:
            # Pixel delta is more precise on macOS trackpad
            delta = event.pixelDelta().y() or event.angleDelta().y() / 8
            factor = self._ZOOM_STEP ** (delta / 15.0)
            self.zoom_by(factor, QPointF(event.position()))
        else:
            # Pan
            if not self._fit_mode:
                d = event.pixelDelta()
                if not d.isNull():
                    self._offset += QPointF(d.x(), d.y())
                else:
                    self._offset += QPointF(0, event.angleDelta().y() / 8.0)
                self.update()
        event.accept()

    def mousePressEvent(self, event: QMouseEvent):
        if event.button() == Qt.MouseButton.LeftButton and not self._fit_mode:
            self._drag_start = event.pos()
            self._drag_offset_start = QPointF(self._offset)
            self.setCursor(Qt.CursorShape.ClosedHandCursor)

    def mouseMoveEvent(self, event: QMouseEvent):
        if self._drag_start is not None:
            delta = event.pos() - self._drag_start
            self._offset = self._drag_offset_start + QPointF(delta)
            self.update()

    def mouseReleaseEvent(self, event: QMouseEvent):
        if event.button() == Qt.MouseButton.LeftButton:
            self._drag_start = None
            self.setCursor(Qt.CursorShape.ArrowCursor)

    def mouseDoubleClickEvent(self, event: QMouseEvent):
        """Double-click resets to fit-to-window."""
        self.zoom_to_fit()

    def event(self, e):
        """Handle native gesture (macOS trackpad pinch)."""
        from PyQt6.QtCore import QEvent
        if e.type() == QEvent.Type.NativeGesture:
            # Qt NativeGestureEvent: gestureType() ZoomNativeGesture → value is delta
            try:
                from PyQt6.QtGui import QNativeGestureEvent
                if hasattr(e, 'gestureType'):
                    import PyQt6.QtCore as _qc
                    if e.gestureType() == _qc.Qt.NativeGestureType.ZoomNativeGesture:
                        factor = 1.0 + e.value()
                        self.zoom_by(factor, QPointF(e.localPos()))
                        e.accept()
                        return True
            except Exception:
                pass
        return super().event(e)


# ---------------------------------------------------------------------------
# LocationEditorPanel
# ---------------------------------------------------------------------------

class LocationEditorPanel(QWidget):
    """
    Collapsible panel shown below the image in the preview dialog.
    Displays current GPS / geocode info and lets the user:
      - Edit the address text and click "Gen GPS" to forward-geocode it.
      - Save (writes lat/lon + location fields back to the Photo object).
      - Cancel (discards edits).
    """

    _PANEL_STYLE = ("background: #1e1e2e;")
    _LBL  = "color: #aaa; font-size: 11px;"
    _VAL  = "color: #eee; font-size: 11px;"
    _BTN  = ("QPushButton { background: #2c5282; color: white; border: none; "
             "padding: 3px 10px; border-radius: 3px; font-size: 11px; }"
             "QPushButton:hover { background: #3a6ea8; }"
             "QPushButton:disabled { background: #333; color: #666; }")
    _BTN_GREEN = ("QPushButton { background: #2c8a5a; color: white; border: none; "
                  "padding: 3px 10px; border-radius: 3px; font-size: 11px; }"
                  "QPushButton:hover { background: #38a36e; }"
                  "QPushButton:disabled { background: #333; color: #666; }")
    _BTN_RED   = ("QPushButton { background: #822; color: white; border: none; "
                  "padding: 3px 10px; border-radius: 3px; font-size: 11px; }"
                  "QPushButton:hover { background: #a33; }")

    def __init__(self, geocoder_cache=None, proxy_url: str = "", parent=None):
        super().__init__(parent)
        self.setStyleSheet(self._PANEL_STYLE)
        self.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Expanding)
        self._geocoder_cache = geocoder_cache
        self._proxy_url      = proxy_url
        self._photo: Optional[Photo] = None
        self._pending_lat:     Optional[float] = None
        self._pending_lon:     Optional[float] = None
        self._pending_city:    str = ""
        self._pending_county:  str = ""
        self._pending_state:   str = ""
        self._pending_country: str = ""
        self._worker: Optional[_ForwardGeocodeWorker] = None

        self._build_ui()

    # ------------------------------------------------------------------
    def _build_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(10, 8, 10, 8)
        root.setSpacing(4)

        # ── Header / toggle ──────────────────────────────────────────
        self._toggle_btn = QPushButton("▼  Location Info")
        self._toggle_btn.setStyleSheet(
            "QPushButton { background: transparent; color: #8ab4f8; border: none; "
            "font-size: 12px; font-weight: bold; text-align: left; padding: 0; }"
            "QPushButton:hover { color: #aecbfa; }")
        self._toggle_btn.setFixedHeight(22)
        self._toggle_btn.clicked.connect(self._toggle_body)
        root.addWidget(self._toggle_btn)

        # ── Body ─────────────────────────────────────────────────────
        self._body = QWidget()
        body_layout = QVBoxLayout(self._body)
        body_layout.setContentsMargins(0, 4, 0, 0)
        body_layout.setSpacing(3)

        # Info grid – tight rows
        grid = QGridLayout()
        grid.setVerticalSpacing(2)
        grid.setHorizontalSpacing(6)
        grid.setColumnMinimumWidth(0, 68)
        grid.setColumnStretch(1, 1)

        def _lbl(text):
            l = QLabel(text)
            l.setStyleSheet(self._LBL)
            l.setFixedHeight(18)
            return l

        def _val():
            l = QLabel("—")
            l.setStyleSheet(self._VAL)
            l.setFixedHeight(18)
            l.setTextInteractionFlags(
                Qt.TextInteractionFlag.TextSelectableByMouse |
                Qt.TextInteractionFlag.TextSelectableByKeyboard)
            l.setCursor(Qt.CursorShape.IBeamCursor)
            return l

        self._v_lat     = _val()
        self._v_lon     = _val()
        self._v_city    = _val()
        self._v_county  = _val()
        self._v_state   = _val()
        self._v_country = _val()
        self._v_display = _val()
        self._v_display.setWordWrap(True)
        self._v_display.setFixedHeight(32)   # 2-line height for long addresses

        rows = [
            ("Latitude:",     self._v_lat),
            ("Longitude:",    self._v_lon),
            ("City:",         self._v_city),
            ("County:",       self._v_county),
            ("State:",        self._v_state),
            ("Country:",      self._v_country),
            ("Full Address:", self._v_display),
        ]
        for i, (label, widget) in enumerate(rows):
            grid.addWidget(_lbl(label), i, 0)
            grid.addWidget(widget,      i, 1)
        body_layout.addLayout(grid)

        # Thin divider
        line = QFrame()
        line.setFrameShape(QFrame.Shape.HLine)
        line.setFixedHeight(1)
        line.setStyleSheet("background: #444; border: none;")
        body_layout.addSpacing(4)
        body_layout.addWidget(line)
        body_layout.addSpacing(2)

        # Address label
        body_layout.addWidget(_lbl("Address / Place:"))

        # Address input (full width)
        self._addr_input = QLineEdit()
        self._addr_input.setPlaceholderText("e.g.  Miami, Florida  or  Eiffel Tower, Paris")
        self._addr_input.setStyleSheet(
            "background: #2a2a3e; color: #eee; border: 1px solid #555; "
            "border-radius: 3px; padding: 4px 6px; font-size: 11px;")
        self._addr_input.setFixedHeight(26)
        body_layout.addWidget(self._addr_input)

        # Gen GPS button on its own line (full width)
        self._gen_btn = QPushButton("🌐  Gen GPS from Address")
        self._gen_btn.setStyleSheet(self._BTN)
        self._gen_btn.setFixedHeight(26)
        self._gen_btn.setToolTip("Forward-geocode the address to get lat/lon + city/state")
        self._gen_btn.clicked.connect(self._on_gen_gps)
        body_layout.addWidget(self._gen_btn)

        # Status label – selectable, word-wrap
        self._status_lbl = QLabel()
        self._status_lbl.setStyleSheet("color: #8ab4f8; font-size: 10px;")
        self._status_lbl.setTextInteractionFlags(
            Qt.TextInteractionFlag.TextSelectableByMouse |
            Qt.TextInteractionFlag.TextSelectableByKeyboard)
        self._status_lbl.setCursor(Qt.CursorShape.IBeamCursor)
        self._status_lbl.setWordWrap(True)
        self._status_lbl.setMinimumHeight(14)
        self._status_lbl.setVisible(False)
        body_layout.addWidget(self._status_lbl)

        # Save / Cancel row
        btn_row = QHBoxLayout()
        self._save_btn = QPushButton("💾  Save")
        self._save_btn.setStyleSheet(self._BTN_GREEN)
        self._save_btn.setEnabled(False)
        self._save_btn.setFixedHeight(26)
        self._save_btn.setToolTip("Write GPS + location back to this photo object")
        self._save_btn.clicked.connect(self._on_save)
        btn_row.addWidget(self._save_btn)

        self._cancel_btn = QPushButton("Cancel")
        self._cancel_btn.setStyleSheet(self._BTN_RED)
        self._cancel_btn.setEnabled(False)
        self._cancel_btn.setFixedHeight(26)
        self._cancel_btn.clicked.connect(self._on_cancel)
        btn_row.addWidget(self._cancel_btn)
        body_layout.addLayout(btn_row)

        root.addWidget(self._body)
        # Push everything to the top so rows don't spread when panel is taller
        root.addStretch(1)
        self._collapsed = False

    # ------------------------------------------------------------------
    def _toggle_body(self):
        self._collapsed = not self._collapsed
        self._body.setVisible(not self._collapsed)
        self._toggle_btn.setText(
            ("▶  Location Info" if self._collapsed else "▼  Location Info"))

    # ------------------------------------------------------------------
    def load_photo(self, photo: Photo):
        """Populate the panel for the given photo."""
        self._photo = photo
        self._pending_lat = None
        self._pending_lon = None
        self._pending_city = ""
        self._pending_county = ""
        self._pending_state = ""
        self._pending_country = ""
        self._pending_display = ""
        self._save_btn.setEnabled(False)
        self._cancel_btn.setEnabled(False)
        self._status_lbl.setVisible(False)
        self._addr_input.clear()

        print(f"[LocationPanel] load_photo: {photo.filename!r} "
              f"gps=({photo.gps_latitude}, {photo.gps_longitude}) "
              f"city={photo.location_city!r} state={photo.location_state!r} "
              f"country={photo.location_country!r}")

        def _set(lbl, val): lbl.setText(str(val) if val else "—")
        _set(self._v_lat,     f"{photo.gps_latitude:.6f}"  if photo.gps_latitude  else None)
        _set(self._v_lon,     f"{photo.gps_longitude:.6f}" if photo.gps_longitude else None)
        _set(self._v_city,    photo.location_city)
        _set(self._v_county,  photo.location_county)
        _set(self._v_state,   photo.location_state)
        _set(self._v_country, photo.location_country)
        _set(self._v_display, photo.location_display)

        # Pre-fill address box: prefer full display name, fall back to city/state/country
        if photo.location_display:
            self._addr_input.setText(photo.location_display)
        else:
            loc_parts = [x for x in (photo.location_city, photo.location_state,
                                      photo.location_country) if x]
            if loc_parts:
                self._addr_input.setText(", ".join(loc_parts))

    # ------------------------------------------------------------------
    def _on_gen_gps(self):
        address = self._addr_input.text().strip()
        if not address:
            return
        print(f"[LocationPanel] Gen GPS clicked for: {address!r}, proxy={self._proxy_url!r}")
        self._gen_btn.setEnabled(False)
        self._gen_btn.setText("…")
        self._status_lbl.setText("Geocoding address…")
        self._status_lbl.setStyleSheet("color: #8ab4f8; font-size: 10px;")
        self._status_lbl.setVisible(True)

        self._worker = _ForwardGeocodeWorker(address, self._proxy_url)
        self._worker.signals.result.connect(self._on_forward_result)
        self._worker.signals.error.connect(self._on_forward_error)
        self._worker.finished.connect(lambda: self._gen_btn.setEnabled(True))
        self._worker.finished.connect(lambda: self._gen_btn.setText("🌐  Gen GPS from Address"))
        self._worker.start()

    def _on_forward_result(self, lat: float, lon: float, display: str,
                            city: str, county: str, state: str, country: str):
        print(f"[LocationPanel] _on_forward_result: lat={lat}, lon={lon}, "
              f"city={city!r}, state={state!r}, country={country!r}")
        self._pending_lat = lat
        self._pending_lon = lon
        self._pending_city    = city
        self._pending_county  = county
        self._pending_state   = state
        self._pending_country = country
        self._pending_display = display

        self._v_lat.setText(f"{lat:.6f}")
        self._v_lon.setText(f"{lon:.6f}")
        self._v_city.setText(city or "—")
        self._v_county.setText(county or "—")
        self._v_state.setText(state or "—")
        self._v_country.setText(country or "—")
        self._v_display.setText(display or "—")

        short = display[:80] + "…" if len(display) > 80 else display
        self._status_lbl.setText(f"✓  {short}")
        self._status_lbl.setStyleSheet("color: #4caf50; font-size: 10px;")
        self._status_lbl.setVisible(True)
        self._save_btn.setEnabled(True)
        self._cancel_btn.setEnabled(True)

    def _on_forward_error(self, msg: str):
        print(f"[LocationPanel] _on_forward_error: {msg}")
        self._status_lbl.setText(f"✗  {msg}")
        self._status_lbl.setStyleSheet("color: #f44336; font-size: 10px;")
        self._status_lbl.setVisible(True)

    def _on_save(self):
        if self._photo is None or self._pending_lat is None:
            print("[LocationPanel] _on_save: nothing to save")
            return
        print(f"[LocationPanel] _on_save: writing to photo {self._photo.filename!r}: "
              f"lat={self._pending_lat}, lon={self._pending_lon}, "
              f"city={self._pending_city!r}, state={self._pending_state!r}")

        # 1. Update in-memory Photo object
        self._photo.gps_latitude     = self._pending_lat
        self._photo.gps_longitude    = self._pending_lon
        self._photo.location_city    = self._pending_city
        self._photo.location_county  = self._pending_county
        self._photo.location_state   = self._pending_state
        self._photo.location_country = self._pending_country
        self._photo.location_display = self._pending_display

        # 2. Persist GPS + location to JPEG EXIF on disk
        ok = ExifWriter.write_location(
            self._photo.path,
            self._pending_lat, self._pending_lon,
            city=self._pending_city,
            county=self._pending_county,
            state=self._pending_state,
            country=self._pending_country,
            display=self._pending_display,
        )

        saved_label = (self._pending_city or self._pending_state
                       or self._pending_country or "GPS set")
        disk_note = "" if ok else "  (⚠ not a JPEG – only saved in session)"

        self._pending_lat = None
        self._pending_lon = None
        self._pending_display = ""

        self._save_btn.setEnabled(False)
        self._cancel_btn.setEnabled(False)
        self._status_lbl.setText(f"✓  Saved: {saved_label}{disk_note}")
        self._status_lbl.setStyleSheet("color: #4caf50; font-size: 10px;")
        self._status_lbl.setVisible(True)
        print(f"[LocationPanel] saved. photo.location_city={self._photo.location_city!r}, "
              f"photo.location_state={self._photo.location_state!r}, "
              f"photo.location_display={self._photo.location_display[:40]!r}, exif_written={ok}")

    def _on_cancel(self):
        if self._photo:
            self.load_photo(self._photo)


# ---------------------------------------------------------------------------
# EXIF data helper – reads all raw tags; caller can filter GPS/location away
# ---------------------------------------------------------------------------

# Tag IDs that belong to the GPS IFD – we exclude them from the EXIF panel
# because they are already shown in the Location panel.
_GPS_TAG_IDS = {
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
    26, 27, 28, 29, 30, 31,
}

# Human-readable EXIF tag names (IFD0 + Sub-IFD). Extend as needed.
_EXIF_TAGS: Dict[int, str] = {
    256: "ImageWidth", 257: "ImageLength", 258: "BitsPerSample",
    259: "Compression", 262: "PhotometricInterp", 270: "ImageDescription",
    271: "Make", 272: "Model", 273: "StripOffsets", 274: "Orientation",
    277: "SamplesPerPixel", 278: "RowsPerStrip", 279: "StripByteCounts",
    282: "XResolution", 283: "YResolution", 284: "PlanarConfig",
    296: "ResolutionUnit", 301: "TransferFunction", 305: "Software",
    306: "DateTime", 315: "Artist", 316: "HostComputer",
    318: "WhitePoint", 319: "PrimaryChromaticities",
    529: "YCbCrCoefficients", 531: "YCbCrPositioning",
    532: "ReferenceBlackWhite", 700: "XMP",
    33432: "Copyright",
    33434: "ExposureTime", 33437: "FNumber",
    34850: "ExposureProgram", 34852: "SpectralSensitivity",
    34855: "ISOSpeedRatings", 34864: "SensitivityType",
    36864: "ExifVersion", 36867: "DateTimeOriginal",
    36868: "DateTimeDigitized", 36880: "OffsetTime",
    36881: "OffsetTimeOriginal", 36882: "OffsetTimeDigitized",
    37121: "ComponentsConfig", 37122: "CompressedBitsPerPixel",
    37377: "ShutterSpeedValue", 37378: "ApertureValue",
    37379: "BrightnessValue", 37380: "ExposureBiasValue",
    37381: "MaxApertureValue", 37382: "SubjectDistance",
    37383: "MeteringMode", 37384: "LightSource",
    37385: "Flash", 37386: "FocalLength",
    37396: "SubjectArea", 37500: "MakerNote",
    37510: "UserComment", 37520: "SubSecTime",
    37521: "SubSecTimeOriginal", 37522: "SubSecTimeDigitized",
    40960: "FlashPixVersion", 40961: "ColorSpace",
    40962: "PixelXDimension", 40963: "PixelYDimension",
    40965: "InteropOffset", 41483: "FlashEnergy",
    41486: "FocalPlaneXResolution", 41487: "FocalPlaneYResolution",
    41488: "FocalPlaneResolutionUnit", 41492: "SubjectLocation",
    41493: "ExposureIndex", 41495: "SensingMethod",
    41728: "FileSource", 41729: "SceneType",
    41730: "CFAPattern", 41985: "CustomRendered",
    41986: "ExposureMode", 41987: "WhiteBalance",
    41988: "DigitalZoomRatio", 41989: "FocalLengthIn35mm",
    41990: "SceneCaptureType", 41991: "GainControl",
    41992: "Contrast", 41993: "Saturation",
    41994: "Sharpness", 41996: "SubjectDistanceRange",
    42016: "ImageUniqueID", 42032: "CameraOwnerName",
    42033: "BodySerialNumber", 42034: "LensSpecification",
    42035: "LensMake", 42036: "LensModel",
    42037: "LensSerialNumber",
}


def _fmt_raw(val: Any) -> str:
    """Best-effort human-readable string for an EXIF value."""
    if isinstance(val, bytes):
        # Try UTF-8 first (handles UserComment payloads etc.)
        try:
            text = val.lstrip(b'ASCII\x00').decode('utf-8', errors='ignore').strip('\x00').strip()
            if text:
                return text
        except Exception:
            pass
        return val.hex(' ')
    if isinstance(val, tuple):
        return '  ·  '.join(_fmt_one(x) for x in val)
    if isinstance(val, list):
        return str(val)
    return str(val)


def _fmt_one(v: Any) -> str:
    try:
        return f"{float(v):.6g}"
    except Exception:
        return str(v)


def _read_all_exif(path) -> List[tuple]:
    """
    Return a list of (tag_name, value_str) for all EXIF tags in *path*,
    excluding GPS IFD, location UserComment, and very long binary blobs.
    Tolerant of missing backends.
    """
    rows: List[tuple] = []
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS
        img = Image.open(path)
        exif_obj = img.getexif()
        if not exif_obj:
            return rows

        # IFD0 tags
        for tag_id, raw_val in exif_obj.items():
            name = TAGS.get(tag_id, f"0x{tag_id:04X}")
            rows.append((name, _fmt_raw(raw_val)))

        # Sub-IFD (Exif IFD) – exclude GPS (0x8825) which is own IFD
        try:
            exif_sub = exif_obj.get_ifd(0x8769)
            for tag_id, raw_val in exif_sub.items():
                name = TAGS.get(tag_id, f"0x{tag_id:04X}")
                # Skip UserComment if it contains our picasa location JSON
                if tag_id == 0x9286:   # UserComment
                    raw_str = _fmt_raw(raw_val)
                    if '_picasa_location' in raw_str:
                        continue
                rows.append((name, _fmt_raw(raw_val)))
        except Exception:
            pass

    except Exception:
        pass
    return rows


# ---------------------------------------------------------------------------
# ExifPanel
# ---------------------------------------------------------------------------

class ExifPanel(QWidget):
    """
    Collapsible panel shown below the Location panel in the preview dialog.
    Displays all EXIF tags excluding GPS / location fields already shown.
    An Edit button unlocks inline editing of any row; Save persists to EXIF;
    Cancel restores the original values.
    A navigation/close warning fires when there are unsaved edits.
    """

    _PANEL_STYLE = "background: #1e1e2e;"
    _HEADER_BTN  = ("QPushButton { background: transparent; color: #c3a6ff; border: none; "
                    "font-size: 12px; font-weight: bold; text-align: left; padding: 0; }"
                    "QPushButton:hover { color: #ddbfff; }")
    _BTN = ("QPushButton { background: #2c5282; color: white; border: none; "
            "padding: 3px 10px; border-radius: 3px; font-size: 11px; }"
            "QPushButton:hover { background: #3a6ea8; }"
            "QPushButton:disabled { background: #333; color: #666; }")
    _BTN_GREEN = ("QPushButton { background: #2c8a5a; color: white; border: none; "
                  "padding: 3px 10px; border-radius: 3px; font-size: 11px; }"
                  "QPushButton:hover { background: #38a36e; }"
                  "QPushButton:disabled { background: #333; color: #666; }")
    _BTN_RED   = ("QPushButton { background: #822; color: white; border: none; "
                  "padding: 3px 10px; border-radius: 3px; font-size: 11px; }"
                  "QPushButton:hover { background: #a33; }")

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet(self._PANEL_STYLE)
        self.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Expanding)
        self._photo: Optional[Photo] = None
        self._original_data: List[tuple] = []   # (tag_name, original_value_str)
        self._is_editing = False
        self._build_ui()

    # ------------------------------------------------------------------
    def _build_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(10, 8, 10, 8)
        root.setSpacing(4)

        # ── Header row: toggle + Edit button ─────────────────────────
        hdr_row = QHBoxLayout()
        hdr_row.setContentsMargins(0, 0, 0, 0)
        hdr_row.setSpacing(6)

        self._toggle_btn = QPushButton("▼  EXIF Data")
        self._toggle_btn.setStyleSheet(self._HEADER_BTN)
        self._toggle_btn.setFixedHeight(22)
        self._toggle_btn.clicked.connect(self._toggle_body)
        hdr_row.addWidget(self._toggle_btn, 1)

        self._edit_btn = QPushButton("✏ Edit")
        self._edit_btn.setStyleSheet(self._BTN)
        self._edit_btn.setFixedHeight(20)
        self._edit_btn.setFixedWidth(52)
        self._edit_btn.setToolTip("Unlock EXIF rows for editing")
        self._edit_btn.clicked.connect(self._on_edit)
        hdr_row.addWidget(self._edit_btn)

        root.addLayout(hdr_row)

        # ── Body: table + save/cancel ─────────────────────────────────
        self._body = QWidget()
        body_layout = QVBoxLayout(self._body)
        body_layout.setContentsMargins(0, 4, 0, 0)
        body_layout.setSpacing(4)

        self._table = QTableWidget(0, 2)
        self._table.setHorizontalHeaderLabels(["Tag", "Value"])
        self._table.horizontalHeader().setSectionResizeMode(
            0, QHeaderView.ResizeMode.ResizeToContents)
        self._table.horizontalHeader().setSectionResizeMode(
            1, QHeaderView.ResizeMode.Stretch)
        self._table.verticalHeader().setVisible(False)
        self._table.setSelectionBehavior(
            QAbstractItemView.SelectionBehavior.SelectRows)
        self._table.setSelectionMode(
            QAbstractItemView.SelectionMode.SingleSelection)
        self._table.setEditTriggers(
            QAbstractItemView.EditTrigger.NoEditTriggers)
        self._table.setStyleSheet(
            "QTableWidget { background: #12121e; color: #cdd6f4; "
            "  gridline-color: #2a2a3e; border: 1px solid #333; "
            "  font-size: 11px; "
            "  alternate-background-color: #191926; } "
            "QHeaderView::section { background: #1e1e2e; color: #8ab4f8; "
            "  border: none; border-bottom: 1px solid #444; "
            "  padding: 3px 6px; font-weight: bold; } "
            "QTableWidget::item { padding: 2px 4px; } "
            "QTableWidget::item:selected { background: #2a3a5e; }"
        )
        self._table.setAlternatingRowColors(True)
        body_layout.addWidget(self._table)

        # Save / Cancel widget (hidden until user clicks Edit)
        self._sc_widget = QWidget()
        sc_lay = QHBoxLayout(self._sc_widget)
        sc_lay.setContentsMargins(0, 0, 0, 0)
        sc_lay.setSpacing(6)

        self._save_btn2 = QPushButton("💾  Save EXIF")
        self._save_btn2.setStyleSheet(self._BTN_GREEN)
        self._save_btn2.setFixedHeight(26)
        self._save_btn2.clicked.connect(self._on_save)
        sc_lay.addWidget(self._save_btn2)

        self._cancel_btn2 = QPushButton("Cancel")
        self._cancel_btn2.setStyleSheet(self._BTN_RED)
        self._cancel_btn2.setFixedHeight(26)
        self._cancel_btn2.clicked.connect(self._on_cancel)
        sc_lay.addWidget(self._cancel_btn2)

        self._sc_widget.setVisible(False)
        body_layout.addWidget(self._sc_widget)

        root.addWidget(self._body)
        root.addStretch(1)
        self._collapsed = False

    # ------------------------------------------------------------------
    def _toggle_body(self):
        self._collapsed = not self._collapsed
        self._body.setVisible(not self._collapsed)
        self._toggle_btn.setText(
            "▶  EXIF Data" if self._collapsed else "▼  EXIF Data")

    def has_unsaved_changes(self) -> bool:
        """Return True if the user is in edit mode with modified cells."""
        if not self._is_editing:
            return False
        for row in range(self._table.rowCount()):
            orig_val = self._original_data[row][1] if row < len(self._original_data) else ""
            item = self._table.item(row, 1)
            if item and item.text() != orig_val:
                return True
        return False

    # ------------------------------------------------------------------
    def load_photo(self, photo: Photo):
        """Populate the EXIF table for the given photo."""
        self._photo = photo
        self._is_editing = False
        self._edit_btn.setVisible(True)
        self._sc_widget.setVisible(False)
        self._table.setEditTriggers(
            QAbstractItemView.EditTrigger.NoEditTriggers)

        rows = _read_all_exif(photo.path)
        self._original_data = list(rows)
        self._populate_table(rows)

    def _populate_table(self, rows: List[tuple]):
        self._table.setRowCount(0)
        self._table.setRowCount(len(rows))
        for r, (tag_name, val_str) in enumerate(rows):
            tag_item = QTableWidgetItem(tag_name)
            tag_item.setFlags(Qt.ItemFlag.ItemIsSelectable | Qt.ItemFlag.ItemIsEnabled)
            val_item = QTableWidgetItem(val_str)
            val_item.setFlags(Qt.ItemFlag.ItemIsSelectable | Qt.ItemFlag.ItemIsEnabled)
            self._table.setItem(r, 0, tag_item)
            self._table.setItem(r, 1, val_item)

    # ------------------------------------------------------------------
    def _on_edit(self):
        if self._photo is None:
            return
        self._is_editing = True
        self._edit_btn.setVisible(False)
        self._sc_widget.setVisible(True)
        # Unlock value column for editing
        self._table.setEditTriggers(
            QAbstractItemView.EditTrigger.DoubleClicked |
            QAbstractItemView.EditTrigger.EditKeyPressed
        )
        # Make value column items editable
        for row in range(self._table.rowCount()):
            item = self._table.item(row, 1)
            if item:
                item.setFlags(Qt.ItemFlag.ItemIsSelectable |
                              Qt.ItemFlag.ItemIsEnabled |
                              Qt.ItemFlag.ItemIsEditable)

    def _on_save(self):
        """Collect edited rows and write them back via piexif."""
        if self._photo is None:
            return
        try:
            import piexif
            from PIL.ExifTags import TAGS
            # Build reverse map name→id
            name_to_id = {v: k for k, v in TAGS.items()}

            try:
                exif_dict = piexif.load(str(self._photo.path))
            except Exception:
                exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}}

            for row in range(self._table.rowCount()):
                tag_name = (self._table.item(row, 0).text()
                            if self._table.item(row, 0) else "")
                new_val  = (self._table.item(row, 1).text()
                            if self._table.item(row, 1) else "")
                orig_val = (self._original_data[row][1]
                            if row < len(self._original_data) else "")
                if new_val == orig_val:
                    continue  # unchanged – skip
                tag_id = name_to_id.get(tag_name)
                if tag_id is None:
                    continue  # unknown tag
                # Write to 0th IFD (string value as bytes)
                try:
                    exif_dict.setdefault("0th", {})[tag_id] = new_val.encode('utf-8')
                except Exception:
                    pass

            exif_bytes = piexif.dump(exif_dict)
            piexif.insert(exif_bytes, str(self._photo.path))
            print(f"[ExifPanel] saved EXIF edits to {self._photo.filename}")
        except Exception as exc:
            QMessageBox.warning(self, "EXIF Save Error",
                                f"Could not save EXIF data:\n{exc}")
            return

        # Reset state
        self._original_data = [(self._table.item(r, 0).text() if self._table.item(r, 0) else "",
                                 self._table.item(r, 1).text() if self._table.item(r, 1) else "")
                                for r in range(self._table.rowCount())]
        self._is_editing = False
        self._edit_btn.setVisible(True)
        self._sc_widget.setVisible(False)
        self._table.setEditTriggers(
            QAbstractItemView.EditTrigger.NoEditTriggers)
        for row in range(self._table.rowCount()):
            item = self._table.item(row, 1)
            if item:
                item.setFlags(Qt.ItemFlag.ItemIsSelectable | Qt.ItemFlag.ItemIsEnabled)

    def _on_cancel(self):
        """Revert all edits."""
        if self._photo:
            self._populate_table(self._original_data)
        self._is_editing = False
        self._edit_btn.setVisible(True)
        self._sc_widget.setVisible(False)
        self._table.setEditTriggers(
            QAbstractItemView.EditTrigger.NoEditTriggers)
        for row in range(self._table.rowCount()):
            item = self._table.item(row, 1)
            if item:
                item.setFlags(Qt.ItemFlag.ItemIsSelectable | Qt.ItemFlag.ItemIsEnabled)


# ---------------------------------------------------------------------------
# PhotoPreviewDialog
# ---------------------------------------------------------------------------

class PhotoPreviewDialog(QDialog):
    """Full preview dialog for a photo/video with prev/next navigation + zoom."""

    _BTN = ("QPushButton { background: #333; color: white; border: none; "
            "padding: 4px 14px; border-radius: 4px; font-size: 13px; }"
            "QPushButton:hover { background: #555; }"
            "QPushButton:disabled { color: #666; background: #222; }")

    def __init__(self, photo: Photo, all_photos: List[Photo],
                 geocoder_cache=None, proxy_url: str = "", parent=None):
        super().__init__(parent)
        self.all_photos      = all_photos
        self._idx            = all_photos.index(photo) if photo in all_photos else 0
        self._geocoder_cache = geocoder_cache
        self._proxy_url      = proxy_url

        self.setWindowTitle("Preview")
        self.setMinimumSize(900, 700)
        self.resize(1100, 820)
        self.setStyleSheet("QDialog { background: #1a1a1a; }")

        self._build_ui()
        self._load_current()
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        # Install event filter on self so we catch keys even when child widgets
        # (scroll area, splitter handle) have focus
        self.installEventFilter(self)

    def eventFilter(self, obj, event):
        """Intercept key events dialog-wide so arrow navigation always works."""
        from PyQt6.QtCore import QEvent
        if event.type() == QEvent.Type.KeyPress:
            key = event.key()
            # Let text input widgets handle their own typing
            from PyQt6.QtWidgets import QLineEdit, QTextEdit
            if isinstance(obj, (QLineEdit, QTextEdit)):
                return False
            nav_keys = {Qt.Key.Key_Left, Qt.Key.Key_Right,
                        Qt.Key.Key_Up, Qt.Key.Key_Down, Qt.Key.Key_Space}
            if key in nav_keys:
                self.keyPressEvent(event)
                return True
        return False

    def showEvent(self, event):
        super().showEvent(event)
        self.setFocus(Qt.FocusReason.OtherFocusReason)

    def _build_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # ── Top toolbar ──────────────────────────────────────────────
        toolbar = QWidget()
        toolbar.setFixedHeight(44)
        toolbar.setStyleSheet("background: #111; border-bottom: 1px solid #333;")
        tb_layout = QHBoxLayout(toolbar)
        tb_layout.setContentsMargins(10, 4, 10, 4)
        tb_layout.setSpacing(6)

        self._btn_prev = QPushButton("◀  Prev")
        self._btn_prev.setStyleSheet(self._BTN)
        self._btn_prev.clicked.connect(self._go_prev)
        tb_layout.addWidget(self._btn_prev)

        self._counter_lbl = QLabel()
        self._counter_lbl.setStyleSheet("color: #aaa; font-size: 12px;")
        self._counter_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        tb_layout.addWidget(self._counter_lbl, 1)

        # Zoom controls (images only)
        self._zoom_out_btn = QPushButton("－")
        self._zoom_out_btn.setStyleSheet(self._BTN)
        self._zoom_out_btn.setFixedWidth(36)
        self._zoom_out_btn.clicked.connect(lambda: self._zoom_step(1 / 1.3))
        tb_layout.addWidget(self._zoom_out_btn)

        self._zoom_lbl = QLabel("Fit")
        self._zoom_lbl.setStyleSheet("color: #aaa; font-size: 11px; min-width: 38px;")
        self._zoom_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        tb_layout.addWidget(self._zoom_lbl)

        self._zoom_in_btn = QPushButton("＋")
        self._zoom_in_btn.setStyleSheet(self._BTN)
        self._zoom_in_btn.setFixedWidth(36)
        self._zoom_in_btn.clicked.connect(lambda: self._zoom_step(1.3))
        tb_layout.addWidget(self._zoom_in_btn)

        self._zoom_fit_btn = QPushButton("⊡ Fit")
        self._zoom_fit_btn.setStyleSheet(self._BTN)
        self._zoom_fit_btn.clicked.connect(self._reset_zoom)
        tb_layout.addWidget(self._zoom_fit_btn)

        # "Open in Player" shown only for videos
        self._btn_open = QPushButton("▶  Open in Player")
        self._btn_open.setStyleSheet(self._BTN)
        self._btn_open.setVisible(False)
        self._btn_open.clicked.connect(self._open_in_player)
        tb_layout.addWidget(self._btn_open)

        self._btn_next = QPushButton("Next  ▶")
        self._btn_next.setStyleSheet(self._BTN)
        self._btn_next.clicked.connect(self._go_next)
        tb_layout.addWidget(self._btn_next)

        root.addWidget(toolbar)

        # ── Middle: image left | location panel right ─────────────────
        self._splitter = QSplitter(Qt.Orientation.Horizontal)
        self._splitter.setStyleSheet("QSplitter::handle { background: #333; width: 3px; }")

        # Left: image / video view stacked with placeholder
        left_stack = QWidget()
        left_stack.setStyleSheet("background: #1a1a1a;")
        left_layout = QVBoxLayout(left_stack)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(0)

        self._view = ZoomableView()
        left_layout.addWidget(self._view, 1)

        self._placeholder = QLabel()
        self._placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._placeholder.setStyleSheet("background: #1a1a1a; color: #777; font-size: 16px;")
        self._placeholder.setVisible(False)
        left_layout.addWidget(self._placeholder)

        self._splitter.addWidget(left_stack)

        # Right: location + EXIF panels inside a shared scroll area
        loc_scroll = QScrollArea()
        loc_scroll.setWidgetResizable(True)
        loc_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        loc_scroll.setStyleSheet(
            "QScrollArea { border: none; background: #1e1e2e; }"
            "QScrollBar:vertical { background: #1e1e2e; width: 8px; border-radius: 4px; }"
            "QScrollBar::handle:vertical { background: #444; border-radius: 4px; }"
        )

        # Container widget to hold both panels vertically
        right_container = QWidget()
        right_container.setStyleSheet("background: #1e1e2e;")
        right_layout = QVBoxLayout(right_container)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(0)

        self._loc_panel = LocationEditorPanel(
            geocoder_cache=self._geocoder_cache,
            proxy_url=self._proxy_url,
        )
        right_layout.addWidget(self._loc_panel)

        # Thin divider between location and EXIF panels
        _div = QFrame()
        _div.setFrameShape(QFrame.Shape.HLine)
        _div.setFixedHeight(1)
        _div.setStyleSheet("background: #333; border: none;")
        right_layout.addWidget(_div)

        self._exif_panel = ExifPanel()
        right_layout.addWidget(self._exif_panel)
        right_layout.addStretch(1)

        loc_scroll.setWidget(right_container)
        loc_scroll.setMinimumWidth(260)
        self._splitter.addWidget(loc_scroll)

        # Give image 80%, location panel 20% initial split
        self._splitter.setStretchFactor(0, 4)
        self._splitter.setStretchFactor(1, 1)
        self._splitter.setSizes([820, 280])

        root.addWidget(self._splitter, 1)

        # ── Bottom info bar ──────────────────────────────────────────
        info_bar = QWidget()
        info_bar.setFixedHeight(36)
        info_bar.setStyleSheet("background: #111; border-top: 1px solid #333;")
        info_layout = QHBoxLayout(info_bar)
        info_layout.setContentsMargins(14, 0, 14, 0)

        self._info_lbl = QLabel()
        self._info_lbl.setStyleSheet("color: #ccc; font-size: 11px;")
        self._info_lbl.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        info_layout.addWidget(self._info_lbl)
        info_layout.addStretch()

        close_btn = QPushButton("✕  Close")
        close_btn.setStyleSheet(self._BTN)
        close_btn.clicked.connect(self.close)
        info_layout.addWidget(close_btn)

        root.addWidget(info_bar)

    # ------------------------------------------------------------------
    # Navigation
    # ------------------------------------------------------------------

    def _load_current(self):
        photo = self.all_photos[self._idx]
        total = len(self.all_photos)
        is_video = is_video_file(photo.path)

        tag = "🎬" if is_video else "🖼"
        self._counter_lbl.setText(f"{tag}  {photo.filename}   ({self._idx + 1} / {total})")
        self.setWindowTitle(f"Preview – {photo.filename}")

        self._btn_prev.setEnabled(self._idx > 0)
        self._btn_next.setEnabled(self._idx < total - 1)
        self._btn_open.setVisible(is_video)

        # Zoom controls only for images
        for w in (self._zoom_in_btn, self._zoom_out_btn,
                  self._zoom_fit_btn, self._zoom_lbl):
            w.setVisible(not is_video)

        # Info bar
        dt = photo.get_display_time()
        parts = [_fmt_size(photo.size), dt.strftime("%Y-%m-%d  %H:%M:%S")]
        if not is_video and photo.width and photo.height:
            parts.append(f"{photo.width} × {photo.height} px")
        if photo.camera_make or photo.camera_model:
            cam = " ".join(filter(None, [photo.camera_make, photo.camera_model]))
            parts.append(cam.strip())
        parts.append(str(photo.path))
        self._info_lbl.setText("   ·   ".join(parts))

        # Location panel
        self._loc_panel.load_photo(photo)

        # EXIF panel (images only)
        if is_video:
            self._exif_panel.setVisible(False)
        else:
            self._exif_panel.setVisible(True)
            self._exif_panel.load_photo(photo)

        # Reset view
        self._view.clear_source()
        self._update_zoom_label()

        if is_video:
            self._view.setVisible(False)
            self._placeholder.setVisible(True)
            self._placeholder.setText(
                f"🎬\n\n{photo.filename}\n\n"
                "Click  ▶ Open in Player  or press Enter\n"
                "to watch in your system video player.")
        else:
            self._placeholder.setVisible(False)
            self._view.setVisible(True)
            self._placeholder.setText("Loading…")
            QTimer.singleShot(0, lambda p=photo: self._do_load(p))

    def _do_load(self, photo: Photo):
        from PIL import Image, ImageOps
        import io
        try:
            img = Image.open(photo.path)
            try:
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.thumbnail((3840, 2160), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=92)
            buf.seek(0)
            pm = QPixmap()
            pm.loadFromData(buf.read())
            self._view.set_source(pm)
            self._update_zoom_label()
        except Exception as e:
            self._view.setVisible(False)
            self._placeholder.setVisible(True)
            self._placeholder.setText(f"Cannot load image:\n{e}")

    def _zoom_step(self, factor: float):
        self._view.zoom_by(factor)
        self._update_zoom_label()

    def _reset_zoom(self):
        self._view.zoom_to_fit()
        self._update_zoom_label()

    def _update_zoom_label(self):
        if self._view._fit_mode:
            self._zoom_lbl.setText("Fit")
        else:
            self._zoom_lbl.setText(f"{self._view._zoom * 100:.0f}%")

    def _open_in_player(self):
        photo = self.all_photos[self._idx]
        _open_system_player(photo.path)

    def _confirm_navigate_away(self) -> bool:
        """Return True if it's safe to navigate (no unsaved EXIF edits, or user confirms)."""
        if self._exif_panel.has_unsaved_changes():
            resp = QMessageBox.question(
                self, "Unsaved EXIF Changes",
                "You have unsaved EXIF edits.  Navigate away and discard them?",
                QMessageBox.StandardButton.Discard | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Cancel,
            )
            return resp == QMessageBox.StandardButton.Discard
        return True

    def _go_prev(self):
        if self._idx > 0 and self._confirm_navigate_away():
            self._idx -= 1
            self._load_current()

    def _go_next(self):
        if self._idx < len(self.all_photos) - 1 and self._confirm_navigate_away():
            self._idx += 1
            self._load_current()


    def closeEvent(self, event):
        if self._exif_panel.has_unsaved_changes():
            resp = QMessageBox.question(
                self, "Unsaved EXIF Changes",
                "You have unsaved EXIF edits.  Close and discard them?",
                QMessageBox.StandardButton.Discard | QMessageBox.StandardButton.Cancel,
                QMessageBox.StandardButton.Cancel,
            )
            if resp != QMessageBox.StandardButton.Discard:
                event.ignore()
                return
        event.accept()

    def keyPressEvent(self, event: QKeyEvent):
        key = event.key()
        if key in (Qt.Key.Key_Right, Qt.Key.Key_Space, Qt.Key.Key_Down):
            self._go_next()
        elif key in (Qt.Key.Key_Left, Qt.Key.Key_Backspace, Qt.Key.Key_Up):
            self._go_prev()
        elif key == Qt.Key.Key_Return:
            photo = self.all_photos[self._idx]
            if is_video_file(photo.path):
                self._open_in_player()
        elif key == Qt.Key.Key_Plus or key == Qt.Key.Key_Equal:
            self._zoom_step(1.3)
        elif key == Qt.Key.Key_Minus:
            self._zoom_step(1 / 1.3)
        elif key == Qt.Key.Key_0:
            self._reset_zoom()
        elif key == Qt.Key.Key_Escape:
            self.close()
        else:
            super().keyPressEvent(event)
