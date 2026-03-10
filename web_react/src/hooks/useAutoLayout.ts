/**
 * useAutoLayout.ts — Dagre-based auto layout hook for React Flow.
 * Produces a top-down hierarchical layout with spouse pairs adjacent.
 * Uses @dagrejs/dagre — pure JS, no WASM, small bundle.
 */
import { useCallback } from 'react';
import Dagre from '@dagrejs/dagre';
import { useReactFlow } from '@xyflow/react';
import { CARD_W, CARD_H } from '../components/canvas/NodeCard';

const H_GAP = CARD_W + 80;
const V_GAP = CARD_H + 120;

export function useAutoLayout() {
  const { getNodes, getEdges, setNodes, setEdges } = useReactFlow();

  return useCallback(() => {
    const nodes = getNodes();
    const edges = getEdges();

    if (nodes.length === 0) return;

    const g = new Dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({
      rankdir: 'TB',   // top → bottom
      nodesep: H_GAP,
      ranksep: V_GAP,
      marginx: 60,
      marginy: 60,
    });

    nodes.forEach((node) => {
      g.setNode(node.id, { width: CARD_W, height: CARD_H });
    });

    // Only use parent edges for layout hierarchy (spouse/sibling as hints)
    edges.forEach((edge) => {
      const rel = (edge.data as any)?.relationship ?? '';
      if (rel === 'parent') {
        g.setEdge(edge.source, edge.target);
      }
    });

    Dagre.layout(g);

    // Post-process: place spouse adjacent in same row
    const spouseEdges = edges.filter(
      (e) => (e.data as any)?.relationship === 'spouse',
    );
    const posMap = new Map<string, { x: number; y: number }>();
    nodes.forEach((n) => {
      const pos = g.node(n.id);
      posMap.set(n.id, { x: pos?.x ?? n.position.x, y: pos?.y ?? n.position.y });
    });

    spouseEdges.forEach(({ source, target }) => {
      const sp = posMap.get(source);
      const tp = posMap.get(target);
      if (!sp || !tp) return;
      const midY = (sp.y + tp.y) / 2;
      const midX = (sp.x + tp.x) / 2;
      posMap.set(source, { x: midX - (CARD_W + 40) / 2, y: midY });
      posMap.set(target, { x: midX + (CARD_W + 40) / 2, y: midY });
    });

    setNodes(
      nodes.map((n) => {
        const pos = posMap.get(n.id) ?? n.position;
        return { ...n, position: pos };
      }),
    );
    setEdges(edges);
  }, [getNodes, getEdges, setNodes, setEdges]);
}

