"""
person_dialog.py — Floating detail dialog: bio (left) + image scroll (right).
"""
from __future__ import annotations

import os
import webbrowser
from typing import TYPE_CHECKING, List

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QPixmap, QKeySequence, QShortcut
from PyQt6.QtWidgets import (
    QDialog, QHBoxLayout, QVBoxLayout, QLabel, QTextEdit, QLineEdit,
    QPushButton, QScrollArea, QWidget, QFrame, QSizePolicy,
    QDialogButtonBox, QComboBox, QToolButton, QApplication,
    QStackedWidget, QSplitter,
)

if TYPE_CHECKING:
    from models.tree_model import Tree, Node

from models.tree_model import GENDER_OPTIONS

THUMB_W = 110
THUMB_H = 90


# ──────────────────────────────────────────────────────────────────────────────
# Photo lightbox
# ──────────────────────────────────────────────────────────────────────────────

class PhotoViewer(QDialog):
    """Full-size photo viewer with prev/next navigation."""

    def __init__(self, paths: List[str], start_index: int = 0, parent=None):
        super().__init__(parent)
        self.paths = paths
        self.index = start_index
        self.setWindowTitle("Photo")
        self.setMinimumSize(800, 600)
        self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.WindowCloseButtonHint)
        self.setStyleSheet("background:#111;")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(6)

        self._img_label = QLabel()
        self._img_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._img_label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self._img_label.setStyleSheet("background:#111;")
        layout.addWidget(self._img_label, stretch=1)

        nav = QHBoxLayout()
        layout.addLayout(nav)

        self._prev_btn = QPushButton("◀  Previous")
        self._prev_btn.setStyleSheet("color:#EEE; background:#333; border:1px solid #555; padding:4px 16px; border-radius:4px;")
        self._prev_btn.clicked.connect(self._prev)
        nav.addWidget(self._prev_btn)

        self._counter = QLabel()
        self._counter.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._counter.setStyleSheet("color:#AAA; font-size:12px;")
        nav.addWidget(self._counter, stretch=1)

        self._next_btn = QPushButton("Next  ▶")
        self._next_btn.setStyleSheet("color:#EEE; background:#333; border:1px solid #555; padding:4px 16px; border-radius:4px;")
        self._next_btn.clicked.connect(self._next)
        nav.addWidget(self._next_btn)

        QShortcut(QKeySequence(Qt.Key.Key_Left),  self, activated=self._prev)
        QShortcut(QKeySequence(Qt.Key.Key_Right), self, activated=self._next)
        QShortcut(QKeySequence(Qt.Key.Key_Escape), self, activated=self.reject)

        self._show_current()

    def _show_current(self):
        path = self.paths[self.index]
        pix = QPixmap(path)
        if not pix.isNull():
            available = self._img_label.size()
            scaled = pix.scaled(
                available.width() or 760,
                available.height() or 520,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )
            self._img_label.setPixmap(scaled)
        else:
            self._img_label.setText("Cannot load image")
            self._img_label.setStyleSheet("color:#AAA; font-size:14px; background:#111;")
        total = len(self.paths)
        self._counter.setText(f"{self.index + 1} / {total}  —  {os.path.basename(path)}")
        self._prev_btn.setEnabled(self.index > 0)
        self._next_btn.setEnabled(self.index < total - 1)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._show_current()

    def _prev(self):
        if self.index > 0:
            self.index -= 1
            self._show_current()

    def _next(self):
        if self.index < len(self.paths) - 1:
            self.index += 1
            self._show_current()


# ──────────────────────────────────────────────────────────────────────────────
# Thumbnail
# ──────────────────────────────────────────────────────────────────────────────

class ImageThumb(QLabel):
    clicked = pyqtSignal(str)

    def __init__(self, filename: str, path: str, parent=None):
        super().__init__(parent)
        self.filename = filename
        pix = QPixmap(path)
        if not pix.isNull():
            self.setPixmap(pix.scaled(THUMB_W, THUMB_H,
                                      Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                                      Qt.TransformationMode.SmoothTransformation))
        else:
            self.setText("No image")
        self.setFixedSize(THUMB_W + 4, THUMB_H + 4)
        self.setFrameShape(QFrame.Shape.StyledPanel)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def mousePressEvent(self, event):
        self.clicked.emit(self.filename)


# ──────────────────────────────────────────────────────────────────────────────
# Link row  — locked by default, ✏ to edit, ✔ to confirm
# ──────────────────────────────────────────────────────────────────────────────

_BTN_STYLE = (
    "QToolButton { border:1px solid #CCC; border-radius:3px; padding:1px 4px; "
    "background:#FAFAFA; font-size:12px; }"
    "QToolButton:hover { background:#E3F2FD; border-color:#90CAF9; }"
)
_OPEN_STYLE = (
    "QToolButton { border:1px solid #90CAF9; border-radius:3px; padding:1px 4px; "
    "background:#E3F2FD; color:#1565C0; font-size:12px; }"
    "QToolButton:hover { background:#BBDEFB; }"
)


class LinkRow(QWidget):
    """Compact link row: locked view with ✏ edit / ✔ save toggle."""
    remove_requested = pyqtSignal(object)

    def __init__(self, label: str = "", url: str = "", parent=None):
        super().__init__(parent)
        self._stored_label = label
        self._stored_url   = url
        self._editing      = False

        outer = QHBoxLayout(self)
        outer.setContentsMargins(0, 1, 0, 1)
        outer.setSpacing(3)

        # ── stacked: display label vs edit fields ──
        self._stack = QStackedWidget()
        self._stack.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        outer.addWidget(self._stack, stretch=1)

        # page 0 — display
        display_w = QWidget()
        display_l = QHBoxLayout(display_w)
        display_l.setContentsMargins(0, 0, 0, 0)
        display_l.setSpacing(4)
        self._lbl_label = QLabel()
        self._lbl_label.setFixedWidth(100)
        self._lbl_label.setStyleSheet("color:#555; font-size:11px;")
        self._lbl_url = QLabel()
        self._lbl_url.setStyleSheet("color:#1565C0; font-size:11px; text-decoration:underline;")
        self._lbl_url.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        self._lbl_url.setTextInteractionFlags(Qt.TextInteractionFlag.NoTextInteraction)
        self._lbl_url.setCursor(Qt.CursorShape.PointingHandCursor)
        self._lbl_url.mousePressEvent = lambda _e: self._open()
        display_l.addWidget(self._lbl_label)
        display_l.addWidget(self._lbl_url, stretch=1)
        self._stack.addWidget(display_w)   # index 0

        # page 1 — edit
        edit_w = QWidget()
        edit_l = QHBoxLayout(edit_w)
        edit_l.setContentsMargins(0, 0, 0, 0)
        edit_l.setSpacing(3)
        self._edit_label = QLineEdit()
        self._edit_label.setPlaceholderText("Label")
        self._edit_label.setFixedWidth(100)
        self._edit_label.setFixedHeight(22)
        self._edit_url = QLineEdit()
        self._edit_url.setPlaceholderText("https://…")
        self._edit_url.setFixedHeight(22)
        edit_l.addWidget(self._edit_label)
        edit_l.addWidget(self._edit_url, stretch=1)
        self._stack.addWidget(edit_w)      # index 1

        # ── buttons ──
        self._open_btn = QToolButton()
        self._open_btn.setText("↗")
        self._open_btn.setToolTip("Open in browser")
        self._open_btn.setFixedSize(24, 24)
        self._open_btn.setStyleSheet(_OPEN_STYLE)
        self._open_btn.clicked.connect(lambda _checked=False: self._open())
        outer.addWidget(self._open_btn)

        self._edit_btn = QToolButton()
        self._edit_btn.setText("✏")
        self._edit_btn.setToolTip("Edit")
        self._edit_btn.setFixedSize(24, 24)
        self._edit_btn.setStyleSheet(_BTN_STYLE)
        self._edit_btn.clicked.connect(self._toggle_edit)
        outer.addWidget(self._edit_btn)

        del_btn = QToolButton()
        del_btn.setText("✕")
        del_btn.setToolTip("Remove")
        del_btn.setFixedSize(24, 24)
        del_btn.setStyleSheet(_BTN_STYLE)
        del_btn.clicked.connect(lambda: self.remove_requested.emit(self))
        outer.addWidget(del_btn)

        self._refresh_display()

    # ------------------------------------------------------------------
    def _refresh_display(self):
        label = self._stored_label or "(no label)"
        url   = self._stored_url   or "(no url)"
        self._lbl_label.setText(label)
        self._lbl_url.setText(url)
        self._stack.setCurrentIndex(0)
        self._edit_btn.setText("✏")
        self._edit_btn.setToolTip("Edit")

    def _toggle_edit(self):
        if not self._editing:
            # Switch to edit mode
            self._edit_label.setText(self._stored_label)
            self._edit_url.setText(self._stored_url)
            self._stack.setCurrentIndex(1)
            self._edit_btn.setText("✔")
            self._edit_btn.setToolTip("Save changes")
            self._editing = True
            self._edit_label.setFocus()
        else:
            # Commit
            self._stored_label = self._edit_label.text().strip()
            self._stored_url   = self._edit_url.text().strip()
            self._editing = False
            self._refresh_display()

    def _open(self):
        url = self._edit_url.text().strip() if self._editing else self._stored_url.strip()
        if not url or url == "(no url)":
            return
        if "://" not in url:
            url = "https://" + url
        webbrowser.open(url)

    def to_dict(self) -> dict:
        # If mid-edit, commit first
        if self._editing:
            self._stored_label = self._edit_label.text().strip()
            self._stored_url   = self._edit_url.text().strip()
        return {"label": self._stored_label, "url": self._stored_url}


# ──────────────────────────────────────────────────────────────────────────────
# Main dialog
# ──────────────────────────────────────────────────────────────────────────────

class PersonDialog(QDialog):
    """Floating person detail window."""

    saved = pyqtSignal(str)

    def __init__(self, node: "Node", tree: "Tree", tree_dir: str, parent=None):
        super().__init__(parent)
        self.node = node
        self.tree = tree
        self.tree_dir = tree_dir
        self._photo_paths: List[str] = []
        self._link_rows:   List[LinkRow] = []
        self.setWindowTitle(f"{node.name}  ({node.years_label()})")
        self.setMinimumSize(780, 520)
        self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.WindowCloseButtonHint)
        self._build_ui()
        self._populate_images()
        # Snapshot for dirty detection — taken after UI is built
        self._snapshot = self._current_values()
        # Cmd+W / Ctrl+W closes the dialog (asking if dirty)
        QShortcut(QKeySequence("Ctrl+W"), self, activated=self.close)

    def _current_values(self) -> dict:
        """Return a dict of all editable field values for dirty comparison."""
        return {
            "name":   self._name.text().strip(),
            "birth":  self._birth.text().strip(),
            "death":  self._death.text().strip(),
            "gender": self._gender.currentData(),
            "bio":    self._bio.toPlainText(),
            "links":  [r.to_dict() for r in self._link_rows],
        }

    def _is_dirty(self) -> bool:
        return self._current_values() != self._snapshot

    # ------------------------------------------------------------------
    def _build_ui(self):
        # Root: left panel | right panel
        root = QHBoxLayout(self)
        root.setContentsMargins(8, 8, 8, 8)
        root.setSpacing(12)

        # ═══════════════════════════════════════════════════════════════
        # LEFT — bio fields + Save/Cancel at bottom
        # ═══════════════════════════════════════════════════════════════
        left_outer = QVBoxLayout()
        root.addLayout(left_outer, stretch=2)

        title = QLabel(f"<b>{self.node.name}</b>")
        title.setStyleSheet("font-size:14px;")
        left_outer.addWidget(title)

        form = QVBoxLayout()
        form.setSpacing(3)
        left_outer.addLayout(form)

        form.addWidget(QLabel("Name:"))
        self._name = QLineEdit(self.node.name or "")
        self._name.setPlaceholderText("Full name")
        form.addWidget(self._name)

        form.addWidget(QLabel("Born:"))
        self._birth = QLineEdit(self.node.birth_date or "")
        form.addWidget(self._birth)

        form.addWidget(QLabel("Gender:"))
        self._gender = QComboBox()
        for g in GENDER_OPTIONS:
            self._gender.addItem(g.capitalize(), userData=g)
        current_gender = getattr(self.node, "gender", "unknown")
        idx = next((i for i, g in enumerate(GENDER_OPTIONS) if g == current_gender), 0)
        self._gender.setCurrentIndex(idx)
        form.addWidget(self._gender)

        form.addWidget(QLabel("Passed away (leave blank if living):"))
        self._death = QLineEdit(self.node.death_date or "")
        form.addWidget(self._death)

        form.addWidget(QLabel("Bio:"))
        self._bio = QTextEdit()
        self._bio.setPlainText(self.node.bio or "")
        self._bio.setMinimumHeight(80)
        form.addWidget(self._bio)

        left_outer.addStretch()

        btns = QDialogButtonBox(QDialogButtonBox.StandardButton.Save |
                                QDialogButtonBox.StandardButton.Cancel)
        btns.accepted.connect(self._save)
        btns.rejected.connect(self.reject)
        left_outer.addWidget(btns)

        # ═══════════════════════════════════════════════════════════════
        # RIGHT — vertical splitter: Photos (top ~50%) | Links (bottom ~50%)
        # ═══════════════════════════════════════════════════════════════
        right_splitter = QSplitter(Qt.Orientation.Vertical)
        right_splitter.setChildrenCollapsible(False)
        root.addWidget(right_splitter, stretch=3)

        # ── Photos pane ───────────────────────────────────────────────
        photos_pane = QWidget()
        photos_vl = QVBoxLayout(photos_pane)
        photos_vl.setContentsMargins(0, 0, 0, 0)
        photos_vl.setSpacing(4)

        photos_vl.addWidget(QLabel("<b>Photos</b>"))

        photo_scroll = QScrollArea()
        photo_scroll.setWidgetResizable(True)
        photo_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOn)
        photo_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._img_container = QWidget()
        self._img_layout = QHBoxLayout(self._img_container)
        self._img_layout.setSpacing(6)
        self._img_layout.setAlignment(Qt.AlignmentFlag.AlignLeft)
        self._img_container.setMinimumHeight(THUMB_H + 8)
        photo_scroll.setWidget(self._img_container)
        photo_scroll.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        photos_vl.addWidget(photo_scroll, stretch=1)

        right_splitter.addWidget(photos_pane)

        # ── Links pane ────────────────────────────────────────────────
        links_pane = QWidget()
        links_vl = QVBoxLayout(links_pane)
        links_vl.setContentsMargins(0, 4, 0, 0)
        links_vl.setSpacing(4)

        links_header = QHBoxLayout()
        links_header.addWidget(QLabel("<b>Links</b>"))
        add_link_btn = QPushButton("+ Add")
        add_link_btn.setFixedHeight(20)
        add_link_btn.setFixedWidth(52)
        add_link_btn.setStyleSheet(
            "QPushButton { font-size:11px; color:#1565C0; background:#E3F2FD; "
            "border:1px solid #90CAF9; border-radius:3px; padding:1px 6px; }"
            "QPushButton:hover { background:#BBDEFB; }"
        )
        add_link_btn.clicked.connect(lambda: self._add_link_row())
        links_header.addWidget(add_link_btn)
        links_header.addStretch()
        links_vl.addLayout(links_header)

        # Scrollable rows — fills all remaining height in the links pane
        self._links_container = QWidget()
        self._links_layout = QVBoxLayout(self._links_container)
        self._links_layout.setContentsMargins(0, 0, 0, 0)
        self._links_layout.setSpacing(2)
        self._links_layout.addStretch()   # pins rows to top

        links_scroll = QScrollArea()
        links_scroll.setWidgetResizable(True)
        links_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        links_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        links_scroll.setWidget(self._links_container)
        links_scroll.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        links_scroll.setFrameShape(QFrame.Shape.StyledPanel)
        links_vl.addWidget(links_scroll, stretch=1)

        right_splitter.addWidget(links_pane)

        # Equal initial split
        right_splitter.setSizes([1000, 1000])

        # Populate existing links
        for link in (self.node.links or []):
            self._add_link_row(link.get("label", ""), link.get("url", ""))

    # ------------------------------------------------------------------
    def _add_link_row(self, label: str = "", url: str = ""):
        row = LinkRow(label, url, self._links_container)
        row.remove_requested.connect(self._remove_link_row)
        # Insert before the trailing stretch (last item)
        insert_pos = self._links_layout.count() - 1
        self._links_layout.insertWidget(insert_pos, row)
        self._link_rows.append(row)

    def _remove_link_row(self, row: "LinkRow"):
        self._links_layout.removeWidget(row)
        row.setParent(None)
        if row in self._link_rows:
            self._link_rows.remove(row)

    def _populate_images(self):
        res_dir = os.path.join(self.tree_dir, "resources")
        self._photo_paths.clear()
        for resource in self.tree.resources:
            if self.node.id in resource.tagged_person_ids():
                path = os.path.join(res_dir, resource.filename)
                if os.path.exists(path):
                    self._photo_paths.append(path)
                    thumb = ImageThumb(resource.filename, path)
                    thumb.clicked.connect(self._open_photo)
                    self._img_layout.addWidget(thumb)

    def _open_photo(self, filename: str):
        res_dir = os.path.join(self.tree_dir, "resources")
        full = os.path.join(res_dir, filename)
        try:
            idx = self._photo_paths.index(full)
        except ValueError:
            idx = 0
        viewer = PhotoViewer(self._photo_paths, idx, self)
        viewer.exec()

    # ------------------------------------------------------------------
    def _save(self):
        new_name = self._name.text().strip()
        if new_name:
            self.node.name = new_name
        self.node.birth_date = self._birth.text().strip() or None
        self.node.death_date = self._death.text().strip() or None
        self.node.gender     = self._gender.currentData()
        self.node.bio        = self._bio.toPlainText()
        self.node.links      = [r.to_dict() for r in self._link_rows
                                 if r.to_dict()["label"] or r.to_dict()["url"]]
        self.setWindowTitle(f"{self.node.name}  ({self.node.years_label()})")
        self._snapshot = self._current_values()   # reset dirty state
        self.saved.emit(self.node.id)
        self.accept()

    def closeEvent(self, event):
        if self._is_dirty():
            from PyQt6.QtWidgets import QMessageBox
            reply = QMessageBox.question(
                self, "Unsaved Changes",
                "You have unsaved changes to this person's profile.\nSave before closing?",
                QMessageBox.StandardButton.Save |
                QMessageBox.StandardButton.Discard |
                QMessageBox.StandardButton.Cancel,
            )
            if reply == QMessageBox.StandardButton.Save:
                self._save()
                event.accept()
            elif reply == QMessageBox.StandardButton.Discard:
                event.accept()
            else:
                event.ignore()
        else:
            event.accept()


