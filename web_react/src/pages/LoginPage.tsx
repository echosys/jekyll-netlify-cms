/**
 * LoginPage.tsx
 */
import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSyncStore, type TreeSyncLink } from '../store/syncStore';
import { useTreeStore } from '../store/treeStore';
import { createTree, uploadImage, loadTree } from '../db/storageAdapter';
import { slugify } from '../utils/zip';
import { AVATAR_COLORS } from '../appConfig';

function b64ToBlob(b64: string, mimeType = 'image/jpeg'): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
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

type HealthStatus = 'checking' | 'ok' | 'error' | 'unconfigured';

interface Health {
  mongo: HealthStatus;
  pg: HealthStatus;
  mongoError?: string;
  pgError?: string;
}

function StatusDot({ status, label, detail }: { status: HealthStatus; label: string; detail?: string }) {
  const COLOR: Record<HealthStatus, string> = {
    checking:     '#bdbdbd',
    ok:           '#43A047',
    error:        '#E53935',
    unconfigured: '#bdbdbd',
  };
  const LABEL: Record<HealthStatus, string> = {
    checking:     'Checking…',
    ok:           'Connected',
    error:        'Error',
    unconfigured: 'Not configured',
  };
  const pulse = status === 'checking';
  return (
    <>
      {pulse && <style>{`@keyframes hpulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#555' }}
        title={detail ?? LABEL[status]}
      >
        <span style={{
          width: 9, height: 9, borderRadius: '50%',
          background: COLOR[status], display: 'inline-block', flexShrink: 0,
          animation: pulse ? 'hpulse 1s infinite' : 'none',
        }} />
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: status === 'error' ? '#E53935' : '#aaa', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {status === 'error' && detail ? `— ${detail}` : LABEL[status]}
        </span>
      </div>
    </>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [phrase, setPhrase] = useState('');
  const [showPhrase, setShowPhrase] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Signing in…');
  const [health, setHealth] = useState<Health>({ mongo: 'checking', pg: 'checking' });

  const { login } = useAuthStore();
  const syncStore = useSyncStore();
  const { openTree, setTreeList } = useTreeStore();

  // Poll health on mount and every 15s
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) { if (!cancelled) setHealth({ mongo: 'error', pg: 'error', mongoError: `HTTP ${res.status}`, pgError: `HTTP ${res.status}` }); return; }
        const d = await res.json();
        if (!cancelled) setHealth({
          mongo: d.mongo ?? 'unconfigured',
          pg: d.pg ?? 'unconfigured',
          mongoError: d.mongoError,
          pgError: d.pgError,
        });
      } catch {
        if (!cancelled) setHealth({ mongo: 'error', pg: 'error', mongoError: 'fs-server not running', pgError: 'fs-server not running' });
      }
    };
    check();
    const t = setInterval(check, 15_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setLoadingMsg('Signing in…');

    try {
      const res = await fetch('/api/mongo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), phrase }),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = {};
      const text = await res.text();
      try { data = JSON.parse(text); } catch { /* ignore */ }

      if (!res.ok) {
        // Build a full diagnostic message
        let msg = `HTTP ${res.status}`;
        if (data?.error)  msg += ` — ${data.error}`;
        if (data?.hint)   msg += `\nHint: ${data.hint}`;
        if (data?.code)   msg += ` [${data.code}]`;
        if (!data?.error) msg += `\nRaw: ${text.slice(0, 300)}`;
        setError(msg);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user: any = data.user;
      if (!user) {
        setError(`Unexpected response (no user field).\nRaw: ${text.slice(0, 300)}`);
        return;
      }

      if (!user.color) {
        const idx = (user.username as string).charCodeAt(0) % AVATAR_COLORS.length;
        user.color = AVATAR_COLORS[idx];
      }

      if (user.role === 'user') {
        setLoadingMsg('Connecting to database…');
        const success = await autoConnectUser();
        if (!success) return;
      }

      login(user);
    } finally {
      setLoading(false);
    }
  };

  const autoConnectUser = async (): Promise<boolean> => {
    console.log('[login] autoConnectUser: start');
    // ── 1. Fetch VITE_PG_CONN from server env ──────────────────────────────
    let connString = '';
    let pgSslEnv = '';
    try {
      const envRes = await fetch('/api/user-conn');
      if (envRes.ok) {
        const envData = await envRes.json();
        connString = envData.conn ?? '';
        pgSslEnv = (envData.pgSsl ?? '').toLowerCase();
      }
    } catch { /* network error */ }

    if (!connString) {
      console.error('[login] autoConnectUser: no connString');
      setError('No database connection is configured for your account. Contact your admin.');
      return false;
    }
    console.log('[login] connString fetched, pgSslEnv:', pgSslEnv || '(empty)');

    const resolveSslMode = (fromUrl: 'auto' | 'require' | 'disable'): 'auto' | 'require' | 'disable' => {
      if (pgSslEnv === 'no' || pgSslEnv === 'disable' || pgSslEnv === 'false' || pgSslEnv === '0') return 'disable';
      if (pgSslEnv === 'require' || pgSslEnv === 'yes' || pgSslEnv === 'true' || pgSslEnv === '1') return 'require';
      return fromUrl;
    };

    let parsed: {
      host: string; port: string; dbname: string; user: string;
      credphrase: string; sslMode: 'auto' | 'require' | 'disable';
      schema: string; table: string;
    } | null = null;

    try {
      const url = new URL(connString);
      const params = url.searchParams;
      const urlSslMode = (['auto', 'require', 'disable'].includes(params.get('sslmode') ?? '')
        ? params.get('sslmode') : 'auto') as 'auto' | 'require' | 'disable';
      parsed = {
        host: url.hostname,
        port: url.port || '5432',
        dbname: url.pathname.replace(/^\//, ''),
        user: url.username,
        credphrase: decodeURIComponent(url.password),
        sslMode: resolveSslMode(urlSslMode),
        schema: params.get('schema') || 'public',
        table: params.get('table') || 'family_trees',
      };
    } catch {
      console.error('[login] autoConnectUser: failed to parse connString');
      setError('Invalid connection string format on server. Contact your admin.');
      return false;
    }

    const testConn = {
      host: parsed.host, port: parseInt(parsed.port) || 5432,
      dbname: parsed.dbname, user: parsed.user,
      credphrase: parsed.credphrase, sslMode: parsed.sslMode,
      schema: parsed.schema, table: parsed.table,
    };
    console.log('[login] parsed conn host:', parsed.host, 'sslMode:', parsed.sslMode);

    // ── 2. Test connection ─────────────────────────────────────────────────
    setLoadingMsg('Testing connection…');
    const test = await safeFetch('/api/pg-test', testConn);
    console.log('[login] pg-test result:', test.ok, test.data);
    if (!test.ok) {
      setError(`Database connection failed: ${test.data?.error ?? 'unknown error'}`);
      return false;
    }

    // ── 3. List all trees in DB ────────────────────────────────────────────
    setLoadingMsg('Loading your trees…');
    const listRes = await safeFetch('/api/pg-list', testConn);
    const dbTreeNames: string[] = listRes.ok ? (listRes.data?.trees ?? []) : [];
    console.log('[login] pg-list result:', listRes.ok, 'trees:', dbTreeNames);

    if (dbTreeNames.length === 0) {
      setError('No family trees found in the database. Contact your admin.');
      return false;
    }

    const syncConn = { ...parsed, connectionString: connString };

    // ── 4. For each DB tree: check IndexedDB cache freshness ───────────────
    const syncedTreesMap: Record<string, TreeSyncLink> = {};
    const treeMetaList: { folderName: string; treeName: string }[] = [];

    // Determine last-used tree from localStorage
    const LAST_USER_TREE_KEY = 'famt_user_last_tree';
    let lastUsedFolder = '';
    try { lastUsedFolder = localStorage.getItem(LAST_USER_TREE_KEY) ?? ''; } catch { /* ignore */ }

    let firstFolder = '';
    let firstTree: import('../models/types').Tree | null = null;

    for (const dbTreeName of dbTreeNames) {
      const folderName = slugify(dbTreeName);
      syncedTreesMap[folderName] = { dbTreeName, conn: syncConn };
      console.log('[login] processing tree:', dbTreeName, '→ folder:', folderName);

      // Try reading cache
      let cached: import('../models/types').Tree | null = null;
      try { cached = await loadTree(folderName); } catch { /* no cache */ }
      console.log('[login] cache hit:', !!cached, 'updated_at:', cached?.updated_at);

      let treeToUse: import('../models/types').Tree | null = null;

      if (cached) {
        // Check if cache is still fresh: fetch just the updated_at from DB
        const importRes = await safeFetch('/api/pg-import', { conn: testConn, treeName: dbTreeName });
        console.log('[login] import for cache check ok:', importRes.ok, 'db updated_at:', (importRes.data?.tree as import('../models/types').Tree | undefined)?.updated_at);
        if (importRes.ok && importRes.data?.tree) {
          const dbTree = importRes.data.tree as import('../models/types').Tree;
          if (dbTree.updated_at <= (cached.updated_at ?? '')) {
            treeToUse = cached;
            setLoadingMsg(`Using cached "${dbTreeName}"…`);
            console.log('[login] using cache for', dbTreeName);
          } else {
            setLoadingMsg(`Refreshing "${dbTreeName}" from DB…`);
            console.log('[login] refreshing from DB:', dbTreeName);
            const { images } = importRes.data;
            const resources = (dbTree as import('../models/types').Tree & { resources: Array<{ id: string; filename: string }> }).resources ?? [];
            for (const [resourceId, b64] of Object.entries(images as Record<string, string>)) {
              const resource = resources.find((r) => r.id === resourceId);
              if (resource) await uploadImage(folderName, resourceId, resource.filename, b64ToBlob(b64 as string));
            }
            try { await createTree(folderName, dbTree); } catch (e) { console.warn('[login] createTree (cache refresh) error (ignored):', e); }
            treeToUse = dbTree;
          }
        } else {
          treeToUse = cached;
          console.log('[login] import failed, using cache fallback for', dbTreeName);
        }
      } else {
        setLoadingMsg(`Loading "${dbTreeName}"…`);
        const importRes = await safeFetch('/api/pg-import', { conn: testConn, treeName: dbTreeName });
        console.log('[login] fresh import ok:', importRes.ok, 'for', dbTreeName);
        if (!importRes.ok || !importRes.data?.tree) {
          console.warn('[login] skipping tree, import failed:', dbTreeName);
          continue;
        }
        const dbTree = importRes.data.tree as import('../models/types').Tree;
        const { images } = importRes.data;
        const resources = (dbTree as import('../models/types').Tree & { resources: Array<{ id: string; filename: string }> }).resources ?? [];
        for (const [resourceId, b64] of Object.entries(images as Record<string, string>)) {
          const resource = resources.find((r) => r.id === resourceId);
          if (resource) await uploadImage(folderName, resourceId, resource.filename, b64ToBlob(b64 as string));
        }
        try { await createTree(folderName, dbTree); } catch (e) { console.warn('[login] createTree (fresh) error (ignored):', e); }
        treeToUse = dbTree;
      }

      if (!treeToUse) continue;
      treeMetaList.push({ folderName, treeName: treeToUse.tree_name });

      if (!firstFolder || folderName === lastUsedFolder) {
        firstFolder = folderName;
        firstTree = treeToUse;
      }
    }

    console.log('[login] treeMetaList:', treeMetaList, 'firstFolder:', firstFolder);

    if (!firstFolder || !firstTree) {
      setError('Could not load any trees from the database. Contact your admin.');
      return false;
    }

    // ── 5. Register all trees in syncStore + treeStore ────────────────────
    // Set treeStore FIRST so activeTree is non-null before any sync state changes
    openTree(firstTree, firstFolder, 'synced');
    setTreeList(treeMetaList);
    // Then register sync state (this triggers re-renders but activeTree is already set)
    syncStore.setAllSyncedTrees(syncedTreesMap);
    syncStore.activate(firstFolder, syncConn, firstTree.tree_name);
    console.log('[login] autoConnectUser: done, openTree called for', firstFolder);

    // Persist last-used for next login
    try { localStorage.setItem(LAST_USER_TREE_KEY, firstFolder); } catch { /* ignore */ }

    return true;
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #E3F2FD 0%, #F3E5F5 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
        padding: '40px 44px', width: 380, maxWidth: '90vw',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48 }}>🌳</div>
          <h1 style={{ margin: '8px 0 4px', fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>FamTree</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#888' }}>Sign in to continue</p>
        </div>

        {/* Health status */}
        <div style={{
          background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8,
          padding: '10px 14px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
            Server Status
          </div>
          <StatusDot status={health.mongo} label="MongoDB"    detail={health.mongoError} />
          <StatusDot status={health.pg}    label="PostgreSQL" detail={health.pgError} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoFocus
              required
              disabled={loading}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
              Passphrase
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPhrase ? 'text' : 'password'}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder="Enter passphrase"
                required
                disabled={loading}
                style={{
                  width: '100%', padding: '10px 40px 10px 12px', borderRadius: 8,
                  border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPhrase((v) => !v)}
                tabIndex={-1}
                title={showPhrase ? 'Hide passphrase' : 'Show passphrase'}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 4, color: '#999', fontSize: 16, lineHeight: 1, userSelect: 'none',
                }}
              >
                {showPhrase ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: '#FFEBEE', border: '1px solid #FFCDD2', borderRadius: 8,
              padding: '10px 12px', fontSize: 13, color: '#c62828', wordBreak: 'break-word',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px', borderRadius: 8, border: 'none',
              background: loading ? '#90CAF9' : '#1565C0',
              color: '#fff', fontWeight: 700, fontSize: 15,
              cursor: loading ? 'default' : 'pointer', marginTop: 2,
              transition: 'background 0.2s',
            }}
          >
            {loading ? loadingMsg : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

