import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, HardDrive } from 'lucide-react';
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

  const toggle = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Group photos by workspace and then subfolder
  const activeWorkspaces = workspaces.filter(ws => ws.active);
  
  return (
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
      {activeWorkspaces.map((ws, i) => {
        const wsPhotos = photos.filter(p => p.absPath.startsWith(ws.path));
        
        // Group by folder relative to workspace
        const folders: Record<string, any[]> = {};
        wsPhotos.forEach(p => {
          const parts = p.rel.split('/');
          const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
          if (!folders[folder]) folders[folder] = [];
          folders[folder].push(p);
        });

        return (
          <div key={i} className="mb-8">
            <div 
              className="section-header workspace"
              onClick={() => toggle(ws.path)}
            >
              {expanded[ws.path] !== false ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <HardDrive size={18} className="text-accent" />
              <span>{ws.name}</span>
              <span className="text-sm font-bold text-white-40 ml-auto">({wsPhotos.length} items)</span>
            </div>
            
            {expanded[ws.path] !== false && (
              <div className="ml-4 mt-2">
                {Object.keys(folders).sort().map((f, j) => (
                  <div key={j} className="mb-4">
                    <div 
                      className="section-header folder"
                      onClick={() => toggle(`${ws.path}-${f}`)}
                    >
                      {expanded[`${ws.path}-${f}`] !== false ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <Folder size={16} className="text-white-40" />
                      <span>{f}</span>
                      <span className="text-sm font-bold text-white-30 ml-auto">({folders[f].length})</span>
                    </div>
                    
                    {expanded[`${ws.path}-${f}`] !== false && (
                      <PhotoGrid 
                        photos={folders[f]} 
                        onPhotoClick={onPhotoClick} 
                        thumbnails={thumbnails}
                        isList={!photoOnly}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      
      {activeWorkspaces.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-muted">
          <HardDrive size={48} className="mb-4 opacity-50" />
          <p>No active workspaces. Select a workspace to view photos.</p>
        </div>
      )}
    </div>
  );
};
