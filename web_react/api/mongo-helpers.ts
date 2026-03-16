/**
 * mongo-helpers.ts — MongoDB connection helper.
 *
 * Database: famt_login  (one db for all app data, schemaless)
 *
 * Collections:
 * ─────────────────────────────────────────────────────────────────────────
 * famt_login  — one doc per user
 *   {
 *     _id:          ObjectId (auto)
 *     username:     string   — unique login name
 *     phrase:       string   — plaintext passphrase (prototype only)
 *     role:         'dev' | 'user'
 *     color:        string   — hex color for avatar e.g. "#4CAF50"
 *     lastActivity: number   — epoch ms, updated on every heartbeat/status call
 *     forcedByMsg?: string   — set by server when dev force-takes lock from this user;
 *                              cleared on next heartbeat from this user
 *     allowed_trees?: string[] — list of tree names (as stored in PG) this user can see;
 *                              undefined/missing = no restriction (dev users); empty = no access
 *   }
 *
 * famt_lock   — single doc (_id: 'global'), global write-lock state
 *   {
 *     _id:            'global'   (fixed sentinel)
 *     holder:         string | null  — username of current lock holder, null if free
 *     holderActivity: number         — epoch ms of holder's last heartbeat
 *                                      used for: TTL expiry (120s) and
 *                                      activity-stale check (120s) before allowing
 *                                      another user to acquire
 *     forcedByMsg?:   string         — populated when force-take displaces a holder;
 *                                      cleared when lock is cleanly acquired/released
 *   }
 *
 * No indexes needed for prototype (< 10 users, single lock doc).
 * For production add: famt_login.username (unique), famt_login.lastActivity (TTL).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { MongoClient, type Db } from 'mongodb';

let _client: MongoClient | null = null;

export function getMongoUri(): string {
  return process.env['MONGO_URI'] ?? '';
}

export async function getMongoDb(): Promise<Db> {
  const uri = getMongoUri();
  if (!uri) throw new Error('MONGO_URI environment variable is not set.');
  if (!_client) {
    _client = new MongoClient(uri);
    await _client.connect();
  }
  // derive db name from the URI path (e.g. /famt_login → famt_login)
  const dbName = new URL(uri).pathname.replace(/^\//, '') || 'famt_login';
  return _client.db(dbName);
}

/** User document shape in famt_login.famt_login */
export interface UserDoc {
  _id?: unknown;
  username: string;
  phrase: string;       // plaintext — prototype only
  role: 'dev' | 'user';
  color: string;        // hex color e.g. "#4CAF50"
  lastActivity?: number; // epoch ms — updated on every heartbeat/status call
  forcedByMsg?: string;  // set when dev force-takes lock; cleared on next heartbeat
  /** List of tree names this user is allowed to access. Undefined = no restriction (dev). */
  allowed_trees?: string[];
}

/** Lock document shape in famt_login.famt_lock (single doc, _id: 'global') */
export interface LockDoc {
  _id: string;          // always 'global'
  holder: string | null; // username of lock holder, null = free
  holderActivity: number; // epoch ms of holder's last heartbeat
                          // TTL: lock auto-expires after 120s without update
                          // stale check: another user can take after 120s
  forcedByMsg?: string;   // message shown to displaced user; cleared on clean acquire
}
