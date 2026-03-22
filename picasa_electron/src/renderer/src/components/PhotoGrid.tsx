import React from 'react';
import { Play, MapPin, File, Image } from 'lucide-react';

interface Photo {
  absPath: string;
  rel: string;
  size: number;
  mtime: number;
  driveName: string;
  type: 'image' | 'video' | 'file';
  dateTaken?: number;
  lat?: number;
  lon?: number;
  location?: any;
}

interface PhotoGridProps {
  photos: Photo[];
  onPhotoClick: (photo: Photo) => void;
  thumbnails?: Record<string, string>;
  isList?: boolean;
}

export const PhotoGrid: React.FC<PhotoGridProps> = ({ photos, onPhotoClick, thumbnails = {}, isList = false }) => {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString();
  };

  if (isList) {
    return (
      <div className="flex flex-col gap-px bg-white-5 border rounded-md overflow-hidden">
        {photos.map((p, i) => (
          <div 
            key={i} 
            className="flex items-center gap-4 px-4 py-2 hover:bg-white-5 transition-colors cursor-pointer group"
            onClick={() => onPhotoClick(p)}
          >
            <div className="w-6 h-6 flex items-center justify-center text-white-40 group-hover:text-accent">
               {p.type === 'image' && <Image size={14} />}
               {p.type === 'video' && <Play size={14} />}
               {p.type === 'file' && <File size={14} />}
            </div>
            <div className="flex-1 min-w-0">
               <div className="text-[12px] font-medium truncate text-white-80">{p.rel.split('/').pop()}</div>
               <div className="text-[9px] text-white-30 uppercase tracking-widest font-black">{p.type}</div>
            </div>
            <div className="text-[11px] text-white-40 font-mono w-20 text-right">{formatSize(p.size)}</div>
            <div className="text-[11px] text-white-40 w-24 text-right">{formatDate(p.dateTaken || p.mtime)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="photo-grid">
      {photos.map((p, i) => {
        const thumb = thumbnails[p.absPath];
        
        return (
          <div key={i} className="photo-card" onClick={() => onPhotoClick(p)}>
            <div className="aspect-square relative flex items-center justify-center bg-gray-900 overflow-hidden">
              {thumb ? (
                <img 
                  src={`data:image/jpeg;base64,${thumb}`} 
                  alt={p.rel}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-gray-700 animate-pulse">
                   {p.type === 'video' ? <Play size={32} /> : <div className="w-16 h-16 bg-gray-800 rounded"></div>}
                </div>
              )}
              
              {p.type === 'video' && (
                <div className="absolute top-2 left-2 bg-black/50 p-1 rounded backdrop-blur">
                  <Play size={12} className="text-white" />
                </div>
              )}
              
              {p.lat && (
                <div className="absolute top-2 right-2 bg-blue-500/50 p-1 rounded backdrop-blur">
                  <MapPin size={10} className="text-white" />
                </div>
              )}
            </div>
            
            <div className="p-2 flex flex-col gap-1">
              <div className="text-[11px] font-bold truncate" title={p.rel}>
                {p.rel.split('/').pop()}
              </div>
              <div className="flex justify-between items-center text-[9px] text-white-40 font-black uppercase tracking-tightest">
                <span>{formatSize(p.size)}</span>
                <span>{formatDate(p.dateTaken || p.mtime)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
