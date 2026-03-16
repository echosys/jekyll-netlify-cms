/**
 * Sidebar.tsx — Tree list sidebar with new/edit/open controls.
 */
import { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTreeStore, type TreeMeta } from '../../store/treeStore';
import { listTrees, loadTree, createTree, deleteTree, getStorageSummary, type StorageSummary } from '../../db/storageAdapter';
import { useAuthStore } from '../../store/authStore';
import { useSyncStore } from '../../store/syncStore';
import { makeTree } from '../../models/types';
import { slugify } from '../../utils/zip';

interface Props {
  onOpenImportExport?: () => void;
  onOpenDB?: () => void;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export default function Sidebar({ onOpenImportExport, onOpenDB }: Props) {
  const {
    treeList, setTreeList,
    activeFolder, openTree, closeTree,
    isDirty,
  } = useTreeStore();
  const { user } = useAuthStore();
  const syncStore = useSyncStore();
  const activeSyncMode = useTreeStore((s) => s.activeSyncMode);
  const isUser = user?.role === 'user';

  const [newTreeName, setNewTreeName] = useState('');
  const [creating, setCreating] = useState(false);
  const [storageSummary, setStorageSummary] = useState<StorageSummary | null>(null);
  const [showStorageBreakdown, setShowStorageBreakdown] = useState(false);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TreeMeta | null>(null);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    try {
      let list = await listTrees();
      if (isUser && user?.allowed_trees) {
        const allowed = user.allowed_trees.map(t => t.toLowerCase().trim());
        list = list.filter(t => allowed.includes(t.treeName.toLowerCase().trim()));
      }
      setTreeList(list);
    } catch { /* ignore */ setTreeList([]); }
  };

  const loadStorageSize = useCallback(async () => {
    setLoadingStorage(true);
    try {
      const summary = await getStorageSummary();
      setStorageSummary(summary);
    } catch { /* ignore */ }
    setLoadingStorage(false);
  }, []);

  // Load storage size on mount and whenever tree list changes (dev role only)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!isUser) loadStorageSize(); }, [treeList.length]);

  const handleOpenTree = async (meta: TreeMeta) => {
    if (isDirty && !confirm('You have unsaved changes. Open another tree anyway?')) return;
    try {
      const tree = await loadTree(meta.folderName);
      // For user role, all trees are synced; for dev role, default to local
      const syncMode = isUser || !!syncStore.syncedTrees[meta.folderName] ? 'synced' : 'local';
      openTree(tree, meta.folderName, syncMode as any);
    } catch (err) {
      alert(`Failed to open tree: ${(err as Error).message}`);
    }
  };

  const handleCreateTree = async () => {
    if (!newTreeName.trim()) return;
    const folderName = slugify(newTreeName.trim());
    const tree = makeTree({ tree_name: newTreeName.trim() });
    try {
      await createTree(folderName, tree);
      setTreeList([...treeList, { folderName, treeName: tree.tree_name }]);
      openTree(tree, folderName);
      setNewTreeName('');
      setCreating(false);
    } catch (err) {
      alert(`Failed to create tree: ${(err as Error).message}`);
    }
  };

  const handleDeleteTree = (meta: TreeMeta) => {
    setConfirmDelete(meta);
  };

  const performDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteTree(confirmDelete.folderName);
      if (activeFolder === confirmDelete.folderName) closeTree();
      setTreeList(treeList.filter((t) => t.folderName !== confirmDelete.folderName));
    } catch (err) {
      alert(`Failed to delete: ${(err as Error).message}`);
    } finally {
      setConfirmDelete(null);
    }
  };

  const storageBadge = { label: '🗃 Storage', color: '#e3f2fd', border: '#90caf9', text: '#1565C0' };
  const totalStr = storageSummary ? fmtBytes(storageSummary.totalBytes) : loadingStorage ? '…' : '—';

  return (
    <div className="sidebar-glass" style={{ width: 220, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(168,85,247,0.12)' }}>
        <div style={{ fontWeight: 800, fontSize: 16, background: 'linear-gradient(135deg, #9333ea, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>🌳 FamTree</div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>Family Tree App</div>
      </div>

      {!isUser && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(168,85,247,0.10)', background: 'rgba(243,232,255,0.4)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9333ea', marginBottom: 4, letterSpacing: '0.05em' }}>WORKING STORAGE</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, border: `1px solid ${storageBadge.border}`, fontSize: 11, fontWeight: 700, color: storageBadge.text, background: storageBadge.color }}>
              {storageBadge.label}
            </div>
            <button onClick={() => { loadStorageSize(); setShowStorageBreakdown(true); }} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
              💾 {totalStr}
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: '10px 12px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#9333ea', letterSpacing: '0.07em' }}>{isUser ? 'YOUR TREE' : 'MY TREES'}</span>
        {!isUser && <button onClick={refresh} title="Refresh" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#c084fc' }}>↻</button>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {treeList.length === 0 && (
          <div style={{ padding: '12px 16px', fontSize: 12, color: '#aaa' }}>
            {isUser ? 'Loading your tree…' : 'No trees yet. Create one or import a ZIP.'}
          </div>
        )}
        {treeList.map((meta) => {
          const isActive = activeFolder === meta.folderName;
          const isSynced = isUser ? true : isActive ? (syncStore.active && activeSyncMode === 'synced') : !!syncStore.syncedTrees[meta.folderName];
          return (
            <div key={meta.folderName} onClick={() => handleOpenTree(meta)} style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isActive ? 'rgba(243,232,255,0.7)' : 'transparent', borderLeft: isActive ? '3px solid #a855f7' : '3px solid transparent', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {meta.treeName}
                  {isSynced && <span className="badge-purple">DB</span>}
                </div>
                <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>{meta.folderName}</div>
              </div>
              {!isUser && (
                <button disabled={isSynced} onClick={(e) => { e.stopPropagation(); if (!isSynced) handleDeleteTree(meta); }} title={isSynced ? "Cannot delete synced tree" : "Delete tree"} style={{ background: 'none', border: 'none', cursor: isSynced ? 'not-allowed' : 'pointer', color: isSynced ? '#eee' : '#ccc', fontSize: 14, padding: '2px 4px' }}>
                  🗑
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!isUser && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(168,85,247,0.12)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {creating ? (
            <>
              <input autoFocus value={newTreeName} onChange={(e) => setNewTreeName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTree(); if (e.key === 'Escape') setCreating(false); }} placeholder="Tree name…" className="input-glass" style={{ width: '100%' }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleCreateTree} className="btn-purple" style={{ flex: 1, padding: '6px 0' }}>Create</button>
                <button onClick={() => setCreating(false)} className="btn-ghost" style={{ flex: 1, padding: '6px 0' }}>Cancel</button>
              </div>
            </>
          ) : (
            <button onClick={() => setCreating(true)} style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1px dashed rgba(168,85,247,0.5)', color: '#9333ea', background: 'rgba(243,232,255,0.3)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>+ New Tree</button>
          )}
          <button onClick={onOpenImportExport} className="btn-ghost" style={{ padding: '7px 0', width: '100%' }}>📦 ZIP Import / Export</button>
          {onOpenDB && <button onClick={onOpenDB} className="btn-ghost" style={{ padding: '7px 0', width: '100%' }}>🗄 Database Settings</button>}
        </div>
      )}

      {showStorageBreakdown && ReactDOM.createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.35)' }} onClick={() => setShowStorageBreakdown(false)} />
          <div className="dialog-glass" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9001, width: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(168,85,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(243,232,255,0.4)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>💾 Storage Breakdown</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Mode: <strong>🗃 Storage</strong></div>
              </div>
              <button onClick={() => setShowStorageBreakdown(false)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999' }}>✕</button>
            </div>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(168,85,247,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>Total Used</span>
              <span style={{ fontSize: 15, fontWeight: 800, background: 'linear-gradient(135deg,#9333ea,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{storageSummary ? fmtBytes(storageSummary.totalBytes) : '…'}</span>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loadingStorage ? <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Calculating…</div> : (storageSummary?.trees.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>No trees stored.</div> : storageSummary?.trees.slice().sort((a, b) => b.totalBytes - a.totalBytes).map(t => (
                <div key={t.folderName} style={{ padding: '10px 18px', borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div><span style={{ fontSize: 13, fontWeight: 600 }}>{t.treeName}</span><span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>{t.folderName}</span></div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{fmtBytes(t.totalBytes)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: '#eee', overflow: 'hidden', marginBottom: 4 }}>
                    <div className="progress-bar-fill" style={{ height: '100%', width: `${storageSummary.totalBytes > 0 ? Math.round((t.totalBytes / storageSummary.totalBytes) * 100) : 0}%`, borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#888' }}>
                    <span>📄 Tree JSON: {fmtBytes(t.jsonBytes)}</span>
                    <span>🖼 Images: {fmtBytes(t.imageBytes)}</span>
                  </div>
                </div>
              )))}
            </div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(168,85,247,0.12)', display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={loadStorageSize} disabled={loadingStorage} className="btn-ghost" style={{ padding: '6px 16px' }}>{loadingStorage ? 'Calculating…' : '↻ Refresh'}</button>
              <button onClick={() => setShowStorageBreakdown(false)} className="btn-purple" style={{ padding: '6px 16px' }}>Close</button>
            </div>
          </div>
        </>,
        document.body
      )}

      {confirmDelete && ReactDOM.createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }} onClick={() => setConfirmDelete(null)} />
          <div className="dialog-glass" style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 10001, width: 360, padding: 24, display: 'flex', flexDirection: 'column', gap: 16
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>Delete Tree?</h3>
              <p style={{ margin: 0, fontSize: 13, color: '#555', lineHeight: 1.5 }}>
                Are you sure you want to delete <strong>"{confirmDelete.treeName}"</strong>?
                <br /><br />
                This will permanently remove all data from both your <strong>local storage</strong> and the <strong>database</strong>.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setConfirmDelete(null)}
                className="btn-ghost"
                style={{ flex: 1, padding: '10px 0', background: '#9ca3af', color: '#fff' }}
              >
                No, Cancel
              </button>
              <button
                onClick={performDelete}
                className="btn-purple"
                style={{ flex: 1, padding: '10px 0', background: '#dc2626', color: '#fff' }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
