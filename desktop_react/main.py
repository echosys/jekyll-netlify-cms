"""
main.py — Entry point for the Family Tree WebView desktop app.

Run from the desktop_react/ folder:
    python main.py

The app URL and other settings are read from config.json in the same folder.
Default URL: http://localhost:5173/  (Vite dev server for web_react/)
"""
import os
import sys

# Ensure imports resolve from this folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PyQt6.QtWidgets import QApplication

import config
from webview_window import WebViewWindow


def main() -> None:
    # QtWebEngine requires this before QApplication on some platforms
    os.environ.setdefault("QTWEBENGINE_CHROMIUM_FLAGS", "--disable-gpu-sandbox")

    app = QApplication(sys.argv)
    app.setApplicationName("Family Tree App")
    app.setOrganizationName("FAMT")

    cfg = config.load()

    window = WebViewWindow(cfg)
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()

