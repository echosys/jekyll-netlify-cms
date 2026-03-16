# 20260305 Debug – Multi-Workspace View & Rescan Issues

## Symptoms
1. Adding folder2 wiped folder1's photos from the view
2. Unchecking one workspace rescanned all remaining workspaces
3. No collapsible grouping per workspace in the folder view
4. Workspaces had no collapse/expand control for their sub-folders

---

## Root Causes

### Bug 1: Adding workspace2 kills workspace1's scan
`PhotoScanner` held a single `current_task`. Calling `scan_workspace()` for workspace2
stopped workspace1's task and overwrote the reference. `MainWindow.scan_workspaces()`
also called `self.current_photos = []` and `self.clear_all_views()` every time, so
workspace1's photos were thrown away.

### Bug 2: Toggling one workspace rescanned everything
`on_workspace_toggled` → `load_active_workspaces()` → `scan_workspaces(ALL active)`.
This nuked and rebuilt the entire view every time any checkbox changed.

### Bug 3: No per-workspace isolation in FolderView
`FolderView` had one flat photo list and one flat layout. No concept of workspace
ownership, so photos from multiple workspaces were mixed and impossible to remove
individually.

---

## Fixes

### `core/photo_scanner.py` – per-workspace concurrent scanners
- `_tasks: Dict[str, PhotoScannerTask]` – one task per workspace path
- `scan_workspace(path)` starts an independent task; only stops the **previous task
  for the same workspace**, never tasks for other workspaces
- `stop_workspace(path)` – cancel one workspace without touching others
- All signals now carry `workspace_path_str` as first argument for routing

### `ui/main_window.py` – per-workspace photo store
- `_workspace_photos: Dict[str, List[Photo]]` – independent list per workspace
- `_scan_progress: Dict[str, tuple]` – per-workspace progress tracking
- `on_workspace_toggled`: calls `_start_workspace_scan(path)` **or**
  `_remove_workspace(path)` — never touches other workspaces
- Progress bar aggregates all in-flight scans; hides when all done
- Status bar shows total photos across all active workspaces

### `ui/folder_view.py` – workspace-aware collapsible sections
New class hierarchy:

```
FolderView
  └── WorkspaceSection  (one per workspace, dark-blue collapsible header ▼/▶)
        └── FolderSection  (one per sub-folder, green shaded collapsible header)
              └── PhotoThumbnail grid (async filled)
```

- `CollapsibleHeader` – click to collapse/expand any section (arrow ▼/▶)
- `WorkspaceSection` – shows "⏳ Scanning…" until first photos arrive; collapses all sub-folders when clicked
- `FolderSection` – depth-based colour shading; collapsible independently
- `FolderView.show_workspace_scanning(ws_str, name)` – add/reset workspace
- `FolderView.update_workspace_photos(ws_str, photos)` – incremental update
- `FolderView.remove_workspace(ws_str)` – remove one workspace section, leave others untouched

---

## Files Changed
| File | Change |
|---|---|
| `core/photo_scanner.py` | Full rewrite – concurrent per-workspace scanners |
| `ui/main_window.py` | Per-workspace photo dict; targeted add/remove on toggle |
| `ui/folder_view.py` | Full rewrite – collapsible workspace + folder sections |

