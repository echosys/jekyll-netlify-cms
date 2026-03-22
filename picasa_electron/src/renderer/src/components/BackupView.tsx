import React, { useState, useEffect } from 'react';
import { Shield, Play, RotateCcw, Database, HardDrive, Check, X, File, FolderOpen, AlertTriangle, Archive, Loader2 } from 'lucide-react';

interface BackupViewProps {
  targets: string[];
  workspaces: any[];
  onDestChange?: (path: string) => void;
  onStartBackup: (source: string, destination: string, shasum: boolean, maxSizeGb: number, sourceName: string) => void;
  onCancelBackup: (id: number) => void;
  jobId: number | null;
  progress: any;
  shasumRequired: boolean;
  onSetShasumRequired: (req: boolean) => void;
  initialSource?: string;
  initialDest?: string;
  onSourceChange?: (path: string) => void;
  restoreFile: (backupRoot: string, fileRecord: any) => Promise<any>;
}

export const BackupView: React.FC<BackupViewProps> = ({ 
  targets, workspaces, onStartBackup, onCancelBackup, jobId, progress, shasumRequired, onSetShasumRequired, initialSource, initialDest, onSourceChange, onDestChange
}) => {
  const [sourcePath, setSourcePath] = useState<string>(initialSource || workspaces[0]?.path || '');
  const [destPath, setDestPath] = useState<string>(initialDest || targets[0] || '');
  const [sourceSize, setSourceSize] = useState<number | null>(null);
  const [isCalculatingSize, setIsCalculatingSize] = useState(false);
  const [destSize, setDestSize] = useState<number | null>(null);
  const [isCalculatingDestSize, setIsCalculatingDestSize] = useState(false);
  const [maxSizeGb, setMaxSizeGb] = useState<number>(10);
  const [diffResults, setDiffResults] = useState<any>(null);
  const [isDiffing, setIsDiffing] = useState(false);
  const [sourceRootName, setSourceRootName] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);

  const api = (window as any).api;

  useEffect(() => { if (initialSource) setSourcePath(initialSource); }, [initialSource]);
  useEffect(() => { if (initialDest) setDestPath(initialDest); }, [initialDest]);

  useEffect(() => {
    if (sourcePath) {
      const calc = async () => {
        setIsCalculatingSize(true);
        try {
          const size = await api.getFolderSize(sourcePath);
          setSourceSize(size);
        } catch (e) {
          console.error(e);
        } finally {
          setIsCalculatingSize(false);
        }
      };
      calc();
    }
  }, [sourcePath]);

  useEffect(() => {
    if (destPath) {
      const calc = async () => {
        setIsCalculatingDestSize(true);
        try {
          const size = await api.getFolderSize(destPath);
          setDestSize(size);
        } catch (e) {
          console.error(e);
        } finally {
          setIsCalculatingDestSize(false);
        }
      };
      calc();
    }
  }, [destPath, jobId]);

  const handleSelectSource = async () => {
    const res = await api.openFolderDialog({ title: 'Select Source Folder' });
    if (res && !res.canceled) {
      const p = res.filePaths[0];
      setSourcePath(p);
      setDiffResults(null);
      if (onSourceChange) onSourceChange(p);
    }
  };

  const handleSelectDest = async () => {
    const res = await api.openFolderDialog({ title: 'Select Destination Folder' });
    if (res && !res.canceled) {
      const p = res.filePaths[0];
      setDestPath(p);
      setDiffResults(null);
      if (onDestChange) onDestChange(p);
    }
  };

  const handleDiff = async () => {
    if (!sourcePath || !destPath) return;
    setIsDiffing(true);
    try {
      const files = await api.getScanCache(sourcePath);
      if (!files || files.length === 0) {
        alert('Please scan the source folder first.');
        return;
      }
      const res = await api.computeDiff({ files, backupRoot: destPath });
      setDiffResults(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDiffing(false);
    }
  };

  const handleStart = () => {
    if (!diffResults) {
      handleDiff();
      return;
    }
    const name = sourceRootName || (sourcePath.split(/[\\/]/).pop() || 'root');
    onStartBackup(sourcePath, destPath, shasumRequired, maxSizeGb, name);
  };

  const handleRestore = async (file: any, isDeleted: boolean) => {
    if (!destPath) return;
    setIsRestoring(file.rel_path || file.rel);
    try {
       // In deleted case, f is the metadata row from DB. In modified, f is {file, existing}
       const record = isDeleted ? file : file.existing;
       await api.restoreFile(destPath, record);
       // Refresh diff after restore
       handleDiff();
    } catch (e) {
       alert('Restore failed: ' + (e as any).message);
    } finally {
       setIsRestoring(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-black-20">
      <div className="p-6 border-b border-white-5 flex justify-between items-center bg-black-40">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-black flex items-center gap-3 tracking-tighter uppercase">
            <Shield size={20} className="text-accent" /> 
            Backup Summary
          </h1>
          <p className="text-[10px] text-white-40 font-bold uppercase tracking-widest">
            {jobId ? 'Backup in progress...' : 'Ready to sync'}
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 px-4 py-2 bg-black-40 rounded-lg border border-white-5">
            <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="sha-check"
                  checked={shasumRequired} 
                  onChange={e => onSetShasumRequired(e.target.checked)} 
                  className="w-3 h-3 rounded-sm accent-accent"
                />
                <label htmlFor="sha-check" className="text-[10px] font-bold text-white-60 uppercase cursor-pointer">Verify Hashing</label>
            </div>
            <div className="w-[1px] h-4 bg-white-10" />
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-white-60 uppercase">Max Size:</span>
                <select 
                  value={maxSizeGb} 
                  onChange={e => setMaxSizeGb(Number(e.target.value))}
                  className="bg-transparent text-[10px] font-bold text-accent outline-none border-none cursor-pointer"
                >
                  <option value={5}>5 GB</option>
                  <option value={10}>10 GB</option>
                  <option value={20}>20 GB</option>
                  <option value={50}>50 GB</option>
                </select>
            </div>
          </div>

          {!jobId ? (
            <button 
              onClick={handleStart}
              disabled={!sourcePath || !destPath || isDiffing}
              className={`px-6 py-2.5 rounded-md text-xs font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 ${!diffResults ? 'bg-white-10 text-white-40 hover:bg-white-20' : 'bg-accent text-white hover:brightness-110 active:scale-95'}`}
            >
              <Play size={14} fill="currentColor" /> {isDiffing ? 'Comparing...' : !diffResults ? 'Compare First' : 'Start Backup'}
            </button>
          ) : (
            <button 
              onClick={() => onCancelBackup(jobId)}
              className="bg-red-500-10 text-red-500 px-6 py-2.5 rounded-md text-xs font-black uppercase tracking-widest transition-all border border-red-500-20 hover:bg-red-500-20 flex items-center gap-2"
            >
              <X size={14} /> Cancel
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-8 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-[1fr_40px_1fr] items-center gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-white-20 uppercase tracking-widest">Source Folder</span>
            <div className="p-4 bg-black-40 border border-white-5 rounded-xl hover:border-accent-40 transition-all cursor-pointer group">
              <div onClick={handleSelectSource} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent-10 flex items-center justify-center text-accent group-hover:bg-accent-20 transition-all">
                  <Archive size={20} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-bold truncate group-hover:text-accent transition-colors">
                      {sourcePath.split(/[\\/]/).pop() || 'Select Source'}
                    </div>
                    <div className="text-[10px] font-black text-accent uppercase tracking-wider bg-accent-10 px-2 py-0.5 rounded-full border border-accent-20">
                       {isCalculatingSize ? 'Scanning...' : sourceSize !== null ? `${(sourceSize / 1024 / 1024 / 1024).toFixed(2)} GB` : '0 GB'}
                    </div>
                  </div>
                  <div className="text-[10px] text-white-30 truncate font-medium">{sourcePath || 'Choose origin files'}</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-white-5 flex items-center gap-2">
                 <span className="text-[10px] font-black text-white-20 uppercase tracking-widest flex-none">Label:</span>
                 <input 
                   className="bg-black-60 border-none outline-none text-[11px] font-bold text-white-70 flex-1 px-2 py-1 rounded placeholder:text-white-10"
                   placeholder="Backup Job Name (e.g. photos_main)"
                   value={sourceRootName || (sourcePath.split(/[\\/]/).pop() || '')}
                   onChange={e => setSourceRootName(e.target.value)}
                   onClick={e => e.stopPropagation()}
                 />
              </div>
            </div>
          </div>

          <div className="flex justify-center mt-6">
            <div className="w-10 h-10 rounded-full bg-white-5 flex items-center justify-center text-white-20">
               <RotateCcw size={14} className="rotate-90" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-white-20 uppercase tracking-widest">Destination Target</span>
            <div onClick={handleSelectDest} className="p-4 bg-black-40 border border-white-5 rounded-xl hover:border-accent-40 transition-all cursor-pointer group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-green-500-10 flex items-center justify-center text-green-500 group-hover:bg-green-500-20 transition-all font-black uppercase text-[10px]">
                  <Database size={20} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-bold truncate group-hover:text-green-500 transition-colors">
                      {destPath.split(/[\\/]/).pop() || 'Select Destination'}
                    </div>
                    <div className="text-[10px] font-black text-green-500 uppercase tracking-wider bg-green-500-10 px-2 py-0.5 rounded-full border border-green-500-20">
                       {isCalculatingDestSize ? 'Scanning...' : destSize !== null ? `${(destSize / 1024 / 1024 / 1024).toFixed(2)} GB` : '0 GB'}
                    </div>
                  </div>
                  <div className="text-[10px] text-white-30 truncate font-medium">{destPath || 'Choose backup folder'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {diffResults && !jobId && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 mt-4">
             <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-white-40 uppercase tracking-widest">Comparison Summary</span>
                <button onClick={handleDiff} className="text-[10px] font-black text-accent uppercase tracking-widest bg-accent-10 px-3 py-1.5 rounded-md border border-accent-20 hover:bg-accent-20 transition-all flex items-center gap-2">
                   <RotateCcw size={10} /> Recalculate Diff
                </button>
             </div>
             
             <div className="grid grid-cols-4 gap-4">
                {[
                  { id: 'new', label: 'New Files', count: diffResults.newFiles.length, color: 'text-accent', bg: 'bg-black-40', icon: <Play size={10} />, items: diffResults.newFiles },
                  { id: 'mod', label: 'Modified', count: diffResults.modified.length, color: 'text-orange-400', bg: 'bg-black-40', icon: <RotateCcw size={10} />, items: diffResults.modified.map((m: any) => m.file) },
                  { id: 'id', label: 'Identical', count: diffResults.identical.length, color: 'text-green-400', bg: 'bg-green-500-10', icon: <Check size={10} />, items: diffResults.identical.map((i: any) => i.file) },
                  { id: 'del', label: 'Deleted', count: diffResults.deleted.length, color: 'text-red-400', bg: 'bg-red-500-10', icon: <X size={10} />, items: diffResults.deleted }
                ].map((stat) => (
                  <div 
                    key={stat.id} 
                    onClick={() => setExpandedCategory(expandedCategory === stat.id ? null : stat.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${stat.bg} ${expandedCategory === stat.id ? 'border-accent shadow-xl' : 'border-white-5 hover:border-white-10'} flex flex-col gap-1`}
                  >
                    <div className="flex items-center justify-between">
                       <span className="text-[10px] font-black text-white-30 uppercase tracking-widest">{stat.label}</span>
                       <div className={stat.color}>{stat.icon}</div>
                    </div>
                    <div className={`text-2xl font-black ${stat.color}`}>{stat.count.toLocaleString()}</div>
                  </div>
                ))}
             </div>

             {/* Expanded Item List */}
             {expandedCategory && (
                <div className="bg-black-40 border border-white-5 rounded-2xl p-6 animate-in slide-in-from-top-2 duration-300">
                   <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-black uppercase tracking-widest text-white-70">
                        {expandedCategory === 'new' ? 'New Files to Add' 
                          : expandedCategory === 'mod' ? 'Modified Files to Sync'
                          : expandedCategory === 'id' ? 'Identical Files (No changes needed)' 
                          : 'Files missing from source (Found in Backup)'}
                      </h3>
                   </div>
                   <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2">
                      {(expandedCategory === 'new' ? diffResults.newFiles 
                        : expandedCategory === 'mod' ? diffResults.modified
                        : expandedCategory === 'id' ? diffResults.identical
                        : diffResults.deleted).map((f: any, i: number) => {
                          const file = expandedCategory === 'mod' || expandedCategory === 'id' ? f.file : f;
                          const name = file.rel_path || file.rel || file.path;
                          return (
                            <div key={i} className="flex items-center justify-between p-3 bg-black-20 rounded-lg group hover:bg-black-60 transition-colors">
                               <div className="flex items-center gap-3 min-w-0">
                                  <File size={14} className="text-white-20 shrink-0" />
                                  <div className="flex flex-col min-w-0">
                                     <span className="text-xs font-bold text-white-70 truncate" title={name}>{name}</span>
                                     <span className="text-[9px] text-white-20 font-black uppercase">{formatSize(file.size)}</span>
                                  </div>
                               </div>
                               <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                  {(expandedCategory === 'mod' || expandedCategory === 'del') && (
                                     <button 
                                        onClick={(e) => { e.stopPropagation(); handleRestore(f, expandedCategory === 'del'); }}
                                        disabled={!!isRestoring}
                                        className="px-3 py-1.5 bg-accent-10 text-accent rounded text-[10px] font-black uppercase hover:bg-accent-20 border border-accent-20 flex items-center gap-2 disabled:opacity-50"
                                     >
                                        {isRestoring === (f.rel_path || f.rel) ? <Loader2 className="animate-spin" size={10} /> : <RotateCcw size={10} />} Restore
                                     </button>
                                  )}
                               </div>
                            </div>
                          );
                      })}
                      {((expandedCategory === 'new' ? diffResults.newFiles 
                        : expandedCategory === 'mod' ? diffResults.modified
                        : expandedCategory === 'id' ? diffResults.identical
                        : diffResults.deleted).length === 0) && (
                          <div className="py-10 text-center text-white-20 lowercase text-xs italic">Nothing in this category</div>
                      )}
                   </div>
                </div>
             )}
          </div>
        )}

        {jobId && (
          <div className="p-8 bg-black-40 border border-white-5 rounded-2xl shadow-2xl space-y-6 relative overflow-hidden">
             <div className="absolute top-0 left-0 w-1 h-full bg-accent animate-pulse" />
             <div className="flex justify-between items-end">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-black text-accent uppercase tracking-widest">Backing Up</span>
                  <div className="text-xl font-bold tracking-tight">{progress?.currentPart || 'Preparing archives...'}</div>
                </div>
                <div className="text-4xl font-black text-accent tracking-tighter">
                  {progress ? `${Math.round(progress.percent || 0)}%` : '0%'}
                </div>
             </div>
             
             <div className="h-4 w-full bg-white-5 rounded-full overflow-hidden p-1 border border-white-5">
                <div 
                  className="h-full bg-accent rounded-full transition-all duration-700 shadow-[0_0_20px_rgba(31,111,235,0.6)] relative overflow-hidden" 
                  style={{ width: `${progress ? progress.percent || 0 : 0}%` }}
                >
                   <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white-20 to-transparent animate-shimmer" />
                </div>
             </div>
             
             <div className="flex justify-between items-center text-[11px] font-black text-white-40 uppercase tracking-widest pt-2">
                <div className="flex gap-8">
                  <div className="flex flex-col gap-0.5">
                     <span className="text-[9px] text-white-20 lowercase tracking-tighter">processed</span>
                     <span>{progress?.filesAdded || 0} of {progress?.totalFiles || 0}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                     <span className="text-[9px] text-accent/50 lowercase tracking-tighter text-accent">remaining</span>
                     <span className="text-accent">{(progress?.totalFiles || 0) - (progress?.filesAdded || 0)} files</span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 items-end">
                  <span className="text-[9px] text-white-20 lowercase tracking-tighter">throughput</span>
                  <span className="text-white-60">{(progress?.totalSize || 0).toFixed(1)} MB archived</span>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
