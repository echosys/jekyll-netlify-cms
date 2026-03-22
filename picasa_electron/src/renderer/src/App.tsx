import React, { useEffect, useState, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { FolderView } from './components/FolderView';
import { TimelineView } from './components/TimelineView';
import { MapView } from './components/MapView';
import { PreviewDialog } from './components/PreviewDialog';
import { HardDrive, Calendar, MapPin, Shield, Search, Loader2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

type TabMode = 'folder' | 'timeline' | 'map' | 'backup';

interface Workspace {
  id: string;
  name: string;
  path: string;
  active: boolean;
}

const App: React.FC = () => {
  const [tab, setTab] = useState<TabMode>('folder');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [backupTargets, setBackupTargets] = useState<string[]>([]);
  const [backupJobId, setBackupJobId] = useState<number | null>(null);
  const [backupProgress, setBackupProgress] = useState<any>(null);
  const [computeSha, setComputeSha] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<any | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [photoOnly, setPhotoOnly] = useState(true);

  const api = (window as any).api;

  const onAddWorkspace = async () => {
    const res = await api.openFolderDialog({ title: 'Select Workspace Folder' });
    if (res && !res.canceled) {
      const path = res.filePaths[0];
      const newWs = { id: Date.now().toString(), name: path.split(/[\\/]/).pop() || path, path, active: true };
      const updated = [...workspaces, newWs];
      setWorkspaces(updated);
      await api.saveConfig({ workspaces: updated, backupTargets });
      // Trigger scan for the new workspace
      api.scanFolder(newWs.path);
      setIsScanning(true);
    }
  };

  const onRemoveWorkspace = async (path: string) => {
    const updated = workspaces.filter(ws => ws.path !== path);
    setWorkspaces(updated);
    setPhotos(prev => prev.filter(p => !p.absPath.startsWith(path)));
    await api.saveConfig({ workspaces: updated, backupTargets });
  };

  const onToggleWorkspace = async (path: string) => {
    const updated = workspaces.map(ws => ws.path === path ? { ...ws, active: !ws.active } : ws);
    setWorkspaces(updated);
    await api.saveConfig({ workspaces: updated, backupTargets });
  };

  const onSaveLocation = async (photo: any, lat: number, lon: number, location: any) => {
    const res = await api.writeExifLocation(photo.absPath, lat, lon, location);
    if (res.ok) {
       setPhotos(prev => prev.map(p => p.absPath === photo.absPath ? { ...p, lat, lon, location } : p));
       setPreviewPhoto({ ...photo, lat, lon, location });
    } else {
       alert('Failed to save location to EXIF: ' + res.error);
    }
  };

  useEffect(() => {
    const init = async () => {
      const config = await api.getConfig();
      if (config.workspaces) {
        setWorkspaces(config.workspaces);
        // Load from cache instead of scanning
        config.workspaces.filter((w: any) => w.active).forEach(async (w: any) => {
          const cached = await api.getScanCache(w.path);
          if (cached && cached.length > 0) {
            setPhotos(prev => {
              const next = [...prev, ...cached];
              return Array.from(new Map(next.map(p => [p.absPath, p])).values());
            });
            api.generateThumbnails(cached);
          } else {
            // Auto-scan if cache is empty
            api.scanFolder(w.path);
            setIsScanning(true);
          }
        });
      }
      if (config.backupTargets) setBackupTargets(config.backupTargets || []);
      const targets = await api.listBackupTargets();
      
      // Load thumbnails from consolidated DB
      const dbThumbs = await api.listThumbnails('', 1000);
      if (dbThumbs && !dbThumbs.error) {
        setThumbnails(prev => {
           const map: Record<string, string> = { ...prev };
           dbThumbs.forEach((t: any) => { map[t.key] = t.thumbBase64; });
           return map;
        });
      }
    };
    init();

    // Wire native menu listeners ONCE
    const unMenu = api.onMenuAction?.((action: string) => {
      if (action === 'add-workspace') onAddWorkspace();
      if (action === 'refresh-all') {
        // Refresh with latest ref values
        (async () => {
           const config = await api.getConfig();
           config.workspaces?.filter((w: any) => w.active).forEach((w: any) => api.scanFolder(w.path));
           setIsScanning(true);
        })();
      }
    });

    const unScan = api.onScanProgress?.((m: any) => {
      if (m.type === 'status') setScanStatus(m.message);
      if (m.type === 'progress') {
        setScanStatus(`Processing metadata: ${m.count}${m.total ? ' of ' + m.total : ''}`);
      }
      if (m.type === 'discovered') {
        setPhotos(prev => [...prev, ...m.files]);
        api.generateThumbnails(m.files);
      }
      if (m.type === 'exif-update') {
        setPhotos(prev => {
           const updates = new Map(m.updates.map((u: any) => [u.absPath, u]));
           return prev.map(p => {
             const u = updates.get(p.absPath);
             return u ? { ...p, ...u } : p;
           });
        });
      }
      if (m.type === 'done') {
        setIsScanning(false);
        setScanStatus('');
        // Perform final deduplication just in case
        setPhotos(prev => Array.from(new Map(prev.map(p => [p.absPath, p])).values()));
      }
    });

    const unThumb = api.onThumbnailProgress?.((m: any) => {
      if (m.type === 'thumb') {
        setThumbnails(prev => ({ ...prev, [m.file]: m.thumbBase64 || '' }));
      }
    });

    const unBackup = api.onBackupProgress?.((p: any) => setBackupProgress(p));
    
    return () => {
       unMenu?.(); unScan?.(); unThumb?.(); unBackup?.();
    }
  }, []); // Run once on mount!

  const filteredPhotos = useMemo(() => {
    if (!searchQuery) return photos;
    const q = searchQuery.toLowerCase();
    return photos.filter(p => 
      p.rel.toLowerCase().includes(q) || 
      p.location?.city?.toLowerCase().includes(q) || 
      p.location?.state?.toLowerCase().includes(q) || 
      p.location?.country?.toLowerCase().includes(q)
    );
  }, [photos, searchQuery]);

  const activePhotos = useMemo(() => {
    let filtered = filteredPhotos.filter(p => workspaces.find(ws => p.absPath.startsWith(ws.path))?.active);
    if (photoOnly) {
      filtered = filtered.filter(p => {
        if (p.type === 'image' || p.type === 'video') return true;
        // Fallback for old cache data without type
        if (!p.type) {
           const ext = p.absPath.split('.').pop()?.toLowerCase();
           const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp', 'heic', 'heif'];
           const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg'];
           if (IMAGE_EXTENSIONS.includes(ext || '')) return true;
           if (VIDEO_EXTENSIONS.includes(ext || '')) return true;
        }
        return false;
      });
    }
    return filtered;
  }, [filteredPhotos, workspaces, photoOnly]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-dark text-white select-none">
      
      {/* Main Container: 3 Columns */}
      <div className="flex flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'row' }}>
        
        {/* Left Panel (10%) */}
        <aside 
          className="bg-dark flex flex-col" 
          style={{ flex: '0 0 10%', minWidth: '160px', display: 'flex', flexDirection: 'column' }}
        >
          <div className="flex-1 overflow-hidden">
            <Sidebar 
              workspaces={workspaces} 
              onAddWorkspace={onAddWorkspace} 
              onRemoveWorkspace={onRemoveWorkspace}
              onToggleWorkspace={onToggleWorkspace}
              photoOnly={photoOnly}
              setPhotoOnly={setPhotoOnly}
            />
          </div>
        </aside>

        <div className="divider-y" />

        {/* Middle Area (80%) */}
        <div className="flex flex-col flex-1 bg-main-panel overflow-hidden" style={{ flex: '1 1 80%' }}>
          
          {/* Top Integrated Nav */}
          <nav className="h-[44px] grid grid-cols-[1fr_auto_1fr] items-center px-6 border-b bg-navbar overflow-hidden">
            {/* Left: Search */}
            <div className="flex items-center">
               <div className="relative">
                 <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white-20" />
                 <input 
                   className="pl-9 w-[180px] bg-black-40 border-b h-[26px] text-xs rounded-sm outline-none border-none focus:bg-black-60 transition-all font-medium" 
                   placeholder="Filter photos..." 
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                 />
               </div>
            </div>

            {/* Center: Tabs */}
            <div className="flex justify-center p-0.5 px-4">
              <div className="flex items-center bg-black/40 p-0.5 rounded-md">
                 <div className={`picasa-tab ${tab === 'folder' ? 'active' : ''}`} onClick={() => setTab('folder')}><HardDrive size={12} /> Folder</div>
                 <div className={`picasa-tab ${tab === 'timeline' ? 'active' : ''}`} onClick={() => setTab('timeline')}><Calendar size={12} /> Timeline</div>
                 <div className={`picasa-tab ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}><MapPin size={12} /> Map</div>
                 <div className={`picasa-tab ${tab === 'backup' ? 'active' : ''}`} onClick={() => setTab('backup')}><Shield size={12} /> Backup</div>
              </div>
            </div>

            {/* Right: Empty Spacer */}
            <div className="flex justify-end" />
          </nav>

          {/* Content Area */}
          <main className="flex-1 relative overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div 
                key={tab}
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                transition={{ duration: 0.1 }}
                className="h-full w-full overflow-hidden"
              >
                {tab === 'folder' && <FolderView workspaces={workspaces} photos={activePhotos} onPhotoClick={setPreviewPhoto} thumbnails={thumbnails} photoOnly={photoOnly} />}
                {tab === 'timeline' && <TimelineView photos={activePhotos} onPhotoClick={setPreviewPhoto} thumbnails={thumbnails} />}
                {tab === 'map' && <MapView photos={activePhotos} onPhotoClick={setPreviewPhoto} thumbnails={thumbnails} />}
                {tab === 'backup' && (
                  <div className="p-10 h-full overflow-y-auto">
                      <h2 className="text-xl font-bold mb-2">Backup Summary</h2>
                      <p className="text-md text-white-40 mb-10">Select files and start backup from the right panel.</p>
                      
                      <div className="p-10 rounded-lg border bg-black-40 max-w-[800px]">
                         <div className="flex gap-20 items-center mb-8">
                            <div>
                               <div className="backup-stat-val text-xl">{activePhotos.length}</div>
                               <div className="backup-stat-lab">Files Selected</div>
                            </div>
                            <div className="w-[1px] h-10 bg-white-10" />
                            <div>
                               <div className="backup-stat-val text-xl">{(activePhotos.reduce((s, p) => s + (p.size || 0), 0) / 1024 / 1024).toFixed(1)} MB</div>
                               <div className="backup-stat-lab">Total Size</div>
                            </div>
                         </div>
                         
                         {backupJobId && (
                           <div className="mt-8 pt-6 border-t">
                              <div className="flex justify-between text-xs mb-3 text-white-60 font-bold uppercase tracking-wider">
                                 <span>Backing up...</span>
                                 <span>{backupProgress ? `${backupProgress.percent.toFixed(1)}%` : '0%'}</span>
                              </div>
                              <div className="h-2.5 bg-white-10 rounded-full overflow-hidden">
                                 <div 
                                   className="h-full bg-accent transition-all duration-300 shadow-[0_0_10px_rgba(31,111,235,0.4)]"
                                   style={{ width: `${backupProgress ? backupProgress.percent : 0}%` }}
                                 />
                              </div>
                           </div>
                         )}
                      </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        <div className="divider-y" />

        {/* Right Panel (10%) */}
        <aside 
          className="bg-dark flex flex-col" 
          style={{ flex: '0 0 10%', minWidth: '200px', display: 'flex', flexDirection: 'column' }}
        >
           <div className="p-4 border-b h-[44px] flex items-center justify-between">
              <span className="text-xs font-black text-white-30 uppercase tracking-tightest">Targets</span>
              <button onClick={() => (window as any).api.openFolderDialog({ title: 'Add Backup Target' }).then((res: any) => { if(!res.canceled) (window as any).api.addBackupTarget(res.filePaths[0]).then(() => (window as any).api.listBackupTargets().then(setBackupTargets)) })} className="text-accent py-1 px-2 text-xs rounded transition-colors bg-white-10 hover:bg-white-20">
                <Shield size={12} />
              </button>
           </div>
           
           <div className="flex flex-1 flex-col gap-3 p-4 overflow-y-auto">
              {backupTargets.map(target => (
                <div key={target} className="p-3 rounded-md bg-black-40 border text-sm relative group hover:bg-black-60 transition-all">
                   <div className="truncate pr-5 font-medium" title={target}>{target.split(/[\\/]/).pop()}</div>
                   <button 
                     onClick={async () => { await api.removeBackupTarget(target); setBackupTargets(await api.listBackupTargets()); }}
                     className="absolute top-3 right-2 opacity-0 group-hover:opacity-100 text-white-40 hover:text-red-400 transition-all border-none bg-transparent"
                   >
                     <X size={12} />
                   </button>
                </div>
              ))}
              {backupTargets.length === 0 && <div className="text-sm text-white-20 italic p-2">No targets added.</div>}

              <div className="mt-auto flex flex-col gap-4 pt-4 border-t border-white-10">
                 <div className="flex items-center gap-3 text-sm text-white-60">
                    <input type="checkbox" checked={computeSha} onChange={e => setComputeSha(e.target.checked)} id="sha-check" className="w-4 h-4 rounded-sm" />
                    <label htmlFor="sha-check" className="font-semibold cursor-pointer">Verify Hashing</label>
                 </div>
                 
                 {!backupJobId ? (
                   <button 
                     onClick={async () => {
                       const filesPayload = activePhotos.map(p => ({ absPath: p.absPath, rel: p.rel, driveName: p.driveName, size: p.size, mtime: p.mtime }));
                       const firstTarget = backupTargets[0];
                       if (firstTarget) {
                         const job = await api.startBackup({ files: filesPayload, backupRoot: firstTarget, computeSha256: computeSha });
                         if (job?.jobId) setBackupJobId(job.jobId);
                       } else {
                         alert('Add a backup target first.');
                       }
                     }}
                     className="w-full bg-accent text-white py-3 rounded-md text-sm font-black uppercase tracking-widest transition-all hover:brightness-110 active:scale-95"
                   >
                     Start Backup
                   </button>
                 ) : (
                   <button 
                     onClick={async () => { await api.cancelBackup(backupJobId); setBackupJobId(null); }}
                     className="w-full bg-red-500/10 text-red-500 py-3 rounded-md text-sm font-black uppercase tracking-widest transition-all border border-red-500/30 hover:bg-red-500/20"
                   >
                     Cancel
                   </button>
                 )}
              </div>
           </div>
        </aside>

      </div>

      {/* Footer / Status Bar (Full Width) */}
      <footer className="h-[28px] bg-navbar border-t px-8 grid grid-cols-[1fr_auto_1fr] items-center text-xs text-white-30 uppercase tracking-tightest font-bold overflow-hidden">
        <div className="flex items-center gap-6">
           <span className="text-white-40 whitespace-nowrap">{activePhotos.length} Items Selected</span>
        </div>
        
        <div className="flex items-center justify-center min-w-[300px]">
           {isScanning ? (
             <span className="flex items-center gap-2 text-accent truncate max-w-[400px]">
               <Loader2 size={12} className="animate-spin" /> {scanStatus}
             </span>
           ) : (
             <span className="opacity-40 whitespace-nowrap">System Ready</span>
           )}
        </div>

        <div className="flex items-center justify-end gap-6">
           <span className="whitespace-nowrap">Engine v0.1.0</span>
           <div className="w-[1px] h-3 bg-white-10" />
           <span className="text-white-20 whitespace-nowrap">© 2026 Mirror builds</span>
        </div>
      </footer>

      {/* Preview Dialog */}
      <AnimatePresence>
        {previewPhoto && (
          <PreviewDialog 
            photo={previewPhoto} 
            allPhotos={activePhotos} 
            onClose={() => setPreviewPhoto(null)} 
            onNavigate={(index) => setPreviewPhoto(activePhotos[index])}
            onSaveLocation={onSaveLocation}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;
