# 20260305 Debug – Workspace Added But Photos Not Showing / No Logs

## Symptoms
- Added `/Users/lge11/zVidT2` as a workspace
- Status bar stayed on "Ready" – no scan triggered
- Photo `Screenshot 2025-02-18 at 11.36.05 AM.png` never appeared
- Only Skia Graphite fallback messages in console, no app-level output

---

## Root Cause

### Bug: New workspace → scan never triggered

**Flow before fix:**
1. User clicks "+ Add Workspace" → picks folder
2. `WorkspaceManager.add_workspace()` sets `is_active=True` and emits `workspace_added`
3. `WorkspacePanel.on_workspace_added()` calls `add_workspace_item(workspace)`
4. Inside `add_workspace_item()`: `tree.blockSignals(True)` → item added with `CheckState.Checked` → `tree.blockSignals(False)`
5. Because signals were blocked, `tree.itemChanged` **never fired**
6. Therefore `on_item_changed` → `workspace_toggled` signal → `MainWindow.on_workspace_toggled` → `load_active_workspaces` **chain was never triggered**
7. Result: workspace shows as checked in UI but no scan ever starts

**Fix – `ui/workspace_panel.py`:**
```python
def on_workspace_added(self, workspace):
    self.add_workspace_item(workspace)
    # Explicitly trigger scan since blockSignals() suppressed itemChanged
    if workspace.is_active:
        self.workspace_toggled.emit(str(workspace.path), True)
```

---

## Additional Fixes

### Comprehensive logging added
Every step of the pipeline now prints to console:
- `[WorkspacePanel]` – when workspace added, item changed, toggle emitted
- `[MainWindow]` – load_active_workspaces, scan start, progress first tick, first photo found, scan finished, errors
- `[PhotoScanner]` – scan started, total files found, WARNING if 0 files, first 3 photos, completion
- `[ThumbnailCache]` – generating, mode conversion, saved path, skip for oversized files

### Default thumbnail for oversized / failed files
- Files over **500 MB** are skipped for thumbnail generation with a log message
- Any other failure (PIL error, corrupt file, etc.) also falls through to default
- A grey tile labelled with the file extension (e.g. `MOV`, `PNG`) is shown instead of nothing

### Files changed
| File | Change |
|---|---|
| `ui/workspace_panel.py` | Emit `workspace_toggled` when new workspace added; add logging |
| `ui/main_window.py` | Add logging throughout scan lifecycle |
| `core/photo_scanner.py` | Add logging; warn when 0 files found |
| `core/thumbnail_cache.py` | Add `_make_default_pixmap()`; skip >500 MB files; log all steps |

---

## Verified
```
$ python -c "from pathlib import Path; from utils.file_utils import is_media_file; ..."
Media files found: 10
  /Users/lge11/zVidT2/Screenshot 2025-02-18 at 11.36.05 AM.png
  ... (9 more)
```
The scanner finds all 10 files correctly once the workspace scan is properly triggered.

