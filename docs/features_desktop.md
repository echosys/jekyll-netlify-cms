# Family Tree App — Feature Reference (Always Current)

> Last updated: **2026-03-08**
> This file is the single source of truth for all implemented features.
> Detailed dated changelogs are in the other `docs/20260308*.md` files.

---

## Desktop App (Python + PyQt6)

### Stack & Entry Point
- Python 3.11+, PyQt6 6.6+, Pillow, psycopg2-binary, cryptography>=42
- Entry: `desktop/main.py`
- Trees stored in `FamilyTrees/` next to the app (never in system folders)

---

## Application Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Menu Bar: File | View | Export                                     │
├────────────────────┬────────────────────────────────────────────────┤
│  Sidebar           │  Toolbar: [ 💾 Save ] [ ⊙ Fit ] [ ⊞ Layout ] │
│  ─────────────     │           [ 🔓 Lock Zoom ]                     │
│  My Trees          ├────────────────────────────────────────────────┤
│  (list)            │  Tab 1: 🌳 Tree Canvas                         │
│  [✏️ Edit Tree]    │  Tab 2: 📷 Resources                           │
│  [+ New Tree]      │                                                │
└────────────────────┴────────────────────────────────────────────────┘
```

---

## Tree Management (Sidebar)

### Tree List
- Lists all sub-folders inside `FamilyTrees/` that contain a `tree.json`
- **Display name** read from `tree.json → tree_name`; falls back to folder name
- Click to open a tree; double-click to open the **Edit Tree** dialog

### Edit Tree Dialog (`✏️ Edit Tree` button or double-click)
- **Tree name** — editable; updates `tree.json` only (not the folder name)
- **Folder name** — read-only blue badge (e.g. `anderson_family`); selectable text
- **Full path** — grey read-only label; selectable for copy-paste
- Tree name and folder name are **intentionally independent** — tree names can contain
  any characters; folder names are constrained by the OS
- To rename the folder: close the app, rename in Finder/Explorer, reopen

### Runtime Folder-Rename Recovery
- `QFileSystemWatcher` monitors the active tree folder
- If the folder disappears while the app is running (renamed/moved in Finder):
  1. In-memory state (including unsaved edits) auto-saved to
     `<slug>_recovered_<YYYYMMDD_HHMMSS>/` inside `FamilyTrees/`
  2. Resource images copied if accessible
  3. Sidebar refreshed — both the renamed original and the recovery copy appear
  4. Info dialog explains what happened; no work is lost
- If recovery fails, a critical error dialog shows the exception

### New Tree
- Prompt for name → creates `FamilyTrees/<slug>/` with empty `tree.json`

---

## Tree Canvas (Tab 1)

### NodeCard
- Rounded rectangle, draggable on the canvas
- **Profile thumbnail** (50×50 px, circular) from `node.profile_image_ref`
  (path relative to `tree_dir`). Falls back to gender silhouette.
- **Name** (bold) + **birth–death year** (small grey)
- **Gender colour coding:**

| Gender  | Background  | Border    |
|---------|-------------|-----------|
| Male    | `#E3F2FD`   | `#90CAF9` |
| Female  | `#FCE4EC`   | `#F48FB1` |
| Other   | `#F1F8E9`   | `#AED581` |
| Unknown | `#FAFAFA`   | `#BDBDBD` |

### Edges — Visual Style

Each relationship type has a distinct **colour** and **line style**:

| Type    | Colour              | Line            |
|---------|---------------------|-----------------|
| Parent  | Blue `#1565C0`      | Solid           |
| Spouse  | Deep pink `#AD1457` | Dashed `─ ─ ─`  |
| Sibling | Green `#2E7D32`     | Dotted `· · ·`  |
| Other   | Brown `#6D4C41`     | Short dash      |

- Labels match edge colour
- On hover: colour lightens, line thickens
- **Arrow terminates at the card edge** (not center) — direction is always visible,
  even for horizontal same-generation edges (`_card_edge_point` intersection)
- **Label stagger**: when N edges share the same pair of nodes, labels are offset
  perpendicularly so they fan out instead of stacking

### Edge Labels
Derived automatically from source node gender — never free-text:
- Male parent → **"Father of"**
- Female parent → **"Mother of"**
- Unknown/other parent → **"Parent of"**
- Spouse / Sibling → literal label

### Edge Context Menu (right-click or double-click edge)
- Header (read-only): `"George Anderson  →  Thomas Anderson"`
- Type line (read-only): `🔵 Father of`
- **✏ Change Relationship…** — dropdown: Parent of / Child of / Spouse / Sibling
  ("Child of" also flips edge direction)
- **🗑 Delete Relationship** (undoable)

### Add Relationship (right-click node → Add Relationship)

| Option | Edge direction | Label |
|--------|---------------|-------|
| Parent of | you → child | your gender label |
| Child of | parent → you | parent's gender label |
| Spouse | you → other | "Spouse" |
| Sibling | you → other | "Sibling" |

### Undo / Redo
- `Cmd+Z` / `Ctrl+Z` — undo (50-step stack)
- `Ctrl+Y` — redo
- Snapshot taken before every mutation

### Toolbar
```
[ 💾 Save (Ctrl+S) ]  [ ⊙ Fit View ]  [ ⊞ Auto Layout ]  [ 🔓 Lock Zoom ]
```

### Context Menus
- **Right-click node:** Open Person Detail · Add Relationship (submenu) · Delete Node
- **Right-click / double-click edge:** Change Relationship · Delete Relationship
- **Right-click canvas:** Add Person Here · Fit All Nodes · ⊞ Auto Layout

### Auto Layout (`⊞ Auto Layout`)
Custom hierarchical algorithm (no third-party lib):
1. BFS generation assignment from root nodes (no parents)
2. Barycentric sort within each generation (order by parents' average column)
3. Spouse pairs kept adjacent in same row
4. **Subtree-width proportional spreading** — children fill their parent's slot
   proportionally, producing natural left/right skew like a hand-drawn tree
5. Alternating `+18px` vertical nudge on even columns prevents sibling-edge label overlap
6. Disconnected nodes placed in a separate row; separate trees get extra gap
7. Spacing: `H_GAP = CARD_W + 80`, `V_GAP = CARD_H + 120`
8. Fully **undoable**

---

## Person Dialog (double-click a node)

Floating window — `780×520px` minimum.

### Left Panel — Bio
- **Name** — editable; saved back to `node.name` (UUID identity preserved)
- **Born** — date string
- **Gender** — dropdown: Unknown / Male / Female / Other
- **Passed away** — date string (leave blank if living)
- **Bio** — free-text multi-line
- **[Save]** / **[Cancel]** at the bottom

### Right Panel — Photos | Links (vertical `QSplitter`, 50/50 default)

#### Photos (top half)
- Horizontal scroll of all photos tagged to this person
- Click any thumbnail → opens **PhotoViewer** lightbox:
  - Dark full-screen dialog
  - Prev / Next buttons + `←` / `→` arrow keys
  - `Esc` to close
  - Counter: `"2 / 5 — filename.jpg"`
  - Image rescales on window resize

#### Links (bottom half)
- Stores `node.links = [{"label": str, "url": str}, ...]`
- Each `LinkRow`:
  - **Locked display** by default — grey label + blue underlined URL
  - **✏** → edit mode (`QLineEdit` pair); button becomes **✔**
  - **✔** → commits; back to display mode
  - **↗** → `webbrowser.open(url)` (prepends `https://` if no scheme)
  - Clicking the blue URL text also opens the browser
  - **✕** → removes row
- **+ Add** button → new row (auto-enters edit mode)
- Rows scroll in `QScrollArea`; layout never overflows

### Unsaved-Change Protection
- Snapshot of all fields taken after UI build
- Closing window / `Cmd+W` / `Ctrl+W` checks dirty state
- If dirty: **Save / Discard / Cancel** dialog
- Saving resets the snapshot (no re-prompt on subsequent close)

---

## Tag Editor (`tag_editor.py`)

Opens when clicking a resource thumbnail in the Resources tab.

### Layout — `QStackedWidget` right panel
- **Page 0 (normal):** Tagged regions list · Metadata · Filename management · Save/Cancel
- **Page 1 (tagging):** Full-width confirm panel; Save greyed out

### Draw New Region
1. Click **✏ Draw Region** → crosshair cursor, Save greyed
2. Drag rectangle on image
3. Page flips to Page 1: Person dropdown · New person name · ☐ Use as profile image
4. **[✔ Save Tag]** or **[✖ Cancel]** → returns to Page 0

### Edit Existing Region
- Click a blue rectangle on the image → opens Page 1 pre-filled (region turns orange)
- **e** button in region list → same
- Clicking a different region while Page 1 is open → immediately updates panel

### Filename Management (Page 0 bottom)
- Shows **current filename** and **original upload filename**
- Free-text rename + **Restore original filename** button
- Auto-rename convention: `{year}-{firstname}_{lastname}.jpg`

### Orphaned Tags
- Deleted node → tags stored as `__orphan__:Name`; shown as `⚠ Name (deleted node)`
- Re-add node with same name → all orphaned tags auto-restored; toast shown

### Unsaved-Change Protection
- Same snapshot / dirty-check / `closeEvent` pattern as PersonDialog
- Covers: date, location, GPS, custom tags, filename, regions

---

## Resources Tab (Tab 2)

- Thumbnails (150×150 px) of all images in `resources/`
- Below each: filename + tags line (people names · `📍location` · custom tags)
- Orphaned tags shown as `⚠ Name`
- **Filter bar:** filter by Person · Date · Location · Custom tags
- Click thumbnail → opens Tag Editor

---

## Export / Import

| Action | Shortcut | Description |
|--------|----------|-------------|
| **Save** | Ctrl+S | Writes `tree.json` in place |
| **Export Zip** | Ctrl+E | Packages `tree.json` + `resources/` → `.zip` |
| **Import Zip** | — | Extracts into new `FamilyTrees/` subfolder |
| **Export to PostgreSQL** | — | Opens the PostgreSQL dialog |
| **Import from PostgreSQL** | — | Opens the PostgreSQL dialog |

### PostgreSQL Dialog (`ui/db_export_dialog.py`)

#### Saved Connections (top)
- Dropdown of all named saved connections
- **💾 Save As…** — prompts for a name, encrypts + saves current fields
- **🗑** — deletes selected saved connection (with confirmation)
- Selecting a connection auto-fills all fields below
- **Encryption:** Fernet (AES-128-CBC + HMAC-SHA256) via `cryptography` package
  - Key: `.famt_connections.key` beside `FamilyTrees/` — auto-added to `.gitignore`
  - Data: `.famt_connections.enc` beside `FamilyTrees/` — auto-added to `.gitignore`
  - Never stored as plaintext; never committed to git

#### Connection String (optional)
- Accepts `postgresql://user:pass@host:5432/dbname` URI  
  or `host=… port=… dbname=… user=… password=…` key=value DSN
- **⟳ Parse & Fill Fields** auto-populates individual parameter fields
- Schema/table can be embedded in URI: `?schema=myschema&table=mytable`

#### Connection Parameters
- Host · Port · Database · User · Password (masked)
- **Schema** (default: `public`) — the Postgres schema containing the table
- **Table** (default: `family_trees`) — any table with matching column structure works
- **🔌 Test Connection** — validates credentials before export/import

#### Actions
- **⬆ Export Current Tree** — upserts all nodes/edges/resources to `schema.table`
- Tree selector dropdown + **↻** refresh from DB
- **⬇ Import Selected Tree** — downloads to `FamilyTrees/<tree_name>/`
- **🗑 Delete Tree from DB…** — red button, type-to-confirm

---

## Data Model (`tree.json`)

```
Tree:
  tree_name     str
  nodes[]       Node
  edges[]       Edge
  resources[]   Resource

Node:
  id                  UUID (app-generated)
  name                str
  birth_date          str | null   (YYYY-MM-DD)
  death_date          str | null
  gender              "unknown" | "male" | "female" | "other"
  bio                 str
  profile_image_ref   str | null   ("resources/<filename>")
  is_standalone       bool
  position            {x: float, y: float}
  links[]             [{label: str, url: str}]    ← NEW

Edge:
  id             UUID
  source         node.id
  target         node.id
  relationship   "parent" | "spouse" | "sibling" | str
  label          str  (derived from gender, e.g. "Father of")

Resource:
  id                  UUID
  filename            str
  original_filename   str | null
  tags:
    persons[]         node.id | "__orphan__:Name"
    date              str | null
    location          str | null
    gps               {lat, lng} | null
    custom_tags[]     str
  regions[]:
    node_id           node.id | "__orphan__:Name"
    rect              {x,y,w,h}  (% of image size)
    use_as_profile    bool
```

---

## PostgreSQL Schema (see `docs/schema.sql`)

Single table `family_trees`:

| Column | Type | Notes |
|--------|------|-------|
| `tree_name` | VARCHAR(255) | partition key |
| `record_type` | VARCHAR(50) | `tree_meta` / `node` / `edge` / `resource` |
| `record_id` | VARCHAR(255) | UUID from app |
| `payload` | JSONB | full record JSON |
| `image_data` | TEXT | base64 JPEG; NULL for non-images |

No PostgreSQL extensions required — UUIDs generated client-side.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save tree |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+0` | Fit all nodes |
| `Ctrl+E` | Export zip |
| `Ctrl+W` / `Cmd+W` | Close popup (with unsaved-change check) |
| Middle-drag | Pan canvas |
| Scroll wheel | Zoom (when unlocked) |
| `←` / `→` | Navigate photos in PhotoViewer |
| `Esc` | Close PhotoViewer |

---

## File Layout

```
desktop/
  main.py
  requirements.txt         PyQt6, Pillow, psycopg2-binary, cryptography
  models/
    tree_model.py          Node, Edge, Tree, GENDER_OPTIONS
    resource_model.py      Resource, Region, ResourceTags, Rect
  core/
    export_import.py       save/load, zip, postgres (schema/table aware), image rename
    db_config.py           encrypted connection profile store (Fernet)
  ui/
    main_window.py         app shell, sidebar, toolbar, QFileSystemWatcher
    tree_canvas.py         QGraphicsView + EdgeItem (typed) + UndoStack + auto_layout
    node_card.py           QGraphicsItem card with profile thumbnail
    person_dialog.py       bio/photo/links dialog with dirty-check
    resource_manager.py    photo grid + filter
    tag_editor.py          region tagger with dirty-check
    db_export_dialog.py    postgres: connection string, schema/table, encrypted profiles
  assets/
    default_avatar.png

FamilyTrees/
  <tree_folder>/
    tree.json
    resources/             JPEG images

# beside FamilyTrees/ (never committed):
.famt_connections.key      Fernet key (base64 JSON)
.famt_connections.enc      encrypted profile blob

docs/
  features_desktop.md                          ← this file
  schema.sql
  20260308feature_desktop_app.md
  20260308feature_ui_polish_and_graph.md
  20260308feature_postgres_encrypted_profiles.md
  20260308debug_profile_edge_tags.md
  20260308plan_cross_platform.md
  20260308plan_desktop_status.md

.gitignore                 covers __pycache__, *.pyc, .env, .famt_connections.*
```

---

## Other Platforms (planned)

| Platform | Stack | Status |
|----------|-------|--------|
| Web | React + ReactFlow + Node.js | Not started |
| Mobile | Flutter (Dart) | Not started |
| Shared collab | Socket.io (web only) | Not started |

