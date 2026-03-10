/**
 * zip.ts — ZIP import/export using JSZip.
 * Matches the desktop app's format: tree.json + resources/ folder.
 */
import JSZip from 'jszip';
import type { Tree, Resource } from '../models/types';
import * as imageDb from '../db/imageDb';
import { STORAGE_MODE } from '../appConfig';

export interface ImportResult {
  tree: Tree;
  /** Map from resource.id → Blob */
  images: Map<string, Blob>;
  folderName: string;
}

/** Import a .zip file → Tree + image blobs */
export async function importZip(file: File): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(file);

  // Find tree.json — may be at root or inside a folder
  let treeJsonFile = zip.file('tree.json');
  let prefix = '';
  if (!treeJsonFile) {
    // Look one level deep
    zip.forEach((relativePath, zipEntry) => {
      if (relativePath.endsWith('/tree.json') && !treeJsonFile) {
        treeJsonFile = zipEntry;
        prefix = relativePath.replace('tree.json', '');
      }
    });
  }
  if (!treeJsonFile) throw new Error('No tree.json found in ZIP');

  const treeJson = await treeJsonFile.async('text');
  const tree: Tree = JSON.parse(treeJson);

  // Load all images from resources/
  const images = new Map<string, Blob>();

  await Promise.all(
    tree.resources.map(async (resource: Resource) => {
      const path = `${prefix}resources/${resource.filename}`;
      const entry = zip.file(path);
      if (entry) {
        const blob = await entry.async('blob');
        images.set(resource.id, blob);
      }
    }),
  );

  // Derive folder name from zip filename or tree name
  const baseName = file.name.replace(/\.zip$/i, '');
  const folderName = slugify(tree.tree_name || baseName);

  return { tree, images, folderName };
}

/** Export a tree + images to a downloadable .zip */
export async function exportZip(
  tree: Tree,
  folderName: string,
): Promise<void> {
  const zip = new JSZip();

  zip.file('tree.json', JSON.stringify(tree, null, 2));

  await Promise.all(
    tree.resources.map(async (resource: Resource) => {
      let blob: Blob | null = null;
      if (STORAGE_MODE === 'indexeddb') {
        blob = (await imageDb.loadImage(resource.id)) ?? null;
      } else {
        // Fetch from local API
        try {
          const res = await fetch(
            `/api/fs/image/${encodeURIComponent(folderName)}/${encodeURIComponent(resource.filename)}`,
          );
          if (res.ok) blob = await res.blob();
        } catch {
          // image not available
        }
      }
      if (blob) {
        zip.file(`resources/${resource.filename}`, blob);
      }
    }),
  );

  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `${folderName}.zip`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'my_family';
}

