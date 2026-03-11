/**
 * App.tsx — Main application shell.
 * Layout: Sidebar | (Tab bar + Canvas / Resources)
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { TreeNode } from './models/types';
import { useTreeStore } from './store/treeStore';
import { useSyncStore } from './store/syncStore';
import { useAuthStore } from './store/authStore';
import { useLockStore } from './store/lockStore';
import { saveTree, listTrees, uploadImage, createTree, getImagesAsBase64, loadTree } from './db/storageAdapter';
import { slugify } from './utils/zip';
import Sidebar from './components/panels/Sidebar';
import TreeCanvas from './components/canvas/TreeCanvas';
import ResourceManager from './components/panels/ResourceManager';
import PersonDialog from './components/panels/PersonDialog';
import ImportExportDialog from './components/dialogs/ImportExportDialog';
import DBDialog from './components/dialogs/DBDialog';
import SyncStatusPill from './components/ui/SyncStatusPill';
import LockButton from './components/ui/LockButton';
import UserAvatar from './components/ui/UserAvatar';

type Tab = 'canvas' | 'resources';

const LAST_USER_TREE_KEY = 'famt_user_last_tree';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeFetch(url: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null;
    // eslint-disable-next-line no-empty
    try { data = JSON.parse(text); } catch {}
    return { ok: res.ok, data };
  } catch { return { ok: false, data: null }; }
}

function b64ToBlob(b64: string, mimeType = 'image/jpeg'): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

export default function App() {
  const activeTree      = useTreeStore((s) => s.activeTree);
  const activeFolder    = useTreeStore((s) => s.activeFolder);
  const activeSyncMode  = useTreeStore((s) => s.activeSyncMode);
  const isDirty         = useTreeStore((s) => s.isDirty);
  const { markSaved, setTreeList, openTree } = useTreeStore();
  const syncStore  = useSyncStore();
  const lockStore  = useLockStore();
  const { user, logout: authLogout } = useAuthStore();

  const isUser = user?.role === 'user';
  /** Active tree is DB-linked (either user role or dev with sync active) */
  const isSynced = activeSyncMode === 'synced' || syncStore.active;

  const [tab, setTab]                         = useState<Tab>('canvas');
  const [openPerson, setOpenPerson]           = useState<TreeNode | null>(null);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showDB, setShowDB]                   = useState(false);
  const [dbInitialTab, setDbInitialTab]       = useState<'export' | 'import' | 'sync'>('export');
  const [discardNotice, setDiscardNotice]     = useState(false);
  const [lockBanner, setLockBanner]           = useState<string | null>(null);
  const [autoResumeError, setAutoResumeError] = useState('');

  // Refs so interval callbacks always see latest values
  const activeTreeRef   = useRef(activeTree);
  const activeFolderRef = useRef(activeFolder);
  const isDirtyRef      = useRef(isDirty);
  const treeListRef     = useRef(useTreeStore.getState().treeList);
  const autoResumeRunningRef = useRef(false);
  useEffect(() => {
    console.log('[App] activeTree changed:', activeTree ? activeTree.tree_name : 'null', 'folder:', activeFolder, 'syncMode:', activeSyncMode);
    activeTreeRef.current = activeTree;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTree]);
  useEffect(() => { activeFolderRef.current = activeFolder; }, [activeFolder]);
  useEffect(() => { isDirtyRef.current = isDirty; },         [isDirty]);
  // Subscribe treeListRef so syncPull can read latest list without re-creating the callback
  useEffect(() => useTreeStore.subscribe((s) => { treeListRef.current = s.treeList; }), []);

  // ── Lock polling — runs whenever we're in a synced state ─────────────────
  useEffect(() => {
    if (user && isSynced) {
      lockStore.setTreeState('SYNCED_DEFAULT');
      lockStore.startPolling(user.username, user.role);
      return () => lockStore.stopPolling();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.username, isSynced]);

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    if (user) await lockStore.logout(user.username);
    syncStore.deactivate();
    authLogout();
  }, [user, lockStore, syncStore, authLogout]);

  // ── User role: switch active sync tree when sidebar click changes activeFolder ──
  useEffect(() => {
    if (!isUser || !activeFolder) return;
    const link = syncStore.syncedTrees[activeFolder];
    if (!link) {
      console.log('[App] folder-switch effect: no syncedTree link for', activeFolder, '— skipping');
      return;
    }
    if (syncStore.activeSyncFolder === activeFolder && syncStore.active) {
      console.log('[App] folder-switch effect: already active for', activeFolder);
      return;
    }
    console.log('[App] folder-switch effect: switching sync to', activeFolder, link.dbTreeName);
    syncStore.activate(activeFolder, link.conn, link.dbTreeName);
    try { localStorage.setItem(LAST_USER_TREE_KEY, activeFolder); } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFolder, isUser]);

  // ── Auto-resume sync on page load (page refresh, not fresh login) ────────
  const resumeAttemptedRef = useRef(false);
  useEffect(() => {
    if (resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;

    console.log('[App] auto-resume: activeTree=', !!activeTreeRef.current, 'syncStore.active=', syncStore.active, 'conn=', !!syncStore.conn, 'isUser=', isUser);

    // Fresh login sets activeTree before login() fires — skip if already loaded
    if (activeTreeRef.current) {
      console.log('[App] auto-resume: skipping — activeTree already set');
      return;
    }

    if (!syncStore.conn) {
      console.log('[App] auto-resume: no conn, skipping');
      return;
    }

    const c = syncStore.conn;
    const conn = {
      host: c.host, port: parseInt(c.port) || 5432,
      dbname: c.dbname, user: c.user,
      credphrase: c.credphrase, sslMode: c.sslMode,
      schema: c.schema, table: c.table,
    };

    (async () => {
      autoResumeRunningRef.current = true;
      try {
      if (isUser) {
        // ── User role: reload all synced trees ─────────────────────────────
        const syncedMap = syncStore.syncedTrees;
        const entries = Object.entries(syncedMap);
        console.log('[App] auto-resume user: syncedTrees count=', entries.length, 'keys=', Object.keys(syncedMap));
        if (entries.length === 0) {
          setAutoResumeError('No synced trees found. Please log out and log in again.');
          return;
        }

        // Pick last-used or first
        let lastUsed = '';
        try { lastUsed = localStorage.getItem(LAST_USER_TREE_KEY) ?? ''; } catch { /* ignore */ }

        const treeMetaList: { folderName: string; treeName: string }[] = [];
        let targetFolder = '';
        let targetTree: import('./models/types').Tree | null = null;

        // Test connection once
        const test = await safeFetch('/api/pg-test', conn);
        if (!test.ok) {
          // Offline: try to show cached trees
          for (const [folderName] of entries) {
            try {
              const cached = await loadTree(folderName);
              if (cached) treeMetaList.push({ folderName, treeName: cached.tree_name });
            } catch { /* skip */ }
          }
          if (treeMetaList.length === 0) {
            setAutoResumeError(`Database connection failed: ${test.data?.error ?? 'unknown'}`);
            return;
          }
          const pick = treeMetaList.find(t => t.folderName === lastUsed) ?? treeMetaList[0];
          try { targetTree = await loadTree(pick.folderName); } catch { /* skip */ }
          if (targetTree) {
            setTreeList(treeMetaList);
            openTree(targetTree, pick.folderName, 'synced');
          }
          return;
        }

        syncStore.connect({ ...c, connectionString: c.connectionString ?? '' });
        syncStore.setConnStatus('ok');

        // Refresh each tree (cache-aware)
        for (const [folderName, link] of entries) {
          let cached: import('./models/types').Tree | null = null;
          try { cached = await loadTree(folderName); } catch { /* no cache */ }

          let treeToUse: import('./models/types').Tree | null = null;
          const importRes = await safeFetch('/api/pg-import', { conn, treeName: link.dbTreeName });
          if (importRes.ok && importRes.data?.tree) {
            const dbTree = importRes.data.tree as import('./models/types').Tree;
            if (cached && dbTree.updated_at <= (cached.updated_at ?? '')) {
              treeToUse = cached; // cache is fresh
            } else {
              const images = importRes.data.images as Record<string, string>;
              for (const [rid, b64] of Object.entries(images)) {
                const res = dbTree.resources.find((r) => r.id === rid);
                if (res) await uploadImage(folderName, rid, res.filename, b64ToBlob(b64));
              }
              await createTree(folderName, dbTree);
              treeToUse = dbTree;
            }
          } else if (cached) {
            treeToUse = cached;
          }

          if (treeToUse) {
            treeMetaList.push({ folderName, treeName: treeToUse.tree_name });
            if (!targetFolder || folderName === lastUsed) {
              targetFolder = folderName;
              targetTree = treeToUse;
            }
          }
        }

        if (!targetFolder || !targetTree) {
          setAutoResumeError('Could not load any trees from the database.');
          return;
        }

        setTreeList(treeMetaList);
        openTree(targetTree, targetFolder, 'synced');
        syncStore.activate(targetFolder, { ...c, connectionString: c.connectionString ?? '' }, targetTree.tree_name);

      } else {
        // ── Dev role: single-tree auto-resume (existing behaviour) ──────────
        if (!syncStore.active || !syncStore.syncTreeName) return;

        // Try showing cached tree immediately
        const cachedFolder = syncStore.activeSyncFolder || slugify(syncStore.syncTreeName);
        try {
          const cached = await loadTree(cachedFolder);
          if (cached && !activeTreeRef.current) {
            openTree(cached, cachedFolder, 'synced');
            refreshTreeList();
          }
        } catch { /* no cache */ }

        const test = await safeFetch('/api/pg-test', conn);
        if (!test.ok) {
          syncStore.deactivate();
          setShowDB(true);
          return;
        }
        syncStore.connect({ ...c, connectionString: c.connectionString ?? '' });
        syncStore.setConnStatus('ok');

        const { ok, data } = await safeFetch('/api/pg-import', { conn, treeName: syncStore.syncTreeName });
        if (!ok || !data?.tree) { syncStore.deactivate(); setShowDB(true); return; }

        const { tree, images } = data as { tree: import('./models/types').Tree; images: Record<string, string> };
        const folderName = slugify(tree.tree_name);
        for (const [rid, b64] of Object.entries(images)) {
          const res = tree.resources.find((r) => r.id === rid);
          if (res) await uploadImage(folderName, rid, res.filename, b64ToBlob(b64));
        }
        await createTree(folderName, tree);
        openTree(tree, folderName, 'synced');
        refreshTreeList();
      }
      } finally {
        autoResumeRunningRef.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Manual save ───────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const tree = activeTreeRef.current;
    const folder = activeFolderRef.current;
    if (!tree || !folder) return;
    try {
      await saveTree(folder, tree);
      markSaved();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    }
  }, [markSaved]);

  const refreshTreeList = useCallback(async () => {
    // eslint-disable-next-line no-empty
    try { setTreeList(await listTrees()); } catch {}
  }, [setTreeList]);

  // ── Sync engine ───────────────────────────────────────────────────────────
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastReadAtRef   = useRef<number>(0);

  const connPayload = useCallback(() => {
    const c = syncStore.conn;
    if (!c) return null;
    return {
      host: c.host, port: parseInt(c.port) || 5432,
      dbname: c.dbname, user: c.user,
      credphrase: c.credphrase, sslMode: c.sslMode,
      schema: c.schema, table: c.table,
    };
  }, [syncStore.conn]);

  /** Apply a fetched remote tree to local state */
  const applyRemoteTree = useCallback(async (tree: import('./models/types').Tree, images: Record<string, string>) => {
    const folderName = slugify(tree.tree_name);
    for (const [rid, b64] of Object.entries(images)) {
      const res = tree.resources?.find((r) => r.id === rid);
      if (res) await uploadImage(folderName, rid, res.filename, b64ToBlob(b64));
    }
    await createTree(folderName, tree);
    openTree(tree, folderName, 'synced');
    lockStore.setLastKnownDbUpdatedAt(tree.updated_at ?? '');
    lockStore.setSyncStatus(lockStore.treeState === 'SYNCED_LOCKED' ? 5 : 3);
    syncStore.markSynced();
    lastReadAtRef.current = Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockStore, syncStore]);

  /**
   * syncTick — runs the DB sync for the active tree.
   * Called by: (a) the setTimeout schedule, (b) Save button click, (c) tab-restore.
   *
   * SYNCED_DEFAULT → POST /api/pg-import (read, always)
   *                  if DB unchanged AND isDirty → POST /api/pg-export (write)
   *                  if DB changed              → apply remote, discard local (DB wins)
   *
   * SYNCED_LOCKED  → POST /api/pg-export if isDirty (write-first)
   *                  then POST /api/pg-import to confirm (always)
   */
  const syncTick = useCallback(async () => {
    const treeState = lockStore.treeState;
    if (treeState === 'LOCAL') return;
    if (lockStore.syncInFlight) return;

    const conn     = connPayload();
    const tree     = activeTreeRef.current;
    const folder   = activeFolderRef.current;
    const treeName = syncStore.syncTreeName;
    if (!conn || !treeName) return;

    lockStore.setSyncInFlight(true);
    try {
      if (treeState === 'SYNCED_LOCKED') {
        // ── Write-first: push if dirty, then always pull ───────────────────
        if (isDirtyRef.current && tree && folder) {
          lockStore.setSyncStatus(4);
          try { await saveTree(folder, tree); markSaved(); } catch { /* ignore */ }
          const images = await getImagesAsBase64(folder, tree.resources ?? []);
          await safeFetch('/api/pg-export', { conn, tree, folderName: folder, images });
          lockStore.setLastKnownDbUpdatedAt(new Date().toISOString());
          syncStore.markSynced();
        }
        lockStore.setSyncStatus(2);
        const { ok, data } = await safeFetch('/api/pg-import', { conn, treeName });
        if (ok && data?.tree) await applyRemoteTree(data.tree, data.images ?? {});
        lockStore.setSyncStatus(5);

      } else {
        // ── Read-first: pull, compare, push only if DB unchanged ───────────
        lockStore.setSyncStatus(2);
        const { ok, data } = await safeFetch('/api/pg-import', { conn, treeName });
        if (!ok || !data?.tree) { lockStore.setSyncStatus(3); return; }

        const remote: import('./models/types').Tree = data.tree;
        const lastKnown = lockStore.lastKnownDbUpdatedAt;

        if (remote.updated_at && lastKnown && remote.updated_at > lastKnown) {
          // DB changed — DB wins, discard local
          await applyRemoteTree(remote, data.images ?? {});
          setDiscardNotice(true);
          setTimeout(() => setDiscardNotice(false), 4_000);
        } else if (isDirtyRef.current && tree && folder) {
          // DB unchanged — safe to push local changes
          lockStore.setSyncStatus(4);
          try { await saveTree(folder, tree); markSaved(); } catch { /* ignore */ }
          const images = await getImagesAsBase64(folder, tree.resources ?? []);
          await safeFetch('/api/pg-export', { conn, tree, folderName: folder, images });
          lockStore.setLastKnownDbUpdatedAt(new Date().toISOString());
          syncStore.markSynced();
        } else {
          lockStore.setLastKnownDbUpdatedAt(remote.updated_at ?? lastKnown);
        }
        lockStore.setSyncStatus(3);
      }
    } finally {
      lockStore.setSyncInFlight(false);
    }
  }, [connPayload, syncStore, lockStore, markSaved, applyRemoteTree]);

  // Keep syncTick in a ref so the timeout chain always calls the latest version
  const syncTickRef = useRef(syncTick);
  useEffect(() => { syncTickRef.current = syncTick; }, [syncTick]);

  // ── Sync schedule: setTimeout chain, no busy-wait ─────────────────────────
  // SYNCED_DEFAULT:  pg-import every 10 s (background freshness check)
  //                  + immediate run on save button click (syncTick called directly)
  // SYNCED_LOCKED:   pg-export (if dirty) + pg-import every 5 s
  const SYNC_INTERVAL_DEFAULT_MS = 10_000;
  const SYNC_INTERVAL_LOCKED_MS  =  5_000;

  useEffect(() => {
    if (!syncStore.active) {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
      setTimeout(() => lockStore.setSyncStatus(1), 0);
      return;
    }
    console.log('[App] sync schedule: starting, syncTreeName=', syncStore.syncTreeName);

    let cancelled = false;
    const schedule = async () => {
      if (cancelled || autoResumeRunningRef.current) return;
      await syncTickRef.current();
      if (cancelled) return;
      const ms = lockStore.treeState === 'SYNCED_LOCKED'
        ? SYNC_INTERVAL_LOCKED_MS
        : SYNC_INTERVAL_DEFAULT_MS;
      syncIntervalRef.current = setTimeout(schedule, ms) as unknown as ReturnType<typeof setInterval>;
    };

    // First run after initial delay
    const initialMs = lockStore.treeState === 'SYNCED_LOCKED'
      ? SYNC_INTERVAL_LOCKED_MS
      : SYNC_INTERVAL_DEFAULT_MS;
    syncIntervalRef.current = setTimeout(schedule, initialMs) as unknown as ReturnType<typeof setInterval>;

    return () => {
      cancelled = true;
      if (syncIntervalRef.current) clearTimeout(syncIntervalRef.current as unknown as ReturnType<typeof setTimeout>);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStore.active, lockStore.treeState]);

  const computedSyncStatus = ((): import('./store/lockStore').SyncStatus => {
    if (lockStore.treeState === 'LOCAL') return 1;
    return lockStore.syncStatus;
  })();

  // ── Lock helpers ──────────────────────────────────────────────────────────
  const handleAcquireLock = useCallback(async () => {
    if (!user) return;
    const result = await lockStore.acquireLock(user.username, user.role);
    if (!result.ok) {
      const err = result.error ?? '';
      if (err.startsWith('banner:')) {
        const holder = err.replace('banner:', '');
        setLockBanner(`Locked by ${holder}`);
        setTimeout(() => setLockBanner(null), 5_000);
      } else {
        alert(err || 'Could not acquire lock.');
      }
    } else {
      // On acquiring lock: immediately run a pull to reset lastKnownDbUpdatedAt
      await syncTick();
    }
  }, [user, lockStore, syncTick]);

  const handleReleaseLock = useCallback(async () => {
    if (!user) return;
    await lockStore.releaseLock(user.username);
  }, [user, lockStore]);

  const handleForceTake = useCallback(async () => {
    if (!user) return;
    const result = await lockStore.forceTakeLock(user.username);
    if (!result.ok) alert(result.error ?? 'Force-take failed.');
    else await syncTick();
  }, [user, lockStore, syncTick]);

  // ── Re-sync when page becomes visible again (tab switch, screen wake) ───────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && syncStore.active) {
        console.log('[App] page became visible — triggering immediate sync + poll');
        syncTickRef.current();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncStore.active]);
  const canOpenDB = user?.role === 'dev' || (isUser && isSynced);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Sidebar
        onOpenImportExport={!isUser ? () => setShowImportExport(true) : undefined}
        onOpenDB={canOpenDB ? () => setShowDB(true) : undefined}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {lockStore.forcedByMsg && (
          <div style={{ background: '#FFF3E0', borderBottom: '1px solid #FFCC80', padding: '8px 20px', fontSize: 13, color: '#E65100', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>⚡ {lockStore.forcedByMsg}</span>
            <button onClick={() => lockStore.clearForcedMsg()} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#E65100', fontWeight: 700, fontSize: 14 }}>✕</button>
          </div>
        )}
        {lockBanner && (
          <div style={{ background: '#FFF3E0', borderBottom: '1px solid #FFCC80', padding: '8px 20px', fontSize: 13, color: '#E65100', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>🔒 {lockBanner}</span>
            <button onClick={() => setLockBanner(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#E65100', fontWeight: 700, fontSize: 14 }}>✕</button>
          </div>
        )}
        {discardNotice && (
          <div style={{ background: '#E3F2FD', borderBottom: '1px solid #90CAF9', padding: '8px 20px', fontSize: 13, color: '#1565C0' }}>
            ↓ Remote changes applied — your local edits were discarded (DB wins)
          </div>
        )}

        {activeTree ? (
          <>
            {/* Tab bar */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e0e0e0', background: '#fff', padding: '0 16px', gap: 0, height: 48, flexShrink: 0 }}>
              {(['canvas', 'resources'] as Tab[]).map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '0 18px', height: '100%', border: 'none', background: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 400,
                  color: tab === t ? '#1565C0' : '#666',
                  borderBottom: tab === t ? '2px solid #1565C0' : '2px solid transparent',
                }}>
                  {t === 'canvas' ? '🌳 Tree Canvas' : '📷 Resources'}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>
                  {activeTree.tree_name}
                  {isDirty && <span style={{ color: '#e67e22', marginLeft: 6 }}>●</span>}
                  {activeSyncMode === 'synced' && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: '#1565C0', fontWeight: 700, background: '#E3F2FD', borderRadius: 4, padding: '1px 6px' }}>DB</span>
                  )}
                </span>
                {/* Save button — always available; calls syncTick for synced trees */}
                <button
                  onClick={isSynced ? syncTick : handleSave}
                  style={{
                    padding: '5px 14px', borderRadius: 6, border: 'none',
                    background: isDirty ? '#1565C0' : '#eee',
                    color: isDirty ? '#fff' : '#aaa',
                    cursor: 'pointer', fontWeight: 600, fontSize: 12,
                  }}
                >
                  💾 Save
                </button>
                {/* Lock button — only when synced */}
                {isSynced && user && lockStore.treeState !== 'LOCAL' && (
                  <LockButton
                    treeState={lockStore.treeState as 'SYNCED_DEFAULT' | 'SYNCED_LOCKED'}
                    lockHolder={lockStore.lockHolder}
                    lockCountdown={lockStore.lockCountdown}
                    myUsername={user.username}
                    myRole={user.role}
                    onAcquire={handleAcquireLock}
                    onRelease={handleReleaseLock}
                    onForceTake={handleForceTake}
                  />
                )}
                {/* Sync status pill — always visible; dev can click to open PG dialog on Sync tab */}
                <SyncStatusPill
                  status={computedSyncStatus}
                  isDirty={isDirty}
                  lastSyncAt={syncStore.lastSyncAt}
                  onClick={user?.role === 'dev' ? () => { setDbInitialTab('sync'); setShowDB(true); } : undefined}
                  title={user?.role === 'dev' ? 'Click to open PostgreSQL › Sync tab' : undefined}
                />
                {user && <UserAvatar user={user} onlineUsers={lockStore.onlineUsers} onLogout={handleLogout} />}
              </div>
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, display: tab === 'canvas' ? 'block' : 'none' }}>
                <TreeCanvas onOpenPerson={(node) => setOpenPerson(node)} onSave={isSynced ? syncTick : handleSave} />
              </div>
              <div style={{ position: 'absolute', inset: 0, display: tab === 'resources' ? 'block' : 'none' }}>
                <ResourceManager />
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa', background: '#f9fafb' }}>
            {user && (
              <div style={{ position: 'absolute', top: 12, right: 16 }}>
                <UserAvatar user={user} onlineUsers={lockStore.onlineUsers} onLogout={handleLogout} />
              </div>
            )}
            <div style={{ fontSize: 64, marginBottom: 16 }}>🌳</div>
            <h2 style={{ margin: '0 0 8px', color: '#555' }}>Welcome to FamTree</h2>
            {autoResumeError ? (
              <div style={{ background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: 8, padding: '12px 18px', fontSize: 13, color: '#c62828', maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>
                ⚠️ {autoResumeError}
                <br /><span style={{ fontSize: 12, color: '#888', marginTop: 4, display: 'block' }}>Try refreshing or contact your admin.</span>
              </div>
            ) : (
              <p style={{ fontSize: 14, textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>
                {isUser
                  ? 'Your trees are loading… If nothing appears, contact your admin.'
                  : 'Select a tree from the sidebar, import a ZIP file, or connect to a PostgreSQL database to get started.'}
              </p>
            )}
            {!isUser && (
              <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                <button onClick={() => setShowImportExport(true)}
                  style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: '#1565C0', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                  📦 Import ZIP
                </button>
                <button onClick={() => setShowDB(true)}
                  style={{ padding: '10px 22px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', color: '#333', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                  🗄 Connect DB
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {openPerson && <PersonDialog node={openPerson} onClose={() => setOpenPerson(null)} />}
      {showImportExport && !isUser && <ImportExportDialog onClose={() => setShowImportExport(false)} refreshTreeList={refreshTreeList} />}
      {showDB && <DBDialog onClose={() => { setShowDB(false); setDbInitialTab('export'); }} refreshTreeList={refreshTreeList} readOnly={isUser} initialTab={dbInitialTab} />}
    </div>
  );
}
