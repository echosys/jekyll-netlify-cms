/**
 * imageDb.ts — IndexedDB storage for image blobs via the `idb` library.
 * Used when storageMode = 'indexeddb' (production + optional dev mode).
 * Keys are resource IDs; values are Blob objects.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface FamtDB extends DBSchema {
  images: {
    key: string; // resource.id
    value: Blob;
  };
}

let _db: IDBPDatabase<FamtDB> | null = null;

async function getDb(): Promise<IDBPDatabase<FamtDB>> {
  if (_db) return _db;
  _db = await openDB<FamtDB>('famt-images', 1, {
    upgrade(db) {
      db.createObjectStore('images');
    },
  });
  return _db;
}

export async function saveImage(resourceId: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put('images', blob, resourceId);
}

export async function loadImage(resourceId: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get('images', resourceId);
}

export async function deleteImage(resourceId: string): Promise<void> {
  const db = await getDb();
  await db.delete('images', resourceId);
}

export async function clearAllImages(): Promise<void> {
  const db = await getDb();
  await db.clear('images');
}

/** Get an object URL for a stored image (caller must revoke when done) */
export async function getImageUrl(resourceId: string): Promise<string | null> {
  const blob = await loadImage(resourceId);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

