/**
 * DBDialog.tsx — Database management dialog.
 */
import { useState, useEffect } from 'react';
import { useTreeStore } from '../../store/treeStore';
import { listTrees, loadTree, createTree, deleteTree } from '../../db/storageAdapter';
import { slugify } from '../../utils/zip';

interface Props {
  onClose: () => void;
  refreshTreeList: () => void;
  readOnly?: boolean;
}

export default function DBDialog({ onClose, refreshTreeList, readOnly = false }: Props) {
  const activeTree = useTreeStore((s) => s.activeTree);
  const activeFolder = useTreeStore((s) => s.activeFolder);
  const { openTree } = useTreeStore();

  const [trees, setTrees] = useState<Array<{ folderName: string; treeName: string }>>([]);
  const [selected, setSelected] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchTrees(); }, []);

  async function fetchTrees() {
    setBusy(true);
    try {
      const list = await listTrees();
      setTrees(list.map((t) => ({ folderName: t.folderName, treeName: t.treeName })));
      setStatus(`Found ${list.length} tree(s) in cloud storage`);
    } catch (e: any) {
      setStatus(`Error listing trees: ${e?.message ?? String(e)}`);
    } finally { setBusy(false); }
  }

  async function handleCreateFromActive() {
    if (!activeTree) { setStatus('No active tree to save'); return; }
    setBusy(true);
    try {
      const folder = activeFolder ?? slugify(activeTree.tree_name);
      await createTree(folder, activeTree);
      setStatus(`Saved tree as ${folder}`);
      await fetchTrees();
      refreshTreeList();
    } catch (e: any) {
      setStatus(`Error saving tree: ${e?.message ?? String(e)}`);
    } finally { setBusy(false); }
  }

  async function handleImport() {
    if (!selected) { setStatus('Select a tree to open'); return; }
    setBusy(true);
    try {
      const tree = await loadTree(selected);
      // When opening from DB dialog, we default to synced mode
      openTree(tree, selected, 'synced');
      setStatus(`Opened tree ${tree.tree_name}`);
      refreshTreeList();
      onClose();
    } catch (e: any) {
      setStatus(`Error loading tree: ${e?.message ?? String(e)}`);
    } finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!selected) { setStatus('Select a tree to delete'); return; }
    if (!confirm(`Delete tree ${selected} from database? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteTree(selected);
      setStatus(`Deleted ${selected}`);
      await fetchTrees();
      refreshTreeList();
    } catch (e: any) {
      setStatus(`Error deleting tree: ${e?.message ?? String(e)}`);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
      <div className="dialog-glass" style={{ width: 680, maxWidth: '96vw', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 className="grad-text" style={{ margin: 0, fontSize: 20 }}>🗄 Realtime Database Management</h2>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '6px 14px' }}>Close</button>
        </div>

        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#9333ea', textTransform: 'uppercase' }}>Available Trees</div>
            <div className="glass" style={{ borderRadius: 10, padding: 8, maxHeight: 350, overflowY: 'auto', border: '1px solid rgba(168,85,247,0.1)' }}>
              {trees.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#777' }}>{busy ? 'Loading...' : 'No trees found in cloud'}</div>}
              {trees.map((t) => (
                <div key={t.folderName} onClick={() => setSelected(t.folderName)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', marginBottom: 6, borderRadius: 8, cursor: 'pointer', background: selected === t.folderName ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.3)', border: `1px solid ${selected === t.folderName ? '#a855f7' : 'transparent'}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.treeName}</div>
                    <div style={{ fontSize: 11, color: '#666' }}>{t.folderName}</div>
                  </div>
                  {selected === t.folderName && <span style={{ color: '#9333ea', fontWeight: 900 }}>✓</span>}
                </div>
              ))}
            </div>
          </div>

          <div style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 0, color: '#9333ea', textTransform: 'uppercase' }}>Actions</div>
            <button onClick={handleCreateFromActive} disabled={!activeTree || busy || readOnly} className="btn-purple" style={{ padding: '12px', width: '100%', fontSize: 13 }}>
              Cloud Backup Current Tree
            </button>
            <button onClick={handleImport} disabled={!selected || busy} className="btn-ghost" style={{ padding: '12px', width: '100%', fontSize: 13 }}>
              Open Selected Tree
            </button>
            <button onClick={handleDelete} disabled={!selected || busy} className="btn-ghost" style={{ padding: '12px', width: '100%', fontSize: 13, color: selected ? '#c00' : '#888' }}>
              🗑 Delete from Cloud
            </button>
            <button onClick={fetchTrees} disabled={busy} className="btn-ghost" style={{ padding: '12px', width: '100%', fontSize: 13 }}>
              ↻ Refresh List
            </button>
            {status && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#444', padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.05)' }}>
                {status}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
