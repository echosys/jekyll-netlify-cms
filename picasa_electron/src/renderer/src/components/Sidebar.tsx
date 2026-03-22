import React from 'react';
import { Plus, X, Folder, HardDrive, Image, FileText } from 'lucide-react';

interface SidebarProps {
  workspaces: any[];
  onAddWorkspace: () => void;
  onRemoveWorkspace: (path: string) => void;
  onToggleWorkspace: (path: string) => void;
  photoOnly: boolean;
  setPhotoOnly: (val: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  workspaces, 
  onAddWorkspace, 
  onRemoveWorkspace, 
  onToggleWorkspace, 
  photoOnly, 
  setPhotoOnly 
}) => {
  // Group workspaces by drive/volume
  const grouped = workspaces.reduce((acc, ws) => {
    let drive = 'Local';
    if (ws.path.startsWith('/Volumes/')) {
      drive = ws.path.split('/')[2];
    } else if (ws.path.includes(':')) {
      drive = ws.path.split(':')[0] + ':';
    } else if (ws.path.startsWith('/')) {
      drive = 'System';
    }
    if (!acc[drive]) acc[drive] = [];
    acc[drive].push(ws);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="flex flex-col h-full overflow-hidden p-3 select-none">
      {/* Photo Filter Toggle */}
      <div className="flex items-center bg-black-40 p-1 rounded-lg mb-6 border border-white-5 shadow-inner">
         <button 
           onClick={() => setPhotoOnly(true)}
           className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md transition-all text-xs font-black uppercase tracking-widest ${photoOnly ? 'bg-accent text-white shadow-lg' : 'bg-transparent text-white-40 hover:text-white-60'}`}
         >
           <Image size={13} strokeWidth={photoOnly ? 3 : 2} /> 
           Photos
         </button>
         <button 
           onClick={() => setPhotoOnly(false)}
           className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md transition-all text-xs font-black uppercase tracking-widest ${!photoOnly ? 'bg-white-10 text-white shadow-sm' : 'bg-transparent text-white-40 hover:text-white-60'}`}
         >
           <FileText size={13} strokeWidth={!photoOnly ? 3 : 2} /> 
           All files
         </button>
      </div>

      <button 
        onClick={onAddWorkspace} 
        className="w-full flex items-center justify-center gap-2 py-3 bg-accent-10 text-accent border border-accent-30 rounded-lg transition-all hover:bg-accent-20 hover:border-accent-50 mb-6 font-black text-xs-heading hover:scale-[1.02] shadow-lg"
      >
        <Plus size={16} strokeWidth={3} />
        Add Workspace
      </button>

      <div className="flex-1 flex flex-col gap-4 overflow-y-auto no-scrollbar pt-1">        
        {(Object.entries(grouped) as [string, any[]][]).map(([drive, items]) => (
          <div key={drive} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 px-3 py-1 group">
               <HardDrive size={12} className="text-accent opacity-50" />
               <span className="sidebar-group-label truncate flex-1">{drive}</span>
            </div>
            
            <div className="flex flex-col gap-0.5">
              {items.map((ws: any, i: number) => (
                <div key={i} className="flex justify-between items-center px-3 py-1 group hover:bg-white-5 rounded-md transition-all sidebar-item">
                   <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <input 
                        type="checkbox" 
                        checked={ws.active} 
                        onChange={() => onToggleWorkspace(ws.path)}
                        className="w-3.5 h-3.5 rounded-sm opacity-60 hover:opacity-100 cursor-pointer accent-accent"
                      />
                      <span className="truncate text-white-70 text-11px font-bold cursor-pointer" title={ws.path} onClick={() => onToggleWorkspace(ws.path)}>{ws.name}</span>
                   </div>
                   <button 
                     onClick={(e) => { e.stopPropagation(); onRemoveWorkspace(ws.path); }}
                     className="p-1 text-white-20 hover:text-red-400 transition-all border-none bg-transparent flex items-center justify-center opacity-0 group-hover:opacity-100"
                   >
                     <X size={12} strokeWidth={2.5} />
                   </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {workspaces.length === 0 && (
          <div className="text-center py-12 text-white-10 text-[10px] font-black uppercase tracking-widest italic flex flex-col items-center gap-4">
            <Folder size={36} strokeWidth={1} className="opacity-10" />
            No workspaces
          </div>
        )}
      </div>
    </div>
  );
};
