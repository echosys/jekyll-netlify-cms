import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Play, MapPin, Save, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [showLocationPanel, setShowLocationPanel] = useState(false);
  const [editedLocation, setEditedLocation] = useState(photo.location || {});
  const [editedLat, setEditedLat] = useState(photo.lat || 0);
  const [editedLon, setEditedLon] = useState(photo.lon || 0);
  const [geocodingStatus, setGeocodingStatus] = useState<string>('');

  const imgRef = useRef<HTMLImageElement>(null);
  const currentIndex = allPhotos.findIndex(p => p.absPath === photo.absPath);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setEditedLocation(photo.location || {});
    setEditedLat(photo.lat || 0);
    setEditedLon(photo.lon || 0);
    setGeocodingStatus('');
    
    // Keyboard navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate((currentIndex - 1 + allPhotos.length) % allPhotos.length);
      if (e.key === 'ArrowRight') onNavigate((currentIndex + 1) % allPhotos.length);
      if (e.key === '+' || e.key === '=') zoom(1.2);
      if (e.key === '-') zoom(0.8);
      if (e.key === '0') resetZoom();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photo, currentIndex]);

  const zoom = (factor: number) => {
    setScale(prev => Math.max(0.1, Math.min(prev * factor, 10)));
  };

  const resetZoom = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
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

  const handleMouseUp = () => setIsPanning(false);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.1 : 0.9);
    } else if (scale > 1) {
      setOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const openInPlayer = () => {
    // Main process handles system player anyway, but renderer can trigger it
    (window as any).api.openFolderDialog({ title: 'System Player' }); // Placeholder for opening file
  };

  const handleSave = async () => {
    onSaveLocation(photo, editedLat, editedLon, editedLocation);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[2000] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-xl h-screen overflow-hidden"
    >
      {/* Header / Toolbar */}
      <div className="w-full flex justify-between items-center p-4 h-[60px] border-b border-white/10 glass z-50">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 bg-transparent hover:bg-white/10"><X size={20} /></button>
          <div className="flex flex-col">
            <span className="text-sm font-bold truncate max-w-[300px]">{photo.rel.split('/').pop()}</span>
            <span className="text-[10px] text-muted">{currentIndex + 1} / {allPhotos.length}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {photo.type === 'image' ? (
            <>
              <button onClick={() => zoom(0.8)} className="p-2 bg-transparent hover:bg-white/10"><ZoomOut size={18} /></button>
              <span className="text-xs w-[40px] text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => zoom(1.2)} className="p-2 bg-transparent hover:bg-white/10"><ZoomIn size={18} /></button>
              <button onClick={resetZoom} title="Reset Zoom" className="p-2 bg-transparent hover:bg-white/10"><Maximize size={18} /></button>
            </>
          ) : (
            <button onClick={openInPlayer} className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded"><Play size={16} /> Open in Player</button>
          )}
          <button onClick={() => setShowLocationPanel(!showLocationPanel)} className={`p-2 bg-transparent hover:bg-white/10 ${showLocationPanel ? 'text-accent' : ''}`}><MapPin size={20} /></button>
        </div>
      </div>

      <div className="flex-1 w-full flex overflow-hidden relative">
        {/* Navigation Buttons Overlay */}
        <div className="absolute top-1/2 left-4 z-50 -translate-y-1/2">
          <button 
            onClick={() => onNavigate((currentIndex - 1 + allPhotos.length) % allPhotos.length)}
            className="p-4 bg-black/50 hover:bg-black/80 rounded-full transition-all"
          >
            <ChevronLeft size={32} />
          </button>
        </div>
        <div className="absolute top-1/2 right-4 z-50 -translate-y-1/2">
          <button 
            onClick={() => onNavigate((currentIndex + 1) % allPhotos.length)}
            className="p-4 bg-black/50 hover:bg-black/80 rounded-full transition-all"
          >
            <ChevronRight size={32} />
          </button>
        </div>

        {/* Content Area */}
        <div 
          className="flex-1 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {photo.type === 'image' ? (
            <motion.img 
              ref={imgRef}
              src={`file://${photo.absPath}`}
              alt={photo.rel}
              style={{ 
                scale, 
                x: offset.x, 
                y: offset.y,
                maxWidth: '90%',
                maxHeight: '90%',
                objectFit: 'contain'
              }}
              draggable={false}
              transition={{ duration: 0.1 }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 bg-black/40 rounded-3xl border border-white/5 backdrop-blur-3xl" style={{ width: '400px', height: '300px' }}>
              <div className="p-6 bg-accent/20 rounded-full mb-6">
                <Play size={64} className="text-accent ml-1" />
              </div>
              <h2 className="text-xl font-bold mb-2">Video File</h2>
              <p className="text-sm text-muted text-center mb-6">In-app playback not supported. Opening requires the system player.</p>
              <button onClick={openInPlayer} className="w-full flex items-center justify-center gap-2 py-3 bg-accent hover:bg-accent-hover text-white rounded-xl">
                 <Play size={20} /> Play in System Player
              </button>
            </div>
          )}
        </div>

        {/* Location Panel (Right side) */}
        <AnimatePresence>
          {showLocationPanel && (
            <motion.div 
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              className="w-[400px] glass border-l border-white/10 p-6 flex flex-col gap-6 h-full overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2"><MapPin size={18} className="text-accent" /> Location Info</h3>
                <button onClick={() => setShowLocationPanel(false)} className="p-1 text-muted"><X size={16} /></button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted uppercase tracking-tighter text-[9px]">Latitude</span>
                    <input value={editedLat} onChange={e => setEditedLat(parseFloat(e.target.value))} className="w-full" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted uppercase tracking-tighter text-[9px]">Longitude</span>
                    <input value={editedLon} onChange={e => setEditedLon(parseFloat(e.target.value))} className="w-full" />
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-muted uppercase tracking-tighter text-[9px]">Address</span>
                  <textarea 
                    value={editedLocation.display || ''} 
                    onChange={e => setEditedLocation({ ...editedLocation, display: e.target.value })}
                    className="w-full bg-[#010409] border border-white/10 p-2 rounded text-xs min-h-[80px]"
                  />
                </div>

                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-muted uppercase tracking-tighter text-[9px]">City</span>
                  <input value={editedLocation.city || ''} onChange={e => setEditedLocation({ ...editedLocation, city: e.target.value })} className="w-full" />
                </div>
                
                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-muted uppercase tracking-tighter text-[9px]">State / Region</span>
                  <input value={editedLocation.state || ''} onChange={e => setEditedLocation({ ...editedLocation, state: e.target.value })} className="w-full" />
                </div>

                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-muted uppercase tracking-tighter text-[9px]">Country</span>
                  <input value={editedLocation.country || ''} onChange={e => setEditedLocation({ ...editedLocation, country: e.target.value })} className="w-full" />
                </div>

                <div className="pt-4 flex flex-col gap-2">
                  <button onClick={handleSave} className="w-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center gap-2"><Save size={16} /> Save to EXIF & Memory</button>
                  <button onClick={() => setEditedLocation(photo.location || {})} className="w-full bg-transparent border border-white/10 flex items-center justify-center gap-2"><RotateCcw size={16} /> Reset</button>
                </div>
                
                {geocodingStatus && (
                  <div className={`text-[10px] p-2 rounded ${geocodingStatus.includes('✗') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                    {geocodingStatus}
                  </div>
                )}
              </div>
              
              <div className="mt-auto border-t border-white/10 pt-4 flex flex-col gap-2 opacity-50 text-[10px] text-muted">
                 <div className="flex justify-between"><span>Size:</span> <span>{(photo.size / 1024 / 1024).toFixed(2)} MB</span></div>
                 <div className="flex justify-between"><span>Date:</span> <span>{new Date(photo.dateTaken || photo.mtime).toLocaleString()}</span></div>
                 {photo.camera && <div className="flex justify-between"><span>Camera:</span> <span>{photo.camera}</span></div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
