import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { FolderView } from './components/FolderView';
import { TimelineView } from './components/TimelineView';
import { MapView } from './components/MapView';
import { PreviewDialog } from './components/PreviewDialog';
import { HardDrive, Calendar, MapPin, Shield, Search, Loader2, X, Database, Archive, Folder } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { BackupView } from './components/BackupView';
import { BUViewer } from './components/BUViewer';

type TabMode = 'folder' | 'timeline' | 'map' | 'backup' | 'bu_viewer';

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
  const [selectedBackupPath, setSelectedBackupPath] = useState<string | null>(null);
  const [lastSource, setLastSource] = useState<string>('');
  const [lastDest, setLastDest] = useState<string>('');
  const [sortMode, setSortMode] = useState<'creation' | 'modified' | 'size' | 'location'>('creation');

  const [leftPanelWidth, setLeftPanelWidth] = useState(240);
  const [rightPanelWidth, setRightPanelWidth] = useState(280);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const api = (window as any).api;

  useEffect(() => {
    if (isResizingLeft || isResizingRight) {
      const onMove = (e: MouseEvent) => {
        if (isResizingLeft) {
          const minW = 100;
          const maxW = window.innerWidth * 0.4;
          const newWidth = e.clientX;
          if (newWidth > minW && newWidth < maxW) {
            setLeftPanelWidth(newWidth);
          }
        } else if (isResizingRight) {
          const minW = 100;
          const maxW = window.innerWidth * 0.4;
          const newWidth = window.innerWidth - e.clientX;
          if (newWidth > minW && newWidth < maxW) {
            setRightPanelWidth(newWidth);
          }
        }
      };
      const onUp = () => {
        setIsResizingLeft(false);
        setIsResizingRight(false);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
    }
    return undefined;
  }, [isResizingLeft, isResizingRight]);

  useEffect(() => {
    if (!isResizingLeft && !isResizingRight) {
      api.getConfig().then((c: any) => api.saveConfig({ ...c, rightPanelWidth, leftPanelWidth }));
    }
  }, [isResizingLeft, isResizingRight, leftPanelWidth, rightPanelWidth, api]);





  useEffect(() => {
    const init = async () => {
      const config = await api.getConfig();
      setWorkspaces(config.workspaces || []);
      setComputeSha(config.computeSha || false);
      if (config.lastSource) setLastSource(config.lastSource);
      if (config.lastDest) setLastDest(config.lastDest);
      if (config.rightPanelWidth) {
        setRightPanelWidth(Math.max(150, Math.min(600, config.rightPanelWidth)));
      }
      if (config.leftPanelWidth) {
        setLeftPanelWidth(Math.max(150, Math.min(450, config.leftPanelWidth)));
      }

      const targets = await api.listBackupTargets();
      setBackupTargets(targets);

      // Load initial photos from active workspaces
      const allPhotos: any[] = [];
      const activeWs = (config.workspaces || []).filter((ws: any) => ws.active);
      for (const ws of activeWs) {
        try {
          const files = await api.getScanCache(ws.path);
          if (files) allPhotos.push(...files);
        } catch (e) { console.error('Failed to load cache for', ws.path, e); }
      }
      setPhotos(allPhotos);

      const thumbnailsData = await api.listThumbnails('', 10000);
      if (Array.isArray(thumbnailsData)) {
        const thumbMap: Record<string, string> = {};
        thumbnailsData.forEach((t: any) => {
          thumbMap[t.key] = `data:image/jpeg;base64,${t.thumbBase64}`;
        });
        setThumbnails(thumbMap);
      }
    };

    init();

    const unMenu = api.onMenuAction?.((action: string) => {
      if (action === 'add-workspace') onAddWorkspace();
    });

    const unScan = api.onScanProgress?.((m: any) => {
      if (m.type === 'discovered') {
        setPhotos(prev => {
          const newPhotos = [...prev];
          m.files.forEach((f: any) => {
            if (!newPhotos.find(p => p.absPath === f.absPath)) newPhotos.push(f);
          });
          return newPhotos;
        });
      }
    });

    const unThumb = api.onThumbnailProgress?.((m: any) => {
      if (m.type === 'thumb') {
        setThumbnails(prev => ({ ...prev, [m.file]: `data:image/jpeg;base64,${m.thumbBase64}` }));
      }
    });

    const unBackup = api.onBackupProgress((p: any) => {
      if (p.type === 'done' || p.type === 'error') {
        setBackupJobId(null);
        if (p.type === 'error') alert('Backup Error: ' + p.error);
      } else {
        setBackupProgress(p);
      }
    });

    return () => {
      unMenu?.(); unScan?.(); unThumb?.(); unBackup?.();
    };
  }, []);

  const onAddWorkspace = async () => {
    const res = await api.openFolderDialog({ title: 'Select Workspace Folder' });
    if (res && !res.canceled) {
      const newWs: Workspace = { id: Date.now().toString(), name: res.filePaths[0].split(/[\\/]/).pop() || 'Untitled', path: res.filePaths[0], active: true };
      const updated = [...workspaces, newWs];
      setWorkspaces(updated);
      const c = await api.getConfig();
      await api.saveConfig({ ...c, workspaces: updated });
    }
  };

  const activePhotos = useMemo(() => {
    let filtered = photos;
    if (photoOnly) {
      filtered = filtered.filter(p => p.type === 'image' || p.type === 'video');
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => p.absPath.toLowerCase().includes(q));
    }
    return filtered;
  }, [photos, searchQuery, photoOnly]);

  const displayPhotos = useMemo(() => {
    let sorted = [...activePhotos];
    if (tab === 'timeline') {
      if (sortMode === 'creation') {
        sorted.sort((a, b) => (b.dateTaken || b.mtime) - (a.dateTaken || a.mtime) || b.absPath.localeCompare(a.absPath));
      } else if (sortMode === 'modified') {
        sorted.sort((a, b) => b.mtime - a.mtime || b.absPath.localeCompare(a.absPath));
      } else if (sortMode === 'size') {
        sorted.sort((a, b) => b.size - a.size || b.absPath.localeCompare(a.absPath));
      } else if (sortMode === 'location') {
        sorted.sort((a, b) => {
          if (!a.lat && !b.lat) return (b.dateTaken || b.mtime) - (a.dateTaken || a.mtime);
          if (!a.lat) return 1;
          if (!b.lat) return -1;
          return (b.dateTaken || b.mtime) - (a.dateTaken || a.mtime) || b.absPath.localeCompare(a.absPath);
        });
      }
    } else if (tab === 'folder') {
      // Must match FolderView grouping logic
      const groups: Record<string, any[]> = {};
      sorted.forEach(p => {
        const parts = p.rel.split(/[\\/]/);
        const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
        if (!groups[folder]) groups[folder] = [];
        groups[folder].push(p);
      });
      const sortedFolders = Object.keys(groups).sort();
      const flat: any[] = [];
      sortedFolders.forEach(f => {
        const folderPhotos = groups[f].sort((a,b) => (b.mtime || 0) - (a.mtime || 0) || a.absPath.localeCompare(b.absPath));
        flat.push(...folderPhotos);
      });
      return flat;
    } else {
      // Default folder/other views: sort by mtime desc
      sorted.sort((a,b) => (b.mtime || 0) - (a.mtime || 0) || a.absPath.localeCompare(b.absPath));
    }
    return sorted;
  }, [activePhotos, tab, sortMode]);


  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground selection-accent">
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">

        <div className="flex-none bg-panel-bg flex flex-col" style={{ width: leftPanelWidth }}>
          <Sidebar 
            workspaces={workspaces} 
            onAddWorkspace={onAddWorkspace}
            photoOnly={photoOnly}
            setPhotoOnly={setPhotoOnly}
            onRemoveWorkspace={async (id) => {
              const updated = workspaces.filter(ws => ws.id !== id);
              setWorkspaces(updated);
              const c = await api.getConfig();
              await api.saveConfig({ ...c, workspaces: updated });
            }}
            onToggleWorkspace={async (id) => {
              const updated = workspaces.map(ws => ws.id === id ? { ...ws, active: !ws.active } : ws);
              setWorkspaces(updated);
              const c = await api.getConfig();
              await api.saveConfig({ ...c, workspaces: updated });
              // Reload photos
              const allPhotos: any[] = [];
              for (const ws of updated.filter(w => w.active)) {
                 try {
                   const files = await api.getScanCache(ws.path);
                   if (files) allPhotos.push(...files);
                 } catch (e) {}
              }
              setPhotos(allPhotos);
            }}
          />
        </div>

        {/* Left Divider */}
        <div 
          className={`w-1-5 cursor-col-resize hover-bg-accent-40 bg-white-5 z-100 flex-none relative group ${isResizingLeft ? 'bg-accent shadow-[0_0_10px_rgba(31,111,235,0.5)]' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); setIsResizingLeft(true); }}
        >
          <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize z-101" />
        </div>

      <div className="flex flex-1 flex-col overflow-hidden relative">
        <header className="h-[52px] border-b bg-header-bg flex items-center justify-between px-6 shrink-0 z-20">
          <div className="flex-1" /> {/* Left Spacer */}

          <nav className="flex items-center bg-white-5 rounded-lg p-1">
            <button onClick={() => setTab('folder')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${tab === 'folder' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-white-40 hover:text-white-70 hover:bg-white-5'}`}>
              <HardDrive size={14} /> Folder
            </button>
            <button onClick={() => setTab('timeline')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${tab === 'timeline' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-white-40 hover:text-white-70 hover:bg-white-5'}`}>
              <Calendar size={14} /> Timeline
            </button>
            <button onClick={() => setTab('map')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${tab === 'map' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-white-40 hover:text-white-70 hover:bg-white-5'}`}>
              <MapPin size={14} /> Map
            </button>
            <button onClick={() => setTab('backup')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${tab === 'backup' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-white-40 hover:text-white-70 hover:bg-white-5'}`}>
              <Shield size={14} /> Backup
            </button>
            <button onClick={() => setTab('bu_viewer')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${tab === 'bu_viewer' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-white-40 hover:text-white-70 hover:bg-white-5'}`}>
              <Database size={14} /> BU Viewer
            </button>
          </nav>

          <div className="flex-1 flex justify-end">
             {isScanning && (
               <div className="flex items-center gap-3 bg-accent-10 border border-accent-20 px-3 py-1.5 rounded-full">
                 <Loader2 className="animate-spin text-accent" size={14} />
                 <span className="text-[10px] font-black uppercase tracking-tighter text-accent">{scanStatus || 'Scanning...'}</span>
               </div>
             )}
          </div>
        </header>

        <main className="flex-1 flex flex-col relative bg-main-bg overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col min-h-0 overflow-hidden"
            >


              {tab === 'folder' && (
                <FolderView 
                  photos={activePhotos} 
                  onPhotoClick={setPreviewPhoto} 
                  thumbnails={thumbnails} 
                  workspaces={workspaces} 
                  photoOnly={photoOnly}
                />
              )}

              {tab === 'timeline' && (
                <TimelineView 
                  photos={activePhotos} 
                  onPhotoClick={setPreviewPhoto} 
                  thumbnails={thumbnails} 
                  sortMode={sortMode}
                  onSortModeChange={setSortMode}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                />
              )}


              {tab === 'map' && <MapView photos={activePhotos} onPhotoClick={setPreviewPhoto} thumbnails={thumbnails} />}
              {tab === 'backup' && (
                <BackupView 
                  targets={backupTargets}
                  workspaces={workspaces}
                  jobId={backupJobId}
                  progress={backupProgress}
                  shasumRequired={computeSha}
                  onSetShasumRequired={setComputeSha}
                  initialSource={lastSource}
                  initialDest={lastDest}
                  onSourceChange={async (path: string) => { setLastSource(path); const c = await api.getConfig(); api.saveConfig({ ...c, lastSource: path }); }}
                  onDestChange={async (path: string) => { setLastDest(path); const c = await api.getConfig(); api.saveConfig({ ...c, lastDest: path }); }}
                  restoreFile={api.restoreFile}
                  onStartBackup={async (source, destination, sha, maxSize, sourceName) => {
                    setLastSource(source);
                    setLastDest(destination);
                    await api.saveConfig({ ...await api.getConfig(), lastSource: source, lastDest: destination });
                    const files = await api.getScanCache(source);
                    const filesPayload = files.map((p: any) => ({ absPath: p.absPath, rel: p.rel, driveName: p.driveName, size: p.size, mtime: p.mtime }));
                    const job = await api.startBackup({ 
                      files: filesPayload, 
                      backupRoot: destination, 
                      sourceRootPath: source,
                      sourceRootName: sourceName,
                      computeSha256: sha, 
                      maxPartSizeBytes: maxSize * 1024 * 1024 * 1024 
                    });
                    if (job?.jobId) setBackupJobId(job.jobId);
                  }}
                  onCancelBackup={async (id) => {
                    await api.cancelBackup(id);
                    setBackupJobId(null);
                  }}
                />
              )}
              {tab === 'bu_viewer' && <BUViewer selectedStorageZip={selectedBackupPath} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Right Divider */}
      <div 
        className={`w-1-5 cursor-col-resize hover-bg-accent-40 bg-white-5 z-100 flex-none relative group ${isResizingRight ? 'bg-accent shadow-[0_0_10px_rgba(31,111,235,0.5)]' : ''}`}
        onMouseDown={(e) => { e.preventDefault(); setIsResizingRight(true); }}
      >
        <div className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize z-101" />
      </div>


      <aside 
        className="border-l bg-panel-bg flex flex-col overflow-hidden shrink-0 z-20"
        style={{ width: rightPanelWidth }}
      >
        <div className="p-4 border-b h-[52px] flex items-center justify-between">
          <span className="text-xs font-black text-white-30 uppercase tracking-tightest">Backup Folders</span>
          <button 
            onClick={() => api.openFolderDialog({ title: 'Add Backup Folder' }).then((res: any) => { if(!res.canceled) api.addBackupTarget(res.filePaths[0]).then(() => api.listBackupTargets().then(setBackupTargets)) })} 
            className="text-accent p-1.5 rounded-md transition-colors bg-white-10 hover:bg-white-20" 
            title="Add Backup Folder"
          >
            <Folder size={14} />
          </button>
        </div>
        
        <div className="flex flex-1 flex-col gap-3 p-4 overflow-y-auto custom-scrollbar">
          {backupTargets.map(target => (
            <div 
              key={target} 
              onClick={() => { setSelectedBackupPath(target); setTab('bu_viewer'); }}
              className={`p-3 rounded-md border text-sm flex items-start gap-2 relative group hover:bg-black-60 transition-all cursor-pointer ${selectedBackupPath === target ? 'bg-accent-10 border-accent-40' : 'bg-black-40 border-white-5'}`}
            >
               <div className="w-4 h-4 mt-0.5 shrink-0 flex items-center justify-center">
                  <Archive size={12} className={selectedBackupPath === target ? 'text-accent' : 'text-white-20'} />
               </div>
               <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="truncate font-bold text-white-70 leading-tight" title={target}>
                    {target.split(/[\\/]/).pop()}
                  </div>
                  <div className="truncate text-[10px] text-white-30" title={target}>
                    {target}
                  </div>
               </div>
               <button 
                 onClick={async (e) => { e.stopPropagation(); await api.removeBackupTarget(target); setBackupTargets(await api.listBackupTargets()); if(selectedBackupPath === target) setSelectedBackupPath(null); }}
                 className="shrink-0 text-white-40 hover:text-red-400 transition-all border-none bg-transparent opacity-0 group-hover:opacity-100 p-1"
               >
                 <X size={12} />
               </button>
            </div>
          ))}
          {backupTargets.length === 0 && <div className="text-sm text-white-20 italic p-4 text-center">No backup folders added.</div>}
        </div>
      </aside>
    </div>


      {/* Status Bar */}
      <footer className="h-6 bg-header-bg border-t border-white-5 flex items-center justify-between px-6 text-[10px] font-black uppercase tracking-tighter text-white-30 shrink-0 z-40 select-none w-full">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <span className="text-white-20">Workspaces:</span>
            <span className="text-white-60">{workspaces.filter(w => w.active).length}</span>
          </div>
          <div className="w-[1px] h-2.5 bg-white-10" />
          <div className="flex items-center gap-1.5">
            <span className="text-white-20">Total Files:</span>
            <span className="text-accent">{photos.length.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
           {isScanning && (
             <div className="flex items-center gap-2 text-accent animate-pulse">
               <Loader2 size={10} className="animate-spin" />
               <span>{scanStatus || 'SCANNING...'}</span>
             </div>
           )}
           <div className="flex items-center gap-1.5">
             <span className="text-white-20">Status:</span>
             <span className={backupJobId ? 'text-green-500' : 'text-white-60'}>{backupJobId ? 'SYNCING...' : 'IDLE'}</span>
           </div>
        </div>
      </footer>



      <AnimatePresence>

        {previewPhoto && (
          <PreviewDialog 
            photo={previewPhoto} 
            allPhotos={displayPhotos}
            onClose={() => setPreviewPhoto(null)} 
            onNavigate={(index) => {
              const currentPhotos = displayPhotos;
              const currentIndex = currentPhotos.indexOf(previewPhoto);
              const nextIndex = (currentIndex + index + currentPhotos.length) % currentPhotos.length;
              const next = currentPhotos[nextIndex];
              if (next) setPreviewPhoto(next);
            }}
            onSaveLocation={async (p, lat, lon, loc) => {
              await api.updateMetadata(p.absPath, { lat, lon, location: loc });
              setPhotos(prev => prev.map(x => x.absPath === p.absPath ? { ...x, lat, lon, location: loc } : x));
            }}
          />
        )}

      </AnimatePresence>

    </div>
  );
};

export default App;
