/**
 * ResourceManager.tsx — Photo grid tab (Tab 2).
 * Thumbnail grid with filter bar + group-by. Click thumbnail → TagEditor.
 */
import React, { useState, useEffect, useMemo } from 'react';
import type { Resource } from '../../models/types';
import { useTreeStore } from '../../store/treeStore';
import { getImageUrl, uploadImage, saveTree } from '../../db/storageAdapter';
import { makeResource } from '../../models/types';
import TagEditor from './TagEditor';

type GroupBy = 'none' | 'date' | 'person' | 'location' | 'tag';

export default function ResourceManager() {
  const activeTree = useTreeStore((s) => s.activeTree);
  const activeFolder = useTreeStore((s) => s.activeFolder);
  const { addResource } = useTreeStore();

  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());
  const [filterPerson, setFilterPerson] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterCustom, setFilterCustom] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [tagEditorIndex, setTagEditorIndex] = useState<number | null>(null);
  const [tagEditorList, setTagEditorList] = useState<Resource[]>([]);

  const resources = useMemo(() => activeTree?.resources ?? [], [activeTree]);
  const nodes = useMemo(() => activeTree?.nodes ?? [], [activeTree]);

  // Load thumbnail URLs
  useEffect(() => {
    if (!activeFolder) return;
    const loadAll = async () => {
      const map = new Map<string, string>();
      await Promise.all(
        resources.map(async (r) => {
          try {
            const url = await getImageUrl(activeFolder, r.id, r.filename);
            if (url) {
              map.set(r.id, url);
            } else {
              console.warn('[ResourceManager] getImageUrl returned null for', { folder: activeFolder, id: r.id, filename: r.filename });
            }
          } catch (err) {
            console.warn('[ResourceManager] getImageUrl failed', r.id, r.filename, err);
          }
        }),
      );
      setThumbUrls(new Map(map));
    };
    loadAll();
  }, [resources, activeFolder]);

  // Derived: all existing custom tags (sorted)
  const allCustomTags = Array.from(
    new Set(resources.flatMap((r) => r.tags?.custom_tags || [])),
  ).sort((a, b) => a.localeCompare(b));

  // Collect unique person names for datalist
  const personNames = Array.from(
    new Set(nodes.map((n) => n.name).filter(Boolean).sort((a, b) => a.localeCompare(b))),
  );

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
    if (filterDate && !r.tags?.date?.includes(filterDate)) return false;
    if (filterLocation && !r.tags?.location?.toLowerCase().includes(filterLocation.toLowerCase())) return false;
    return !filterCustom || (r.tags?.custom_tags || []).some((t) => t.toLowerCase().includes(filterCustom.toLowerCase()));
  });

  // Group logic
  type Group = { key: string; label: string; items: Resource[] };
  const buildGroups = (): Group[] => {
    if (groupBy === 'none') return [{ key: '__all__', label: '', items: filtered }];

    const map = new Map<string, Resource[]>();
    const UNGROUPED = '(none)';

    filtered.forEach((r) => {
      let keys: string[] = [];
      if (groupBy === 'date') keys = [r.tags.date ?? UNGROUPED];
      else if (groupBy === 'person') {
        keys = r.tags.persons.map((pid) => {
          if (pid.startsWith('__orphan__:')) return `⚠ ${pid.slice(11)}`;
          const n = nodes.find((x) => x.id === pid);
          return n?.name ?? pid;
        });
        if (keys.length === 0) keys = [UNGROUPED];
      } else if (groupBy === 'location') keys = [r.tags?.location ?? UNGROUPED];
      else if (groupBy === 'tag') {
        const customTags = r.tags?.custom_tags || [];
        keys = customTags.length > 0 ? customTags : [UNGROUPED];
      }
      keys.forEach((k) => {
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(r);
      });
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === UNGROUPED) return 1;
        if (b === UNGROUPED) return -1;
        return a.localeCompare(b);
      })
      .map(([key, items]) => ({ key, label: key, items }));
  };

  const groups = buildGroups();

  const openTagEditor = (resource: Resource, groupItems: Resource[]) => {
    const idx = groupItems.indexOf(resource);
    setTagEditorList(groupItems);
    setTagEditorIndex(idx);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!activeFolder) return;
    for (const file of files) {
      const resource = makeResource({
        filename: file.name,
        original_filename: file.name,
      });
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      try {
        await uploadImage(activeFolder, resource.id, file.name, blob);
        // Try to get a usable URL immediately and update thumbnails
        try {
          const url = await getImageUrl(activeFolder, resource.id, resource.filename);
          if (url) setThumbUrls((prev) => { const m = new Map(prev); m.set(resource.id, url); return m; });
          else console.warn('[ResourceManager] upload succeeded but no URL available yet', { folder: activeFolder, id: resource.id, filename: resource.filename });
        } catch (errUrl) {
          console.warn('[ResourceManager] getImageUrl after upload failed', errUrl);
        }
      } catch (err) {
        console.error('[ResourceManager] uploadImage failed', { folder: activeFolder, id: resource.id, name: file.name, err });
        // still add resource record so UI shows it; metadata may be missing
      }
      addResource(resource);
      // Persist the tree to the backend so the resource metadata (filename/size) is stored
      try {
        if (activeFolder) await saveTree(activeFolder, (await import('../../store/treeStore').then(m => m.useTreeStore.getState().activeTree)) as any);
      } catch (e) {
        console.warn('[ResourceManager] saveTree after upload failed', e);
      }
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
    if (r.tags?.location) parts.push(`📍${r.tags.location}`);
    parts.push(...(r.tags?.custom_tags || []));
    return parts.join(' · ');
  };

  if (!activeTree) return null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ── Filter / toolbar bar ── */}
      <div style={{
        display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid #eee',
        background: '#f8f9fa', flexWrap: 'wrap', alignItems: 'center',
      }}>
        {/* Person filter */}
        <FilterInput placeholder="🔍 Person" value={filterPerson} onChange={setFilterPerson} listId="rm-person-list" />
        <datalist id="rm-person-list">
          {personNames.map((n) => <option key={n} value={n} />)}
        </datalist>

        {/* Date filter */}
        <FilterInput placeholder="📅 Date" value={filterDate} onChange={setFilterDate} />

        {/* Location filter */}
        <FilterInput placeholder="📍 Location" value={filterLocation} onChange={setFilterLocation} />

        {/* Tag filter — select from existing tags OR type custom */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            value={filterCustom}
            onChange={(e) => setFilterCustom(e.target.value)}
            placeholder="🏷 Tag"
            list="rm-tag-list"
            style={{
              padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc',
              fontSize: 13, width: 130, outline: 'none',
            }}
          />
          <datalist id="rm-tag-list">
            {allCustomTags.map((t) => <option key={t} value={t} />)}
          </datalist>
          {filterCustom && (
            <button
              onClick={() => setFilterCustom('')}
              style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 14, lineHeight: 1 }}
              title="Clear tag filter"
            >×</button>
          )}
        </div>

        {/* Group by */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
          <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap', fontWeight: 600 }}>Group by:</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            style={{
              padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc',
              fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer',
            }}
          >
            <option value="none">None</option>
            <option value="date">📅 Date</option>
            <option value="person">👤 Person</option>
            <option value="location">📍 Location</option>
            <option value="tag">🏷 Tag</option>
          </select>
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <label style={{
            padding: '6px 14px', borderRadius: 6, border: '1px solid #7c3aed',
            color: '#7c3aed', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: 'none', whiteSpace: 'nowrap', display: 'block',
          }}>
            ＋ Upload Photos
            <input type="file" accept="image/*" multiple onChange={handleUpload} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {/* ── Grid / groups ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {filtered.length === 0 ? (
          <div style={{ color: '#999', fontSize: 14, marginTop: 40, textAlign: 'center' }}>
            No photos yet. Upload some or import a ZIP.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key} style={{ marginBottom: groupBy !== 'none' ? 28 : 0 }}>
              {/* Group header */}
              {groupBy !== 'none' && (
                <div style={{
                  fontSize: 12, fontWeight: 700, color: '#7c3aed',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  marginBottom: 10, paddingBottom: 5,
                  borderBottom: '1px solid rgba(124,58,237,0.15)',
                }}>
                  {group.label}
                  <span style={{ fontWeight: 400, color: '#999', marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>
                    ({group.items.length})
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                {group.items.map((r) => (
                  <div
                    key={r.id}
                    style={{ width: 150, cursor: 'pointer' }}
                    onClick={() => openTagEditor(r, group.items)}
                  >
                    <div style={{
                      position: 'relative',
                      width: 150, height: 150, borderRadius: 8, overflow: 'hidden',
                      border: '2px solid #e0e0e0', background: '#f5f5f5',
                      transition: 'border-color 0.15s',
                    }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#7c3aed')}
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
                      {/* Date badge */}
                      {r.tags.date && (
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 10,
                          padding: '3px 6px', textAlign: 'center',
                        }}>
                          {r.tags.date}
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
            </div>
          ))
        )}
      </div>

      {tagEditorIndex !== null && (
        <TagEditor
          resources={tagEditorList}
          initialIndex={tagEditorIndex}
          onClose={() => { setTagEditorIndex(null); setTagEditorList([]); }}
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

