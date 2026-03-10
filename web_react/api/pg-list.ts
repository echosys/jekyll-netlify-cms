/**
 * pg-list.ts — Vercel serverless function: list all tree names in the DB.
 * POST /api/pg-list  { ConnPayload }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makePool, schemaTable, ConnPayload, isConnPayload, mapPgError, sendError } from './pg-helpers';

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
  const st = schemaTable(conn);
  try {
    const result = await pool.query(`SELECT DISTINCT tree_name FROM ${st} ORDER BY tree_name`);
    res.json({ trees: result.rows.map((r) => r.tree_name) });
  } catch (err: unknown) {
    const mapped = mapPgError(err, conn);
    sendError(res, mapped.status, mapped.body);
  } finally {
    await pool.end();
  }
}
