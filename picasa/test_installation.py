"""
Test script to verify installation
"""
import sys

def test_imports():
    """Test all required imports"""
    print("Testing imports...")

    try:
        print("  - PyQt6.QtWidgets... ", end="")
        from PyQt6.QtWidgets import QApplication
        print("✓")
    except ImportError as e:
        print(f"✗ {e}")
        return False

    try:
        print("  - PyQt6.QtCore... ", end="")
        from PyQt6.QtCore import Qt
        print("✓")
    except ImportError as e:
        print(f"✗ {e}")
        return False

    try:
        print("  - PyQt6.QtWebEngineWidgets... ", end="")
        from PyQt6.QtWebEngineWidgets import QWebEngineView
        print("✓")
    except ImportError as e:
        print(f"✗ {e}")
        return False

    try:
        print("  - PIL... ", end="")
        from PIL import Image
        print("✓")
    except ImportError as e:
        print(f"✗ {e}")
        return False

    try:
        print("  - piexif... ", end="")
        import piexif
        print("✓")
    except ImportError as e:
        print(f"✗ {e}")
        return False

    try:
        print("  - imageio... ", end="")
        import imageio
        print("✓")
    except ImportError as e:
        print(f"✗ {e}")
        return False

    try:
        print("  - folium... ", end="")
        import folium
        print("✓")
    except ImportError as e:
        print(f"✗ {e}")
        return False

    print("\nAll imports successful! ✓")
    return True


def test_app_structure():
    """Test application structure"""
    print("\nTesting application structure...")

    from pathlib import Path

    required_files = [
        "main.py",
        "requirements.txt",
        "ui/__init__.py",
        "ui/main_window.py",
        "ui/workspace_panel.py",
        "ui/folder_view.py",
        "ui/timeline_view.py",
        "ui/map_view.py",
        "core/__init__.py",
        "core/models.py",
        "core/workspace_manager.py",
        "core/photo_scanner.py",
        "core/thumbnail_cache.py",
        "utils/__init__.py",
        "utils/config_manager.py",
        "utils/exif_reader.py",
        "utils/file_utils.py"
    ]

    all_exist = True
    for file_path in required_files:
        exists = Path(file_path).exists()
        status = "✓" if exists else "✗"
        print(f"  {status} {file_path}")
        if not exists:
            all_exist = False

    if all_exist:
        print("\nAll required files present! ✓")
    else:
        print("\nSome files are missing! ✗")

    return all_exist


if __name__ == "__main__":
    print("=" * 50)
    print("Photo Manager - Installation Test")
    print("=" * 50)
    print()

    imports_ok = test_imports()
    structure_ok = test_app_structure()

    print()
    print("=" * 50)
    if imports_ok and structure_ok:
        print("✓ All tests passed! Ready to run: python main.py")
    else:
        print("✗ Some tests failed. Please check the output above.")
    print("=" * 50)
