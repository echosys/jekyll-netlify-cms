# Plan Update — Desktop App Status & Next Steps

> Date: March 8, 2026
> Type: plan
> Builds on: `20260308plan_cross_platform.md`

---

## Desktop App (Python + PyQt6) — Current Status

### Completed features

| Feature | Status |
|---|---|
| Tree canvas (NodeCard + bezier edges) | ✅ Done |
| Gender-coded card colours (male/female/other/unknown) | ✅ Done |
| Profile thumbnail on NodeCard (from `profile_image_ref`) | ✅ Done (bug fixed Mar 8) |
| Node CRUD (add, edit via PersonDialog, delete with tag-warning) | ✅ Done |
| Edge CRUD (add with gender-derived label, right-click/double-click edit/delete) | ✅ Done |
| Relationship options: Parent of / Child of / Spouse / Sibling | ✅ Done |
| Edge label derived from source node gender (Father of / Mother of / Parent of) | ✅ Done |
| "Change Relationship" flips edge direction when choosing Child of | ✅ Done |
| Undo/Redo (Ctrl+Z / Ctrl+Y, 50-step stack) | ✅ Done |
| Auto-fit viewport on tree open | ✅ Done |
| Lock Zoom toggle | ✅ Done |
| PersonDialog (bio + gender + birth/death + photo scroll) | ✅ Done |
| Photo library grid (ResourceManager) with tag display under thumbnails | ✅ Done |
| Tag editor — QStackedWidget panel (no squeezing during draw mode) | ✅ Done |
| Click existing region to edit (not just draw new) | ✅ Done |
| Filename management (current / original / rename / restore) | ✅ Done |
| Year-only filename convention (`1935-george_anderson.jpg`) | ✅ Done |
| Orphaned tag preservation on node delete + auto-heal on re-add | ✅ Done |
| Local save/load (tree.json + resources folder) | ✅ Done |
| Zip export/import | ✅ Done |
| PostgreSQL export/import (upsert rows, base64 images) | ✅ Done |
| Sample family tree with placeholder images (all 10 files) | ✅ Done |

---

## Known Gaps / Next priorities

### High priority
| Item | Notes |
|---|---|
| **Delete key shortcut** for selected node/edge | Currently only via context menu |
| **Node name edit in-place** on the card or via double-click name field | PersonDialog requires opening full dialog |
| **Drag standalone node into main tree** | Standalone nodes created from tag editor can't yet be connected by dragging |
| **Export tree as image (PNG)** | Menu item exists in spec, not yet implemented |

### Medium priority
| Item | Notes |
|---|---|
| **Filter by date in Resources tab** | Location + person filters exist; date filter placeholder only |
| **Bulk-tag people in reunion photos** | Currently must draw one region at a time |
| **Person merge** | If two nodes represent the same person, merge node + reassign all tags |
| **Tree search bar** | Find a node by name and pan/zoom canvas to it |

### Low priority / Future
| Item | Notes |
|---|---|
| Web app (React + ReactFlow) | Phase 4 in build order |
| Mobile app (Flutter) | Phase 7 |
| Shared collaboration (Socket.io) | Phase 8, web only |
| Windows packaging (PyInstaller / NSIS) | macOS tested; Windows untested |

---

## File / Doc Inventory

```
docs/
  20260308feature_desktop_app.md   ← full desktop feature spec (authoritative)
  20260308plan_cross_platform.md   ← original cross-platform plan + JSON schema + DDL
  20260308plan_desktop_status.md   ← this file
  20260308debug_profile_edge_tags.md ← bug fixes landed Mar 8
  schema.sql                        ← postgres DDL for DBA
```

---

## JSON Schema — current additions vs original plan

The live schema now includes these fields not in the original plan doc:

| Field | Location | Purpose |
|---|---|---|
| `gender` | `node` | `"male"` / `"female"` / `"other"` / `"unknown"` — drives card colour + edge label |
| `original_filename` | `resource` | Upload name before auto-rename — enables "Restore original filename" |

The `profile_image_ref` convention changed from `{full-date}-{name}.jpg` to `{year}-{name}.jpg`.

---

## Build order status

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Lock JSON schema v1.0 | ✅ Done (with gender + original_filename additions) |
| 2 | Python model + export/import | ✅ Done |
| 3 | PyQt6 desktop app | ✅ Core complete — gaps listed above |
| 4 | React web app — tree canvas | ⬜ Not started |
| 5 | React web app — resource tab | ⬜ Not started |
| 6 | Node.js backend | ⬜ Not started |
| 7 | Flutter mobile | ⬜ Not started |
| 8 | Web collaboration | ⬜ Not started |

