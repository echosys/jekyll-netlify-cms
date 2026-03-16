# 20260305 Debug – Map Blank Canvas + Config bytes Error

## Three bugs fixed

---

### Bug 1: Map blank — Leaflet zero-size canvas (`getImageData width=0`)

**Root cause:** `setHtml()` triggers the page load synchronously before the
`QWebEngineView` widget has been painted and sized by Qt's layout engine.
Leaflet reads `offsetWidth`/`offsetHeight` of the map `<div>` during init —
both are `0` — and creates a zero-size canvas.

**Fix (`ui/map_view.py` — `_LEAFLET_FIX_JS` + `_INVALIDATE_JS`):**

1. **CSS** — force `html, body, div[id^="map_"]` to fill `100vw`/`100vh`
   so the container always has a real size regardless of parent layout.

2. **`invalidateSize` via JS timeouts** — injected before `</body>`:
   ```js
   // folium stores maps as window.map_<32hex>
   function fixAllMaps() {
     for (var key in window) {
       if (/^map_[0-9a-f]{32}$/.test(key))
         window[key].invalidateSize(true);
     }
   }
   // Fire at multiple points to catch whichever layout pass is first
   DOMContentLoaded → 50ms, 300ms
   load → 50ms, 300ms, 1000ms
   ```

3. **`invalidateSize` from Python** via `loadFinished` signal:
   ```python
   self.web_view.loadFinished.connect(self._on_map_loaded)
   # ...
   def _on_map_loaded(self, ok):
       if ok: self.web_view.page().runJavaScript(_INVALIDATE_JS)
   ```
   This is the most reliable call because `loadFinished` fires after Qt
   has laid out and painted the widget, so `offsetWidth` is finally correct.

4. **`resizeEvent`** — calls `_INVALIDATE_JS` again whenever the panel is
   resized so the map tiles always fill the pane.

**Key discovery:** Leaflet 1.9 does NOT use `L._maps` or `div._leaflet_map`.
Folium stores each map as `window.map_<32hex>` in global scope (e.g.
`window.map_bbf8fff1ea065c21daffc54570bcf296`). The regex `/^map_[0-9a-f]{32}$/`
finds all of them.

---

### Bug 2: `willReadFrequently` canvas warning from heatmap plugin

**Root cause:** The Leaflet heatmap plugin calls `ctx.getImageData()` many
times per frame without setting `willReadFrequently: true` on the canvas
context, which triggers a browser performance warning.

**Fix (`_LEAFLET_FIX_JS`):**
```js
var _orig = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, attrs) {
  if (type === '2d') attrs = Object.assign({willReadFrequently: true}, attrs||{});
  return _orig.call(this, type, attrs);
};
```
Monkey-patched early (before any canvas is created) so all canvases get the flag.

---

### Bug 3: `Object of type bytes is not JSON serializable`

**Root cause (`ui/main_window.py` line 282):**
```python
# BROKEN - saveGeometry().data() returns bytes, not JSON-serialisable
self.config_manager.set_setting("window_geometry", self.saveGeometry().data())
```

**Fix:**
```python
import base64
self.config_manager.set_setting("window_geometry",
    base64.b64encode(self.saveGeometry().data()).decode('ascii'))
```
Stored as a base64 ASCII string; can be decoded with
`base64.b64decode(value)` to restore geometry later.

---

## Files changed
| File | Change |
|---|---|
| `ui/map_view.py` | `_LEAFLET_FIX_JS`: correct `window.map_<hex>` pattern; CSS height fix; `willReadFrequently` patch |
| `ui/map_view.py` | `_INVALIDATE_JS`: same pattern, run from Python via `loadFinished` + `resizeEvent` |
| `ui/main_window.py` | `closeEvent`: encode geometry as base64 string before JSON serialization |

