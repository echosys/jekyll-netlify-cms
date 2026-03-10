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
      for (const [resourceId, blob] of images.entries()) {
        const resource = tree.resources.find((r) => r.id === resourceId);
        if (resource) {
          await uploadImage(folderName, resourceId, resource.filename, blob);
        }
      }
      await createTree(folderName, tree);
      setStatus(`✅ Imported "${tree.tree_name}" successfully!`);
      openTree(tree, folderName);
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
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: 440, padding: 28, boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
        <h2 style={{ margin: '0 0 20px', fontSize: 18 }}>📦 ZIP Import / Export</h2>

        <Section title="Import ZIP">
          <p style={{ fontSize: 13, color: '#555', margin: '0 0 12px' }}>
            Import a family tree from a <code>.zip</code> file containing <code>tree.json</code> and a <code>resources/</code> folder.
          </p>
          <label style={{ display: 'inline-block', padding: '8px 16px', borderRadius: 6, border: '1px solid #1565C0', color: '#1565C0', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
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
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: activeTree ? '#1565C0' : '#ccc', color: '#fff', cursor: activeTree ? 'pointer' : 'default', fontWeight: 600, fontSize: 13 }}
          >
            {exporting ? 'Exporting…' : '⬇ Export current tree'}
          </button>
        </Section>

        {status && (
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 7, background: status.startsWith('❌') ? '#fee' : '#e8f5e9', fontSize: 13 }}>
            {status}
          </div>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid #ccc', background: '#f5f5f5', cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20, padding: 16, borderRadius: 8, border: '1px solid #eee', background: '#fafafa' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: '#333' }}>{title}</div>
      {children}
    </div>
  );
}

