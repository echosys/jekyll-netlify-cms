import { openDB, type IDBPDatabase } from 'idb';
import type { Tree } from '../models/types';

const DB_NAME = 'famt_cache';
const DB_VERSION = 1;
const STORE_TREES = 'trees';
const STORE_IMAGES = 'images';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_TREES)) {
                    db.createObjectStore(STORE_TREES);
                }
                if (!db.objectStoreNames.contains(STORE_IMAGES)) {
                    db.createObjectStore(STORE_IMAGES);
                }
            },
        });
    }
    return dbPromise;
}

/** Cache a full tree JSON */
export async function setCachedTree(folderName: string, tree: Tree): Promise<void> {
    const db = await getDB();
    await db.put(STORE_TREES, tree, folderName);
}

/** Get a tree JSON from cache */
export async function getCachedTree(folderName: string): Promise<Tree | null> {
    const db = await getDB();
    return (await db.get(STORE_TREES, folderName)) || null;
}

/** List all cached tree summaries */
export async function listCachedTrees(): Promise<{ folderName: string; treeName: string }[]> {
    const db = await getDB();
    const tx = db.transaction(STORE_TREES, 'readonly');
    const store = tx.objectStore(STORE_TREES);
    const keys = await store.getAllKeys();
    const trees = await store.getAll();

    return keys.map((key, i) => ({
        folderName: key as string,
        treeName: trees[i].tree_name || (key as string),
    }));
}

/** Delete a tree from cache */
export async function deleteCachedTree(folderName: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORE_TREES, folderName);
    // Also delete associated images
    const tx = db.transaction(STORE_IMAGES, 'readwrite');
    const store = tx.objectStore(STORE_IMAGES);
    let cursor = await store.openCursor();
    while (cursor) {
        if (cursor.key.toString().startsWith(`${folderName}:`)) {
            await cursor.delete();
        }
        cursor = await cursor.continue();
    }
}

/** Cache an image Blob */
export async function setCachedImage(folderName: string, resourceId: string, blob: Blob): Promise<void> {
    const db = await getDB();
    await db.put(STORE_IMAGES, blob, `${folderName}:${resourceId}`);
}

/** Get an image Blob from cache */
export async function getCachedImage(folderName: string, resourceId: string): Promise<Blob | null> {
    const db = await getDB();
    return (await db.get(STORE_IMAGES, `${folderName}:${resourceId}`)) || null;
}

/** Get total size of cached images for a tree */
export async function getCachedImagesSize(folderName: string): Promise<number> {
    const db = await getDB();
    const tx = db.transaction(STORE_IMAGES, 'readonly');
    const store = tx.objectStore(STORE_IMAGES);
    let size = 0;
    let cursor = await store.openCursor();
    while (cursor) {
        if (cursor.key.toString().startsWith(`${folderName}:`)) {
            size += (cursor.value as Blob).size;
        }
        cursor = await cursor.continue();
    }
    return size;
}

/** Get total size of all cached images */
export async function getTotalCachedSize(): Promise<number> {
    const db = await getDB();
    const tx = db.transaction(STORE_IMAGES, 'readonly');
    const store = tx.objectStore(STORE_IMAGES);
    let size = 0;
    let cursor = await store.openCursor();
    while (cursor) {
        size += (cursor.value as Blob).size;
        cursor = await cursor.continue();
    }
    return size;
}
