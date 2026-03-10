/**
 * TreeCanvas.tsx — Main React Flow canvas for the family tree.
 * Handles node/edge rendering, context menus, auto layout, toolbar.
 */
import React, { useCallback, useRef, useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useTreeStore } from '../../store/treeStore';
import {
  type TreeNode,
  type TreeEdge,
  makeNode,
  makeEdge,
  parentLabel,
  edgeColor,
} from '../../models/types';
import { type NodeCardData } from './NodeCard';
import NodeCard from './NodeCard';
import RelationshipEdge from './RelationshipEdge';
import { useAutoLayout } from '../../hooks/useAutoLayout';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

const nodeTypes = { personNode: NodeCard };
const edgeTypes = { relationship: RelationshipEdge };

interface CanvasProps {
  onOpenPerson: (node: TreeNode) => void;
  onSave: () => void;
}

// ─── Relationship type labels ─────────────────────────────────────────────────
const REL_TYPES = [
  { value: 'parent',   label: '↑ Parent of' },
  { value: 'child',    label: '↓ Child of' },
  { value: 'spouse',   label: '💑 Spouse' },
  { value: 'ex_spouse',label: '💔 Ex-Spouse' },
  { value: 'sibling',  label: '↔ Sibling' },
  { value: 'other',    label: '⬡ Other' },
];

function buildFlowNodes(
  treeNodes: TreeNode[],
  treeEdges: TreeEdge[],
  folderName: string,
  resources: import('../../models/types').Resource[],
  onOpenPerson: (node: TreeNode) => void,
  onAddRelationship: (nodeId: string, type: string) => void,
  onDeleteNode: (nodeId: string) => void,
  onDeleteEdge: (edgeId: string) => void,
): Node[] {
  return treeNodes.map((n) => ({
    id: n.id,
    type: 'personNode',
    position: n.position,
    data: {
      node: n,
      folderName,
      resources,
      edges: treeEdges,
      allNodes: treeNodes,
      onOpenPerson,
      onAddRelationship,
      onDeleteNode,
      onDeleteEdge,
    } satisfies NodeCardData,
  }));
}

function buildFlowEdges(
  treeEdges: TreeEdge[],
  treeNodes: TreeNode[],
  onEditEdge: (edgeId: string) => void,
  onDeleteEdge: (edgeId: string) => void,
): Edge[] {
  const nodeMap = new Map(treeNodes.map((n) => [n.id, n]));
  return treeEdges.map((e) => {
    const isSideEdge = e.relationship === 'spouse' || e.relationship === 'ex_spouse' || e.relationship === 'sibling';
    let sourceHandle: string | undefined;
    let targetHandle: string | undefined;
    if (isSideEdge) {
      const srcNode = nodeMap.get(e.source);
      const tgtNode = nodeMap.get(e.target);
      if (srcNode && tgtNode) {
        if (srcNode.position.x <= tgtNode.position.x) {
          sourceHandle = 'right'; targetHandle = 'left';
        } else {
          sourceHandle = 'left'; targetHandle = 'right';
        }
      } else {
        sourceHandle = 'right'; targetHandle = 'left';
      }
    }
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'relationship',
      sourceHandle,
      targetHandle,
      ...(isSideEdge ? {} : {
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor(e.relationship, e.label),
          width: 14,
          height: 14,
        },
      }),
      data: {
        relationship: e.relationship,
        label: e.label,
        notes: e.notes ?? '',
        onEditEdge,
        onDeleteEdge,
      },
    };
  });
}

// ─── Add-Relationship picker modal ───────────────────────────────────────────
interface AddRelPickerProps {
  sourceNode: TreeNode;
  relType: string;
  allNodes: TreeNode[];
  onPick: (targetId: string) => void;
  onClose: () => void;
}

function AddRelPicker({ sourceNode, relType, allNodes, onPick, onClose }: AddRelPickerProps) {
  const [search, setSearch] = useState('');
  const relLabel = REL_TYPES.find((r) => r.value === relType)?.label ?? relType;
  const others = allNodes.filter(
    (n) => n.id !== sourceNode.id && n.name.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return ReactDOM.createPortal(
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: 9991,
        background: '#fff', borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
        width: 360, maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px 10px',
          borderBottom: '1px solid #eee',
          flexShrink: 0,
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
            Add Relationship
          </div>
          <div style={{ fontSize: 12, color: '#555' }}>
            <span style={{ fontWeight: 600 }}>{sourceNode.name || '(unnamed)'}</span>
            {' → '}
            <span style={{
              background: '#f0f4ff', borderRadius: 4,
              padding: '1px 6px', color: '#1565C0', fontWeight: 600,
            }}>{relLabel}</span>
            {' → '}
            <span style={{ color: '#999' }}>select target below</span>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '6px 10px', borderRadius: 6,
              border: '1px solid #ddd', fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        {/* Node list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {others.length === 0 && (
            <div style={{ padding: '20px 18px', color: '#999', fontSize: 13, textAlign: 'center' }}>
              No matching people
            </div>
          )}
          {others.map((n) => (
            <div
              key={n.id}
              onClick={() => { onPick(n.id); onClose(); }}
              style={{
                padding: '9px 18px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: '1px solid #f5f5f5',
                fontSize: 13,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f4ff')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: { male: '#E3F2FD', female: '#FCE4EC', other: '#F1F8E9', unknown: '#FAFAFA' }[n.gender] ?? '#eee',
                border: `2px solid ${{ male: '#90CAF9', female: '#F48FB1', other: '#AED581', unknown: '#BDBDBD' }[n.gender] ?? '#ccc'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, flexShrink: 0,
              }}>
                {n.gender === 'male' ? '♂' : n.gender === 'female' ? '♀' : '●'}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{n.name || '(unnamed)'}</div>
                {(n.birth_date || n.death_date) && (
                  <div style={{ fontSize: 11, color: '#888' }}>
                    {n.birth_date ? `b. ${n.birth_date.slice(0, 4)}` : ''}
                    {n.death_date ? ` · d. ${n.death_date.slice(0, 4)}` : ''}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 14px', borderTop: '1px solid #eee',
          display: 'flex', justifyContent: 'flex-end', flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            padding: '6px 16px', borderRadius: 6,
            border: '1px solid #ccc', cursor: 'pointer',
            background: '#f5f5f5', fontSize: 13,
          }}>Cancel</button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Inner canvas ─────────────────────────────────────────────────────────────

function CanvasInner({ onOpenPerson, onSave }: CanvasProps) {
  const { fitView } = useReactFlow();
  const autoLayout = useAutoLayout();

  const activeTree = useTreeStore((s) => s.activeTree);
  const activeFolder = useTreeStore((s) => s.activeFolder);
  const { addNode, updateNode, deleteNode, addEdge: storeAddEdge,
    updateEdge, deleteEdge, mutate } = useTreeStore();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Add-relationship picker state (replaces drag-to-connect)
  const [relPicker, setRelPicker] = useState<{
    sourceId: string;
    relType: string;
  } | null>(null);

  // Edit edge modal
  const [editEdgeId, setEditEdgeId] = useState<string | null>(null);
  const [editEdgeRel, setEditEdgeRel] = useState('parent');
  const [editEdgeNotes, setEditEdgeNotes] = useState('');

  // Canvas context menu
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } | null>(null);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // ── Sync store → flow nodes/edges ──
  useEffect(() => {
    if (!activeTree || !activeFolder) return;
    const flowNodes = buildFlowNodes(
      activeTree.nodes, activeTree.edges, activeFolder, activeTree.resources,
      onOpenPerson, handleAddRelationship, handleDeleteNode, handleDeleteEdge,
    );
    const flowEdges = buildFlowEdges(
      activeTree.edges, activeTree.nodes,
      handleEditEdge, handleDeleteEdge,
    );
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [activeTree, activeFolder]);

  // ── Handlers ──

  // Called from NodeCard context menu — open picker modal
  const handleAddRelationship = useCallback((nodeId: string, relType: string) => {
    setRelPicker({ sourceId: nodeId, relType });
  }, []);

  // Called when user picks a target from the picker
  const handlePickTarget = useCallback((targetId: string) => {
    if (!relPicker || !activeTree) return;
    const { sourceId, relType } = relPicker;

    let src = sourceId;
    let tgt = targetId;
    let relationship = relType;

    // 'child' means flip: source becomes child, target becomes parent
    if (relType === 'child') {
      [src, tgt] = [tgt, src];
      relationship = 'parent';
    }

    const sourceNode = activeTree.nodes.find((n) => n.id === src);
    let label: string;
    if (relationship === 'spouse') label = 'Spouse';
    else if (relationship === 'ex_spouse') label = 'Ex-Spouse';
    else if (relationship === 'sibling') label = 'Sibling';
    else if (relationship === 'other') label = 'Other';
    else label = parentLabel(sourceNode?.gender ?? 'unknown');

    const edge = makeEdge({ source: src, target: tgt, relationship, label });
    storeAddEdge(edge);
  }, [relPicker, activeTree, storeAddEdge]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    if (confirm('Delete this person? This cannot be undone easily.')) {
      deleteNode(nodeId);
    }
  }, [deleteNode]);

  const handleEditEdge = useCallback((edgeId: string) => {
    const edge = activeTree?.edges.find((e) => e.id === edgeId);
    if (edge) {
      setEditEdgeRel(edge.relationship);
      setEditEdgeNotes(edge.notes ?? '');
      setEditEdgeId(edgeId);
    }
  }, [activeTree]);

  const handleDeleteEdge = useCallback((edgeId: string) => {
    deleteEdge(edgeId);
  }, [deleteEdge]);

  // onConnect kept for manual handle-drag fallback, but picker is primary UX
  const onConnect = useCallback((connection: Connection) => {
    if (!activeTree) return;
    const sourceNode = activeTree.nodes.find((n) => n.id === connection.source);
    if (!sourceNode) return;
    const label = parentLabel(sourceNode.gender);
    const edge = makeEdge({
      source: connection.source!,
      target: connection.target!,
      relationship: 'parent',
      label,
    });
    storeAddEdge(edge);
  }, [activeTree, storeAddEdge]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    if (!activeTree) return;
    const treeNode = activeTree.nodes.find((n) => n.id === node.id);
    if (!treeNode) return;
    updateNode({ ...treeNode, position: node.position });
  }, [activeTree, updateNode]);

  const handleAutoLayout = useCallback(() => {
    autoLayout();
    setTimeout(() => {
      if (!activeTree) return;
      const updatedNodes = activeTree.nodes.map((n) => {
        const fn = nodes.find((fn) => fn.id === n.id);
        return fn ? { ...n, position: fn.position } : n;
      });
      mutate((t) => ({ ...t, nodes: updatedNodes }));
    }, 50);
  }, [autoLayout, activeTree, nodes, mutate]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.1 });
  }, [fitView]);

  useKeyboardShortcuts({ onSave, onFitView: handleFitView, onAutoLayout: handleAutoLayout });

  // Canvas context menu
  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCanvasMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleAddPersonAtPosition = useCallback((flowPos?: { x: number; y: number }) => {
    const newNode = makeNode({ name: 'New Person', position: flowPos ?? { x: 200, y: 200 } });
    addNode(newNode);
    setCanvasMenu(null);
    onOpenPerson(newNode);
  }, [addNode, onOpenPerson]);

  // Edit edge modal submit
  const handleEditEdgeSubmit = () => {
    if (!editEdgeId || !activeTree) return;
    const edge = activeTree.edges.find((e) => e.id === editEdgeId);
    if (!edge) return;
    const sourceNode = activeTree.nodes.find((n) => n.id === edge.source);
    let label = editEdgeRel === 'spouse' ? 'Spouse'
      : editEdgeRel === 'ex_spouse' ? 'Ex-Spouse'
      : editEdgeRel === 'sibling' ? 'Sibling'
      : editEdgeRel === 'other' ? 'Other'
      : parentLabel(sourceNode?.gender ?? 'unknown');

    let source = edge.source;
    let target = edge.target;
    if (editEdgeRel === 'child') { [source, target] = [target, source]; }

    updateEdge({
      ...edge, source, target,
      relationship: editEdgeRel === 'child' ? 'parent' : editEdgeRel,
      label,
      notes: editEdgeNotes,
    });
    setEditEdgeId(null);
  };

  if (!activeTree) return null;

  const sourceNodeForPicker = relPicker
    ? activeTree.nodes.find((n) => n.id === relPicker.sourceId) ?? null
    : null;

  return (
    <div
      ref={reactFlowWrapper}
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onContextMenu={handleCanvasContextMenu}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{ type: 'relationship' }}
        onClick={() => setCanvasMenu(null)}
      >
        <Background color="#e8ecf0" gap={20} />
        <Controls />
        <MiniMap nodeColor={(n) => {
          const nd = n.data as any;
          return nd?.node ? ({
            male: '#90CAF9', female: '#F48FB1',
            other: '#AED581', unknown: '#BDBDBD',
          })[nd.node.gender as string] ?? '#ccc' : '#ccc';
        }} />

        {/* Toolbar */}
        <Panel position="top-left">
          <div style={{
            display: 'flex', gap: 8, background: '#fff',
            borderRadius: 8, padding: '6px 10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}>
            <ToolBtn label="⊙ Fit" onClick={handleFitView} />
            <ToolBtn label="⊞ Layout" onClick={handleAutoLayout} />
          </div>
        </Panel>
      </ReactFlow>

      {/* Canvas context menu */}
      {canvasMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setCanvasMenu(null)} />
          <div style={{
            position: 'fixed', left: canvasMenu.x, top: canvasMenu.y,
            zIndex: 1000, background: '#fff', border: '1px solid #ddd',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            minWidth: 180, fontSize: 13, padding: '4px 0',
          }}>
            <CtxItem label="👤 Add Person Here" onClick={() => handleAddPersonAtPosition()} />
            <CtxItem label="⊙ Fit All Nodes" onClick={handleFitView} />
            <CtxItem label="⊞ Auto Layout" onClick={handleAutoLayout} />
          </div>
        </>
      )}

      {/* Add-relationship target picker */}
      {relPicker && sourceNodeForPicker && (
        <AddRelPicker
          sourceNode={sourceNodeForPicker}
          relType={relPicker.relType}
          allNodes={activeTree.nodes}
          onPick={handlePickTarget}
          onClose={() => setRelPicker(null)}
        />
      )}

      {/* Edit edge modal */}
      {editEdgeId && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.4)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditEdgeId(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditEdgeId(null); }}
        >
          <div style={{
            background: '#fff', borderRadius: 12, padding: 28,
            minWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 16px' }}>Edit Relationship</h3>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Type</label>
            <select
              value={editEdgeRel}
              onChange={(e) => setEditEdgeRel(e.target.value)}
              style={{ width: '100%', padding: '8px', fontSize: 14, borderRadius: 6, border: '1px solid #ccc', marginBottom: 14 }}
            >
              <option value="parent">Parent of</option>
              <option value="child">Child of (flips direction)</option>
              <option value="spouse">Spouse</option>
              <option value="ex_spouse">Ex-Spouse</option>
              <option value="sibling">Sibling</option>
              <option value="other">Other</option>
            </select>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea
              value={editEdgeNotes}
              onChange={(e) => setEditEdgeNotes(e.target.value)}
              placeholder="e.g. Married: 1990-05-12 · Divorced: 2003-08-01"
              rows={3}
              style={{ width: '100%', padding: '8px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc', marginBottom: 16, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditEdgeId(null)}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer', background: '#f5f5f5' }}>
                Cancel
              </button>
              <button onClick={handleEditEdgeSubmit}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#1565C0', color: '#fff', fontWeight: 700 }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd',
      background: '#f8f9fa', cursor: 'pointer', fontSize: 13, fontWeight: 600,
      transition: 'background 0.15s',
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#e8f0fe')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '#f8f9fa')}
    >
      {label}
    </button>
  );
}

function CtxItem({ label, onClick, color }: { label: string; onClick: () => void; color?: string }) {
  return (
    <div onClick={onClick}
      style={{ padding: '8px 14px', cursor: 'pointer', color: color ?? '#222', borderRadius: 6 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f4ff')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </div>
  );
}

// ─── Exported wrapper ─────────────────────────────────────────────────────────

export default function TreeCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
