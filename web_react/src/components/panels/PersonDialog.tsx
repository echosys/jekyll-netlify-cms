/**
 * PersonDialog.tsx — Bio/photos/links dialog for a person node.
 * Layout: left tab-list | right full-panel for selected tab.
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

type DialogTab = 'info' | 'bio' | 'photos';

export default function PersonDialog({ node: initialNode, onClose }: Props) {
  const activeTree = useTreeStore((s) => s.activeTree);
  const activeFolder = useTreeStore((s) => s.activeFolder);
  const { updateNode } = useTreeStore();

  const [activeTab, setActiveTab] = useState<DialogTab>('info');

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

  const handleClose = useCallback(() => {
    if (isDirty()) {
      const choice = window.confirm('You have unsaved changes. Save before closing?');
      if (choice) handleSave();
    }
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSave, onClose]);

  // Keyboard shortcuts: Escape / Cmd+W / Ctrl+W to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); handleClose(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); handleClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  const addLink = () => setLinks([...links, { label: '', url: '' }]);
  const updateLink = (i: number, field: 'label' | 'url', val: string) => {
    const next = [...links];
    next[i] = { ...next[i], [field]: val };
    setLinks(next);
  };
  const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i));
  const openUrl = (url: string) => {
    const href = url.startsWith('http') ? url : `https://${url}`;
    window.open(href, '_blank', 'noopener');
  };

  const tabs: { key: DialogTab; icon: string; label: string }[] = [
    { key: 'info',   icon: 'ℹ️',  label: 'Info'   },
    { key: 'bio',    icon: '📝', label: 'Bio'    },
    { key: 'photos', icon: '📷', label: 'Photos' },
  ];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(30,10,60,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="dialog-glass" style={{
        width: 860, height: 580,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid rgba(168,85,247,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(243,232,255,0.35)', flexShrink: 0,
        }}>
          <h2 className="grad-text" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            👤 {name || '(unnamed)'}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handleSave}
              style={{ padding: '6px 16px', borderRadius: 7, border: 'none',
                background: '#7c3aed', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
            >
              💾 Save
            </button>
            <button onClick={handleClose}
              style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9333ea' }}>
              ✕
            </button>
          </div>
        </div>

        {/* ── Body: left tab-list | right content ────────────────────────── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left: vertical tab list */}
          <div style={{
            width: 140, flexShrink: 0,
            borderRight: '1px solid rgba(168,85,247,0.15)',
            background: 'rgba(243,232,255,0.2)',
            display: 'flex', flexDirection: 'column',
            padding: '12px 0',
            gap: 4,
          }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 18px',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  fontSize: 14, fontWeight: activeTab === t.key ? 700 : 500,
                  background: activeTab === t.key
                    ? 'rgba(124,58,237,0.12)'
                    : 'transparent',
                  color: activeTab === t.key ? '#7c3aed' : '#444',
                  borderLeft: activeTab === t.key ? '3px solid #7c3aed' : '3px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Right: tab content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* ── TAB 1: Info ──────────────────────────────────────────── */}
            {activeTab === 'info' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <Field label="Full Name">
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    style={inputStyle} placeholder="Full name" />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <Field label="Gender">
                    <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} style={inputStyle}>
                      <option value="unknown">Unknown</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </Field>
                  <Field label="Date of Birth">
                    <input value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
                      style={inputStyle} placeholder="YYYY-MM-DD" />
                  </Field>
                </div>

                <Field label="Passed Away">
                  <input value={deathDate} onChange={(e) => setDeathDate(e.target.value)}
                    style={inputStyle} placeholder="YYYY-MM-DD — leave blank if living" />
                </Field>

                {/* Links */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🔗 Links
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                      style={{ alignSelf: 'flex-start', padding: '7px 16px', borderRadius: 6,
                        border: '1px solid #7c3aed', color: '#7c3aed', background: 'none',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                      + Add Link
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: Bio ───────────────────────────────────────────── */}
            {activeTab === 'bio' && (
              <div style={{ flex: 1, padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Biography
                </div>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Write a biography…"
                  style={{
                    flex: 1, resize: 'none', padding: '12px 14px',
                    borderRadius: 8, border: '1px solid #d1d5db',
                    fontSize: 14, lineHeight: 1.7, fontFamily: 'inherit',
                    outline: 'none', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.7)',
                  }}
                />
              </div>
            )}

            {/* ── TAB 3: Photos ────────────────────────────────────────── */}
            {activeTab === 'photos' && (() => {
              const sortedPhotoUrls = [...photoUrls].sort((a, b) => {
                const da = a.resource.tags.date ?? '';
                const db = b.resource.tags.date ?? '';
                if (!da && !db) return 0;
                if (!da) return 1;
                if (!db) return -1;
                return da.localeCompare(db);
              });
              return (
              <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Photos
                </div>
                {sortedPhotoUrls.length === 0 ? (
                  <div style={{ color: '#aaa', fontSize: 14, marginTop: 60, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
                    No photos tagged to this person yet.<br />
                    <span style={{ fontSize: 12 }}>Tag photos in the Resources tab.</span>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
                    {sortedPhotoUrls.map(({ url, resource }, i) => (
                      <div
                        key={resource.id}
                        onClick={() => setPhotoViewerIndex(i)}
                        style={{
                          position: 'relative',
                          aspectRatio: '1', borderRadius: 10, overflow: 'hidden',
                          cursor: 'pointer', border: '2px solid rgba(168,85,247,0.2)',
                          background: '#f5f5f5', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                          transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.03)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(124,58,237,0.18)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
                      >
                        {url && (
                          <img src={url} alt={resource.filename}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                        {resource.tags.date && (
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 10, padding: '3px 6px', textAlign: 'center' }}>
                            {resource.tags.date}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              );
            })()}

          </div>
        </div>
      </div>

      {/* Photo lightbox — use sorted order */}
      {photoViewerIndex !== null && (() => {
        const sortedPhotoUrls = [...photoUrls].sort((a, b) => {
          const da = a.resource.tags.date ?? '';
          const db = b.resource.tags.date ?? '';
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return da.localeCompare(db);
        });
        return (
          <PhotoViewer
            photos={sortedPhotoUrls.map((p) => ({ url: p.url, filename: p.resource.filename }))}
            initialIndex={photoViewerIndex}
            onClose={() => setPhotoViewerIndex(null)}
          />
        );
      })()}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 7,
  border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box',
  outline: 'none', background: 'rgba(255,255,255,0.7)',
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
          placeholder="https://…" style={{ ...inputStyle, flex: 2 }} />
        <button onClick={() => setEditing(false)}
          style={{ padding: '7px 11px', borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', cursor: 'pointer' }}>
          ✔
        </button>
        <button onClick={onRemove}
          style={{ padding: '7px 11px', borderRadius: 6, border: 'none', background: '#fee2e2', color: '#b91c1c', cursor: 'pointer' }}>
          ✕
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', borderRadius: 7, background: 'rgba(243,232,255,0.35)', border: '1px solid rgba(168,85,247,0.12)' }}>
      <span style={{ color: '#555', fontSize: 13, minWidth: 70, fontWeight: 600 }}>{link.label}</span>
      <span
        onClick={onOpen}
        style={{ color: '#7c3aed', fontSize: 13, textDecoration: 'underline', cursor: 'pointer', flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {link.url}
      </span>
      <button onClick={() => setEditing(true)}
        style={{ padding: '4px 9px', borderRadius: 5, border: '1px solid #d1d5db', background: 'none', cursor: 'pointer', fontSize: 12 }}>
        ✏
      </button>
      <button onClick={onOpen}
        style={{ padding: '4px 9px', borderRadius: 5, border: '1px solid #d1d5db', background: 'none', cursor: 'pointer', fontSize: 12 }}>
        ↗
      </button>
      <button onClick={onRemove}
        style={{ padding: '4px 9px', borderRadius: 5, border: 'none', background: '#fee2e2', color: '#b91c1c', cursor: 'pointer', fontSize: 12 }}>
        ✕
      </button>
    </div>
  );
}

