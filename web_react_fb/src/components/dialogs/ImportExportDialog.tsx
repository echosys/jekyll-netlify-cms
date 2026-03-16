/**
 * ImportExportDialog.tsx — ZIP import/export dialog.
 */
import React, { useRef, useState, useEffect } from 'react';
import { useTreeStore } from '../../store/treeStore';
import { importZip, exportZip } from '../../utils/zip';
import { createTree, uploadImage } from '../../db/storageAdapter';

interface Props {
  onClose: () => void;
  refreshTreeList: () => void;
}

export default function ImportExportDialog({ onClose, refreshTreeList }: Props) {
  const activeTree = useTreeStore((s) => s.activeTree);
  const activeFolder = useTreeStore((s) => s.activeFolder);
  const { openTree } = useTreeStore();

  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Escape to close — no click-outside close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('Importing…');
    try {
      const { tree, images, folderName } = await importZip(file);
      // 1. Create the tree root first so resources array is initialized
      await createTree(folderName, tree);

      // 2. Upload images (will update resources array with metadata)
      for (const [resourceId, blob] of images.entries()) {
        const resource = tree.resources.find((r) => r.id === resourceId);
        if (resource) {
          await uploadImage(folderName, resourceId, resource.filename, blob);
        }
      }

      setStatus(`✅ Imported "${tree.tree_name}" successfully!`);
      // 3. Open in 'synced' mode so syncTick starts
      openTree(tree, folderName, 'synced');
      refreshTreeList();
    } catch (err: any) {
      setStatus(`❌ Import failed: ${err.message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleExport = async () => {
    if (!activeTree || !activeFolder) {
      setStatus('❌ No tree is open to export.');
      return;
    }
    setExporting(true);
    setStatus('Exporting…');
    try {
      await exportZip(activeTree, activeFolder);
      setStatus(`✅ Exported "${activeTree.tree_name}" as ZIP.`);
    } catch (err: any) {
      setStatus(`❌ Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(30,10,60,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div className="dialog-glass" style={{ width: 440, padding: 28 }}>
        <h2 className="grad-text" style={{ margin: '0 0 20px', fontSize: 18 }}>📦 ZIP Import / Export</h2>

        <Section title="Import ZIP">
          <p style={{ fontSize: 13, color: '#555', margin: '0 0 12px' }}>
            Import a family tree from a <code>.zip</code> file containing <code>tree.json</code> and a <code>resources/</code> folder.
          </p>
          <label className="btn-ghost" style={{ display: 'inline-block', padding: '8px 16px', cursor: 'pointer' }}>
            📂 Choose ZIP file
            <input ref={fileRef} type="file" accept=".zip" onChange={handleImport} style={{ display: 'none' }} />
          </label>
        </Section>

        <Section title="Export ZIP">
          <p style={{ fontSize: 13, color: '#555', margin: '0 0 12px' }}>
            Export the currently open tree (<strong>{activeTree?.tree_name ?? 'none'}</strong>) as a downloadable <code>.zip</code>.
          </p>
          <button
            onClick={handleExport}
            disabled={!activeTree || exporting}
            className={activeTree && !exporting ? 'btn-purple' : 'btn-ghost'}
            style={{ padding: '8px 16px', opacity: !activeTree || exporting ? 0.5 : 1 }}
          >
            {exporting ? 'Exporting…' : '⬇ Export current tree'}
          </button>
        </Section>

        {status && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: status.startsWith('❌') ? 'rgba(255,200,200,0.5)' : 'rgba(200,255,220,0.5)', backdropFilter: 'blur(6px)', border: `1px solid ${status.startsWith('❌') ? 'rgba(220,50,50,0.25)' : 'rgba(50,180,80,0.25)'}`, fontSize: 13 }}>
            {status}
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '8px 20px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass grad-border" style={{ marginBottom: 20, padding: 16, borderRadius: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#9333ea', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
      {children}
    </div>
  );
}

