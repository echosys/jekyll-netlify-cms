# Desktop App — Feature Specification (Python + PyQt6)

> Platform: macOS and Windows
> Stack: Python 3.11+, PyQt6
> Last updated: March 8, 2026

---

## Overview

The desktop app is a native PyQt6 application that lets users build, edit, and manage
family trees stored as local folders. It is one of four platform clients that all share
the same JSON schema and zip export format.

---

## Application Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Menu Bar: File | Tree | View | Export | Help               │
├──────────────────┬──────────────────────────────────────────┤
│  Tree List Panel │  Main Content Area (tab-switched)        │
│  (left sidebar)  │  ┌────────────────────────────────────┐  │
│                  │  │  Tab 1: Tree Canvas                │  │
│  • Smith Family  │  │  Tab 2: Resources                  │  │
│  • Jones Family  │  └────────────────────────────────────┘  │
│  [+ New Tree]    │                                           │
└──────────────────┴──────────────────────────────────────────┘
```

---

## Module: TreeCanvas (Tab 1)

### Behaviour
- Renders a **QGraphicsScene** canvas with custom `NodeCard` items and arrow edges.
- Supports pan (middle-mouse drag) and zoom (Ctrl+scroll).
- Nodes can be dragged to any position; position is auto-saved to `tree.json`.
- On tree open, canvas **auto-fits** all nodes into the viewport (80 ms delay so the
  window is fully sized first).
- Clicking a blank area deselects everything.

### Edge Labels
Each edge arrow displays the relationship label (e.g. "Father of", "Spouse",
"Sibling") centred on the bezier curve midpoint in dark grey text.

### NodeCard Widget
Each node is a rounded-rectangle QGraphicsItem containing:
- **Profile thumbnail** (50×50 px, circular crop) — left side.  
  Loaded from `profile_image_ref` on the node (path relative to `tree_dir`, e.g. `resources/1935-george_anderson.jpg`).  
  Falls back to a gender-tinted silhouette avatar when no image is set.
- **Name label** — right of thumbnail (bold, elided if too long).
- **Birth/death year** — small grey text below name.

**Gender colour-coding** — the card background and border tint reflects the person's gender:

| Gender  | Background | Border     |
|---------|-----------|------------|
| Male    | Pale blue `#E3F2FD` | `#90CAF9` |
| Female  | Pale rose `#FCE4EC` | `#F48FB1` |
| Other   | Pale green `#F1F8E9` | `#AED581` |
| Unknown | Light grey `#FAFAFA` | `#BDBDBD` |

### Edges
- Drawn as directed cubic bezier arrows (source → target).
- **Relationship label** shown at the midpoint of each curve.
- "Parent" edges show **"Father of"**, **"Mother of"**, or **"Parent of"** depending
  on the source node's gender — derived automatically, never free-text.
- Edge label item has mouse interaction disabled — clicks always reach the EdgeItem.
- **Right-click OR double-click** an edge → opens the edge context menu:
  - Grey header: `"  George Anderson  →  Thomas Anderson"` (read-only)
  - **✏ Change Relationship…** — opens a dropdown with the same options as Add Relationship; label is re-derived from gender automatically.
  - **🗑 Delete Relationship** — removes the edge (undoable with Ctrl+Z).

### Add Relationship menu (right-click node → Add Relationship)
Four options; the app derives the correct edge label from the source node's gender:

| You choose | Edge direction | Label on canvas |
|---|---|---|
| **Parent of** → pick child | `you → child` | your gender: **"Father of"** / **"Mother of"** / **"Parent of"** |
| **Child of** → pick parent | `parent → you` | parent's gender: **"Father of"** / **"Mother of"** / **"Parent of"** |
| **Spouse** → pick person | `you → person` | **"Spouse"** |
| **Sibling** → pick person | `you → person` | **"Sibling"** |

The words "Parent of" and "Child of" **only** appear in the menu as direction hints — never on the canvas.

### Change Relationship (edge context menu)
Same four options. Choosing **"Child of"** also **flips the edge direction** (old target becomes the source/parent).

### Toolbar (above canvas)
```
[ 💾 Save ]   [ ⊙ Fit View ]   [ 🔓 Lock Zoom ]
```
- **💾 Save** — saves immediately, removes the `*` from the window title.
- **⊙ Fit View** — fits all nodes into the viewport (also Ctrl+0 / right-click canvas).
- **🔓 Lock Zoom** (toggle) — disables scroll-wheel zoom when locked.

### Undo / Redo
- **Cmd+Z / Ctrl+Z** — undo last change (up to 50 steps).
- **Ctrl+Y / Ctrl+Shift+Z** — redo.
- Snapshot taken before: add node, delete node, add edge, delete edge, change relationship.

### Node Context Menu (right-click on node)
- Open Person Detail
- Add Relationship → (Parent of / Child of / Spouse / Sibling)
- Delete Node (shows photo-tag warning if images are tagged to this person)

### Edge Context Menu (right-click OR double-click on edge)
- `source name → target name` (greyed header)
- ✏ Change Relationship…
- 🗑 Delete Relationship

### Canvas Context Menu (right-click on empty space)
- Add Person Here
- Fit All Nodes

### Add Node
- Toolbar button or right-click canvas → "Add Person Here".
- Opens a dialog: Name, then Birth date.
- New node placed at cursor position.

---

## Module: PersonDialog (floating detail window)

Opens when a node is double-clicked (or via context menu "Open Person Detail").

```
┌──────────────────────────────────────────────────────────────┐
│ [×]  John Smith (1950 – 2020)                                │
├──────────────────────────┬───────────────────────────────────┤
│ Bio (editable text area) │  Images tagged with this person   │
│                          │  ┌──────────────────────────────┐ │
│  Born: 1950-01-01        │  │  [thumb] [thumb] [thumb] …   │ │
│  Gender: [Male      ▼]   │  │  ← horizontal scroll →       │ │
│  Died: 2020-05-10        │  └──────────────────────────────┘ │
│                          │  Click thumbnail → opens full     │
│  [free text bio here]    │  image in ResourceViewer          │
│                          │                                   │
│  [Save]  [Cancel]        │                                   │
└──────────────────────────┴───────────────────────────────────┘
```

- **Gender** dropdown: Unknown / Male / Female / Other.
  Changing gender immediately affects the node card colour and the label on
  parent edges when saved.
- Click outside the dialog → closes and returns to tree canvas.
- "Save" writes changes to `tree.json` immediately.
- Image thumbnails are drawn from the resources folder filtered to this person's `node_id`.

---

## Module: ResourceManager (Tab 2)

### Photo Library Grid
- Displays all images in `resources/` as a grid of thumbnails (150×150 px).
- Below each thumbnail: the **filename** (small grey) and a **tags line** (blue)
  showing up to the first names of tagged people, location, and custom tags.
  Example: `George  Eleanor  📍Burlington  christmas`
- Clicking a thumbnail opens the **ResourceViewer / Tag Editor**.
- Drag-and-drop or [Upload Images] button to add new files.
  - On add: image is copied to `resources/`, temporarily named `date-untagged-{5id}.jpg`.
  - Rename to `date-firstname_lastname.jpg` happens after tagging is saved.

### Filter Bar (top of Resources tab)
Filters the grid by any combination of:
- **Person** (dropdown of all node names)
- **Date** (free text or date picker)
- **Location** (dropdown of existing values)
- **Custom tags** (multi-select chip input)

### ResourceViewer (opens on thumbnail click)
Full-size image display with:
- **Tag Editor** overlay (see below).
- Metadata panel (right side): Date, Location, GPS, Custom Tags.
  - Each field has a dropdown showing existing values + option to type a new one.
- [Save Tags] button — writes changes to `tree.json`, renames file if needed.

---

## Module: TagEditorWidget

Used inside ResourceViewer to tag regions of an image with person names.

### Layout — QStackedWidget right panel
The right panel switches between two pages:

- **Page 0 (normal):** Tagged regions list + Metadata + Save/Cancel buttons.
- **Page 1 (tagging):** Only the "Tag region" confirm panel — fills the full right column. Save is greyed out until confirmed or cancelled.

This prevents the confirm panel from squeezing the metadata fields.

### Workflow — new region
1. Click **✏ Draw Region** to enter draw mode (Save button greyed out immediately).
2. Drag a rectangle on the image.
3. Right panel switches to Page 1 — "Tag new region" panel:
   - **Person** dropdown (all existing tree nodes)
   - **New person name** field — activated only when "+ New person" is selected
   - **☐ Use as profile image** checkbox
   - **[✔ Save Tag]** / **[✖ Cancel]**
4. Confirm → region saved, panel returns to Page 0, Save re-enabled.

### Workflow — edit existing region
- **Click a blue region rectangle** on the image → panel switches to Page 1 pre-filled with that region's current person/profile state. The selected region turns orange.
- **Edit (✏) button** in the tagged regions list → same behaviour.
- Clicking a different region while Page 1 is open → immediately switches to that region's data (no stale state).

### Filename management (bottom of Page 0)
- **Current filename** displayed (grey).
- **Original filename** (the upload name) displayed (lighter grey).
- **Rename** — free-text field + button to rename the file manually.
- **Restore original filename** — renames back to the upload name (enabled only when current ≠ original).

Rename convention (auto, on Save Tag): `{year}-{firstname}_{lastname}.jpg`  
Example: `1935-george_anderson.jpg` (year-only, not full date).

### Deleting a region
Each region row has an **x** (delete) button:
- Removes region from `regions` array.
- Cleans up `tags.persons` if no other region tags same person.
- Clears `profile_image_ref` on the node if `use_as_profile` was set.

### Orphaned tags (deleted node)
If a tagged node is deleted from the tree, its tag becomes `__orphan__:<name>`.
- Displayed as `⚠ George Anderson (deleted node)` in region list and thumbnail tags.
- If a new node with the **exact same name** is added, all orphaned tags are automatically re-linked and a toast confirms: *"Restored N photo tag(s) for George Anderson."*

---

## Module: TreeManager

Handles the lifecycle of local trees (folders).

| Action        | Behaviour                                                      |
|---------------|----------------------------------------------------------------|
| New Tree      | Dialog asks for tree name → creates `FamilyTrees/{name}/` + `tree.json` |
| Open Tree     | Browse to any `FamilyTrees/` subdirectory and load `tree.json` |
| Close Tree    | Prompts to save unsaved changes, clears canvas                 |
| Rename Tree   | Renames folder + updates `tree_name` in `tree.json`            |
| Delete Tree   | Moves folder to system trash (no hard delete)                  |

- All trees are stored under `FamilyTrees/` in the same directory as the application.
- The tree list sidebar shows all subdirectories of `FamilyTrees/`.

---

## Module: Export / Import

### Local Export (Zip)
- Menu: **Export → Export as Zip…**
- Packages `tree.json` + `resources/` into a `.zip` file.
- Compatible with web and mobile apps.

### Local Import (Zip)
- Menu: **File → Import from Zip…**
- Extracts zip into a new subdirectory under `FamilyTrees/`.
- Prompts if a tree of the same name already exists (overwrite / rename).

### Export to Image
- Menu: **Export → Export Tree as Image…**
- Renders the current TreeCanvas to a PNG file at the user-chosen resolution.

### PostgreSQL Export
- Menu: **Export → Export to PostgreSQL…**
- Opens **DBExportDialog** (see below).

### PostgreSQL Import
- Menu: **File → Import from PostgreSQL…**
- Opens a tree-selection dialog populated by querying the DB.

---

## Module: DBExportDialog

```
┌─────────────────────────────────────────┐
│  PostgreSQL Connection                  │
│  Host:     [____________]               │
│  Port:     [5432]                       │
│  Database: [____________]               │
│  User:     [____________]               │
│  Password: [••••••••••••]               │
│  [Test Connection]                      │
├─────────────────────────────────────────┤
│  [Export Current Tree]                  │
│                                         │
│  Import from DB:                        │
│  Tree:  [dropdown of tree names ▼]      │
│  [Import Selected Tree]                 │
│  [Delete Tree…] (type-to-confirm)       │
└─────────────────────────────────────────┘
```

- Connection details are read from / saved to `db_config.json` in the app directory.
- **Export**: upserts all rows using `ON CONFLICT ... DO UPDATE`.
- **Import**: fetches rows for the selected tree, writes `tree.json` + resource files.
- **Delete**: shows a dialog requiring the user to type the tree name, then issues
  `DELETE FROM family_trees WHERE tree_name = ?`.

---

## Data Flow

```
User Action
  │
  ▼
PyQt6 UI Layer  (widgets / dialogs)
  │
  ▼
Model Layer     (tree_model.py, resource_model.py)
  │
  ▼
Export/Import   (export_import.py)
  ├── Local:    read/write tree.json + resources/ folder
  ├── Zip:      zipfile module
  └── Postgres: psycopg2 / psycopg3
```

---

## File / Folder Layout of the Desktop App

```
famt/
├── desktop/
│   ├── main.py                 ← entry point
│   ├── requirements.txt
│   ├── models/
│   │   ├── tree_model.py       ← Node, Edge, Tree dataclasses
│   │   └── resource_model.py   ← Resource, Region, Tags dataclasses
│   ├── core/
│   │   └── export_import.py    ← zip, json, postgres, image compress/rename
│   ├── ui/
│   │   ├── main_window.py
│   │   ├── tree_canvas.py
│   │   ├── node_card.py
│   │   ├── person_dialog.py
│   │   ├── resource_manager.py
│   │   ├── tag_editor.py
│   │   └── db_export_dialog.py
│   └── assets/
│       └── default_avatar.png
└── FamilyTrees/                ← tree data (next to app, not system folder)
    └── sample_family/
        ├── tree.json
        └── resources/
```

---

## Dependencies (requirements.txt)

```
PyQt6>=6.6.0
Pillow>=10.0.0      # image compression, JPEG conversion, thumbnail generation
psycopg2-binary>=2.9.9  # postgres export/import
```

---

## Keyboard Shortcuts

| Shortcut        | Action                         |
|-----------------|--------------------------------|
| Ctrl+N          | New Tree                       |
| Ctrl+O          | Open Tree                      |
| Ctrl+S          | Save current tree              |
| Ctrl+0          | Fit all nodes in viewport      |
| Ctrl+Z / Ctrl+Y | Undo / Redo                    |
| Delete          | Delete selected node or edge   |
| Ctrl+E          | Export as Zip                  |
| Ctrl++/−        | Zoom in / out                  |
| Middle-drag     | Pan canvas                     |
| Esc             | Close floating dialog          |

