/**
 * ResourceManager.tsx — Photo grid tab (Tab 2).
 * Thumbnail grid with filter bar. Click thumbnail → TagEditor.
 */
import React, { useState, useEffect } from 'react';
import type { Resource } from '../../models/types';
import { useTreeStore } from '../../store/treeStore';
import { getImageUrl, uploadImage } from '../../db/storageAdapter';
import { makeResource } from '../../models/types';
import TagEditor from './TagEditor';

export default function ResourceManager() {
  const activeTree = useTreeStore((s) => s.activeTree);
  const activeFolder = useTreeStore((s) => s.activeFolder);
  const { addResource } = useTreeStore();

  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());
  const [filterPerson, setFilterPerson] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterCustom, setFilterCustom] = useState('');
  const [tagEditorIndex, setTagEditorIndex] = useState<number | null>(null);

  const resources = activeTree?.resources ?? [];
  const nodes = activeTree?.nodes ?? [];

  // Load thumbnail URLs
  useEffect(() => {
    if (!activeFolder) return;
    const loadAll = async () => {
      const map = new Map<string, string>();
      await Promise.all(
        resources.map(async (r) => {
          const url = await getImageUrl(activeFolder, r.id, r.filename);
          if (url) map.set(r.id, url);
        }),
      );
      setThumbUrls(new Map(map));
    };
    loadAll();
  }, [resources, activeFolder]);

  // Filter
  const filtered = resources.filter((r) => {
    if (filterPerson) {
      const match =
        r.tags.persons.some((pid) => {
          const n = nodes.find((x) => x.id === pid);
          return n?.name.toLowerCase().includes(filterPerson.toLowerCase());
        }) ||
        r.regions.some((reg) => {
          const n = nodes.find((x) => x.id === reg.node_id);
          return n?.name.toLowerCase().includes(filterPerson.toLowerCase());
        });
      if (!match) return false;
    }
    if (filterDate && !r.tags.date?.includes(filterDate)) return false;
    if (filterLocation && !r.tags.location?.toLowerCase().includes(filterLocation.toLowerCase())) return false;
    if (filterCustom) {
      const match = r.tags.custom_tags.some((t) =>
        t.toLowerCase().includes(filterCustom.toLowerCase()),
      );
      if (!match) return false;
    }
    return true;
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!activeFolder) return;
    for (const file of files) {
      const resource = makeResource({
        filename: file.name,
        original_filename: file.name,
      });
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      await uploadImage(activeFolder, resource.id, file.name, blob);
      addResource(resource);
    }
    e.target.value = '';
  };

  const personTagsLine = (r: Resource): string => {
    const names = r.tags.persons.map((pid) => {
      if (pid.startsWith('__orphan__:')) return `⚠ ${pid.slice(11)}`;
      const n = nodes.find((x) => x.id === pid);
      return n?.name ?? pid;
    });
    const parts: string[] = [...names];
    if (r.tags.location) parts.push(`📍${r.tags.location}`);
    parts.push(...r.tags.custom_tags);
    return parts.join(' · ');
  };

  if (!activeTree) return null;

  // Collect unique person names for datalist
  const personNames = Array.from(
    new Set(
      nodes
        .map((n) => n.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    ),
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Filter bar */}
      <div style={{
        display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid #eee',
        background: '#f8f9fa', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <FilterInput placeholder="🔍 Person" value={filterPerson} onChange={setFilterPerson} listId="person-list" />
        <datalist id="person-list">
          {personNames.map((name) => <option key={name} value={name} />)}
        </datalist>
        <FilterInput placeholder="📅 Date" value={filterDate} onChange={setFilterDate} />
        <FilterInput placeholder="📍 Location" value={filterLocation} onChange={setFilterLocation} />
        <FilterInput placeholder="🏷 Tag" value={filterCustom} onChange={setFilterCustom} />
        <label style={{
          padding: '6px 14px', borderRadius: 6, border: '1px solid #1565C0',
          color: '#1565C0', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          background: 'none', whiteSpace: 'nowrap',
        }}>
          ＋ Upload Photos
          <input type="file" accept="image/*" multiple onChange={handleUpload} style={{ display: 'none' }} />
        </label>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {filtered.length === 0 ? (
          <div style={{ color: '#999', fontSize: 14, marginTop: 40, textAlign: 'center' }}>
            No photos yet. Upload some or import a ZIP.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {filtered.map((r, i) => (
              <div
                key={r.id}
                style={{ width: 150, cursor: 'pointer' }}
                onClick={() => setTagEditorIndex(i)}
              >
                <div style={{
                  width: 150, height: 150, borderRadius: 8, overflow: 'hidden',
                  border: '2px solid #e0e0e0', background: '#f5f5f5',
                  transition: 'border-color 0.15s',
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#1565C0')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e0e0e0')}
                >
                  {thumbUrls.get(r.id) ? (
                    <img
                      src={thumbUrls.get(r.id)}
                      alt={r.filename}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ccc', fontSize: 12 }}>
                      📷
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, marginTop: 4, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.filename}
                </div>
                <div style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {personTagsLine(r)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {tagEditorIndex !== null && (
        <TagEditor
          resources={filtered}
          initialIndex={tagEditorIndex}
          onClose={() => setTagEditorIndex(null)}
        />
      )}
    </div>
  );
}

function FilterInput({ placeholder, value, onChange, listId }: {
  placeholder: string; value: string; onChange: (v: string) => void; listId?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      list={listId}
      style={{
        padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc',
        fontSize: 13, width: 130, outline: 'none',
      }}
    />
  );
}

