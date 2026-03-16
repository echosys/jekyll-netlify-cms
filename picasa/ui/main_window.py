"""
Main Window - Application main window with workspace panel and view tabs
"""
import os
from PyQt6.QtWidgets import (QMainWindow, QWidget, QHBoxLayout, QSplitter,
                              QTabWidget, QProgressBar, QStatusBar, QMessageBox,
                              QVBoxLayout)
from PyQt6.QtCore import Qt, QThreadPool
from PyQt6.QtGui import QAction
from pathlib import Path
from typing import List, Dict

from core.workspace_manager import WorkspaceManager
from core.photo_scanner import PhotoScanner
from core.scanner_cache import ScannerCache
from core.thumbnail_cache import ThumbnailCache
from core.models import Photo
from core.location_scanner import LocationScannerWorker
from utils.config_manager import ConfigManager
from utils.geocoder import GeocoderCache

from ui.workspace_panel import WorkspacePanel
from ui.folder_view import FolderView
from ui.timeline_view import TimelineView
from ui.map_view import MapView
from ui.photo_preview import PhotoPreviewDialog


class MainWindow(QMainWindow):
    """Main application window"""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Photo Manager")
        self.setGeometry(100, 100, 1400, 900)

        # Initialize managers
        self.config_manager = ConfigManager()
        self.workspace_manager = WorkspaceManager(self.config_manager)
        self.thread_pool = QThreadPool()
        self.scanner_cache = ScannerCache(
            self.config_manager.cache_dir / "scanner_cache.db"
        )
        self.scanner = PhotoScanner(self.thread_pool, self.scanner_cache)
        self.thumbnail_cache = ThumbnailCache(
            self.config_manager.thumbnail_dir,
            self.config_manager.get_setting("thumbnail_size", 200)
        )

        # Geocoder (shared, persistent disk cache)
        geocache_path = (self.config_manager.config_file.parent / "geocode_cache.json")
        self.geocoder_cache = GeocoderCache(geocache_path)
        self._loc_worker: LocationScannerWorker | None = None

        # Per-workspace photo store: workspace_path_str → List[Photo]
        self._workspace_photos: Dict[str, List[Photo]] = {}
        # Per-workspace path set for fast O(1) duplicate checking
        self._workspace_paths_set: Dict[str, set] = {}
        # Per-workspace scan progress: workspace_path_str → (current, total)
        self._scan_progress: Dict[str, tuple] = {}
        # Fast path→Photo lookup (rebuilt whenever photos change)
        self._path_to_photo: Dict[str, Photo] = {}

        self.init_ui()
        self.connect_signals()

        # Load active workspaces on startup
        self._load_active_workspaces_on_start()

    def init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        layout = QHBoxLayout(central_widget)
        layout.setContentsMargins(0, 0, 0, 0)

        splitter = QSplitter(Qt.Orientation.Horizontal)

        self.workspace_panel = WorkspacePanel(self.workspace_manager)
        splitter.addWidget(self.workspace_panel)

        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)

        self.tab_widget = QTabWidget()
        self.folder_view = FolderView(self.thumbnail_cache, self.thread_pool)
        self.timeline_view = TimelineView(self.thumbnail_cache, self.thread_pool)
        self.map_view = MapView(self.thumbnail_cache, self.config_manager)

        self.tab_widget.addTab(self.folder_view, "Folders")
        self.tab_widget.addTab(self.timeline_view, "Timeline")
        self.tab_widget.addTab(self.map_view, "Map")

        right_layout.addWidget(self.tab_widget)

        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        right_layout.addWidget(self.progress_bar)

        splitter.addWidget(right_panel)
        splitter.setSizes([210, 1190])

        layout.addWidget(splitter)

        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar.showMessage("Ready")

        self.create_menu_bar()

    def create_menu_bar(self):
        menubar = self.menuBar()

        file_menu = menubar.addMenu("File")
        refresh_action = QAction("Refresh All", self)
        refresh_action.setShortcut("Ctrl+R")
        refresh_action.triggered.connect(self.refresh_workspaces)
        file_menu.addAction(refresh_action)
        file_menu.addSeparator()
        exit_action = QAction("Exit", self)
        exit_action.setShortcut("Ctrl+Q")
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)

        view_menu = menubar.addMenu("View")
        clear_cache_action = QAction("Clear Thumbnail Cache", self)
        clear_cache_action.triggered.connect(self.clear_thumbnail_cache)
        view_menu.addAction(clear_cache_action)

        help_menu = menubar.addMenu("Help")
        about_action = QAction("About", self)
        about_action.triggered.connect(self.show_about)
        help_menu.addAction(about_action)

    def connect_signals(self):
        self.workspace_panel.workspace_toggled.connect(self.on_workspace_toggled)

        # Scanner signals now all carry workspace_path as first arg
        self.scanner.progress.connect(self.on_scan_progress)
        self.scanner.photo_found.connect(self.on_photo_found)
        self.scanner.finished.connect(self.on_scan_finished)
        self.scanner.error.connect(self.on_scan_error)

        # Preview on click from any view
        self.folder_view.photo_clicked.connect(self.open_preview)
        self.timeline_view.photo_clicked.connect(self.open_preview)

    # ------------------------------------------------------------------
    # Startup
    # ------------------------------------------------------------------

    def _load_active_workspaces_on_start(self):
        """Scan all already-active workspaces on first launch."""
        active = self.workspace_manager.get_active_workspaces()
        print(f"[MainWindow] startup: {len(active)} active workspace(s)")
        for ws in active:
            self._start_workspace_scan(ws.path)

    # ------------------------------------------------------------------
    # Workspace toggle – only add or remove the affected workspace
    # ------------------------------------------------------------------

    def on_workspace_toggled(self, path: str, is_active: bool):
        print(f"[MainWindow] on_workspace_toggled: path={path}  active={is_active}")
        if is_active:
            self._start_workspace_scan(Path(path))
        else:
            self._remove_workspace(path)

    def _start_workspace_scan(self, workspace_path: Path):
        ws_str = str(workspace_path)
        name = workspace_path.name
        print(f"[MainWindow] starting scan: {ws_str}")

        already_loaded = ws_str in self._workspace_photos and bool(self._workspace_photos[ws_str])

        if already_loaded:
            # Workspace widgets already exist – don't destroy them.
            # Just run a silent background rescan to pick up any disk changes.
            print(f"[MainWindow] workspace already loaded ({len(self._workspace_photos[ws_str])} photos) – silent rescan")
            self._scan_progress[ws_str] = (0, 0)
            self._update_progress_bar()
            self.status_bar.showMessage(f"Checking {name} for changes…")
            self.scanner.scan_workspace(workspace_path)
            return

        # First-time load: pull from cache immediately for responsiveness
        cached_photos = self.scanner_cache.get_workspace_photos(workspace_path)
        self._workspace_photos[ws_str] = cached_photos
        self._workspace_paths_set[ws_str] = set(str(p.path) for p in cached_photos)
        for p in cached_photos:
            self._path_to_photo[str(p.path)] = p

        self._scan_progress[ws_str] = (0, 0)
        self.folder_view.show_workspace_scanning(ws_str, name)

        if cached_photos:
            self.folder_view.update_workspace_photos(ws_str, cached_photos)
            self._refresh_non_folder_views()
            self._update_status()

        self._update_progress_bar()
        self.status_bar.showMessage(f"Scanning {name}…  counting files…")
        self.scanner.scan_workspace(workspace_path)

    def _remove_workspace(self, ws_str: str):
        print(f"[MainWindow] removing workspace from view: {ws_str}")
        # Clean path index
        removed = self._workspace_photos.pop(ws_str, [])
        self._workspace_paths_set.pop(ws_str, None)
        for p in removed:
            self._path_to_photo.pop(str(p.path), None)
        self._scan_progress.pop(ws_str, None)
        self.scanner.stop_workspace(Path(ws_str))
        self.folder_view.remove_workspace(ws_str)
        self._refresh_non_folder_views()
        self._update_status()

    # ------------------------------------------------------------------
    # Scanner callbacks – routed per workspace
    # ------------------------------------------------------------------

    def on_scan_progress(self, ws_str: str, current: int, total: int):
        if current == 1:
            print(f"[MainWindow] scan progress started for {ws_str}, total: {total}")
        self._scan_progress[ws_str] = (current, total)
        self._update_progress_bar()
        self.status_bar.showMessage(f"Loading {Path(ws_str).name}… {current}/{total}")

    def on_photo_found(self, ws_str: str, photo: Photo):
        # Prevent duplicates if we already loaded this from cache
        p_str = str(photo.path)
        path_set = self._workspace_paths_set.setdefault(ws_str, set())
        if p_str in path_set:
            return
            
        path_set.add(p_str)
        existing = self._workspace_photos.setdefault(ws_str, [])
        existing.append(photo)
        self._path_to_photo[p_str] = photo
        
        # Only refresh UI every 25 new photos to keep it snappy
        if len(existing) % 25 == 0:
            self.folder_view.update_workspace_photos(ws_str, existing)

    def on_scan_finished(self, ws_str: str, photos: List[Photo]):
        print(f"[MainWindow] scan finished for {ws_str}: {len(photos)} photos")

        new_paths = set(str(p.path) for p in photos)
        old_paths = self._workspace_paths_set.get(ws_str, set())
        changed   = new_paths != old_paths

        # Always update the authoritative photo list
        self._workspace_photos[ws_str] = photos
        self._workspace_paths_set[ws_str] = new_paths
        for p in photos:
            self._path_to_photo[str(p.path)] = p
        # Remove index entries for photos that disappeared
        for removed in old_paths - new_paths:
            self._path_to_photo.pop(removed, None)

        self._scan_progress.pop(ws_str, None)

        if changed:
            print(f"[MainWindow] photo set changed ({len(old_paths)} → {len(new_paths)}) – refreshing views")
            self.folder_view.update_workspace_photos(ws_str, photos)
            self._refresh_non_folder_views()
        else:
            print(f"[MainWindow] no file changes detected – skipping UI rebuild")

        self._update_progress_bar()
        self._update_status()
        self._auto_start_geocoding()

    def on_scan_error(self, ws_str: str, error: str):
        print(f"[MainWindow] scan ERROR for {ws_str}: {error}")
        self._scan_progress.pop(ws_str, None)
        self._update_progress_bar()
        self.status_bar.showMessage(f"Error scanning {Path(ws_str).name}")
        QMessageBox.critical(self, "Scan Error", f"Error scanning {ws_str}:\n{error}")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def open_preview(self, photo: Photo):
        """Open the full-size preview dialog for a clicked photo.
        Navigation order matches the currently active view's display order."""
        # Pick the ordered list from whichever tab is active
        active_idx = self.tab_widget.currentIndex()
        if active_idx == 0:
            ordered = self.folder_view.get_ordered_photos()
        elif active_idx == 1:
            ordered = self.timeline_view.get_ordered_photos()
        else:
            ordered = self._all_photos()

        # Fall back to all photos if the view list is empty or photo not in it
        if not ordered or photo not in ordered:
            ordered = self._all_photos()

        dlg = PhotoPreviewDialog(photo, ordered,
                                 geocoder_cache=self.geocoder_cache,
                                 proxy_url=self._get_proxy_url(),
                                 parent=self)
        dlg.setFocus()          # ensure arrow keys work immediately on open
        dlg.exec()

    def _all_photos(self) -> List[Photo]:
        result = []
        for photos in self._workspace_photos.values():
            result.extend(photos)
        return result

    def _refresh_non_folder_views(self):
        all_photos = self._all_photos()
        self.timeline_view.set_photos(all_photos)
        self.map_view.set_photos(all_photos)

    # ------------------------------------------------------------------
    # Location scanner (geocoding)
    # ------------------------------------------------------------------

    def _get_proxy_url(self) -> str:
        """Return the effective proxy URL: config value → env vars → empty."""
        url = self.config_manager.get_setting("map_proxy", "") or ""
        if not url:
            url = (os.environ.get("HTTPS_PROXY")
                   or os.environ.get("https_proxy")
                   or os.environ.get("HTTP_PROXY")
                   or os.environ.get("http_proxy", ""))
        return url

    def _auto_start_geocoding(self):
        """Called after every workspace scan completes."""
        if self._loc_worker is not None:
            print("[Geocode] auto-start skipped: already running")
            return
        all_photos = list(self._path_to_photo.values())
        gps_count  = sum(1 for p in all_photos if p.has_gps())
        need_count = sum(1 for p in all_photos
                         if p.has_gps() and not (p.location_city or p.location_state))
        print(f"[Geocode] auto-start: {gps_count} have GPS, {need_count} need geocoding")
        if need_count == 0:
            print("[Geocode] all GPS photos already have location data – skipping network calls")
            return
        self.start_location_scan(silent=True)

    def start_location_scan(self, silent: bool = False):
        """
        Start (or restart) background geocoding for all current photos.
        Called by TimelineView (silent=False) or auto after scan (silent=True).
        Safe to call multiple times – cancels any in-progress worker first.
        """
        if self._loc_worker is not None:
            self._loc_worker.cancel()
            self._loc_worker = None

        all_photos = self._all_photos()
        if not all_photos:
            return

        need = [p for p in all_photos if p.has_gps() and not (p.location_city or p.location_state)]
        cached = [p for p in all_photos if p.has_gps() and (p.location_city or p.location_state)]
        print(f"[Geocode] start_location_scan: {len(need)} need geocoding, "
              f"{len(cached)} already have location, silent={silent}")

        proxy_url = self._get_proxy_url()
        print(f"[Geocode] using proxy: {proxy_url.split('@')[-1] if proxy_url else '(none)'}")

        worker = LocationScannerWorker(all_photos, self.geocoder_cache, proxy_url)
        worker.signals.photo_geocoded.connect(self._on_photo_geocoded)
        worker.signals.progress.connect(self._on_geocode_progress)
        worker.signals.finished.connect(self._on_geocode_finished)

        self._loc_worker = worker
        if not silent:
            self.timeline_view.mark_geocoding_started()
        else:
            self.timeline_view.mark_geocoding_started_silent()
        self.thread_pool.start(worker)

    def _on_photo_geocoded(self, path: str, city: str, county: str,
                            state: str, country: str, display: str = ""):
        # Update canonical Photo object directly via index
        photo = self._path_to_photo.get(path)
        if photo:
            photo.location_city    = city
            photo.location_county  = county
            photo.location_state   = state
            photo.location_country = country
            photo.location_display = display
            if city or state:
                print(f"[Geocode] {Path(path).name}: {city}, {state}, {country}")
            # Persist the new location data to cache
            self.scanner_cache.upsert_photo(photo)
        else:
            print(f"[Geocode] WARNING: path not in index: {path}")
        # Forward to timeline view for group label / progress bar updates
        self.timeline_view.apply_geocode_result(path, city, county, state, country)

    def _on_geocode_progress(self, done: int, total: int):
        self.timeline_view.notify_geocode_progress(done, total)

    def _on_geocode_finished(self):
        print(f"[Geocode] finished. Checking location data...")
        located = sum(1 for p in self._path_to_photo.values()
                      if p.location_city or p.location_state)
        print(f"[Geocode] {located}/{len(self._path_to_photo)} photos now have location")
        self._loc_worker = None
        self.timeline_view.notify_geocode_finished()
        self.status_bar.showMessage("Location geocoding complete", 3000)

    def _update_progress_bar(self):
        if not self._scan_progress:
            self.progress_bar.setVisible(False)
            return
        # Show indeterminate if any workspace is still counting (total==0)
        totals = list(self._scan_progress.values())
        if any(t == 0 for _, t in totals):
            self.progress_bar.setVisible(True)
            self.progress_bar.setMaximum(0)
            return
        total_sum = sum(t for _, t in totals)
        cur_sum = sum(c for c, _ in totals)
        self.progress_bar.setVisible(True)
        self.progress_bar.setMaximum(total_sum)
        self.progress_bar.setValue(cur_sum)

    def _update_status(self):
        if self._scan_progress:
            return  # still scanning, let progress messages show
        total = sum(len(p) for p in self._workspace_photos.values())
        ws_count = len(self._workspace_photos)
        self.status_bar.showMessage(
            f"{total} photos across {ws_count} workspace(s)" if ws_count else "Ready")

    def refresh_workspaces(self):
        """Re-scan all active workspaces."""
        self._workspace_photos.clear()
        self._scan_progress.clear()
        self.folder_view.clear()
        active = self.workspace_manager.get_active_workspaces()
        for ws in active:
            self._start_workspace_scan(ws.path)

    def clear_thumbnail_cache(self):
        reply = QMessageBox.question(
            self, "Clear Cache", "Clear all cached thumbnails?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
        if reply == QMessageBox.StandardButton.Yes:
            self.thumbnail_cache.clear_cache()
            self.status_bar.showMessage("Thumbnail cache cleared")
            self.refresh_workspaces()

    def show_about(self):
        QMessageBox.about(self, "About Photo Manager",
            "<h2>Photo Manager</h2>"
            "<p>A lightweight photo management application</p>"
            "<p>Built with Python and PyQt6</p><p>Version 1.0.0</p>")

    def closeEvent(self, event):
        import base64
        geom_bytes = self.saveGeometry().data()
        self.config_manager.set_setting("window_geometry",
                                        base64.b64encode(geom_bytes).decode('ascii'))
        self.scanner.stop_scan()
        if self._loc_worker is not None:
            self._loc_worker.cancel()
        event.accept()
