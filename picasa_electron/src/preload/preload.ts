import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Config & Workspaces
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),

  // Geocoding & EXIF
  reverseGeocode: (lat: number, lon: number) => ipcRenderer.invoke('reverse-geocode', { lat, lon }),
  writeExifLocation: (filePath: string, lat: number, lon: number, location: any) => 
    ipcRenderer.invoke('write-exif-location', { filePath, lat, lon, location }),
  getExif: (filePath: string) => ipcRenderer.invoke('get-exif', filePath),

  // Scanning
  scanFolder: (root: string) => ipcRenderer.invoke('scan-folder', root),
  getScanCache: (root: string) => ipcRenderer.invoke('get-scan-cache', root),
  onScanProgress: (cb: (m: any) => void) => {
    const l = (_e: any, m: any) => cb(m);
    ipcRenderer.on('scan-progress', l);
    return () => ipcRenderer.removeListener('scan-progress', l);
  },

  // Thumbnails
  generateThumbnails: (files: any[], outDir?: string) => ipcRenderer.invoke('generate-thumbnails', { files, outDir }),
  listThumbnails: (cacheDbPath?: string, limit?: number) => ipcRenderer.invoke('list-thumbnails', cacheDbPath, limit || 100),
  onThumbnailProgress: (cb: (p: any) => void) => {
    const l = (_e: any, p: any) => cb(p);
    ipcRenderer.on('thumbnail-progress', l);
    return () => ipcRenderer.removeListener('thumbnail-progress', l);
  },

  // Backup
  listBackupTargets: () => ipcRenderer.invoke('list-backup-targets'),
  addBackupTarget: (p: string) => ipcRenderer.invoke('add-backup-target', p),
  removeBackupTarget: (p: string) => ipcRenderer.invoke('remove-backup-target', p),
  startBackup: (jobSpec: any) => ipcRenderer.invoke('start-backup', jobSpec),
  cancelBackup: (jobId: number) => ipcRenderer.invoke('cancel-backup', jobId),
  computeDiff: (spec: any) => ipcRenderer.invoke('compute-diff', spec),
  listBackupContents: (backupPath: string) => ipcRenderer.invoke('list-backup-contents', backupPath),
  getFolderSize: (folderPath: string) => ipcRenderer.invoke('get-folder-size', folderPath),
  restoreFile: (backupRoot: string, fileRecord: any) => ipcRenderer.invoke('restore-file', { backupRoot, fileRecord }),


  onBackupProgress: (cb: (p: any) => void) => {
    const l = (_e: any, p: any) => cb(p);
    ipcRenderer.on('backup-progress', l);
    return () => ipcRenderer.removeListener('backup-progress', l);
  },

  // Menus
  onMenuAction: (cb: (action: string) => void) => {
    const l = (_e: any, action: string) => cb(action);
    ipcRenderer.on('menu-action', l);
    return () => ipcRenderer.removeListener('menu-action', l);
  },

  // Dialogs
  openFolderDialog: (opts?: any) => ipcRenderer.invoke('open-folder-dialog', opts),

  // Cache
  clearCache: () => ipcRenderer.invoke('clear-cache'),

  // DevTools
  openDevTools: () => ipcRenderer.send('open-devtools')
});
