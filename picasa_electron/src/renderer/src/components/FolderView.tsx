import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, HardDrive, Search, X } from 'lucide-react';
import { PhotoGrid } from './PhotoGrid';

interface FolderViewProps {
  workspaces: any[];
  photos: any[];
  onPhotoClick: (photo: any) => void;
  thumbnails: Record<string, string>;
  photoOnly: boolean;
}

export const FolderView: React.FC<FolderViewProps> = ({ workspaces, photos, onPhotoClick, thumbnails, photoOnly }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // If we are collapsing, collapse all sub-entries too
      if (!next[key]) {
        Object.keys(next).forEach(k => {
          if (k.startsWith(key) && k !== key) {
             next[k] = false;
          }
        });
      }
      return next;
    });
  };

  const filteredPhotos = searchQuery 
    ? photos.filter(p => p.absPath.toLowerCase().includes(searchQuery.toLowerCase()))
    : photos;

  const activeWorkspaces = workspaces.filter(ws => ws.active);
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="p-4 border-b border-white-5 flex justify-center bg-black-40 shrink-0">
        <div className="relative group w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white-20 group-focus-within:text-accent transition-colors" size={16} />
          <input 
            type="text" 
            placeholder="Search filenames in folders..."
            className="bg-white-5 hover:bg-white-10 focus:bg-white-10 border-transparent focus:border-accent-30 focus:ring-0 rounded-full pl-10 pr-10 py-2 text-sm w-full transition-all outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white-30 hover:text-white-60 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {activeWorkspaces.map((ws, i) => {
          const wsPhotos = filteredPhotos.filter(p => p.absPath.startsWith(ws.path));
          
          const folders: Record<string, any[]> = {};
          wsPhotos.forEach(p => {
            const parts = p.rel.split('/');
            const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
            if (!folders[folder]) folders[folder] = [];
            folders[folder].push(p);
          });

          return (
            <div key={ws.id || i} className="mb-8 px-4 pt-4">
              <div 
                className="section-header workspace cursor-pointer flex items-center gap-2 p-2 hover:bg-white-5 rounded-md"
                onClick={() => toggle(ws.path)}
              >
                {expanded[ws.path] !== false ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <HardDrive size={18} className="text-accent" />
                <span className="font-bold">{ws.name}</span>
                <span className="text-xs font-black text-white-20 ml-auto uppercase opacity-50">({wsPhotos.length} items)</span>
              </div>
              
              {expanded[ws.path] !== false && (
                <div className="tree-container mt-2">
                  {Object.keys(folders).sort().map((f, j, arr) => (
                    <div key={j} className={`mb-6 tree-item-connector ${j === arr.length - 1 ? 'tree-item-connector-last' : ''}`}>
                      <div 
                        className="section-header folder cursor-pointer flex items-center gap-2 p-1.5 hover:bg-white-5 rounded-md mb-2"
                        onClick={() => toggle(`${ws.path}-${f}`)}
                      >
                        {expanded[`${ws.path}-${f}`] !== false ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <Folder size={16} className="text-white-40" />
                        <span className="text-sm">{f}</span>
                        <span className="text-xs font-bold text-white-30 ml-auto opacity-40">({folders[f].length})</span>
                      </div>
                      
                      {expanded[`${ws.path}-${f}`] !== false && (
                        <div className="ml-4">
                          <PhotoGrid 
                            photos={folders[f]} 
                            onPhotoClick={onPhotoClick} 
                            thumbnails={thumbnails}
                            isList={!photoOnly}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        
        {activeWorkspaces.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted opacity-20 py-20">
            <HardDrive size={64} className="mb-4" />
            <p className="font-black uppercase tracking-widest text-sm">No active workspaces</p>
          </div>
        )}
      </div>
    </div>
  );
};
