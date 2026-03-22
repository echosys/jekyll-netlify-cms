import * as fs from 'fs';
import * as path from 'path';
import { initDb } from './db';
import { ArchiveWriter } from './archive_writer';
import { Worker } from 'worker_threads';
import * as crypto from 'crypto';
import * as os from 'os';
import * as util from 'util';

const CONFIG_DIR = path.join(process.cwd(), 'config');
const TARGETS_FILE = path.join(CONFIG_DIR, 'backup_targets.json');

function ensureConfigDir() {
  try { fs.mkdirSync(CONFIG_DIR, { recursive: true }); } catch (e) { }
}

async function computeFileSha256(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = require('fs').createReadStream(filePath);
    rs.on('error', reject);
    rs.on('data', (chunk: Buffer) => hash.update(chunk));
    rs.on('end', () => resolve(hash.digest('hex')));
  });
}

async function getVolumeFingerprint(somePath: string) {
  try {
    const st = fs.statSync(somePath);
    if (st && (st as any).dev) {
      return `dev_${(st as any).dev}`;
    }
  } catch (e) {
    // ignore
  }
  // fallback: sample a few entries at root and hash names + sizes
  try {
    const entries = fs.readdirSync(somePath, { withFileTypes: true }).slice(0, 20);
    const h = crypto.createHash('sha256');
    for (const e of entries) {
      h.update(e.name + '|' + (e.isDirectory() ? 'd' : 'f'));
    }
    return `hash_${h.digest('hex').slice(0,12)}`;
  } catch (e) {
    return `unknown_${path.basename(somePath)}`;
  }
}

export class BackupManager {
  constructor() {
    ensureConfigDir();
    if (!fs.existsSync(TARGETS_FILE)) fs.writeFileSync(TARGETS_FILE, JSON.stringify([]));
  }

  listTargets() {
    try { return JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8')); } catch (e) { return []; }
  }

  addTarget(p: string) {
    const list = this.listTargets();
    if (!list.includes(p)) list.push(p);
    fs.writeFileSync(TARGETS_FILE, JSON.stringify(list, null, 2));
  }

  removeTarget(p: string) {
    let list = this.listTargets();
    list = list.filter((x: string) => x !== p);
    fs.writeFileSync(TARGETS_FILE, JSON.stringify(list, null, 2));
  }

  async computeDiff(spec: any) {
    // spec: { files: [{ absPath, rel, driveName, size, mtime }], backupRoot }
    const { files, backupRoot } = spec || {};
    if (!backupRoot) return { error: 'backupRoot required' };
    const dbPath = path.join(backupRoot, 'backup_metadata.sqlite');
    if (!fs.existsSync(dbPath)) {
      return { newFiles: files || [], modified: [], identical: [], deleted: [] };
    }

    // compute volume fingerprints for current mounts (so drive letters that changed map to same fingerprint)
    const driveFingerprintMap: Record<string,string> = {};
    for (const f of files || []) {
      if (!driveFingerprintMap[f.driveName]) {
        try {
          const p = path.parse(f.absPath).root || path.dirname(f.absPath);
          // eslint-disable-next-line no-await-in-loop
          driveFingerprintMap[f.driveName] = await getVolumeFingerprint(p);
        } catch (e) {
          driveFingerprintMap[f.driveName] = f.driveName;
        }
      }
    }

    const db = initDb(dbPath);
    try {
      const last = db.prepare('SELECT id FROM backups ORDER BY id DESC LIMIT 1').get();
      if (!last) return { newFiles: files || [], modified: [], identical: [], deleted: [] };
      const backupId = last.id;
      const rows = db.prepare('SELECT rel_path, size, mtime, sha256 FROM files WHERE backup_id = ?').all(backupId);
      const map = new Map();
      const mapRelOnly = new Map();
      for (const r of rows) {
        map.set(r.rel_path, r);
        // also index by trailing rel path (strip leading volume prefix)
        const parts = r.rel_path.split('/');
        const trailing = parts.slice(1).join('/');
        if (!mapRelOnly.has(trailing)) mapRelOnly.set(trailing, r);
      }

      const newFiles: any[] = [];
      const modified: any[] = [];
      const identical: any[] = [];

      for (const f of files || []) {
        const volId = driveFingerprintMap[f.driveName] || f.driveName;
        const nameInArchive = `${volId}/${f.rel}`.replace(/\\/g, '/');
        let existing = map.get(nameInArchive);
        let matchedVia = 'vol';
        if (!existing) {
          // fallback: try matching by trailing rel only (ignore drive prefix)
          const trailing = f.rel.replace(/\\/g, '/');
          existing = mapRelOnly.get(trailing);
          if (existing) matchedVia = 'rel-only';
        }
        if (!existing) {
          newFiles.push(f);
        } else {
          if (Number(existing.size) === Number(f.size) && Number(existing.mtime) === Number(f.mtime)) {
            identical.push({ file: f, matchedVia });
          } else {
            modified.push({ file: f, existing, matchedVia });
          }
          // remove from maps so remaining map entries are 'deleted'
          // prefer to delete the exact key if we matched via vol, otherwise delete the stored key
          if (matchedVia === 'vol') map.delete(nameInArchive);
          else {
            // delete the stored key for this existing row
            for (const key of map.keys()) {
              if (map.get(key) === existing) { map.delete(key); break; }
            }
            // also remove from mapRelOnly
            const parts = (existing.rel_path || '').split('/');
            const trailing = parts.slice(1).join('/');
            mapRelOnly.delete(trailing);
          }
        }
      }

      const deleted: any[] = [];
      for (const [rel, r] of map.entries()) {
        deleted.push(r);
      }

      return { newFiles, modified, identical, deleted };
    } finally {
      try { db.close(); } catch (e) {}
    }
  }

  async runBackup(jobSpec: { files: any[], backupRoot: string }, progressCallback: (p: any) => void, isCancelled?: ()=>boolean) {
    const { files, backupRoot } = jobSpec;
    fs.mkdirSync(path.join(backupRoot, 'archives'), { recursive: true });
    fs.mkdirSync(path.join(backupRoot, 'thumbnails'), { recursive: true });

    // move any .tmp files to incomplete for forensics
    const archivesDir = path.join(backupRoot, 'archives');
    if (fs.existsSync(archivesDir)) {
      const names = fs.readdirSync(archivesDir || '.');
      for (const n of names) {
        if (n.endsWith('.tmp')) {
          const src = path.join(archivesDir, n);
          const dstDir = path.join(archivesDir, 'incomplete');
          fs.mkdirSync(dstDir, { recursive: true });
          const dst = path.join(dstDir, n);
          try { fs.renameSync(src, dst); } catch (e) { }
        }
      }
    }

    const dbPath = path.join(backupRoot, 'backup_metadata.sqlite');
    const db = initDb(dbPath);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const baseName = `backup_${timestamp}`;

    // compute volume fingerprints for drives present in files list
    const driveFingerprintMap: Record<string,string> = {};
    for (const f of files) {
      if (!driveFingerprintMap[f.driveName]) {
        const p = path.parse(f.absPath).root || path.dirname(f.absPath);
        driveFingerprintMap[f.driveName] = await getVolumeFingerprint(p);
      }
    }

    // Insert backup entry first (parts_json updated after we finalize)
    const insertBackup = db.prepare('INSERT INTO backups (name, timestamp_utc, settings_json, parts_json, created_by) VALUES (?, ?, ?, ?, ?)');
    const info = insertBackup.run(baseName, new Date().toISOString(), JSON.stringify({}), JSON.stringify([]), 'electron-backup');
    const backupId = info.lastInsertRowid;

    const writer = new ArchiveWriter({ backupRoot, baseName, maxPartSizeBytes: 10 * 1024 * 1024 * 1024 });

    // Prepare files insert (batched)
    const insertFile = db.prepare(`INSERT INTO files (backup_id, original_path, rel_path, size, mtime, sha256, archive_part, archive_offset, crc32, added_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertMany = db.transaction((rows: any[]) => {
      for (const r of rows) insertFile.run(r.backup_id, r.original_path, r.rel_path, r.size, r.mtime, r.sha256 || null, r.archive_part, r.archive_offset || null, r.crc32 || null, r.added_at_utc);
    });

    const batch: any[] = [];
    const BATCH_SIZE = 100; // commit more frequently for safer resume
    let filesAdded = 0;
    const partsWritten: any[] = [];

    const computeHashes = !!(jobSpec as any).computeSha256;

    for (const f of files) {
      if (isCancelled && isCancelled()) {
        // finish current part and stop
        break;
      }
      // f is expected to have: absPath, rel, driveName, size, mtime
      let sha = null;
      if (computeHashes) {
        try {
          sha = await computeFileSha256(f.absPath);
        } catch (e) {
          console.warn('sha256 failed for', f.absPath, e);
          sha = null;
        }
      }
      const volId = driveFingerprintMap[f.driveName] || f.driveName;
      const nameInArchive = `${volId}/${f.rel}`.replace(/\\/g, '/');
      const part = await writer.addFile(f.absPath, nameInArchive);
      filesAdded++;
      progressCallback({ filesAdded, currentPart: part });

      // immediate insert for safer resume (also batch up for performance)
      batch.push({ backup_id: backupId, original_path: f.absPath, rel_path: nameInArchive, size: f.size, mtime: f.mtime, sha256: sha, archive_part: part, archive_offset: null, crc32: null, added_at_utc: new Date().toISOString() });
      if (batch.length >= BATCH_SIZE) {
        insertMany(batch.splice(0, batch.length));
      }

      // track parts
      if (!partsWritten.includes(part)) partsWritten.push(part);
    }

    if (batch.length > 0) insertMany(batch);

    // finalize writer (close current part). If we were cancelled, writer should be closed safely.
    await writer.close();

    // mark backup status as cancelled if needed
    if (isCancelled && isCancelled()) {
      try {
        const upd = db.prepare('UPDATE backups SET settings_json = COALESCE(settings_json, ?), parts_json = COALESCE(parts_json, ?), created_by = COALESCE(created_by, ?) WHERE id = ?');
        upd.run(JSON.stringify({ cancelled: true }), JSON.stringify([]), 'electron-backup', backupId);
      } catch (e) { }
    }

    // spawn thumbnail worker to generate thumbnails for files and insert into backup DB
    try {
      const thumbWorkerPath = path.join(__dirname, 'workers', 'thumbnail_worker.js');
      const thumbOutDir = path.join(backupRoot, 'thumbnails');
      const worker = new Worker(thumbWorkerPath, { workerData: { files: files.map(f => ({ path: f.absPath })), outDir: thumbOutDir } });
      worker.on('message', (m: any) => {
        if (m.type === 'thumb') {
          try {
            const dbThumb = initDb(dbPath);
            const buffer = require('fs').readFileSync(m.thumb);
            const insert = dbThumb.prepare('INSERT OR REPLACE INTO thumbnails (key, thumb, width, height, updated_at_utc) VALUES (?, ?, ?, ?, ?)');
            insert.run(m.file, buffer, 320, 320, new Date().toISOString());
            dbThumb.close();
          } catch (e) {
            console.error('failed to insert thumb into backup db', e);
          }
        }
      });
      worker.on('error', (e: any) => console.error('thumbnail worker error', e));
      worker.on('exit', (code: number) => {
        if (code !== 0) console.error('thumbnail worker exited with', code);
      });
    } catch (e) {
      console.error('failed to start thumbnail worker', e);
    }

    // update backups.parts_json with actual parts info
    const partsInfo = partsWritten.map(pn => ({ file: path.join('archives', pn), size: fs.existsSync(path.join(backupRoot, 'archives', pn)) ? fs.statSync(path.join(backupRoot, 'archives', pn)).size : 0 }));
    const updateBackup = db.prepare('UPDATE backups SET parts_json = ? WHERE id = ?');
    updateBackup.run(JSON.stringify(partsInfo), backupId);

    const updateStatus = db.prepare('UPDATE backups SET status = ? WHERE id = ?');
    if (isCancelled && isCancelled()) {
      updateStatus.run('cancelled', backupId);
    } else {
      updateStatus.run('completed', backupId);
    }

    db.close();

    return { filesAdded, parts: partsInfo };
  }
}
