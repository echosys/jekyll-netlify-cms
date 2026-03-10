/**
 * pg-test.ts — Vercel serverless function: test a PostgreSQL connection.
 * POST /api/pg-test  { ConnPayload }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makePool, ConnPayload, isConnPayload, mapPgError, sendError } from './pg-helpers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });
  if (!isConnPayload(req.body)) {
    return sendError(res, 400, {
      code: 'INVALID_REQUEST',
      error: 'Body must be a ConnPayload object.',
      hint: 'Expected keys: host, port(number), dbname, user, credphrase.',
    });
  }

  const conn: ConnPayload = req.body;
  const pool = makePool(conn);
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ ok: true });
  } catch (err: unknown) {
    const mapped = mapPgError(err, conn);
    sendError(res, mapped.status, mapped.body);
  } finally {
    await pool.end();
  }
}
