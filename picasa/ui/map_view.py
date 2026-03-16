"""
Map View - Display photos on a map using GPS coordinates
"""
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QLabel,
                              QScrollArea, QGridLayout)
from PyQt6.QtCore import Qt, QUrl, pyqtSignal
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebEngineCore import QWebEngineSettings
from PyQt6.QtNetwork import QNetworkProxy
from PyQt6.QtGui import QPixmap
from typing import List, Optional
from pathlib import Path
from core.models import Photo
import folium
import tempfile, os, re, urllib.request, urllib.parse

# Local asset cache dir
_ASSETS_DIR = Path(__file__).parent.parent / 'cache' / 'map_assets'


# ---------------------------------------------------------------------------
# Proxy helpers
# ---------------------------------------------------------------------------

def _get_proxy_url(config_proxy: str = "") -> str:
    """
    Return the proxy URL to use for CDN downloads.
    Priority: config value → HTTPS_PROXY env → HTTP_PROXY env → ""
    """
    if config_proxy:
        return config_proxy
    return (os.environ.get("HTTPS_PROXY")
            or os.environ.get("https_proxy")
            or os.environ.get("HTTP_PROXY")
            or os.environ.get("http_proxy")
            or "")


def _make_opener(proxy_url: str = "") -> urllib.request.OpenerDirector:
    """Build a urllib opener that uses the given proxy (or direct if empty)."""
    if proxy_url:
        proxy = urllib.request.ProxyHandler({
            "http": proxy_url, "https": proxy_url
        })
    else:
        proxy = urllib.request.ProxyHandler({})   # explicit no-proxy
    return urllib.request.build_opener(proxy)


def _apply_webengine_proxy(proxy_url: str):
    """Push proxy settings into the default QWebEngineProfile (for CDN mode)."""
    if not proxy_url:
        return
    try:
        parsed = urllib.parse.urlparse(proxy_url)
        host = parsed.hostname or ""
        port = parsed.port or 8080
        q_proxy = QNetworkProxy(QNetworkProxy.ProxyType.HttpProxy, host, port)
        if parsed.username:
            q_proxy.setUser(parsed.username)
        if parsed.password:
            q_proxy.setPassword(parsed.password)
        QNetworkProxy.setApplicationProxy(q_proxy)
        print(f"[MapView] WebEngine proxy set: {host}:{port}")
    except Exception as e:
        print(f"[MapView] proxy setup failed: {e}")


# ---------------------------------------------------------------------------
# Asset inlining helpers
# ---------------------------------------------------------------------------

def _fetch_asset(url: str, proxy_url: str = "") -> Optional[str]:
    """
    Return content for a CDN URL.
    Checks local cache first; downloads (via proxy if configured) if missing.
    """
    _ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    url_path = url.split('?')[0]
    ext = '.js' if url_path.endswith('.js') else '.css'
    base = re.sub(r'[^\w._-]', '_',
                  url_path.replace('https://', '').replace('http://', ''))
    base = base.rstrip('_')[:100]
    if not base.endswith(ext):
        base += ext
    dest = _ASSETS_DIR / base

    if dest.exists():
        return dest.read_text(encoding='utf-8', errors='replace')

    # Download via proxy (or direct)
    effective_proxy = proxy_url or _get_proxy_url()
    try:
        opener = _make_opener(effective_proxy)
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with opener.open(req, timeout=15) as resp:
            data = resp.read()
        dest.write_bytes(data)
        proxy_note = f" via {effective_proxy}" if effective_proxy else ""
        print(f"[MapAssets] downloaded{proxy_note}: {url[:70]}")
        return data.decode('utf-8', errors='replace')
    except Exception as e:
        print(f"[MapAssets] failed to fetch {url[:70]}: {e}")
        return None


def _inline_assets(html: str, proxy_url: str = "") -> str:
    """Replace CDN <script src> / <link href> tags with inline content."""

    def _replace_script(m: re.Match) -> str:
        content = _fetch_asset(m.group(1), proxy_url)
        if content is None:
            return m.group(0)
        return f'<script>{content.replace("</script>", "<\\/script>")}</script>'

    def _replace_link(m: re.Match) -> str:
        content = _fetch_asset(m.group(1), proxy_url)
        if content is None:
            return m.group(0)
        return f'<style>{content}</style>'

    html = re.sub(r'<script\s+src="(https?://[^"]+\.js)"[^>]*>\s*</script>',
                  _replace_script, html)
    html = re.sub(r'<link\s+rel="stylesheet"\s+href="(https?://[^"]+\.css)"[^>]*/?>',
                  _replace_link, html)
    return html


# Script injected into <head> BEFORE all other scripts.
# This must run before Leaflet / heatmap initialise.
_HEAD_PATCH = """<script>
/* Must run before Leaflet: patch getContext so every 2d canvas gets
   willReadFrequently=true, silencing the heatmap performance warning. */
(function() {
  var _orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    if (type === '2d') attrs = Object.assign({willReadFrequently: true}, attrs || {});
    return _orig.call(this, type, attrs);
  };
})();
</script>"""

# Called from Python via runJavaScript once loadFinished fires.
# By then Qt has laid out the widget, so offsetWidth/Height are real.
# folium stores each map as  window.map_<32hex>  in global scope.
_INVALIDATE_JS = """
(function() {
  function fix() {
    for (var key in window) {
      if (/^map_[0-9a-f]{32}$/.test(key)) {
        try { window[key].invalidateSize(true); } catch(e) {}
      }
    }
  }
  fix();
  setTimeout(fix, 100);
  setTimeout(fix, 500);
})();
"""


def _patch_html(html: str) -> str:
    """
    Patch the folium HTML so the map fills the WebEngineView correctly:

    1. Inject willReadFrequently canvas patch into <head> (before Leaflet loads).
    2. Replace the folium-generated #map_xxx { width/height } CSS with
       100vw / 100vh so Leaflet measures real dimensions at init time.
    3. Force html/body to fill viewport.
    """
    import re as _re

    # 1. Inject canvas patch right after <head> opening tag
    html = html.replace('<head>', '<head>\n' + _HEAD_PATCH, 1)

    # 2. Replace the folium inline CSS for #map_xxx with 100vw/100vh.
    #    Folium writes e.g.:
    #      #map_abc123 { position: relative; width: 100.0%; height: 100.0%;
    #                    left: 0.0%; top: 0.0%; }
    #    We override to use vw/vh so the value is always viewport-relative.
    def _fix_map_css(m: _re.Match) -> str:
        map_id = m.group(1)
        return (f'#{map_id} {{\n'
                f'    position: fixed !important;\n'
                f'    top: 0 !important; left: 0 !important;\n'
                f'    width: 100vw !important; height: 100vh !important;\n'
                f'}}')

    html = _re.sub(
        r'#(map_[0-9a-f]{32})\s*[{][^}]+[}]',
        _fix_map_css,
        html,
        flags=_re.DOTALL
    )

    # 3. Ensure html and body fill the viewport
    body_css = (
        '\n<style>'
        'html,body{margin:0!important;padding:0!important;'
        'width:100%!important;height:100%!important;overflow:hidden!important;}'
        '</style>\n'
    )
    html = html.replace('</head>', body_css + '</head>', 1)

    return html


class PhotoThumbnail(QLabel):
    """Clickable photo thumbnail"""
    clicked = pyqtSignal(object)

    def __init__(self, photo: Photo, pixmap: QPixmap, parent=None):
        super().__init__(parent)
        self.photo = photo
        self.setPixmap(pixmap.scaled(150, 150, Qt.AspectRatioMode.KeepAspectRatio,
                                     Qt.TransformationMode.SmoothTransformation))
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setToolTip(photo.filename)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self.photo)


class MapView(QWidget):
    """Map view showing photos with GPS coordinates"""

    photo_clicked = pyqtSignal(object)

    def __init__(self, thumbnail_cache, config_manager=None, parent=None):
        super().__init__(parent)
        self.thumbnail_cache = thumbnail_cache
        self.config = config_manager
        self.photos: List[Photo] = []
        self.temp_map_file = None
        self.init_ui()

    def init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # ── Status bar: GPS count info ──────────────────────────────
        self._status_bar = QLabel()
        self._status_bar.setStyleSheet(
            "background: #f0f4f8; color: #555; font-size: 11px; padding: 4px 10px;")
        self._status_bar.setFixedHeight(24)
        main_layout.addWidget(self._status_bar)

        # ── Map ─────────────────────────────────────────────────────
        self.web_view = QWebEngineView()
        s = self.web_view.settings()
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
        s.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        # After page fully loads, call invalidateSize from Python side (most reliable)
        self.web_view.loadFinished.connect(self._on_map_loaded)
        main_layout.addWidget(self.web_view, stretch=7)

        # ── Photo grid strip (30%) ───────────────────────────────────
        self.photo_scroll = QScrollArea()
        self.photo_scroll.setWidgetResizable(True)
        self.photo_scroll.setMaximumHeight(200)

        self.photo_container = QWidget()
        self.photo_grid = QGridLayout(self.photo_container)
        self.photo_grid.setSpacing(5)
        self.photo_grid.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)

        self.photo_scroll.setWidget(self.photo_container)
        main_layout.addWidget(self.photo_scroll, stretch=3)

        self.show_no_photos_message()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def set_photos(self, photos: List[Photo]):
        self.photos = photos
        self.refresh_view()

    def refresh_view(self):
        gps_photos = [p for p in self.photos if p.has_gps()]
        no_gps = len(self.photos) - len(gps_photos)

        # Status bar
        if not self.photos:
            self._status_bar.setText("No photos loaded")
        elif gps_photos:
            msg = f"📍 {len(gps_photos)} photo(s) with GPS shown on map"
            if no_gps:
                msg += f"   ·   {no_gps} photo(s) without GPS not shown"
            self._status_bar.setText(msg)
        else:
            self._status_bar.setText(
                f"⚠️  None of the {len(self.photos)} loaded photo(s) have GPS data")

        if not gps_photos:
            self.show_no_photos_message()
            self.clear_photo_grid()
            return

        self.create_map(gps_photos)
        self.clear_photo_grid()

    def show_no_photos_message(self):
        html = """<!DOCTYPE html><html><head>
        <meta http-equiv="content-type" content="text/html; charset=UTF-8"/>
        </head>
        <body style="display:flex;justify-content:center;align-items:center;
                     height:100vh;margin:0;background:#f5f5f5;font-family:Arial;">
            <div style="text-align:center;color:#888;">
                <div style="font-size:48px;margin-bottom:16px;">🗺️</div>
                <h2 style="margin:0 0 8px">No GPS Data Available</h2>
                <p style="margin:0">Photos with GPS EXIF coordinates will appear here</p>
            </div>
        </body></html>"""
        self.web_view.setHtml(html)

    def create_map(self, gps_photos: List[Photo]):
        """Generate a folium map and load it in the web view."""
        # Read config flags
        use_local = True
        proxy_url = ""
        if self.config:
            use_local = self.config.get_setting("map_use_local_assets", True)
            proxy_url = self.config.get_setting("map_proxy", "") or _get_proxy_url()
        else:
            proxy_url = _get_proxy_url()

        avg_lat = sum(p.gps_latitude or 0.0 for p in gps_photos) / len(gps_photos)
        avg_lon = sum(p.gps_longitude or 0.0 for p in gps_photos) / len(gps_photos)

        lats = [p.gps_latitude or 0.0 for p in gps_photos]
        lons = [p.gps_longitude or 0.0 for p in gps_photos]
        span = max(max(lats) - min(lats), max(lons) - min(lons))
        zoom = 3 if span > 20 else 6 if span > 5 else 10

        m = folium.Map(location=[avg_lat, avg_lon], zoom_start=zoom,
                       tiles='OpenStreetMap')

        try:
            from folium.plugins import HeatMap
            heat_data = [[p.gps_latitude, p.gps_longitude] for p in gps_photos]
            HeatMap(heat_data, radius=15, blur=25, max_zoom=13).add_to(m)
        except Exception as e:
            print(f"[MapView] HeatMap failed: {e}")

        location_groups = self._group_by_location(gps_photos)
        for (lat, lon), photos in location_groups.items():
            count = len(photos)
            names = "<br>".join(p.filename for p in photos[:5])
            if count > 5:
                names += f"<br>… and {count - 5} more"
            popup_html = (f"<div style='font-family:Arial;min-width:120px'>"
                          f"<b>{count} photo{'s' if count > 1 else ''}</b><br>"
                          f"<small>{names}</small></div>")
            color = 'red' if count > 10 else 'blue' if count > 3 else 'green'
            folium.Marker(
                location=[lat, lon],
                popup=folium.Popup(popup_html, max_width=220),
                tooltip=f"{count} photo{'s' if count > 1 else ''}",
                icon=folium.Icon(color=color, icon='camera', prefix='fa')
            ).add_to(m)

        # Save to temp file
        if self.temp_map_file:
            try:
                os.unlink(self.temp_map_file)
            except Exception:
                pass
        with tempfile.NamedTemporaryFile(
                mode='w', suffix='.html', delete=False, encoding='utf-8') as f:
            m.save(f.name)
            self.temp_map_file = f.name

        raw_html = open(self.temp_map_file, encoding='utf-8').read()

        if use_local:
            html_content = _patch_html(_inline_assets(raw_html, proxy_url))
            print(f"[MapView] local-asset mode: {len(html_content)//1024}KB inlined, "
                  f"{len(gps_photos)} GPS photos")
            self.web_view.setHtml(html_content, QUrl("about:blank"))
        else:
            if proxy_url:
                _apply_webengine_proxy(proxy_url)
                print(f"[MapView] CDN mode with proxy: {proxy_url}")
            else:
                print("[MapView] CDN mode: direct (no proxy)")
            self.web_view.setHtml(_patch_html(raw_html), QUrl("https://localhost/"))

    def _group_by_location(self, photos: List[Photo], threshold: float = 0.001) -> dict:
        groups: dict = {}
        for photo in photos:
            lat = photo.gps_latitude
            lon = photo.gps_longitude
            if lat is None or lon is None:
                continue
            placed = False
            for (glat, glon) in list(groups.keys()):
                if abs(lat - glat) < threshold and abs(lon - glon) < threshold:
                    groups[(glat, glon)].append(photo)
                    placed = True
                    break
            if not placed:
                groups[(lat, lon)] = [photo]
        return groups

    def clear_photo_grid(self):
        while self.photo_grid.count():
            item = self.photo_grid.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

    def show_photos_at_location(self, photos: List[Photo]):
        self.clear_photo_grid()
        row, col, max_cols = 0, 0, 6
        for photo in photos:
            pixmap = self.thumbnail_cache.get_thumbnail(photo.path)
            if pixmap:
                thumb = PhotoThumbnail(photo, pixmap)
                thumb.clicked.connect(self.photo_clicked.emit)
                self.photo_grid.addWidget(thumb, row, col)
                col += 1
                if col >= max_cols:
                    col, row = 0, row + 1

    def _on_map_loaded(self, ok: bool):
        """Called by loadFinished — run invalidateSize from Python side."""
        if ok:
            self.web_view.page().runJavaScript(_INVALIDATE_JS)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.web_view.page().runJavaScript(_INVALIDATE_JS)

    def clear(self):
        self.photos = []
        self.refresh_view()
