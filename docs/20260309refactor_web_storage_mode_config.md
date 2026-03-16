# Refactor: Storage Mode — Runtime Toggle → Build-time Config

**Date:** 2026-03-09  
**Type:** Refactor  
**Platform:** Web React (`web_react/`)  
**Status:** ✅ Complete

---

## Problem

The previous implementation stored `storageMode` (`'filesystem' | 'indexeddb'`) as runtime Zustand state, with a toggle button in the Sidebar. This caused:

- **UI weirdness** when switching between modes mid-session — tree lists and images from the previous mode were still in memory, causing stale/mismatched state
- The toggle was visible in Vercel production where filesystem mode is meaningless
- Complex propagation: every component (`NodeCard`, `PersonDialog`, `ResourceManager`, `TagEditor`, `ImportExportDialog`, `DBDialog`, `App`, `Sidebar`) had to read `storageMode` from the store and pass it as a parameter to every adapter function call
- **Postgres calls broken locally** with `npm run dev:all` — `vite.config.ts` proxied `/api/pg-*` to `localhost:3001` but `fs-server.ts` only handled `/api/fs/*`, so Postgres calls silently failed unless running `vercel dev`

---

## Solution

### 1. Build-time config (`src/appConfig.ts`) — new file

```typescript
// Set VITE_STORAGE_MODE in .env.local. Vercel never sets it → 'indexeddb'.
export type StorageMode = 'filesystem' | 'indexeddb';
export const STORAGE_MODE: StorageMode =
  import.meta.env.VITE_STORAGE_MODE === 'local-fs' ? 'filesystem' : 'indexeddb';
```

Mode is now a **compile-time constant** (Vite env var), not runtime state. To switch mode: change `.env.local` and restart the dev server.

### 2. `.env.local` — new file (gitignored)

```env
# local-fs       → Filesystem. Run: npm run dev:all
# local-indexdb  → IndexedDB.  Run: npm run dev
VITE_STORAGE_MODE=local-fs
```

Vercel never sees this file. No `VITE_STORAGE_MODE` in Vercel env vars = always `indexeddb`.

### 3. `storageAdapter.ts` — removed `mode` parameter from all public functions

Before:
```typescript
export async function listTrees(mode: StorageMode): Promise<...>
export async function loadTree(mode: StorageMode, folderName: string): Promise<Tree>
export async function saveTree(mode: StorageMode, folderName: string, tree: Tree): Promise<void>
export async function createTree(mode: StorageMode, folderName: string, tree: Tree): Promise<void>
export async function deleteTree(mode: StorageMode, folderName: string): Promise<void>
export async function getImageUrl(mode: StorageMode, folderName: string, resourceId: string, filename: string): Promise<string | null>
export async function uploadImage(mode: StorageMode, folderName: string, resourceId: string, filename: string, blob: Blob): Promise<void>
export async function removeImage(mode: StorageMode, folderName: string, resourceId: string, filename: string): Promise<void>
```

After: all functions read `STORAGE_MODE` from `appConfig.ts` internally. No `mode` param anywhere.

### 4. `treeStore.ts` — removed `storageMode` state entirely

Removed: `storageMode`, `setStorageMode`, `StorageMode` interface export.

### 5. `utils/zip.ts` — removed `mode` param from `exportZip`

`exportZip(tree, folderName)` — reads `STORAGE_MODE` internally.

### 6. `Sidebar.tsx` — toggle replaced by read-only badge

Before: two-button toggle `[📁 Filesystem] [🗃 IndexedDB]` that called `setStorageMode`.  
After: a read-only coloured badge showing which mode is active (green = filesystem, blue = indexeddb). Not clickable.

### 7. `api/fs-server.ts` — now also serves `/api/pg-*` locally

The same Vercel handler functions (`pg-test.ts`, `pg-list.ts`, etc.) are imported and called via a thin adapter that wraps Node's `IncomingMessage/ServerResponse` into the Vercel request/response shape:

```typescript
import pgTest from './pg-test.js';
// ... etc.

async function callVercelHandler(handler, req, res) {
  // parse body, build vercelReq/vercelRes shim, call handler
}

// Inside request handler:
if (url === '/api/pg-test')   return callVercelHandler(pgTest, req, res);
if (url === '/api/pg-list')   return callVercelHandler(pgList, req, res);
// ...etc
```

This means **Postgres works locally with `npm run dev:all`** — no `vercel dev` needed.

`vite.config.ts` already proxied `/api/pg-` → `localhost:3001`, so no proxy change was needed.

---

## Files Changed

| File | Change |
|---|---|
| `src/appConfig.ts` | **NEW** — build-time `STORAGE_MODE` constant |
| `.env.local` | **NEW** — `VITE_STORAGE_MODE=local-fs` (gitignored) |
| `src/db/storageAdapter.ts` | Removed `mode` param from all 8 public functions; reads `STORAGE_MODE` internally |
| `src/store/treeStore.ts` | Removed `storageMode`, `setStorageMode`, `StorageMode` interface |
| `src/utils/zip.ts` | Removed `mode` param from `exportZip`; reads `STORAGE_MODE` internally |
| `src/App.tsx` | Removed `storageMode` from store reads; call adapter without mode |
| `src/components/panels/Sidebar.tsx` | Removed toggle UI; replaced with read-only badge; removed `storageMode`/`setStorageMode` |
| `src/components/panels/PersonDialog.tsx` | Removed `storageMode` from store + `getImageUrl` call |
| `src/components/panels/ResourceManager.tsx` | Removed `storageMode` from store + `getImageUrl`/`uploadImage` calls |
| `src/components/panels/TagEditor.tsx` | Removed `storageMode` from store + `getImageUrl` call |
| `src/components/canvas/NodeCard.tsx` | Removed `storageMode` from store + `getImageUrl` call; removed `useTreeStore` import |
| `src/components/dialogs/ImportExportDialog.tsx` | Removed `storageMode`; call `uploadImage`/`createTree`/`exportZip` without mode |
| `src/components/dialogs/DBDialog.tsx` | Removed `storageMode`; call `uploadImage`/`createTree` without mode; removed from export body |
| `api/fs-server.ts` | Added pg-* handler imports + `callVercelHandler` adapter + route dispatch |

---

## How Modes Now Work

### Local — Filesystem mode
```
.env.local:  VITE_STORAGE_MODE=local-fs
Command:     npm run dev:all

  Vite (:5173)  →  proxy /api/*  →  fs-server (:3001)
                                      ├── /api/fs/*    → FamilyTrees_react/ on disk
                                      └── /api/pg-*   → same pg-*.ts handler code
```

### Local — IndexedDB mode
```
.env.local:  VITE_STORAGE_MODE=local-indexdb
Command:     npm run dev   (no fs-server needed)

  Vite (:5173) — storage goes directly to browser IndexedDB/localStorage
               — /api/pg-* still proxied to :3001 if fs-server is also running
```

### Vercel production
```
No VITE_STORAGE_MODE set → STORAGE_MODE = 'indexeddb'
  React app → Vercel CDN (static files)
  /api/pg-* → Vercel serverless functions (pg-*.ts)
  fs-server → never started, never deployed
```

---

## Vercel — Why Not Affected

- `fs-server.ts` has no `export default handler` → Vercel ignores it completely
- `VITE_STORAGE_MODE` is a **Vite build-time env var** — it's baked into the JS bundle at `npm run build` time. Vercel builds the app without it → the bundle always contains `STORAGE_MODE = 'indexeddb'`
- No Vercel env vars need to be set or changed
- The pg-* serverless functions are unchanged

---

## Q&A

**Q: Can I still switch modes without restarting?**  
No — and that's intentional. The old runtime toggle caused the UI bugs. Change `.env.local` and run `npm run dev` / `npm run dev:all` again.

**Q: Do I need `vercel dev` for Postgres locally?**  
No. `npm run dev:all` now handles `/api/pg-*` via `fs-server.ts`, which calls the exact same handler code.

**Q: How does Vercel know which mode to use?**  
It doesn't need to — it's always IndexedDB. `VITE_STORAGE_MODE` is never set in Vercel, so the built bundle always has `STORAGE_MODE = 'indexeddb'` baked in.

