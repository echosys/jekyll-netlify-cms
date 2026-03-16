const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');

function getDriveName(root) {
  if (process.platform === 'win32') {
    const p = path.parse(root);
    if (p.root && p.root.length > 0) return p.root.replace(':\\', ':').replace('\\', '');
    return p.root || path.basename(root);
  }
  // On POSIX use the basename of the mount point or the root folder name
  return path.basename(root) || root;
}

function scanFolder(root) {
  const results = [];
  function walk(dir) {
    const names = fs.readdirSync(dir);
    for (const n of names) {
      const p = path.join(dir, n);
      try {
        const st = fs.statSync(p);
        if (st.isFile()) results.push({ path: p, size: st.size, mtime: st.mtimeMs });
        else if (st.isDirectory()) walk(p);
      } catch (e) {
        // ignore unreadable files
      }
    }
  }
  walk(root);
  return results;
}

const root = workerData.root;
const driveName = getDriveName(root);
const files = scanFolder(root).map(f => ({
  absPath: f.path,
  size: f.size,
  mtime: Math.floor(f.mtime),
  rel: path.relative(root, f.path).split(path.sep).join('/'),
  driveName
}));
parentPort.postMessage({ type: 'done', files });
