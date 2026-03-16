// storageAdapter.ts — thin wrapper that forwards to the Realtime Database adapter with local caching
//
// NOTE (important): this project stores tree data and image resources in Firebase Realtime Database.
// The adapter implemented in `realtimeDbAdapter.ts` is the primary codepath for persistence.
// We now use `cacheAdapter.ts` (IndexedDB) as a local cache to speed up reads and size calculations.
//
import * as rtdbAdapter from './realtimeDbAdapter';
import * as cache from './cacheAdapter';

export const listTrees = async () => {
  // Combine RTDB list with local cache list for robustness
  const [remote, local] = await Promise.all([
    rtdbAdapter.listTrees().catch(() => []),
    cache.listCachedTrees(),
  ]);
  const seen = new Set<string>();
  const out = [...remote];
  remote.forEach(t => seen.add(t.folderName));
  local.forEach(t => {
    if (!seen.has(t.folderName)) {
      out.push(t);
      seen.add(t.folderName);
    }
  });
  return out;
};

export const loadTree = async (folderName: string) => {
  // Try cache first for instant load
  const cached = await cache.getCachedTree(folderName);

  // Trigger a remote fetch to keep cache fresh in background
  const remotePromise = rtdbAdapter.loadTree(folderName).then(async (tree) => {
    await cache.setCachedTree(folderName, tree);
    return tree;
  });

  return cached || await remotePromise;
};

export const saveTree = async (folderName: string, tree: import('../models/types').Tree) => {
  // Save to both
  await Promise.all([
    rtdbAdapter.saveTree(folderName, tree),
    cache.setCachedTree(folderName, tree),
  ]);
};

export const createTree = async (folderName: string, tree: import('../models/types').Tree) => {
  await Promise.all([
    rtdbAdapter.createTree(folderName, tree),
    cache.setCachedTree(folderName, tree),
  ]);
};

export const deleteTree = async (folderName: string) => {
  await Promise.all([
    rtdbAdapter.deleteTree(folderName),
    cache.deleteCachedTree(folderName),
  ]);
};

export const getImageUrl = async (folderName: string, resourceId: string, filename: string) => {
  // Try cache first
  const cachedBlob = await cache.getCachedImage(folderName, resourceId);
  if (cachedBlob) {
    return URL.createObjectURL(cachedBlob);
  }

  // Fallback to RTDB
  const url = await rtdbAdapter.getImageUrl(folderName, resourceId, filename);
  if (url && url.startsWith('data:')) {
    // Convert base64 from RTDB to Blob and cache it
    const res = await fetch(url);
    const blob = await res.blob();
    await cache.setCachedImage(folderName, resourceId, blob);
    return URL.createObjectURL(blob);
  }
  return url;
};

export const removeImage = async (folderName: string, resourceId: string, filename: string) => {
  await Promise.all([
    rtdbAdapter.removeImage(folderName, resourceId, filename),
    // No specific cache remove for single image yet, but deleteTree handles it
  ]);
};

export const getImagesAsBase64 = rtdbAdapter.getImagesAsBase64;

/**
 * StorageSummary — a lightweight shape used by the Sidebar to show totals.
 */
export type StorageSummary = {
  mode: string;
  totalBytes: number;
  trees: Array<{ folderName: string; treeName: string; jsonBytes: number; imageBytes: number; totalBytes: number }>;
};

/**
 * Helper: detect PNG alpha by drawing a downsized copy into canvas and sampling alpha channel.
 */
async function hasPngAlpha(blob: Blob): Promise<boolean> {
  if (!blob.type || !blob.type.includes('png')) return false;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const imgEl = new Image();
    imgEl.crossOrigin = 'anonymous';
    imgEl.onload = () => { URL.revokeObjectURL(url); resolve(imgEl); };
    imgEl.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    imgEl.src = url;
  });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  // downscale to max 64x64 to keep read cost small
  const w = Math.min(64, Math.max(1, img.naturalWidth));
  const h = Math.min(64, Math.max(1, img.naturalHeight));
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
  } catch {
    // security or other error: assume no alpha
    return false;
  }
  return false;
}

/**
 * Helper: convert canvas content to Blob.
 */
async function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  const dataUrl = quality !== undefined ? canvas.toDataURL(mime, quality) : canvas.toDataURL(mime);
  const res = await fetch(dataUrl);
  return await res.blob();
}

/**
 * Helper: compress an image Blob before storing in RTDB.
 */
async function compressImageBlobIfNeeded(blob: Blob, maxBytes = 800_000): Promise<Blob> {
  if (blob.size <= maxBytes) return blob;
  if (!blob.type.startsWith('image/')) return blob;

  // Load image into an offscreen canvas
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const imgEl = new Image();
    imgEl.crossOrigin = 'anonymous';
    imgEl.onload = () => { URL.revokeObjectURL(url); resolve(imgEl); };
    imgEl.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    imgEl.src = url;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  const isPng = blob.type.includes('png');
  const pngHasAlpha = isPng ? await hasPngAlpha(blob) : false;

  // If PNG with alpha: try WebP conversion first (preserves alpha), reduce quality and downscale
  if (pngHasAlpha) {
    // Try quality reductions and downscales
    let quality = 0.92;
    while (quality >= 0.4) {
      try {
        const newBlob = await canvasToBlob(canvas, 'image/webp', quality);
        if (newBlob.size <= maxBytes) return newBlob;
      } catch {
        // WebP may not be supported; break to fallback
        break;
      }
      quality -= 0.12;
      if (quality < 0.6) {
        canvas.width = Math.round(canvas.width * 0.9);
        canvas.height = Math.round(canvas.height * 0.9);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
    }
    // If WebP not successful or unsupported, preserve original PNG to keep alpha
    return blob;
  }

  // For non-alpha images, convert to JPEG and try reducing quality + downscale
  let quality = 0.92;
  while (quality >= 0.4) {
    const newBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (newBlob.size <= maxBytes) return newBlob;
    quality -= 0.12;
    if (quality < 0.6) {
      canvas.width = Math.round(canvas.width * 0.9);
      canvas.height = Math.round(canvas.height * 0.9);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
  }
  // Fallback: return original blob
  return blob;
}

/**
 * uploadImage wrapper: compress if needed (client-side) then forward to realtimeDbAdapter uploadImage
 */
export async function uploadImage(folderName: string, resourceId: string, filename: string, blob: Blob): Promise<void> {
  try {
    const compressed = await compressImageBlobIfNeeded(blob, 800_000);
    // Cache the compressed blob immediately
    await cache.setCachedImage(folderName, resourceId, compressed);
    return await rtdbAdapter.uploadImage(folderName, resourceId, filename, compressed as Blob);
  } catch {
    // On any failure, try original
    await cache.setCachedImage(folderName, resourceId, blob);
    return await rtdbAdapter.uploadImage(folderName, resourceId, filename, blob);
  }
}

/**
 * getStorageSummary() — compute sizes from local cache for instant feedback.
 */
export async function getStorageSummary(): Promise<StorageSummary> {
  try {
    const trees = await cache.listCachedTrees();
    const items = [] as StorageSummary['trees'];
    let total = 0;

    for (const t of trees) {
      const treeData = await cache.getCachedTree(t.folderName);
      const imageBytes = await cache.getCachedImagesSize(t.folderName);
      const jsonBytes = treeData ? JSON.stringify(treeData).length : 0;
      const totalBytes = imageBytes + jsonBytes;

      items.push({
        folderName: t.folderName,
        treeName: t.treeName,
        jsonBytes,
        imageBytes,
        totalBytes
      });
      total += totalBytes;
    }

    return { mode: 'db+cache', totalBytes: total, trees: items };
  } catch (e) {
    return { mode: 'error', totalBytes: 0, trees: [] };
  }
}
