"""
main.py — Entry point for the Family Tree desktop app (PyQt6).

Run from the desktop/ folder:
    python main.py

Trees are stored in FamilyTrees/ which sits alongside the desktop/ folder
(i.e., at the repo root level).
"""
import os
import sys

# Ensure imports resolve from desktop/ folder
sys.path.insert(0, os.path.dirname(__file__))

from PyQt6.QtWidgets import QApplication
from PyQt6.QtGui import QIcon
from ui.main_window import MainWindow


def get_family_trees_dir() -> str:
    """
    Return the path to FamilyTrees/ directory.
    It lives one level up from desktop/ (at the repo/app root),
    NOT in any system folder (~/Library, AppData, etc.).
    """
    desktop_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(desktop_dir)
    trees_dir = os.path.join(repo_root, "FamilyTrees")
    os.makedirs(trees_dir, exist_ok=True)
    return trees_dir


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("Family Tree App")
    app.setOrganizationName("FAMT")

    # ── Global stylesheet ─────────────────────────────────────────────
    # Explicit color on every rule prevents macOS system-theme /
    # dark-mode palette bleed from making text invisible (white on white).
    app.setStyleSheet("""
        /* ── Base ── */
        QWidget {
            color: #212121;
            background-color: #FFFFFF;
            font-family: "Helvetica Neue", Arial, sans-serif;
            font-size: 13px;
        }

        /* ── Main window & dialogs ── */
        QMainWindow { background: #FFFFFF; }
        QDialog      { background: #FFFFFF; color: #212121; }
        QFrame       { color: #212121; }

        /* ── Tabs ── */
        QTabWidget::pane {
            border: 1px solid #CCCCCC;
            background: #FFFFFF;
        }
        QTabBar::tab {
            padding: 6px 16px;
            background: #EEEEEE;
            color: #424242;
            border: 1px solid #CCCCCC;
            border-bottom: none;
            border-radius: 4px 4px 0 0;
            margin-right: 2px;
        }
        QTabBar::tab:selected {
            background: #FFFFFF;
            color: #1565C0;
            border-bottom: 2px solid #1565C0;
            font-weight: bold;
        }
        QTabBar::tab:hover:!selected {
            background: #E3F2FD;
            color: #1565C0;
        }

        /* ── Buttons ── */
        QPushButton {
            padding: 5px 14px;
            border: 1px solid #BDBDBD;
            border-radius: 4px;
            background: #F5F5F5;
            color: #212121;
        }
        QPushButton:hover {
            background: #E3F2FD;
            border-color: #1565C0;
            color: #1565C0;
        }
        QPushButton:pressed {
            background: #BBDEFB;
            color: #0D47A1;
        }
        QPushButton:disabled {
            background: #EEEEEE;
            color: #9E9E9E;
            border-color: #E0E0E0;
        }
        QPushButton:checked {
            background: #1565C0;
            color: #FFFFFF;
            border-color: #0D47A1;
        }

        /* ── Dialog button box ── */
        QDialogButtonBox QPushButton { min-width: 72px; }

        /* ── Text inputs ── */
        QLineEdit, QTextEdit, QPlainTextEdit {
            border: 1px solid #BDBDBD;
            border-radius: 3px;
            padding: 3px 6px;
            background: #FFFFFF;
            color: #212121;
        }
        QLineEdit:focus, QTextEdit:focus { border-color: #1565C0; }

        /* ── ComboBox ── */
        QComboBox {
            border: 1px solid #BDBDBD;
            border-radius: 3px;
            padding: 3px 6px;
            background: #FFFFFF;
            color: #212121;
        }
        QComboBox:focus { border-color: #1565C0; }
        QComboBox QAbstractItemView {
            background: #FFFFFF;
            color: #212121;
            selection-background-color: #E3F2FD;
            selection-color: #1565C0;
        }

        /* ── Labels ── */
        QLabel { color: #212121; background: transparent; }

        /* ── GroupBox ── */
        QGroupBox {
            font-weight: bold;
            color: #212121;
            border: 1px solid #CCCCCC;
            border-radius: 4px;
            margin-top: 10px;
            padding-top: 6px;
        }
        QGroupBox::title {
            subcontrol-origin: margin;
            left: 10px;
            color: #1565C0;
        }

        /* ── List widget (sidebar) ── */
        QListWidget {
            background: #FAFAFA;
            color: #212121;
            border: none;
        }
        QListWidget::item { padding: 6px 8px; }
        QListWidget::item:selected { background: #E3F2FD; color: #1565C0; }
        QListWidget::item:hover { background: #F5F5F5; }

        /* ── ScrollArea ── */
        QScrollArea { border: none; background: transparent; }

        /* ── Menu bar & menus ── */
        QMenuBar { background: #F5F5F5; color: #212121; }
        QMenuBar::item:selected { background: #E3F2FD; color: #1565C0; }
        QMenu {
            background: #FFFFFF;
            color: #212121;
            border: 1px solid #CCCCCC;
        }
        QMenu::item:selected { background: #E3F2FD; color: #1565C0; }

        /* ── Status bar ── */
        QStatusBar { color: #616161; background: #F5F5F5; }

        /* ── Splitter ── */
        QSplitter::handle { background: #E0E0E0; }

        /* ── Scrollbars ── */
        QScrollBar:vertical   { width: 10px;  background: #F5F5F5; }
        QScrollBar:horizontal { height: 10px; background: #F5F5F5; }
        QScrollBar::handle:vertical, QScrollBar::handle:horizontal {
            background: #BDBDBD;
            border-radius: 5px;
            min-height: 20px;
            min-width: 20px;
        }
        QScrollBar::add-line, QScrollBar::sub-line { height: 0; width: 0; }
    """)

    family_trees_dir = get_family_trees_dir()
    window = MainWindow(family_trees_dir)
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()

