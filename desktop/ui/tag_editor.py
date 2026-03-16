"""
tag_editor.py — Image viewer with rubber-band region tagging overlay.
Uses QStackedWidget so the confirm panel fully replaces normal panels while tagging.
"""
from __future__ import annotations
import os
from typing import Optional, TYPE_CHECKING
from PyQt6.QtCore import Qt, QRect, QPoint, pyqtSignal
from PyQt6.QtGui import QPainter, QPen, QColor, QPixmap, QFont, QBrush, QKeySequence
from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QScrollArea, QWidget,
    QPushButton, QComboBox, QCheckBox, QLineEdit,
    QDialogButtonBox, QGroupBox, QStackedWidget, QMessageBox,
)
from PyQt6.QtGui import QShortcut
if TYPE_CHECKING:
    from models.tree_model import Tree
    from models.resource_model import Resource, Region
REGION_COLOR           = QColor(30, 136, 229, 140)
REGION_BORDER          = QColor(30, 136, 229)
REGION_SELECTED_BG     = QColor(255, 193, 7, 140)
REGION_SELECTED_BORDER = QColor(245, 124, 0)
REGION_PENDING         = QColor(255, 152, 0, 80)
REGION_PENDING_BORDER  = QColor(255, 152, 0)
class ImageCanvas(QLabel):
    region_drawn   = pyqtSignal(QRect)
    region_clicked = pyqtSignal(int)   # index of clicked region
    def __init__(self, parent=None):
        super().__init__(parent)
        self._start: Optional[QPoint] = None
        self._current: Optional[QRect] = None
        self._regions: list[tuple[QRect, str, bool]] = []
        self._pending_rect: Optional[QRect] = None
        self._selected_idx: Optional[int] = None
        self._draw_mode = False
        self.setCursor(Qt.CursorShape.ArrowCursor)
        self.setMouseTracking(True)
    def set_draw_mode(self, enabled: bool):
        self._draw_mode = enabled
        self.setCursor(Qt.CursorShape.CrossCursor if enabled else Qt.CursorShape.ArrowCursor)
    def set_regions(self, regions: list[tuple[QRect, str, bool]]):
        self._regions = regions
        self.update()
    def set_pending(self, rect: Optional[QRect]):
        self._pending_rect = rect
        self.update()
    def set_selected(self, idx: Optional[int]):
        self._selected_idx = idx
        self.update()
    def mousePressEvent(self, event):
        if self._draw_mode and event.button() == Qt.MouseButton.LeftButton:
            self._start = event.pos()
            self._current = QRect(self._start, self._start)
            super().mousePressEvent(event)
            return
        if event.button() == Qt.MouseButton.LeftButton:
            pt = event.pos()
            for i, (rect, _, _) in enumerate(self._regions):
                if rect.contains(pt):
                    self._selected_idx = i
                    self.update()
                    self.region_clicked.emit(i)
                    return
            self._selected_idx = None
            self.update()
        super().mousePressEvent(event)
    def mouseMoveEvent(self, event):
        if self._draw_mode and self._start:
            self._current = QRect(self._start, event.pos()).normalized()
            self.update()
        super().mouseMoveEvent(event)
    def mouseReleaseEvent(self, event):
        if self._draw_mode and self._start and event.button() == Qt.MouseButton.LeftButton:
            rect = QRect(self._start, event.pos()).normalized()
            self._start = None
            self._current = None
            if rect.width() > 10 and rect.height() > 10:
                self._pending_rect = rect
                self.update()
                self.region_drawn.emit(rect)
        super().mouseReleaseEvent(event)
    def paintEvent(self, event):
        super().paintEvent(event)
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setFont(QFont("Arial", 8, QFont.Weight.Bold))
        for i, (rect, label, is_profile) in enumerate(self._regions):
            if i == self._selected_idx:
                p.setBrush(QBrush(REGION_SELECTED_BG))
                p.setPen(QPen(REGION_SELECTED_BORDER, 2))
            else:
                p.setBrush(QBrush(REGION_COLOR))
                p.setPen(QPen(REGION_BORDER, 2))
            p.drawRect(rect)
            p.setPen(QColor("white"))
            p.drawText(rect.x()+3, rect.y()+13, label)
            if is_profile:
                p.drawText(rect.x()+3, rect.y()+26, "star profile")
        if self._current:
            p.setBrush(QBrush(QColor(30,136,229,50)))
            p.setPen(QPen(REGION_BORDER, 1, Qt.PenStyle.DashLine))
            p.drawRect(self._current)
        if self._pending_rect:
            p.setBrush(QBrush(REGION_PENDING))
            p.setPen(QPen(REGION_PENDING_BORDER, 2, Qt.PenStyle.DashLine))
            p.drawRect(self._pending_rect)
            p.setPen(QColor("#BF360C"))
            p.drawText(self._pending_rect.x()+3, self._pending_rect.y()+13, "confirm ->")
class TagEditorDialog(QDialog):
    saved = pyqtSignal(str)
    def __init__(self, resource, tree, tree_dir: str, parent=None):
        super().__init__(parent)
        self.resource      = resource
        self.tree          = tree
        self.tree_dir      = tree_dir
        self._img_size     = (1, 1)
        self._pending_rect: Optional[QRect] = None
        self._editing_idx: Optional[int]    = None
        self.setWindowTitle(f"Tag Editor - {resource.filename}")
        self.setMinimumSize(1020, 660)
        self._build_ui()
        self._load_image()
        self._refresh_regions()
        # Snapshot for dirty detection
        self._snapshot = self._current_values()
        # Cmd+W / Ctrl+W
        QShortcut(QKeySequence("Ctrl+W"), self, activated=self.close)

    def _current_values(self) -> dict:
        import copy
        return {
            "date":     self._date.text().strip(),
            "location": self._loc.text().strip(),
            "gps":      self._gps.text().strip(),
            "ctags":    self._ctags.text().strip(),
            "filename": self.resource.filename,
            "regions":  copy.deepcopy([r.to_dict() for r in self.resource.regions]),
        }

    def _is_dirty(self) -> bool:
        return self._current_values() != self._snapshot
    def _build_ui(self):
        root = QHBoxLayout(self)
        root.setSpacing(8)
        # left column: draw button + image scroll
        left_col = QVBoxLayout()
        root.addLayout(left_col, stretch=3)
        draw_row = QHBoxLayout()
        self._draw_btn = QPushButton("  Draw Region")
        self._draw_btn.setCheckable(True)
        self._draw_btn.setToolTip("Drag on the image to tag a region. Click an existing region to edit it.")
        self._draw_btn.clicked.connect(self._toggle_draw)
        draw_row.addWidget(self._draw_btn)
        draw_row.addStretch()
        left_col.addLayout(draw_row)
        img_scroll = QScrollArea()
        img_scroll.setWidgetResizable(False)
        self._canvas = ImageCanvas()
        img_scroll.setWidget(self._canvas)
        left_col.addWidget(img_scroll, stretch=1)
        # right stacked widget
        self._stack = QStackedWidget()
        self._stack.setFixedWidth(290)
        root.addWidget(self._stack)
        # PAGE 0: regions list + metadata + save
        page0 = QWidget()
        p0l = QVBoxLayout(page0)
        p0l.setSpacing(8)
        rb = QGroupBox("Tagged regions")
        rv = QVBoxLayout(rb)
        rs = QScrollArea()
        rs.setWidgetResizable(True)
        rs.setFixedHeight(175)
        self._regions_inner = QWidget()
        self._regions_vl = QVBoxLayout(self._regions_inner)
        self._regions_vl.setAlignment(Qt.AlignmentFlag.AlignTop)
        self._regions_vl.setSpacing(3)
        rs.setWidget(self._regions_inner)
        rv.addWidget(rs)
        p0l.addWidget(rb)
        mb = QGroupBox("Metadata")
        mv = QVBoxLayout(mb)
        mv.addWidget(QLabel("Date:"))
        self._date = QLineEdit(self.resource.tags.date or "")
        mv.addWidget(self._date)
        mv.addWidget(QLabel("Location:"))
        self._loc = QLineEdit(self.resource.tags.location or "")
        mv.addWidget(self._loc)
        mv.addWidget(QLabel("GPS (lat, lng):"))
        gps = self.resource.tags.gps
        self._gps = QLineEdit(f"{gps['lat']},{gps['lng']}" if gps else "")
        mv.addWidget(self._gps)
        mv.addWidget(QLabel("Custom tags (comma-separated):"))
        self._ctags = QLineEdit(", ".join(self.resource.tags.custom_tags))
        mv.addWidget(self._ctags)
        p0l.addWidget(mb)

        # Filename management
        fn_box = QGroupBox("Filename")
        fn_vl  = QVBoxLayout(fn_box)
        self._current_fn_lbl = QLabel()
        self._current_fn_lbl.setStyleSheet("color:#212121; font-size:10px;")
        self._current_fn_lbl.setWordWrap(True)
        fn_vl.addWidget(self._current_fn_lbl)

        self._orig_fn_lbl = QLabel()
        self._orig_fn_lbl.setStyleSheet("color:#757575; font-size:9px;")
        self._orig_fn_lbl.setWordWrap(True)
        fn_vl.addWidget(self._orig_fn_lbl)

        fn_btn_row = QHBoxLayout()
        self._rename_edit = QLineEdit()
        self._rename_edit.setPlaceholderText("New filename (optional)…")
        self._rename_edit.setToolTip("Enter a custom filename and click Rename")
        fn_btn_row.addWidget(self._rename_edit, stretch=1)
        self._rename_btn = QPushButton("Rename")
        self._rename_btn.setToolTip("Rename file to the text on the left")
        self._rename_btn.clicked.connect(self._do_rename)
        fn_btn_row.addWidget(self._rename_btn)
        fn_vl.addLayout(fn_btn_row)

        self._restore_fn_btn = QPushButton("Restore original filename")
        self._restore_fn_btn.setToolTip("Rename back to the original upload filename")
        self._restore_fn_btn.clicked.connect(self._do_restore_filename)
        fn_vl.addWidget(self._restore_fn_btn)
        p0l.addWidget(fn_box)
        p0l.addStretch()
        self._save_btns = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Save | QDialogButtonBox.StandardButton.Cancel)
        self._save_btns.accepted.connect(self._save)
        self._save_btns.rejected.connect(self.reject)
        p0l.addWidget(self._save_btns)
        self._stack.addWidget(page0)
        # PAGE 1: confirm / edit region (replaces everything while tagging)
        page1 = QWidget()
        p1l = QVBoxLayout(page1)
        p1l.setSpacing(8)
        self._confirm_box = QGroupBox("Tag region")
        cb = QVBoxLayout(self._confirm_box)
        cb.addWidget(QLabel("Person:"))
        self._person_combo = QComboBox()
        self._person_combo.currentIndexChanged.connect(self._on_person_combo_changed)
        cb.addWidget(self._person_combo)
        self._new_person_lbl = QLabel("New person name:")
        self._new_person_edit = QLineEdit()
        self._new_person_edit.setPlaceholderText("Enter name...")
        cb.addWidget(self._new_person_lbl)
        cb.addWidget(self._new_person_edit)
        self._profile_chk = QCheckBox("Use as profile image")
        cb.addWidget(self._profile_chk)
        btns_row = QHBoxLayout()
        self._confirm_btn = QPushButton("  Save Tag")
        self._confirm_btn.clicked.connect(self._confirm_region)
        self._cancel_btn  = QPushButton("  Cancel")
        self._cancel_btn.clicked.connect(self._cancel_region)
        btns_row.addWidget(self._confirm_btn)
        btns_row.addWidget(self._cancel_btn)
        cb.addLayout(btns_row)
        p1l.addWidget(self._confirm_box)
        p1l.addStretch()
        self._stack.addWidget(page1)
        self._canvas.region_drawn.connect(self._on_region_drawn)
        self._canvas.region_clicked.connect(self._on_region_clicked)
        self._stack.setCurrentIndex(0)
    def _load_image(self):
        path = os.path.join(self.tree_dir, "resources", self.resource.filename)
        if os.path.exists(path):
            pix = QPixmap(path)
            self._canvas.setPixmap(pix)
            self._canvas.resize(pix.size())
            self._img_size = (pix.width(), pix.height())
        self._refresh_filename_labels()

    def _refresh_filename_labels(self):
        self._current_fn_lbl.setText(f"Current:  {self.resource.filename}")
        orig = self.resource.original_filename or "(none)"
        self._orig_fn_lbl.setText(f"Original: {orig}")
        has_orig = bool(self.resource.original_filename) and \
                   self.resource.original_filename != self.resource.filename
        self._restore_fn_btn.setEnabled(has_orig)
    def _refresh_regions(self):
        while self._regions_vl.count():
            item = self._regions_vl.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        for i, reg in enumerate(self.resource.regions):
            node  = self.tree.get_node(reg.node_id)
            if node:
                label = node.name
            elif reg.node_id.startswith("__orphan__:"):
                label = "⚠ " + reg.node_id[len("__orphan__:"):]  + " (deleted node)"
            else:
                label = f"Unknown ({reg.node_id[:6]})"
            prof  = "  [profile]" if reg.use_as_profile else ""
            row = QWidget()
            hl  = QHBoxLayout(row)
            hl.setContentsMargins(2,2,2,2)
            hl.setSpacing(4)
            lbl = QLabel(f"{label}{prof}")
            lbl.setStyleSheet("color:#212121;")
            hl.addWidget(lbl, stretch=1)
            edit_btn = QPushButton("e")
            edit_btn.setFixedWidth(26)
            edit_btn.setToolTip(f"Edit tag for {label}")
            edit_btn.setStyleSheet(
                "QPushButton{color:#1565C0;background:#E3F2FD;border:1px solid #90CAF9;"
                "border-radius:3px;padding:1px 3px;font-weight:bold;}"
                "QPushButton:hover{background:#BBDEFB;}")
            edit_btn.clicked.connect(lambda _, idx=i: self._open_region_edit(idx))
            hl.addWidget(edit_btn)
            del_btn = QPushButton("x")
            del_btn.setFixedWidth(26)
            del_btn.setToolTip(f"Remove tag for {label}")
            del_btn.setStyleSheet(
                "QPushButton{color:#c62828;background:#FFF;border:1px solid #EF9A9A;"
                "border-radius:3px;padding:1px 3px;font-weight:bold;}"
                "QPushButton:hover{background:#FFEBEE;}")
            del_btn.clicked.connect(lambda _, idx=i: self._delete_region(idx))
            hl.addWidget(del_btn)
            self._regions_vl.addWidget(row)
        self._redraw_canvas_regions()
    def _redraw_canvas_regions(self):
        iw, ih = self._img_size
        rects = []
        for reg in self.resource.regions:
            node  = self.tree.get_node(reg.node_id)
            label = node.name if node else "?"
            r = QRect(int(reg.rect.x*iw/100), int(reg.rect.y*ih/100),
                      int(reg.rect.w*iw/100), int(reg.rect.h*ih/100))
            rects.append((r, label, reg.use_as_profile))
        self._canvas.set_regions(rects)
    def _delete_region(self, index: int):
        if 0 <= index < len(self.resource.regions):
            reg = self.resource.regions[index]
            other_ids = [r.node_id for j,r in enumerate(self.resource.regions) if j!=index]
            if reg.node_id not in other_ids and reg.node_id in self.resource.tags.persons:
                self.resource.tags.persons.remove(reg.node_id)
            if reg.use_as_profile:
                node = self.tree.get_node(reg.node_id)
                if node and node.profile_image_ref == f"resources/{self.resource.filename}":
                    node.profile_image_ref = None
            self.resource.regions.pop(index)
            self._canvas.set_selected(None)
            self._refresh_regions()
    def _open_region_edit(self, index: int):
        if 0 <= index < len(self.resource.regions):
            self._editing_idx  = index
            self._pending_rect = None
            reg = self.resource.regions[index]
            self._populate_confirm_panel(existing_reg=reg)
            self._canvas.set_selected(index)
            self._stack.setCurrentIndex(1)
            self._set_save_enabled(False)
    def _toggle_draw(self, checked: bool):
        self._canvas.set_draw_mode(checked)
        if checked:
            self._draw_btn.setText("  Drawing... (drag on image)")
            self._set_save_enabled(False)
            self._cancel_region()
        else:
            self._draw_btn.setText("  Draw Region")
            self._set_save_enabled(True)
    def _set_save_enabled(self, enabled: bool):
        for btn in self._save_btns.buttons():
            if self._save_btns.buttonRole(btn) == QDialogButtonBox.ButtonRole.AcceptRole:
                btn.setEnabled(enabled)
    def _on_region_drawn(self, rect: QRect):
        self._draw_btn.setChecked(False)
        self._canvas.set_draw_mode(False)
        self._draw_btn.setText("  Draw Region")
        self._pending_rect = rect
        self._editing_idx  = None
        self._populate_confirm_panel(existing_reg=None)
        self._stack.setCurrentIndex(1)
        self._set_save_enabled(False)
    def _on_region_clicked(self, index: int):
        # Always open/switch to this region's edit panel — even if another is open
        self._open_region_edit(index)
    def _populate_confirm_panel(self, existing_reg):
        self._person_combo.blockSignals(True)
        self._person_combo.clear()
        for n in self.tree.nodes:
            self._person_combo.addItem(n.name, userData=n.id)
        self._person_combo.addItem("+ New person", userData=None)
        self._person_combo.blockSignals(False)
        if existing_reg is not None:
            # match by node_id; orphan markers won't be in combo so fall back to 0
            idx = 0
            if not existing_reg.node_id.startswith("__orphan__:"):
                idx = next((i for i in range(self._person_combo.count())
                            if self._person_combo.itemData(i) == existing_reg.node_id), 0)
            self._person_combo.setCurrentIndex(idx)
            self._profile_chk.setChecked(existing_reg.use_as_profile)
            if existing_reg.node_id.startswith("__orphan__:"):
                orphan_name = existing_reg.node_id[len("__orphan__:"):]
                self._confirm_box.setTitle(f"Re-tag: {orphan_name} (was deleted)")
            else:
                node = self.tree.get_node(existing_reg.node_id)
                self._confirm_box.setTitle(f"Edit tag: {node.name if node else '?'}")
        else:
            self._person_combo.setCurrentIndex(0)
            self._profile_chk.setChecked(False)
            self._confirm_box.setTitle("Tag new region")
        self._new_person_edit.clear()
        self._on_person_combo_changed(self._person_combo.currentIndex())
    def _on_person_combo_changed(self, index: int):
        is_new = (self._person_combo.currentText() == "+ New person")
        self._new_person_lbl.setEnabled(is_new)
        self._new_person_edit.setEnabled(is_new)
        self._new_person_lbl.setStyleSheet("color:#212121;" if is_new else "color:#9E9E9E;")
    def _confirm_region(self):
        is_new = (self._person_combo.currentText() == "+ New person")
        if is_new:
            new_name = self._new_person_edit.text().strip()
            if not new_name:
                self._new_person_edit.setFocus()
                self._new_person_edit.setStyleSheet("border:1px solid red;")
                return
            self._new_person_edit.setStyleSheet("")
            from models.tree_model import Node
            new_node = Node(name=new_name, is_standalone=True)
            self.tree.nodes.append(new_node)
            node_id = new_node.id
        else:
            node_id = self._person_combo.currentData()
            if not node_id:
                return
        use_profile = self._profile_chk.isChecked()
        if self._editing_idx is not None:
            reg = self.resource.regions[self._editing_idx]
            old_nid = reg.node_id
            if old_nid != node_id:
                others = [r.node_id for j,r in enumerate(self.resource.regions)
                          if j != self._editing_idx]
                if old_nid not in others and old_nid in self.resource.tags.persons:
                    self.resource.tags.persons.remove(old_nid)
            if reg.use_as_profile and not use_profile:
                old_node = self.tree.get_node(old_nid)
                if old_node and old_node.profile_image_ref == f"resources/{self.resource.filename}":
                    old_node.profile_image_ref = None
            reg.node_id = node_id
            reg.use_as_profile = use_profile
        else:
            if self._pending_rect is None:
                return
            iw, ih = self._img_size
            rect = self._pending_rect
            from models.resource_model import Region, Rect
            reg = Region(
                node_id=node_id,
                rect=Rect(x=rect.x()*100/max(iw,1), y=rect.y()*100/max(ih,1),
                          w=rect.width()*100/max(iw,1), h=rect.height()*100/max(ih,1)),
                use_as_profile=use_profile,
            )
            self.resource.regions.append(reg)
        if use_profile:
            node = self.tree.get_node(node_id)
            if node:
                node.profile_image_ref = f"resources/{self.resource.filename}"
        if node_id not in self.resource.tags.persons:
            self.resource.tags.persons.append(node_id)
        self._cancel_region()
        self._refresh_regions()
    def _cancel_region(self):
        self._pending_rect = None
        self._editing_idx  = None
        self._canvas.set_pending(None)
        self._canvas.set_selected(None)
        self._stack.setCurrentIndex(0)
        self._set_save_enabled(True)
    def _do_rename(self):
        """Manually rename the file to whatever the user typed."""
        from PyQt6.QtWidgets import QMessageBox
        new_name = self._rename_edit.text().strip()
        if not new_name:
            return
        if not new_name.lower().endswith(".jpg"):
            new_name += ".jpg"
        res_dir  = os.path.join(self.tree_dir, "resources")
        old_path = os.path.join(res_dir, self.resource.filename)
        new_path = os.path.join(res_dir, new_name)
        if not os.path.exists(old_path):
            QMessageBox.warning(self, "Rename", f"File not found:\n{old_path}")
            return
        if os.path.exists(new_path) and new_path != old_path:
            QMessageBox.warning(self, "Rename", f"A file named '{new_name}' already exists.")
            return
        if not self.resource.original_filename:
            self.resource.original_filename = self.resource.filename
        os.rename(old_path, new_path)
        # update profile refs
        for reg in self.resource.regions:
            if reg.use_as_profile:
                node = self.tree.get_node(reg.node_id)
                if node:
                    node.profile_image_ref = f"resources/{new_name}"
        self.resource.filename = new_name
        self._rename_edit.clear()
        self._refresh_filename_labels()

    def _do_restore_filename(self):
        """Rename back to the original upload filename."""
        from PyQt6.QtWidgets import QMessageBox
        from core.export_import import restore_original_filename
        res_dir  = os.path.join(self.tree_dir, "resources")
        target   = os.path.join(res_dir, self.resource.original_filename or "")
        if os.path.exists(target) and target != os.path.join(res_dir, self.resource.filename):
            QMessageBox.warning(self, "Restore",
                f"A file named '{self.resource.original_filename}' already exists.\n"
                "Please rename or remove it first.")
            return
        ok = restore_original_filename(self.resource, self.tree, self.tree_dir)
        if ok:
            self._refresh_filename_labels()
        else:
            QMessageBox.warning(self, "Restore", "Could not restore original filename.\n"
                "The file may be missing.")

    def _save(self):
        self.resource.tags.date     = self._date.text().strip() or None
        self.resource.tags.location = self._loc.text().strip() or None
        gps_text = self._gps.text().strip()
        if gps_text:
            parts = gps_text.split(",")
            if len(parts) == 2:
                try:
                    self.resource.tags.gps = {"lat": float(parts[0]), "lng": float(parts[1])}
                except ValueError:
                    pass
        self.resource.tags.custom_tags = [
            t.strip() for t in self._ctags.text().split(",") if t.strip()
        ]
        self._snapshot = self._current_values()   # reset dirty state
        self.saved.emit(self.resource.id)
        self.accept()

    def closeEvent(self, event):
        if self._is_dirty():
            reply = QMessageBox.question(
                self, "Unsaved Changes",
                "You have unsaved changes in the tag editor.\nSave before closing?",
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

