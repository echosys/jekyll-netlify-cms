"""
Workspace Panel - Left panel showing workspaces with checkboxes
"""
from pathlib import Path
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QTreeWidget, QTreeWidgetItem,
                              QPushButton, QFileDialog, QMessageBox, QMenu)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QAction


class WorkspacePanel(QWidget):
    """Left panel for managing workspaces"""

    workspace_toggled = pyqtSignal(str, bool)  # path, is_active

    def __init__(self, workspace_manager, parent=None):
        super().__init__(parent)
        self.workspace_manager = workspace_manager
        self.init_ui()
        self.load_workspaces()

        # Connect to workspace manager signals
        self.workspace_manager.workspace_added.connect(self.on_workspace_added)
        self.workspace_manager.workspace_removed.connect(self.on_workspace_removed)

    def init_ui(self):
        """Initialize the UI"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)

        # Add workspace button
        self.add_btn = QPushButton("+ Add Workspace")
        self.add_btn.clicked.connect(self.add_workspace)
        layout.addWidget(self.add_btn)

        # Workspace tree
        self.tree = QTreeWidget()
        self.tree.setHeaderHidden(True)
        self.tree.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.tree.customContextMenuRequested.connect(self.show_context_menu)
        self.tree.itemChanged.connect(self.on_item_changed)
        layout.addWidget(self.tree)

    def load_workspaces(self):
        """Load workspaces into tree"""
        self.tree.clear()
        for workspace in self.workspace_manager.get_all_workspaces():
            self.add_workspace_item(workspace)

    def add_workspace_item(self, workspace):
        """Add a workspace item to the tree"""
        # Block signals during item setup to prevent premature itemChanged
        self.tree.blockSignals(True)

        item = QTreeWidgetItem(self.tree)
        item.setText(0, workspace.name)
        item.setData(0, Qt.ItemDataRole.UserRole, str(workspace.path))
        item.setCheckState(0, Qt.CheckState.Checked if workspace.is_active else Qt.CheckState.Unchecked)
        item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)

        # Re-enable signals
        self.tree.blockSignals(False)

    def add_workspace(self):
        """Show dialog to add a new workspace"""
        folder = QFileDialog.getExistingDirectory(
            self,
            "Select Workspace Folder",
            str(Path.home())
        )

        if folder:
            success = self.workspace_manager.add_workspace(Path(folder))
            if not success:
                QMessageBox.warning(
                    self,
                    "Duplicate Workspace",
                    "This workspace has already been added."
                )

    def on_workspace_added(self, workspace):
        """Handle workspace added signal"""
        print(f"[WorkspacePanel] workspace added: {workspace.path}  active={workspace.is_active}")
        self.add_workspace_item(workspace)
        # A newly-added workspace is active by default – trigger scan explicitly
        # because blockSignals() inside add_workspace_item suppresses itemChanged.
        if workspace.is_active:
            print(f"[WorkspacePanel] emitting workspace_toggled for new workspace: {workspace.path}")
            self.workspace_toggled.emit(str(workspace.path), True)

    def on_workspace_removed(self, path):
        """Handle workspace removed signal"""
        for i in range(self.tree.topLevelItemCount()):
            item = self.tree.topLevelItem(i)
            if item.data(0, Qt.ItemDataRole.UserRole) == path:
                self.tree.takeTopLevelItem(i)
                break

    def on_item_changed(self, item, column):
        """Handle item check state changed"""
        path = item.data(0, Qt.ItemDataRole.UserRole)
        if path is None:
            print("[WorkspacePanel] on_item_changed: path is None, skipping")
            return  # Skip if no path data set yet
        is_checked = item.checkState(0) == Qt.CheckState.Checked
        print(f"[WorkspacePanel] on_item_changed: path={path}  checked={is_checked}")
        self.workspace_manager.toggle_workspace(Path(path), is_checked)
        self.workspace_toggled.emit(path, is_checked)

    def show_context_menu(self, position):
        """Show context menu for workspace item"""
        item = self.tree.itemAt(position)
        if not item:
            return

        menu = QMenu(self)

        remove_action = QAction("Remove Workspace", self)
        remove_action.triggered.connect(lambda: self.remove_workspace(item))
        menu.addAction(remove_action)

        open_action = QAction("Open in File Manager", self)
        open_action.triggered.connect(lambda: self.open_in_file_manager(item))
        menu.addAction(open_action)

        menu.exec(self.tree.viewport().mapToGlobal(position))

    def remove_workspace(self, item):
        """Remove a workspace"""
        path = item.data(0, Qt.ItemDataRole.UserRole)
        reply = QMessageBox.question(
            self,
            "Remove Workspace",
            f"Remove workspace '{item.text(0)}'?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )

        if reply == QMessageBox.StandardButton.Yes:
            self.workspace_manager.remove_workspace(Path(path))

    def open_in_file_manager(self, item):
        """Open workspace folder in file manager"""
        import subprocess
        import platform

        path = item.data(0, Qt.ItemDataRole.UserRole)

        if platform.system() == "Darwin":  # macOS
            subprocess.run(["open", path])
        elif platform.system() == "Windows":
            subprocess.run(["explorer", path])
        else:  # Linux
            subprocess.run(["xdg-open", path])
