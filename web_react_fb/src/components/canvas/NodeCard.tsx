/**
 * NodeCard.tsx — Custom React Flow node component.
 * Matches the desktop NodeCard: profile thumbnail, name, years, gender colours.
 */
import React, { memo, useCallback, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TreeNode, TreeEdge, Resource } from '../../models/types';
import { GENDER_COLORS, yearsLabel, edgeColor } from '../../models/types';
import { getImageUrl } from '../../db/storageAdapter';

export const CARD_W = 180;
export const CARD_H = 80;

export interface NodeCardData {
  node: TreeNode;
  folderName: string;
  resources: Resource[];
  edges: TreeEdge[];
  allNodes: TreeNode[];
  onOpenPerson: (node: TreeNode) => void;
  onAddRelationship: (nodeId: string, type: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

const NodeCard = memo(({ data }: NodeProps) => {
  const d = data as unknown as NodeCardData;
  const { node, folderName, resources, edges, allNodes, onOpenPerson, onAddRelationship, onDeleteNode, onDeleteEdge } = d;
  const colors = GENDER_COLORS[node.gender];

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [addSubOpen, setAddSubOpen] = useState(false);
  const [delSubOpen, setDelSubOpen] = useState(false);

  useEffect(() => {
    if (!node.profile_image_ref) {
      // Only clear state if it isn't already null to avoid unnecessary re-renders
      setImgUrl((prev) => (prev === null ? prev : null));
      return;
    }
    // profile_image_ref = "resources/<filename>?rect=x,y,w,h" (optionally)
    let rawFilename = node.profile_image_ref.replace(/^resources\//, '');
    let parsedFilename = rawFilename;
    if (rawFilename.includes('?rect=')) {
      parsedFilename = rawFilename.split('?rect=')[0];
    }

    // Find resource by filename to get its real id (needed for IndexedDB key)
    const resource = resources?.find(
      (r) => r.filename === parsedFilename || r.original_filename === parsedFilename,
    );
    const resourceId = resource?.id ?? parsedFilename; // fallback to filename (fs mode ignores this)

    getImageUrl(folderName, resourceId, parsedFilename).then((url) => {
      setImgUrl(url);
    });
  }, [node.profile_image_ref, folderName, resources]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuPos({ x: e.clientX, y: e.clientY });
      setMenuOpen(true);
      setAddSubOpen(false);
      setDelSubOpen(false);
    },
    [],
  );

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setAddSubOpen(false);
    setDelSubOpen(false);
  }, []);

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        onDoubleClick={() => onOpenPerson(node)}
        style={{
          width: CARD_W,
          height: CARD_H,
          background: colors.bg,
          border: `2px solid ${colors.border}`,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          padding: '6px 10px',
          gap: 10,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          userSelect: 'none',
          position: 'relative',
        }}
      >
        {/* Profile thumbnail */}
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: '50%',
            overflow: 'hidden',
            flexShrink: 0,
            background: '#ddd',
            border: `2px solid ${colors.border}`,
            position: 'relative',
          }}
        >
          {imgUrl ? (
            (() => {
              let rectParams = null;
              if (node.profile_image_ref && node.profile_image_ref.includes('?rect=')) {
                rectParams = node.profile_image_ref.split('?rect=')[1];
              }

              if (rectParams) {
                const [rx, ry, rw, rh] = rectParams.split(',').map(Number);
                if (!isNaN(rx) && !isNaN(ry) && !isNaN(rw) && !isNaN(rh) && rw > 0 && rh > 0) {
                  return (
                    <img
                      src={imgUrl}
                      alt={node.name}
                      style={{
                        position: 'absolute',
                        left: `${-rx * 100 / rw}%`,
                        top: `${-ry * 100 / rh}%`,
                        width: `${100 * 100 / rw}%`,
                        height: `${100 * 100 / rh}%`,
                        maxWidth: 'none',
                        maxHeight: 'none',
                        objectFit: 'fill'
                      }}
                      onError={(e) => console.error('[NodeCard] img load error', e)}
                    />
                  );
                }
              }

              return (
                <img
                  src={imgUrl}
                  alt={node.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    console.error('[NodeCard] img load error', { id: node.id, src: imgUrl, err: e });
                    // Try a HEAD request to inspect response headers for diagnostics
                    (async () => {
                      try {
                        const res = await fetch(imgUrl, { method: 'HEAD' });
                        console.info('[NodeCard] img HEAD', { status: res.status, headers: Object.fromEntries(res.headers.entries()) });
                      } catch (err) {
                        console.warn('[NodeCard] img HEAD failed', err);
                      }
                    })();
                  }}
                />
              );
            })()
          ) : (
            <GenderSilhouette gender={node.gender} />
          )}
        </div>

        {/* Text */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 13,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: '#1a1a1a',
            }}
          >
            {node.name || '(unnamed)'}
          </div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
            {yearsLabel(node)}
          </div>
        </div>

        {/* React Flow handles — top/bottom for parent edges, left/right (both types) for side edges */}
        <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
        {/* Left side: both source and target so spouse/sibling/ex_spouse can connect either way */}
        <Handle type="target" position={Position.Left} id="left" style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Left} id="left-src" style={{ opacity: 0 }} />
        {/* Right side: both source and target */}
        <Handle type="source" position={Position.Right} id="right" style={{ opacity: 0 }} />
        <Handle type="target" position={Position.Right} id="right-tgt" style={{ opacity: 0 }} />
      </div>

      {/* Context menu — portalled to document.body so position:fixed coords are correct */}
      {menuOpen && ReactDOM.createPortal(
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={closeMenu}
          />
          <div
            style={{
              position: 'fixed',
              left: menuPos.x,
              top: menuPos.y,
              zIndex: 9999,
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              minWidth: 180,
              fontSize: 13,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem
              label="👤 Open Person Detail"
              onClick={() => { closeMenu(); onOpenPerson(node); }}
            />
            <div style={{ position: 'relative' }}>
              <MenuItem
                label="🔗 Add Relationship ▶"
                onClick={() => { setAddSubOpen((v) => !v); setDelSubOpen(false); }}
              />
              {addSubOpen && (
                <div
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: 0,
                    background: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    minWidth: 160,
                  }}
                >
                  {(['parent', 'child', 'spouse', 'ex_spouse', 'sibling'] as const).map((rel) => (
                    <MenuItem
                      key={rel}
                      label={relLabel(rel)}
                      onClick={() => {
                        closeMenu();
                        onAddRelationship(node.id, rel);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            {/* Delete Relationship submenu */}
            {(() => {
              const connectedEdges = (edges ?? []).filter(
                (e) => e.source === node.id || e.target === node.id,
              );
              if (connectedEdges.length === 0) return null;
              return (
                <div style={{ position: 'relative' }}>
                  <MenuItem
                    label="✂ Delete Relationship ▶"
                    onClick={() => { setDelSubOpen((v) => !v); setAddSubOpen(false); }}
                  />
                  {delSubOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        left: '100%',
                        top: 0,
                        background: '#fff',
                        border: '1px solid #ddd',
                        borderRadius: 8,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        minWidth: 220,
                        maxHeight: 260,
                        overflowY: 'auto',
                      }}
                    >
                      {connectedEdges.map((e) => {
                        const otherId = e.source === node.id ? e.target : e.source;
                        const otherNode = (allNodes ?? []).find((n) => n.id === otherId);
                        const otherName = otherNode?.name || '(unnamed)';
                        const direction = e.source === node.id ? '→' : '←';
                        const col = edgeColor(e.relationship, e.label);
                        return (
                          <div
                            key={e.id}
                            onClick={() => { closeMenu(); onDeleteEdge(e.id); }}
                            style={{
                              padding: '7px 14px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 7,
                              borderBottom: '1px solid #f5f5f5',
                              fontSize: 12,
                            }}
                            onMouseEnter={(ev) => (ev.currentTarget.style.background = '#fff0f0')}
                            onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                          >
                            <span style={{
                              display: 'inline-block',
                              width: 8, height: 8,
                              borderRadius: '50%',
                              background: col,
                              flexShrink: 0,
                            }} />
                            <span style={{ color: col, fontWeight: 600 }}>{e.label}</span>
                            <span style={{ color: '#999' }}>{direction}</span>
                            <span style={{ fontWeight: 600, color: '#222' }}>{otherName}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
            <div style={{ borderTop: '1px solid #eee', margin: '2px 0' }} />
            <MenuItem
              label="🗑 Delete Person"
              color="#c0392b"
              onClick={() => { closeMenu(); onDeleteNode(node.id); }}
            />
          </div>
        </>,
        document.body,
      )}
    </>
  );
});

function MenuItem({
  label,
  onClick,
  color,
}: {
  label: string;
  onClick: () => void;
  color?: string;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 14px',
        cursor: 'pointer',
        color: color ?? '#222',
        borderRadius: 6,
      }}
      onMouseEnter={(e) => ((e.currentTarget.style.background = '#f0f4ff'))}
      onMouseLeave={(e) => ((e.currentTarget.style.background = 'transparent'))}
    >
      {label}
    </div>
  );
}

function GenderSilhouette({ gender }: { gender: string }) {
  const paths: Record<string, string> = {
    male: 'M12 12c2.7 0 4-2 4-4s-1.3-4-4-4-4 2-4 4 1.3 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z',
    female:
      'M12 12c2.7 0 4-2 4-4s-1.3-4-4-4-4 2-4 4 1.3 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z',
    other: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
    unknown: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
  };
  const colors: Record<string, string> = {
    male: '#90CAF9',
    female: '#F48FB1',
    other: '#AED581',
    unknown: '#BDBDBD',
  };
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" style={{ padding: 6 }}>
      <path d={paths[gender] ?? paths.unknown} fill={colors[gender] ?? '#BDBDBD'} />
    </svg>
  );
}

function relLabel(rel: string): string {
  switch (rel) {
    case 'parent':   return '↑ Parent of';
    case 'child':    return '↓ Child of';
    case 'spouse':   return '💑 Spouse';
    case 'ex_spouse':return '💔 Ex-Spouse';
    case 'sibling':  return '↔ Sibling';
    default: return rel;
  }
}

export default NodeCard;

