/**
 * treeStore.ts — Zustand store for the active family tree state.
 * Includes undo/redo (50-step stack), matching the desktop app behaviour.
 *
 * Storage mode is NOT stored here. It is a build-time constant in appConfig.ts.
 */
import { create } from 'zustand';
import type { Tree, TreeNode, TreeEdge, Resource } from '../models/types';

const MAX_UNDO = 50;

export interface TreeMeta {
  /** Folder slug used as key (e.g. "anderson_family") */
  folderName: string;
  treeName: string;
}

interface TreeState {

  // ─── Tree list ───────────────────────────────────────────────────────────
  treeList: TreeMeta[];
  setTreeList: (list: TreeMeta[]) => void;

  // ─── Active tree ─────────────────────────────────────────────────────────
  activeTree: Tree | null;
  activeFolder: string | null; // folder slug
  isDirty: boolean;

  // ─── Undo/redo ───────────────────────────────────────────────────────────
  undoStack: Tree[];
  redoStack: Tree[];

  // ─── Actions ─────────────────────────────────────────────────────────────
  openTree: (tree: Tree, folderName: string) => void;
  closeTree: () => void;

  /** Snapshot current state onto undoStack then apply mutation */
  mutate: (fn: (draft: Tree) => Tree) => void;

  undo: () => void;
  redo: () => void;

  markSaved: () => void;

  // Node actions
  addNode: (node: TreeNode) => void;
  updateNode: (node: TreeNode) => void;
  deleteNode: (nodeId: string) => void;

  // Edge actions
  addEdge: (edge: TreeEdge) => void;
  updateEdge: (edge: TreeEdge) => void;
  deleteEdge: (edgeId: string) => void;

  // Resource actions
  addResource: (resource: Resource) => void;
  updateResource: (resource: Resource) => void;
  deleteResource: (resourceId: string) => void;

  // Direct replace (e.g. after layout)
  replaceTree: (tree: Tree) => void;
}

export const useTreeStore = create<TreeState>((set, get) => ({

  treeList: [],
  setTreeList: (list) => set({ treeList: list }),

  activeTree: null,
  activeFolder: null,
  isDirty: false,
  undoStack: [],
  redoStack: [],

  openTree: (tree, folderName) =>
    set({
      activeTree: tree,
      activeFolder: folderName,
      isDirty: false,
      undoStack: [],
      redoStack: [],
    }),

  closeTree: () =>
    set({
      activeTree: null,
      activeFolder: null,
      isDirty: false,
      undoStack: [],
      redoStack: [],
    }),

  mutate: (fn) => {
    const { activeTree, undoStack } = get();
    if (!activeTree) return;
    const snapshot = structuredClone(activeTree);
    const next = fn(structuredClone(activeTree));
    next.updated_at = new Date().toISOString();
    const newStack = [...undoStack, snapshot].slice(-MAX_UNDO);
    set({ activeTree: next, undoStack: newStack, redoStack: [], isDirty: true });
  },

  undo: () => {
    const { activeTree, undoStack, redoStack } = get();
    if (!activeTree || undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    set({
      activeTree: prev,
      undoStack: undoStack.slice(0, -1),
      redoStack: [structuredClone(activeTree), ...redoStack].slice(0, MAX_UNDO),
      isDirty: true,
    });
  },

  redo: () => {
    const { activeTree, undoStack, redoStack } = get();
    if (!activeTree || redoStack.length === 0) return;
    const next = redoStack[0];
    set({
      activeTree: next,
      undoStack: [...undoStack, structuredClone(activeTree)].slice(-MAX_UNDO),
      redoStack: redoStack.slice(1),
      isDirty: true,
    });
  },

  markSaved: () => set({ isDirty: false }),

  addNode: (node) =>
    get().mutate((t) => ({ ...t, nodes: [...t.nodes, node] })),

  updateNode: (node) =>
    get().mutate((t) => ({
      ...t,
      nodes: t.nodes.map((n) => (n.id === node.id ? node : n)),
    })),

  deleteNode: (nodeId) =>
    get().mutate((t) => ({
      ...t,
      nodes: t.nodes.filter((n) => n.id !== nodeId),
      edges: t.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId,
      ),
      resources: t.resources.map((r) => ({
        ...r,
        tags: {
          ...r.tags,
          persons: r.tags.persons.map((pid) => {
            // find node name for orphan tagging
            const node = get().activeTree?.nodes.find((n) => n.id === nodeId);
            if (pid === nodeId && node) return `__orphan__:${node.name}`;
            return pid;
          }),
        },
        regions: r.regions.map((reg) => {
          if (reg.node_id === nodeId) {
            const node = get().activeTree?.nodes.find((n) => n.id === nodeId);
            return { ...reg, node_id: node ? `__orphan__:${node.name}` : reg.node_id };
          }
          return reg;
        }),
      })),
    })),

  addEdge: (edge) =>
    get().mutate((t) => ({ ...t, edges: [...t.edges, edge] })),

  updateEdge: (edge) =>
    get().mutate((t) => ({
      ...t,
      edges: t.edges.map((e) => (e.id === edge.id ? edge : e)),
    })),

  deleteEdge: (edgeId) =>
    get().mutate((t) => ({
      ...t,
      edges: t.edges.filter((e) => e.id !== edgeId),
    })),

  addResource: (resource) =>
    get().mutate((t) => ({ ...t, resources: [...t.resources, resource] })),

  updateResource: (resource) =>
    get().mutate((t) => ({
      ...t,
      resources: t.resources.map((r) => (r.id === resource.id ? resource : r)),
    })),

  deleteResource: (resourceId) =>
    get().mutate((t) => ({
      ...t,
      resources: t.resources.filter((r) => r.id !== resourceId),
      nodes: t.nodes.map((n) => {
        const res = get().activeTree?.resources.find((r) => r.id === resourceId);
        if (res && n.profile_image_ref === `resources/${res.filename}`) {
          return { ...n, profile_image_ref: null };
        }
        return n;
      }),
    })),

  replaceTree: (tree) => {
    const { activeTree, undoStack } = get();
    if (!activeTree) return;
    const snapshot = structuredClone(activeTree);
    const newStack = [...undoStack, snapshot].slice(-MAX_UNDO);
    set({ activeTree: tree, undoStack: newStack, redoStack: [], isDirty: true });
  },
}));

