/**
 * FamilyGroupEdge.tsx — Orthogonal "family bracket" edge for React Flow.
 *
 * Draws the classic family-tree bracket:
 *   • Single parent + single child → one straight vertical line with arrowhead
 *   • Multiple parents → horizontal parent bar + vertical stem
 *   • Multiple children → horizontal child bar + drops to each child
 *
 * One edge object covers an entire family group (N parents → M children).
 * source/target in React Flow are first parent → first child (always valid);
 * all sibling IDs are carried via data.
 *
 * KEY ROUTING RULE (prevents overlap between sibling groups sharing one parent):
 *   A deterministic stagger offset is derived from the sorted parent-ID string
 *   so that each distinct family group's horizontal junction bar lands at a
 *   slightly different Y.  This prevents the junction bar of "A→E" from
 *   visually merging with the junction bar of "A+B→C" when the children are
 *   placed at the same row.
 */
import { memo } from 'react';
import { useStore, type EdgeProps } from '@xyflow/react';
import { CARD_W, CARD_H } from './NodeCard';

export interface FamilyGroupEdgeData {
  parentIds: string[];
  childIds: string[];
  edgeIds: string[];
  color: string;
  onDeleteEdge: (edgeId: string) => void;
}

const HW = CARD_W / 2;
const PARENT_DROP = 12;   // gap below parent bottom → parent bar (reduced from 20)
const CHILD_RISE = 12;   // gap above child top  → child bar (reduced from 20)
const MIN_STEM = 10;   // minimum stem height
const ARROW = 6;    // arrowhead half-width
// Stagger: each unique parent-set gets a distinct slot (0..N-1) multiplied
// by STAGGER_STEP so its childBarY never coincides with another group's bar.
const STAGGER_STEP = 8;    // px between stagger slots (reduced from 16)
const STAGGER_SLOTS = 8;    // wrap after this many slots

/** Deterministic hash of the sorted parent-ID list → stagger slot index */
function hashParentSet(parentIds: string[]): number {
  const str = [...parentIds].sort().join('|');
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h % STAGGER_SLOTS;
}

const FamilyGroupEdge = memo(({ data }: EdgeProps) => {
  const d = data as unknown as FamilyGroupEdgeData;

  const positions = useStore((s) => {
    const result = new Map<string, { x: number; y: number }>();
    if (!d) return result;
    const lookup = (
      s as unknown as {
        nodeLookup: Map<string, {
          internals?: { positionAbsolute?: { x: number; y: number } };
          position?: { x: number; y: number };
        }>;
      }
    ).nodeLookup;
    if (!lookup) return result;
    for (const id of [...(d.parentIds ?? []), ...(d.childIds ?? [])]) {
      const n = lookup.get(id);
      if (!n) continue;
      const pos = n.internals?.positionAbsolute ?? n.position;
      if (pos) result.set(id, pos);
    }
    return result;
  });

  if (!d) return null;

  const parentPoints = d.parentIds
    .map((id) => { const p = positions.get(id); return p ? { x: p.x + HW, y: p.y + CARD_H } : null; })
    .filter((p): p is { x: number; y: number } => p !== null);

  const childPoints = d.childIds
    .map((id) => { const p = positions.get(id); return p ? { x: p.x + HW, y: p.y } : null; })
    .filter((p): p is { x: number; y: number } => p !== null);

  if (parentPoints.length === 0 || childPoints.length === 0) return null;

  const color = d.color ?? '#6B7280';
  const lineSegs: string[] = [];
  const arrowSegs: string[] = [];

  // ── Compute key Y levels ─────────────────────────────────────────────────
  const parentXs = parentPoints.map((p) => p.x);
  const parentBarY = Math.max(...parentPoints.map((p) => p.y)) + PARENT_DROP;

  // Each unique parent-set gets its own stagger slot so the childBarY for
  // "A→E" is always at a different height than for "A+B→C", preventing their
  // horizontal bars from visually merging when children are at the same row.
  const staggerOffset = hashParentSet(d.parentIds) * STAGGER_STEP;
  const rawChildBarY = Math.min(...childPoints.map((p) => p.y)) - CHILD_RISE - staggerOffset;
  const childBarY = Math.max(rawChildBarY, parentBarY + MIN_STEM);

  // Stem X = midpoint of all parents (single parent → that parent's X)
  const stemX = (Math.min(...parentXs) + Math.max(...parentXs)) / 2;

  // ── 1. Parent drops → parentBarY + horizontal parent bar (>1 parent only) ─
  if (parentPoints.length > 1) {
    for (const p of parentPoints) {
      lineSegs.push(`M ${p.x} ${p.y} L ${p.x} ${parentBarY}`);
    }
    lineSegs.push(`M ${Math.min(...parentXs)} ${parentBarY} L ${Math.max(...parentXs)} ${parentBarY}`);
  }

  // ── 2. Vertical stem: parent bottom (single) or parentBarY → childBarY ───
  const stemTopY = parentPoints.length === 1 ? parentPoints[0].y : parentBarY;
  lineSegs.push(`M ${stemX} ${stemTopY} L ${stemX} ${childBarY}`);

  // ── 3. Horizontal child bar (THIS group only) ─────────────────────────────
  // Bar only spans between the stem and THIS group's own children — it must
  // not extend into territory that belongs to a different family group.
  const childXs = childPoints.map((p) => p.x);
  const allXs = [stemX, ...childXs];
  const barLeft = Math.min(...allXs);
  const barRight = Math.max(...allXs);
  if (barLeft < barRight) {
    lineSegs.push(`M ${barLeft} ${childBarY} L ${barRight} ${childBarY}`);
  }

  // ── 4. Vertical child drops + arrowheads ─────────────────────────────────
  for (const c of childPoints) {
    lineSegs.push(`M ${c.x} ${childBarY} L ${c.x} ${c.y}`);
    arrowSegs.push(`M ${c.x} ${c.y} L ${c.x - ARROW / 2} ${c.y - ARROW} L ${c.x + ARROW / 2} ${c.y - ARROW} Z`);
  }

  const linePath = lineSegs.join(' ');
  const arrowPath = arrowSegs.join(' ');

  return (
    <g>
      <path d={linePath} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'default' }} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {arrowPath && <path d={arrowPath} fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />}
    </g>
  );
});

FamilyGroupEdge.displayName = 'FamilyGroupEdge';
export default FamilyGroupEdge;

