import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  listBackupTargets: () => ipcRenderer.invoke('list-backup-targets'),
  addBackupTarget: (p: string) => ipcRenderer.invoke('add-backup-target', p),
  removeBackupTarget: (p: string) => ipcRenderer.invoke('remove-backup-target', p),
  computeDiff: (spec: any) => ipcRenderer.invoke('compute-diff', spec),
  startBackup: (jobSpec: any) => ipcRenderer.invoke('start-backup', jobSpec),
  scanFolder: (root: string) => ipcRenderer.invoke('scan-folder', root),
  generateThumbnails: (files: any[], outDir: string, cacheDbPath?: string) => ipcRenderer.invoke('generate-thumbnails', { files, outDir, cacheDbPath }),
  listThumbnails: (cacheDbPath: string, limit?: number) => ipcRenderer.invoke('list-thumbnails', cacheDbPath, limit || 100),
  openFolderDialog: (opts?: any) => ipcRenderer.invoke('open-folder-dialog', opts),
  cancelBackup: (jobId: number) => ipcRenderer.invoke('cancel-backup', jobId),
  onBackupProgress: (cb: (p: any) => void) => ipcRenderer.on('backup-progress', (_e, p) => cb(p)),
  onScanProgress: (cb: (p: any) => void) => ipcRenderer.on('scan-progress', (_e, p) => cb(p)),
  onThumbnailProgress: (cb: (p: any) => void) => ipcRenderer.on('thumbnail-progress', (_e, p) => cb(p))
});
