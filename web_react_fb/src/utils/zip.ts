/**
 * zip.ts — ZIP import/export using JSZip.
 * Matches the desktop app's format: tree.json + resources/ folder.
 */
import JSZip from 'jszip';
import type { Tree, Resource } from '../models/types';
import { getImageUrl } from '../db/storageAdapter';

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

  // Clone tree to mutate filenames without affecting the in-memory tree
  const exportTree: Tree = JSON.parse(JSON.stringify(tree));
  const usedNames = new Set<string>();

  // Map old filename to new filename to fix up profile_image_ref
  const filenameMap = new Map<string, string>();

  await Promise.all(
    exportTree.resources.map(async (resource: Resource) => {
      let blob: Blob | null = null;
      // Fetch from Realtime Database via storageAdapter
      try {
        const url = await getImageUrl(folderName, resource.id, resource.filename);
        if (url) {
          const res = await fetch(url);
          if (res.ok) blob = await res.blob();
        }
      } catch {
        // image not available
      }
      if (blob) {
        const oldFilename = resource.filename;
        let ext = '';
        const dotIdx = oldFilename.lastIndexOf('.');
        if (dotIdx !== -1) {
          ext = oldFilename.substring(dotIdx);
        }

        let baseName = '';
        const t = resource.tags;
        if (t.date) {
          const comps = [t.date];
          if (t.location) comps.push(t.location);
          if (t.custom_tags && t.custom_tags.length > 0) {
            comps.push(t.custom_tags.join('_'));
          }
          // Make safe for filesystem
          baseName = comps.join('_').replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF]/g, '_');
        } else {
          baseName = oldFilename.substring(0, oldFilename.length - ext.length);
        }

        let finalName = `${baseName}${ext}`;
        let count = 1;
        while (usedNames.has(finalName.toLowerCase())) {
          finalName = `${baseName}_${count}${ext}`;
          count++;
        }
        usedNames.add(finalName.toLowerCase());

        resource.filename = finalName;
        filenameMap.set(oldFilename, finalName);

        zip.file(`resources/${finalName}`, blob);
      }
    }),
  );

  // Fix up profile_image_ref
  for (const node of exportTree.nodes) {
    if (node.profile_image_ref) {
      for (const [oldName, newName] of filenameMap.entries()) {
        if (node.profile_image_ref.startsWith(`resources/${oldName}`)) {
          node.profile_image_ref = node.profile_image_ref.replace(`resources/${oldName}`, `resources/${newName}`);
          break;
        }
      }
    }
  }

  zip.file('tree.json', JSON.stringify(exportTree, null, 2));

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
