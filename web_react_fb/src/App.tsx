import { useState, useCallback, useEffect, useRef } from 'react';
import { useTreeStore } from './store/treeStore';
import { useSyncStore } from './store/syncStore';
import { useAuthStore } from './store/authStore';
import { saveTree, listTrees, createTree, loadTree } from './db/storageAdapter';
import { slugify } from './utils/zip';
import Sidebar from './components/panels/Sidebar';
import TreeCanvas from './components/canvas/TreeCanvas';
import ResourceManager from './components/panels/ResourceManager';
import PersonDialog from './components/panels/PersonDialog';
import ImportExportDialog from './components/dialogs/ImportExportDialog';
import DBDialog from './components/dialogs/DBDialog';
import SyncStatusPill from './components/ui/SyncStatusPill';
import UserAvatar from './components/ui/UserAvatar';
import UserTreeAccessDialog from './components/dialogs/UserTreeAccessDialog';
import { getUserProfile, updateUserProfileColor } from './db/realtimeDbAdapter';
import { getFirebaseRtDb } from './firebaseClient';
import { ref, onValue, off, update } from 'firebase/database';
import type { TreeNode, Tree } from './models/types';
import * as cache from './db/cacheAdapter';

type Tab = 'canvas' | 'resources';

const LAST_USER_TREE_KEY = 'famt_user_last_tree';

export default function App() {
  const activeTree = useTreeStore((s) => s.activeTree);
  const activeFolder = useTreeStore((s) => s.activeFolder);
  const activeSyncMode = useTreeStore((s) => s.activeSyncMode);
  const isDirty = useTreeStore((s) => s.isDirty);
  const { markSaved, setTreeList, openTree } = useTreeStore();
  const syncStore = useSyncStore();
  const { user, logout: authLogout, updateAllowedTrees } = useAuthStore();

  const isUser = user?.role === 'user';
  const isSynced = activeSyncMode === 'synced' || syncStore.active;

  const [tab, setTab] = useState<Tab>('canvas');
  const [openPerson, setOpenPerson] = useState<TreeNode | null>(null);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showDB, setShowDB] = useState(false);
  const [showUserAccess, setShowUserAccess] = useState(false);
  const [autoResumeError, setAutoResumeError] = useState('');

  const activeTreeRef = useRef(activeTree);
  const activeFolderRef = useRef(activeFolder);
  const isDirtyRef = useRef(isDirty);
  const lastWriteAtRef = useRef<number>(0);

  useEffect(() => { activeTreeRef.current = activeTree; }, [activeTree]);
  useEffect(() => { activeFolderRef.current = activeFolder; }, [activeFolder]);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  // ── Real-time listener ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activeFolder || !isSynced) return;

    const db = getFirebaseRtDb();
    if (!db) return;

    const treeDataRef = ref(db, `trees/${activeFolder}/data`);

    const unsub = onValue(treeDataRef, async (snapshot) => {
      if (!snapshot.exists()) return;
      const remoteTree = snapshot.val() as Tree;

      // Skip if we just wrote this
      if (Date.now() - lastWriteAtRef.current < 2000) return;

      // Update cache
      await cache.setCachedTree(activeFolder, remoteTree);

      // Apply to store if remote is newer
      const current = useTreeStore.getState().activeTree;
      if (!current || !remoteTree.updated_at || !current.updated_at || remoteTree.updated_at > current.updated_at) {
        if (!isDirtyRef.current) {
          openTree(remoteTree, activeFolder, isUser ? 'synced' : 'local');
          syncStore.markSynced();
        }
      }
    });

    return () => off(treeDataRef, 'value', unsub);
  }, [activeFolder, isSynced]);

  const handleLogout = useCallback(async () => {
    syncStore.deactivate();
    authLogout();
  }, [syncStore, authLogout]);

  // ── Auto-resume sync ─────────────────────────────────────────────────────
  const resumeAttemptedRef = useRef(false);
  useEffect(() => {
    if (resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;

    (async () => {
      try {
        if (!user || !user._id) return;

        // 1. Refresh user profile
        let currentAllowed = user.allowed_trees;
        try {
          const selfDoc = await getUserProfile(user._id) as any;
          if (selfDoc) {
            currentAllowed = selfDoc.allowed_trees;
            updateAllowedTrees(selfDoc.allowed_trees);
          }
        } catch (e) { console.warn('[App] failed to refresh profile', e); }

        // 2. Load tree list
        let metaList = await listTrees();
        if (user.role === 'user' && currentAllowed) {
          const allowed = currentAllowed.map((t: string) => t.toLowerCase().trim());
          metaList = metaList.filter(t => allowed.includes(t.treeName.toLowerCase().trim()));
        }
        setTreeList(metaList);

        // 3. Auto-open
        let lastUsed = '';
        try { lastUsed = localStorage.getItem(LAST_USER_TREE_KEY) ?? ''; } catch { }

        const toOpen = metaList.find(m => m.folderName === lastUsed) || metaList[0];
        if (toOpen) {
          try {
            const tree = await loadTree(toOpen.folderName);
            openTree(tree, toOpen.folderName, isUser ? 'synced' : 'local');
          } catch (e) { console.error('[App] failed to auto-open tree', e); }
        } else if (isUser && metaList.length === 0) {
          setAutoResumeError('You do not have access to any family trees. Contact your admin.');
        }

      } catch (e) {
        console.error('[App] resume failed', e);
      }
    })();
  }, [user]);

  // ── Presence Heartbeat ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user?._id) return;
    const db = getFirebaseRtDb();
    if (!db) return;

    const userRef = ref(db, `users_famt/${user._id}`);
    const heartbeat = setInterval(() => {
      update(userRef, { lastActivity: Date.now() }).catch(() => { });
    }, 60000); // once a minute

    return () => clearInterval(heartbeat);
  }, [user?._id]);

  // ── Online Users Listener ────────────────────────────────────────────────
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  useEffect(() => {
    const db = getFirebaseRtDb();
    if (!db) return;
    const usersRef = ref(db, 'users_famt');

    const unsub = onValue(usersRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.val();
      const now = Date.now();
      const online = Object.entries(data)
        .filter(([_, u]: [string, any]) => u.lastActivity && (now - u.lastActivity < 300000)) // 5 mins
        .map(([uid, u]: [string, any]) => ({
          _id: uid,
          username: u.username,
          role: u.role,
          color: u.avatarColor || '#888'
        }));
      setOnlineUsers(online);
    });

    return () => off(usersRef, 'value', unsub);
  }, []);

  const handleUpdateColor = async (color: string) => {
    if (!user?._id) return;
    try {
      await updateUserProfileColor(user._id, color);
      useAuthStore.getState().updateColor(color);
    } catch (err) {
      console.warn('Failed to update color', err);
    }
  };

  const handleSave = useCallback(async () => {
    const tree = activeTreeRef.current;
    const folder = activeFolderRef.current;
    if (!tree || !folder) return;
    try {
      syncStore.setSyncing(true);
      lastWriteAtRef.current = Date.now();
      await saveTree(folder, tree);
      markSaved();
      syncStore.markSynced();
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
      syncStore.setSyncing(false);
    }
  }, [markSaved, syncStore]);

  // ── Auto-Save Effect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTree || !isDirty || !activeFolder) return;

    // Wait 2 seconds of inactivity before auto-saving
    const timer = setTimeout(() => {
      handleSave();
    }, 2000);

    return () => clearTimeout(timer);
  }, [activeTree, isDirty, activeFolder, handleSave]);

  const refreshTreeList = useCallback(async () => {
    try {
      let list = await listTrees();
      if (user?.role === 'user' && user.allowed_trees) {
        const allowed = user.allowed_trees.map(t => t.toLowerCase().trim());
        list = list.filter(t => allowed.includes(t.treeName.toLowerCase().trim()));
      }
      setTreeList(list);
    } catch { }
  }, [setTreeList, user]);

  const computedSyncStatus = ((): import('./components/ui/SyncStatusPill').SyncStatus => {
    if (!isSynced) return 1;
    if (syncStore.syncing) return 4;
    return isDirty ? 3 : 5;
  })() as any;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Sidebar
        onOpenImportExport={!isUser ? () => setShowImportExport(true) : undefined}
        onOpenDB={user?.role === 'dev' || (isUser && isSynced) ? () => setShowDB(true) : undefined}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeTree ? (
          <>
            <div className="tabbar-glass" style={{ display: 'flex', alignItems: 'center', padding: '0 16px', gap: 0, height: 48, flexShrink: 0 }}>
              {(['canvas', 'resources'] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={tab === t ? 'tab-active' : 'tab-inactive'} style={{ padding: '0 18px', height: '100%', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>
                  {t === 'canvas' ? '🌳 Tree Canvas' : '📷 Resources'}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>
                  {activeTree.tree_name}
                  {isDirty && <span style={{ color: '#a855f7', marginLeft: 6 }}>●</span>}
                  {isSynced && <span className="badge-purple" style={{ marginLeft: 6 }}>DB</span>}
                </span>
                <button
                  onClick={handleSave}
                  className={isDirty ? 'btn-purple' : 'btn-ghost'}
                  style={{ padding: '5px 14px' }}
                >
                  💾 Save
                </button>
                <SyncStatusPill
                  status={computedSyncStatus}
                  isDirty={isDirty}
                  lastSyncAt={syncStore.lastSyncAt}
                  onClick={user?.role === 'dev' ? () => { setShowDB(true); } : undefined}
                />
                {user && (
                  <UserAvatar
                    user={user}
                    onlineUsers={onlineUsers}
                    onLogout={handleLogout}
                    onUpdateColor={handleUpdateColor}
                    onManageAccess={user.role === 'dev' ? () => setShowUserAccess(true) : undefined}
                  />
                )}
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, display: tab === 'canvas' ? 'block' : 'none' }}>
                <TreeCanvas onOpenPerson={(node) => setOpenPerson(node)} onSave={handleSave} />
              </div>
              <div style={{ position: 'absolute', inset: 0, display: tab === 'resources' ? 'block' : 'none' }}>
                <ResourceManager />
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
            {user && (
              <div style={{ position: 'absolute', top: 12, right: 16 }}>
                <UserAvatar
                  user={user}
                  onlineUsers={onlineUsers}
                  onLogout={handleLogout}
                  onUpdateColor={handleUpdateColor}
                  onManageAccess={user.role === 'dev' ? () => setShowUserAccess(true) : undefined}
                />
              </div>
            )}
            <div style={{ fontSize: 64, marginBottom: 16 }}>🌳</div>
            <h2 style={{ margin: '0 0 8px', color: '#555' }}>Welcome to FamTree</h2>
            {autoResumeError ? (
              <div className="glass grad-border" style={{ borderRadius: 12, padding: '12px 18px', fontSize: 13, color: '#7e22ce', maxWidth: 360, textAlign: 'center' }}>
                ⚠️ {autoResumeError}
              </div>
            ) : (
              <p style={{ fontSize: 14, textAlign: 'center', maxWidth: 340 }}>
                {isUser ? 'Your trees are loading…' : 'Select a tree or import a ZIP to get started.'}
              </p>
            )}
            {!isUser && (
              <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                <button onClick={() => {
                  const name = prompt('Enter name for the new tree:');
                  if (name) {
                    const folder = slugify(name);
                    const tree = { tree_name: name, resources: [], people: [] };
                    createTree(folder, tree as any).then(() => {
                      refreshTreeList();
                      openTree(tree as any, folder);
                    });
                  }
                }} className="btn-purple" style={{ padding: '10px 22px' }}>➕ Create New Tree</button>
                <button onClick={() => setShowImportExport(true)} className="btn-ghost" style={{ padding: '10px 22px' }}>📦 Import ZIP</button>
                <button onClick={() => setShowDB(true)} className="btn-ghost" style={{ padding: '10px 22px' }}>🗄 Database Settings</button>
              </div>
            )}
          </div>
        )}
      </div>

      {openPerson && <PersonDialog node={openPerson} onClose={() => setOpenPerson(null)} />}
      {showImportExport && !isUser && <ImportExportDialog onClose={() => setShowImportExport(false)} refreshTreeList={refreshTreeList} />}
      {showDB && <DBDialog onClose={() => setShowDB(false)} refreshTreeList={refreshTreeList} readOnly={isUser} />}
      {showUserAccess && user?.role === 'dev' && <UserTreeAccessDialog onClose={() => setShowUserAccess(false)} />}
    </div>
  );
}
