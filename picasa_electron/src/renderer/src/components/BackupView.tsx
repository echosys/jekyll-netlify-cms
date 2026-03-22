import React, { useState } from 'react';
import { Shield, Play, Pause, X, CheckCircle, Database, Search } from 'lucide-react';

interface BackupViewProps {
  targets: string[];
  onAddTarget: (path: string) => void;
  onRemoveTarget: (path: string) => void;
  onStartBackup: (root: string, computeSha: boolean) => void;
  onCancelBackup: (jobId: number) => void;
  jobId: number | null;
  progress: any;
  shasumRequired: boolean;
  onSetShasumRequired: (req: boolean) => void;
}

export const BackupView: React.FC<BackupViewProps> = ({ 
  targets, onAddTarget, onRemoveTarget, onStartBackup, onCancelBackup, jobId, progress, shasumRequired, onSetShasumRequired 
}) => {
  const [selectedTarget, setSelectedTarget] = useState<string>(targets[0] || '');
  const [newTargetPath, setNewTargetPath] = useState('');

  const handleAdd = () => {
    if (newTargetPath) {
      onAddTarget(newTargetPath);
      setNewTargetPath('');
    }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto flex flex-col gap-8 custom-scrollbar">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold flex items-center gap-3"><Shield size={32} className="text-accent" /> Secure Backup</h1>
          <p className="text-muted max-w-[600px]">Create an uncompressed archive of your photos with a persistent SQLite manifest. This allows you to browse and restore from any machine.</p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-xs font-bold ring-1 ring-green-500/20">
            <CheckCircle size={14} /> Ready
          </div>
          <span className="text-[10px] text-muted text-right">Last Backup: Never</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Step 1: Destination Selection */}
        <div className="glass p-6 rounded-2xl flex flex-col gap-4 border border-white/5">
          <h3 className="font-bold flex items-center gap-2"><Database size={18} /> Destination</h3>
          <div className="flex flex-col gap-4">
             <div className="flex flex-col gap-1">
               <span className="text-[10px] text-muted uppercase">Selected Target Folder</span>
               <select 
                 value={selectedTarget} 
                 onChange={e => setSelectedTarget(e.target.value)}
                 className="w-full bg-[#010409] border border-white/10 p-2 rounded text-sm outline-none"
               >
                 <option value="" disabled>Select a backup root</option>
                 {targets.map((t, i) => <option key={i} value={t}>{t}</option>)}
               </select>
             </div>
             
             <div className="flex flex-col gap-1 mt-2">
               <span className="text-[10px] text-muted uppercase">Add New Target Path</span>
               <div className="flex gap-2">
                 <input 
                   className="flex-1" 
                   value={newTargetPath} 
                   onChange={e => setNewTargetPath(e.target.value)} 
                   placeholder="/Volumes/ExternalDrive/Backup"
                 />
                 <button onClick={handleAdd}>Add</button>
               </div>
             </div>
             
             <div className="mt-4 flex flex-col gap-2">
               {targets.map((t, i) => (
                 <div key={i} className="flex justify-between items-center p-2 rounded bg-white/5 text-[11px] group">
                   <span className="truncate flex-1 pr-4">{t}</span>
                   <button 
                    onClick={() => onRemoveTarget(t)} 
                    className="p-1 px-2 bg-transparent hover:bg-red-500/20 text-muted hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                   >
                     Remove
                   </button>
                 </div>
               ))}
             </div>
          </div>
        </div>

        {/* Step 2: Backup Options & Execution */}
        <div className="glass p-6 rounded-2xl flex flex-col gap-4 border border-white/5">
          <h3 className="font-bold flex items-center gap-2"><Search size={18} /> Control & Status</h3>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
               <div className="flex justify-between items-center text-xs">
                 <span className="text-muted">Compute SHA256 (slower)</span>
                 <input type="checkbox" checked={shasumRequired} onChange={e => onSetShasumRequired(e.target.checked)} />
               </div>
               <div className="flex justify-between items-center text-xs">
                 <span className="text-muted">Max Archive Size</span>
                 <span className="text-accent underline cursor-pointer">10 GB (Default)</span>
               </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => onStartBackup(selectedTarget, shasumRequired)}
                disabled={!selectedTarget || !!jobId}
                className="flex-1 py-4 text-lg bg-accent hover:bg-accent-hover font-bold rounded-2xl flex items-center justify-center gap-4"
              >
                <Play size={24} /> Start Backup Pipeline
              </button>
              {jobId && (
                <button onClick={() => onCancelBackup(jobId)} className="p-4 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-2xl">
                  <X size={24} />
                </button>
              )}
            </div>

            {/* Progress Visualization */}
            {progress && (
              <div className="p-4 rounded-xl bg-white/5 flex flex-col gap-3">
                <div className="flex justify-between items-center text-[10px] text-muted">
                  <span>Currently Processing...</span>
                  <span>{progress.filesAdded || 0} files</span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: '45%' }}></div> {/* Static example for now */}
                </div>
                <div className="text-[10px] text-accent font-medium mt-1 truncate">
                  {progress.currentPart || 'Preparing...'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
