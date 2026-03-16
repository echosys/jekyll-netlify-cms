#!/usr/bin/env python3
"""
Quick verification that the app can start
"""
import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def main():
    print("=" * 60)
    print("Photo Manager - Quick Verification")
    print("=" * 60)
    print()

    # Test imports
    print("1. Testing imports...")
    try:
        from PyQt6.QtWidgets import QApplication
        from PyQt6.QtCore import Qt
        print("   ✓ PyQt6 available")
    except ImportError as e:
        print(f"   ✗ PyQt6 not available: {e}")
        return False

    try:
        from core.models import Photo, Workspace
        from core.workspace_manager import WorkspaceManager
        from core.photo_scanner import PhotoScanner
        from core.thumbnail_cache import ThumbnailCache
        print("   ✓ Core modules available")
    except ImportError as e:
        print(f"   ✗ Core modules error: {e}")
        return False

    try:
        from utils.config_manager import ConfigManager
        from utils.exif_reader import ExifReader
        from utils.file_utils import is_media_file
        print("   ✓ Utility modules available")
    except ImportError as e:
        print(f"   ✗ Utility modules error: {e}")
        return False

    try:
        from ui.main_window import MainWindow
        from ui.workspace_panel import WorkspacePanel
        from ui.folder_view import FolderView
        from ui.timeline_view import TimelineView
        from ui.map_view import MapView
        print("   ✓ UI modules available")
    except ImportError as e:
        print(f"   ✗ UI modules error: {e}")
        return False

    print()
    print("2. Testing basic functionality...")
    try:
        # Test ConfigManager
        config = ConfigManager()
        print("   ✓ ConfigManager instantiated")

        # Test file utils
        from pathlib import Path
        result = is_media_file(Path("test.jpg"))
        print("   ✓ File utilities working")

        # Test models
        from datetime import datetime
        photo = Photo(
            path=Path("/test/photo.jpg"),
            filename="photo.jpg",
            size=1024,
            created_time=datetime.now(),
            modified_time=datetime.now()
        )
        print("   ✓ Photo model working")

        workspace = Workspace(
            path=Path("/test"),
            name="Test"
        )
        print("   ✓ Workspace model working")

    except Exception as e:
        print(f"   ✗ Functionality test error: {e}")
        return False

    print()
    print("=" * 60)
    print("✅ ALL CHECKS PASSED!")
    print()
    print("You can now run the application with:")
    print("    python main.py")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
