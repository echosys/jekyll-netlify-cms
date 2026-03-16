// Simple diff between source files and backup records (by rel_path or sha256)
function computeDiff(sources, backups, opts = { byHash: false }) {
  const res = { newFiles: [], modified: [], identical: [], skipped: [] };
  const backupByRel = new Map();
  const backupByHash = new Map();
  for (const b of backups) {
    if (b.rel_path) backupByRel.set(b.rel_path, b);
    if (b.sha256) backupByHash.set(b.sha256, b);
  }
  for (const s of sources) {
    const rel = s.rel_path;
    const hash = s.sha256;
    const b = opts.byHash && hash ? backupByHash.get(hash) : backupByRel.get(rel);
    if (!b) res.newFiles.push(s);
    else {
      if ((s.mtime || 0) !== (b.mtime || 0) || (s.size || 0) !== (b.size || 0)) res.modified.push({ source: s, backup: b });
      else res.identical.push(s);
    }
  }
  return res;
}

module.exports = { computeDiff };

