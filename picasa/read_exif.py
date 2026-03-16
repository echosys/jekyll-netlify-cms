"""
read_exif.py – Quick EXIF inspector tool.

Run:  python read_exif.py [optional_image_path]

Opens a file-picker (or loads the path argument immediately), then displays
ALL EXIF / GPS / metadata found in the image in a searchable, scrollable
Qt window.
"""

import sys
from pathlib import Path

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QLineEdit, QTreeWidget, QTreeWidgetItem, QFileDialog,
    QPushButton, QStatusBar, QHeaderView, QSizePolicy,
    QTextEdit, QSplitter, QAbstractItemView, QMenu,
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QFont, QColor, QCursor

# ── EXIF backends ────────────────────────────────────────────────────────────
try:
    from PIL import Image
    from PIL.ExifTags import TAGS, GPSTAGS
    _PIL_OK = True
except ImportError:
    _PIL_OK = False

try:
    import piexif
    _PIEXIF_OK = True
except ImportError:
    _PIEXIF_OK = False


# ── Helpers ──────────────────────────────────────────────────────────────────

def _rational(v):
    """Render a rational / IFDRational as a readable string."""
    try:
        f = float(v)
        return f"{f:.6g}"
    except Exception:
        return str(v)


def _fmt_value(val) -> str:
    """Best-effort human-readable string for any EXIF value."""
    if isinstance(val, bytes):
        return _decode_bytes(val)
    if isinstance(val, tuple):
        return "  ·  ".join(_rational(x) for x in val)
    if isinstance(val, list):
        return str(val)
    return str(val)


# Known 8-byte UserComment charset headers defined by the EXIF spec
_UC_HEADERS = {
    b"ASCII\x00\x00\x00":   "ascii",
    b"UNICODE\x00":         "utf-16",
    b"JIS\x00\x00\x00\x00\x00": "iso-2022-jp",
    b"\x00\x00\x00\x00\x00\x00\x00\x00": None,   # undefined → try UTF-8
}


def _decode_bytes(data: bytes) -> str:
    """
    Decode a raw EXIF bytes value to a human-readable string.

    Handles:
    - EXIF UserComment (8-byte charset header + payload)
    - Plain UTF-8
    - latin-1 fallback
    - hex dump for truly binary data
    """
    if len(data) == 0:
        return ""

    # Strip EXIF UserComment 8-byte charset header if present
    payload = data
    forced_enc = None
    if len(data) >= 8:
        header = data[:8]
        if header in _UC_HEADERS:
            forced_enc = _UC_HEADERS[header]
            payload = data[8:]

    # Decode with the charset the header specified
    if forced_enc:
        try:
            return payload.decode(forced_enc).strip("\x00").strip()
        except Exception:
            pass   # fall through to heuristics on the payload

    # Try UTF-8 first (covers ASCII, Chinese, emoji, etc.)
    try:
        text = payload.decode("utf-8").strip("\x00").strip()
        # Accept if it has any printable content (don't reject non-ASCII)
        if text and any(not c.isspace() for c in text):
            return text
    except UnicodeDecodeError:
        pass

    # Try latin-1 (lossless, always succeeds – only use for short values
    # that look like they might be legacy ASCII camera strings)
    try:
        text = payload.decode("latin-1").strip("\x00").strip()
        # Only trust latin-1 if all chars are in the printable ASCII range;
        # otherwise it's binary data pretending to be text
        if text and all(0x20 <= ord(c) < 0x80 or c in "\t\n\r" for c in text):
            return text
    except Exception:
        pass

    # Last resort: hex dump
    return data.hex(" ")


def _collect_pil(path: Path) -> dict:
    """Return {section_name: [(tag_id, tag_name, raw_val, display_val)]}."""
    sections: dict = {}
    img = Image.open(path)
    exif_obj = img.getexif()
    if not exif_obj:
        return sections

    # IFD 0 (standard image tags)
    rows = []
    for tag_id, raw_val in exif_obj.items():
        name = TAGS.get(tag_id, f"0x{tag_id:04X}")
        rows.append((tag_id, name, raw_val, _fmt_value(raw_val)))
    if rows:
        sections["IFD0 (Image)"] = sorted(rows, key=lambda r: r[0])

    # Exif Sub-IFD
    exif_ifd = exif_obj.get_ifd(0x8769)
    if exif_ifd:
        rows = []
        for tag_id, raw_val in exif_ifd.items():
            name = TAGS.get(tag_id, f"0x{tag_id:04X}")
            rows.append((tag_id, name, raw_val, _fmt_value(raw_val)))
        sections["Exif Sub-IFD"] = sorted(rows, key=lambda r: r[0])

    # GPS IFD
    gps_ifd = exif_obj.get_ifd(0x8825)
    if gps_ifd:
        rows = []
        for tag_id, raw_val in gps_ifd.items():
            name = GPSTAGS.get(tag_id, f"GPS:0x{tag_id:02X}")
            rows.append((tag_id, name, raw_val, _fmt_value(raw_val)))
        sections["GPS IFD"] = sorted(rows, key=lambda r: r[0])

    # Interop IFD
    interop = exif_obj.get_ifd(0xA005)
    if interop:
        rows = []
        for tag_id, raw_val in interop.items():
            name = TAGS.get(tag_id, f"Interop:0x{tag_id:04X}")
            rows.append((tag_id, name, raw_val, _fmt_value(raw_val)))
        sections["Interop IFD"] = sorted(rows, key=lambda r: r[0])

    # IFD1 (thumbnail)
    try:
        ifd1 = exif_obj.get_ifd(0x0001)
        if ifd1:
            rows = []
            for tag_id, raw_val in ifd1.items():
                name = TAGS.get(tag_id, f"0x{tag_id:04X}")
                rows.append((tag_id, name, raw_val, _fmt_value(raw_val)))
            if rows:
                sections["IFD1 (Thumbnail)"] = sorted(rows, key=lambda r: r[0])
    except Exception:
        pass

    return sections


def _piexif_tag_name(ifd: str, tag_id: int) -> str:
    """Reverse-lookup a numeric tag id to its piexif attribute name."""
    tables = {
        "Image":   piexif.ImageIFD,
        "GPS":     piexif.GPSIFD,
        "Exif":    piexif.ExifIFD,
        "Interop": piexif.InteropIFD,
    }
    table = tables.get(ifd)
    if table:
        for attr, val in vars(table).items():
            if val == tag_id and not attr.startswith("_"):
                return attr
    return f"0x{tag_id:04X}"


def _collect_piexif(path: Path) -> dict:
    """Sections from piexif (catches tags PIL might miss, raw rationals)."""
    sections: dict = {}
    try:
        ed = piexif.load(str(path))
    except Exception:
        return sections

    IFD_MAP = {
        "0th":     ("0th IFD (piexif)",            "Image"),
        "Exif":    ("Exif IFD (piexif)",            "Exif"),
        "GPS":     ("GPS IFD (piexif)",             "GPS"),
        "1st":     ("1st IFD / Thumbnail (piexif)", "Image"),
        "Interop": ("Interop IFD (piexif)",         "Interop"),
    }
    for key, (display_name, ifd_type) in IFD_MAP.items():
        ifd = ed.get(key, {})
        if not ifd:
            continue
        rows = []
        for tag_id, raw_val in ifd.items():
            name = _piexif_tag_name(ifd_type, tag_id)
            rows.append((tag_id, name, raw_val, _fmt_value(raw_val)))
        if rows:
            sections[display_name] = sorted(rows, key=lambda r: r[0])
    return sections


def _collect_all(path: Path) -> dict:
    """Merge PIL + piexif results, plus basic file/image info."""
    sections: dict = {}

    if _PIL_OK:
        try:
            sections.update(_collect_pil(path))
        except Exception as exc:
            sections["[PIL error]"] = [(-1, "error", str(exc), str(exc))]

    if _PIEXIF_OK:
        try:
            for name, rows in _collect_piexif(path).items():
                if name not in sections:   # don't overwrite PIL's richer values
                    sections[name] = rows
        except Exception:
            pass

    # File / image metadata
    if _PIL_OK:
        try:
            img = Image.open(path)
            stat = path.stat()
            sections["File / Image Info"] = [
                (-1, "Format",    img.format,  str(img.format)),
                (-2, "Mode",      img.mode,    str(img.mode)),
                (-3, "Width",     img.width,   str(img.width)),
                (-4, "Height",    img.height,  str(img.height)),
                (-5, "File size", stat.st_size,
                 f"{stat.st_size:,} bytes  ({stat.st_size / 1024:.1f} KB)"),
                (-6, "Full path", str(path),   str(path)),
            ]
        except Exception:
            pass

    return sections


# ── Colours ──────────────────────────────────────────────────────────────────

_DARK   = "#1e1e2e"
_PANEL  = "#2a2a3e"
_ACCENT = "#8ab4f8"
_TEXT   = "#cdd6f4"
_MUTED  = "#6c7086"
_GREEN  = "#a6e3a1"
_YELLOW = "#f9e2af"
_RED    = "#f38ba8"

_SECTION_BG = [
    QColor("#2d3748"), QColor("#2d3728"), QColor("#2d2d48"),
    QColor("#3d2d38"), QColor("#2d3d38"),
]


# ── Main Window ──────────────────────────────────────────────────────────────


class ExifInspectorWindow(QMainWindow):

    def __init__(self):
        super().__init__()
        self.setWindowTitle("EXIF Inspector")
        self.resize(980, 800)
        self.setStyleSheet(f"QMainWindow {{ background: {_DARK}; }}")
        self._all_child_items: list = []
        self._build_ui()

    # ── UI construction ──────────────────────────────────────────────

    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)
        root.setContentsMargins(12, 10, 12, 6)
        root.setSpacing(8)

        # Top bar: path label + open button
        top = QHBoxLayout()
        self._path_lbl = QLabel("No file loaded")
        self._path_lbl.setStyleSheet(f"color: {_MUTED}; font-size: 11px;")
        self._path_lbl.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._path_lbl.setTextInteractionFlags(
            Qt.TextInteractionFlag.TextSelectableByMouse)
        top.addWidget(self._path_lbl)

        open_btn = QPushButton("📂  Open Image…")
        open_btn.setFixedHeight(28)
        open_btn.setStyleSheet(
            f"QPushButton {{ background: {_ACCENT}; color: #000; border: none; "
            f"border-radius: 4px; padding: 0 14px; font-weight: bold; font-size: 12px; }}"
            f"QPushButton:hover {{ background: #aecbfa; }}")
        open_btn.clicked.connect(self._open_file)
        top.addWidget(open_btn)
        root.addLayout(top)

        # Search / filter bar
        srow = QHBoxLayout()
        srow.addWidget(QLabel("🔍"))
        self._search = QLineEdit()
        self._search.setPlaceholderText("Filter by tag name or value…")
        self._search.setStyleSheet(
            f"background: {_PANEL}; color: {_TEXT}; border: 1px solid #444; "
            f"border-radius: 4px; padding: 4px 8px; font-size: 12px;")
        self._search.setFixedHeight(28)
        self._search.textChanged.connect(self._on_search)
        srow.addWidget(self._search)

        clr = QPushButton("✕")
        clr.setFixedSize(28, 28)
        clr.setStyleSheet(
            f"QPushButton {{ background: {_PANEL}; color: {_MUTED}; border: 1px solid #444; "
            f"border-radius: 4px; font-size: 12px; }}"
            f"QPushButton:hover {{ color: {_TEXT}; }}")
        clr.clicked.connect(self._search.clear)
        srow.addWidget(clr)
        root.addLayout(srow)

        # ── Splitter: tree (top) + detail panel (bottom) ─────────────
        splitter = QSplitter(Qt.Orientation.Vertical)
        splitter.setStyleSheet("QSplitter::handle { background: #444; height: 4px; }")

        # Tree widget
        self._tree = QTreeWidget()
        self._tree.setColumnCount(3)
        self._tree.setHeaderLabels(["Tag Name", "Value", "Tag ID"])
        self._tree.setStyleSheet(f"""
            QTreeWidget {{
                background: {_DARK};
                color: {_TEXT};
                border: 1px solid #444;
                border-radius: 4px;
                font-size: 12px;
                outline: none;
            }}
            QTreeWidget::item {{ padding: 3px 4px; border: none; }}
            QTreeWidget::item:selected {{ background: #3a4a6b; color: {_TEXT}; }}
            QHeaderView::section {{
                background: {_PANEL};
                color: {_ACCENT};
                border: none;
                border-bottom: 1px solid #444;
                padding: 4px 8px;
                font-weight: bold;
            }}
        """)
        hdr = self._tree.header()
        hdr.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        hdr.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        hdr.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        # Enable extended selection so multiple rows can be copied at once
        self._tree.setSelectionMode(QAbstractItemView.SelectionMode.ExtendedSelection)
        self._tree.itemSelectionChanged.connect(self._on_selection_changed)
        self._tree.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self._tree.customContextMenuRequested.connect(self._on_context_menu)
        splitter.addWidget(self._tree)

        # Detail panel – full selectable text of the selected value
        detail_wrap = QWidget()
        detail_wrap.setStyleSheet(f"background: {_PANEL}; border-radius: 4px;")
        dv = QVBoxLayout(detail_wrap)
        dv.setContentsMargins(6, 4, 6, 4)
        dv.setSpacing(2)

        detail_hdr = QHBoxLayout()
        self._detail_tag_lbl = QLabel("Select a row to see its full value")
        self._detail_tag_lbl.setStyleSheet(
            f"color: {_ACCENT}; font-size: 11px; font-weight: bold;")
        detail_hdr.addWidget(self._detail_tag_lbl)
        detail_hdr.addStretch()

        copy_val_btn = QPushButton("Copy value")
        copy_val_btn.setFixedHeight(22)
        copy_val_btn.setStyleSheet(
            f"QPushButton {{ background: #333; color: {_TEXT}; border: 1px solid #555; "
            f"border-radius: 3px; padding: 0 8px; font-size: 11px; }}"
            f"QPushButton:hover {{ background: #444; }}")
        copy_val_btn.clicked.connect(self._copy_detail)
        detail_hdr.addWidget(copy_val_btn)
        dv.addLayout(detail_hdr)

        self._detail_box = QTextEdit()
        self._detail_box.setReadOnly(True)
        self._detail_box.setStyleSheet(
            f"background: {_DARK}; color: {_TEXT}; border: 1px solid #444; "
            f"border-radius: 3px; font-size: 12px; font-family: monospace; padding: 4px;")
        self._detail_box.setMinimumHeight(60)
        self._detail_box.setMaximumHeight(200)
        dv.addWidget(self._detail_box)

        splitter.addWidget(detail_wrap)
        splitter.setSizes([580, 140])
        root.addWidget(splitter)

        # Status bar
        self._status = QStatusBar()
        self._status.setStyleSheet(f"color: {_MUTED}; font-size: 11px;")
        self.setStatusBar(self._status)
        libs = []
        if not _PIL_OK:    libs.append("⚠ Pillow not installed")
        if not _PIEXIF_OK: libs.append("⚠ piexif not installed")
        msg = "Open an image file to inspect its EXIF data.  Click any row to see its full value below."
        if libs:
            msg += "  " + "  ".join(libs)
        self._status.showMessage(msg)

    # ── File loading ─────────────────────────────────────────────────

    def _open_file(self):
        path_str, _ = QFileDialog.getOpenFileName(
            self, "Select Image File", str(Path.home()),
            "Images (*.jpg *.jpeg *.png *.tiff *.tif *.heic *.heif "
            "*.webp *.bmp *.gif *.cr2 *.nef *.arw *.dng *.orf *.rw2);;All Files (*)",
        )
        if path_str:
            self._load(Path(path_str))

    def _load(self, path: Path):
        self._tree.clear()
        self._all_child_items.clear()
        self._search.clear()
        self._detail_box.clear()
        self._detail_tag_lbl.setText("Select a row to see its full value")
        self._path_lbl.setText(str(path))
        self._status.showMessage("Reading EXIF…")
        QApplication.processEvents()

        try:
            sections = _collect_all(path)
        except Exception as exc:
            self._status.showMessage(f"Error: {exc}")
            return

        if not sections:
            self._status.showMessage("No EXIF / metadata found in this file.")
            return

        _TRUNCATE = 120   # chars shown in tree Value column before "…"

        total = 0
        for i, (sec_name, rows) in enumerate(sections.items()):
            bg = _SECTION_BG[i % len(_SECTION_BG)]

            sec_item = QTreeWidgetItem([sec_name, "", ""])
            sec_item.setFont(0, QFont("", 11, QFont.Weight.Bold))
            sec_item.setForeground(0, QColor(_ACCENT))
            for col in range(3):
                sec_item.setBackground(col, bg)
            sec_item.setFlags(sec_item.flags() & ~Qt.ItemFlag.ItemIsSelectable)
            self._tree.addTopLevelItem(sec_item)

            for tag_id, tag_name, _raw, display_val in rows:
                # Truncated version shown in the tree column
                tree_val = (display_val[:_TRUNCATE] + "  …  [click to expand]"
                            if len(display_val) > _TRUNCATE else display_val)

                child = QTreeWidgetItem([
                    tag_name,
                    tree_val,
                    f"0x{tag_id:04X}" if tag_id >= 0 else "",
                ])
                # Store full value in UserRole for the detail panel + copy
                child.setData(1, Qt.ItemDataRole.UserRole, display_val)
                child.setToolTip(1, display_val[:400] + ("…" if len(display_val) > 400 else ""))

                # Colour highlights
                if "GPS" in sec_name and tag_name in (
                        "GPSLatitude", "GPSLongitude", "GPSAltitude",
                        "GPSLatitudeRef", "GPSLongitudeRef", "GPSAltitudeRef"):
                    child.setForeground(1, QColor(_GREEN))
                elif any(t in tag_name for t in ("Date", "Time", "DateTime")):
                    child.setForeground(1, QColor(_YELLOW))
                elif tag_name.startswith("0x"):
                    child.setForeground(0, QColor(_RED))

                # Dim the "…" indicator
                if len(display_val) > _TRUNCATE:
                    child.setForeground(1, QColor(_MUTED))

                sec_item.addChild(child)
                self._all_child_items.append(child)
                total += 1

            sec_item.setExpanded(True)

        self._status.showMessage(
            f"{path.name}  ·  {total} tags  ·  {len(sections)} sections  "
            f"·  click a row to expand  ·  right-click to copy"
        )

    # ── Detail panel ─────────────────────────────────────────────────

    def _on_selection_changed(self):
        items = self._tree.selectedItems()
        if not items:
            return
        item = items[0]
        full_val = item.data(1, Qt.ItemDataRole.UserRole)
        if full_val is None:
            return   # section header clicked
        tag_name = item.text(0)
        tag_id   = item.text(2)
        self._detail_tag_lbl.setText(
            f"{tag_name}  {tag_id}" if tag_id else tag_name)
        self._detail_box.setPlainText(full_val)

    def _copy_detail(self):
        text = self._detail_box.toPlainText()
        if text:
            QApplication.clipboard().setText(text)
            self._status.showMessage("Copied to clipboard.", 2000)

    # ── Context menu (right-click) ────────────────────────────────────

    def _on_context_menu(self, pos):
        items = self._tree.selectedItems()
        if not items:
            return

        menu = QMenu(self)
        menu.setStyleSheet(
            f"QMenu {{ background: {_PANEL}; color: {_TEXT}; border: 1px solid #555; "
            f"font-size: 12px; }}"
            f"QMenu::item:selected {{ background: #3a4a6b; }}")

        def _copy_col(col):
            texts = []
            for it in items:
                if it.data(1, Qt.ItemDataRole.UserRole) is None:
                    continue  # skip section headers
                if col == 1:
                    val = it.data(1, Qt.ItemDataRole.UserRole) or it.text(1)
                else:
                    val = it.text(col)
                texts.append(val)
            if texts:
                QApplication.clipboard().setText("\n".join(texts))
                self._status.showMessage(f"Copied {len(texts)} value(s).", 2000)

        def _copy_row():
            lines = []
            for it in items:
                if it.data(1, Qt.ItemDataRole.UserRole) is None:
                    continue
                full = it.data(1, Qt.ItemDataRole.UserRole) or it.text(1)
                lines.append(f"{it.text(0)}\t{full}\t{it.text(2)}")
            if lines:
                QApplication.clipboard().setText("\n".join(lines))
                self._status.showMessage(f"Copied {len(lines)} row(s).", 2000)

        menu.addAction("Copy value (full)",   lambda: _copy_col(1))
        menu.addAction("Copy tag name",        lambda: _copy_col(0))
        menu.addAction("Copy tag ID",          lambda: _copy_col(2))
        menu.addSeparator()
        menu.addAction("Copy row (tab-separated)", _copy_row)
        menu.exec(QCursor.pos())

    # ── Search / filter ──────────────────────────────────────────────

    def _on_search(self, text: str):
        text = text.strip().lower()

        if not text:
            for item in self._all_child_items:
                item.setHidden(False)
            for i in range(self._tree.topLevelItemCount()):
                self._tree.topLevelItem(i).setHidden(False)
            return

        for i in range(self._tree.topLevelItemCount()):
            sec = self._tree.topLevelItem(i)
            any_visible = False
            for j in range(sec.childCount()):
                child = sec.child(j)
                full_val = child.data(1, Qt.ItemDataRole.UserRole) or child.text(1)
                match = (text in child.text(0).lower() or
                         text in full_val.lower() or
                         text in child.text(2).lower())
                child.setHidden(not match)
                if match:
                    any_visible = True
            sec.setHidden(not any_visible)


# ── Entry point ──────────────────────────────────────────────────────────────

def main():
    app = QApplication(sys.argv)
    app.setStyle("Fusion")

    win = ExifInspectorWindow()
    win.show()

    if len(sys.argv) > 1:
        p = Path(sys.argv[1])
        if p.exists():
            QTimer.singleShot(100, lambda: win._load(p))
        else:
            win._status.showMessage(f"File not found: {sys.argv[1]}")
    else:
        # Auto-open file dialog immediately on launch
        QTimer.singleShot(150, win._open_file)

    sys.exit(app.exec())


if __name__ == "__main__":
    main()





