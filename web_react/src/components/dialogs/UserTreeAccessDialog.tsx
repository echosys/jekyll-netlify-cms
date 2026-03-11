/**
 * UserTreeAccessDialog.tsx — Dev-only dialog to manage which trees each user can access.
 */
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useSyncStore } from '../../store/syncStore';

interface ManagedUser {
  username: string;
  role: 'dev' | 'user';
  color: string;
  allowed_trees?: string[];
}

interface Props {
  onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeFetch(url: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* ignore */ }
    return { ok: res.ok, data };
  } catch { return { ok: false, data: null }; }
}

export default function UserTreeAccessDialog({ onClose }: Props) {
  const { user } = useAuthStore();
  const syncStore = useSyncStore();

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [allTrees, setAllTrees] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingTrees, setLoadingTrees] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Error from loading users (shown in the left panel) */
  const [loadError, setLoadError] = useState('');
  /** Error from saving (shown in the footer) */
  const [saveError, setSaveError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [editedTrees, setEditedTrees] = useState<string[]>([]);
  const loadAttemptRef = useRef(0);

  // Escape key → close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const loadData = () => {
    const attempt = ++loadAttemptRef.current;
    setLoadingUsers(true);
    setLoadingTrees(true);
    setLoadError('');

    (async () => {
      // ── Load users ────────────────────────────────────────────────────────
      if (user) {
        const res = await safeFetch('/api/mongo-admin', {
          action: 'list-users',
          requesterUsername: user.username,
        });
        if (attempt !== loadAttemptRef.current) return;
        if (!res.ok) {
          const raw = res.data?.error ?? 'Failed to load users.';
          // Give a helpful hint when the local dev server hasn't been restarted
          const hint = raw === 'Not found'
            ? 'API not found — restart fs-server.ts (npx tsx api/fs-server.ts)'
            : raw;
          setLoadError(hint);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fetched: ManagedUser[] = (res.data?.users ?? []).map((u: any) => ({
            username: u.username,
            role: u.role ?? 'user',
            color: u.color ?? '#888',
            allowed_trees: Array.isArray(u.allowed_trees) ? u.allowed_trees : [],
          }));
          setUsers(fetched);
          const firstNonDev = fetched.find((u) => u.role !== 'dev');
          if (firstNonDev) {
            setSelectedUser(firstNonDev.username);
            setEditedTrees(firstNonDev.allowed_trees ?? []);
          }
        }
        setLoadingUsers(false);
      } else {
        setLoadingUsers(false);
      }

      // ── Load trees ────────────────────────────────────────────────────────
      const c = syncStore.conn;
      if (c) {
        const conn = {
          host: c.host, port: parseInt(c.port) || 5432,
          dbname: c.dbname, user: c.user,
          credphrase: c.credphrase, sslMode: c.sslMode,
          schema: c.schema, table: c.table,
        };
        const res = await safeFetch('/api/pg-list', conn);
        if (attempt !== loadAttemptRef.current) return;
        if (res.ok) setAllTrees(res.data?.trees ?? []);
      }
      setLoadingTrees(false);
    })();
  };

  // Load on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, []);

  const handleSelectUser = (username: string) => {
    setSelectedUser(username);
    const u = users.find((u) => u.username === username);
    setEditedTrees(u?.allowed_trees ?? []);
    setSaveError('');
    setSuccessMsg('');
  };

  const toggleTree = (treeName: string) => {
    setEditedTrees((prev) =>
      prev.includes(treeName) ? prev.filter((t) => t !== treeName) : [...prev, treeName],
    );
  };

  const handleSave = async () => {
    if (!user || !selectedUser) return;
    setSaving(true);
    setSaveError('');
    setSuccessMsg('');
    const res = await safeFetch('/api/mongo-admin', {
      action: 'set-allowed-trees',
      requesterUsername: user.username,
      targetUsername: selectedUser,
      allowedTrees: editedTrees,
    });
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.data?.error ?? 'Failed to save.');
      return;
    }
    setUsers((prev) =>
      prev.map((u) => u.username === selectedUser ? { ...u, allowed_trees: editedTrees } : u),
    );
    setSuccessMsg(`Saved access for ${selectedUser}.`);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const selected = users.find((u) => u.username === selectedUser);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      // No onClick on backdrop — must use ✕ button or Escape
    >
      <div
        className="dialog-glass"
        style={{ width: 560, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid rgba(168,85,247,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#1a1a1a' }}>🔑 User Tree Access</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Control which family trees each user can see</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#aaa', lineHeight: 1, padding: 4 }}
            title="Close (Esc)"
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* User list (left) */}
          <div style={{ width: 190, borderRight: '1px solid rgba(168,85,247,0.12)', flexShrink: 0, overflowY: 'auto', padding: '10px 0', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '0 14px 6px' }}>
              Users
            </div>
            {loadingUsers ? (
              <div style={{ padding: '8px 14px', fontSize: 12, color: '#aaa' }}>Loading…</div>
            ) : loadError ? (
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#c62828', lineHeight: 1.5 }}>⚠️ {loadError}</div>
                <button
                  onClick={() => { setUsers([]); loadData(); }}
                  style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #f9a8a8', background: '#fff5f5', borderRadius: 6, cursor: 'pointer', color: '#c62828', fontWeight: 600, alignSelf: 'flex-start' }}
                >
                  ↺ Retry
                </button>
              </div>
            ) : users.length === 0 ? (
              <div style={{ padding: '8px 14px', fontSize: 12, color: '#aaa' }}>No users found.</div>
            ) : (
              users.map((u) => {
                const isDev = u.role === 'dev';
                const isSelected = selectedUser === u.username;
                return (
                  <button
                    key={u.username}
                    onClick={() => !isDev && handleSelectUser(u.username)}
                    disabled={isDev}
                    style={{
                      width: '100%', textAlign: 'left', padding: '8px 14px',
                      background: isSelected ? 'rgba(168,85,247,0.1)' : 'none',
                      border: 'none', cursor: isDev ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      borderLeft: isSelected ? '3px solid #9333ea' : '3px solid transparent',
                      opacity: isDev ? 0.4 : 1,
                    }}
                  >
                    <span style={{
                      width: 26, height: 26, borderRadius: '50%', background: u.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 700, fontSize: 11, flexShrink: 0,
                    }}>
                      {u.username[0]?.toUpperCase() ?? '?'}
                    </span>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.username}
                      </div>
                      <div style={{ fontSize: 10, color: '#aaa' }}>
                        {isDev ? 'dev (unrestricted)' : (u.allowed_trees?.length ?? 0) === 0 ? 'No access' : `${u.allowed_trees?.length} tree${(u.allowed_trees?.length ?? 0) !== 1 ? 's' : ''}`}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Tree checklist (right) */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {!selectedUser ? (
              <div style={{ fontSize: 13, color: '#aaa', marginTop: 8 }}>Select a user on the left.</div>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#7e22ce', marginBottom: 4 }}>
                  Trees accessible by <span style={{ color: '#1a1a1a' }}>{selectedUser}</span>
                </div>
                {loadingTrees ? (
                  <div style={{ fontSize: 12, color: '#aaa' }}>Loading trees…</div>
                ) : allTrees.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#aaa' }}>
                    No trees in database{!syncStore.conn ? ' — connect to a DB first' : ''}.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                      <button
                        onClick={() => setEditedTrees([...allTrees])}
                        style={{ fontSize: 11, padding: '3px 10px', border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(243,232,255,0.5)', borderRadius: 6, cursor: 'pointer', color: '#7e22ce', fontWeight: 600 }}
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => setEditedTrees([])}
                        style={{ fontSize: 11, padding: '3px 10px', border: '1px solid #e0e0e0', background: 'rgba(255,255,255,0.5)', borderRadius: 6, cursor: 'pointer', color: '#888', fontWeight: 600 }}
                      >
                        Clear All
                      </button>
                    </div>
                    {allTrees.map((treeName) => {
                      const checked = editedTrees.some((t) => t.trim().toLowerCase() === treeName.trim().toLowerCase());
                      return (
                        <label
                          key={treeName}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                            borderRadius: 8, cursor: 'pointer',
                            background: checked ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.4)',
                            border: `1px solid ${checked ? 'rgba(168,85,247,0.25)' : 'rgba(0,0,0,0.07)'}`,
                            transition: 'background 0.15s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTree(treeName)}
                            style={{ accentColor: '#9333ea', width: 15, height: 15, flexShrink: 0 }}
                          />
                          <span style={{ fontSize: 13, color: '#222', fontWeight: checked ? 600 : 400 }}>
                            🌳 {treeName}
                          </span>
                        </label>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(168,85,247,0.12)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          {saveError && <span style={{ fontSize: 12, color: '#c62828', flex: 1 }}>⚠️ {saveError}</span>}
          {successMsg && <span style={{ fontSize: 12, color: '#2E7D32', flex: 1 }}>✅ {successMsg}</span>}
          {!saveError && !successMsg && <span style={{ flex: 1 }} />}
          <button
            onClick={onClose}
            style={{ padding: '7px 18px', border: '1px solid #e0e0e0', background: 'rgba(255,255,255,0.6)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#555', fontWeight: 600 }}
          >
            Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !selectedUser || selected?.role === 'dev'}
            style={{
              padding: '7px 20px', border: 'none', background: saving ? '#c084fc' : '#9333ea',
              borderRadius: 8, cursor: saving || !selectedUser ? 'default' : 'pointer',
              fontSize: 13, color: '#fff', fontWeight: 700,
              opacity: !selectedUser ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : '💾 Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
