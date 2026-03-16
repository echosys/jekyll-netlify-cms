# 20260305 Debug – Map View Blank + GPS Coordinates Wrong

## Symptoms
1. Map tab shows blank grey screen — no map tiles, no markers
2. Photos with GPS were parsed with wildly wrong coordinates (e.g. `lat=17056881`)
3. Some photos with sentinel `0xFFFFFF` GPS data were incorrectly shown as having GPS

---

## Root Causes

### Bug 1: Blank map (QWebEngineView + folium CDN)
`folium` generates HTML that loads Leaflet, Bootstrap, and other libraries from
**external CDN URLs** (`cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, etc.).

When `QWebEngineView` loads a `file://` URL, Qt's security policy blocks all
cross-origin network requests — so none of the CDN scripts ever loaded and the
map was a blank grey box.

**Fix (`ui/map_view.py`):**
```python
settings = self.web_view.settings()
settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
```

### Bug 2: App crash on startup (WebEngine before QApplication)
`QWebEngineWidgets` must be imported and `AA_ShareOpenGLContexts` must be set
**before** `QApplication` is instantiated — otherwise Qt crashes.

`main.py` was creating `QApplication` first and only importing `MapView`
(which imports `QWebEngineWidgets`) later, causing a silent crash.

**Fix (`main.py`):**
```python
from PyQt6.QtWebEngineWidgets import QWebEngineView   # must be first
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QApplication
QApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
app = QApplication(sys.argv)
```

### Bug 3: GPS coordinates massively wrong (piexif rational vs PIL float)
`ExifReader._convert_to_degrees()` assumed piexif rational tuple format
`((deg_num, deg_den), (min_num, min_den), (sec_num, sec_den))`.

PIL's `getexif()` returns GPS values that are already converted to floats
`(50.0, 49.0, 6.96)` — running the rational formula on these produces
`50 + 49/60 + 6.96/3600 = 50.8169…` ✓ — wait, that's actually fine.

The real issue: **piexif** was being used and it returned `((16777215, 1), ...)` —
the `0xFFFFFF` sentinel value that Panasonic cameras write when GPS lock failed.
This resulted in `lat = 16777215 + 16777215/60 + ... = 17056881.85`.

**Fix (`utils/exif_reader.py`):**
- Switched GPS parsing to **PIL's `getexif()` + GPSTAGS** (public, typed API)
- `_dms_to_decimal()` handles both float/IFDRational and piexif-style `(num, den)` tuples
- Added `0xFFFFFF` sentinel rejection: if `degrees >= 16777215` → return `None`
- Added WGS-84 range sanity check: `lat` must be in `[-90, 90]`, `lon` in `[-180, 180]`
- piexif still used for `datetime` and camera make/model fields

### Bug 4: Status bar missing context
Added a status bar at the top of `MapView` showing:
- `📍 12 photo(s) with GPS shown on map  ·  8 photo(s) without GPS not shown`
- `⚠️  None of the 20 loaded photo(s) have GPS data`

---

## Files Changed
| File | Change |
|---|---|
| `main.py` | Import WebEngine before QApplication; set AA_ShareOpenGLContexts |
| `ui/map_view.py` | Enable LocalContentCanAccessRemoteUrls; add status bar; fix None guard in grouping |
| `utils/exif_reader.py` | Rewrite GPS parsing: PIL getexif(), sentinel rejection, range sanity check |

