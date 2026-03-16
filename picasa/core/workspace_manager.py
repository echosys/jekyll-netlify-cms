"""
Workspace Manager - Manages workspaces (folders)
"""
from pathlib import Path
from typing import List, Dict, Any
from PyQt6.QtCore import QObject, pyqtSignal
from core.models import Workspace


class WorkspaceManager(QObject):
    """Manages workspaces (folders containing photos)"""

    workspace_added = pyqtSignal(object)  # Workspace
    workspace_removed = pyqtSignal(str)  # workspace path
    workspace_toggled = pyqtSignal(str, bool)  # workspace path, is_active

    def __init__(self, config_manager):
        super().__init__()
        self.config_manager = config_manager
        self.workspaces: List[Workspace] = []
        self._load_workspaces()

    def _load_workspaces(self):
        """Load workspaces from config"""
        workspace_data = self.config_manager.get_workspaces()
        for data in workspace_data:
            workspace = Workspace(
                path=Path(data['path']),
                name=data.get('name', ''),
                is_active=data.get('is_active', True)
            )
            self.workspaces.append(workspace)

    def _save_workspaces(self):
        """Save workspaces to config"""
        workspace_data = [
            {
                'path': str(ws.path),
                'name': ws.name,
                'is_active': ws.is_active
            }
            for ws in self.workspaces
        ]
        self.config_manager.save_workspaces(workspace_data)

    def add_workspace(self, folder_path: Path) -> bool:
        """Add a new workspace"""
        # Check if already exists
        if any(ws.path == folder_path for ws in self.workspaces):
            return False

        # Create workspace
        workspace = Workspace(
            path=folder_path,
            name=folder_path.name,
            is_active=True
        )

        self.workspaces.append(workspace)
        self._save_workspaces()
        self.workspace_added.emit(workspace)
        return True

    def remove_workspace(self, folder_path: Path):
        """Remove a workspace"""
        self.workspaces = [ws for ws in self.workspaces if ws.path != folder_path]
        self._save_workspaces()
        self.workspace_removed.emit(str(folder_path))

    def toggle_workspace(self, folder_path: Path, is_active: bool):
        """Toggle workspace active state"""
        for workspace in self.workspaces:
            if workspace.path == folder_path:
                workspace.is_active = is_active
                self._save_workspaces()
                self.workspace_toggled.emit(str(folder_path), is_active)
                break

    def get_active_workspaces(self) -> List[Workspace]:
        """Get list of active workspaces"""
        return [ws for ws in self.workspaces if ws.is_active]

    def get_all_workspaces(self) -> List[Workspace]:
        """Get all workspaces"""
        return self.workspaces
