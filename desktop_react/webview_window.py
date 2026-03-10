"""
webview_window.py — Main window containing the QtWebEngine WebView.
"""
from __future__ import annotations

from PyQt6.QtCore import QSettings, QUrl, Qt
from PyQt6.QtGui import QAction, QKeySequence
from PyQt6.QtWebEngineCore import QWebEngineSettings
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QStatusBar,
    QToolBar,
    QWidget,
    QCheckBox,
    QDoubleSpinBox,
)

import config


class SettingsDialog(QDialog):
    """Simple dialog to edit config.json values at runtime."""

    def __init__(self, cfg: dict, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Settings")
        self.setMinimumWidth(420)
        self._cfg = dict(cfg)

        layout = QFormLayout(self)
        layout.setContentsMargins(16, 16, 16, 12)
        layout.setSpacing(10)

        # URL
        self._url_edit = QLineEdit(self._cfg.get("app_url", ""))
        layout.addRow("App URL:", self._url_edit)

        # Window title
        self._title_edit = QLineEdit(self._cfg.get("window_title", ""))
        layout.addRow("Window title:", self._title_edit)

        # Zoom factor
        self._zoom_spin = QDoubleSpinBox()
        self._zoom_spin.setRange(0.25, 5.0)
        self._zoom_spin.setSingleStep(0.1)
        self._zoom_spin.setDecimals(2)
        self._zoom_spin.setValue(float(self._cfg.get("zoom_factor", 1.0)))
        layout.addRow("Zoom factor:", self._zoom_spin)

        # Dev tools
        self._devtools_cb = QCheckBox("Enable Dev Tools (F12)")
        self._devtools_cb.setChecked(bool(self._cfg.get("dev_tools_enabled", False)))
        layout.addRow("", self._devtools_cb)

        # Remember geometry
        self._geom_cb = QCheckBox("Remember window size & position")
        self._geom_cb.setChecked(bool(self._cfg.get("remember_window_geometry", True)))
        layout.addRow("", self._geom_cb)

        # Config file path (read-only info)
        path_label = QLabel(f'<small><i>{config.config_path()}</i></small>')
        path_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addRow("Config file:", path_label)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addRow(buttons)

    def result_config(self) -> dict:
        self._cfg["app_url"] = self._url_edit.text().strip()
        self._cfg["window_title"] = self._title_edit.text().strip()
        self._cfg["zoom_factor"] = self._zoom_spin.value()
        self._cfg["dev_tools_enabled"] = self._devtools_cb.isChecked()
        self._cfg["remember_window_geometry"] = self._geom_cb.isChecked()
        return self._cfg


class WebViewWindow(QMainWindow):
    """Main application window — wraps a QWebEngineView."""

    _GEOMETRY_KEY = "webview/geometry"
    _STATE_KEY = "webview/windowState"

    def __init__(self, cfg: dict) -> None:
        super().__init__()
        self._cfg = cfg
        self._dev_tools_window: QMainWindow | None = None

        self._setup_ui()
        self._restore_geometry()
        self._navigate(self._cfg["app_url"])

    # ------------------------------------------------------------------ #
    #  UI setup                                                            #
    # ------------------------------------------------------------------ #

    def _setup_ui(self) -> None:
        self.setWindowTitle(self._cfg.get("window_title", "Family Tree App"))
        self.resize(
            int(self._cfg.get("window_width", 1280)),
            int(self._cfg.get("window_height", 800)),
        )

        # ── WebView ─────────────────────────────────────────────────── #
        self._view = QWebEngineView(self)
        self._view.setZoomFactor(float(self._cfg.get("zoom_factor", 1.0)))

        # Enable useful web features
        settings = self._view.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanOpenWindows, True)
        settings.setAttribute(
            QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True
        )

        self._view.titleChanged.connect(self._on_title_changed)
        self._view.loadStarted.connect(lambda: self.statusBar().showMessage("Loading…"))
        self._view.loadFinished.connect(self._on_load_finished)
        self.setCentralWidget(self._view)

        # ── Toolbar ─────────────────────────────────────────────────── #
        tb = QToolBar("Navigation", self)
        tb.setMovable(False)
        self.addToolBar(tb)

        self._back_action = QAction("◀ Back", self)
        self._back_action.setShortcut(QKeySequence.StandardKey.Back)
        self._back_action.triggered.connect(self._view.back)
        tb.addAction(self._back_action)

        self._fwd_action = QAction("Forward ▶", self)
        self._fwd_action.setShortcut(QKeySequence.StandardKey.Forward)
        self._fwd_action.triggered.connect(self._view.forward)
        tb.addAction(self._fwd_action)

        reload_action = QAction("⟳ Reload", self)
        reload_action.setShortcut(QKeySequence.StandardKey.Refresh)
        reload_action.triggered.connect(self._view.reload)
        tb.addAction(reload_action)

        tb.addSeparator()

        self._url_bar = QLineEdit(self)
        self._url_bar.setPlaceholderText("Enter URL…")
        self._url_bar.returnPressed.connect(self._on_url_bar_return)
        self._view.urlChanged.connect(
            lambda url: self._url_bar.setText(url.toString())
        )
        tb.addWidget(self._url_bar)

        tb.addSeparator()

        home_action = QAction("⌂ Home", self)
        home_action.triggered.connect(self._go_home)
        tb.addAction(home_action)

        settings_action = QAction("⚙ Settings", self)
        settings_action.triggered.connect(self._open_settings)
        tb.addAction(settings_action)

        # ── Status bar ──────────────────────────────────────────────── #
        self.setStatusBar(QStatusBar(self))

        # ── Menu bar ────────────────────────────────────────────────── #
        menu = self.menuBar()

        view_menu = menu.addMenu("&View")

        zoom_in = QAction("Zoom &In", self)
        zoom_in.setShortcut(QKeySequence.StandardKey.ZoomIn)
        zoom_in.triggered.connect(lambda: self._zoom(0.1))
        view_menu.addAction(zoom_in)

        zoom_out = QAction("Zoom &Out", self)
        zoom_out.setShortcut(QKeySequence.StandardKey.ZoomOut)
        zoom_out.triggered.connect(lambda: self._zoom(-0.1))
        view_menu.addAction(zoom_out)

        reset_zoom = QAction("&Reset Zoom", self)
        reset_zoom.setShortcut(QKeySequence("Ctrl+0"))
        reset_zoom.triggered.connect(lambda: self._set_zoom(1.0))
        view_menu.addAction(reset_zoom)

        view_menu.addSeparator()

        devtools_action = QAction("&Developer Tools", self)
        devtools_action.setShortcut(QKeySequence("F12"))
        devtools_action.triggered.connect(self._toggle_dev_tools)
        view_menu.addAction(devtools_action)

        help_menu = menu.addMenu("&Help")
        about_action = QAction("&About", self)
        about_action.triggered.connect(self._show_about)
        help_menu.addAction(about_action)

    # ------------------------------------------------------------------ #
    #  Navigation helpers                                                  #
    # ------------------------------------------------------------------ #

    def _navigate(self, url: str) -> None:
        if not url.startswith(("http://", "https://", "file://")):
            url = "http://" + url
        self._view.setUrl(QUrl(url))
        self._url_bar.setText(url)

    def _go_home(self) -> None:
        self._navigate(self._cfg.get("app_url", "http://localhost:5173/"))

    def _on_url_bar_return(self) -> None:
        self._navigate(self._url_bar.text().strip())

    # ------------------------------------------------------------------ #
    #  Zoom helpers                                                        #
    # ------------------------------------------------------------------ #

    def _zoom(self, delta: float) -> None:
        self._set_zoom(round(self._view.zoomFactor() + delta, 2))

    def _set_zoom(self, factor: float) -> None:
        factor = max(0.25, min(5.0, factor))
        self._view.setZoomFactor(factor)
        self.statusBar().showMessage(f"Zoom: {int(factor * 100)}%", 2000)

    # ------------------------------------------------------------------ #
    #  Dev tools                                                           #
    # ------------------------------------------------------------------ #

    def _toggle_dev_tools(self) -> None:
        if self._dev_tools_window is None:
            dev_view = QWebEngineView()
            self._view.page().setDevToolsPage(dev_view.page())
            self._dev_tools_window = QMainWindow(self)
            self._dev_tools_window.setWindowTitle("Developer Tools")
            self._dev_tools_window.setCentralWidget(dev_view)
            self._dev_tools_window.resize(900, 600)

        if self._dev_tools_window.isVisible():
            self._dev_tools_window.hide()
        else:
            self._dev_tools_window.show()
            self._dev_tools_window.raise_()

    # ------------------------------------------------------------------ #
    #  Settings dialog                                                     #
    # ------------------------------------------------------------------ #

    def _open_settings(self) -> None:
        dlg = SettingsDialog(self._cfg, self)
        if dlg.exec() == QDialog.DialogCode.Accepted:
            new_cfg = dlg.result_config()
            url_changed = new_cfg.get("app_url") != self._cfg.get("app_url")
            self._cfg.update(new_cfg)
            config.save(self._cfg)
            self.setWindowTitle(self._cfg.get("window_title", "Family Tree App"))
            self._view.setZoomFactor(float(self._cfg.get("zoom_factor", 1.0)))
            if url_changed:
                self._navigate(self._cfg["app_url"])

    # ------------------------------------------------------------------ #
    #  Slots                                                               #
    # ------------------------------------------------------------------ #

    def _on_title_changed(self, title: str) -> None:
        base = self._cfg.get("window_title", "Family Tree App")
        if title:
            self.setWindowTitle(f"{title} — {base}")
        else:
            self.setWindowTitle(base)

    def _on_load_finished(self, ok: bool) -> None:
        url = self._view.url().toString()
        if ok:
            self.statusBar().showMessage(f"Loaded: {url}", 3000)
        else:
            self.statusBar().showMessage(f"Failed to load: {url}")

    # ------------------------------------------------------------------ #
    #  About                                                               #
    # ------------------------------------------------------------------ #

    def _show_about(self) -> None:
        url = self._cfg.get("app_url", "")
        QMessageBox.about(
            self,
            "About Family Tree App",
            f"<b>Family Tree App — WebView</b><br><br>"
            f"Displaying: <tt>{url}</tt><br><br>"
            f"Powered by PyQt6 + QtWebEngine.",
        )

    # ------------------------------------------------------------------ #
    #  Window geometry persistence                                         #
    # ------------------------------------------------------------------ #

    def _restore_geometry(self) -> None:
        if not self._cfg.get("remember_window_geometry", True):
            return
        settings = QSettings("FAMT", "FamilyTreeReact")
        geom = settings.value(self._GEOMETRY_KEY)
        state = settings.value(self._STATE_KEY)
        if geom:
            self.restoreGeometry(geom)
        if state:
            self.restoreState(state)

    def closeEvent(self, event) -> None:  # noqa: N802
        if self._cfg.get("remember_window_geometry", True):
            settings = QSettings("FAMT", "FamilyTreeReact")
            settings.setValue(self._GEOMETRY_KEY, self.saveGeometry())
            settings.setValue(self._STATE_KEY, self.saveState())
        super().closeEvent(event)


