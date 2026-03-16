import { getFirebaseRtDb } from '../firebaseClient';
import { ref, get, set, update, remove } from 'firebase/database';
import type { Tree, Resource } from '../models/types';

function ensureDb() {
    const db = getFirebaseRtDb();
    if (!db) throw new Error('Realtime Database not initialized.');
    return db;
}

export async function listTrees(): Promise<{ folderName: string; treeName: string }[]> {
    const db = ensureDb();
    const treesRef = ref(db, 'trees');
    const snapshot = await get(treesRef);
    if (!snapshot.exists()) return [];

    const out: { folderName: string; treeName: string }[] = [];
    snapshot.forEach((child: any) => {
        const data = child.val();
        out.push({
            folderName: child.key as string,
            treeName: data.tree_name || child.key
        });
    });
    return out;
}

export async function loadTree(folderName: string): Promise<Tree> {
    const db = ensureDb();
    const treeRef = ref(db, `trees/${folderName}/data`);
    const snapshot = await get(treeRef);
    if (!snapshot.exists()) throw new Error(`Tree not found: ${folderName}`);
    return snapshot.val() as Tree;
}

export async function saveTree(folderName: string, tree: Tree): Promise<void> {
    const db = ensureDb();
    const treeRef = ref(db, `trees/${folderName}/data`);
    await set(treeRef, tree);

    // Update timestamp
    const metaRef = ref(db, `trees/${folderName}`);
    await update(metaRef, {
        lastUpdatedAt: Date.now()
    });
}

export async function createTree(folderName: string, tree: Tree): Promise<void> {
    const db = ensureDb();
    const treeRef = ref(db, `trees/${folderName}`);

    // We use update() instead of set() on the root folder to avoid wiping out
    // other sub-paths like '/images' if they were created just before createTree.
    await update(treeRef, {
        tree_name: tree.tree_name,
        ownerUid: (tree as any).ownerUid ?? null,
        public: !!(tree as any).public,
        data: tree,
        resources: tree.resources ?? [],
        lastUpdatedAt: Date.now(),
        lastUpdatedBy: (tree as any).lastUpdatedBy ?? null,
    });
}

export async function deleteTree(folderName: string): Promise<void> {
    const db = ensureDb();
    // Delete the entire tree node (including data and images)
    await remove(ref(db, `trees/${folderName}`));
}

export async function getImageUrl(folderName: string, resourceId: string, _filename: string): Promise<string | null> {
    const db = ensureDb();
    const imgRef = ref(db, `trees/${folderName}/images/${resourceId}`);
    const snapshot = await get(imgRef);
    if (snapshot.exists()) {
        const d = snapshot.val();
        const b64 = d.data;
        const contentType = d.contentType || 'application/octet-stream';
        if (b64) {
            return `data:${contentType};base64,${b64}`;
        }
    }
    return null;
}

export async function uploadImage(folderName: string, resourceId: string, filename: string, blob: Blob): Promise<void> {
    const db = ensureDb();
    const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            const base = dataUrl.split(',')[1] ?? '';
            resolve(base);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    const imgRef = ref(db, `trees/${folderName}/images/${resourceId}`);
    await set(imgRef, {
        filename,
        data: b64,
        contentType: blob.type || 'application/octet-stream',
        size: blob.size,
        createdAt: Date.now()
    });

    // Update resource metadata in the tree data
    const treeDataRef = ref(db, `trees/${folderName}/data/resources`);
    const snapshot = await get(treeDataRef);
    if (snapshot.exists()) {
        const resources = snapshot.val() as Resource[];
        const next = resources.map((res) => {
            if (res.id === resourceId) {
                return { ...res, filename: filename, size: blob.size };
            }
            return res;
        });
        await set(treeDataRef, next);
    }
}

export async function removeImage(folderName: string, resourceId: string, _filename: string): Promise<void> {
    const db = ensureDb();
    await remove(ref(db, `trees/${folderName}/images/${resourceId}`));
}

export async function getImagesAsBase64(folderName: string, resources: Resource[]): Promise<Record<string, string>> {
    const db = ensureDb();
    const result: Record<string, string> = {};
    for (const resource of resources) {
        try {
            const imgRef = ref(db, `trees/${folderName}/images/${resource.id}`);
            const snapshot = await get(imgRef);
            if (snapshot.exists()) {
                const d = snapshot.val();
                if (d.data) result[resource.id] = d.data;
            }
        } catch {
            // skip
        }
    }
    return result;
}

// User auth and other helpers should be updated to use RTDB paths as well
export async function signInWithUsernamePhrase(username: string, phrase: string) {
    const db = ensureDb();
    const usersRef = ref(db, 'users_famt');
    const snapshot = await get(usersRef);
    if (!snapshot.exists()) return null;

    let foundUser = null;
    snapshot.forEach((child: any) => {
        const u = child.val();
        if (u.username?.trim().toLowerCase() === username.trim().toLowerCase() && u.phrase === phrase) {
            foundUser = {
                uid: child.key,
                username: u.username,
                role: u.role ?? 'user',
                displayName: u.displayName ?? u.username,
                avatarColor: u.avatarColor ?? null,
            };
            return true; // stop iteration
        }
    });
    return foundUser;
}

export async function listUsers(): Promise<Array<{ username: string; role: string; color?: string; allowed_trees?: string[]; uid?: string }>> {
    const db = ensureDb();
    const usersRef = ref(db, 'users_famt');
    const snapshot = await get(usersRef);
    const out: any[] = [];
    snapshot.forEach((s: any) => {
        const d = s.val();
        out.push({ username: d.username ?? s.key, role: d.role ?? 'user', color: d.avatarColor ?? '#888', allowed_trees: d.allowed_trees ?? [], uid: s.key });
    });
    return out;
}

export async function getUserByUsername(username: string) {
    const db = ensureDb();
    const usersRef = ref(db, 'users_famt');
    const snapshot = await get(usersRef);
    let found = null;
    snapshot.forEach((s: any) => {
        if (s.val().username === username) {
            found = { uid: s.key, ...s.val() };
            return true;
        }
    });
    return found;
}

export async function setAllowedTrees(targetUsername: string, allowedTrees: string[]): Promise<void> {
    const db = ensureDb();
    const user = await getUserByUsername(targetUsername);
    if (!user) throw new Error('User not found');
    await update(ref(db, `users_famt/${(user as any).uid}`), { allowed_trees: allowedTrees.length > 0 ? allowedTrees : null });
}

export async function getTreeMeta(folderName: string): Promise<any | null> {
    const db = ensureDb();
    const snapshot = await get(ref(db, `trees/${folderName}`));
    return snapshot.exists() ? snapshot.val() : null;
}

export async function getUserProfile(uid: string): Promise<any | null> {
    const db = ensureDb();
    const snapshot = await get(ref(db, `users_famt/${uid}`));
    return snapshot.exists() ? snapshot.val() : null;
}

export async function createUserProfile(uid: string, profile: any): Promise<void> {
    const db = ensureDb();
    await set(ref(db, `users_famt/${uid}`), profile);
}

export async function updateUserProfileColor(uid: string, color: string): Promise<void> {
    const db = ensureDb();
    await update(ref(db, `users_famt/${uid}`), { avatarColor: color });
}
