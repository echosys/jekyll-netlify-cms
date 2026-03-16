// @ts-nocheck
import { app, BrowserWindow, ipcMain, dialog, globalShortcut } from 'electron';
import * as path from 'path';
import { JobQueue } from './job_queue';
import { BackupManager } from './backup_manager';
import { initViewerDb, insertThumbnail, listThumbnails } from './viewer_db';

let mainWindow: BrowserWindow | null = null;
const jobQueue = new JobQueue();
const backupManager = new BackupManager();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // during dev we might use vite dev server; default to bundled renderer
  const isDev = (process.env.ELECTRON_DEV === '1' || process.env.NODE_ENV === 'development');
  if (isDev) {
    // attempt to load Vite dev server if it's running
    const devUrl = 'http://localhost:5173';
    try {
      // use global fetch (Node 18+) to probe the dev server
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      fetch(devUrl, { method: 'HEAD', signal: controller.signal }).then((res) => {
        clearTimeout(timeout);
        if (res && res.ok) {
          console.log('Loading renderer from Vite dev server:', devUrl);
          mainWindow.loadURL(devUrl);
        } else {
          console.log('Vite dev server not responding; loading packaged renderer');
          mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
        }
        if (isDev) mainWindow.webContents.openDevTools({ mode: 'right' });
      }).catch((err) => {
        clearTimeout(timeout);
        console.log('Error probing dev server, loading packaged renderer', err);
        mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
        if (isDev) mainWindow.webContents.openDevTools({ mode: 'right' });
      });
    } catch (e) {
      console.log('Exception while checking dev server, loading packaged renderer', e);
      mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
      if (isDev) mainWindow.webContents.openDevTools({ mode: 'right' });
    }
    return;
  }

  // production: load the packaged renderer
  mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  // register a dev-only global shortcut to toggle DevTools
  if (process.env.ELECTRON_DEV === '1' || process.env.NODE_ENV === 'development') {
    try {
      const shortcut = process.platform === 'darwin' ? 'Command+Option+I' : 'Control+Alt+I';
      globalShortcut.register(shortcut, () => {
        if (mainWindow) {
          if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools();
          else mainWindow.webContents.openDevTools({ mode: 'right' });
        }
      });
    } catch (e) {
      console.warn('failed to register devtools shortcut', e);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (e) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Minimal IPC handlers
ipcMain.handle('list-backup-targets', async () => {
  return backupManager.listTargets();
});

ipcMain.handle('add-backup-target', async (_event, targetPath: string) => {
  backupManager.addTarget(targetPath);
  return { ok: true };
});

ipcMain.handle('remove-backup-target', async (_event, targetPath: string) => {
  backupManager.removeTarget(targetPath);
  return { ok: true };
});

ipcMain.handle('start-backup', async (_event, jobSpec) => {
  const jobId = jobQueue.enqueue(async (progress, isCancelled) => {
    return backupManager.runBackup(jobSpec, (p: any) => {
      if (mainWindow) mainWindow.webContents.send('backup-progress', p);
    }, isCancelled);
  });
  return { jobId };
});

ipcMain.handle('cancel-backup', async (_event, jobId: number) => {
  try {
    jobQueue.cancel(jobId);
    return { ok: true };
  } catch (e) {
    return { error: String(e) };
  }
});

ipcMain.handle('compute-diff', async (_event, spec) => {
  return backupManager.computeDiff(spec);
});

ipcMain.handle('scan-folder', async (_event, root) => {
  // spawn scanner worker
  const workerPath = path.join(__dirname, 'workers', 'scanner_worker.js');
  jobQueue.enqueueWorker(workerPath, { root }, (m: any) => {
    if (mainWindow) mainWindow.webContents.send('scan-progress', m);
  });
  return { started: true };
});

ipcMain.handle('generate-thumbnails', async (_event, { files, outDir, cacheDbPath }) => {
  const workerPath = path.join(__dirname, 'workers', 'thumbnail_worker.js');
  jobQueue.enqueueWorker(workerPath, { files, outDir }, (m: any) => {
    if (mainWindow) mainWindow.webContents.send('thumbnail-progress', m);
    if (m.type === 'thumb') {
      try {
        // read thumbnail file into buffer and insert into SQLite cache if cacheDbPath provided
        if (cacheDbPath) {
          const db = initViewerDb(cacheDbPath);
          const buffer = require('fs').readFileSync(m.thumb);
          const key = Buffer.from(m.file).toString('hex');
          insertThumbnail(db, key, buffer, 320, 320);
          db.close();
        }
      } catch (e) {
        console.error('failed to write thumb to db', e);
      }
    }
  });
  return { started: true };
});

ipcMain.handle('list-thumbnails', async (_event, cacheDbPath: string, limit = 100) => {
  try {
    const db = initViewerDb(cacheDbPath);
    const rows = listThumbnails(db, limit);
    db.close();
    return rows.map(r => ({ key: r.key, width: r.width, height: r.height, updated_at_utc: r.updated_at_utc, thumbBase64: r.thumb.toString('base64') }));
  } catch (e) {
    return { error: String(e) };
  }
});

ipcMain.handle('open-folder-dialog', async (_event, opts: any) => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'], title: opts && opts.title ? opts.title : 'Select folder' });
  if (res.canceled) return { canceled: true, paths: [] };
  return { canceled: false, paths: res.filePaths };
});
