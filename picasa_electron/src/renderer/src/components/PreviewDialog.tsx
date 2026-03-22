import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Play, MapPin, Save, RotateCcw, Info, Edit2, Check, Globe } from 'lucide-react';

interface Photo {
  id?: string;
  absPath: string;
  rel: string;
  size: number;
  mtime: number;
  type: 'image' | 'video';
  dateTaken?: number;
  lat?: number;
  lon?: number;
  location?: any;
  camera?: string;
}

interface PreviewDialogProps {
  photo: Photo;
  allPhotos: Photo[];
  onClose: () => void;
  onNavigate: (index: number) => void;
  onSaveLocation: (photo: Photo, lat: number, lon: number, location: any) => void;
}

export const PreviewDialog: React.FC<PreviewDialogProps> = ({ photo, allPhotos, onClose, onNavigate, onSaveLocation }) => {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  
  const [editedLocation, setEditedLocation] = useState(photo.location || {});
  const [editedLat, setEditedLat] = useState(photo.lat || 0);
  const [editedLon, setEditedLon] = useState(photo.lon || 0);
  const [fullExif, setFullExif] = useState<any>(null);
  const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
  const [isEditingExif, setIsEditingExif] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentIndex = allPhotos.findIndex(p => p.absPath === photo.absPath);

  // Manual wheel listener for zooming
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        setScale(prev => Math.max(0.1, Math.min(prev * factor, 10)));
      } else if (scale > 1) {
        setOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [scale]);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setEditedLocation(photo.location || {});
    setEditedLat(photo.lat || 0);
    setEditedLon(photo.lon || 0);
    setFullExif(null);
    setDimensions({ w: 0, h: 0 });
    
    (window as any).api.getExif(photo.absPath).then((tags: any) => {
      setFullExif(tags);
    });
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate((currentIndex - 1 + allPhotos.length) % allPhotos.length);
      if (e.key === 'ArrowRight') onNavigate((currentIndex + 1) % allPhotos.length);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photo.absPath, currentIndex]);

  const handleImgLoad = () => {
    if (imgRef.current) {
      setDimensions({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsPanning(true);
      setLastPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastPos.x;
      const dy = e.clientY - lastPos.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPos({ x: e.clientX, y: e.clientY });
    }
  };

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + 
           String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#1c2128',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '4px',
    padding: '6px 10px',
    color: '#adbac7',
    fontSize: '11px',
    width: '100%',
    outline: 'none'
  };

  return (
    <div className="fixed inset-0 z-[5000] bg-[#0d1117] flex flex-col h-screen overflow-hidden text-[#adbac7] font-sans">
      {/* Header */}
      <div className="flex-none h-[52px] bg-[#161b22] border-b border-white-5 flex items-center justify-between z-[60]">
        <div className="flex items-center">
          <button onClick={onClose} className="w-[52px] h-[52px] bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors">
            <X size={24} strokeWidth={3} />
          </button>
          <div className="ml-4 flex flex-col">
            <span className="text-[14px] font-black text-white leading-tight">{photo.rel.split('/').pop()}</span>
            <span className="text-[12px] text-white-40 font-bold uppercase">{currentIndex + 1} / {allPhotos.length}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 px-6">
           <div className="flex items-center bg-black-40 rounded px-1 border border-white-10">
              <button onClick={() => setScale(s => Math.max(0.1, s * 0.8))} className="p-2 hover:bg-white-10 rounded"><ZoomOut size={16} /></button>
              <div className="w-[60px] text-center text-[12px] font-black text-white">{Math.round(scale * 100)}%</div>
              <button onClick={() => setScale(s => Math.min(10, s * 1.2))} className="p-2 hover:bg-white-10 rounded"><ZoomIn size={16} /></button>
           </div>
        </div>
      </div>

      {/* Body Container */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        
        {/* Content Area */}
        <div 
          ref={containerRef}
          style={{ flex: 1, minWidth: 0, position: 'relative', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={() => setIsPanning(false)}
          onMouseLeave={() => setIsPanning(false)}
        >
          {/* Symmetrical Navigation Controls */}
          <div className="absolute left-0 top-0 bottom-0 w-[80px] flex items-center justify-center z-50 group">
             <button onClick={(e) => { e.stopPropagation(); onNavigate((currentIndex - 1 + allPhotos.length) % allPhotos.length); }} className="w-12 h-16 bg-accent text-white rounded-r-xl opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
               <ChevronLeft size={32} strokeWidth={3} />
             </button>
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-[80px] flex items-center justify-center z-50 group">
             <button onClick={(e) => { e.stopPropagation(); onNavigate((currentIndex + 1) % allPhotos.length); }} className="w-12 h-16 bg-accent text-white rounded-l-xl opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
               <ChevronRight size={32} strokeWidth={3} />
             </button>
          </div>

          {photo.type === 'image' ? (
            <img 
              ref={imgRef}
              src={`file://${photo.absPath}`}
              onLoad={handleImgLoad}
              style={{ 
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                maxWidth: '96%',
                maxHeight: '96%',
                objectFit: 'contain',
                pointerEvents: scale > 1 ? 'none' : 'auto'
              }}
              draggable={false}
            />
          ) : (
            <button onClick={() => (window as any).api.openFolderDialog({ title: 'System Player' })} className="px-10 py-4 bg-accent hover:bg-accent-hover text-white rounded text-lg font-black uppercase tracking-widest">
               Open System Player
            </button>
          )}
        </div>

        {/* Sidebar - Locked at 360px */}
        <div style={{ width: '360px', flex: 'none', backgroundColor: '#0d1117', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
           <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-10">
              
              <section className="space-y-6">
                 <div className="flex items-center gap-3 text-accent border-b border-white-5 pb-2">
                    <MapPin size={18} />
                    <h3 className="text-[13px] font-black uppercase tracking-widest">Location</h3>
                 </div>

                 <div className="space-y-4">
                    <div>
                       <label className="text-[10px] uppercase font-black text-white-20 mb-1 block">GPS Coordinates</label>
                       <div className="flex gap-2">
                          <input style={inputStyle} value={editedLat} onChange={e => setEditedLat(parseFloat(e.target.value))} />
                          <input style={inputStyle} value={editedLon} onChange={e => setEditedLon(parseFloat(e.target.value))} />
                       </div>
                    </div>
                    <div>
                       <label className="text-[10px] uppercase font-black text-white-20 mb-1 block">City & State</label>
                       <div className="flex gap-2">
                          <input style={inputStyle} value={editedLocation.city || ''} onChange={e => setEditedLocation({ ...editedLocation, city: e.target.value })} />
                          <input style={inputStyle} value={editedLocation.state || ''} onChange={e => setEditedLocation({ ...editedLocation, state: e.target.value })} />
                       </div>
                    </div>
                    <div>
                       <label className="text-[10px] uppercase font-black text-white-20 mb-1 block">Address</label>
                       <textarea 
                          style={{ ...inputStyle, minHeight: '80px', resize: 'none' }} 
                          value={editedLocation.display || ''} 
                          onChange={e => setEditedLocation({ ...editedLocation, display: e.target.value })} 
                       />
                    </div>
                 </div>

                 <div className="space-y-3">
                    <button className="w-full py-2 bg-accent/10 border border-accent/20 text-accent rounded text-[11px] font-black uppercase tracking-widest hover:bg-accent/20 transition-all">
                       <Globe size={14} className="inline mr-2" /> Gen Coordinates
                    </button>
                    <div className="flex gap-2">
                       <button onClick={() => onSaveLocation(photo, editedLat, editedLon, editedLocation)} className="flex-1 py-2.5 bg-green-600/30 border border-green-600/40 text-green-400 rounded text-[11px] font-black uppercase">Save</button>
                       <button onClick={() => setEditedLocation(photo.location || {})} className="flex-1 py-2.5 bg-white-5 border border-white-10 text-white-40 rounded text-[11px] font-black uppercase">Cancel</button>
                    </div>
                 </div>
              </section>

              <section className="space-y-4">
                 <div className="flex justify-between items-center text-purple-400 border-b border-white-5 pb-2">
                    <div className="flex items-center gap-3">
                       <Info size={18} />
                       <h3 className="text-[13px] font-black uppercase tracking-widest">Metadata</h3>
                    </div>
                    <button onClick={() => setIsEditingExif(!isEditingExif)} className="px-3 py-1 bg-white-5 hover:bg-white-10 rounded text-[10px] font-black uppercase">Edit</button>
                 </div>

                 <div className="bg-black/30 border border-white-5 rounded-lg overflow-hidden">
                    <table className="w-full text-[10px] border-collapse font-sans">
                       <tbody className="divide-y divide-white-5">
                          {fullExif ? Object.entries(fullExif).filter(([k]) => typeof fullExif[k] !== 'object' && !['SourceFile','Directory','FileName'].includes(k)).slice(0, 100).map(([k, v]) => (
                             <tr key={k} className="hover:bg-white-5 transition-colors">
                                <td className="px-3 py-1 text-white-30 truncate border-r border-white-5 w-[130px] font-bold">{k}</td>
                                <td className="px-3 py-1 text-white-70 truncate max-w-[170px]">{String(v)}</td>
                             </tr>
                          )) : (
                             <tr><td colSpan={2} className="px-4 py-10 text-center opacity-20 italic">Loading tags...</td></tr>
                          )}
                       </tbody>
                    </table>
                 </div>
              </section>
           </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-none h-[40px] bg-[#161b22] border-t border-white-5 flex items-center px-6 gap-6 text-[12px] font-bold text-white-40">
        <span className="cursor-pointer hover:text-white" onClick={() => copyToClipboard(formatSize(photo.size))}>{formatSize(photo.size)}</span>
        <span className="opacity-10">|</span>
        <span className="cursor-pointer hover:text-white" onClick={() => copyToClipboard(formatDate(photo.dateTaken || photo.mtime))}>{formatDate(photo.dateTaken || photo.mtime)}</span>
        <span className="opacity-10">|</span>
        <span className="text-white-60">{dimensions.w} x {dimensions.h} PX</span>
        <div className="flex-1 truncate font-mono text-[10px] opacity-30 select-text" onClick={() => copyToClipboard(photo.absPath)}>{photo.absPath}</div>
        <button onClick={onClose} className="px-6 h-7 bg-accent text-white rounded text-[11px] font-black uppercase tracking-widest hover:bg-accent-hover transition-all flex items-center gap-2">
           <Check size={14} strokeWidth={4} /> Close
        </button>
      </div>
    </div>
  );
};
