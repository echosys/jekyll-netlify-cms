const fs = require('fs');
const path = require('path');
const { BackupManager } = require('../dist/main/backup_manager.js' /* compiled path; fallback implemented below */);

async function run() {
  // create temp source dir
  const tmpSrc = path.join(__dirname, 'tmp_src');
  const tmpDst = path.join(__dirname, 'tmp_backup');
  fs.rmSync(tmpSrc, { recursive: true, force: true });
  fs.rmSync(tmpDst, { recursive: true, force: true });
  fs.mkdirSync(tmpSrc, { recursive: true });
  fs.mkdirSync(tmpDst, { recursive: true });

  // create small files
  for (let i=0;i<5;i++) {
    fs.writeFileSync(path.join(tmpSrc, `file${i}.txt`), 'hello ' + i);
  }

  // require the TS source if dist not present
  let Manager;
  try { Manager = require('../dist/main/backup_manager.js').BackupManager; } catch (e) { Manager = require('../src/main/backup_manager.ts').BackupManager; }
  const mgr = new Manager();

  const files = fs.readdirSync(tmpSrc).map(f => ({ absPath: path.join(tmpSrc, f), rel: f, driveName: 'tmp_src', size: fs.statSync(path.join(tmpSrc,f)).size, mtime: Math.floor(fs.statSync(path.join(tmpSrc,f)).mtimeMs) }));

  const res = await mgr.runBackup({ files, backupRoot: tmpDst }, (p)=>console.log('progress', p));
  console.log('done', res);
}

run().catch(e=>console.error(e));

