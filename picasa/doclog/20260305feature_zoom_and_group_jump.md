# 20260305 Feature – Image Zoom in Preview + Timeline Group Jump Index

## 1. Image zoom in Photo Preview (`ui/photo_preview.py`)

### `ZoomableView` — replaces `ZoomableImageLabel`
Custom `QWidget` that renders the pixmap via `QPainter` with full zoom/pan support.
No `QScrollArea` involved — all transforms are done in `paintEvent`.

#### How zoom works
| Input | Mechanism |
|---|---|
| macOS two-finger pinch | `QNativeGestureEvent` with `ZoomNativeGesture` type; `value()` is the pinch delta |
| Ctrl + scroll wheel | `wheelEvent` with `ControlModifier`; uses `pixelDelta` (precise trackpad) or `angleDelta` |
| Scroll without Ctrl | Pans the image (only when zoomed in) |
| Click-drag | Pans the image (only when zoomed in) |
| Double-click | Reset to fit-to-window mode |
| `+`/`=` key | Zoom in 1.3× |
| `－` key | Zoom out 1.3× |
| `0` key | Fit to window |
| Toolbar `＋`/`－`/`⊡ Fit` buttons | Same as keys |

#### Zoom anchor
`zoom_by(factor, anchor)` keeps the pixel under `anchor` (cursor position) fixed on screen
by adjusting `_offset` proportionally: `offset = anchor + (offset - anchor) * ratio`.

#### Fit mode
- `_fit_mode = True` on load and after double-click/Fit button
- In fit mode: scale = `min(width/pw, height/ph)` — always fills window correctly
- First zoom gesture exits fit mode and sets `_zoom` to the current visual scale

#### Toolbar additions
- `－` / `Fit` / `＋` zoom buttons in toolbar (hidden for videos)
- Zoom label shows `Fit` in fit mode, `150%` etc. when zoomed

---

## 2. Group Jump Index — Timeline right sidebar (`ui/timeline_view.py`)

### Problem
Long groups (e.g. 200 files in `100 MB–1 GB`) require excessive scrolling to reach the next bucket.

### Solution: `GroupIndexPanel` (110 px right sidebar)
- Sits to the **right of the scroll area** (not overlapping the scrollbar)
- Lists every group as a small `QPushButton` with compact label:
  - `2025  ·  February` → `2025  Feb`
  - `≥ 10 GB` → `≥ 10 GB` (short enough as-is)
- **Click** → `scroll_area.ensureWidgetVisible(section, 0, 0)` jumps to group top
- **Auto-highlight**: `scroll_area.verticalScrollBar().valueChanged` fires `_on_scroll`
  which finds the topmost visible section and highlights its index button in blue
- Rebuilt on every `refresh_view()` (sort change or new photos)

### Why not a floating overlay?
A fixed panel keeps the scrollbar fully accessible and is always visible without blocking content.

