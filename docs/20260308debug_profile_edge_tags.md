# Debug Log — Profile Images, Edge Interaction, Tag Fixes

> Date: March 8, 2026
> Type: debug
> Files changed: `ui/node_card.py`, `ui/tree_canvas.py`, `ui/tag_editor.py`,
>   `core/export_import.py`, `ui/resource_manager.py`, `generate_sample_tree.py`

---

## Bug 1 — Profile thumbnails not showing on tree cards

**Symptom:** All node cards showed the default gender-silhouette avatar even when a
`profile_image_ref` was set in `tree.json`.

**Root cause:** `NodeCard._load_thumb()` called
`ref.replace("resources/", "", 1)` then joined with `resources_dir` (which is
`tree_dir`, e.g. `.../sample_family`), producing:

```
.../sample_family/1935-george_anderson.jpg   ← wrong, file doesn't exist
```

The actual file lives at:

```
.../sample_family/resources/1935-george_anderson.jpg   ← correct
```

**Fix (`ui/node_card.py`):** Remove the `.replace()` strip — join `ref` directly onto
`tree_dir` since `ref` already contains the `resources/` subfolder prefix:

```python
# Before
full = os.path.join(self.resources_dir, ref.replace("resources/", "", 1))
# After
full = os.path.join(self.resources_dir, ref)
```

---

## Bug 2 — Right-clicking an edge showed no menu

Two sub-causes:

### 2a — Label text item intercepted clicks

The edge label (`QGraphicsSimpleTextItem`) was added as a separate scene item at
`zValue=2`. Clicking near the label returned the text item from `itemAt()`, and the
`while c: c = c.parentItem()` walk exited immediately (text items have no parent).

**Fix:** Disable all mouse interaction on the label:

```python
self._label.setFlag(...ItemIsSelectable, False)
self._label.setAcceptedMouseButtons(Qt.MouseButton.NoButton)
self._label.setAcceptHoverEvents(False)
```

### 2b — Thin bezier line missed by itemAt()

`itemAt()` uses the rendered pen width (1.5 px) which is very hard to click.

**Fix:** Added a fallback in `contextMenuEvent` that iterates `_edge_items` and checks
the 14 px-wide `shape()` stroker against the scene position:

```python
if edge_item is None and node_item is None:
    scene_pos = self.mapToScene(event.pos())
    for ei in self._edge_items:
        if ei.shape().contains(ei.mapFromScene(scene_pos)):
            edge_item = ei; break
```

Same fallback also used in `mouseDoubleClickEvent`.

---

## Bug 3 — "Edit Label" allowed free text, bypassing gender logic

**Symptom:** The edge context menu had an "Edit Label…" free-text input, letting users
type anything (e.g. "Father of" on a female node).

**Fix:** Replaced with `_edit_edge_relationship()` — a dropdown showing the same four
options as "Add Relationship". The label is re-derived from the source node's gender,
never entered as free text. Choosing "Child of" also **flips the edge direction**.

---

## Bug 4 — Double-click on edge did nothing

**Fix:** `mouseDoubleClickEvent` now runs the same item-detection logic as
`contextMenuEvent` (including the shape-based fallback) and calls `_show_edge_menu()`
on hit, which is the shared helper used by both right-click and double-click.

---

## Bug 5 — Missing George/Eleanor placeholder images

**Symptom:** `tree.json` referenced `resources/1935-george_anderson.jpg` and
`resources/1940-eleanor_anderson.jpg` but neither file existed on disk.

**Fix (`generate_sample_tree.py`):** Added `_make_placeholder()` function that generates
a colour-coded face-silhouette JPEG for every resource file that doesn't exist yet.
Re-running the script is idempotent (skips files that already exist).

---

## Bug 6 — Filename convention mismatch (`1935-04-12-` vs `1935-`)

**Symptom:** `build_resource_filename()` used the full ISO date (`1935-04-12`) producing
`1935-04-12-george_anderson.jpg`, but files were created/expected with year-only
(`1935-george_anderson.jpg`).

**Fix (`core/export_import.py`):** Extract only the year portion when the date string
looks like `YYYY-*`:

```python
if len(date_str) >= 4 and date_str[:4].isdigit():
    date_part = date_str[:4]   # "1935", not "1935-04-12"
```

---

## Bug 7 — Clicking region 2 while region 1 edit panel open showed stale data

**Fix (`ui/tag_editor.py`):** Removed the `if self._stack.currentIndex() == 1: return`
guard in `_on_region_clicked`. Now always calls `_open_region_edit(index)` which
repopulates the confirm panel fresh.

---

## Bug 8 — Deleted node tags showed "Unknown (abc123)"

**Fix:** On node delete, orphan tags are encoded as `__orphan__:<name>` in
`tags.persons` and `region.node_id`. Displayed as `⚠ George Anderson (deleted node)`.
On re-add with same name, `_heal_orphan_tags()` re-links all markers and shows a
confirmation toast.

---

## Verification

```
Profile image loaded: 50x50 px  OK   (node_card path fix)
build_resource_filename year-only: OK  (1935-george_anderson.jpg)
orphan marker logic: OK  (George Anderson)
UndoStack: OK
AST OK: ui/tree_canvas.py
AST OK: ui/node_card.py
```

