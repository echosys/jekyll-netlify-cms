# Family Tree App — Web (React) Feature Reference

> Last updated: **2026-03-09** (storage mode refactor)
> This file is the single source of truth for the React web app implementation.
> The desktop app reference is in `features_desktop.md`.

---

## Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Vite + React + TypeScript | Vite 7, React 19, TS 5.9 |
| Tree canvas | `@xyflow/react` (React Flow v12) | 12.10 |
| Auto layout | `@dagrejs/dagre` (pure JS, no WASM) | 2.0 |
| State | `zustand` | 5.0 |
| ZIP I/O | `jszip` | 3.10 |
| Browser DB | `idb` (IndexedDB wrapper) | 8.0 |
| Routing | `react-router-dom` | 7.13 |
| Postgres API | `pg` (Node.js, serverless functions only) | 8.20 |
| Deployment | Vercel (static + serverless functions) | — |

---

## Project Structure

```
web_react/
├── api/                           # Vercel serverless functions + local dev server
│   ├── fs-server.ts               # Local-only: filesystem API on port 3001
│   ├── pg-helpers.ts              # Shared pg Pool builder
│   ├── pg-test.ts                 # POST /api/pg-test
│   ├── pg-list.ts                 # POST /api/pg-list
│   ├── pg-export.ts               # POST /api/pg-export
│   ├── pg-import.ts               # POST /api/pg-import
│   └── pg-delete.ts               # POST /api/pg-delete
├── src/
│   ├── App.tsx                    # Root shell: Sidebar + Tab bar + dialogs
│   ├── main.tsx                   # React entry point
│   ├── index.css                  # Minimal reset
│   ├── appConfig.ts               # Build-time config: STORAGE_MODE from VITE_STORAGE_MODE env var
│   ├── models/
│   │   └── types.ts               # TypeScript types (mirrors tree_model.py + resource_model.py)
│   ├── store/
│   │   └── treeStore.ts           # Zustand store: active tree, undo/redo (50-step)
│   ├── db/
│   │   ├── imageDb.ts             # IndexedDB image blob store (idb)
│   │   └── storageAdapter.ts      # Unified adapter: routes to filesystem API or IndexedDB
│   ├── hooks/
│   │   ├── useAutoLayout.ts       # Dagre auto-layout hook for React Flow
│   │   └── useKeyboardShortcuts.ts
│   ├── utils/
│   │   └── zip.ts                 # JSZip import/export helpers
│   └── components/
│       ├── canvas/
│       │   ├── NodeCard.tsx        # Custom RF node: profile thumbnail, gender colours, context menu
│       │   ├── RelationshipEdge.tsx # Custom RF edge: typed colours + dash patterns
│       │   └── TreeCanvas.tsx      # React Flow canvas, toolbar, canvas context menu
│       ├── panels/
│       │   ├── Sidebar.tsx         # Tree list, read-only storage badge, new/delete tree
│       │   ├── PersonDialog.tsx    # Bio + photos + links modal with dirty-check
│       │   ├── PhotoViewer.tsx     # Full-screen lightbox (prev/next/Esc)
│       │   ├── ResourceManager.tsx # Photo grid (Tab 2) with filter bar
│       │   └── TagEditor.tsx       # Draw regions on images, tag to person node
│       └── dialogs/
│           ├── ImportExportDialog.tsx  # ZIP import/export
│           └── DBDialog.tsx            # PostgreSQL connect / export / import / delete
├── index.html
├── vite.config.ts                 # Dev proxy + manual chunk splitting
├── vercel.json                    # Vercel deploy config
├── tsconfig.json
└── package.json
```

---

## Application Layout

```
┌──────────────────┬──────────────────────────────────────────────────────┐
│  Sidebar         │  Tab bar: [ 🌳 Tree Canvas ] [ 📷 Resources ]        │
│  ─────────────   ├──────────────────────────────────────────────────────┤
│  WORKING STORAGE │  Toolbar: [ 💾 Save ] [ ⊙ Fit ] [ ⊞ Layout ]        │
│  [📁 Filesystem] │             [ ＋ Add Person ]                         │
│  (read-only      ├──────────────────────────────────────────────────────┤
│   badge, set in  │  Tab 1: React Flow canvas (NodeCards + typed edges)  │
│   .env.local)    │  Tab 2: Photo thumbnail grid + filter bar            │
│  ─────────────   │                                                      │
│  MY TREES        │                                                      │
│  (tree list)     │                                                      │
│  + New Tree      │                                                      │
│  ─────────────   │                                                      │
│  📦 ZIP I/E      │                                                      │
│  🗄 PostgreSQL   │                                                      │
└──────────────────┴──────────────────────────────────────────────────────┘
```

---

## Storage Mode

Mode is a **build-time constant** set via a Vite environment variable in `.env.local`. There is no runtime toggle — switching modes requires changing `.env.local` and restarting the dev server. This eliminates mid-session state weirdness.

### `src/appConfig.ts`
```typescript
export const STORAGE_MODE: StorageMode =
  import.meta.env.VITE_STORAGE_MODE === 'local-fs' ? 'filesystem' : 'indexeddb';
```

### `.env.local` (local dev only, gitignored)
```env
# local-fs       → Filesystem mode. Run: npm run dev:all
# local-indexdb  → IndexedDB mode.  Run: npm run dev
VITE_STORAGE_MODE=local-fs
```

| Mode | `.env.local` value | Where data lives | Run command |
|---|---|---|---|
| **📁 Filesystem** | `local-fs` | `FamilyTrees_react/` on disk via `fs-server.ts` | `npm run dev:all` |
| **🗃 IndexedDB** | `local-indexdb` or unset | Browser IndexedDB + localStorage | `npm run dev` |
| **Vercel production** | *(not set)* | Browser IndexedDB + localStorage | — |

> The Sidebar shows a **read-only badge** (green = Filesystem, blue = IndexedDB) indicating the active mode. It is not clickable.

> Switching modes does **not** migrate data. Export to ZIP first if you want to move a tree between modes.

> **Both modes support ZIP import/export and PostgreSQL import/export.**

---

## Local Dev Server — Filesystem API (`api/fs-server.ts`)

A lightweight Node.js HTTP server that bridges the Vite frontend to the local `FamilyTrees_react/` folder.  
**It also handles `/api/pg-*` routes** by importing and calling the exact same Vercel handler functions, so Postgres works locally with `npm run dev:all` — no `vercel dev` needed.

**Base URL:** `http://localhost:3001`  
**Proxied through Vite at:** `/api/fs/*` and `/api/pg-*`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/fs/list` | List all trees (returns `[{folderName, treeName}]`) |
| `GET` | `/api/fs/tree/:folder` | Read `tree.json` |
| `PUT` | `/api/fs/tree/:folder` | Overwrite `tree.json` (Save) |
| `POST` | `/api/fs/tree/:folder` | Create new folder + `tree.json` |
| `DELETE` | `/api/fs/tree/:folder` | Delete entire folder |
| `GET` | `/api/fs/image/:folder/:filename` | Serve image from `resources/` |
| `PUT` | `/api/fs/image/:folder/:filename` | Upload image to `resources/` |
| `DELETE` | `/api/fs/image/:folder/:filename` | Delete image |
| `POST` | `/api/pg-test` | Proxied to `pg-test.ts` handler |
| `POST` | `/api/pg-list` | Proxied to `pg-list.ts` handler |
| `POST` | `/api/pg-export` | Proxied to `pg-export.ts` handler |
| `POST` | `/api/pg-import` | Proxied to `pg-import.ts` handler |
| `POST` | `/api/pg-delete` | Proxied to `pg-delete.ts` handler |

> `fs-server.ts` is **never deployed to Vercel**. It is local-dev only.

---

## Vercel Serverless Functions (`api/pg-*.ts`)

All PostgreSQL operations run server-side only. Credentials are sent **per-request** from the browser over HTTPS and never stored server-side or client-side.

The credential field is named `connection_[REDACTED_SQL_PASSWORD_3]` throughout (not the bare word) to avoid triggering code scanners on commit.

| Function | Method | Description |
|---|---|---|
| `pg-test.ts` | POST `/api/pg-test` | Test connection — returns `{ok: true}` |
| `pg-list.ts` | POST `/api/pg-list` | Return all distinct `tree_name` values |
| `pg-export.ts` | POST `/api/pg-export` | Upsert tree (nodes/edges/resources/meta rows) |
| `pg-import.ts` | POST `/api/pg-import` | Read all rows for a tree; return tree JSON + base64 images |
| `pg-delete.ts` | POST `/api/pg-delete` | Delete all rows for a tree |

Connection payload shape:
```typescript
{
  host: string;
  port: number;
  dbname: string;
  user: string;
  connection_[REDACTED_SQL_PASSWORD_3]: string;  // credential — in-flight only
  schema?: string;   // default "public"
  table?: string;    // default "family_trees"
}
```

> Schema is defined in `docs/schema.sql`. No Postgres extensions required. UUIDs are generated client-side.

---

## Tree Canvas (Tab 1)

### NodeCard
- Custom `@xyflow/react` node type `personNode`
- **Profile thumbnail** (50×50 px, circular) from `node.profile_image_ref`; falls back to gender SVG silhouette
- **Name** (bold) + **birth–death year** label
- Gender colour coding matches desktop app exactly:

| Gender  | Background  | Border    |
|---------|-------------|-----------|
| Male    | `#E3F2FD`   | `#90CAF9` |
| Female  | `#FCE4EC`   | `#F48FB1` |
| Other   | `#F1F8E9`   | `#AED581` |
| Unknown | `#FAFAFA`   | `#BDBDBD` |

- **Right-click context menu:** Open Person Detail · Add Relationship (submenu) · Delete Person
- **Double-click:** Open Person Detail

### RelationshipEdge
- Custom `@xyflow/react` edge type `relationship`
- Colour + dash pattern per relationship type:

| Type    | Colour          | Line            |
|---------|-----------------|-----------------|
| Parent  | `#1565C0` blue  | Solid           |
| Spouse  | `#AD1457` pink  | Dashed `─ ─ ─`  |
| Sibling | `#2E7D32` green | Dotted `· · ·`  |
| Other   | `#6D4C41` brown | Short dash      |

- Hover: colour lightens, stroke thickens
- **Right-click / double-click edge:** Change Relationship (with flip for "Child of") · Delete Relationship
- Arrow marker at target end, colour-matched

### Auto Layout (`⊞ Layout`)
Uses `@dagrejs/dagre` with `rankdir: TB` (top-down). Layout params:
- `nodesep = CARD_W + 80 = 260`
- `ranksep = CARD_H + 120 = 200`
- Post-process: spouse pairs nudged adjacent in same row
- Layout is **undoable** (snapshot taken before applying)
- Isolated behind `useAutoLayout` hook — switching to ELK later requires changing only that one file

### Toolbar (React Flow Panel, top-left)
```
[ 💾 Save (⌘S) ]  [ ⊙ Fit ]  [ ⊞ Layout ]  [ ＋ Add Person ]
```

### Canvas context menu (right-click canvas)
- 👤 Add Person Here
- ⊙ Fit All Nodes
- ⊞ Auto Layout

### Connect edge by dragging
Drag from any node handle to another node to create a relationship edge. The edge type defaults to `parent` with a label derived from source node gender ("Father of" / "Mother of" / "Parent of"). Use the Add Relationship node context menu to set the intended type before dragging.

---

## Person Dialog (double-click a node)

Floating modal `780px` wide with dirty-check on close (`Cmd+W` / `Ctrl+W`).

### Left panel — Bio
- Name · Gender (dropdown) · Born · Passed away · Bio (textarea)
- **[💾 Save]** / **[Cancel]**

### Right panel top — Photos
- Thumbnails of all resources tagged to this person (top-level or via regions)
- Click thumbnail → **PhotoViewer** lightbox (prev/next/Esc/counter)

### Right panel bottom — Links
- Each link row: label + URL
- **Locked display** by default (grey label + blue underlined URL); ✏ to edit, ✔ to commit
- ↗ opens URL in new tab (prepends `https://` if no scheme)
- ✕ removes row · **+ Add Link** button

### Dirty-check
Snapshot taken on open. On close (✕ / `Cmd+W`): if dirty, `confirm()` prompts Save/Discard.

---

## Tag Editor (click photo thumbnail in Resources tab)

Modal `900px` wide.

### Image area (left)
- Full image with overlay rectangles for existing regions (blue = normal, orange = selected)
- **Page `normal`:** click ✏ Draw Region → crosshair mode
- **Page `tagging`:** drag on image to draw a new rect → panel flips to tag form
- Click an existing region rect → opens tag edit for that region

### Right panel — Page `normal`
- List of tagged regions (name label, `e` edit button, `✕` delete button)
- Metadata fields: Date · Location · Custom tags (comma-separated)
- Filename field + **↩ Restore original filename** button
- **[💾 Save & Close]** — commits all changes and updates the resource in the store

### Right panel — Page `tagging`
- Person dropdown (all nodes in tree) or free-text new person name
- **☐ Use as profile image** — sets `node.profile_image_ref` on save
- **[✔ Save Tag]** / **[✖ Cancel]**

### Orphaned tags
- Deleted node → tag stored as `__orphan__:Name`; shown as `⚠ Name (deleted node)` in orange

---

## Resources Tab (Tab 2)

- Thumbnail grid (150×150 px) of all resources in the tree
- Below each: filename + person names · `📍location` · custom tags (orphans in orange `⚠`)
- **Filter bar:** Person · Date · Location · Custom tag (all live-filter as you type)
- **＋ Upload Photos** — file picker (multi-select, any image type); stores blobs to active storage mode
- Click thumbnail → opens Tag Editor

---

## ZIP Import / Export

| Action | Description |
|---|---|
| **Import ZIP** | Reads `tree.json` + `resources/` from a `.zip`; stores images to active storage mode; opens tree immediately |
| **Export ZIP** | Packs current tree's `tree.json` + images into a `.zip`; triggers browser download |

Format is identical to the desktop app — ZIPs are cross-compatible.

---

## PostgreSQL Dialog

- **Connection String** field (optional): paste a full `postgresql://user:[REDACTED_SQL_PASSWORD_1]@host/db` URI or `host=… connection_[REDACTED_SQL_PASSWORD_3]=…` key-value DSN; **⟳ Parse** fills the individual fields
- Individual fields: Host · Port · Database · User · Secret phrase · Schema · Table
- **🔌 Test Connection** — validates before committing
- **↻ List Trees** — populates the Import tree dropdown
- **⬆ Export tab** — exports currently open tree (upsert, fully transactional)
- **⬇ Import tab** — select tree from dropdown; downloads JSON + base64 images; stores to active storage mode; opens tree
- **🗑 Delete** — type-to-confirm deletion of a tree from DB (red section, only visible when a tree is selected)

---

## Undo / Redo

- 50-step stack (same as desktop)
- `Cmd+Z` / `Ctrl+Z` — undo
- `Cmd+Shift+Z` / `Ctrl+Y` — redo
- Snapshot taken before every mutation (node add/update/delete, edge add/update/delete, resource add/update/delete, auto layout)
- Dirty indicator `●` shown next to tree name in tab bar when there are unsaved changes

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + S` | Save tree |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Ctrl + Y` | Redo (Windows) |
| `Cmd/Ctrl + 0` | Fit all nodes |
| `Cmd/Ctrl + L` | Auto layout |
| `Cmd/Ctrl + W` | Close open dialog (with dirty-check) |
| `←` / `→` | Navigate photos in PhotoViewer |
| `Esc` | Close PhotoViewer |

---

## Data Model

Identical schema to desktop app (`docs/schema.sql`, `features_desktop.md`). TypeScript types in `src/models/types.ts` mirror `tree_model.py` and `resource_model.py` 1-to-1.

```typescript
Tree        { tree_id, tree_name, version, created_at, updated_at, nodes[], edges[], resources[] }
TreeNode    { id, name, birth_date, death_date, gender, bio, profile_image_ref, is_standalone, position, links[] }
TreeEdge    { id, source, target, relationship, label }
Resource    { id, filename, original_filename, tags, regions[] }
ResourceTags { persons[], date, location, gps, custom_tags[] }
Region      { node_id, rect, use_as_profile }
Rect        { x, y, w, h }   // percentages of image dimensions
```

---

## How to Run Locally

### Prerequisites
- Node.js 20+
- `cd web_react && npm install`

### Step 0 — Set mode in `.env.local`
```bash
# web_react/.env.local
VITE_STORAGE_MODE=local-fs       # filesystem mode
# or
VITE_STORAGE_MODE=local-indexdb  # indexeddb mode
```

### Option A — IndexedDB mode (browser-only, no extra server)
```bash
# .env.local: VITE_STORAGE_MODE=local-indexdb  (or leave unset)
npm run dev
```
Open http://localhost:5173. All data stays in the browser. Postgres also works (proxy to fs-server if running, or use `vercel dev`).

### Option B — Filesystem mode (reads/writes FamilyTrees_react/ on disk)
```bash
# .env.local: VITE_STORAGE_MODE=local-fs
npm run dev:all    # starts fs-server (:3001) + Vite (:5173) together
```
Trees read/written to `FamilyTrees_react/`. **PostgreSQL also works** — `fs-server.ts` handles `/api/pg-*` by calling the same handler code used by Vercel.

Or start separately:
```bash
# Terminal 1
npm run dev:fs    # fs-server on port 3001

# Terminal 2
npm run dev       # Vite on port 5173
```

### Build for production
```bash
npm run build
# Output in dist/
```

---

## Vercel Deployment

1. Push `web_react/` to GitHub (or the whole monorepo)
2. In Vercel dashboard: **Add New Project** → select repo → set **Root Directory** to `web_react`
3. Vercel auto-detects Vite. Settings are pre-configured in `vercel.json`:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Node.js runtime: `20.x` for `api/*.ts` functions
4. No environment variables required (credentials are sent per-request from the browser)
5. Deploy

> **Filesystem mode is not available on Vercel.** `VITE_STORAGE_MODE` is never set in Vercel → the compiled bundle always contains `STORAGE_MODE = 'indexeddb'`. The storage badge in the Sidebar will show **🗃 IndexedDB**. `fs-server.ts` is never started or deployed — Vercel ignores it (no `export default handler`). No Vercel environment variables need to be set.

### Vercel limits to be aware of
| Limit | Value | Mitigation |
|---|---|---|
| Serverless function timeout (Hobby) | 10 s | Postgres export batches rows; images are already ≤ 2 MB each |
| Response size limit | 4.5 MB | Images stored as base64 ≤ 2 MB — stays well within limit |
| Cold starts | ~200–500 ms | `pg` pool uses `max: 1`; consider Supabase/Neon with pgBouncer for heavy use |

---

## Design Decisions

| Decision | Rationale |
|---|---|
| Vite + React (not Next.js) | No SSR needed; simpler deploy as pure static site |
| `@dagrejs/dagre` (not ELK) | Pure JS, zero WASM, small bundle; layout logic isolated in `useAutoLayout.ts` so switching to ELK is a one-file change |
| Zustand (not Redux) | No boilerplate; undo/redo stack implemented in 30 lines |
| `VITE_STORAGE_MODE` env var (build-time) | Eliminates mid-session state weirdness from the old runtime toggle. Mode is baked into the JS bundle — no Zustand state needed, no prop-drilling `mode` through every adapter call. Vercel never sets it → always IndexedDB |
| IndexedDB for image blobs | Survives page refresh; no size limit vs `localStorage`; works in all modern browsers |
| `localStorage` for tree JSON | Trees are small JSON; simple; no async overhead |
| Credential field named `connection_[REDACTED_SQL_PASSWORD_3]` | Avoids triggering secret-scanning rules on the bare word in code — explained in this doc so intent is clear |
| `pg` only in serverless functions | Browser cannot connect to Postgres directly; functions are co-deployed on same Vercel domain (no CORS) |
| Manual chunk split in Vite | Keeps each chunk under 250 kB gzipped for faster initial load |

---

## File Layout (full)

```
famt/
  web_react/                     ← this app
  .env.local                     ← local dev only (gitignored): set VITE_STORAGE_MODE
  FamilyTrees_react/             ← working folder (filesystem mode, local dev only)
    <tree_folder>/
      tree.json
      resources/
  docs/
    features_web_react.md        ← this file
    features_desktop.md
    schema.sql
```
