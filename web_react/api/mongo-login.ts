/**
 * mongo-login.ts — POST /api/mongo-login
 * Authenticates a user against famt_login.famt_login collection.
 * Returns user doc (minus phrase) on success, 401 on failure.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMongoDb } from './mongo-helpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, phrase } = (req.body ?? {}) as { username?: string; phrase?: string };
  if (!username || !phrase) {
    return res.status(400).json({ error: 'username and phrase are required.' });
  }

  try {
    const db = await getMongoDb();
    const col = db.collection('famt_login');
    const user = await col.findOne({ username, phrase });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or phrase.' });
    }

    // Update lastActivity on login
    await col.updateOne({ username }, { $set: { lastActivity: Date.now() } });

    // Return user doc without phrase
    const safeUser = { ...user } as Record<string, unknown>;
    delete safeUser['phrase'];
    return res.status(200).json({ user: safeUser });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return res.status(500).json({ error: msg });
  }
}


