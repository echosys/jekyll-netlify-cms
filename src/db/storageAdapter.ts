/**
 * storageAdapter.ts — Unified storage adapter.
 * Routes read/write calls to either:
 *   - Filesystem API routes (local dev, VITE_STORAGE_MODE=local-fs)
 *   - Browser IndexedDB (Vercel production or VITE_STORAGE_MODE=local-indexdb)
 *
 * The mode is fixed at build/dev-start time via appConfig.ts.
 * There is no runtime toggle — switch modes by changing .env.local and restarting.
 */
import type { Tree } from '../models/types';
import * as imageDb from './imageDb';
import { STORAGE_MODE } from '../appConfig';

export type StorageMode = 'filesystem' | 'indexeddb';

const FS_API_BASE = '/api/fs';

// ─── Filesystem mode (local dev only) ────────────────────────────────────────

async function fsListTrees(): Promise<{ folderName: string; treeName: string }[]> {
  const res = await fetch(`${FS_API_BASE}/list`);
  if (!res.ok) throw new Error(`Failed to list trees: ${res.statusText}`);
  return res.json();
}

async function fsLoadTree(folderName: string): Promise<Tree> {
  const res = await fetch(`${FS_API_BASE}/tree/${encodeURIComponent(folderName)}`);
  if (!res.ok) throw new Error(`Failed to load tree: ${res.statusText}`);
  return res.json();
}

async function fsSaveTree(folderName: string, tree: Tree): Promise<void> {
  const res = await fetch(`${FS_API_BASE}/tree/${encodeURIComponent(folderName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tree),
  });
  if (!res.ok) throw new Error(`Failed to save tree: ${res.statusText}`);
}

async function fsCreateTree(folderName: string, tree: Tree): Promise<void> {
  const res = await fetch(`${FS_API_BASE}/tree/${encodeURIComponent(folderName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tree),
  });
  if (!res.ok) throw new Error(`Failed to create tree: ${res.statusText}`);
}

async function fsDeleteTree(folderName: string): Promise<void> {
  const res = await fetch(`${FS_API_BASE}/tree/${encodeURIComponent(folderName)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete tree: ${res.statusText}`);
}

async function fsGetImageUrl(folderName: string, filename: string): Promise<string> {
  // Images are served statically from the dev server
  return `${FS_API_BASE}/image/${encodeURIComponent(folderName)}/${encodeURIComponent(filename)}`;
}

async function fsUploadImage(
  folderName: string,
  filename: string,
  blob: Blob,
): Promise<void> {
  const form = new FormData();
  form.append('file', blob, filename);
  const res = await fetch(
    `${FS_API_BASE}/image/${encodeURIComponent(folderName)}/${encodeURIComponent(filename)}`,
    { method: 'PUT', body: form },
  );
  if (!res.ok) throw new Error(`Failed to upload image: ${res.statusText}`);
}

async function fsDeleteImage(folderName: string, filename: string): Promise<void> {
  const res = await fetch(
    `${FS_API_BASE}/image/${encodeURIComponent(folderName)}/${encodeURIComponent(filename)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to delete image: ${res.statusText}`);
}

// ─── IndexedDB mode ───────────────────────────────────────────────────────────
// Trees are stored in localStorage as JSON (small enough).
// Images are stored in IndexedDB.

const IDB_TREE_LIST_KEY = 'famt_tree_list';

function idbListTrees(): { folderName: string; treeName: string }[] {
  try {
    return JSON.parse(localStorage.getItem(IDB_TREE_LIST_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function idbSaveTreeList(list: { folderName: string; treeName: string }[]): void {
  localStorage.setItem(IDB_TREE_LIST_KEY, JSON.stringify(list));
}

function idbLoadTree(folderName: string): Tree | null {
  const raw = localStorage.getItem(`famt_tree_${folderName}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function idbSaveTreeJson(folderName: string, tree: Tree): void {
  localStorage.setItem(`famt_tree_${folderName}`, JSON.stringify(tree));
  const list = idbListTrees();
  const exists = list.find((x) => x.folderName === folderName);
  if (!exists) {
    list.push({ folderName, treeName: tree.tree_name });
    idbSaveTreeList(list);
  } else {
    exists.treeName = tree.tree_name;
    idbSaveTreeList(list);
  }
}

function idbDeleteTreeJson(folderName: string): void {
  localStorage.removeItem(`famt_tree_${folderName}`);
  const list = idbListTrees().filter((x) => x.folderName !== folderName);
  idbSaveTreeList(list);
}

// ─── Public adapter ───────────────────────────────────────────────────────────
// All functions use STORAGE_MODE (build-time constant). No runtime mode param.

export async function listTrees(): Promise<{ folderName: string; treeName: string }[]> {
  if (STORAGE_MODE === 'filesystem') return fsListTrees();
  return idbListTrees();
}

export async function loadTree(folderName: string): Promise<Tree> {
  if (STORAGE_MODE === 'filesystem') return fsLoadTree(folderName);
  const tree = idbLoadTree(folderName);
  if (!tree) throw new Error(`Tree not found: ${folderName}`);
  return tree;
}

export async function saveTree(folderName: string, tree: Tree): Promise<void> {
  if (STORAGE_MODE === 'filesystem') return fsSaveTree(folderName, tree);
  idbSaveTreeJson(folderName, tree);
}

export async function createTree(folderName: string, tree: Tree): Promise<void> {
  if (STORAGE_MODE === 'filesystem') return fsCreateTree(folderName, tree);
  idbSaveTreeJson(folderName, tree);
}

export async function deleteTree(folderName: string): Promise<void> {
  if (STORAGE_MODE === 'filesystem') return fsDeleteTree(folderName);
  // IndexedDB mode: load the tree first so we know which resource IDs to purge from IndexedDB
  const tree = idbLoadTree(folderName);
  if (tree?.resources) {
    for (const resource of tree.resources) {
      await imageDb.deleteImage(resource.id);
    }
  }
  idbDeleteTreeJson(folderName);
}

// ─── Storage size helpers ─────────────────────────────────────────────────────

export interface TreeStorageInfo {
  folderName: string;
  treeName: string;
  jsonBytes: number;    // size of the tree JSON in localStorage
  imageBytes: number;   // size of all images in IndexedDB (0 in filesystem mode)
  totalBytes: number;
}

export interface StorageSummary {
  mode: StorageMode;
  totalBytes: number;
  trees: TreeStorageInfo[];
}

/**
 * Calculate storage usage.
 * - IndexedDB mode: reads localStorage JSON sizes + IndexedDB blob sizes.
 * - Filesystem mode: calls /api/fs/storage-size on the local dev server.
 */
export async function getStorageSummary(): Promise<StorageSummary> {
  if (STORAGE_MODE === 'filesystem') {
    try {
      const res = await fetch(`${FS_API_BASE}/storage-size`);
      if (res.ok) return res.json();
    } catch {}
    return { mode: 'filesystem', totalBytes: 0, trees: [] };
  }

  // IndexedDB mode
  const list = idbListTrees();
  const trees: TreeStorageInfo[] = [];

  for (const { folderName, treeName } of list) {
    const raw = localStorage.getItem(`famt_tree_${folderName}`) ?? '';
    const jsonBytes = new Blob([raw]).size;

    // Sum up all image blobs for this tree's resources
    let imageBytes = 0;
    try {
      const tree = JSON.parse(raw) as import('../models/types').Tree;
      for (const resource of tree.resources ?? []) {
        const blob = await imageDb.loadImage(resource.id);
        if (blob) imageBytes += blob.size;
      }
    } catch {}

    trees.push({ folderName, treeName, jsonBytes, imageBytes, totalBytes: jsonBytes + imageBytes });
  }

  const totalBytes = trees.reduce((s, t) => s + t.totalBytes, 0);
  return { mode: 'indexeddb', totalBytes, trees };
}

/** Get a displayable URL for an image resource */
export async function getImageUrl(
  folderName: string,
  resourceId: string,
  filename: string,
): Promise<string | null> {
  if (STORAGE_MODE === 'filesystem') return fsGetImageUrl(folderName, filename);
  return imageDb.getImageUrl(resourceId);
}

/** Store an image blob */
export async function uploadImage(
  folderName: string,
  resourceId: string,
  filename: string,
  blob: Blob,
): Promise<void> {
  if (STORAGE_MODE === 'filesystem') return fsUploadImage(folderName, filename, blob);
  await imageDb.saveImage(resourceId, blob);
}

/** Remove an image */
export async function removeImage(
  folderName: string,
  resourceId: string,
  filename: string,
): Promise<void> {
  if (STORAGE_MODE === 'filesystem') return fsDeleteImage(folderName, filename);
  await imageDb.deleteImage(resourceId);
}

/**
 * Read ALL resource images for a tree and return them as base64 strings,
 * keyed by resource ID. Used when exporting to PostgreSQL so image_data
 * is populated in the DB (otherwise the column stays null).
 *
 * In filesystem mode: fetches each image via the FS API and converts to base64.
 * In indexeddb mode: reads each blob from IndexedDB and converts to base64.
 */
export async function getImagesAsBase64(
  folderName: string,
  resources: import('../models/types').Resource[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const resource of resources) {
    try {
      let blob: Blob | null = null;

      if (STORAGE_MODE === 'filesystem') {
        // Fetch from the local FS API
        const url = await fsGetImageUrl(folderName, resource.filename);
        const res = await fetch(url);
        if (res.ok) blob = await res.blob();
      } else {
        // Read from IndexedDB
        blob = (await imageDb.loadImage(resource.id)) ?? null;
      }

      if (!blob) continue;

      // Convert blob → base64
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // Strip the "data:image/...;base64," prefix
          resolve(dataUrl.split(',')[1] ?? dataUrl);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob!);
      });

      result[resource.id] = b64;
    } catch {
      // Skip images that fail — don't let one bad image abort the whole export
    }
  }

  return result;
}

