/**
 * TagEditor.tsx — Image region tagger dialog.
 * Draw rectangles on images, assign to a person node, optionally use as profile.
 * Existing regions can be dragged (move) or resized (corner handles).
 * Supports navigating through a list of resources (prev/next + arrow keys).
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { Resource, Region, Rect } from '../../models/types';
import { useTreeStore } from '../../store/treeStore';
import { getImageUrl } from '../../db/storageAdapter';

interface Props {
  resources: Resource[];   // full list to navigate through
  initialIndex: number;    // which one was clicked
  onClose: () => void;
}

type Page = 'normal' | 'tagging';

type DragMode =
  | { kind: 'move'; startMouse: { x: number; y: number }; origRect: Rect }
  | { kind: 'resize'; handle: string; startMouse: { x: number; y: number }; origRect: Rect };

export default function TagEditor({ resources: resourceList, initialIndex, onClose }: Props) {
  const activeTree = useTreeStore((s) => s.activeTree);
  const activeFolder = useTreeStore((s) => s.activeFolder);
  const { updateResource, updateNode } = useTreeStore();

  // ── Navigation index ────────────────────────────────────────────────────────
  const [listIndex, setListIndex] = useState(initialIndex);
  const initialResourceRaw = resourceList[listIndex] ?? resourceList[0];
  const initialResource = activeTree?.resources.find(r => r.id === initialResourceRaw?.id) || initialResourceRaw;

  // ── Per-photo state ─────────────────────────────────────────────────────────
  const [resource, setResource] = useState<Resource>(initialResource);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('normal');

  const [date, setDate] = useState(initialResource.tags.date ?? '');
  const [location, setLocation] = useState(initialResource.tags.location ?? '');
  const [customTags, setCustomTags] = useState((initialResource.tags?.custom_tags || []).join(', '));
  const [filename, setFilename] = useState(initialResource.filename);

  // isDirty tracks unsaved metadata edits
  const isDirty = useRef(false);
  const savedMeta = useRef({ date: initialResource.tags?.date ?? '', location: initialResource.tags?.location ?? '', customTags: (initialResource.tags?.custom_tags || []).join(', '), filename: initialResource.filename });

  const checkDirty = useCallback(() =>
    date !== savedMeta.current.date ||
    location !== savedMeta.current.location ||
    customTags !== savedMeta.current.customTags ||
    filename !== savedMeta.current.filename ||
    isDirty.current,
  [date, location, customTags, filename]);

  // ── Drawing state ───────────────────────────────────────────────────────────
  const drawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<Rect | null>(null);

  // ── Drag/resize ─────────────────────────────────────────────────────────────
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const dragModeRef = useRef<DragMode | null>(null);

  // ── Tagging state ────────────────────────────────────────────────────────────
  const [selectedRegionIdx, setSelectedRegionIdx] = useState<number | null>(null);
  const [tagNodeId, setTagNodeId] = useState('');
  const [tagNewName, setTagNewName] = useState('');
  const [tagUseAsProfile, setTagUseAsProfile] = useState(false);
  const [pendingRect, setPendingRect] = useState<Rect | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const imgRef = useRef<HTMLImageElement>(null);

  // ── Load image URL when resource/index changes ────────────────────────────
  useEffect(() => {
    if (!activeFolder) return;
    getImageUrl(activeFolder, resource.id, resource.filename).then(setImgUrl);
  }, [resource.id, resource.filename, activeFolder]);

  // ── Switch to a different resource in the list ────────────────────────────
  const switchTo = useCallback((newIdx: number) => {
    if (newIdx < 0 || newIdx >= resourceList.length) return;
    if (page === 'tagging' && (pendingRect || selectedRegionIdx !== null)) {
      alert('Please save or cancel your region drawing first.');
      return;
    }
    // Prompt if there are unsaved changes
    if (checkDirty()) {
      const save = window.confirm('You have unsaved changes. Save before switching?');
      if (save) {
        const updated: Resource = {
          ...resource,
          filename,
          tags: { ...resource.tags, date: date || null, location: location || null, custom_tags: customTags.split(',').map((t) => t.trim()).filter(Boolean) },
        };
        updateResource(updated);
      }
    }
    const nextRaw = resourceList[newIdx];
    const next = useTreeStore.getState().activeTree?.resources.find(r => r.id === nextRaw?.id) || nextRaw;
    setListIndex(newIdx);
    setResource(next);
    setImgUrl(null);
    setDate(next.tags?.date ?? '');
    setLocation(next.tags?.location ?? '');
    setCustomTags((next.tags?.custom_tags || []).join(', '));
    setFilename(next.filename);
    savedMeta.current = { date: next.tags?.date ?? '', location: next.tags?.location ?? '', customTags: (next.tags?.custom_tags || []).join(', '), filename: next.filename };
    isDirty.current = false;
    setPage('normal');
    setPendingRect(null);
    setSelectedRegionIdx(null);
    setDrawRect(null);
    drawingRef.current = false;
    drawStartRef.current = null;
  }, [page, pendingRect, selectedRegionIdx, resourceList, checkDirty, resource, filename, date, location, customTags, updateResource]);

  // ── Safe close with dirty check ────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (page === 'tagging' && (pendingRect || selectedRegionIdx !== null)) {
      alert('Please save or cancel your region drawing first.');
      return;
    }
    if (checkDirty()) {
      const save = window.confirm('You have unsaved changes. Save before closing?');
      if (save) {
        const updated: Resource = {
          ...resource,
          filename,
          tags: { ...resource.tags, date: date || null, location: location || null, custom_tags: customTags.split(',').map((t) => t.trim()).filter(Boolean) },
        };
        updateResource(updated);
      }
    }
    onClose();
  }, [page, pendingRect, selectedRegionIdx, checkDirty, resource, filename, date, location, customTags, updateResource, onClose]);

  // ── Escape key ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (drawingRef.current) {
        drawingRef.current = false;
        drawStartRef.current = null;
        setDrawRect(null);
      } else if (page === 'tagging') {
        setPage('normal');
        setPendingRect(null);
        setSelectedRegionIdx(null);
      } else {
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [page, handleClose]);

  // ── Arrow keys for prev/next photo (only in normal page, not tagging) ──────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (page !== 'normal') return;
      // Don't intercept arrows if user is typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') switchTo(listIndex - 1);
      if (e.key === 'ArrowRight') switchTo(listIndex + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [page, listIndex, switchTo]);

  // ── Coordinate helper ────────────────────────────────────────────────────────
  const getRelPos = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100)),
    };
  }, []);

  // ── Draw new region ──────────────────────────────────────────────────────────
  const handleImgMouseDown = (e: React.MouseEvent) => {
    if (page !== 'tagging' || selectedRegionIdx !== null || pendingRect !== null) return;
    e.preventDefault();
    const pos = getRelPos(e.clientX, e.clientY);
    if (!pos) return;
    drawingRef.current = true;
    drawStartRef.current = pos;
    setDrawRect(null);
  };

  // Global mousemove/mouseup — so releasing outside image still commits
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drawingRef.current || !drawStartRef.current) return;
      const pos = getRelPos(e.clientX, e.clientY);
      if (!pos) return;
      const s = drawStartRef.current;
      const img = imgRef.current;
      if (!img) return;
      const r = img.getBoundingClientRect();
      const sizePx = Math.max(Math.abs(pos.x - s.x) * r.width / 100, Math.abs(pos.y - s.y) * r.height / 100);
      const w = (sizePx / r.width) * 100;
      const h = (sizePx / r.height) * 100;
      let x = pos.x < s.x ? s.x - w : s.x;
      let y = pos.y < s.y ? s.y - h : s.y;
      setDrawRect({ x, y, w, h });
    };
    const onUp = (e: MouseEvent) => {
      if (dragModeRef.current !== null && draggingIdx !== null) {
        dragModeRef.current = null;
        setDraggingIdx(null);
        return;
      }
      if (!drawingRef.current || !drawStartRef.current) return;
      drawingRef.current = false;
      const pos = getRelPos(e.clientX, e.clientY);
      const s = drawStartRef.current;
      drawStartRef.current = null;
      setDrawRect(null);

      const img = imgRef.current;
      if (!pos || !s || !img) return;
      const r = img.getBoundingClientRect();
      const sizePx = Math.max(Math.abs(pos.x - s.x) * r.width / 100, Math.abs(pos.y - s.y) * r.height / 100);
      const w = (sizePx / r.width) * 100;
      const h = (sizePx / r.height) * 100;
      let x = pos.x < s.x ? s.x - w : s.x;
      let y = pos.y < s.y ? s.y - h : s.y;

      const rect: Rect = { x, y, w, h };
      if (rect.w < 2 || rect.h < 2) return;
      setPendingRect(rect);
      setTagNodeId('');
      setTagNewName('');
      setTagUseAsProfile(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [getRelPos, draggingIdx]);

  // ── Drag/resize existing regions ─────────────────────────────────────────────
  const startMove = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation(); e.preventDefault();
    const pos = getRelPos(e.clientX, e.clientY);
    if (!pos) return;
    dragModeRef.current = { kind: 'move', startMouse: pos, origRect: { ...resource.regions[idx].rect } };
    setDraggingIdx(idx);
  };

  const startResize = (e: React.MouseEvent, idx: number, handle: string) => {
    e.stopPropagation(); e.preventDefault();
    const pos = getRelPos(e.clientX, e.clientY);
    if (!pos) return;
    dragModeRef.current = { kind: 'resize', handle, startMouse: pos, origRect: { ...resource.regions[idx].rect } };
    setDraggingIdx(idx);
  };

  useEffect(() => {
    if (draggingIdx === null) return;
    const onMove = (e: MouseEvent) => {
      const mode = dragModeRef.current;
      if (!mode) return;
      const pos = getRelPos(e.clientX, e.clientY);
      if (!pos) return;
      const dx = pos.x - mode.startMouse.x;
      const dy = pos.y - mode.startMouse.y;
      const o = mode.origRect;
      let newRect: Rect;
      if (mode.kind === 'move') {
        newRect = { x: Math.max(0, Math.min(100 - o.w, o.x + dx)), y: Math.max(0, Math.min(100 - o.h, o.y + dy)), w: o.w, h: o.h };
      } else {
        let { x, y, w, h } = o;
        const hh = mode.handle;
        if (hh.includes('e')) w = Math.max(2, o.w + dx);
        if (hh.includes('s')) h = Math.max(2, o.h + dy);
        if (hh.includes('w')) { x = o.x + dx; w = Math.max(2, o.w - dx); }
        if (hh.includes('n')) { y = o.y + dy; h = Math.max(2, o.h - dy); }

        const img = imgRef.current;
        if (img) {
          const r = img.getBoundingClientRect();
          const sidePx = Math.max(w * r.width/100, h * r.height/100);
          w = (sidePx / r.width) * 100;
          h = (sidePx / r.height) * 100;
          if (hh.includes('w')) x = (o.x + o.w) - w;
          if (hh.includes('n')) y = (o.y + o.h) - h;
        }

        newRect = { x, y, w, h };
      }
      setResource((prev) => ({ ...prev, regions: prev.regions.map((r, i) => i === draggingIdx ? { ...r, rect: newRect } : r) }));
      isDirty.current = true;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [draggingIdx, getRelPos]);

  // ── Save tag ─────────────────────────────────────────────────────────────────
  const handleSaveTag = () => {
    const rect = pendingRect ?? (selectedRegionIdx !== null ? resource.regions[selectedRegionIdx].rect : null);
    if (!rect) return;
    let resolvedNodeId = tagNodeId;
    if (!resolvedNodeId && tagNewName) resolvedNodeId = `__orphan__:${tagNewName}`;
    if (!resolvedNodeId) return;
    const region: Region = { node_id: resolvedNodeId, rect, use_as_profile: tagUseAsProfile };
    const newRegions = selectedRegionIdx !== null
      ? resource.regions.map((r, i) => i === selectedRegionIdx ? region : r)
      : [...resource.regions, region];
    let newPersons = [...resource.tags.persons];
    if (!resolvedNodeId.startsWith('__orphan__') && !newPersons.includes(resolvedNodeId)) newPersons.push(resolvedNodeId);
    const updated: Resource = { ...resource, regions: newRegions, tags: { ...resource.tags, persons: newPersons } };
    setResource(updated);
    isDirty.current = true;
    if (tagUseAsProfile && !resolvedNodeId.startsWith('__orphan__')) {
      const treeNode = activeTree?.nodes.find((n) => n.id === resolvedNodeId);
      if (treeNode) {
        // use `filename` state because user may have changed it
        updateNode({ ...treeNode, profile_image_ref: `resources/${filename}?rect=${rect.x},${rect.y},${rect.w},${rect.h}` });
      }
    }
    setPendingRect(null);
    setSelectedRegionIdx(null);
    setPage('normal');
  };

  // ── Save metadata ────────────────────────────────────────────────────────────
  const handleSaveMeta = () => {
    setSaveStatus('saving');
    const updated: Resource = {
      ...resource, filename,
      tags: { ...resource.tags, date: date || null, location: location || null, custom_tags: customTags.split(',').map((t) => t.trim()).filter(Boolean) },
    };
    setResource(updated);
    updateResource(updated);
    savedMeta.current = { date: date, location, customTags, filename };
    isDirty.current = false;
    setTimeout(() => setSaveStatus('saved'), 50);
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  const nodes = activeTree?.nodes ?? [];
  const nodeLabel = (nodeId: string): string => {
    if (nodeId.startsWith('__orphan__:')) return `⚠ ${nodeId.slice(11)} (deleted node)`;
    const n = nodes.find((x) => x.id === nodeId);
    return n?.name ?? nodeId;
  };

  const HANDLES: { id: string; style: React.CSSProperties }[] = [
    { id: 'nw', style: { top: -4, left: -4, cursor: 'nw-resize' } },
    { id: 'n',  style: { top: -4, left: 'calc(50% - 4px)', cursor: 'n-resize' } },
    { id: 'ne', style: { top: -4, right: -4, cursor: 'ne-resize' } },
    { id: 'e',  style: { top: 'calc(50% - 4px)', right: -4, cursor: 'e-resize' } },
    { id: 'se', style: { bottom: -4, right: -4, cursor: 'se-resize' } },
    { id: 's',  style: { bottom: -4, left: 'calc(50% - 4px)', cursor: 's-resize' } },
    { id: 'sw', style: { bottom: -4, left: -4, cursor: 'sw-resize' } },
    { id: 'w',  style: { top: 'calc(50% - 4px)', left: -4, cursor: 'w-resize' } },
  ];

  const hasPrev = listIndex > 0;
  const hasNext = listIndex < resourceList.length - 1;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      // No click-outside-to-close — only ✕ or Escape (both dirty-check protected)
    >
      <div style={{ background: '#fff', borderRadius: 14, width: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

        {/* Header with prev/next nav */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 10, background: '#f8f9fa' }}>
          <button onClick={() => switchTo(listIndex - 1)} disabled={!hasPrev}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: hasPrev ? '#fff' : '#f5f5f5', cursor: hasPrev ? 'pointer' : 'default', fontSize: 16, opacity: hasPrev ? 1 : 0.35, lineHeight: 1 }}>←</button>
          <button onClick={() => switchTo(listIndex + 1)} disabled={!hasNext}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: hasNext ? '#fff' : '#f5f5f5', cursor: hasNext ? 'pointer' : 'default', fontSize: 16, opacity: hasNext ? 1 : 0.35, lineHeight: 1 }}>→</button>
          <span style={{ fontSize: 12, color: '#999', whiteSpace: 'nowrap' }}>{listIndex + 1} / {resourceList.length}</span>
          <h3 style={{ margin: 0, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            🏷 {resource.filename}
          </h3>
          {page === 'tagging' && (
            <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>
              {pendingRect ? '🏷 Assign person' : selectedRegionIdx !== null ? '✏ Drag/resize on image' : '✏ Draw on image · Esc cancel'}
            </span>
          )}
          <button onClick={handleClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Image area */}
          <div style={{
            flex: 1, position: 'relative', overflow: 'hidden', background: '#111',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: page === 'tagging' && !pendingRect && selectedRegionIdx === null ? 'crosshair' : 'default',
          }}>
            {hasPrev && (
              <button onClick={() => switchTo(listIndex - 1)}
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 10,
                  background: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', fontSize: 22,
                  borderRadius: 8, padding: '8px 12px', cursor: 'pointer', lineHeight: 1 }}>←</button>
            )}
            {hasNext && (
              <button onClick={() => switchTo(listIndex + 1)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 10,
                  background: 'rgba(0,0,0,0.45)', border: 'none', color: '#fff', fontSize: 22,
                  borderRadius: 8, padding: '8px 12px', cursor: 'pointer', lineHeight: 1 }}>→</button>
            )}

            {imgUrl ? (
              <div style={{ position: 'relative', display: 'inline-block' }} onMouseDown={handleImgMouseDown}>
                <img ref={imgRef} src={imgUrl} alt={resource.filename}
                  style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 110px)', display: 'block', userSelect: 'none' }}
                  draggable={false} />

                {resource.regions.map((reg, i) => {
                  const isSelected = selectedRegionIdx === i;
                  const color = isSelected ? '#FF6600' : '#2196F3';
                  return (
                    <div key={i}
                      style={{
                        position: 'absolute', left: `${reg.rect.x}%`, top: `${reg.rect.y}%`,
                        width: `${reg.rect.w}%`, height: `${reg.rect.h}%`,
                        border: `2px solid ${color}`, boxSizing: 'border-box',
                        cursor: draggingIdx === i ? 'grabbing' : 'grab',
                        background: isSelected ? '#FF660020' : '#2196F320', userSelect: 'none',
                      }}
                      onMouseDown={(e) => startMove(e, i)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (dragModeRef.current) return;
                        setSelectedRegionIdx(i);
                        setTagNodeId(reg.node_id.startsWith('__orphan__') ? '' : reg.node_id);
                        setTagUseAsProfile(reg.use_as_profile);
                        setPendingRect(null);
                        setPage('tagging');
                      }}
                    >
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1px solid ${color}`, opacity: reg.use_as_profile || isSelected ? 0.8 : 0.4, pointerEvents: 'none' }} />
                      <span style={{ position: 'absolute', bottom: 2, left: 2, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, padding: '1px 4px', borderRadius: 3, pointerEvents: 'none' }}>
                        {nodeLabel(reg.node_id)}
                      </span>
                      {isSelected && HANDLES.map(({ id, style }) => (
                        <div key={id} onMouseDown={(e) => startResize(e, i, id)}
                          style={{ position: 'absolute', width: 8, height: 8, background: '#FF6600', border: '1px solid #fff', borderRadius: 2, ...style }} />
                      ))}
                    </div>
                  );
                })}

                {drawRect && (
                  <div style={{ position: 'absolute', left: `${drawRect.x}%`, top: `${drawRect.y}%`, width: `${drawRect.w}%`, height: `${drawRect.h}%`,
                    border: '2px dashed #FF6600', boxSizing: 'border-box', pointerEvents: 'none', background: 'rgba(255,102,0,0.1)' }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px dashed #FF6600', opacity: 0.6 }} />
                  </div>
                )}
                {pendingRect && (
                  <div style={{ position: 'absolute', left: `${pendingRect.x}%`, top: `${pendingRect.y}%`, width: `${pendingRect.w}%`, height: `${pendingRect.h}%`,
                    border: '2px solid #FF6600', boxSizing: 'border-box', pointerEvents: 'none', background: 'rgba(255,102,0,0.15)' }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px dashed #FF6600', opacity: 0.6 }} />
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: '#888', fontSize: 14 }}>Loading…</div>
            )}
          </div>

          {/* Right panel */}
          <div style={{ width: 280, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #eee' }}>
            {page === 'normal' ? (
              <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button onClick={() => { setPage('tagging'); setPendingRect(null); setSelectedRegionIdx(null); }}
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #1565C0', color: '#1565C0', background: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  ✏ Draw Region
                </button>

                <div style={{ fontSize: 13, fontWeight: 700, color: '#555' }}>Tagged Regions</div>
                {resource.regions.length === 0 && (
                  <div style={{ fontSize: 12, color: '#999' }}>No regions yet. Click Draw Region to add one.</div>
                )}
                {resource.regions.map((reg, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ flex: 1, fontSize: 12, color: reg.node_id.startsWith('__orphan__') ? '#e67e22' : '#222' }}>
                      {nodeLabel(reg.node_id)}
                    </span>
                    <button onClick={() => { setSelectedRegionIdx(i); setTagNodeId(reg.node_id.startsWith('__orphan__') ? '' : reg.node_id); setTagUseAsProfile(reg.use_as_profile); setPendingRect(null); setPage('tagging'); }}
                      style={{ padding: '2px 7px', borderRadius: 4, border: '1px solid #ccc', background: 'none', cursor: 'pointer', fontSize: 11 }}>✏</button>
                    <button onClick={() => { 
                      const regToRemove = resource.regions[i];
                      const nodeId = regToRemove.node_id;
                      setResource((prev) => ({ ...prev, regions: prev.regions.filter((_, idx) => idx !== i) })); 
                      isDirty.current = true; 
                      if (!nodeId.startsWith('__orphan__')) {
                        const treeNode = activeTree?.nodes.find(n => n.id === nodeId);
                        if (treeNode?.profile_image_ref && treeNode.profile_image_ref.includes(`resources/${filename}`)) {
                          updateNode({ ...treeNode, profile_image_ref: null });
                        }
                      }
                    }}
                      style={{ padding: '2px 7px', borderRadius: 4, border: 'none', background: '#fee', color: '#c00', cursor: 'pointer', fontSize: 11 }}>✕</button>
                  </div>
                ))}

                <div style={{ fontSize: 13, fontWeight: 700, color: '#555', marginTop: 8 }}>Metadata</div>
                <SmField label="Date" value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
                <SmField label="Location" value={location} onChange={setLocation} placeholder="City, Country" />
                <SmField label="Custom tags" value={customTags} onChange={setCustomTags} placeholder="comma, separated" />

                <div style={{ fontSize: 13, fontWeight: 700, color: '#555', marginTop: 8 }}>Filename</div>
                <SmField label="Current" value={filename} onChange={setFilename} />
                {resource.original_filename && resource.original_filename !== filename && (
                  <button onClick={() => setFilename(resource.original_filename)}
                    style={{ fontSize: 11, color: '#1565C0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                    ↩ Restore original: {resource.original_filename}
                  </button>
                )}

                <button onClick={handleSaveMeta}
                  style={{ marginTop: 'auto', padding: '9px 0', borderRadius: 7, border: 'none', background: saveStatus === 'saved' ? '#2e7d32' : '#1565C0', color: '#fff', fontWeight: 700, cursor: 'pointer', transition: 'background 0.3s' }}>
                  {saveStatus === 'saved' ? '✔ Saved!' : '💾 Save Metadata'}
                </button>
              </div>
            ) : (
              <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {selectedRegionIdx !== null ? '✏ Edit Tag' : pendingRect ? '🏷 Assign Person' : '🖊 Draw on image…'}
                </div>
                {(pendingRect || selectedRegionIdx !== null) && (
                  <>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Person</label>
                      <select value={tagNodeId} onChange={(e) => setTagNodeId(e.target.value)}
                        style={{ width: '100%', padding: '7px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }}>
                        <option value="">— select or type new name —</option>
                        {nodes.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                      </select>
                    </div>
                    {!tagNodeId && <SmField label="Or new person name" value={tagNewName} onChange={setTagNewName} placeholder="Full name" />}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input type="checkbox" checked={tagUseAsProfile} onChange={(e) => setTagUseAsProfile(e.target.checked)} />
                      Use as profile image
                    </label>
                  </>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                  {(pendingRect || selectedRegionIdx !== null) && (
                    <button onClick={handleSaveTag}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 7, border: 'none', background: '#1565C0', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                      ✔ Save Tag
                    </button>
                  )}
                  <button onClick={() => { setPage('normal'); setPendingRect(null); setSelectedRegionIdx(null); }}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 7, border: '1px solid #ccc', background: '#f5f5f5', cursor: 'pointer' }}>
                    ✖ Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SmField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#777', display: 'block', marginBottom: 2 }}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid #ccc', fontSize: 12, boxSizing: 'border-box' }} />
    </div>
  );
}
