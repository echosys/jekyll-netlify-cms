"""
Photo Manager - Main Entry Point
A lightweight photo management application for Windows and macOS
"""
import sys
import signal
# QtWebEngine MUST be imported and AA_ShareOpenGLContexts MUST be set
# before QApplication is instantiated, otherwise the app crashes on macOS/Linux.
from PyQt6.QtWebEngineWidgets import QWebEngineView  # noqa: F401 – side-effect import
from PyQt6.QtWebEngineCore import QWebEngineProfile, QWebEngineSettings
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtWidgets import QApplication
from ui.main_window import MainWindow


def main():
    """Main application entry point"""
    # Restore default Ctrl+C behavior
    signal.signal(signal.SIGINT, signal.SIG_DFL)

    QApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    app = QApplication(sys.argv)
    app.setApplicationName("Photo Manager")
    app.setOrganizationName("PhotoManager")

    # Periodic timer to allow Python to process signals (like Ctrl+C)
    timer = QTimer()
    timer.timeout.connect(lambda: None)
    timer.start(100)

    # Allow local file:// pages to load remote CDN resources (needed for folium maps).
    # Must be done on the default profile AFTER QApplication but BEFORE any page loads.
    profile = QWebEngineProfile.defaultProfile()
    if profile:
        profile_settings = profile.settings()
        if profile_settings:
            profile_settings.setAttribute(
                QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
            profile_settings.setAttribute(
                QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
            profile_settings.setAttribute(
                QWebEngineSettings.WebAttribute.JavascriptEnabled, True)

    # Create and show main window
    window = MainWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == '__main__':
    main()
