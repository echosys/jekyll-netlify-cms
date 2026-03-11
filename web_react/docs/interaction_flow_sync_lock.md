# FamTree — Multi-User Sync & Lock Interaction Flow
_Last updated: 2026-03-10_

---

## 0. MongoDB Schema

MongoDB is schemaless — no `createCollection` commands needed. Documents are created
on first write. The app uses database **`famt_login`** with two collections:

### `famt_login` collection — one doc per user
```json
{
  "_id":          "<ObjectId auto>",
  "username":     "alice",
  "phrase":       "mysecret",        // plaintext — prototype only
  "role":         "user",            // "dev" | "user"
  "color":        "#4CAF50",         // hex — shown as avatar background
  "lastActivity": 1741600000000,     // epoch ms — updated on every API call
  "forcedByMsg":  "⚠️ Lock taken…"   // optional — set when dev force-takes; cleared on next heartbeat
}
```

### `famt_lock` collection — single doc, `_id: "global"`
```json
{
  "_id":            "global",
  "holder":         "alice",         // username of lock holder, null = free
  "holderActivity": 1741600000000,   // epoch ms of holder's last heartbeat
  "forcedByMsg":    null             // optional — message for displaced holder
}
```

**`holderActivity` serves two purposes:**
1. **Server TTL** — if `now - holderActivity > 120s`, the lock is considered expired
   and any user can freely acquire it (server auto-releases on next `acquire` call)
2. **Activity stale check (client hint)** — if `now - holderActivity > 120s`, the
   non-dev client shows "Request Lock" normally; otherwise shows "Locked by [X]" banner

No indexes required for ≤10 users. For production: add unique index on `username`,
TTL index on `lastActivity`.

---

## 1. Tree State Machine

Every open tree is in exactly one of three states:

```
LOCAL  ──(dev opens Sync tab, clicks Start Sync)──►  SYNCED_DEFAULT
                                                            │
                                            (Request Lock → granted)
                                                            │
                                                            ▼
                                                    SYNCED_LOCKED
                                                            │
                                            (Release / expiry / force-take)
                                                            │
                                                            ▼
                                                    SYNCED_DEFAULT
```

| State            | Who enters it                        | DB writes?       |
|------------------|--------------------------------------|------------------|
| `LOCAL`          | Dev only; default when no sync linked | No               |
| `SYNCED_DEFAULT` | User: always on login. Dev: after Start Sync | Read-first |
| `SYNCED_LOCKED`  | Any role after acquiring write lock  | Write-first      |

**User role** never enters `LOCAL`. Their state is always `SYNCED_DEFAULT` or `SYNCED_LOCKED`.

---

## 2. Save / Push Decision Tree

### Triggered by: user clicks Save, or auto-sync tick fires

```
Is treeState LOCAL?
  YES → write to IndexedDB/filesystem only. Done.
  NO  →
    Is treeState SYNCED_LOCKED (I hold the lock)?
      YES →
        1. Push local tree to DB (pg-export)
        2. Update lastKnownDbUpdatedAt = now
        3. Pull from DB (pg-import) — update local if remote newer
        4. Pill → green "Synced · HH:MM:SS"
      NO  (SYNCED_DEFAULT) →
        1. Pull DB tree (pg-import), get remote.updated_at
        2. Compare remote.updated_at with lastKnownDbUpdatedAt
           SAME →
             3a. Push local tree to DB (pg-export)
             3b. lastKnownDbUpdatedAt = now
             3c. Pill → yellow "Synced · HH:MM:SS"
           DIFFERENT (DB changed since last read) →
             3a. Pull latest into local (discard local changes — DB wins)
             3b. lastKnownDbUpdatedAt = remote.updated_at
             3c. Show brief notice: "Remote changes pulled — local edits discarded"
             3d. Pill → yellow "Synced · HH:MM:SS"
```

### Auto-sync schedule (setTimeout chain, no busy-polling)

- **SYNCED_DEFAULT**: runs every **10 s**. Each run always does a `pg-import` first, then
  conditionally a `pg-export` if the DB hasn't changed and local is dirty.
- **SYNCED_LOCKED**: runs every **5 s**. Each run does `pg-export` if dirty, then always `pg-import`.
- **Save button click**: calls `syncTick()` immediately (same logic, resets the schedule timer).
- **Tab restore**: calls `syncTick()` immediately on `visibilitychange → visible`.

---

## 3. Lock Request Flow

### Clicking "Request Lock"

```
Fetch MongoDB lock record for this tree
  ↓
lock.holder === null OR lock.lastActivityAt < (now − 2 min)?
  YES →
    Is my role "dev"?
      YES → Force-acquire (always succeeds, sets forcedByMsg for displaced user)
      NO  → Acquire lock normally
    → Set lock.holder = me, lock.acquiredAt = now, lock.lastActivityAt = now
    → UI: mode → SYNCED_LOCKED
    → Lock button: "Release Lock" with 10-second countdown ticker
    → Start heartbeat every 60 s (updates lock.lastActivityAt while page visible)
  NO (someone holds it and is active < 2 min ago) →
    Show banner: "Locked by [holder]" — auto-dismiss 5 s or click ✕
    Do NOT acquire lock
    Stay in SYNCED_DEFAULT
```

### While locked (I am the holder)

- Every 60 s (while page visible): send heartbeat → updates `lastActivityAt`
- Page hidden → heartbeat pauses; server TTL = 120 s releases lock if no heartbeat
- Lock button shows countdown: "Release Lock · next sync in [N]s"
- `N` counts down from 10, resets on each sync tick

### Clicking "Release Lock"

- Call mongo-lock `release` action
- UI: mode → `SYNCED_DEFAULT`
- Lock button → "Request Lock"

### Lock auto-expired (server TTL, or another dev force-took)

- Poll detects `lock.holder !== me` while `mode === 'write'`
- UI: mode → `SYNCED_DEFAULT`, show `forcedByMsg` banner if populated
- Lock button → "Request Lock"

### Dev force-acquire (while another user holds the lock AND is active)

- Bypasses activity-age check
- Sets `forcedByMsg = "Lock taken by [dev] at HH:MM:SS"`
- Displaced user's poll picks up `forcedByMsg`, shows banner, moves to `SYNCED_DEFAULT`

---

## 4. UI Element Visibility Table

| Role | State            | Save btn       | Lock btn              | Status pill                        | Sidebar delete | PG Dialog    |
|------|------------------|----------------|-----------------------|------------------------------------|----------------|--------------|
| user | SYNCED_DEFAULT   | ✅ read-first  | ✅ "Request Lock"     | 🟡 Yellow "Synced · ts"            | ❌ hidden      | 👁 View-only |
| user | SYNCED_LOCKED    | ✅ write-first | ✅ "Release Lock [Ns]"| 🟢 Green "Synced · ts"             | ❌ hidden      | 👁 View-only |
| dev  | LOCAL            | ✅ local-only  | ❌ hidden             | ⚪ Grey "Not synced"               | ✅ active      | ✅ Full      |
| dev  | SYNCED_DEFAULT   | ✅ read-first  | ✅ "Request Lock"     | 🟡 Yellow "Synced · ts"            | 🔘 disabled    | ✅ Full      |
| dev  | SYNCED_LOCKED    | ✅ write-first | ✅ "Release Lock [Ns]"| 🟢 Green "Synced · ts"             | 🔘 disabled    | ✅ Full      |

### Status pill colours in detail

| Pill state       | Colour | Text                          | When shown                          |
|------------------|--------|-------------------------------|-------------------------------------|
| Not synced       | ⚪ Grey | "Not synced"                 | Dev LOCAL mode                      |
| Reading          | 🔵 Blue | "Reading…" (pulse)           | pg-import in flight                 |
| Synced default   | 🟡 Yellow | "Synced · HH:MM:SS"        | SYNCED_DEFAULT, no pending changes  |
| Changed          | 🟡 Yellow | "Changed · HH:MM:SS"       | SYNCED_DEFAULT, isDirty             |
| Writing          | 🟠 Orange | "Writing…" (pulse)          | pg-export in flight                 |
| Synced locked    | 🟢 Green | "Synced · HH:MM:SS"         | SYNCED_LOCKED, idle                 |

---

## 5. Sync & Lock Timing Rules

| Timer | Interval | Condition | DB Query |
|-------|----------|-----------|----------|
| Sync tick — SYNCED_DEFAULT | 10 s (setTimeout chain) | Synced, page visible | `POST /api/pg-import` (read) → if unchanged + dirty: `POST /api/pg-export` (write) |
| Sync tick — SYNCED_LOCKED | 5 s (setTimeout chain) | Lock held, page visible | `POST /api/pg-export` if dirty (write), then `POST /api/pg-import` (read, always) |
| Save button click | immediate (on demand) | Any synced state | Same as sync tick above — runs `syncTick()` directly |
| Lock status poll | 10 s (setInterval) | Any synced state, page visible | `POST /api/mongo-lock` `{ action: "status" }` — reads `famt_lock` + `famt_login` |
| Lock button countdown | 1 s tick, 10→0 display | SYNCED_LOCKED only | No network call — UI-only countdown to next lock status poll |
| Heartbeat (lock holder) | 60 s (setInterval) | SYNCED_LOCKED, page visible | `POST /api/mongo-lock` `{ action: "heartbeat" }` — updates `famt_login.lastActivity` |
| Lock TTL (server-side) | 120 s threshold | Server checks on each `acquire` | No timer — checked inline: `now - holderActivity > 120s` → lock treated as free |
| Activity stale threshold | 120 s threshold | Server checks on each `acquire` | Same inline check — if stale, non-dev can acquire; dev always can |
| Banner auto-dismiss | 5 s (setTimeout) | "Locked by X" shown | No network call — UI only |
| Re-sync on tab restore | Immediate | `visibilitychange` → visible | Runs `syncTick()` directly (same queries as sync tick) |

### What actually fires the network calls

```
SYNCED_DEFAULT timeline (no lock held):
  t=0s  ──── syncTick ──→ POST /api/pg-import           (read)
                           → if dirty + DB unchanged: POST /api/pg-export  (write)
  t=10s ──── syncTick ──→ POST /api/pg-import           (read, repeated)
  ...

  Every 10s independently:
  t=0s  ──── lock poll ─→ POST /api/mongo-lock {status} (check lock state)
  t=10s ──── lock poll ─→ POST /api/mongo-lock {status}

SYNCED_LOCKED timeline (I hold the lock):
  t=0s  ──── syncTick ──→ POST /api/pg-export if dirty  (write)
                           POST /api/pg-import           (read, always)
  t=5s  ──── syncTick ──→ POST /api/pg-export if dirty
                           POST /api/pg-import
  ...

  Every 10s independently:
  t=0s  ──── lock poll ─→ POST /api/mongo-lock {status}
  t=10s ──── lock poll ─→ POST /api/mongo-lock {status}

  Every 60s independently:
  t=0s  ──── heartbeat ─→ POST /api/mongo-lock {heartbeat}
```

### Countdown clarification

The **"Release Lock · Ns"** countdown shows time until the **next lock status poll** (10 s cadence).
It makes **no network call** — it's a pure UI countdown that resets when the poll fires.

```
poll fires → countdown resets to 10 → ticks 10, 9 … 1, 0 → poll fires again
  └─ if lock still mine → reset to 10, repeat
  └─ if force-taken / expired → UI → SYNCED_DEFAULT, show banner
```

Worst-case detection delay for a force-take: **10 s** (one poll interval).

---

## 6. Conflict Resolution

### Key timestamp: `lastKnownDbUpdatedAt`

Stored in `syncStore` alongside the active connection. Set to the `updated_at` value of the tree the last time we successfully read from OR wrote to DB.

### Rule: DB Wins on Conflict (SYNCED_DEFAULT)

```
before_push:
  remote = pg-import(treeName)
  if remote.updated_at > lastKnownDbUpdatedAt:
    // DB was updated by someone else since our last read
    apply remote to local tree
    lastKnownDbUpdatedAt = remote.updated_at
    isDirty = false
    show: "Changes from DB applied — your edits were discarded"
    STOP (do not push)
  else:
    // DB hasn't changed since we last read — safe to push
    pg-export(localTree)
    lastKnownDbUpdatedAt = now_utc
```

### Worked example

1. Alice reads tree at T=0. `lastKnownDbUpdatedAt = T0`.
2. Bob (locked) pushes change at T=1. DB `updated_at = T1`.
3. Alice edits locally (isDirty=true). Does NOT hold lock.
4. Alice's 5-s tick fires:
   - Reads DB: `updated_at = T1 > T0` → conflict detected.
   - Pulls T1 version. Alice's local changes discarded.
   - `lastKnownDbUpdatedAt = T1`.
5. Alice sees notice: "Remote changes pulled".

---

## 7. Design Issues & Edge Cases

| # | Issue | Mitigation |
|---|-------|------------|
| 1 | Two users click "Request Lock" simultaneously | Mongo `findOneAndUpdate` with atomic conditional write (`holder: null`); only one succeeds |
| 2 | Dev force-acquires while lock holder is mid-push | Lock poll on holder detects `forcedByMsg` after push completes; holder's next tick moves to SYNCED_DEFAULT. One write may be overwritten — acceptable for dev privilege. |
| 3 | Save clicked while pull is in progress | Guard with `syncInFlight` ref — if true, queue the save for next tick |
| 4 | `lastKnownDbUpdatedAt` stale after force-acquire | On acquiring lock, immediately run a pg-import to reset `lastKnownDbUpdatedAt` |
| 5 | Undo/redo after DB discard | When local changes are discarded, clear undo/redo stack to prevent re-applying overwritten state |
| 6 | Flaky connectivity — heartbeat fails | Server TTL (120 s) releases lock; client poll re-evaluates on reconnect |
| 7 | Page restored after background (>2 min) | On `visibilitychange` to visible: immediately run poll + sync tick to re-sync state |
| 8 | User role editing nodes in SYNCED_DEFAULT | Editing is always allowed — the conflict check on save is what enforces "DB wins". No UI read-only block. |
| 9 | `lastKnownDbUpdatedAt` not persisted across refresh | On page load, auto-resume does a pg-import first; sets `lastKnownDbUpdatedAt` from result before starting interval |
