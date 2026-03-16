# 20260305 Debug – Map Canvas Zero Width (Definitive Fix)

## Symptom
```
js: Uncaught IndexSizeError: Failed to execute 'getImageData' on 
'CanvasRenderingContext2D': The source width is 0.
```
Map tiles never rendered — blank grey area under the status bar.

## Root Cause (final diagnosis)

All previous attempts to call `invalidateSize()` from JS event listeners
(`DOMContentLoaded`, `window.load`) were too late or using wrong APIs.

The actual execution order in folium HTML:
```
<head>
  <script src="leaflet.js">          ← after inlining: inline <script>
  ...CDN scripts...
  <style> #map_xxx { width:100%; height:100%; } </style>   ← line 19
</head>
<body>
  <div id="map_xxx"></div>           ← line 57, has no size yet
  <script>
    var map_xxx = L.map("map_xxx")   ← line 63: Leaflet IMMEDIATELY measures
    ...                                            offsetWidth/Height → both 0
  </script>
</body>
```

`L.map()` runs as an **inline script** during HTML parsing — it does NOT wait
for `DOMContentLoaded` or `load`. When `setHtml()` is called, Qt hasn't
painted the widget yet, so `offsetWidth`/`offsetHeight` are 0.
`invalidateSize()` from `load` event fired later, but by then Leaflet's
internal canvas was already broken.

**The `willReadFrequently` patch was also injected at `</body>` — too late,
after the heatmap canvas was already created.**

## Fix (`ui/map_view.py` — `_patch_html`)

### 1. `willReadFrequently` patch injected into `<head>` first
```python
html = html.replace('<head>', '<head>\n' + _HEAD_PATCH, 1)
```
`_HEAD_PATCH` is a `<script>` that monkey-patches
`HTMLCanvasElement.prototype.getContext` — injected as the **first child
of `<head>`**, before any CDN/inlined scripts, so it runs before Leaflet
or the heatmap plugin create any canvases.

### 2. CSS `#map_xxx` replaced with `100vw / 100vh` in `<head>`
```python
re.sub(r'#(map_[0-9a-f]{32})\s*[{][^}]+[}]', _fix_map_css, html, flags=re.DOTALL)
```
Folium writes `#map_xxx { width: 100.0%; height: 100.0% }`.
The `100%` is **relative to the parent**, which has no explicit size → 0px.
Replaced with `width: 100vw; height: 100vh` (viewport units), which are
always non-zero even before Qt has laid out the widget. This means
`L.map()` at line 63 already sees real dimensions.

### 3. `html, body` fill CSS added before `</head>`
Ensures the body container doesn't collapse to zero either.

### 4. `invalidateSize` from Python `loadFinished` (kept as safety net)
```python
self.web_view.loadFinished.connect(self._on_map_loaded)
def _on_map_loaded(self, ok):
    if ok: self.web_view.page().runJavaScript(_INVALIDATE_JS)
```
Runs `window.map_xxx.invalidateSize(true)` after Qt has fully painted —
catches any edge cases where the timing above isn't enough.

## Files changed
| File | Change |
|---|---|
| `ui/map_view.py` | `_patch_html()`: inject `_HEAD_PATCH` into `<head>`, replace `#map_` CSS with `100vw/100vh`, add `html/body` fill CSS |
| `ui/map_view.py` | `_HEAD_PATCH`: canvas `willReadFrequently` patch, runs before all other scripts |
| `ui/map_view.py` | `_INVALIDATE_JS`: compact JS called from `loadFinished` + `resizeEvent` |

