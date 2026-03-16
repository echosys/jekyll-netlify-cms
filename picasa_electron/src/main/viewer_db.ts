// Load better-sqlite3 at runtime if available; otherwise use an in-memory fallback.
let BetterSqlite3: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  BetterSqlite3 = require('better-sqlite3');
} catch (e) {
  BetterSqlite3 = null;
}

import * as fs from 'fs';
import * as path from 'path';

function createFallbackDb() {
  const tables: Record<string, any[]> = {};
  return {
    pragma: (_: string) => undefined,
    exec: (_sql: string) => undefined,
    prepare: (sql: string) => {
      const s = sql.trim().toUpperCase();
      if (s.startsWith('INSERT') || s.startsWith('REPLACE')) {
        return { run: (...args: any[]) => { const m = /INTO\s+([a-zA-Z0-9_]+)/i.exec(sql); const table = m ? m[1] : 'default'; tables[table] = tables[table] || []; tables[table].push({ __args: args, created_at: new Date().toISOString() }); return { changes: 1 }; } };
      }
      if (s.startsWith('SELECT')) {
        return { all: (limit?: number) => { const m = /FROM\s+([a-zA-Z0-9_]+)/i.exec(sql); const table = m ? m[1] : 'default'; const rows = tables[table] || []; if (typeof limit === 'number') return rows.slice(0, limit); return rows; }, get: () => { const m = /FROM\s+([a-zA-Z0-9_]+)/i.exec(sql); const table = m ? m[1] : 'default'; const rows = tables[table] || []; return rows[0] || null; } };
      }
      return { run: () => undefined, all: () => [], get: () => null };
    }
  } as any;
}

export function initViewerDb(dbPath: string) {
  const dir = path.dirname(dbPath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  if (BetterSqlite3) {
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS thumbnails (
        key TEXT PRIMARY KEY,
        thumb BLOB,
        width INTEGER,
        height INTEGER,
        updated_at_utc TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_thumbs_key ON thumbnails(key);
    `);
    return db;
  }
  console.warn('better-sqlite3 not available — using in-memory thumbnail DB fallback');
  return createFallbackDb();
}

export function insertThumbnail(db: any, key: string, buffer: Buffer, width: number, height: number) {
  const insert = db.prepare(`INSERT OR REPLACE INTO thumbnails (key, thumb, width, height, updated_at_utc) VALUES (?, ?, ?, ?, ?)`);
  insert.run(key, buffer, width, height, new Date().toISOString());
}

export function listThumbnails(db: any, limit = 100) {
  const stmt = db.prepare('SELECT key, thumb, width, height, updated_at_utc FROM thumbnails ORDER BY updated_at_utc DESC LIMIT ?');
  return (stmt.all(limit) || []).map((r: any) => ({ key: r.key, width: r.width, height: r.height, updated_at_utc: r.updated_at_utc, thumb: r.thumb }));
}

