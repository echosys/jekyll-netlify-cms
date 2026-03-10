# 2026-03-08 — PostgreSQL UI: Connection String, Schema/Table, Encrypted Profiles

## Summary
Overhauled the PostgreSQL export/import dialog to support connection strings,
configurable schema/table, and encrypted named connection profiles.

---

## 1. New module: `core/db_config.py`

Handles all encrypted credential storage, independent of the UI.

### Encryption
- **Algorithm:** Fernet (AES-128-CBC + HMAC-SHA256) from the `cryptography` package
- **Key file:** `.famt_connections.key` — JSON with `{"algo": "Fernet-AES128-CBC-HMAC-SHA256", "key": "<base64>"}`
- **Data file:** `.famt_connections.enc` — Fernet-encrypted JSON blob
- Both files live in the directory **beside** `FamilyTrees/` (i.e. the project root)
- Both files automatically added to `.gitignore` on first write
- Key is generated once with `Fernet.generate_key()` and never changes unless deleted

### Public API
```python
load_profiles(config_dir)            → dict[name, profile]
save_profile(config_dir, name, p)    # encrypts and writes
delete_profile(config_dir, name)
get_profile(config_dir, name)        → Optional[dict]
default_profile()                    → dict  (localhost defaults)
parse_connection_string(dsn: str)    → dict  (profile fields)
```

### `parse_connection_string`
Accepts both forms:
- **URI:** `postgresql://user:[REDACTED_SQL_PASSWORD_1]@host:5432/dbname?schema=x&table=y`
- **Key=value DSN:** `host=... port=... dbname=... user=... [REDACTED_SQL_PASSWORD_1]word=...`

Returns a full profile dict (host/port/dbname/user/[REDACTED_SQL_PASSWORD_1]word/schema/table).

### Profile schema
```json
{
  "dsn":      "",
  "host":     "localhost",
  "port":     "5432",
  "dbname":   "",
  "user":     "",
  "[REDACTED_SQL_PASSWORD_1]word":  "",
  "schema":   "public",
  "table":    "family_trees"
}
```

---

## 2. `core/export_import.py` — Schema/Table support

All PostgreSQL functions now accept `schema` and `table` from `db_config`:

- `_get_conn(config)` — now checks `config["dsn"]` first; if non-empty connects via raw DSN string (psycopg2 handles URI/DSN natively), otherwise uses individual fields
- `_qt(config)` — returns safely-sanitised `schema.table` identifier (strips non-word chars)
- All SQL in `export_to_postgres`, `list_postgres_trees`, `import_from_postgres`, `delete_postgres_tree` now use `_qt(db_config)` — no more hardcoded `family_trees`

Any table with the same column structure can be used by changing schema/table in the dialog.

---

## 3. `ui/db_export_dialog.py` — Full redesign

### Saved Connections section (top)
- Dropdown of all saved named connections (`— select saved connection —` placeholder)
- **💾 Save As…** — prompts for a name, encrypts and persists current fields
- **🗑** — deletes the selected saved connection (with confirmation)
- Selecting a profile auto-fills all fields below
- Tooltip on group box: `"Connections are stored encrypted on disk (Fernet AES-128)"`

### Connection String section
- Single wide text field — accepts either URI or key=value DSN
- **⟳ Parse & Fill Fields** button (also fires on focus-leave) — calls `parse_connection_string` and populates the individual fields; DSN stays as-is in the field for re-use

### Connection Parameters section (form layout)
- Host, Port, Database, User, Password (masked)
- Separator line
- **Schema** (default: `public`)
- **Table** (default: `family_trees`)
- Hint: *"Any table with the same structure can be used"*
- **🔌 Test Connection** button

### Actions section
- **⬆ Export Current Tree to PostgreSQL**
- Tree selector + **↻** refresh button
- **⬇ Import Selected Tree**
- **🗑 Delete Tree from DB…** (red, type-to-confirm)

### `main_window.py` change
`config_path` (a file path) replaced by `config_dir` (a directory path) — matches new `DBExportDialog` signature.

---

## 4. `requirements.txt`
Added `cryptography>=42.0.0`.

---

## 5. `.gitignore` (new file at repo root)
```
.famt_connections.key
.famt_connections.enc
```
Also covers `__pycache__/`, `*.pyc`, `.env`, `.venv`, `.DS_Store`.

