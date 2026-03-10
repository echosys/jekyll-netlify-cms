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


