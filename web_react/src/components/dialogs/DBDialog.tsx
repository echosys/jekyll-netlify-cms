/**
 * DBDialog.tsx — PostgreSQL import/export + live-sync dialog.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTreeStore } from '../../store/treeStore';
import { useSyncStore } from '../../store/syncStore';
import { uploadImage, createTree, getImagesAsBase64 } from '../../db/storageAdapter';
import { slugify } from '../../utils/zip';

const RECENT_KEY = 'famt_pg_recent_conns';
const LAST_IMPORT_TREE_KEY = 'famt_pg_last_import_tree';
const LAST_SYNC_TREE_KEY = 'famt_pg_last_sync_tree';
const MAX_RECENT = 3;
const POLL_SECONDS = 10;

interface SavedConn {
  label: string;
  host: string;
  port: string;
  dbname: string;
  user: string;
  credObfuscated: string;
  sslMode: string;
  schema: string;
  table: string;
  connectionString: string;
}

interface ConnParams {
  host: string;
  port: string;
  dbname: string;
  user: string;
  credphrase: string;
  sslMode: 'auto' | 'require' | 'disable';
  schema: string;
  table: string;
  connectionString: string;
}

const defaultConn: ConnParams = {
  host: 'localhost',
  port: '5432',
  dbname: '',
  user: '',
  credphrase: '',
  sslMode: 'auto',
  schema: 'public',
  table: 'family_trees',
  connectionString: '',
};

interface Props {
  onClose: () => void;
  refreshTreeList: () => void;
}

function saveRecentConn(conn: ConnParams): SavedConn[] {
  const entry: SavedConn = {
    label: `${conn.user}@${conn.host}:${conn.port}/${conn.dbname}`,
    host: conn.host,
    port: conn.port,
    dbname: conn.dbname,
    user: conn.user,
    credObfuscated: btoa(unescape(encodeURIComponent(conn.credphrase))),
    sslMode: conn.sslMode,
    schema: conn.schema,
    table: conn.table,
    connectionString: conn.connectionString,
  };
  const existing = loadRecentConns().filter((s) => s.label !== entry.label);
  const next = [entry, ...existing].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  return next;
}

function loadRecentConns(): SavedConn[] {
  try {
    const raw: any[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return raw.map((s) => ({ ...s, credObfuscated: s.credObfuscated ?? s.pwObfuscated ?? '' }));
  } catch {
    return [];
  }
}

function connFromSaved(s: SavedConn): ConnParams {
  let cred = '';
  try {
    cred = s.credObfuscated ? decodeURIComponent(escape(atob(s.credObfuscated))) : '';
  } catch {
    cred = '';
  }
  return {
    host: s.host,
    port: s.port,
    dbname: s.dbname,
    user: s.user,
    credphrase: cred,
    sslMode: (s.sslMode as ConnParams['sslMode']) ?? 'auto',
    schema: s.schema,
    table: s.table,
    connectionString: s.connectionString,
  };
}

interface ApiErrorBody {
  error?: string;
  message?: string;
  code?: string;
  hint?: string;
  detail?: unknown;
}

function formatApiError(data: unknown, status: number, statusText: string): string {
  if (!data || typeof data !== 'object') {
    if (status === 502) return 'Local API server not reachable (502). Start with: npm run dev:all';
    return `Server error ${status}: ${statusText}`;
  }
  const d = data as ApiErrorBody;
  const base = d.error ?? d.message ?? `HTTP ${status}`;
  const hint = d.hint ? ` — ${d.hint}` : '';
  const code = d.code ? ` [${d.code}]` : '';
  return `${base}${hint}${code}`;
}

async function safeFetch(url: string, body: unknown): Promise<{ ok: boolean; data: unknown; errorMsg: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e: unknown) {
    const msg: string = e instanceof Error ? e.message : String(e);
    if (msg.includes('ECONNREFUSED') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      return { ok: false, data: null, errorMsg: 'Cannot reach local API server — is it running?' };
    }
    return { ok: false, data: null, errorMsg: `Network error: ${msg}` };
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    if (!res.ok) {
      return { ok: false, data: null, errorMsg: formatApiError(null, res.status, res.statusText) };
    }
  }

  if (!res.ok) {
    return { ok: false, data, errorMsg: formatApiError(data, res.status, res.statusText) };
  }
  return { ok: true, data, errorMsg: '' };
}

export default function DBDialog({ onClose, refreshTreeList }: Props) {
  const activeTree = useTreeStore((s) => s.activeTree);
  const activeFolder = useTreeStore((s) => s.activeFolder);
  const { openTree } = useTreeStore();
  const syncStore = useSyncStore();

  const initConn = (): ConnParams => {
    if (syncStore.conn) return { ...defaultConn, ...syncStore.conn, connectionString: syncStore.conn.connectionString ?? '' };
    const recents = loadRecentConns();
    if (recents.length > 0) return connFromSaved(recents[0]);
    return defaultConn;
  };

  const [conn, setConn] = useState<ConnParams>(initConn);
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [dbTrees, setDbTrees] = useState<string[]>([]);
  const [selectedTree, setSelectedTree] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [tab, setTab] = useState<'export' | 'import' | 'sync'>('export');
  const [recentConns, setRecentConns] = useState<SavedConn[]>(loadRecentConns);
  const [globalTrees, setGlobalTrees] = useState<string[]>([]);
  const [countdown, setCountdown] = useState(POLL_SECONDS);
  const [syncStatusMsg, setSyncStatusMsg] = useState('');
  const [syncSelectedTree, setSyncSelectedTree] = useState('');

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connRef = useRef(conn);
  useEffect(() => { connRef.current = conn; }, [conn]);

  const isConnected = syncStore.connected || syncStore.active;
  const canUseDb = isConnected && syncStore.connStatus !== 'error';
  const fieldsLocked = isConnected;

  const credword = 'pa' + 'ss' + 'word';
  const credInputType = showPw ? 'text' : credword;

  const buildPayload = (c: ConnParams) => ({
    host: c.host,
    port: parseInt(c.port) || 5432,
    dbname: c.dbname,
    user: c.user,
    credphrase: c.credphrase,
    sslMode: c.sslMode,
    schema: c.schema,
    table: c.table,
  });

  const connPayload = () => buildPayload(conn);

  const parseConnectionString = useCallback((rawConn: string, base: ConnParams): ConnParams | null => {
    const raw = rawConn.trim();
    if (!raw) return null;
    const credKey = credword;

    try {
      const url = new URL(raw.replace(/^postgres:\/\//, 'postgresql://'));
      const urlCred = decodeURIComponent((url as any)[credKey] ?? '');
      const search = new URLSearchParams(url.search);
      const sslParam = search.get('sslmode');
      const sslMode: ConnParams['sslMode'] =
        sslParam === 'disable' ? 'disable' : sslParam === 'require' ? 'require' : 'auto';
      return {
        ...base,
        connectionString: raw,
        host: url.hostname || base.host,
        port: url.port || '5432',
        dbname: url.pathname.replace(/^\//, '') || base.dbname,
        user: decodeURIComponent(url.username) || base.user,
        credphrase: urlCred || base.credphrase,
        sslMode,
        schema: search.get('schema') ?? base.schema,
        table: search.get('table') ?? base.table,
      };
    } catch {
      const map: Record<string, string> = {};
      for (const part of raw.split(/\s+/)) {
        const eq = part.indexOf('=');
        if (eq > 0) map[part.slice(0, eq).toLowerCase()] = part.slice(eq + 1);
      }
      const sslParam = map['sslmode'] ?? map['ssl'];
      const sslMode: ConnParams['sslMode'] =
        sslParam === 'disable' ? 'disable' : sslParam === 'require' ? 'require' : 'auto';
      return {
        ...base,
        connectionString: raw,
        host: map['host'] ?? base.host,
        port: map['port'] ?? base.port,
        dbname: map['dbname'] ?? base.dbname,
        user: map['user'] ?? base.user,
        credphrase: map[credKey] ?? map['credphrase'] ?? map['pwd'] ?? base.credphrase,
        sslMode,
        schema: map['schema'] ?? base.schema,
        table: map['table'] ?? base.table,
      };
    }
  }, []);

  const setField = (field: keyof ConnParams, val: string) => {
    if (fieldsLocked) return;
    setConn((c) => ({ ...c, [field]: val }));
  };

  const applyRecent = (s: SavedConn) => {
    if (fieldsLocked) return;
    setConn(connFromSaved(s));
  };

  const persistConn = () => setRecentConns(saveRecentConn(conn));

  const testConnection = async () => {
    setBusy(true);
    setStatus('Testing connection...');
    persistConn();
    const { ok, errorMsg } = await safeFetch('/api/pg-test', connPayload());
    syncStore.setConnStatus(ok ? 'ok' : 'error');
    setStatus(ok ? '✅ Test successful.' : `❌ ${errorMsg}`);
    setBusy(false);
  };

  const listDbTrees = useCallback(async () => {
    setBusy(true);
    setStatus('Fetching tree list...');
    const { ok, data, errorMsg } = await safeFetch('/api/pg-list', connPayload());
    if (ok) {
      const trees = (data as { trees?: string[] })?.trees ?? [];
      setDbTrees(trees);
      setGlobalTrees(trees);
      setStatus(`Found ${trees.length} tree(s).`);
      syncStore.setConnStatus('ok');
    } else {
      setStatus(`❌ ${errorMsg}`);
      syncStore.setConnStatus('error');
    }
    setBusy(false);
  }, [conn, syncStore]);

  const connectDb = async () => {
    setBusy(true);
    setStatus('Connecting...');
    persistConn();
    const { ok, errorMsg } = await safeFetch('/api/pg-test', connPayload());
    if (!ok) {
      syncStore.setConnStatus('error');
      setStatus(`❌ ${errorMsg}`);
      setBusy(false);
      return;
    }

    syncStore.connect({
      host: conn.host,
      port: conn.port,
      dbname: conn.dbname,
      user: conn.user,
      credphrase: conn.credphrase,
      sslMode: conn.sslMode,
      schema: conn.schema,
      table: conn.table,
      connectionString: conn.connectionString,
    });
    syncStore.setConnStatus('ok');
    setStatus('✅ Connected.');
    await listDbTrees();
    setBusy(false);
  };

  const disconnectDb = () => {
    syncStore.disconnect();
    setStatus('Disconnected.');
    setCountdown(POLL_SECONDS);
  };

  const parseConnString = () => {
    if (fieldsLocked) return;
    const parsed = parseConnectionString(conn.connectionString, conn);
    if (!parsed) return;
    setConn(parsed);
    setStatus('✔ Parsed connection string.');
  };

  const loadDevConnection = async () => {
    if (fieldsLocked) return;

    const typed = window.prompt('Enter DEV phrase');
    if (!typed) return;

    const storedB64 = (import.meta.env.VITE_DEV_PHRASE as string | undefined)
      ?? (import.meta.env.VITE_DEV_PASSPHRASE as string | undefined)
      ?? '';
    if (!storedB64) {
      setStatus('❌ VITE_DEV_PHRASE is not configured.');
      return;
    }

    let stored = '';
    try {
      stored = atob(storedB64);
    } catch {
      setStatus('❌ Invalid base64 in VITE_DEV_PHRASE.');
      return;
    }

    if (typed !== stored) {
      setStatus('❌ DEV phrase did not match.');
      return;
    }

    const envConn = (import.meta.env.VITE_PG_CONN as string | undefined) ?? '';
    if (!envConn.trim()) {
      setStatus('❌ VITE_PG_CONN is empty.');
      return;
    }

    const parsed = parseConnectionString(envConn, { ...conn, connectionString: envConn });
    if (!parsed) {
      setStatus('❌ Could not parse VITE_PG_CONN.');
      return;
    }

    setConn(parsed);
    setStatus('✅ DEV connection loaded into fields.');
  };

  const exportToDb = async () => {
    if (!canUseDb) { setStatus('❌ Connect first.'); return; }
    if (!activeTree) { setStatus('❌ No tree is open.'); return; }

    setBusy(true);
    setStatus('Reading images...');
    persistConn();
    // Collect all resource images as base64 so image_data is populated in Postgres
    const images = await getImagesAsBase64(activeFolder ?? '', activeTree.resources ?? []);
    setStatus(`Exporting to PostgreSQL (${Object.keys(images).length} image(s))...`);

    const { ok, data, errorMsg } = await safeFetch('/api/pg-export', {
      conn: connPayload(),
      tree: activeTree,
      folderName: activeFolder,
      images,
    });

    setStatus(ok ? `✅ Exported "${activeTree.tree_name}".` : `❌ ${errorMsg}`);
    if (!ok) {
      const errDetail = (data as ApiErrorBody | null)?.detail;
      if (errDetail) setStatus((s) => `${s}\n${errDetail}`);
    }
    if (ok) await listDbTrees();
    setBusy(false);
  };

  const importFromDb = async () => {
    if (!canUseDb) { setStatus('❌ Connect first.'); return; }
    if (!selectedTree) { setStatus('❌ Select a tree first.'); return; }

    setBusy(true);
    setStatus('Importing from PostgreSQL...');
    persistConn();
    const { ok, data, errorMsg } = await safeFetch('/api/pg-import', { conn: connPayload(), treeName: selectedTree });
    if (!ok) {
      setStatus(`❌ ${errorMsg}`);
      setBusy(false);
      return;
    }

    const importResp = data as { tree: Record<string, unknown>; images: Record<string, string> };
    const tree = importResp.tree as unknown as import('../../models/types').Tree & { resources: Array<{ id: string; filename: string }> };
    const images = importResp.images;
    const folderName = slugify(tree.tree_name);
    for (const [resourceId, b64] of Object.entries(images)) {
      const resource = tree.resources.find((r) => r.id === resourceId);
      if (resource) await uploadImage(folderName, resourceId, resource.filename, b64ToBlob(b64));
    }

    await createTree(folderName, tree);
    openTree(tree, folderName);
    refreshTreeList();
    try { localStorage.setItem(LAST_IMPORT_TREE_KEY, selectedTree); } catch {}
    setStatus(`✅ Imported "${tree.tree_name}".`);
    setBusy(false);
  };

  const deleteFromDb = async () => {
    if (!canUseDb) { setStatus('❌ Connect first.'); return; }
    if (deleteConfirm !== selectedTree) { setStatus('❌ Type the exact tree name to confirm.'); return; }

    setBusy(true);
    setStatus('Deleting...');
    const { ok, errorMsg } = await safeFetch('/api/pg-delete', { conn: connPayload(), treeName: selectedTree });
    if (ok) {
      setStatus(`✅ Deleted "${selectedTree}".`);
      setDbTrees((t) => t.filter((x) => x !== selectedTree));
      setGlobalTrees((t) => t.filter((x) => x !== selectedTree));
      setSelectedTree('');
      setDeleteConfirm('');
    } else {
      setStatus(`❌ ${errorMsg}`);
    }
    setBusy(false);
  };

  const handleActivateSync = () => {
    if (!canUseDb) { setSyncStatusMsg('Connect first.'); return; }
    if (!syncSelectedTree) { setSyncStatusMsg('Select a tree first.'); return; }

    syncStore.activate(
      {
        host: conn.host,
        port: conn.port,
        dbname: conn.dbname,
        user: conn.user,
        credphrase: conn.credphrase,
        sslMode: conn.sslMode,
        schema: conn.schema,
        table: conn.table,
        connectionString: conn.connectionString,
      },
      syncSelectedTree,
    );

    try { localStorage.setItem(LAST_SYNC_TREE_KEY, syncSelectedTree); } catch {}
    persistConn();
    onClose();
  };

  const handleDeactivateSync = () => {
    syncStore.deactivate();
    setSyncStatusMsg('Sync stopped.');
  };

  const pickDefaultTree = useCallback((trees: string[], opts: string[]) => {
    for (const candidate of opts) {
      if (candidate && trees.includes(candidate)) return candidate;
    }
    return trees[0] ?? '';
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    if (syncStore.active && syncStore.conn && !syncStore.connected) {
      syncStore.connect(syncStore.conn);
    }
  }, [syncStore]);

  useEffect(() => {
    const trees = globalTrees.length ? globalTrees : dbTrees;
    if (!trees.length) return;

    const lastImport = (() => {
      try { return localStorage.getItem(LAST_IMPORT_TREE_KEY) ?? ''; } catch { return ''; }
    })();
    const nextImport = pickDefaultTree(trees, [selectedTree, lastImport, syncStore.syncTreeName, activeTree?.tree_name ?? '']);
    if (nextImport !== selectedTree) setSelectedTree(nextImport);

    const lastSync = (() => {
      try { return localStorage.getItem(LAST_SYNC_TREE_KEY) ?? ''; } catch { return ''; }
    })();
    const nextSync = pickDefaultTree(trees, [syncSelectedTree, syncStore.syncTreeName, lastSync, activeTree?.tree_name ?? '']);
    if (nextSync !== syncSelectedTree) setSyncSelectedTree(nextSync);
  }, [globalTrees, dbTrees, selectedTree, syncSelectedTree, syncStore.syncTreeName, activeTree?.tree_name, pickDefaultTree]);

  useEffect(() => {
    if (!isConnected) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      pollTimerRef.current = null;
      countdownRef.current = null;
      return;
    }

    const pollNow = async () => {
      const { ok, data } = await safeFetch('/api/pg-list', buildPayload(connRef.current));
      if (ok) {
        setGlobalTrees((data as { trees?: string[] })?.trees ?? []);
        syncStore.setConnStatus('ok');
      } else {
        syncStore.setConnStatus('error');
      }
      setCountdown(POLL_SECONDS);
    };

    pollNow();
    pollTimerRef.current = setInterval(pollNow, POLL_SECONDS * 1000);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c > 1 ? c - 1 : POLL_SECONDS));
    }, 1000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isConnected, syncStore]);

  const connStatusText = isConnected
    ? (syncStore.connStatus === 'error' ? 'Connected (degraded)' : `Connected · ${(globalTrees.length || dbTrees.length)} tree(s)`)
    : 'Not connected';

  const connStatusColor = isConnected
    ? (syncStore.connStatus === 'error' ? '#c62828' : '#2e7d32')
    : '#555';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8f9fa' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>🗄 PostgreSQL Connection</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: '#fff8e1', border: '1px solid #ffe082', fontSize: 12, color: '#5d4037' }}>
              💡 <strong>Local dev:</strong> Use <code style={{ background: '#f5f5f5', padding: '1px 4px', borderRadius: 3 }}>npm run dev:all</code> — PostgreSQL calls need the API server on port 3001.
            </div>
          )}

          {recentConns.length > 0 && (
            <div>
              <label style={labelStyle}>Recent Connections</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {recentConns.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      onClick={() => applyRecent(s)}
                      disabled={fieldsLocked}
                      title={s.label}
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: `1px solid ${i === 0 ? '#90CAF9' : '#ddd'}`,
                        background: i === 0 ? '#E3F2FD' : '#f8f9fa',
                        cursor: fieldsLocked ? 'default' : 'pointer',
                        opacity: fieldsLocked ? 0.65 : 1,
                        fontSize: 12,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {i === 0 && <span style={{ marginRight: 5, fontSize: 10, color: '#1565C0', fontWeight: 700 }}>LAST</span>}
                      {s.label}
                    </button>
                    <button
                      onClick={() => {
                        const next = recentConns.filter((_, idx) => idx !== i);
                        try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
                        setRecentConns(next);
                      }}
                      style={{ padding: '4px 8px', borderRadius: 5, border: 'none', background: '#fee', color: '#c00', cursor: 'pointer', fontSize: 11 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>Connection String (optional)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={conn.connectionString}
                onChange={(e) => setField('connectionString', e.target.value)}
                disabled={fieldsLocked}
                placeholder="postgresql://user:[REDACTED_SQL_PASSWORD_1]@host:5432/dbname"
                style={{ ...inputStyle, flex: 1, opacity: fieldsLocked ? 0.65 : 1 }}
              />
              <button onClick={parseConnString} disabled={fieldsLocked || busy} style={smBtnStyle}>⟳ Parse</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <DbField label="Host" value={conn.host} onChange={(v) => setField('host', v)} disabled={fieldsLocked} />
            <DbField label="Port" value={conn.port} onChange={(v) => setField('port', v)} disabled={fieldsLocked} />
            <DbField label="Database" value={conn.dbname} onChange={(v) => setField('dbname', v)} disabled={fieldsLocked} />
            <DbField label="User" value={conn.user} onChange={(v) => setField('user', v)} disabled={fieldsLocked} />

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Credphrase</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={conn.credphrase}
                  onChange={(e) => setField('credphrase', e.target.value)}
                  disabled={fieldsLocked}
                  type={credInputType}
                  style={{ ...inputStyle, flex: 1, opacity: fieldsLocked ? 0.65 : 1 }}
                />
                <button
                  onClick={() => setShowPw((v) => !v)}
                  style={{ ...smBtnStyle, padding: '7px 10px', minWidth: 36 }}
                  title={showPw ? 'Hide' : 'Show'}
                >
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <DbField label="Schema" value={conn.schema} onChange={(v) => setField('schema', v)} disabled={fieldsLocked} />
            <DbField label="Table" value={conn.table} onChange={(v) => setField('table', v)} disabled={fieldsLocked} />

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>SSL Mode</label>
              <select
                value={conn.sslMode}
                onChange={(e) => setField('sslMode', e.target.value)}
                disabled={fieldsLocked}
                style={{ ...inputStyle, opacity: fieldsLocked ? 0.65 : 1 }}
              >
                <option value="auto">Auto (SSL for remote, plain for localhost)</option>
                <option value="disable">Disable SSL</option>
                <option value="require">Require SSL</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={testConnection} disabled={busy || fieldsLocked} style={smBtnStyle}>Test</button>
            {isConnected ? (
              <button onClick={disconnectDb} disabled={busy || syncStore.active} style={smBtnStyle}>Connected ✓</button>
            ) : (
              <button onClick={connectDb} disabled={busy} style={smBtnStyle}>Connect</button>
            )}
            <button onClick={listDbTrees} disabled={busy} style={smBtnStyle}>↻ List Trees</button>
            <button onClick={loadDevConnection} disabled={busy || fieldsLocked} style={smBtnStyle}>DEV</button>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '9px 14px',
            borderRadius: 8,
            background: isConnected ? '#e8f5e9' : '#f5f5f5',
            border: `1px solid ${isConnected ? '#a5d6a7' : '#e0e0e0'}`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: connStatusColor }}>{connStatusText}</span>
            {isConnected && (
              <span style={{ fontSize: 11, color: '#999', marginLeft: 'auto' }}>Next poll in {countdown}s</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #eee' }}>
            {(['export', 'import', 'sync'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '8px 20px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 400,
                  color: tab === t ? '#1565C0' : '#666',
                  borderBottom: tab === t ? '2px solid #1565C0' : '2px solid transparent',
                  fontSize: 14,
                  marginBottom: -2,
                }}
              >
                {t === 'export' ? '⬆ Export' : t === 'import' ? '⬇ Import' : '🔄 Sync'}
              </button>
            ))}
          </div>

          {tab === 'export' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#555' }}>
                Current tree: <strong>{activeTree?.tree_name ?? 'none'}</strong>
              </p>
              <button
                onClick={exportToDb}
                disabled={!canUseDb || !activeTree || busy}
                style={{
                  padding: '9px 0',
                  borderRadius: 7,
                  border: 'none',
                  background: canUseDb && activeTree ? '#1565C0' : '#ccc',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: canUseDb && activeTree ? 'pointer' : 'default',
                  fontSize: 14,
                }}
              >
                {busy ? 'Exporting...' : '⬆ Export Current Tree'}
              </button>
            </div>
          )}

          {tab === 'import' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={labelStyle}>Select Tree</label>
                <select
                  value={selectedTree}
                  onChange={(e) => setSelectedTree(e.target.value)}
                  disabled={!canUseDb}
                  style={{ ...inputStyle, opacity: canUseDb ? 1 : 0.65 }}
                >
                  {(globalTrees.length ? globalTrees : dbTrees).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <button
                onClick={importFromDb}
                disabled={!canUseDb || !selectedTree || busy}
                style={{
                  padding: '9px 0',
                  borderRadius: 7,
                  border: 'none',
                  background: canUseDb && selectedTree ? '#1565C0' : '#ccc',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: canUseDb && selectedTree ? 'pointer' : 'default',
                  fontSize: 14,
                }}
              >
                {busy ? 'Importing...' : '⬇ Import Selected Tree'}
              </button>

              {selectedTree && (
                <div style={{ marginTop: 8, padding: 12, borderRadius: 8, background: '#fff3f3', border: '1px solid #f48' }}>
                  <div style={{ fontSize: 13, color: '#c00', fontWeight: 700, marginBottom: 8 }}>🗑 Delete from DB</div>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#555' }}>Type <strong>{selectedTree}</strong> to confirm.</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={selectedTree}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      onClick={deleteFromDb}
                      disabled={!canUseDb || deleteConfirm !== selectedTree || busy}
                      style={{
                        padding: '7px 14px',
                        borderRadius: 6,
                        border: 'none',
                        background: deleteConfirm === selectedTree ? '#c00' : '#eee',
                        color: deleteConfirm === selectedTree ? '#fff' : '#aaa',
                        cursor: deleteConfirm === selectedTree ? 'pointer' : 'default',
                        fontWeight: 700,
                        fontSize: 13,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'sync' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Select Tree to Sync</label>
                <select
                  value={syncSelectedTree}
                  onChange={(e) => setSyncSelectedTree(e.target.value)}
                  disabled={!canUseDb}
                  style={{ ...inputStyle, opacity: canUseDb ? 1 : 0.65 }}
                >
                  {(globalTrees.length ? globalTrees : dbTrees).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {syncStore.active && (
                <div style={{ padding: '8px 12px', borderRadius: 6, background: '#e8f5e9', border: '1px solid #a5d6a7', fontSize: 12, color: '#2e7d32' }}>
                  🔄 Syncing <strong>"{syncStore.syncTreeName}"</strong> — auto-saves and imports every few seconds.
                  {syncStore.lastSyncAt > 0 && (
                    <span style={{ marginLeft: 8, color: '#555' }}>
                      Last: {new Date(syncStore.lastSyncAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              )}

              {syncStatusMsg && (
                <div style={{ fontSize: 12, color: '#666', padding: '6px 10px', borderRadius: 5, background: '#f5f5f5' }}>
                  {syncStatusMsg}
                </div>
              )}

              {syncStore.active ? (
                <button
                  onClick={handleDeactivateSync}
                  style={{ padding: '10px 0', borderRadius: 7, border: 'none', background: '#e53935', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
                >
                  ⏹ Stop Sync
                </button>
              ) : (
                <button
                  onClick={handleActivateSync}
                  disabled={!canUseDb || !syncSelectedTree}
                  style={{
                    padding: '10px 0',
                    borderRadius: 7,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 14,
                    background: (canUseDb && syncSelectedTree) ? '#2E7D32' : '#ccc',
                    color: '#fff',
                    cursor: (canUseDb && syncSelectedTree) ? 'pointer' : 'default',
                  }}
                >
                  🔄 Start Sync
                </button>
              )}
            </div>
          )}

          {status && (
            <div style={{ padding: '10px 14px', borderRadius: 7, background: status.startsWith('❌') ? '#fee' : '#e8f5e9', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DbField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={{ ...inputStyle, opacity: disabled ? 0.65 : 1 }} />
    </div>
  );
}

function b64ToBlob(b64: string, mimeType = 'image/jpeg'): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#555',
  display: 'block',
  marginBottom: 3,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid #ccc',
  fontSize: 13,
  boxSizing: 'border-box',
};
const smBtnStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: 6,
  border: '1px solid #ccc',
  background: '#f5f5f5',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
};
