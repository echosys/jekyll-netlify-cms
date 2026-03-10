/**
 * PersonDialog.tsx — Bio/photos/links dialog for a person node.
 * Floating modal with dirty-check on close.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { TreeNode, Gender, Resource } from '../../models/types';
import { useTreeStore } from '../../store/treeStore';
import { getImageUrl } from '../../db/storageAdapter';
import PhotoViewer from './PhotoViewer';

interface Props {
  node: TreeNode;
  onClose: () => void;
}

export default function PersonDialog({ node: initialNode, onClose }: Props) {
  const activeTree = useTreeStore((s) => s.activeTree);
  const activeFolder = useTreeStore((s) => s.activeFolder);
  const { updateNode } = useTreeStore();

  const [name, setName] = useState(initialNode.name);
  const [birthDate, setBirthDate] = useState(initialNode.birth_date ?? '');
  const [deathDate, setDeathDate] = useState(initialNode.death_date ?? '');
  const [gender, setGender] = useState<Gender>(initialNode.gender);
  const [bio, setBio] = useState(initialNode.bio);
  const [links, setLinks] = useState(initialNode.links ?? []);

  // Photo viewer
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number | null>(null);
  const [photoUrls, setPhotoUrls] = useState<{ url: string; resource: Resource }[]>([]);

  // Dirty check snapshot
  const snapshot = useRef({ name, birthDate, deathDate, gender, bio, links });
  const isDirty = () =>
    name !== snapshot.current.name ||
    birthDate !== snapshot.current.birthDate ||
    deathDate !== snapshot.current.deathDate ||
    gender !== snapshot.current.gender ||
    bio !== snapshot.current.bio ||
    JSON.stringify(links) !== JSON.stringify(snapshot.current.links);

  // Load photos tagged to this person
  useEffect(() => {
    if (!activeTree || !activeFolder) return;
    const personResources = activeTree.resources.filter(
      (r) => r.tags.persons.includes(initialNode.id) ||
        r.regions.some((reg) => reg.node_id === initialNode.id),
    );
    Promise.all(
      personResources.map(async (r) => {
        const url = await getImageUrl(activeFolder, r.id, r.filename);
        return { url: url ?? '', resource: r };
      }),
    ).then(setPhotoUrls);
  }, [activeTree, activeFolder, initialNode.id]);

  const handleSave = useCallback(() => {
    updateNode({
      ...initialNode,
      name,
      birth_date: birthDate || null,
      death_date: deathDate || null,
      gender,
      bio,
      links,
    });
    snapshot.current = { name, birthDate, deathDate, gender, bio, links };
  }, [updateNode, initialNode, name, birthDate, deathDate, gender, bio, links]);

  const handleClose = () => {
    if (isDirty()) {
      const choice = window.confirm('You have unsaved changes. Save before closing?');
      if (choice) handleSave();
    }
    onClose();
  };

  // Keyboard shortcuts: Escape / Cmd+W / Ctrl+W to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  const addLink = () =>
    setLinks([...links, { label: '', url: '' }]);

  const updateLink = (i: number, field: 'label' | 'url', val: string) => {
    const next = [...links];
    next[i] = { ...next[i], [field]: val };
    setLinks(next);
  };

  const removeLink = (i: number) =>
    setLinks(links.filter((_, idx) => idx !== i));

  const openUrl = (url: string) => {
    const href = url.startsWith('http') ? url : `https://${url}`;
    window.open(href, '_blank', 'noopener');
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(0,0,0,0.45)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 14, width: 780, minHeight: 520,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid #eee',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#f8f9fa',
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            👤 {name || '(unnamed)'}
          </h2>
          <button onClick={handleClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#666' }}>
            ✕
          </button>
        </div>

        {/* Body: left = bio, right = photos + links */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left: Bio panel */}
          <div style={{
            width: 320, padding: 20, borderRight: '1px solid #eee',
            overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)}
                style={inputStyle} placeholder="Full name" />
            </Field>
            <Field label="Gender">
              <select value={gender} onChange={(e) => setGender(e.target.value as Gender)}
                style={inputStyle}>
                <option value="unknown">Unknown</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Born">
              <input value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
                style={inputStyle} placeholder="YYYY-MM-DD" />
            </Field>
            <Field label="Passed away">
              <input value={deathDate} onChange={(e) => setDeathDate(e.target.value)}
                style={inputStyle} placeholder="YYYY-MM-DD (leave blank if living)" />
            </Field>
            <Field label="Bio">
              <textarea value={bio} onChange={(e) => setBio(e.target.value)}
                style={{ ...inputStyle, height: 120, resize: 'vertical' }}
                placeholder="Write a short biography..." />
            </Field>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={handleSave}
                style={{ flex: 1, padding: '9px 0', borderRadius: 7, border: 'none',
                  background: '#1565C0', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                💾 Save
              </button>
              <button onClick={handleClose}
                style={{ flex: 1, padding: '9px 0', borderRadius: 7, border: '1px solid #ccc',
                  background: '#f5f5f5', cursor: 'pointer', fontSize: 14 }}>
                Cancel
              </button>
            </div>
          </div>

          {/* Right: Photos + Links */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Photos section */}
            <div style={{ flex: 1, padding: '16px 20px', borderBottom: '1px solid #eee', overflowY: 'auto' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>📷 Photos</div>
              {photoUrls.length === 0 ? (
                <div style={{ color: '#999', fontSize: 13 }}>No photos tagged to this person yet.</div>
              ) : (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {photoUrls.map(({ url, resource }, i) => (
                    <div
                      key={resource.id}
                      onClick={() => setPhotoViewerIndex(i)}
                      style={{
                        width: 90, height: 90, borderRadius: 8, overflow: 'hidden',
                        cursor: 'pointer', border: '2px solid #e0e0e0',
                        background: '#f5f5f5',
                      }}
                    >
                      {url && (
                        <img src={url} alt={resource.filename}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Links section */}
            <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>🔗 Links</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {links.map((link, i) => (
                  <LinkRow
                    key={i}
                    link={link}
                    onChange={(field, val) => updateLink(i, field, val)}
                    onRemove={() => removeLink(i)}
                    onOpen={() => openUrl(link.url)}
                  />
                ))}
                <button onClick={addLink}
                  style={{ alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 6,
                    border: '1px solid #1565C0', color: '#1565C0', background: 'none',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                  + Add Link
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Photo lightbox */}
      {photoViewerIndex !== null && (
        <PhotoViewer
          photos={photoUrls.map((p) => ({ url: p.url, filename: p.resource.filename }))}
          initialIndex={photoViewerIndex}
          onClose={() => setPhotoViewerIndex(null)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6,
  border: '1px solid #ccc', fontSize: 14, boxSizing: 'border-box',
  outline: 'none',
};

interface LinkRowProps {
  link: { label: string; url: string };
  onChange: (field: 'label' | 'url', val: string) => void;
  onRemove: () => void;
  onOpen: () => void;
}

function LinkRow({ link, onChange, onRemove, onOpen }: LinkRowProps) {
  const [editing, setEditing] = useState(!link.label && !link.url);

  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input value={link.label} onChange={(e) => onChange('label', e.target.value)}
          placeholder="Label" style={{ ...inputStyle, flex: 1 }} />
        <input value={link.url} onChange={(e) => onChange('url', e.target.value)}
          placeholder="URL" style={{ ...inputStyle, flex: 2 }} />
        <button onClick={() => setEditing(false)}
          style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#1565C0', color: '#fff', cursor: 'pointer' }}>
          ✔
        </button>
        <button onClick={onRemove}
          style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#fee', color: '#c00', cursor: 'pointer' }}>
          ✕
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }}>
      <span style={{ color: '#555', fontSize: 13, minWidth: 60 }}>{link.label}</span>
      <span
        onClick={onOpen}
        style={{ color: '#1565C0', fontSize: 13, textDecoration: 'underline', cursor: 'pointer', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {link.url}
      </span>
      <button onClick={() => setEditing(true)}
        style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid #ccc', background: 'none', cursor: 'pointer', fontSize: 12 }}>
        ✏
      </button>
      <button onClick={onOpen}
        style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid #ccc', background: 'none', cursor: 'pointer', fontSize: 12 }}>
        ↗
      </button>
      <button onClick={onRemove}
        style={{ padding: '4px 8px', borderRadius: 5, border: 'none', background: '#fee', color: '#c00', cursor: 'pointer', fontSize: 12 }}>
        ✕
      </button>
    </div>
  );
}

