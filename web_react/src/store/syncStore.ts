/**
 * syncStore.ts — Zustand store for PostgreSQL live-sync state.
 *
 * Global conn  → the active DB connection (from VITE_PG_CONN for user role,
 *                manually entered in DBDialog for dev role).
 * syncedTrees  → map of folderName → treeName for trees linked to the DB.
 *                User role: all DB trees are here. Dev role: manually linked ones.
 * activeSync   → which tree is currently being synced (folderName).
 *
 * Persisted to localStorage so state survives page refresh.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SyncConn {
  host: string;
  port: string;
  dbname: string;
  user: string;
  credphrase: string;
  sslMode: 'auto' | 'require' | 'disable';
  schema: string;
  table: string;
  connectionString?: string;
}

/** Per-tree sync link */
export interface TreeSyncLink {
  /** The DB tree name (as stored in postgres) */
  dbTreeName: string;
  /** Connection used for this tree */
  conn: SyncConn;
}

export type ConnStatus = 'unknown' | 'ok' | 'error';

interface SyncState {
  /** Active DB connection params (shared for all synced trees in this session) */
  conn: SyncConn | null;
  connStatus: ConnStatus;
  connected: boolean;

  /** Map of folderName → TreeSyncLink for all trees linked to DB */
  syncedTrees: Record<string, TreeSyncLink>;

  /** The folder currently being actively synced (drives the poll interval) */
  activeSyncFolder: string;
  /** Convenience: dbTreeName of the active sync folder */
  syncTreeName: string;

  /** Whether the sync interval is running */
  active: boolean;
  lastSyncAt: number;
  syncing: boolean;

  // ── Actions ───────────────────────────────────────────────────────────────
  /** Set a global connection (does not start sync) */
  connect: (conn: SyncConn) => void;
  disconnect: () => void;
  setConnStatus: (s: ConnStatus) => void;

  /** Register a tree as synced (adds to syncedTrees map) */
  linkTree: (folderName: string, link: TreeSyncLink) => void;
  /** Unlink a tree from DB sync */
  unlinkTree: (folderName: string) => void;
  /** Replace the full syncedTrees map (used on user login to load all DB trees) */
  setAllSyncedTrees: (map: Record<string, TreeSyncLink>) => void;

  /** Start the active sync interval for a specific tree */
  activate: (folderName: string, conn: SyncConn, dbTreeName: string) => void;
  deactivate: () => void;

  setSyncing: (v: boolean) => void;
  markSynced: () => void;

  /** Legacy compat: used by DBDialog which sets a single tree */
  activateLegacy: (conn: SyncConn, treeName: string) => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set, get) => ({
      conn: null,
      connStatus: 'unknown',
      connected: false,
      syncedTrees: {},
      activeSyncFolder: '',
      syncTreeName: '',
      active: false,
      lastSyncAt: 0,
      syncing: false,

      connect: (conn) => set({ connected: true, conn, connStatus: 'ok' }),

      disconnect: () => set({
        connected: false,
        active: false,
        syncing: false,
        connStatus: 'unknown',
        // don't wipe syncedTrees — user role re-uses them on reconnect
      }),

      setConnStatus: (connStatus) => set({ connStatus }),

      linkTree: (folderName, link) =>
        set((s) => ({ syncedTrees: { ...s.syncedTrees, [folderName]: link } })),

      unlinkTree: (folderName) =>
        set((s) => {
          const next = { ...s.syncedTrees };
          delete next[folderName];
          const wasActive = s.activeSyncFolder === folderName;
          return {
            syncedTrees: next,
            ...(wasActive ? { active: false, activeSyncFolder: '', syncTreeName: '' } : {}),
          };
        }),

      setAllSyncedTrees: (map) => set({ syncedTrees: map }),

      activate: (folderName, conn, dbTreeName) =>
        set({
          active: true,
          connected: true,
          conn,
          connStatus: 'ok',
          activeSyncFolder: folderName,
          syncTreeName: dbTreeName,
          lastSyncAt: 0,
          syncedTrees: {
            ...get().syncedTrees,
            [folderName]: { dbTreeName, conn },
          },
        }),

      deactivate: () => set({ active: false, syncing: false, activeSyncFolder: '', syncTreeName: '' }),

      setSyncing: (syncing) => set({ syncing }),

      markSynced: () => set({ lastSyncAt: Date.now(), syncing: false }),

      /** Legacy: used by DBDialog — maps to activate on the active local folder */
      activateLegacy: (conn, treeName) => {
        // folderName derived from treeName via slugify is handled by caller
        set({
          active: true,
          connected: true,
          conn,
          connStatus: 'ok',
          syncTreeName: treeName,
          lastSyncAt: 0,
        });
      },
    }),
    {
      name: 'famt_sync_state',
      partialize: (s) => ({
        active: s.active,
        connected: s.connected,
        conn: s.conn,
        syncTreeName: s.syncTreeName,
        activeSyncFolder: s.activeSyncFolder,
        syncedTrees: s.syncedTrees,
      }),
    },
  ),
);
