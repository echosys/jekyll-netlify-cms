/**
 * mongo-admin.ts — POST /api/mongo-admin
 * Admin + self-refresh actions for user management.
 *
 * Actions:
 *   get-self              → return own user doc (minus phrase) — any user
 *   list-users            → return all users (minus phrase) — dev only
 *   set-allowed-trees     → update allowed_trees for a user — dev only
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMongoDb } from './mongo-helpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, requesterUsername, targetUsername, allowedTrees } = (req.body ?? {}) as {
    action?: string;
    requesterUsername?: string;
    targetUsername?: string;
    allowedTrees?: string[];
  };

  if (!action || !requesterUsername) {
    return res.status(400).json({ error: 'action and requesterUsername are required.' });
  }

  try {
    const db = await getMongoDb();
    const userCol = db.collection('famt_login');

    // ── get-self: any authenticated user can refresh their own doc ──────────
    if (action === 'get-self') {
      const self = await userCol.findOne(
        { username: requesterUsername },
        { projection: { phrase: 0 } },
      );
      if (!self) return res.status(404).json({ error: 'User not found.' });
      return res.status(200).json({ user: self });
    }

    // ── All other actions require dev role ──────────────────────────────────
    const requester = await userCol.findOne({ username: requesterUsername });
    if (!requester || requester['role'] !== 'dev') {
      return res.status(403).json({ error: 'Only dev users can perform admin actions.' });
    }

    if (action === 'list-users') {
      const users = await userCol.find(
        {},
        { projection: { phrase: 0 } },
      ).toArray();
      return res.status(200).json({ users });
    }

    if (action === 'set-allowed-trees') {
      if (!targetUsername) {
        return res.status(400).json({ error: 'targetUsername is required for set-allowed-trees.' });
      }
      if (!Array.isArray(allowedTrees)) {
        return res.status(400).json({ error: 'allowedTrees must be an array of strings.' });
      }

      const result = await userCol.updateOne(
        { username: targetUsername },
        { $set: { allowed_trees: allowedTrees } },
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: `User "${targetUsername}" not found.` });
      }

      return res.status(200).json({ ok: true, updated: targetUsername, allowedTrees });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return res.status(500).json({ error: msg });
  }
}

