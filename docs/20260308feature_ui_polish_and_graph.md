# 2026-03-08 — UI Polish, Graph Improvements & Data Safety

## Summary
A large batch of polish across the desktop app covering the profile dialog, tree canvas
edge rendering, auto-layout, tree/folder management, and unsaved-change protection.

---

## 1. Profile Dialog (`person_dialog.py`)

### Node name editing
- Name field added to the profile edit form — changing it saves back to `node.name`
- UUID-based identity preserved; all tags/edges still resolve correctly after rename

### "Died" → "Passed away"
- Label changed to `"Passed away (leave blank if living):"` throughout

### Photo lightbox (`PhotoViewer`)
- Click any thumbnail in the profile → opens a dark full-screen `PhotoViewer` dialog
- Prev / Next buttons + `←` / `→` arrow keys navigate between all photos tagged to that person
- `Esc` closes; counter shows `"2 / 5 — filename.jpg"`
- `resizeEvent` rescales the image to fill available space

### Links section
- New `links: list[dict]` field on `Node` (`{"label": str, "url": str}`)
- Serialised in `tree.json` under each node; fully backwards-compatible (defaults to `[]`)
- Right panel of profile dialog: **Photos** (top ~50%) / **Links** (bottom ~50%) split via `QSplitter`
- Each link row (`LinkRow` widget):
  - **Locked by default** — shows blue underlined URL text + grey label
  - **✏ Edit** button → switches to `QLineEdit` pair (label + URL)
  - **✔ Confirm** button → commits changes, returns to display mode
  - **↗ Open** button → calls `webbrowser.open(url)` (adds `https://` if no scheme)
  - **✕ Remove** button → deletes row
  - Clicking the blue URL text also opens the browser
- **+ Add** button inserts a new locked-then-editable row
- Rows scroll inside a `QScrollArea`; overflow never breaks layout
- On dialog **Save**, all link data written back to `node.links`

### Unsaved-change protection
- Snapshot of all field values taken after UI build
- `closeEvent` / `Cmd+W` / `Ctrl+W` checks `_is_dirty()`
- If dirty: **Save / Discard / Cancel** dialog — never silently drops edits
- After a successful Save the snapshot resets (closing again won't re-prompt)

---

## 2. Tag Editor (`tag_editor.py`)

### Unsaved-change protection (same pattern)
- Snapshot covers: date, location, GPS, custom tags, filename, regions list
- `closeEvent` / `Cmd+W` shows Save / Discard / Cancel if dirty
- Save resets snapshot

---

## 3. Tree Management (`main_window.py`)

### Tree name ↔ folder name decoupled
- Folder name and `tree_name` (JSON) are **independent** — no sync logic
- Sidebar shows `tree_name` from `tree.json`; falls back to folder name if missing
- Allows special characters in tree names that would be illegal in folder names

### "Edit Tree" dialog (was "Rename Tree")
- **Tree name** — editable, updates `tree.json` only
- **Folder name** — prominent blue badge showing `anderson_family`; selectable text
- **Full path** — grey small label; selectable for copy
- Hint: *"folder name and tree name are independent; rename folder in Finder and reopen"*
- Double-click tree in sidebar also opens this dialog

### Runtime folder-rename recovery (`QFileSystemWatcher`)
- `QFileSystemWatcher` watches both `FamilyTrees/` and the active tree folder
- If the active tree folder disappears (renamed/moved externally while app is running):
  1. Auto-saves in-memory state (including unsaved edits) to a new
     timestamped recovery folder: `<tree_name>_recovered_<YYYYMMDD_HHMMSS>`
  2. Copies any still-accessible resource images into the recovery folder
  3. Updates live `self.tree_dir` pointer to the recovery folder
  4. Refreshes sidebar — both old (renamed) and recovery copies visible
  5. Shows an info dialog explaining what happened
- If recovery itself fails, shows a critical error with the exception message

---

## 4. Tree Canvas (`tree_canvas.py`)

### Edge type colour + dash coding
Each relationship type has a distinct visual style:

| Type    | Colour         | Line style          |
|---------|----------------|---------------------|
| Parent  | Blue `#1565C0` | Solid               |
| Spouse  | Deep pink `#AD1457` | Dashed `─ ─ ─` |
| Sibling | Green `#2E7D32`| Dotted `· · ·`      |
| Other   | Brown `#6D4C41`| Short dash          |

- Labels also match the edge colour
- On hover, colour lightens
- Edge context menu shows a 🔵/🔴/🟢 dot beside the relationship type label

### Arrow direction fix (`_card_edge_point`)
- Previously arrows were drawn center-to-center; arrowhead was hidden inside destination card
- New: `_card_edge_point(from_c, to_c, card_pos, card_rect)` computes the exact
  parametric line–rectangle intersection, so:
  - Line exits the **source card edge**
  - Arrowhead lands on the **destination card edge** (fully visible)
- Direction is now unambiguous even for horizontal (same-generation) edges

### Edge label stagger (overlap prevention)
- `_rebuild_edges` groups edges by their node pair (sorted tuple)
- When N > 1 edges share the same two nodes, labels are offset perpendicularly:
  `offset = (idx - (N-1)/2) * 18px`  — fans labels symmetrically left/right of the curve

### Auto-layout (`auto_layout()`)
Custom hierarchical layout — not a third-party library:

**Algorithm:**
1. Build parent→child and spouse maps from edges
2. BFS generation assignment from roots (nodes with no parents)
3. Barycentric sort within each generation (children ordered by parents' average column)
4. Spouse pairs pulled adjacent in the same row
5. **Subtree-width spreading**: each node's slot width = `subtree_leaves × H_GAP`;
   children fill their parent's slot proportionally — produces natural left/right skew
   matching the hand-crafted sample layout
6. Small alternating vertical nudge (`+18px` on even columns) prevents sibling-edge
   labels from all sitting at exactly the same height
7. Disconnected nodes placed in a separate row
8. Multiple disconnected trees separated by an extra `H_GAP`

**Spacing:** `H_GAP = CARD_W + 80 = 250px`, `V_GAP = CARD_H + 120 ≈ 192px`

Auto-layout is **undoable** (snapshot taken before positions are changed).

### Toolbar
Added `⊞ Auto Layout` button next to `⊙ Fit View`.  
Also available via right-click on blank canvas.

---

## 5. Data Model

### `Node` — new `links` field
```python
links: list = field(default_factory=list)
# Each item: {"label": str, "url": str}
```
- Serialised in `to_dict()` / `from_dict()`
- Old trees without `links` load fine (defaults to `[]`)

