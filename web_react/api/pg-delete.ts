/**
 * pg-delete.ts — Vercel serverless function: delete all rows for a tree.
 * POST /api/pg-delete  { conn: ConnPayload, treeName: string }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makePool, schemaTable, ConnPayload, isConnPayload, mapPgError, sendError } from './pg-helpers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });

  const body = req.body as { conn?: unknown; treeName?: unknown };
  if (!isConnPayload(body?.conn) || typeof body?.treeName !== 'string' || !body.treeName.trim()) {
    return sendError(res, 400, {
      code: 'INVALID_REQUEST',
      error: 'Body must include { conn: ConnPayload, treeName: string }.',
    });
  }

  const conn: ConnPayload = body.conn;
  const treeName = body.treeName;
  const pool = makePool(conn);
  const st = schemaTable(conn);

  try {
    const result = await pool.query(`DELETE FROM ${st} WHERE tree_name = $1`, [treeName]);
    res.json({ ok: true, rowsDeleted: result.rowCount });
  } catch (err: unknown) {
    const mapped = mapPgError(err, conn);
    sendError(res, mapped.status, mapped.body);
  } finally {
    await pool.end();
  }
}
