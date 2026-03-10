/**
 * syncStore.ts — Zustand store for PostgreSQL live-sync state.
 * Persisted to localStorage so sync can auto-resume after page refresh.
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

export type ConnStatus = 'unknown' | 'ok' | 'error';

interface SyncState {
  /** Whether the user has explicitly clicked "Connect" and succeeded */
  connected: boolean;
  /** Whether live-sync was active (persisted — used for auto-resume on reload) */
  active: boolean;
  syncTreeName: string;
  connStatus: ConnStatus;
  conn: SyncConn | null;
  lastSyncAt: number;
  syncing: boolean;

  connect: (conn: SyncConn) => void;
  disconnect: () => void;
  activate: (conn: SyncConn, treeName: string) => void;
  deactivate: () => void;
  setConnStatus: (s: ConnStatus) => void;
  setSyncing: (v: boolean) => void;
  markSynced: () => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      connected: false,
      active: false,
      syncTreeName: '',
      connStatus: 'unknown',
      conn: null,
      lastSyncAt: 0,
      syncing: false,

      connect: (conn) =>
        set({ connected: true, conn, connStatus: 'ok' }),

      disconnect: () =>
        set({ connected: false, active: false, syncing: false, connStatus: 'unknown' }),

      activate: (conn, treeName) =>
        set({ active: true, connected: true, conn, syncTreeName: treeName, connStatus: 'ok', lastSyncAt: 0 }),

      deactivate: () =>
        set({ active: false, syncing: false }),

      setConnStatus: (connStatus) => set({ connStatus }),

      setSyncing: (syncing) => set({ syncing }),

      markSynced: () => set({ lastSyncAt: Date.now(), syncing: false }),
    }),
    {
      name: 'famt_sync_state',
      // Only persist what's needed to resume; transient flags reset on load
      partialize: (s) => ({
        active: s.active,
        connected: s.connected,
        conn: s.conn,
        syncTreeName: s.syncTreeName,
      }),
    },
  ),
);
