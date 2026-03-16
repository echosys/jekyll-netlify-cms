/**
 * lockStore.ts — Multi-user sync & lock state.
 *
 * Tree states:
 *   LOCAL           — dev only, no DB link, free edit + local save
 *   SYNCED_DEFAULT  — DB-linked, read-first on save (DB wins on conflict)
 *   SYNCED_LOCKED   — DB-linked, write-first on save (I hold the lock)
 *
 * Sync status pill values:
 *   1 = grey    — not synced (LOCAL mode)
 *   2 = blue    — reading from DB (pulse)
 *   3 = yellow  — synced default idle / changed
 *   4 = orange  — writing to DB (pulse)
 *   5 = green   — locked + synced idle
 */
import { create } from 'zustand';
import { LOCK_POLL_MS } from '../appConfig';
import type { UserDoc } from './authStore';

export type TreeState = 'LOCAL' | 'SYNCED_DEFAULT' | 'SYNCED_LOCKED';
/** @deprecated use TreeState */
export type SyncMode = 'read-only' | 'write';
export type SyncStatus = 1 | 2 | 3 | 4 | 5;

interface LockState {
  treeState: TreeState;
  lockHolder: string | null;
  onlineUsers: UserDoc[];
  forcedByMsg: string | null;
  syncStatus: SyncStatus;
  /** The updated_at of the tree as of our last successful DB read or write */
  lastKnownDbUpdatedAt: string;
  /** True while a pg-import or pg-export is in flight — blocks concurrent ops */
  syncInFlight: boolean;
  /** Countdown seconds displayed on the lock button (10→0, resets on each tick) */
  lockCountdown: number;

  // ── Internal timers ──────────────────────────────────────────────────────
  _pollTimer: ReturnType<typeof setInterval> | null;
  _heartbeatTimer: ReturnType<typeof setInterval> | null;
  _countdownTimer: ReturnType<typeof setInterval> | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  setSyncStatus: (s: SyncStatus) => void;
  setTreeState: (s: TreeState) => void;
  setLockHolder: (h: string | null) => void;
  setOnlineUsers: (u: UserDoc[]) => void;
  clearForcedMsg: () => void;
  setLastKnownDbUpdatedAt: (ts: string) => void;
  setSyncInFlight: (v: boolean) => void;
  resetLockCountdown: () => void;

  startPolling: (username: string, role: 'dev' | 'user') => void;
  stopPolling: () => void;

  acquireLock: (username: string, role: 'dev' | 'user') => Promise<{ ok: boolean; error?: string }>;
  releaseLock: (username: string) => Promise<void>;
  forceTakeLock: (username: string) => Promise<{ ok: boolean; error?: string }>;
  logout: (username: string) => Promise<void>;
  /** @deprecated kept for backward compat */
  setMode: (m: SyncMode) => void;
}

async function apiLock(body: Record<string, string | undefined>) {
  const res = await fetch('/api/mongo-lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  try { return await res.json(); } catch { return {}; }
}

export const useLockStore = create<LockState>()((set, get) => ({
  treeState: 'LOCAL',
  lockHolder: null,
  onlineUsers: [],
  forcedByMsg: null,
  syncStatus: 1,
  lastKnownDbUpdatedAt: '',
  syncInFlight: false,
  lockCountdown: 10,
  _pollTimer: null,
  _heartbeatTimer: null,
  _countdownTimer: null,

  setSyncStatus: (s) => set({ syncStatus: s }),
  setTreeState: (s) => set({ treeState: s }),
  setLockHolder: (h) => set({ lockHolder: h }),
  setOnlineUsers: (u) => set({ onlineUsers: u }),
  clearForcedMsg: () => set({ forcedByMsg: null }),
  setLastKnownDbUpdatedAt: (ts) => set({ lastKnownDbUpdatedAt: ts }),
  setSyncInFlight: (v) => set({ syncInFlight: v }),
  resetLockCountdown: () => set({ lockCountdown: 10 }),

  // ── Legacy compat ──────────────────────────────────────────────────────────
  setMode: (m: SyncMode) => set({ treeState: m === 'write' ? 'SYNCED_LOCKED' : 'SYNCED_DEFAULT' }),

  startPolling: (username, role) => {
    const existing = get();
    if (existing._pollTimer) clearInterval(existing._pollTimer);
    if (existing._heartbeatTimer) clearInterval(existing._heartbeatTimer);
    if (existing._countdownTimer) clearInterval(existing._countdownTimer);

    const poll = async () => {
      if (document.visibilityState === 'hidden') return;
      // Reset countdown immediately when poll fires — countdown = time until NEXT poll
      set({ lockCountdown: Math.round(LOCK_POLL_MS / 1000) });
      const data = await apiLock({ action: 'status', username, role });
      const { treeState, lockHolder } = get();

      set({
        lockHolder: data.holder ?? null,
        onlineUsers: data.onlineUsers ?? [],
      });

      // Lock was force-taken while we held it
      if (data.forcedByMsg && lockHolder === username && treeState === 'SYNCED_LOCKED') {
        set({ treeState: 'SYNCED_DEFAULT', forcedByMsg: data.forcedByMsg });
      }
      // Lock auto-expired (we were holder but DB says someone else or null)
      if (treeState === 'SYNCED_LOCKED' && data.holder !== username) {
        set({ treeState: 'SYNCED_DEFAULT' });
      }
    };

    const heartbeat = async () => {
      if (document.visibilityState === 'hidden') return;
      if (get().treeState !== 'SYNCED_LOCKED') return;
      const data = await apiLock({ action: 'heartbeat', username });
      if (data.forcedByMsg && get().treeState === 'SYNCED_LOCKED') {
        set({ treeState: 'SYNCED_DEFAULT', forcedByMsg: data.forcedByMsg });
      }
    };

    // Countdown tick — only runs while SYNCED_LOCKED
    const countdownTimer = setInterval(() => {
      if (get().treeState !== 'SYNCED_LOCKED') return;
      set((s) => ({ lockCountdown: s.lockCountdown > 0 ? s.lockCountdown - 1 : 0 }));
    }, 1_000);

    const pollTimer = setInterval(poll, LOCK_POLL_MS);
    const heartbeatTimer = setInterval(heartbeat, 60_000);
    set({ _pollTimer: pollTimer, _heartbeatTimer: heartbeatTimer, _countdownTimer: countdownTimer });
    poll();
  },

  stopPolling: () => {
    const { _pollTimer, _heartbeatTimer, _countdownTimer } = get();
    if (_pollTimer) clearInterval(_pollTimer);
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    if (_countdownTimer) clearInterval(_countdownTimer);
    set({ _pollTimer: null, _heartbeatTimer: null, _countdownTimer: null,
          treeState: 'LOCAL', lockHolder: null, onlineUsers: [] });
  },

  acquireLock: async (username, role) => {
    const data = await apiLock({ action: 'acquire', username, role });
    if (data.ok) {
      set({ treeState: 'SYNCED_LOCKED', lockHolder: username, lockCountdown: 10 });
      return { ok: true };
    }
    // Server returns holderActiveRecently=true when holder's lastActivityAt < 2 min
    if (data.holderActiveRecently) {
      return { ok: false, error: `banner:${data.holder ?? 'someone'}` };
    }
    return { ok: false, error: data.error ?? 'Could not acquire lock.' };
  },

  releaseLock: async (username) => {
    await apiLock({ action: 'release', username });
    set({ treeState: 'SYNCED_DEFAULT', lockHolder: null });
  },

  forceTakeLock: async (username) => {
    const data = await apiLock({ action: 'force-take', username, role: 'dev' });
    if (data.ok) {
      set({ treeState: 'SYNCED_LOCKED', lockHolder: username, lockCountdown: 10 });
      return { ok: true };
    }
    return { ok: false, error: data.error ?? 'Force-take failed.' };
  },

  logout: async (username) => {
    await apiLock({ action: 'logout', username });
    get().stopPolling();
    set({ treeState: 'LOCAL', lockHolder: null, onlineUsers: [], syncStatus: 1 });
  },
}));
