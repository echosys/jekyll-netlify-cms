/**
 * mongo.ts — Single Vercel serverless function handling all MongoDB + misc endpoints.
 * Replaces: mongo-login, mongo-lock, mongo-admin, health, user-conn
 *
 * Routes (via vercel.json rewrites):
 *   POST /api/mongo-login  → handleLogin
 *   POST /api/mongo-lock   → handleLock
 *   POST /api/mongo-admin  → handleAdmin
 *   GET  /api/health       → handleHealth
 *   GET  /api/user-conn    → handleUserConn
 *
 * Dispatched by the last path segment of req.url.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMongoDb, getMongoUri } from './mongo-helpers.js';
import { Pool } from 'pg';

// ── /api/mongo-login ──────────────────────────────────────────────────────────

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  const { username, phrase } = (req.body ?? {}) as { username?: string; phrase?: string };
  if (!username || !phrase) {
    return res.status(400).json({ error: 'username and phrase are required.' });
  }
  const db = await getMongoDb();
  const col = db.collection('famt_login');
  const user = await col.findOne({ username, phrase });
  if (!user) return res.status(401).json({ error: 'Invalid username or phrase.' });
  await col.updateOne({ username }, { $set: { lastActivity: Date.now() } });
  const safeUser = { ...user } as Record<string, unknown>;
  delete safeUser['phrase'];
  return res.status(200).json({ user: safeUser });
}

// ── /api/mongo-lock ───────────────────────────────────────────────────────────

const LOCK_TTL_MS = 120_000;
const ACTIVITY_STALE_MS = 120_000;
const ONLINE_TTL_MS = 90_000;
const LOCK_DOC_ID = 'global';
const LOCK_FILTER = { _id: LOCK_DOC_ID } as unknown as Record<string, unknown>;

async function handleLock(req: VercelRequest, res: VercelResponse) {
  const { action, username, role } = (req.body ?? {}) as {
    action?: string; username?: string; role?: string;
  };
  if (!action || !username) {
    return res.status(400).json({ error: 'action and username are required.' });
  }

  const db = await getMongoDb();
  const lockCol = db.collection('famt_lock');
  const userCol = db.collection('famt_login');
  const now = Date.now();

  await lockCol.updateOne(
    LOCK_FILTER,
    { $setOnInsert: { _id: LOCK_DOC_ID, holder: null, holderActivity: 0 } },
    { upsert: true },
  );

  if (action === 'heartbeat') {
    await userCol.updateOne({ username }, { $set: { lastActivity: now }, $unset: { forcedByMsg: '' } });
    const lockDoc = await lockCol.findOne(LOCK_FILTER);
    const userDoc = await userCol.findOne({ username });
    return res.status(200).json({
      holder: lockDoc?.['holder'] ?? null,
      forcedByMsg: userDoc?.['forcedByMsg'] ?? null,
    });
  }

  if (action === 'status') {
    await userCol.updateOne({ username }, { $set: { lastActivity: now } });
    const lockDoc = await lockCol.findOne(LOCK_FILTER);
    const onlineUsers = await userCol.find(
      { lastActivity: { $gt: now - ONLINE_TTL_MS } },
      { projection: { phrase: 0 } },
    ).toArray();
    const userDoc = await userCol.findOne({ username });
    return res.status(200).json({
      holder: lockDoc?.['holder'] ?? null,
      holderActivity: lockDoc?.['holderActivity'] ?? 0,
      onlineUsers,
      forcedByMsg: userDoc?.['forcedByMsg'] ?? null,
    });
  }

  if (action === 'acquire') {
    const lockDoc = await lockCol.findOne(LOCK_FILTER);
    const holder = (lockDoc?.['holder'] as string | null) ?? null;
    const holderActivity = (lockDoc?.['holderActivity'] as number) ?? 0;
    const lockExpired = !holder || (now - holderActivity > LOCK_TTL_MS);
    const holderActiveRecently = holder && holder !== username && (now - holderActivity < ACTIVITY_STALE_MS);
    if (!lockExpired && holder !== username) {
      if (role !== 'dev' && holderActiveRecently) {
        return res.status(409).json({ error: `Lock is held by ${holder}.`, holder, holderActiveRecently: true });
      }
      if (holder && holder !== username) {
        const msg = `⚠️ Your write lock was taken by "${username}". You are now in read-only mode.`;
        await userCol.updateOne({ username: holder }, { $set: { forcedByMsg: msg } });
      }
    }
    await lockCol.updateOne(LOCK_FILTER, { $set: { holder: username, holderActivity: now, forcedByMsg: null } });
    await userCol.updateOne({ username }, { $set: { lastActivity: now } });
    return res.status(200).json({ ok: true, holder: username });
  }

  if (action === 'release') {
    const lockDoc = await lockCol.findOne(LOCK_FILTER);
    if ((lockDoc?.['holder'] as string | null) === username) {
      await lockCol.updateOne(LOCK_FILTER, { $set: { holder: null, holderActivity: 0 } });
    }
    await userCol.updateOne({ username }, { $set: { lastActivity: now } });
    return res.status(200).json({ ok: true });
  }

  if (action === 'force-take') {
    if (role !== 'dev') return res.status(403).json({ error: 'Only dev role can force-take the lock.' });
    const lockDoc = await lockCol.findOne(LOCK_FILTER);
    const previousHolder = (lockDoc?.['holder'] as string | null) ?? null;
    if (previousHolder && previousHolder !== username) {
      const msg = `⚠️ Your write lock was taken by developer "${username}". You are now in read-only mode.`;
      await userCol.updateOne({ username: previousHolder }, { $set: { forcedByMsg: msg } });
    }
    await lockCol.updateOne(LOCK_FILTER, { $set: { holder: username, holderActivity: now } });
    await userCol.updateOne({ username }, { $set: { lastActivity: now } });
    return res.status(200).json({ ok: true, holder: username, displaced: previousHolder });
  }

  if (action === 'logout') {
    const lockDoc = await lockCol.findOne(LOCK_FILTER);
    if ((lockDoc?.['holder'] as string | null) === username) {
      await lockCol.updateOne(LOCK_FILTER, { $set: { holder: null, holderActivity: 0 } });
    }
    await userCol.updateOne({ username }, { $set: { lastActivity: 0 } });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: `Unknown lock action: ${action}` });
}

// ── /api/mongo-admin ──────────────────────────────────────────────────────────

async function handleAdmin(req: VercelRequest, res: VercelResponse) {
  const { action, requesterUsername, targetUsername, allowedTrees } = (req.body ?? {}) as {
    action?: string; requesterUsername?: string; targetUsername?: string; allowedTrees?: string[];
  };
  if (!action || !requesterUsername) {
    return res.status(400).json({ error: 'action and requesterUsername are required.' });
  }

  const db = await getMongoDb();
  const userCol = db.collection('famt_login');

  // get-self: any authenticated user can refresh their own doc
  if (action === 'get-self') {
    const self = await userCol.findOne({ username: requesterUsername }, { projection: { phrase: 0 } });
    if (!self) return res.status(404).json({ error: 'User not found.' });
    return res.status(200).json({ user: self });
  }

  // All other actions require dev role
  const requester = await userCol.findOne({ username: requesterUsername });
  if (!requester || requester['role'] !== 'dev') {
    return res.status(403).json({ error: 'Only dev users can perform admin actions.' });
  }

  if (action === 'list-users') {
    const users = await userCol.find({}, { projection: { phrase: 0 } }).toArray();
    return res.status(200).json({ users });
  }

  if (action === 'set-allowed-trees') {
    if (!targetUsername) return res.status(400).json({ error: 'targetUsername is required.' });
    if (!Array.isArray(allowedTrees)) return res.status(400).json({ error: 'allowedTrees must be an array.' });
    const result = await userCol.updateOne({ username: targetUsername }, { $set: { allowed_trees: allowedTrees } });
    if (result.matchedCount === 0) return res.status(404).json({ error: `User "${targetUsername}" not found.` });
    return res.status(200).json({ ok: true, updated: targetUsername, allowedTrees });
  }

  return res.status(400).json({ error: `Unknown admin action: ${action}` });
}

// ── /api/health ───────────────────────────────────────────────────────────────

async function handleHealth(_req: VercelRequest, res: VercelResponse) {
  type Status = 'ok' | 'error' | 'unconfigured';
  const result: { mongo: Status; pg: Status; mongoError?: string; pgError?: string } =
    { mongo: 'unconfigured', pg: 'unconfigured' };

  const mongoUri = getMongoUri();
  if (mongoUri) {
    try {
      const db = await getMongoDb();
      await db.command({ ping: 1 });
      result.mongo = 'ok';
    } catch (e) {
      result.mongo = 'error';
      result.mongoError = e instanceof Error ? e.message : String(e);
    }
  }

  const pgConn = process.env['VITE_PG_CONN'] ?? '';
  if (pgConn) {
    try {
      const url = new URL(pgConn);
      const pgSslEnv = (process.env['VITE_PG_SSL'] ?? '').toLowerCase();
      const sslDisabled = ['no', 'disable', 'false', '0'].includes(pgSslEnv);
      const sslRequired = ['require', 'yes', 'true', '1'].includes(pgSslEnv);
      const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      const sslValue = sslDisabled ? undefined
        : sslRequired ? { rejectUnauthorized: false }
        : isLocal     ? undefined
        : { rejectUnauthorized: false };
      const pool = new Pool({
        host: url.hostname, port: parseInt(url.port) || 5432,
        database: url.pathname.replace(/^\//, ''), user: url.username,
        password: decodeURIComponent(url.password), max: 1,
        connectionTimeoutMillis: 4000,
        ...(sslValue !== undefined ? { ssl: sslValue } : {}),
      });
      const client = await pool.connect();
      client.release();
      await pool.end();
      result.pg = 'ok';
    } catch (e) {
      result.pg = 'error';
      result.pgError = e instanceof Error ? e.message : String(e);
    }
  }

  return res.status(200).json(result);
}

// ── /api/user-conn ────────────────────────────────────────────────────────────

async function handleUserConn(_req: VercelRequest, res: VercelResponse) {
  const conn = process.env['VITE_PG_CONN'] ?? '';
  if (!conn) return res.status(404).json({ error: 'No PG connection configured on this server.' });
  const pgSsl = process.env['VITE_PG_SSL'] ?? '';
  return res.status(200).json({ conn, pgSsl });
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract sub-route from original URL, e.g. /api/mongo-lock → "mongo-lock"
  const url = (req.url ?? '').split('?')[0];
  const segment = url.replace(/^\/api\//, ''); // e.g. "mongo-lock", "health", "user-conn"

  try {
    switch (segment) {
      case 'mongo-login': return await handleLogin(req, res);
      case 'mongo-lock':  return await handleLock(req, res);
      case 'mongo-admin': return await handleAdmin(req, res);
      case 'health':      return await handleHealth(req, res);
      case 'user-conn':   return await handleUserConn(req, res);
      default:
        return res.status(404).json({ error: `Unknown route: /api/${segment}` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return res.status(500).json({ error: msg });
  }
}

