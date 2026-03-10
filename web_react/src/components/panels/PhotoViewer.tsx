/**
 * PhotoViewer.tsx — Dark full-screen lightbox for browsing photos.
 * Arrow keys + prev/next buttons, Esc to close, counter display.
 */
import { useEffect, useState } from 'react';

interface Photo {
  url: string;
  filename: string;
}

interface Props {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
}

export default function PhotoViewer({ photos, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);

  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const next = () => setIndex((i) => Math.min(photos.length - 1, i + 1));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(photos.length - 1, i + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, photos.length]);

  const photo = photos[index];
  if (!photo) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 5000,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 20, right: 24,
          background: 'none', border: 'none', color: '#fff',
          fontSize: 32, cursor: 'pointer', lineHeight: 1,
        }}
      >
        ✕
      </button>

      {/* Counter */}
      <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)',
        color: '#ccc', fontSize: 13 }}>
        {index + 1} / {photos.length} — {photo.filename}
      </div>

      {/* Prev button */}
      <button
        onClick={prev}
        disabled={index === 0}
        style={{
          position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
          fontSize: 28, cursor: index === 0 ? 'default' : 'pointer',
          borderRadius: 8, padding: '8px 14px', opacity: index === 0 ? 0.3 : 1,
        }}
      >
        ←
      </button>

      {/* Image */}
      <img
        src={photo.url}
        alt={photo.filename}
        style={{
          maxWidth: 'calc(100vw - 160px)',
          maxHeight: 'calc(100vh - 100px)',
          objectFit: 'contain',
          borderRadius: 6,
          boxShadow: '0 4px 32px rgba(0,0,0,0.6)',
        }}
      />

      {/* Next button */}
      <button
        onClick={next}
        disabled={index === photos.length - 1}
        style={{
          position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
          fontSize: 28, cursor: index === photos.length - 1 ? 'default' : 'pointer',
          borderRadius: 8, padding: '8px 14px',
          opacity: index === photos.length - 1 ? 0.3 : 1,
        }}
      >
        →
      </button>
    </div>
  );
}
