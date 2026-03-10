/**
 * RelationshipEdge.tsx — Typed custom edge for React Flow.
 * Colour + dash pattern matches the desktop EdgeItem styles.
 */
import React, { memo, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  type EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
} from '@xyflow/react';
import { edgeColor } from '../../models/types';

export interface RelationshipEdgeData {
  relationship: string;
  label: string;
  notes?: string;
  onEditEdge: (edgeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
}

const DASH_PATTERNS: Record<string, string> = {
  parent:   'none',
  spouse:   '8 4',
  ex_spouse:'6 4 2 4',
  sibling:  '2 4',
  other:    '6 3 2 3',
};

const RelationshipEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
  }: EdgeProps) => {
    const d = data as unknown as RelationshipEdgeData;
    const relationship = d?.relationship ?? 'other';
    const label = d?.label ?? '';
    const notes = d?.notes ?? '';

    const [hovered, setHovered] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

    // Close menu on scroll/resize so it doesn't get stale
    useEffect(() => {
      if (!menuOpen) return;
      const close = () => setMenuOpen(false);
      window.addEventListener('scroll', close, true);
      window.addEventListener('resize', close);
      return () => {
        window.removeEventListener('scroll', close, true);
        window.removeEventListener('resize', close);
      };
    }, [menuOpen]);

    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    // Pass label so parent edges get gender-aware colour (Mother=pink, Father=blue)
    const color = edgeColor(relationship, label);
    const strokeWidth = hovered ? 3 : 2;
    const dashArray = DASH_PATTERNS[relationship] ?? DASH_PATTERNS.other;

    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuPos({ x: e.clientX, y: e.clientY });
      setMenuOpen(true);
    };

    return (
      <>
        {/* Invisible wide hit area for easier clicking */}
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          style={{ cursor: 'pointer' }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={handleClick}
        />
        <BaseEdge
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            stroke: hovered ? lighten(color) : color,
            strokeWidth,
            strokeDasharray: dashArray,
            pointerEvents: 'none',
          }}
        />
        {/* Label rendered in EdgeLabelRenderer (stays attached to edge position) */}
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              fontSize: 11,
              fontWeight: 600,
              color,
              background: 'rgba(255,255,255,0.85)',
              padding: '1px 5px',
              borderRadius: 4,
              border: `1px solid ${color}40`,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            onClick={handleClick}
          >
            {label}
          </div>
        </EdgeLabelRenderer>

        {/* Context menu — portalled to document.body so position:fixed works correctly */}
        {menuOpen && ReactDOM.createPortal(
          <>
            {/* Full-screen backdrop to catch outside clicks */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              onClick={() => setMenuOpen(false)}
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
                boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                minWidth: 200,
                fontSize: 13,
                padding: '4px 0',
              }}
              // Stop backdrop click from immediately closing this menu
              onClick={(e) => e.stopPropagation()}
            >
              {notes && (
                <div style={{
                  padding: '6px 14px 4px',
                  fontSize: 11,
                  color: '#666',
                  borderBottom: '1px solid #eee',
                  marginBottom: 2,
                  maxWidth: 260,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  📝 {notes}
                </div>
              )}
              <EdgeMenuItem
                label="✏ Edit Relationship…"
                onClick={() => {
                  setMenuOpen(false);
                  d?.onEditEdge(id);
                }}
              />
              <div style={{ borderTop: '1px solid #eee', margin: '2px 0' }} />
              <EdgeMenuItem
                label="🗑 Delete Relationship"
                color="#c0392b"
                onClick={() => {
                  setMenuOpen(false);
                  d?.onDeleteEdge(id);
                }}
              />
            </div>
          </>,
          document.body,
        )}
      </>
    );
  },
);

function EdgeMenuItem({
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
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f4ff')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </div>
  );
}

function lighten(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.4);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

export default RelationshipEdge;

