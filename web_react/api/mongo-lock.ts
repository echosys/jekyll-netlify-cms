/**
 * mongo-lock.ts — POST /api/mongo-lock
 * Distributed read/write lock management for multi-user sync.
 *
 * Actions:
 *   status      → return lock state + online users (active < 90s ago)
 *   heartbeat   → update lastActivity for username
 *   acquire     → take lock if free (or stale > 60s)
 *   release     → release lock if held by requester
 *   force-take  → dev only: forcibly take lock from current holder
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMongoDb } from './mongo-helpers.js';

const LOCK_TTL_MS = 120_000;      // auto-release after 120s no heartbeat (server-side TTL)
const ACTIVITY_STALE_MS = 120_000; // lock can be taken from holder if lastActivity > 2 min ago
const ONLINE_TTL_MS = 90_000;     // consider user "online" if active < 90s ago
const LOCK_DOC_ID = 'global';
// Filter for the single lock document — cast as unknown to satisfy MongoDB's Filter<Document> generic
const LOCK_FILTER = { _id: LOCK_DOC_ID } as unknown as Record<string, unknown>;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, username, role } = (req.body ?? {}) as {
    action?: string;
    username?: string;
    role?: string;
  };

  if (!action || !username) {
    return res.status(400).json({ error: 'action and username are required.' });
  }

  try {
    const db = await getMongoDb();
    const lockCol = db.collection('famt_lock');
    const userCol = db.collection('famt_login');
    const now = Date.now();

    // Ensure lock doc exists
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

      // Lock is free if: no holder, OR holder is stale (no heartbeat > LOCK_TTL_MS)
      const lockExpired = !holder || (now - holderActivity > LOCK_TTL_MS);
      // Holder considered "active" if their lastActivity was < ACTIVITY_STALE_MS ago
      const holderActiveRecently = holder && holder !== username && (now - holderActivity < ACTIVITY_STALE_MS);

      if (!lockExpired && holder !== username) {
        if (role !== 'dev' && holderActiveRecently) {
          // Non-dev: holder is active — show banner, don't acquire
          return res.status(409).json({
            error: `Lock is held by ${holder}.`,
            holder,
            holderActiveRecently: true,
          });
        }
        // Dev role OR holder is stale: fall through and take the lock
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
      if (role !== 'dev') {
        return res.status(403).json({ error: 'Only dev role can force-take the lock.' });
      }
      const lockDoc = await lockCol.findOne(LOCK_FILTER);
      const previousHolder = (lockDoc?.['holder'] as string | null) ?? null;

      if (previousHolder && previousHolder !== username) {
        // Mark displaced user's doc with a message they'll see on next poll
        const msg = `⚠️ Your write lock was taken by developer "${username}". You are now in read-only mode.`;
        await userCol.updateOne({ username: previousHolder }, { $set: { forcedByMsg: msg } });
      }

      await lockCol.updateOne(LOCK_FILTER, { $set: { holder: username, holderActivity: now } });
      await userCol.updateOne({ username }, { $set: { lastActivity: now } });
      return res.status(200).json({ ok: true, holder: username, displaced: previousHolder });
    }

    if (action === 'logout') {
      // Release lock if held, mark user as inactive
      const lockDoc = await lockCol.findOne(LOCK_FILTER);
      if ((lockDoc?.['holder'] as string | null) === username) {
        await lockCol.updateOne(LOCK_FILTER, { $set: { holder: null, holderActivity: 0 } });
      }
      await userCol.updateOne({ username }, { $set: { lastActivity: 0 } });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return res.status(500).json({ error: msg });
  }
}



