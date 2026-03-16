// Try to load better-sqlite3; if it fails (native build or proxy issues), provide a
// minimal in-memory fallback so the app doesn't crash during dev runs.
let BetterSqlite3: any = null;
try {
  // use require so TypeScript doesn't force the module at compile time
  // and so runtime failure can be handled gracefully
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
    prepare: (sql: string) => {
      const s = sql.trim().toUpperCase();
      if (s.startsWith('INSERT') || s.startsWith('REPLACE')) {
        return {
          run: (...args: any[]) => {
            // crude parse to detect table name — not full SQL parsing
            const m = /INTO\s+([a-zA-Z0-9_]+)/i.exec(sql);
            const table = m ? m[1] : 'default';
            tables[table] = tables[table] || [];
            // naive handling: store a JSON blob of args
            tables[table].push({ __args: args, created_at: new Date().toISOString() });
            return { changes: 1 };
          }
        };
      }
      if (s.startsWith('SELECT')) {
        return {
          all: (limit?: number) => {
            // return rows from a likely table name in the query
            const m = /FROM\s+([a-zA-Z0-9_]+)/i.exec(sql);
            const table = m ? m[1] : 'default';
            const rows = tables[table] || [];
            if (typeof limit === 'number') return rows.slice(0, limit);
            return rows;
          },
          get: () => {
            const m = /FROM\s+([a-zA-Z0-9_]+)/i.exec(sql);
            const table = m ? m[1] : 'default';
            const rows = tables[table] || [];
            return rows[0] || null;
          }
        };
      }
      // default noop prepare
      return { run: () => undefined, all: () => [], get: () => null };
    }
  } as any;
}

export function initDb(dbPath: string) {
  if (BetterSqlite3) {
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
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

      CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256);
      CREATE INDEX IF NOT EXISTS idx_files_rel_path ON files(rel_path);

      CREATE TABLE IF NOT EXISTS thumbnails (
        sha256 TEXT PRIMARY KEY,
        thumbnail_path TEXT,
        width INTEGER,
        height INTEGER,
        updated_at_utc TEXT
      );

      CREATE TABLE IF NOT EXISTS display_cache (
        key TEXT PRIMARY KEY,
        json TEXT,
        updated_at_utc TEXT
      );
    `);

    try {
      const cols = db.prepare("PRAGMA table_info('backups')").all();
      const hasStatus = cols.some((c: any) => c.name === 'status');
      if (!hasStatus) {
        db.prepare("ALTER TABLE backups ADD COLUMN status TEXT DEFAULT 'running'").run();
      }
    } catch (e) {
      // ignore
    }

    return db;
  }

  // fallback
  console.warn('better-sqlite3 not available — using in-memory DB fallback');
  return createFallbackDb();
}

