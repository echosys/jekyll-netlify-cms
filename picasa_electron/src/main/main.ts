import { app, BrowserWindow, ipcMain, dialog, Menu, shell, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { JobQueue } from './job_queue';
import { BackupManager } from './backup_manager';
import { initDb } from './db';
import { GeocoderCache } from './geocoder';
import { exiftool } from 'exiftool-vendored';

let mainWindow: BrowserWindow | null = null;
const jobQueue = new JobQueue();
const backupManager = new BackupManager();
let geocoder: GeocoderCache | null = null;

const HOSTNAME = os.hostname();
const REPO_CONFIG_DIR = path.join(process.cwd(), 'config', HOSTNAME);
const VIEW_CACHE_DB = path.join(process.cwd(), 'cache', HOSTNAME, 'cache.sqlite');
const GEO_CACHE_FILE = path.join(REPO_CONFIG_DIR, 'geocode_cache.json');
const APP_CONFIG_FILE = path.join(REPO_CONFIG_DIR, 'config.json');

let viewerCacheDb: any = null;
function getViewerDb() {
  if (!viewerCacheDb) {
    viewerCacheDb = initDb(VIEW_CACHE_DB);
  }
  return viewerCacheDb;
}

function ensureDirs() {
  if (!fs.existsSync(REPO_CONFIG_DIR)) fs.mkdirSync(REPO_CONFIG_DIR, { recursive: true });
}

function loadConfig() {
  if (fs.existsSync(APP_CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(APP_CONFIG_FILE, 'utf8'));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveConfig(config: any) {
  fs.writeFileSync(APP_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Refresh All',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
             // We can broadcast to renderer to refresh
             mainWindow?.webContents.send('menu-action', 'refresh-all');
          }
        },
        { type: 'separator' },
        { label: 'Exit', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
      ]
    },
    {
      label: 'Folder',
      submenu: [
        {
          label: 'Scan Workspace...',
          click: () => {
             mainWindow?.webContents.send('menu-action', 'add-workspace');
          }
        }
      ]
    },
    {
      label: 'Run',
      submenu: [
        {
          label: 'Dev Console',
          accelerator: 'CmdOrCtrl+Alt+I',
          click: () => {
            if (mainWindow?.webContents.isDevToolsOpened()) {
              mainWindow?.webContents.closeDevTools();
            } else {
              mainWindow?.webContents.openDevTools({ mode: 'right' });
            }
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox({
              title: 'About Picasa Electron',
              message: 'Picasa Electron v0.1.0\nMirroring PyQt6 Build 2026',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Picasa Electron'
  });

  createMenu();

  // Load the built files from dist/renderer
  const indexHtml = path.join(app.getAppPath(), 'dist/renderer/index.html');
  mainWindow.loadFile(indexHtml);
}

app.whenReady().then(() => {
  ensureDirs();
  geocoder = new GeocoderCache(GEO_CACHE_FILE);
  createWindow();

  if (process.env.ELECTRON_DEV === '1') {
    const shortcut = process.platform === 'darwin' ? 'Command+Option+I' : 'Control+Alt+I';
    globalShortcut.register(shortcut, () => {
      if (mainWindow) {
        if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools();
        else mainWindow.webContents.openDevTools({ mode: 'right' });
      }
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Config & Workspaces
ipcMain.handle('get-config', async () => loadConfig());
ipcMain.handle('save-config', async (_, config) => saveConfig(config));

// Geocoding
ipcMain.handle('reverse-geocode', async (_, { lat, lon }) => {
  if (!geocoder) return null;
  return geocoder.reverseGeocode(lat, lon);
});

// DevTools
ipcMain.on('open-devtools', () => {
  if (mainWindow) {
    if (mainWindow.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools();
    else mainWindow.webContents.openDevTools({ mode: 'right' });
  }
});

// EXIF Writing
ipcMain.handle('write-exif-location', async (_, { filePath, lat, lon, location }) => {
  try {
    const userComment = `ASCII\x00\x00\x00${JSON.stringify({ _picasa_location: true, ...location })}`;
    await exiftool.write(filePath, {
      GPSLatitude: lat,
      GPSLatitudeRef: lat >= 0 ? 'N' : 'S',
      GPSLongitude: lon,
      GPSLongitudeRef: lon >= 0 ? 'E' : 'W',
      GPSVersionID: '2.3.0.0',
      UserComment: userComment
    });
    return { ok: true };
  } catch (e) {
    console.error('Failed to write EXIF', e);
    return { error: String(e) };
  }
});


function saveScanResults(root: string, files: any[], isAppend = true) {
  try {
    const db = getViewerDb();
    if (!isAppend) {
       db.prepare('DELETE FROM scan_results WHERE root_path = ?').run(root);
       db.prepare('INSERT OR REPLACE INTO scan_cache (root_path, updated_at_utc) VALUES (?, ?)').run(root, new Date().toISOString());
    }

    const insertResult = db.prepare(`
      INSERT OR REPLACE INTO scan_results 
      (root_path, abs_path, rel_path, size, mtime, ext, type, date_taken, camera, lat, lon, location_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((fs: any[]) => {
      for (const f of fs) {
        insertResult.run(
          root, f.absPath, f.rel, f.size, f.mtime, f.ext, f.type,
          f.dateTaken || null, f.camera || null, f.lat || null, f.lon || null,
          f.location ? JSON.stringify(f.location) : null
        );
      }
    });
    transaction(files);
  } catch (e) {
    console.error('Failed to save scan results', e);
  }
}

// Scanning
ipcMain.handle('scan-folder', async (_event, root) => {
  if (root === '/' || root === 'C:\\') {
    return { error: 'Scanning system root is not allowed' };
  }
  const workerPath = path.join(__dirname, 'workers', 'scanner_worker.js');
  console.log('[Main] Initiating scan for:', root);
  
  try {
    // Clear existing results for this root immediately
    saveScanResults(root, [], false);
    console.log('[Main] Database cleared for:', root);
  } catch (e) {
    console.error('[Main] Failed to clear DB for:', root, e);
  }

  jobQueue.enqueueWorker(workerPath, { root }, (m: any) => {
    if (mainWindow) mainWindow.webContents.send('scan-progress', m);
    if (m.type === 'discovered') {
      console.log(`[Main] Progress: ${m.files.length} more files discovered for ${root}`);
      saveScanResults(root, m.files, true);
    }
    if (m.type === 'exif-update') {
      try {
        const db = getViewerDb();
        const updateStmt = db.prepare('UPDATE scan_results SET date_taken = ?, lat = ?, lon = ?, camera = ?, location_json = ? WHERE abs_path = ?');
        const transaction = db.transaction((updates: any[]) => {
          for (const u of updates) {
            updateStmt.run(u.dateTaken || null, u.lat || null, u.lon || null, u.camera || null, u.location ? JSON.stringify(u.location) : null, u.absPath);
          }
        });
        transaction(m.updates);
      } catch (e) {
         console.error('[Main] Exif update failed:', e);
      }
    }
    if (m.type === 'done') {
      console.log(`[Main] Scan complete for ${root}. Total count: ${m.count}`);
    }
    if (m.type === 'error') {
      console.error(`[Main] Scanner error for ${root}:`, m.error);
    }
  });
  return { started: true };
});

ipcMain.handle('get-scan-cache', async (_, root) => {
  try {
    const db = getViewerDb();
    const rows = db.prepare('SELECT * FROM scan_results WHERE root_path = ?').all(root);
    return rows.map((r: any) => ({
      ...r,
      absPath: r.abs_path,
      rel: r.rel_path,
      dateTaken: r.date_taken,
      location: r.location_json ? JSON.parse(r.location_json) : null
    }));
  } catch (e) {
    return [];
  }
});

// Thumbnails
ipcMain.handle('generate-thumbnails', async (_event, { files, outDir }) => {
  const workerPath = path.join(__dirname, 'workers', 'thumbnail_worker.js');
  const actualOutDir = outDir || path.join(os.tmpdir(), 'picasa-thumbs');
  if (!fs.existsSync(actualOutDir)) fs.mkdirSync(actualOutDir, { recursive: true });
  jobQueue.enqueueWorker(workerPath, { files, outDir: actualOutDir }, (m: any) => {
    if (mainWindow) mainWindow.webContents.send('thumbnail-progress', m);
    if (m.type === 'thumb') {
      try {
        const db = getViewerDb();
        const buffer = fs.readFileSync(m.thumb);
        const insert = db.prepare('INSERT OR REPLACE INTO thumbnails (key, thumb, width, height, updated_at_utc) VALUES (?, ?, ?, ?, ?)');
        insert.run(m.file, buffer, 320, 320, new Date().toISOString());
        // Remove temp thumb to keep cache dir clean
        if (fs.existsSync(m.thumb)) fs.unlinkSync(m.thumb);
      } catch (e) {
        console.error('Failed to write thumb to db', e);
      }
    }
  });
  return { started: true };
});

ipcMain.handle('list-thumbnails', async (_event, dbPath: string, limit = 100) => {
  try {
    const db = getViewerDb();
    const rows = db.prepare('SELECT key, thumb, updated_at_utc FROM thumbnails ORDER BY updated_at_utc DESC LIMIT ?').all(limit);
    return rows.map((r: any) => ({ key: r.key, thumbBase64: r.thumb.toString('base64'), updated_at: r.updated_at_utc }));
  } catch (e) {
    return { error: String(e) };
  }
});

// Dialogs
ipcMain.handle('open-folder-dialog', async (_event, opts: any) => {
  const res = await dialog.showOpenDialog({ 
    properties: ['openDirectory', 'multiSelections'], 
    title: opts?.title || 'Select folder' 
  });
  return { canceled: res.canceled, filePaths: res.filePaths };
});

// Backup (Redirect to BackupManager)
ipcMain.handle('list-backup-targets', async () => backupManager.listTargets());
ipcMain.handle('add-backup-target', async (_, p) => { backupManager.addTarget(p); return { ok: true }; });
ipcMain.handle('remove-backup-target', async (_, p) => { backupManager.removeTarget(p); return { ok: true }; });
ipcMain.handle('start-backup', async (_, jobSpec) => {
  const jobId = jobQueue.enqueue(async (progress, isCancelled) => {
    return backupManager.runBackup(jobSpec, (p: any) => {
      if (mainWindow) mainWindow.webContents.send('backup-progress', p);
    }, isCancelled);
  });
  return { jobId };
});
ipcMain.handle('cancel-backup', async (_, id) => { jobQueue.cancel(id); return { ok: true }; });
ipcMain.handle('compute-diff', async (_, spec) => backupManager.computeDiff(spec));
