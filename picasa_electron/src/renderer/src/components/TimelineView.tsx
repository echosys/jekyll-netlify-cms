import React, { useState, useMemo } from 'react';
import { Calendar, Tag, HardDrive, MapPin, ChevronDown, ChevronRight } from 'lucide-react';
import { PhotoGrid } from './PhotoGrid';

type SortMode = 'creation' | 'modified' | 'size' | 'location';

interface TimelineViewProps {
  photos: any[];
  onPhotoClick: (photo: any) => void;
  thumbnails: Record<string, string>;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ photos, onPhotoClick, thumbnails }) => {
  const [sortMode, setSortMode] = useState<SortMode>('creation');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const groupedPhotos = useMemo(() => {
    const groups: Record<string, any[]> = {};
    const sorted = [...photos];

    if (sortMode === 'creation') {
      sorted.sort((a, b) => (b.dateTaken || b.mtime) - (a.dateTaken || a.mtime));
      sorted.forEach(p => {
        const d = new Date(p.dateTaken || p.mtime);
        const name = `${d.getFullYear()}  ·  ${d.toLocaleString('default', { month: 'long' })}`;
        if (!groups[name]) groups[name] = [];
        groups[name].push(p);
      });
    } else if (sortMode === 'modified') {
      sorted.sort((a, b) => b.mtime - a.mtime);
      sorted.forEach(p => {
        const d = new Date(p.mtime);
        const name = `${d.getFullYear()}  ·  ${d.toLocaleString('default', { month: 'long' })}`;
        if (!groups[name]) groups[name] = [];
        groups[name].push(p);
      });
    } else if (sortMode === 'size') {
      sorted.sort((a, b) => b.size - a.size);
      sorted.forEach(p => {
        let name = '';
        const size = p.size;
        if (size >= 10 * 1024 * 1024 * 1024) name = '≥ 10 GB';
        else if (size >= 1 * 1024 * 1024 * 1024) name = '1 GB – 10 GB';
        else if (size >= 100 * 1024 * 1024) name = '100 MB – 1 GB';
        else if (size >= 10 * 1024 * 1024) name = '10 MB – 100 MB';
        else if (size >= 1 * 1024 * 1024) name = '1 MB – 10 MB';
        else name = '< 1 MB';
        if (!groups[name]) groups[name] = [];
        groups[name].push(p);
      });
    } else if (sortMode === 'location') {
      sorted.sort((a, b) => {
          if (!a.lat && !b.lat) return (b.dateTaken || b.mtime) - (a.dateTaken || a.mtime);
          if (!a.lat) return 1;
          if (!b.lat) return -1;
          return (b.dateTaken || b.mtime) - (a.dateTaken || a.mtime);
      });
      
      sorted.forEach(p => {
        let name = 'Unknown Location';
        if (p.location) {
          name = `${p.location.city || ''}  ·  ${p.location.state || p.location.country || ''}`.trim();
          if (name === '·') name = 'Unknown Location';
        }
        if (!groups[name]) groups[name] = [];
        groups[name].push(p);
      });
    }

    return groups;
  }, [photos, sortMode]);

  const groupKeys = Object.keys(groupedPhotos);

  const jumpTo = (key: string) => {
    const el = document.getElementById(`group-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="flex flex-1 overflow-hidden relative">
      <div className="flex-1 flex flex-col p-4 overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <button 
              className={`text-xs p-1 rounded ${sortMode === 'creation' ? 'bg-accent' : 'bg-transparent border border-muted'}`}
              onClick={() => setSortMode('creation')}
            >
              <Calendar size={14} className="mr-1 inline" /> Creation
            </button>
            <button 
              className={`text-xs p-1 rounded ${sortMode === 'modified' ? 'bg-accent' : 'bg-transparent border border-muted'}`}
              onClick={() => setSortMode('modified')}
            >
              <Tag size={14} className="mr-1 inline" /> Modified
            </button>
            <button 
              className={`text-xs p-1 rounded ${sortMode === 'size' ? 'bg-accent' : 'bg-transparent border border-muted'}`}
              onClick={() => setSortMode('size')}
            >
              <HardDrive size={14} className="mr-1 inline" /> Size
            </button>
            <button 
              className={`text-xs p-1 rounded ${sortMode === 'location' ? 'bg-accent' : 'bg-transparent border border-muted'}`}
              onClick={() => setSortMode('location')}
            >
              <MapPin size={14} className="mr-1 inline" /> Location
            </button>
          </div>
        </div>

        <div className="flex-1">
          {groupKeys.map((key, i) => (
            <div key={i} id={`group-${key}`} className="mb-8">
              <div 
                className="section-header workspace flex items-center justify-between"
                onClick={() => toggle(key)}
              >
                <div className="flex items-center gap-2">
                  {expanded[key] !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{key}</span>
                  <span className="text-[10px] text-muted ml-2">({groupedPhotos[key].length} items)</span>
                </div>
              </div>
              
              {expanded[key] !== false && (
                <div className="mt-4">
                  <PhotoGrid 
                    photos={groupedPhotos[key]} 
                    onPhotoClick={onPhotoClick} 
                    thumbnails={thumbnails}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Jump Index Sidebar */}
      <div className="w-[120px] glass p-2 overflow-y-auto custom-scrollbar flex flex-col gap-1 border-l border-border-color">
        <div className="text-[10px] uppercase font-bold text-muted mb-2 tracking-wider">Group Jump</div>
        {groupKeys.map((key, i) => (
          <div 
            key={i} 
            className="text-[10px] p-2 rounded cursor-pointer hover:bg-white/5 transition-all text-muted hover:text-white truncate"
            onClick={() => jumpTo(key)}
            title={key}
          >
            {key.split('·').pop()?.trim() || key}
          </div>
        ))}
      </div>
    </div>
  );
};
