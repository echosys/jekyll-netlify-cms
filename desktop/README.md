# Family Tree Desktop App (PyQt6)

A native desktop family-tree builder for macOS and Windows, built with Python + PyQt6.

---

## Quick Start

```bash
# 1. Create and activate a virtual environment (from the repo root)
python3 -m venv .venv
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\activate           # Windows

# 2. Install dependencies
pip install -r desktop/requirements.txt

# 3. Run
python desktop/main.py
```

---

## Sample Tree

A ready-to-explore sample tree (`Anderson Family`) with 8 people, 12 relationships,
and 10 mock photos is included at:

```
FamilyTrees/
  sample_family/
    tree.json
    resources/
      1935-george_anderson.jpg
      1940-eleanor_anderson.jpg
      ...
```

Launch the app and click **Anderson Family** in the left sidebar.

---

## Tree Storage

All trees are saved in **`FamilyTrees/`** at the repo/app root — never in system
folders (`~/Library`, `AppData`, etc.).

```
FamilyTrees/
  your_tree_name/
    tree.json
    resources/
      YYYY-MM-DD-firstname_lastname.jpg
```

---

## Feature Summary

| Feature | How to use |
|---|---|
| New tree | Sidebar → **+ New Tree** or File → New Tree |
| Add person | Right-click canvas → Add Person Here |
| Add relationship | Right-click node → Add Relationship |
| Edit person | Double-click node → Person Detail dialog |
| Upload photos | Resources tab → ⬆ Upload Images |
| Tag a photo | Resources tab → click thumbnail → Tag Editor |
| Export zip | Export menu → Export as Zip… |
| Import zip | File menu → Import from Zip… |
| PostgreSQL export | Export menu → Export to PostgreSQL… |
| PostgreSQL import | File menu → Import from PostgreSQL… |

---

## PostgreSQL Setup

The app reads connection details from `db_config.json` in the repo root.
Created automatically when you use the Export to PostgreSQL dialog.

The DBA SQL schema is at `docs/schema.sql` — **no Postgres extensions required**.

---

## Project Structure

```
desktop/
  main.py                 ← entry point
  requirements.txt
  models/
    tree_model.py         ← Tree, Node, Edge dataclasses
    resource_model.py     ← Resource, Region, Tags dataclasses
  core/
    export_import.py      ← zip, json, postgres, image compress/rename
  ui/
    main_window.py        ← application shell
    tree_canvas.py        ← QGraphicsView canvas + edge arrows
    node_card.py          ← person card QGraphicsItem
    person_dialog.py      ← floating bio + images dialog
    resource_manager.py   ← photo library grid + filter
    tag_editor.py         ← rubber-band region tagger
    db_export_dialog.py   ← postgres connection dialog
  assets/
    default_avatar.png
```

