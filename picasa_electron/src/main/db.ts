import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

let BetterSqlite3: any = null;
try {
  BetterSqlite3 = require('better-sqlite3');
} catch (e) {
  BetterSqlite3 = null;
}

function createFallbackDb() {
  // very small in-memory stub that supports the methods used by the app
  const tables: Record<string, any[]> = {};
  return {
    pragma: (_: string) => undefined,
    exec: (_sql: string) => undefined,
    close: () => undefined,
    prepare: (sql: string) => {
      const s = sql.trim().toUpperCase();
      if (s.startsWith('INSERT') || s.startsWith('REPLACE')) {
        return {
          run: (...args: any[]) => {
            const m = /INTO\s+([a-zA-Z0-9_]+)/i.exec(sql);
            const table = m ? m[1] : 'default';
            tables[table] = tables[table] || [];
            tables[table].push({ __args: args, created_at: new Date().toISOString() });
            return { changes: 1 };
          }
        };
      }
      if (s.startsWith('SELECT')) {
        return {
          all: (...args: any[]) => {
            const m = /FROM\s+([a-zA-Z0-9_]+)/i.exec(sql);
            const table = m ? m[1] : 'default';
            const rows = tables[table] || [];
            return rows;
          },
          get: (...args: any[]) => {
            const m = /FROM\s+([a-zA-Z0-9_]+)/i.exec(sql);
            const table = m ? m[1] : 'default';
            const rows = tables[table] || [];
            return rows[0] || null;
          }
        };
      }
      return { run: () => undefined, all: () => [], get: () => null };
    }
  } as any;
}

export function initDb(dbPath: string) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (BetterSqlite3) {
    try {
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      db.exec(`
        CREATE TABLE IF NOT EXISTS scan_cache (
          root_path TEXT PRIMARY KEY,
          updated_at_utc TEXT
        );

        CREATE TABLE IF NOT EXISTS scan_results (
          root_path TEXT,
          abs_path TEXT PRIMARY KEY,
          rel_path TEXT,
          size INTEGER,
          mtime INTEGER,
          ext TEXT,
          type TEXT,
          date_taken INTEGER,
          camera TEXT,
          lat REAL,
          lon REAL,
          location_json TEXT,
          FOREIGN KEY(root_path) REFERENCES scan_cache(root_path) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS thumbnails (
          key TEXT PRIMARY KEY,
          thumb BLOB,
          width INTEGER,
          height INTEGER,
          updated_at_utc TEXT
        );

        CREATE TABLE IF NOT EXISTS backups (
          id INTEGER PRIMARY KEY,
          name TEXT,
          timestamp_utc TEXT,
          settings_json TEXT,
          parts_json TEXT,
          created_by TEXT,
          status TEXT DEFAULT 'running'
        );

        CREATE TABLE IF NOT EXISTS files (
          id INTEGER PRIMARY KEY,
          backup_id INTEGER REFERENCES backups(id),
          original_path TEXT,
          rel_path TEXT NOT NULL,
          size INTEGER,
          mtime INTEGER,
          sha256 TEXT,
          archive_part TEXT,
          archive_offset INTEGER,
          crc32 INTEGER,
          added_at_utc TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_scan_results_root ON scan_results(root_path);
        CREATE INDEX IF NOT EXISTS idx_scan_results_type ON scan_results(type);
        CREATE INDEX IF NOT EXISTS idx_thumbs_key ON thumbnails(key);
        CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256);
      `);
      return db;
    } catch (e) {
      console.error('Failed to init better-sqlite3', e);
    }
  }

  console.warn('better-sqlite3 not available — using in-memory DB fallback');
  return createFallbackDb();
}


