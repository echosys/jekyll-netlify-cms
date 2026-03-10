/**
 * Sidebar.tsx — Tree list sidebar with new/edit/open controls.
wh */
import { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTreeStore, type TreeMeta } from '../../store/treeStore';
import { listTrees, loadTree, createTree, deleteTree, getStorageSummary, type StorageSummary } from '../../db/storageAdapter';
import { STORAGE_MODE } from '../../appConfig';
import { makeTree } from '../../models/types';
import { slugify } from '../../utils/zip';

interface Props {
  onOpenImportExport: () => void;
  onOpenDB: () => void;
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

  const [newTreeName, setNewTreeName] = useState('');
  const [creating, setCreating] = useState(false);
  const [storageSummary, setStorageSummary] = useState<StorageSummary | null>(null);
  const [showStorageBreakdown, setShowStorageBreakdown] = useState(false);
  const [loadingStorage, setLoadingStorage] = useState(false);

  useEffect(() => { refresh(); }, []);

  const refresh = async () => {
    try {
      const list = await listTrees();
      setTreeList(list);
    } catch {
      setTreeList([]);
    }
  };

  const loadStorageSize = useCallback(async () => {
    setLoadingStorage(true);
    try {
      const summary = await getStorageSummary();
      setStorageSummary(summary);
    } catch {}
    setLoadingStorage(false);
  }, []);

  // Load storage size on mount and whenever tree list changes
  useEffect(() => { loadStorageSize(); }, [treeList.length]);

  const handleOpenTree = async (meta: TreeMeta) => {
    if (isDirty && !confirm('You have unsaved changes. Open another tree anyway?')) return;
    try {
      const tree = await loadTree(meta.folderName);
      openTree(tree, meta.folderName);
    } catch (err: any) {
      alert(`Failed to open tree: ${err.message}`);
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
    } catch (err: any) {
      alert(`Failed to create tree: ${err.message}`);
    }
  };

  const handleDeleteTree = async (meta: TreeMeta) => {
    if (!confirm(`Delete "${meta.treeName}"? This cannot be undone.`)) return;
    try {
      await deleteTree(meta.folderName);
      if (activeFolder === meta.folderName) closeTree();
      setTreeList(treeList.filter((t) => t.folderName !== meta.folderName));
    } catch (err: any) {
      alert(`Failed to delete: ${err.message}`);
    }
  };

  const storageBadge = STORAGE_MODE === 'filesystem'
    ? { label: '📁 Filesystem', color: '#e8f5e9', border: '#a5d6a7', text: '#2e7d32' }
    : { label: '🗃 IndexedDB', color: '#e3f2fd', border: '#90caf9', text: '#1565C0' };

  const totalStr = storageSummary
    ? fmtBytes(storageSummary.totalBytes)
    : loadingStorage ? '…' : '—';

  return (
    <div style={{
      width: 220, height: '100%', display: 'flex', flexDirection: 'column',
      borderRight: '1px solid #e0e0e0', background: '#fafafa',
    }}>
      {/* App title */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #eee', background: '#fff' }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: '#1565C0' }}>🌳 FamTree</div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>Family Tree App</div>
      </div>

      {/* Storage mode badge + size */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', background: storageBadge.color }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#555', marginBottom: 4 }}>WORKING STORAGE</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <div style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 12,
            border: `1px solid ${storageBadge.border}`, fontSize: 11,
            fontWeight: 700, color: storageBadge.text,
          }}>
            {storageBadge.label}
          </div>
          {/* Clickable size pill */}
          <button
            onClick={() => { loadStorageSize(); setShowStorageBreakdown(true); }}
            title="Click to see storage breakdown"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 10,
              border: `1px solid ${storageBadge.border}`,
              background: 'rgba(255,255,255,0.6)',
              cursor: 'pointer', fontSize: 11, fontWeight: 700,
              color: storageBadge.text,
            }}
          >
            💾 {totalStr}
          </button>
        </div>
        {STORAGE_MODE === 'filesystem' && (
          <div style={{ fontSize: 10, color: '#888', marginTop: 3 }}>
            FamilyTrees_react/ on disk
          </div>
        )}
      </div>

      {/* Tree list header */}
      <div style={{ padding: '10px 12px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>MY TREES</span>
        <button onClick={refresh} title="Refresh" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#999' }}>↻</button>
      </div>

      {/* Tree list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {treeList.length === 0 && (
          <div style={{ padding: '12px 16px', fontSize: 12, color: '#aaa' }}>
            No trees yet. Import a ZIP, connect to DB, or create a new one.
          </div>
        )}
        {treeList.map((meta) => (
          <div
            key={meta.folderName}
            onClick={() => handleOpenTree(meta)}
            style={{
              padding: '9px 14px', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between',
              background: activeFolder === meta.folderName ? '#E3F2FD' : 'transparent',
              borderLeft: activeFolder === meta.folderName ? '3px solid #1565C0' : '3px solid transparent',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => { if (activeFolder !== meta.folderName) e.currentTarget.style.background = '#f5f5f5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = activeFolder === meta.folderName ? '#E3F2FD' : 'transparent'; }}
          >
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: activeFolder === meta.folderName ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meta.treeName}
              </div>
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>{meta.folderName}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteTree(meta); }}
              title="Delete tree"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 14, padding: '2px 4px' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#c00')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#ccc')}
            >
              🗑
            </button>
          </div>
        ))}
      </div>

      {/* New tree form */}
      {creating ? (
        <div style={{ padding: '10px 12px', borderTop: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            autoFocus
            value={newTreeName}
            onChange={(e) => setNewTreeName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTree(); if (e.key === 'Escape') setCreating(false); }}
            placeholder="Tree name…"
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleCreateTree} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: '#1565C0', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
              Create
            </button>
            <button onClick={() => setCreating(false)} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid #ccc', background: '#f5f5f5', cursor: 'pointer', fontSize: 12 }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} style={{ margin: '8px 12px', padding: '8px 0', borderRadius: 6, border: '1px dashed #1565C0', color: '#1565C0', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + New Tree
        </button>
      )}

      {/* Import/Export buttons */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #eee', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={onOpenImportExport}
          style={{ padding: '7px 0', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#333' }}>
          📦 ZIP Import / Export
        </button>
        <button onClick={onOpenDB}
          style={{ padding: '7px 0', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#333' }}>
          🗄 PostgreSQL
        </button>
      </div>

      {/* Storage breakdown modal — portalled to body */}
      {showStorageBreakdown && ReactDOM.createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.35)' }}
            onClick={() => setShowStorageBreakdown(false)} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            zIndex: 9001, background: '#fff', borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            width: 420, maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8f9fa' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>💾 Storage Breakdown</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  Mode: <strong>{STORAGE_MODE === 'filesystem' ? '📁 Filesystem' : '🗃 IndexedDB'}</strong>
                  {STORAGE_MODE === 'filesystem' && <span style={{ marginLeft: 6, color: '#aaa' }}>FamilyTrees_react/</span>}
                </div>
              </div>
              <button onClick={() => setShowStorageBreakdown(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999' }}>✕</button>
            </div>

            {/* Total */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>Total Used</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#1565C0' }}>
                {storageSummary ? fmtBytes(storageSummary.totalBytes) : '…'}
              </span>
            </div>

            {/* Per-tree breakdown */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loadingStorage ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Calculating…</div>
              ) : !storageSummary || storageSummary.trees.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#aaa', fontSize: 13 }}>No trees stored.</div>
              ) : (
                storageSummary.trees
                  .slice()
                  .sort((a, b) => b.totalBytes - a.totalBytes)
                  .map((t) => {
                    const pct = storageSummary.totalBytes > 0
                      ? Math.round((t.totalBytes / storageSummary.totalBytes) * 100)
                      : 0;
                    return (
                      <div key={t.folderName} style={{ padding: '10px 18px', borderBottom: '1px solid #f5f5f5' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{t.treeName}</span>
                            <span style={{ fontSize: 10, color: '#aaa', marginLeft: 6 }}>{t.folderName}</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>{fmtBytes(t.totalBytes)}</span>
                        </div>
                        {/* Progress bar */}
                        <div style={{ height: 5, borderRadius: 3, background: '#eee', overflow: 'hidden', marginBottom: 4 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#1565C0', borderRadius: 3, transition: 'width 0.3s' }} />
                        </div>
                        {/* JSON vs images breakdown */}
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#888' }}>
                          <span>📄 Tree JSON: {fmtBytes(t.jsonBytes)}</span>
                          <span>🖼 Images: {fmtBytes(t.imageBytes)}</span>
                          <span style={{ marginLeft: 'auto' }}>{pct}%</span>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Refresh + close */}
            <div style={{ padding: '10px 18px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button onClick={loadStorageSize} disabled={loadingStorage}
                style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {loadingStorage ? 'Calculating…' : '↻ Refresh'}
              </button>
              <button onClick={() => setShowStorageBreakdown(false)}
                style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#1565C0', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Close
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
