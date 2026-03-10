/**
 * App.tsx — Main application shell.
 * Layout: Sidebar | (Tab bar + Canvas / Resources)
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { TreeNode } from './models/types';
import { useTreeStore } from './store/treeStore';
import { useSyncStore } from './store/syncStore';
import { saveTree, listTrees, uploadImage, createTree, getImagesAsBase64 } from './db/storageAdapter';
import { slugify } from './utils/zip';
import Sidebar from './components/panels/Sidebar';
import TreeCanvas from './components/canvas/TreeCanvas';
import ResourceManager from './components/panels/ResourceManager';
import PersonDialog from './components/panels/PersonDialog';
import ImportExportDialog from './components/dialogs/ImportExportDialog';
import DBDialog from './components/dialogs/DBDialog';

type Tab = 'canvas' | 'resources';

// ── helpers shared with DBDialog ──────────────────────────────────────────────
async function safeFetch(url: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    let data: any = null;
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

const MIN_SYNC_INTERVAL = 3_000; // ms between sync pushes
const DB_POLL_INTERVAL  = 10_000; // ms between DB import checks

export default function App() {
  const activeTree   = useTreeStore((s) => s.activeTree);
  const activeFolder = useTreeStore((s) => s.activeFolder);
  const isDirty      = useTreeStore((s) => s.isDirty);
  const { markSaved, setTreeList, openTree } = useTreeStore();
  const syncStore    = useSyncStore();

  const [tab, setTab]                   = useState<Tab>('canvas');
  const [openPerson, setOpenPerson]     = useState<TreeNode | null>(null);
  const [showImportExport, setShowImportExport] = useState(false);
  const [showDB, setShowDB]             = useState(false);

  // Refs so interval callbacks always see latest values
  const activeTreeRef   = useRef(activeTree);
  const activeFolderRef = useRef(activeFolder);
  const isDirtyRef      = useRef(isDirty);
  useEffect(() => { activeTreeRef.current = activeTree; },   [activeTree]);
  useEffect(() => { activeFolderRef.current = activeFolder; }, [activeFolder]);
  useEffect(() => { isDirtyRef.current = isDirty; },         [isDirty]);

  // ── Auto-resume sync on page load ────────────────────────────────────────
  // syncStore.active is persisted; if true on mount, try to re-verify connection
  // and pull the tree, then let the sync engine restart automatically.
  const resumeAttemptedRef = useRef(false);
  useEffect(() => {
    if (resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;

    if (!syncStore.active || !syncStore.conn || !syncStore.syncTreeName) return;

    const c = syncStore.conn;
    const conn = {
      host: c.host, port: parseInt(c.port) || 5432,
      dbname: c.dbname, user: c.user,
      credphrase: c.credphrase, sslMode: c.sslMode,
      schema: c.schema, table: c.table,
    };

    (async () => {
      // Test connection first
      const test = await safeFetch('/api/pg-test', conn);
      if (!test.ok) {
        // Connection failed — deactivate and open DB dialog
        syncStore.deactivate();
        setShowDB(true);
        return;
      }
      // Keep connection state aligned with auto-sync resume.
      syncStore.connect({ ...c, connectionString: c.connectionString ?? '' });
      syncStore.setConnStatus('ok');
      // Pull latest tree from DB
      const { ok, data } = await safeFetch('/api/pg-import', { conn, treeName: syncStore.syncTreeName });
      if (!ok || !data?.tree) {
        syncStore.deactivate();
        setShowDB(true);
        return;
      }
      const { tree, images } = data;
      const folderName = slugify(tree.tree_name);
      for (const [resourceId, b64] of Object.entries(images as Record<string, string>)) {
        const resource = tree.resources.find((r: any) => r.id === resourceId);
        if (resource) await uploadImage(folderName, resourceId, resource.filename, b64ToBlob(b64));
      }
      await createTree(folderName, tree);
      openTree(tree, folderName);
      refreshTreeList();
      // syncStore.active is already true from persistence — sync engine picks it up
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Manual save ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const tree = activeTreeRef.current;
    const folder = activeFolderRef.current;
    if (!tree || !folder) return;
    try {
      await saveTree(folder, tree);
      markSaved();
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    }
  }, [markSaved]);

  const refreshTreeList = useCallback(async () => {
    try { setTreeList(await listTrees()); } catch {}
  }, [setTreeList]);

  // ── Sync engine ──────────────────────────────────────────────────────────
  const lastSyncPushRef = useRef(0);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  /** Push local tree to DB (export) + local save */
  const syncPush = useCallback(async () => {
    const tree   = activeTreeRef.current;
    const folder = activeFolderRef.current;
    const conn   = connPayload();
    if (!tree || !folder || !conn) return;
    syncStore.setSyncing(true);
    // Local save first
    try { await saveTree(folder, tree); markSaved(); } catch {}
    // Collect images as base64 so image_data is populated in Postgres
    const images = await getImagesAsBase64(folder, tree.resources ?? []);
    // DB export with images
    await safeFetch('/api/pg-export', { conn, tree, folderName: folder, images });
    syncStore.markSynced();
    lastSyncPushRef.current = Date.now();
  }, [connPayload, markSaved]);

  /** Pull latest from DB (import) if tree has changed remotely */
  const syncPull = useCallback(async () => {
    const conn = connPayload();
    const treeName = syncStore.syncTreeName;
    if (!conn || !treeName) return;
    const { ok, data } = await safeFetch('/api/pg-import', { conn, treeName });
    if (!ok || !data?.tree) return;
    const { tree, images } = data;
    const folderName = slugify(tree.tree_name);
    // Only apply if updated_at is newer than what we have locally
    const localUpdated = activeTreeRef.current?.updated_at ?? '';
    if (tree.updated_at <= localUpdated) return;
    for (const [resourceId, b64] of Object.entries(images as Record<string, string>)) {
      const resource = tree.resources.find((r: any) => r.id === resourceId);
      if (resource) await uploadImage(folderName, resourceId, resource.filename, b64ToBlob(b64));
    }
    await createTree(folderName, tree);
    openTree(tree, folderName);
    refreshTreeList();
  }, [connPayload, syncStore.syncTreeName, openTree, refreshTreeList]);

  // Start/stop the sync interval when syncStore.active changes
  useEffect(() => {
    if (!syncStore.active) {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
      return;
    }

    const tick = async () => {
      const dirty = isDirtyRef.current;
      const now   = Date.now();
      const timeSincePush = now - lastSyncPushRef.current;

      if (dirty && timeSincePush >= MIN_SYNC_INTERVAL) {
        await syncPush();
      } else if (!dirty && timeSincePush >= DB_POLL_INTERVAL) {
        // No local changes — check if DB has something newer
        await syncPull();
        lastSyncPushRef.current = now; // reset so we don't spam pulls
      }
    };

    syncIntervalRef.current = setInterval(tick, 1_000);
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); };
  }, [syncStore.active, syncPush, syncPull]);

  // ── Sync status pill ─────────────────────────────────────────────────────
  const SyncStatusPill = () => {
    const active   = syncStore.active;
    const syncing  = syncStore.syncing;
    const lastSync = syncStore.lastSyncAt;

    if (!active) {
      return (
        <button
          onClick={() => setShowDB(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 20,
            border: '1px solid #ddd', background: '#f0f0f0',
            cursor: 'pointer', fontSize: 12, color: '#999', fontWeight: 600,
          }}
          title="Click to configure DB Sync"
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#bbb', display: 'inline-block' }} />
          Sync off
        </button>
      );
    }

    return (
      <button
        onClick={() => syncStore.deactivate()}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', borderRadius: 20,
          border: '1px solid #a5d6a7',
          background: syncing ? '#fff9c4' : '#e8f5e9',
          cursor: 'pointer', fontSize: 12, fontWeight: 600,
          color: syncing ? '#f57f17' : '#2e7d32',
        }}
        title={`Syncing "${syncStore.syncTreeName}". Click to stop.`}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
          background: syncing ? '#FFC107' : '#4CAF50',
          animation: syncing ? 'pulse 1s infinite' : 'none',
        }} />
        {syncing ? 'Syncing…' : lastSync > 0
          ? `Synced ${new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
          : 'Sync active'}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
      <Sidebar
        onOpenImportExport={() => setShowImportExport(true)}
        onOpenDB={() => setShowDB(true)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeTree ? (
          <>
            {/* Tab bar */}
            <div style={{
              display: 'flex', alignItems: 'center', borderBottom: '1px solid #e0e0e0',
              background: '#fff', padding: '0 16px', gap: 0, height: 44, flexShrink: 0,
            }}>
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
                </span>
                {/* Save button — always visible; in sync mode it also triggers a sync push */}
                <button
                  onClick={syncStore.active ? syncPush : handleSave}
                  style={{
                    padding: '5px 14px', borderRadius: 6, border: 'none',
                    background: isDirty ? '#1565C0' : '#eee',
                    color: isDirty ? '#fff' : '#aaa',
                    cursor: isDirty ? 'pointer' : 'default',
                    fontWeight: 600, fontSize: 12,
                  }}
                >
                  💾 Save
                </button>
                {/* Sync status pill */}
                <SyncStatusPill />
              </div>
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, display: tab === 'canvas' ? 'block' : 'none' }}>
                <TreeCanvas onOpenPerson={(node) => setOpenPerson(node)} onSave={syncStore.active ? syncPush : handleSave} />
              </div>
              <div style={{ position: 'absolute', inset: 0, display: tab === 'resources' ? 'block' : 'none' }}>
                <ResourceManager />
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa', background: '#f9fafb' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🌳</div>
            <h2 style={{ margin: '0 0 8px', color: '#555' }}>Welcome to FamTree</h2>
            <p style={{ fontSize: 14, textAlign: 'center', maxWidth: 340, lineHeight: 1.6 }}>
              Select a tree from the sidebar, import a ZIP file, or connect to a PostgreSQL database to get started.
            </p>
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
          </div>
        )}
      </div>

      {openPerson && <PersonDialog node={openPerson} onClose={() => setOpenPerson(null)} />}
      {showImportExport && <ImportExportDialog onClose={() => setShowImportExport(false)} refreshTreeList={refreshTreeList} />}
      {showDB && <DBDialog onClose={() => setShowDB(false)} refreshTreeList={refreshTreeList} />}
    </div>
  );
}
