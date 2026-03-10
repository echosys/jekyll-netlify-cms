"""
main_window.py — Main application window: sidebar + tab (Tree Canvas / Resources).
"""
from __future__ import annotations

import os
import re
import shutil
from datetime import datetime
from typing import Optional

from PyQt6.QtCore import Qt, QFileSystemWatcher
from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QHBoxLayout, QVBoxLayout, QListWidget,
    QListWidgetItem, QPushButton, QTabWidget, QSplitter, QLabel,
    QMenuBar, QMenu, QFileDialog, QMessageBox, QInputDialog,
    QStatusBar, QToolBar, QLineEdit, QDialog, QVBoxLayout, QFormLayout,
    QDialogButtonBox,
)
from PyQt6.QtGui import QAction, QKeySequence

from models.tree_model import Tree, new_id
from core.export_import import save_tree, load_tree, export_zip, import_zip
from ui.tree_canvas import TreeCanvas
from ui.resource_manager import ResourceManager
from ui.person_dialog import PersonDialog
from ui.tag_editor import TagEditorDialog
from ui.db_export_dialog import DBExportDialog


class MainWindow(QMainWindow):
    def __init__(self, family_trees_dir: str):
        super().__init__()
        self.family_trees_dir = family_trees_dir
        self.tree: Optional[Tree] = None
        self.tree_dir: Optional[str] = None
        self._unsaved = False
        self._watcher = QFileSystemWatcher(self)
        self._watcher.directoryChanged.connect(self._on_directory_changed)

        self.setWindowTitle("Family Tree App")
        self.resize(1280, 800)

        self._build_ui()
        self._build_menu()
        self._refresh_tree_list()

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------

    def _build_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        root = QHBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)

        # ── Sidebar ──────────────────────────────────────────────────
        sidebar = QWidget()
        sidebar.setFixedWidth(200)
        sidebar.setStyleSheet("background:#F5F5F5; border-right:1px solid #DDD;")
        sl = QVBoxLayout(sidebar)
        sl.setContentsMargins(8, 8, 8, 8)

        sl.addWidget(QLabel("<b>My Trees</b>"))
        self._tree_list = QListWidget()
        self._tree_list.itemClicked.connect(self._on_tree_selected)
        self._tree_list.itemDoubleClicked.connect(self._on_tree_double_clicked)
        sl.addWidget(self._tree_list)

        rename_btn = QPushButton("✏️  Edit Tree")
        rename_btn.setToolTip("Edit tree name and view folder path")
        rename_btn.clicked.connect(self._rename_tree)
        sl.addWidget(rename_btn)

        new_btn = QPushButton("+ New Tree")
        new_btn.clicked.connect(self._new_tree)
        sl.addWidget(new_btn)
        root.addWidget(sidebar)

        # ── Main area ────────────────────────────────────────────────
        main_col = QWidget()
        main_vl  = QVBoxLayout(main_col)
        main_vl.setContentsMargins(0, 0, 0, 0)
        main_vl.setSpacing(0)
        root.addWidget(main_col, stretch=1)

        # ── Canvas toolbar ───────────────────────────────────────────
        toolbar = QWidget()
        toolbar.setFixedHeight(40)
        toolbar.setStyleSheet("background:#FAFAFA; border-bottom:1px solid #DDD;")
        tl = QHBoxLayout(toolbar)
        tl.setContentsMargins(8, 4, 8, 4)
        tl.setSpacing(6)

        # Save button
        self._save_btn = QPushButton("💾  Save")
        self._save_btn.setToolTip("Save current tree  (Ctrl+S)")
        self._save_btn.clicked.connect(self._save_tree)
        self._save_btn.setStyleSheet(
            "QPushButton { font-weight:bold; color:#1565C0; background:#E3F2FD; "
            "border:1px solid #90CAF9; border-radius:4px; padding:3px 12px; }"
            "QPushButton:hover { background:#BBDEFB; }"
            "QPushButton:disabled { color:#9E9E9E; background:#F5F5F5; border-color:#E0E0E0; }"
        )
        tl.addWidget(self._save_btn)

        tl.addSpacing(8)

        # Fit button
        fit_btn = QPushButton("⊙  Fit View")
        fit_btn.setToolTip("Zoom to fit all nodes")
        fit_btn.clicked.connect(self._fit_view)
        tl.addWidget(fit_btn)

        # Auto layout button
        layout_btn = QPushButton("⊞  Auto Layout")
        layout_btn.setToolTip("Arrange nodes by generation (parents above children)")
        layout_btn.clicked.connect(self._auto_layout)
        tl.addWidget(layout_btn)

        # Lock zoom toggle
        self._lock_btn = QPushButton("🔓  Lock Zoom")
        self._lock_btn.setCheckable(True)
        self._lock_btn.setToolTip("Lock zoom to prevent accidental scroll-zoom")
        self._lock_btn.clicked.connect(self._toggle_zoom_lock)
        tl.addWidget(self._lock_btn)

        tl.addStretch()
        main_vl.addWidget(toolbar)

        # ── Tabs ─────────────────────────────────────────────────────
        self._tabs = QTabWidget()
        main_vl.addWidget(self._tabs, stretch=1)

        self._canvas = TreeCanvas()
        self._canvas.node_double_clicked.connect(self._open_person_dialog)
        self._canvas.tree_modified.connect(self._mark_unsaved)
        self._tabs.addTab(self._canvas, "🌳  Tree")

        self._resources = ResourceManager()
        self._resources.open_tag_editor.connect(self._open_tag_editor)
        self._resources.tree_modified.connect(self._mark_unsaved)
        self._tabs.addTab(self._resources, "📷  Resources")

        self.setStatusBar(QStatusBar())

    def _build_menu(self):
        mb = self.menuBar()

        file_menu = mb.addMenu("File")
        self._add_action(file_menu, "New Tree",              self._new_tree,      "Ctrl+N")
        self._add_action(file_menu, "Open Tree…",            self._open_tree,     "Ctrl+O")
        self._add_action(file_menu, "Save",                  self._save_tree,     "Ctrl+S")
        file_menu.addSeparator()
        self._add_action(file_menu, "Import from Zip…",      self._import_zip)
        self._add_action(file_menu, "Import from PostgreSQL…", self._import_postgres)
        file_menu.addSeparator()
        self._add_action(file_menu, "Quit",                  self.close,          "Ctrl+Q")

        view_menu = mb.addMenu("View")
        self._add_action(view_menu, "Fit All Nodes",         self._fit_view,      "Ctrl+0")

        export_menu = mb.addMenu("Export")
        self._add_action(export_menu, "Export as Zip…",      self._export_zip,    "Ctrl+E")
        self._add_action(export_menu, "Export to PostgreSQL…", self._export_postgres)

    def _add_action(self, menu: QMenu, label: str, slot, shortcut: str = None):
        action = QAction(label, self)
        if shortcut:
            action.setShortcut(QKeySequence(shortcut))
        action.triggered.connect(slot)
        menu.addAction(action)
        return action

    # ── Toolbar helpers ───────────────────────────────────────────────

    def _fit_view(self):
        self._canvas.fit_view()

    def _auto_layout(self):
        self._canvas.auto_layout()
        self._mark_unsaved()

    def _toggle_zoom_lock(self, checked: bool):
        self._canvas.set_zoom_locked(checked)
        if checked:
            self._lock_btn.setText("🔒  Zoom Locked")
            self._lock_btn.setStyleSheet(
                "QPushButton { font-weight:bold; color:#FFFFFF; background:#1565C0; "
                "border:1px solid #0D47A1; border-radius:4px; padding:3px 10px; }"
                "QPushButton:hover { background:#1976D2; }"
            )
        else:
            self._lock_btn.setText("🔓  Lock Zoom")
            self._lock_btn.setStyleSheet("")

    # ------------------------------------------------------------------
    # Tree list
    # ------------------------------------------------------------------

    def _refresh_tree_list(self):
        import json as _json
        self._tree_list.clear()
        if not os.path.exists(self.family_trees_dir):
            return
        for folder_name in sorted(os.listdir(self.family_trees_dir)):
            path = os.path.join(self.family_trees_dir, folder_name)
            json_path = os.path.join(path, "tree.json")
            if os.path.isdir(path) and os.path.exists(json_path):
                # Show tree_name from JSON; fall back to folder name
                display_name = folder_name
                try:
                    with open(json_path, "r", encoding="utf-8") as f:
                        display_name = _json.load(f).get("tree_name") or folder_name
                except Exception:
                    pass
                item = QListWidgetItem(display_name)
                item.setData(Qt.ItemDataRole.UserRole, path)
                self._tree_list.addItem(item)

    def _on_tree_selected(self, item: QListWidgetItem):
        if self._unsaved and not self._confirm_discard():
            return
        tree_dir = item.data(Qt.ItemDataRole.UserRole)
        self._load_tree_from_dir(tree_dir)

    def _on_tree_double_clicked(self, item: QListWidgetItem):
        """Double-clicking a tree in the sidebar opens the Edit Tree dialog."""
        self._rename_tree()

    def _rename_tree(self):
        """Edit Tree dialog: change tree_name (JSON only), shows folder path read-only."""
        if not self.tree or not self.tree_dir:
            QMessageBox.information(self, "No Tree", "Open a tree first.")
            return

        dlg = QDialog(self)
        dlg.setWindowTitle("Edit Tree")
        dlg.setMinimumWidth(420)
        layout = QVBoxLayout(dlg)
        form = QFormLayout()
        form.setSpacing(8)

        name_edit = QLineEdit(self.tree.tree_name)
        name_edit.setPlaceholderText("Display name for this tree")
        form.addRow("Tree name:", name_edit)

        folder_name = os.path.basename(self.tree_dir)
        folder_name_lbl = QLabel(folder_name)
        folder_name_lbl.setStyleSheet(
            "color:#1565C0; background:#E3F2FD; border:1px solid #90CAF9; "
            "border-radius:3px; padding:3px 8px; font-size:12px; font-weight:bold;"
        )
        folder_name_lbl.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        form.addRow("Folder name:", folder_name_lbl)

        folder_lbl = QLabel(self.tree_dir)
        folder_lbl.setStyleSheet(
            "color:#777; background:#F5F5F5; border:1px solid #DDD; "
            "border-radius:3px; padding:3px 6px; font-size:10px;"
        )
        folder_lbl.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        folder_lbl.setWordWrap(True)
        folder_lbl.setToolTip("Full path on disk — click to select and copy")
        form.addRow("Full path:", folder_lbl)

        hint = QLabel(
            "<i>The folder name and tree name are independent.<br>"
            "Rename the folder in Finder/Explorer and reopen the app to change the folder path.</i>"
        )
        hint.setStyleSheet("color:#888; font-size:10px;")
        hint.setWordWrap(True)

        layout.addLayout(form)
        layout.addWidget(hint)

        btns = QDialogButtonBox(QDialogButtonBox.StandardButton.Save |
                                QDialogButtonBox.StandardButton.Cancel)
        btns.accepted.connect(dlg.accept)
        btns.rejected.connect(dlg.reject)
        layout.addWidget(btns)

        if dlg.exec() != QDialog.DialogCode.Accepted:
            return

        new_name = name_edit.text().strip()
        if not new_name or new_name == self.tree.tree_name:
            return

        self.tree.tree_name = new_name
        save_tree(self.tree, self.tree_dir)
        self._unsaved = False
        self.setWindowTitle(f"Family Tree — {self.tree.tree_name}")
        self._refresh_tree_list()
        self.statusBar().showMessage(f'Tree renamed to "{new_name}"', 3000)

    def _load_tree_from_dir(self, tree_dir: str):
        try:
            tree = load_tree(tree_dir)
            self.tree     = tree
            self.tree_dir = tree_dir
            self._canvas.load_tree(tree, tree_dir)
            self._resources.load_tree(tree, tree_dir)
            self._unsaved = False
            self.setWindowTitle(f"Family Tree — {tree.tree_name}")
            self.statusBar().showMessage(f"Opened: {tree.tree_name}", 3000)
            # Watch this folder for runtime renames/moves
            # Remove old watched paths first
            watched = self._watcher.directories()
            if watched:
                self._watcher.removePaths(watched)
            self._watcher.addPath(self.family_trees_dir)
            self._watcher.addPath(tree_dir)
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Could not open tree:\n{e}")

    def _on_directory_changed(self, path: str):
        """Called by QFileSystemWatcher when a watched directory changes.

        If the currently open tree folder no longer exists (renamed/moved in
        Finder while the app was running) we auto-save the in-memory state to
        a new timestamped recovery folder so no work is lost, then refresh the
        sidebar so both the old (renamed) folder and the recovery copy appear.
        """
        if not self.tree or not self.tree_dir:
            return
        if os.path.exists(self.tree_dir):
            return   # folder still there — some other change (file added etc.), ignore

        # ── folder gone: auto-recover ──────────────────────────────
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Build a safe base name from the tree's display name
        safe_base = re.sub(r"[^a-zA-Z0-9_]", "_", self.tree.tree_name.lower()).strip("_") or "tree"
        recovery_name = f"{safe_base}_recovered_{timestamp}"
        recovery_dir  = os.path.join(self.family_trees_dir, recovery_name)

        try:
            os.makedirs(os.path.join(recovery_dir, "resources"), exist_ok=True)

            # Copy resource images that still exist on disk.
            # The original res_dir path is gone as a *directory*, but the files
            # may have moved with the parent folder — try both old and new location.
            old_res_dir = os.path.join(self.tree_dir, "resources")
            new_res_dir = os.path.join(recovery_dir, "resources")
            for resource in self.tree.resources:
                src = os.path.join(old_res_dir, resource.filename)
                if os.path.exists(src):
                    shutil.copy2(src, os.path.join(new_res_dir, resource.filename))

            # Save JSON into recovery folder
            save_tree(self.tree, recovery_dir)

            # Stop watching the dead path, watch the recovery folder instead
            self._watcher.removePaths(self._watcher.directories())
            self._watcher.addPath(self.family_trees_dir)
            self._watcher.addPath(recovery_dir)

            # Update live pointers so subsequent saves go to recovery dir
            self.tree_dir = recovery_dir
            self._unsaved = False

            self._refresh_tree_list()

            QMessageBox.information(
                self, "Tree Folder Moved",
                f"The original tree folder was renamed or moved while the app was open.\n\n"
                f"Your unsaved changes have been automatically saved to a recovery copy:\n\n"
                f"  {recovery_name}\n\n"
                f"Both entries now appear in the sidebar.\n"
                f"You can delete whichever copy you don't need."
            )

        except Exception as e:
            # Recovery itself failed — last-ditch warning
            QMessageBox.critical(
                self, "Folder Moved — Recovery Failed",
                f"The tree folder was moved or renamed and we could not save a recovery copy:\n\n"
                f"  {e}\n\n"
                f"Please locate the renamed folder and reopen it manually."
            )


    # ------------------------------------------------------------------
    # Tree lifecycle
    # ------------------------------------------------------------------

    def _new_tree(self):
        if self._unsaved and not self._confirm_discard():
            return
        name, ok = QInputDialog.getText(self, "New Tree", "Tree name:")
        if not ok or not name.strip():
            return
        safe = name.strip().replace(" ", "_").lower()
        tree_dir = os.path.join(self.family_trees_dir, safe)
        if os.path.exists(tree_dir):
            QMessageBox.warning(self, "Exists", f"A tree folder '{safe}' already exists.")
            return
        os.makedirs(os.path.join(tree_dir, "resources"), exist_ok=True)
        tree = Tree(tree_name=name.strip())
        save_tree(tree, tree_dir)
        self._refresh_tree_list()
        self._load_tree_from_dir(tree_dir)

    def _open_tree(self):
        if self._unsaved and not self._confirm_discard():
            return
        tree_dir = QFileDialog.getExistingDirectory(
            self, "Select Tree Folder", self.family_trees_dir
        )
        if tree_dir:
            self._load_tree_from_dir(tree_dir)
            self._refresh_tree_list()

    def _save_tree(self):
        if not self.tree or not self.tree_dir:
            return
        save_tree(self.tree, self.tree_dir)
        self._unsaved = False
        # Remove the * from the title explicitly
        self.setWindowTitle(f"Family Tree — {self.tree.tree_name}")
        self.statusBar().showMessage("Saved.", 2000)

    def _mark_unsaved(self):
        if not self._unsaved:   # only update title on first change
            self._unsaved = True
            if self.tree:
                self.setWindowTitle(f"Family Tree — {self.tree.tree_name} *")

    def _confirm_discard(self) -> bool:
        reply = QMessageBox.question(
            self, "Unsaved Changes",
            "You have unsaved changes. Discard them?",
            QMessageBox.StandardButton.Discard | QMessageBox.StandardButton.Cancel,
        )
        return reply == QMessageBox.StandardButton.Discard

    # ------------------------------------------------------------------
    # Export / Import
    # ------------------------------------------------------------------

    def _export_zip(self):
        if not self.tree or not self.tree_dir:
            QMessageBox.warning(self, "No Tree", "Open a tree first.")
            return
        path, _ = QFileDialog.getSaveFileName(
            self, "Export Zip", f"{self.tree.tree_name}.zip", "Zip files (*.zip)"
        )
        if path:
            export_zip(self.tree, self.tree_dir, path)
            self.statusBar().showMessage(f"Exported to {path}", 3000)

    def _import_zip(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Import Zip", "", "Zip files (*.zip)"
        )
        if not path:
            return
        try:
            dest = import_zip(path, self.family_trees_dir)
            self._refresh_tree_list()
            self._load_tree_from_dir(dest)
        except FileExistsError as e:
            QMessageBox.warning(self, "Already Exists", str(e))
        except Exception as e:
            QMessageBox.critical(self, "Import Failed", str(e))

    def _export_postgres(self):
        dlg = DBExportDialog(
            self.tree, self.tree_dir, self.family_trees_dir,
            os.path.dirname(self.family_trees_dir),   # config_dir: beside FamilyTrees/
            self
        )
        dlg.exec()

    def _import_postgres(self):
        dlg = DBExportDialog(
            self.tree, self.tree_dir, self.family_trees_dir,
            os.path.dirname(self.family_trees_dir),
            self
        )
        dlg.exec()
        self._refresh_tree_list()

    # ------------------------------------------------------------------
    # Person dialog
    # ------------------------------------------------------------------

    def _open_person_dialog(self, node_id: str):
        if not self.tree:
            return
        node = self.tree.get_node(node_id)
        if not node:
            return
        dlg = PersonDialog(node, self.tree, self.tree_dir, self)
        dlg.saved.connect(self._on_person_saved)
        dlg.exec()

    def _on_person_saved(self, node_id: str):
        self._canvas.refresh_node(node_id)
        self._mark_unsaved()
        self._save_tree()

    # ------------------------------------------------------------------
    # Tag editor
    # ------------------------------------------------------------------

    def _open_tag_editor(self, resource_id: str):
        if not self.tree:
            return
        resource = next((r for r in self.tree.resources if r.id == resource_id), None)
        if not resource:
            return
        dlg = TagEditorDialog(resource, self.tree, self.tree_dir, self)
        dlg.saved.connect(self._on_tag_saved)
        dlg.exec()

    def _on_tag_saved(self, resource_id: str):
        resource = next((r for r in self.tree.resources if r.id == resource_id), None)
        if resource:
            from core.export_import import rename_resource_after_tag
            rename_resource_after_tag(resource, self.tree, self.tree_dir)
        self._resources.load_tree(self.tree, self.tree_dir)
        self._canvas._rebuild()
        self._mark_unsaved()
        self._save_tree()

    # ------------------------------------------------------------------

    def closeEvent(self, event):
        if self._unsaved:
            reply = QMessageBox.question(
                self, "Quit",
                "Save before quitting?",
                QMessageBox.StandardButton.Save |
                QMessageBox.StandardButton.Discard |
                QMessageBox.StandardButton.Cancel,
            )
            if reply == QMessageBox.StandardButton.Save:
                self._save_tree()
                event.accept()
            elif reply == QMessageBox.StandardButton.Discard:
                event.accept()
            else:
                event.ignore()
        else:
            event.accept()

