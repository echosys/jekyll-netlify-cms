# 20260305 Debug – Map View Still Blank (CDN Inline Fix)

## Symptom
Map tab showed only the status bar ("6 photos with GPS") but the map area
was completely blank/grey even after setting `LocalContentCanAccessRemoteUrls=True`.

## Root Cause

`QWebEngineSettings.LocalContentCanAccessRemoteUrls` set **per-widget** via
`self.web_view.settings()` has no effect in Qt6 WebEngine — settings must be
applied to the **default profile** before any page loads. Even setting it on
the default profile in `main.py` was unreliable because the Qt6 WebEngine
process sandboxing blocks external network requests from `setHtml()` content
regardless of settings.

The underlying issue: **folium generates HTML with 11 external CDN references**
(Leaflet, Bootstrap, FontAwesome, etc.) that are blocked by the WebEngine
sandbox when loading via `setHtml()` or `setUrl(file://)`.

## Fix

### Strategy: Inline all CDN assets into the HTML before calling `setHtml()`

1. **`download_map_assets.py`** — one-time script that downloads all 11 CDN
   assets to `cache/map_assets/`:
   - `leaflet.js`, `leaflet.css`
   - `jquery.min.js`
   - `bootstrap.bundle.min.js`, `bootstrap.min.css`
   - `leaflet.awesome-markers.js`, `leaflet.awesome-markers.css`
   - `fontawesome all.min.css`
   - `bootstrap-glyphicons.css`
   - `leaflet.awesome.rotate.min.css`
   - `leaflet_heat.min.js`

2. **`_inline_assets(html)`** in `map_view.py` — uses regex to find all
   `<script src="https://...">` and `<link rel="stylesheet" href="https://...">`
   tags and replaces them with inline `<script>` / `<style>` blocks.

3. **`_fetch_asset(url)`** — looks up URL in `cache/map_assets/` by a
   deterministic filename (sanitised URL path + correct extension). Downloads
   on-demand if missing.

### Result
- HTML grows from ~4 KB → ~673 KB (all JS/CSS embedded)
- Zero CDN requests needed — works fully offline and inside WebEngine sandbox
- Only remaining external ref: `https://leafletjs.com` attribution `<a>` link (harmless)

## Files Changed
| File | Change |
|---|---|
| `ui/map_view.py` | Added `_inline_assets()` + `_fetch_asset()` + call in `create_map()` |
| `download_map_assets.py` | New: one-time asset downloader |
| `cache/map_assets/` | 11 cached CDN asset files |

