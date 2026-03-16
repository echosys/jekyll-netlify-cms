"""
Configuration Manager - Handles app settings and workspace persistence
"""
import json
import socket
import os
from pathlib import Path
from typing import List, Dict, Any


class ConfigManager:
    """Manages application configuration and settings"""

    def __init__(self):
        # Store config and cache inside the repo, namespaced by machine name
        repo_root = Path(__file__).resolve().parent.parent
        machine_name = socket.gethostname().split(".")[0] or os.getlogin()

        config_dir = repo_root / "config" / machine_name
        config_dir.mkdir(parents=True, exist_ok=True)

        cache_dir = repo_root / "cache" / machine_name
        cache_dir.mkdir(parents=True, exist_ok=True)

        self.config_file = config_dir / "config.json"
        self.cache_dir = cache_dir
        self.thumbnail_dir = cache_dir / "thumbnails"
        self.thumbnail_dir.mkdir(exist_ok=True)

        self.config: Dict[str, Any] = self._load_config()

    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from file"""
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading config: {e}")

        # Default configuration
        return {
            "workspaces": [],
            "window_geometry": None,
            "last_view": "folder",
            "thumbnail_size": 200,
            "sort_by": "created_time",
            # Map settings
            # True  → inline downloaded JS/CSS (works offline, no proxy needed)
            # False → use CDN URLs directly (requires internet + proxy if behind firewall)
            "map_use_local_assets": True,
            # Proxy for CDN downloads and live CDN mode, e.g. "http://proxy.corp.com:8080"
            # Leave empty "" to use system environment proxy (http_proxy / https_proxy)
            "map_proxy": ""
        }

    def save_config(self):
        """Save configuration to file"""
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2)
        except Exception as e:
            print(f"Error saving config: {e}")

    def get_workspaces(self) -> List[Dict[str, Any]]:
        """Get list of saved workspaces"""
        return self.config.get("workspaces", [])

    def save_workspaces(self, workspaces: List[Dict[str, Any]]):
        """Save workspaces list"""
        self.config["workspaces"] = workspaces
        self.save_config()

    def get_setting(self, key: str, default=None):
        """Get a setting value"""
        return self.config.get(key, default)

    def set_setting(self, key: str, value):
        """Set a setting value"""
        self.config[key] = value
        self.save_config()
