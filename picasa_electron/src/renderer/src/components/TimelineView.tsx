import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar, Tag, HardDrive, MapPin, ChevronDown, ChevronRight, Hash, Search, X } from 'lucide-react';
import { PhotoGrid } from './PhotoGrid';

type SortMode = 'creation' | 'modified' | 'size' | 'location';

interface TimelineViewProps {
  photos: any[];
  onPhotoClick: (photo: any) => void;
  thumbnails: Record<string, string>;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ 
  photos, onPhotoClick, thumbnails, sortMode, onSortModeChange, searchQuery, onSearchQueryChange 
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggle = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredPhotos = useMemo(() => {
    if (!searchQuery) return photos;
    const q = searchQuery.toLowerCase();
    return photos.filter(p => p.rel.toLowerCase().includes(q) || p.absPath.toLowerCase().includes(q));
  }, [photos, searchQuery]);

  const groupedPhotos = useMemo(() => {
    const groups: Record<string, any[]> = {};
    const sorted = [...filteredPhotos];


    if (sortMode === 'creation') {
      sorted.sort((a, b) => (b.dateTaken || b.mtime) - (a.dateTaken || a.mtime));
      sorted.forEach(p => {
        const d = new Date(p.dateTaken || p.mtime);
        const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!groups[name]) groups[name] = [];
        groups[name].push(p);
      });
    } else if (sortMode === 'modified') {
      sorted.sort((a, b) => b.mtime - a.mtime);
      sorted.forEach(p => {
        const d = new Date(p.mtime);
        const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

  // Observer to track which group is currently visible
  useEffect(() => {
    const scrollArea = document.getElementById('timeline-scroll-area');
    if (!scrollArea) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActiveGroup(entry.target.getAttribute('data-group-id'));
        }
      });
    }, { 
      root: scrollArea,
      rootMargin: '-50px 0px -80% 0px', // Detect items near the top of the scroll container
      threshold: 0
    });

    // Attach observer immediately to avoid lag
    groupKeys.forEach(key => {
      const el = document.getElementById(`group-${key}`);
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [groupKeys, sortMode]);

  const jumpTo = (key: string) => {
    const el = document.getElementById(`group-${key}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      setActiveGroup(key);
    }
  };

  // Auto-scroll the jump sidebar to keep the active button in view
  useEffect(() => {
    if (activeGroup) {
      const btn = document.getElementById(`jump-btn-${activeGroup}`);
      if (btn) {
        btn.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      }
    }
  }, [activeGroup]);

  return (
    <div className="flex-1 flex overflow-hidden h-full min-h-0 bg-main-panel">
      <div 
        id="timeline-scroll-area" 
        className="flex-1 flex flex-col p-4 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar"
        ref={scrollRef}
      >
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            {[
              { mode: 'creation', label: 'Creation', icon: Calendar },
              { mode: 'modified', label: 'Modified', icon: Tag },
              { mode: 'size', label: 'Size', icon: HardDrive },
              { mode: 'location', label: 'Location', icon: MapPin },
            ].map(({ mode, label, icon: Icon }) => (
              <button 
                key={mode}
                className={`text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-2 font-black uppercase tracking-widest transition-all ${sortMode === mode ? 'bg-accent text-white shadow-lg' : 'bg-white-5 text-white-40 hover:bg-white-10'}`}
                onClick={() => onSortModeChange(mode as SortMode)}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>

          <div className="relative group w-64">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white-20 group-focus-within:text-accent transition-colors" size={14} />
             <input 
               type="text" 
               placeholder="Filter timeline..."
               className="bg-white-5 hover:bg-white-10 focus:bg-white-10 border-transparent focus:border-accent-40 focus:ring-0 rounded-full pl-9 pr-4 py-1.5 text-[11px] w-full transition-all outline-none"
               value={searchQuery}
               onChange={(e) => onSearchQueryChange(e.target.value)}
             />
             {searchQuery && (
               <button onClick={() => onSearchQueryChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white-30 hover:text-white-60">
                 <X size={12} />
               </button>
             )}
          </div>
        </div>


        <div className="mt-2">
          {groupKeys.map((key, i) => (
            <div key={i} id={`group-${key}`} data-group-id={key} className="mb-10">
              <div 
                className={`section-header workspace flex items-center justify-between p-3 rounded-xl cursor-copy transition-all ${activeGroup === key ? 'bg-accent-10 border-l-4 border-accent' : 'hover:bg-white-5 border-l-4 border-transparent'}`}
                onClick={() => toggle(key)}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${activeGroup === key ? 'bg-accent text-white' : 'bg-white-5 text-white-30'}`}>
                    {expanded[key] !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                  <span className={`text-14px font-black ${activeGroup === key ? 'text-white' : 'text-white-60'}`}>{key}</span>
                  <span className="text-11px text-white-20 font-bold ml-2">({groupedPhotos[key].length} items)</span>
                </div>
              </div>
              
              {expanded[key] !== false && (
                <div className="mt-6 pl-4">
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
      <aside className="w-[140px] flex-none p-3 overflow-y-auto custom-scrollbar flex flex-col gap-1 border-l border-white-5 bg-black-40 h-full min-h-0">
        <div className="flex items-center gap-2 text-9px uppercase font-black text-white-20 mb-4 tracking-widest px-2">
          <Hash size={10} /> Group Jump
        </div>
        {groupKeys.map((key, i) => (
          <button 
            key={i} 
            id={`jump-btn-${key}`}
            className={`text-left text-[11px] p-2.5 rounded-lg cursor-pointer transition-all truncate font-bold ${activeGroup === key ? 'bg-accent text-white shadow-xl translate-x-1' : 'bg-transparent text-white-30 hover:bg-white-5 hover:text-white-60'}`}
            onClick={() => jumpTo(key)}
            title={key}
          >
            {key}
          </button>
        ))}
        {groupKeys.length === 0 && (
          <div className="px-2 text-9px text-white/10 italic">No groups found</div>
        )}
      </aside>
    </div>
  );
};
