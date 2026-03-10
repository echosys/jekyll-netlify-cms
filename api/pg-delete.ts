/**
 * pg-delete.ts — Vercel serverless function: delete all rows for a tree.
 * POST /api/pg-delete  { conn: ConnPayload, treeName: string }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makePool, schemaTable, ConnPayload } from './pg-helpers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { conn, treeName }: { conn: ConnPayload; treeName: string } = req.body;
  const pool = makePool(conn);
  const st = schemaTable(conn);

  try {
    const result = await pool.query(
      `DELETE FROM ${st} WHERE tree_name = $1`,
      [treeName],
    );
    res.json({ ok: true, rowsDeleted: result.rowCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    await pool.end();
  }
}

