# Feature: Preview Navigation Respects Active View Order

**Date:** 2026-03-08  
**Type:** feature

## Summary

When opening a photo preview by clicking a thumbnail, the Prev/Next navigation
now follows the **display order of the view that was active at click time**,
instead of always using the flat unordered list of all photos.

## Changes

### `ui/main_window.py`
- `open_preview(photo)` now checks `tab_widget.currentIndex()`:
  - Tab 0 (Folders) → calls `folder_view.get_ordered_photos()`
  - Tab 1 (Timeline) → calls `timeline_view.get_ordered_photos()`
  - Tab 2 (Map) → falls back to `_all_photos()`
- Falls back to `_all_photos()` if the view list is empty or the clicked photo
  is not found in it.
- Added `dlg.setFocus()` after constructing the dialog so arrow keys work
  immediately on open.

### `ui/timeline_view.py` — `get_ordered_photos()`
Returns the flat list of photos in the exact order they are displayed:
- **By Location mode**: iterates `_loc_groups` in group order, respects the
  active search-box filter so navigation stays within the filtered set.
- **Other sort modes**: iterates `_sections` (CollapsibleSection widgets) in
  render order, collecting `PhotoThumbnail.photo` objects from each section's
  grid.

### `ui/folder_view.py` — `get_ordered_photos()`
Iterates `_ws_sections` (workspace sections) in order and collects all
`PhotoThumbnail.photo` objects from each `WorkspaceSection`'s thumb-widget
dict, giving the exact folder-display order.

### `ui/photo_preview.py`
- `setFocusPolicy(StrongFocus)` set in `__init__`.
- `showEvent` calls `self.setFocus()` so the dialog has keyboard focus as soon
  as it appears.
- `installEventFilter(self)` + `eventFilter` intercepts `KeyPress` events on
  all child widgets (except `QLineEdit`/`QTextEdit`) and routes navigation keys
  to `keyPressEvent`, so Left/Right/Up/Down work even when the splitter, scroll
  area, or location panel has focus.
- **Arrow key mapping:**
  | Key | Action |
  |-----|--------|
  | `→` / `Space` / `↓` | Next photo |
  | `←` / `Backspace` / `↑` | Previous photo |
  | `+` / `=` | Zoom in |
  | `-` | Zoom out |
  | `0` | Zoom to fit |
  | `Enter` | Open video in system player |
  | `Esc` | Close dialog |

