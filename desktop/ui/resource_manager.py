"""
resource_manager.py — Photo library tab: thumbnail grid + filter + upload.
"""
from __future__ import annotations

import os
import shutil
from typing import Optional, TYPE_CHECKING

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QPixmap
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QScrollArea,
    QPushButton, QComboBox, QLineEdit, QFrame, QSizePolicy,
    QFileDialog, QGridLayout, QToolButton,
)

from models.resource_model import Resource, ResourceTags
from models.tree_model import new_id

if TYPE_CHECKING:
    from models.tree_model import Tree

THUMB_SIZE = 150
# Extra height for the tag lines below the image
THUMB_EXTRA_H = 44


class ResourceThumb(QFrame):
    clicked = pyqtSignal(str)   # resource.id

    def __init__(self, resource: Resource, img_path: str, tree=None, parent=None):
        super().__init__(parent)
        self.resource = resource
        self.setFrameShape(QFrame.Shape.StyledPanel)
        self.setFixedSize(THUMB_SIZE + 10, THUMB_SIZE + THUMB_EXTRA_H)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(3, 3, 3, 2)
        layout.setSpacing(2)

        # image
        img_label = QLabel()
        pix = QPixmap(img_path)
        if not pix.isNull():
            img_label.setPixmap(pix.scaled(THUMB_SIZE, THUMB_SIZE,
                                           Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                                           Qt.TransformationMode.SmoothTransformation))
        else:
            img_label.setText("No image")
            img_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        img_label.setFixedSize(THUMB_SIZE, THUMB_SIZE)
        layout.addWidget(img_label)

        # filename
        name_label = QLabel(resource.filename[:22])
        name_label.setStyleSheet("font-size:8px; color:#555;")
        name_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(name_label)

        # tags line: person names + location + custom tags
        tag_parts = []
        if tree:
            for pid in resource.tags.persons:
                if pid.startswith("__orphan__:"):
                    orphan_name = pid[len("__orphan__:"):]
                    tag_parts.append(f"⚠{orphan_name.split()[0]}")
                else:
                    node = tree.get_node(pid)
                    if node:
                        tag_parts.append(node.name.split()[0])
        if resource.tags.location:
            tag_parts.append(f"📍{resource.tags.location.split(',')[0].strip()}")
        if resource.tags.custom_tags:
            tag_parts.extend(resource.tags.custom_tags[:2])  # show up to 2

        tags_label = QLabel(("  ".join(tag_parts)) if tag_parts else "—")
        tags_label.setStyleSheet("font-size:8px; color:#1565C0;")
        tags_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        tags_label.setWordWrap(False)
        # truncate display if too long
        fm_text = "  ".join(tag_parts)
        tags_label.setText(fm_text[:28] + ("…" if len(fm_text) > 28 else ""))
        layout.addWidget(tags_label)

    def mousePressEvent(self, event):
        self.clicked.emit(self.resource.id)


class ResourceManager(QWidget):
    open_tag_editor = pyqtSignal(str)   # resource.id
    tree_modified = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.tree: Optional[Tree] = None
        self.tree_dir: Optional[str] = None
        self._build_ui()

    # ------------------------------------------------------------------
    def _build_ui(self):
        root = QVBoxLayout(self)

        # filter bar
        filter_row = QHBoxLayout()
        root.addLayout(filter_row)

        filter_row.addWidget(QLabel("Person:"))
        self._filter_person = QComboBox()
        self._filter_person.addItem("All")
        self._filter_person.currentIndexChanged.connect(self._apply_filter)
        filter_row.addWidget(self._filter_person)

        filter_row.addWidget(QLabel("Location:"))
        self._filter_loc = QComboBox()
        self._filter_loc.addItem("All")
        self._filter_loc.currentIndexChanged.connect(self._apply_filter)
        filter_row.addWidget(self._filter_loc)

        filter_row.addWidget(QLabel("Tag:"))
        self._filter_tag = QLineEdit()
        self._filter_tag.setPlaceholderText("custom tag…")
        self._filter_tag.textChanged.connect(self._apply_filter)
        filter_row.addWidget(self._filter_tag)

        filter_row.addStretch()

        upload_btn = QPushButton("⬆ Upload Images")
        upload_btn.clicked.connect(self._upload_images)
        filter_row.addWidget(upload_btn)

        # grid scroll
        self._scroll = QScrollArea()
        self._scroll.setWidgetResizable(True)
        self._grid_widget = QWidget()
        self._grid = QGridLayout(self._grid_widget)
        self._grid.setSpacing(8)
        self._scroll.setWidget(self._grid_widget)
        root.addWidget(self._scroll)

    # ------------------------------------------------------------------
    def load_tree(self, tree: "Tree", tree_dir: str):
        self.tree = tree
        self.tree_dir = tree_dir
        self._populate_filters()
        self._apply_filter()

    def clear(self):
        self.tree = None
        self.tree_dir = None
        self._clear_grid()

    # ------------------------------------------------------------------
    def _populate_filters(self):
        self._filter_person.blockSignals(True)
        self._filter_loc.blockSignals(True)
        self._filter_person.clear()
        self._filter_loc.clear()
        self._filter_person.addItem("All")
        self._filter_loc.addItem("All")

        if not self.tree:
            return

        names = {n.name for n in self.tree.nodes}
        for name in sorted(names):
            self._filter_person.addItem(name)

        locs = set()
        for r in self.tree.resources:
            if r.tags.location:
                locs.add(r.tags.location)
        for loc in sorted(locs):
            self._filter_loc.addItem(loc)

        self._filter_person.blockSignals(False)
        self._filter_loc.blockSignals(False)

    def _apply_filter(self):
        self._clear_grid()
        if not self.tree:
            return

        person_filter = self._filter_person.currentText()
        loc_filter = self._filter_loc.currentText()
        tag_filter = self._filter_tag.text().strip().lower()

        res_dir = os.path.join(self.tree_dir, "resources")
        col = 0
        row = 0
        max_cols = max(1, (self._scroll.width() - 20) // (THUMB_SIZE + 20))

        for resource in self.tree.resources:
            if not self._matches_filter(resource, person_filter, loc_filter, tag_filter):
                continue
            path = os.path.join(res_dir, resource.filename)
            thumb = ResourceThumb(resource, path, tree=self.tree)
            thumb.clicked.connect(self.open_tag_editor)
            self._grid.addWidget(thumb, row, col)
            col += 1
            if col >= max_cols:
                col = 0
                row += 1

    def _matches_filter(self, resource: Resource, person: str, loc: str, tag: str) -> bool:
        if person != "All":
            node = next((n for n in (self.tree.nodes if self.tree else []) if n.name == person), None)
            if node and node.id not in resource.tagged_person_ids():
                return False
        if loc != "All" and resource.tags.location != loc:
            return False
        if tag and tag not in [t.lower() for t in resource.tags.custom_tags]:
            return False
        return True

    def _clear_grid(self):
        while self._grid.count():
            item = self._grid.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

    # ------------------------------------------------------------------
    def _upload_images(self):
        if not self.tree or not self.tree_dir:
            return
        paths, _ = QFileDialog.getOpenFileNames(
            self, "Select Images", "",
            "Images (*.jpg *.jpeg *.png *.bmp *.tiff *.webp)"
        )
        for src in paths:
            resource = Resource(
                original_filename=os.path.basename(src),
                tags=ResourceTags(),
            )
            from core.export_import import copy_image_to_resources
            copy_image_to_resources(src, self.tree_dir, resource)
            self.tree.resources.append(resource)

        self._populate_filters()
        self._apply_filter()
        self.tree_modified.emit()

