/**
 * user-conn.ts — GET /api/user-conn
 * Returns VITE_PG_CONN + VITE_PG_SSL from server env for the 'user' role.
 * No passphrase needed — the user is already authenticated via mongo-login.
 * Deployed as a Vercel serverless function (mirrors local /api/fs/user-conn).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const conn = process.env['VITE_PG_CONN'] ?? '';
  if (!conn) {
    return res.status(404).json({ error: 'No PG connection configured on this server.' });
  }
  const pgSsl = process.env['VITE_PG_SSL'] ?? '';
  return res.status(200).json({ conn, pgSsl });
}

