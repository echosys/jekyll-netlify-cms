"""
db_export_dialog.py — PostgreSQL connection + export/import/delete dialog.

Supports:
  • Connection string (postgres:// URI or key=value DSN) that auto-populates fields
  • Schema and table name fields
  • Named saved profiles — encrypted with Fernet (AES-128-CBC + HMAC-SHA256)
    stored in .famt_connections.enc / .famt_connections.key beside FamilyTrees/
"""
from __future__ import annotations

import os
from typing import Optional

from PyQt6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QComboBox, QGroupBox, QMessageBox, QInputDialog,
    QFormLayout, QFrame, QSizePolicy,
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont


class DBExportDialog(QDialog):
    def __init__(self, tree, tree_dir: str, family_trees_dir: str,
                 config_dir: str, parent=None):
        super().__init__(parent)
        self.tree = tree
        self.tree_dir = tree_dir
        self.family_trees_dir = family_trees_dir
        self.config_dir = config_dir   # directory where .key/.enc live
        self.setWindowTitle("PostgreSQL Export / Import")
        self.setMinimumWidth(520)
        self._current: dict = {}       # live working copy of connection fields
        self._profiles: dict = {}      # name → profile dict
        self._build_ui()
        self._load_profiles()

    # ------------------------------------------------------------------
    # Encrypted profile helpers
    # ------------------------------------------------------------------

    def _load_profiles(self):
        from core.db_config import load_profiles, default_profile
        self._profiles = load_profiles(self.config_dir)
        self._refresh_profile_combo()
        # pre-fill fields from first profile or defaults
        if self._profiles:
            first = next(iter(self._profiles))
            self._apply_profile(self._profiles[first])
            self._profile_combo.setCurrentText(first)
        else:
            self._apply_profile(default_profile())

    def _refresh_profile_combo(self):
        self._profile_combo.blockSignals(True)
        self._profile_combo.clear()
        self._profile_combo.addItem("— select saved connection —")
        for name in self._profiles:
            self._profile_combo.addItem(name)
        self._profile_combo.blockSignals(False)

    def _apply_profile(self, p: dict):
        """Populate all UI fields from a profile dict."""
        self._dsn_edit.setText(p.get("dsn", ""))
        self._host_edit.setText(p.get("host", "localhost"))
        self._port_edit.setText(str(p.get("port", "5432")))
        self._db_edit.setText(p.get("dbname", ""))
        self._user_edit.setText(p.get("user", ""))
        self._pw_edit.setText(p.get("[REDACTED_SQL_PASSWORD_1]word", ""))
        self._schema_edit.setText(p.get("schema", "public"))
        self._table_edit.setText(p.get("table", "family_trees"))

    def _collect_profile(self) -> dict:
        """Read all UI fields into a dict."""
        return {
            "dsn":      self._dsn_edit.text().strip(),
            "host":     self._host_edit.text().strip(),
            "port":     self._port_edit.text().strip(),
            "dbname":   self._db_edit.text().strip(),
            "user":     self._user_edit.text().strip(),
            "[REDACTED_SQL_PASSWORD_1]word": self._pw_edit.text(),
            "schema":   self._schema_edit.text().strip() or "public",
            "table":    self._table_edit.text().strip() or "family_trees",
        }

    def _db_config(self) -> dict:
        """Return a config dict suitable for export_import functions."""
        p = self._collect_profile()
        return p   # export_import._get_conn handles dsn vs fields

    # ------------------------------------------------------------------
    # UI
    # ------------------------------------------------------------------

    def _build_ui(self):
        root = QVBoxLayout(self)
        root.setSpacing(10)

        # ── Saved profiles ───────────────────────────────────────────
        prof_box = QGroupBox("Saved Connections  🔒")
        prof_box.setToolTip("Connections are stored encrypted on disk (Fernet AES-128)")
        pbl = QHBoxLayout(prof_box)
        self._profile_combo = QComboBox()
        self._profile_combo.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self._profile_combo.currentIndexChanged.connect(self._on_profile_selected)
        pbl.addWidget(self._profile_combo, stretch=1)

        save_btn = QPushButton("💾 Save As…")
        save_btn.setToolTip("Save current fields as a named connection")
        save_btn.clicked.connect(self._save_profile)
        pbl.addWidget(save_btn)

        del_btn = QPushButton("🗑")
        del_btn.setToolTip("Delete selected saved connection")
        del_btn.setFixedWidth(32)
        del_btn.clicked.connect(self._delete_profile)
        pbl.addWidget(del_btn)
        root.addWidget(prof_box)

        # ── Connection string ─────────────────────────────────────────
        dsn_box = QGroupBox("Connection String  (optional — auto-fills fields below)")
        dbl = QVBoxLayout(dsn_box)
        self._dsn_edit = QLineEdit()
        self._dsn_edit.setPlaceholderText(
            "postgres://user:[REDACTED_SQL_PASSWORD_1]@host:5432/dbname   or   host=… port=… dbname=… user=… [REDACTED_SQL_PASSWORD_1]word=…"
        )
        self._dsn_edit.setEchoMode(QLineEdit.EchoMode.Normal)
        self._dsn_edit.editingFinished.connect(self._on_dsn_changed)
        dbl.addWidget(self._dsn_edit)
        parse_btn = QPushButton("⟳  Parse & Fill Fields")
        parse_btn.clicked.connect(self._on_dsn_changed)
        dbl.addWidget(parse_btn)
        root.addWidget(dsn_box)

        # ── Individual fields ─────────────────────────────────────────
        conn_box = QGroupBox("Connection Parameters")
        form = QFormLayout(conn_box)
        form.setSpacing(6)

        self._host_edit = QLineEdit("localhost")
        self._port_edit = QLineEdit("5432")
        self._db_edit   = QLineEdit()
        self._db_edit.setPlaceholderText("database name")
        self._user_edit = QLineEdit()
        self._user_edit.setPlaceholderText("username")
        self._pw_edit   = QLineEdit()
        self._pw_edit.setEchoMode(QLineEdit.EchoMode.Password)
        self._pw_edit.setPlaceholderText("••••••••")

        form.addRow("Host:", self._host_edit)
        form.addRow("Port:", self._port_edit)
        form.addRow("Database:", self._db_edit)
        form.addRow("User:", self._user_edit)
        form.addRow("Password:", self._pw_edit)

        # Separator
        sep = QFrame(); sep.setFrameShape(QFrame.Shape.HLine)
        form.addRow(sep)

        self._schema_edit = QLineEdit("public")
        self._schema_edit.setPlaceholderText("public")
        self._table_edit  = QLineEdit("family_trees")
        self._table_edit.setPlaceholderText("family_trees")
        form.addRow("Schema:", self._schema_edit)
        form.addRow("Table:", self._table_edit)

        hint = QLabel(
            "The table must match the schema in docs/schema.sql.\n"
            "Any table with the same structure (schema.table) can be used."
        )
        hint.setStyleSheet("color:#888; font-size:10px;")
        hint.setWordWrap(True)
        form.addRow(hint)

        test_btn = QPushButton("🔌  Test Connection")
        test_btn.clicked.connect(self._test_conn)
        form.addRow(test_btn)
        root.addWidget(conn_box)

        # ── Actions ───────────────────────────────────────────────────
        actions_box = QGroupBox("Actions")
        abl = QVBoxLayout(actions_box)

        export_btn = QPushButton("⬆  Export Current Tree to PostgreSQL")
        export_btn.clicked.connect(self._do_export)
        abl.addWidget(export_btn)

        sep2 = QFrame(); sep2.setFrameShape(QFrame.Shape.HLine)
        abl.addWidget(sep2)

        hl = QHBoxLayout()
        self._tree_combo = QComboBox()
        refresh_btn = QPushButton("↻")
        refresh_btn.setFixedWidth(28)
        refresh_btn.setToolTip("Refresh tree list from DB")
        refresh_btn.clicked.connect(self._refresh_tree_list)
        hl.addWidget(QLabel("Tree:"))
        hl.addWidget(self._tree_combo, stretch=1)
        hl.addWidget(refresh_btn)
        abl.addLayout(hl)

        import_btn = QPushButton("⬇  Import Selected Tree")
        import_btn.clicked.connect(self._do_import)
        abl.addWidget(import_btn)

        delete_btn = QPushButton("🗑  Delete Tree from DB…")
        delete_btn.setStyleSheet("color:#c62828;")
        delete_btn.clicked.connect(self._do_delete)
        abl.addWidget(delete_btn)

        root.addWidget(actions_box)

        close_btn = QPushButton("Close")
        close_btn.clicked.connect(self.accept)
        root.addWidget(close_btn)

    # ------------------------------------------------------------------
    # Slot handlers
    # ------------------------------------------------------------------

    def _on_profile_selected(self, idx: int):
        name = self._profile_combo.currentText()
        if name in self._profiles:
            self._apply_profile(self._profiles[name])

    def _on_dsn_changed(self):
        dsn = self._dsn_edit.text().strip()
        if not dsn:
            return
        from core.db_config import parse_connection_string
        p = parse_connection_string(dsn)
        # Keep DSN as-is, only fill individual fields
        self._host_edit.setText(p.get("host", ""))
        self._port_edit.setText(str(p.get("port", "5432")))
        self._db_edit.setText(p.get("dbname", ""))
        self._user_edit.setText(p.get("user", ""))
        self._pw_edit.setText(p.get("[REDACTED_SQL_PASSWORD_1]word", ""))
        if p.get("schema", "public") != "public":
            self._schema_edit.setText(p["schema"])
        if p.get("table", "family_trees") != "family_trees":
            self._table_edit.setText(p["table"])

    def _save_profile(self):
        name, ok = QInputDialog.getText(
            self, "Save Connection", "Name for this connection:"
        )
        if not ok or not name.strip():
            return
        name = name.strip()
        from core.db_config import save_profile
        p = self._collect_profile()
        save_profile(self.config_dir, name, p)
        self._profiles[name] = p
        self._refresh_profile_combo()
        self._profile_combo.setCurrentText(name)
        QMessageBox.information(self, "Saved", f"Connection \"{name}\" saved (encrypted).")

    def _delete_profile(self):
        name = self._profile_combo.currentText()
        if name not in self._profiles:
            return
        reply = QMessageBox.question(
            self, "Delete Connection",
            f"Delete saved connection \"{name}\"?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.Cancel,
        )
        if reply != QMessageBox.StandardButton.Yes:
            return
        from core.db_config import delete_profile
        delete_profile(self.config_dir, name)
        del self._profiles[name]
        self._refresh_profile_combo()

    def _test_conn(self):
        try:
            import psycopg2
            from core.export_import import _get_conn
            conn = _get_conn(self._db_config())
            conn.close()
            QMessageBox.information(self, "Connection OK", "Successfully connected to PostgreSQL.")
        except Exception as e:
            QMessageBox.critical(self, "Connection Failed", str(e))

    def _do_export(self):
        if not self.tree:
            QMessageBox.warning(self, "No Tree", "No tree is currently open.")
            return
        try:
            from core.export_import import export_to_postgres
            export_to_postgres(self.tree, self.tree_dir, self._db_config())
            QMessageBox.information(self, "Exported",
                f"Tree '{self.tree.tree_name}' exported to "
                f"{self._schema_edit.text()}.{self._table_edit.text()} successfully.")
        except Exception as e:
            QMessageBox.critical(self, "Export Failed", str(e))

    def _refresh_tree_list(self):
        try:
            from core.export_import import list_postgres_trees
            names = list_postgres_trees(self._db_config())
            self._tree_combo.clear()
            self._tree_combo.addItems(names)
        except Exception as e:
            QMessageBox.critical(self, "Error", str(e))

    def _do_import(self):
        tree_name = self._tree_combo.currentText()
        if not tree_name:
            return
        try:
            from core.export_import import import_from_postgres
            dest = import_from_postgres(tree_name, self.family_trees_dir, self._db_config())
            QMessageBox.information(self, "Imported",
                f"Tree '{tree_name}' imported to:\n{dest}")
        except Exception as e:
            QMessageBox.critical(self, "Import Failed", str(e))

    def _do_delete(self):
        tree_name = self._tree_combo.currentText()
        if not tree_name:
            return
        confirm, ok = QInputDialog.getText(
            self, "Confirm Delete",
            f"Type the tree name to confirm deletion:\n'{tree_name}'"
        )
        if not ok or confirm != tree_name:
            QMessageBox.information(self, "Cancelled", "Deletion cancelled.")
            return
        try:
            from core.export_import import delete_postgres_tree
            delete_postgres_tree(tree_name, self._db_config())
            QMessageBox.information(self, "Deleted",
                f"Tree '{tree_name}' deleted from DB.")
            self._refresh_tree_list()
        except Exception as e:
            QMessageBox.critical(self, "Delete Failed", str(e))
