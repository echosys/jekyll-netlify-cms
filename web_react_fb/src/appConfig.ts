/**
 * appConfig.ts — Build-time application configuration.
 *
 * This file is simplified as the application now exclusively uses Firebase Realtime Database (RTDB).
 */

/**
 * The active storage mode — fixed at 'rtdb'.
 */
export const STORAGE_MODE = 'rtdb';

export type StorageMode = 'rtdb';

// ── Multi-user sync & lock timing ──────────────────────────────────────────
/** How often to poll lock status and send heartbeat (ms) */
export const LOCK_POLL_MS = 5_000;
/** How often read-only users pull from DB (ms) */
export const READ_ONLY_POLL_MS = 5_000;
/** How often the write-lock holder pushes/pulls (ms) */
export const WRITE_SYNC_INTERVAL_MS = 5_000;
/** Lock auto-expires after this many ms of no heartbeat (must match server LOCK_TTL_MS) */
export const LOCK_TTL_MS = 60_000;

/** Popular avatar colors */
export const AVATAR_COLORS = [
  '#E53935', '#F4511E', '#FB8C00', '#FFB300', '#FDD835', '#D81B60',
  '#8E24AA', '#3949AB', '#1E88E5', '#039BE5', '#00ACC1', '#00897B',
  '#43A047', '#7CB342', '#C0CA33', '#6D4C41', '#546E7A', '#5E35B1',
];
