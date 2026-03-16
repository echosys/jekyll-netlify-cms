# Debug Fix: TypeError in Workspace Toggle

**Date:** March 5, 2026  
**Type:** Debug  
**Summary:** Fixed NoneType error when toggling workspace checkbox

## Issue

Application crashed with TypeError when loading:
```
TypeError: argument should be a str or an os.PathLike object where __fspath__ returns a str, not 'NoneType'
```

**Error Location:** `ui/workspace_panel.py`, line 91 in `on_item_changed()`

## Root Cause

When a `QTreeWidgetItem` is created and its check state is set, Qt emits an `itemChanged` signal. This was happening before the item's data (workspace path) was set, causing `item.data()` to return `None`.

The code tried to create `Path(None)`, which raised a TypeError.

## Solution

Applied two fixes:

### Fix 1: Add None Check
Added a guard clause in `on_item_changed()` to skip processing if path data is None:

```python
def on_item_changed(self, item, column):
    """Handle item check state changed"""
    path = item.data(0, Qt.ItemDataRole.UserRole)
    if path is None:
        return  # Skip if no path data set yet
    is_checked = item.checkState(0) == Qt.CheckState.Checked
    self.workspace_manager.toggle_workspace(Path(path), is_checked)
    self.workspace_toggled.emit(path, is_checked)
```

### Fix 2: Block Signals During Setup
Block signals while setting up the workspace item to prevent premature `itemChanged` signals:

```python
def add_workspace_item(self, workspace):
    """Add a workspace item to the tree"""
    # Block signals during item setup to prevent premature itemChanged
    self.tree.blockSignals(True)
    
    item = QTreeWidgetItem(self.tree)
    item.setText(0, workspace.name)
    item.setData(0, Qt.ItemDataRole.UserRole, str(workspace.path))
    item.setCheckState(0, Qt.CheckState.Checked if workspace.is_active else Qt.CheckState.Unchecked)
    item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
    
    # Re-enable signals
    self.tree.blockSignals(False)
```

## Testing

Run the application again:
```bash
/Users/lge11/pyenvs/py311/bin/python /Users/lge11/GithubP/picasa/main.py
```

## Files Modified

- `ui/workspace_panel.py` - Added None check and signal blocking

## Status

✅ **FIXED** - Application should now start without errors
