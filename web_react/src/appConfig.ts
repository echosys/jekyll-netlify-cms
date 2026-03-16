/**
 * appConfig.ts — Build-time application configuration.
 *
 * Set VITE_STORAGE_MODE in .env.local for local development.
 * Vercel deployments never set this → defaults to 'indexeddb'.
 *
 * Valid values:
 *   local-fs       → Filesystem mode. Run with: npm run dev:all
 *                    Reads/writes FamilyTrees_react/ on disk via fs-server.
 *   local-indexdb  → IndexedDB mode. Run with: npm run dev (no fs-server needed)
 *   (unset)        → IndexedDB mode. Used in Vercel production.
 */

const raw = import.meta.env.VITE_STORAGE_MODE as string | undefined;

export type StorageMode = 'filesystem' | 'indexeddb';

/**
 * The active storage mode — fixed at build/dev-start time.
 * Never changes at runtime, so no Zustand state is needed.
 */
export const STORAGE_MODE: StorageMode =
  raw === 'local-fs' ? 'filesystem' : 'indexeddb';

// ── Multi-user sync & lock timing ──────────────────────────────────────────
/** How often to poll lock status and send heartbeat (ms) */
export const LOCK_POLL_MS = 5_000;
/** How often read-only users pull from DB (ms) */
export const READ_ONLY_POLL_MS = 5_000;
/** How often the write-lock holder pushes/pulls (ms) */
export const WRITE_SYNC_INTERVAL_MS = 5_000;
/** Lock auto-expires after this many ms of no heartbeat (must match server LOCK_TTL_MS) */
export const LOCK_TTL_MS = 60_000;
/** Popular avatar colors — one is assigned per user in MongoDB */
export const AVATAR_COLORS = [
  '#E53935', '#8E24AA', '#1E88E5', '#00897B',
  '#43A047', '#FB8C00', '#F4511E', '#6D4C41',
  '#1565C0', '#00838F', '#2E7D32', '#AD1457',
];



