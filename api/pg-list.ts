/**
 * pg-list.ts — Vercel serverless function: list all tree names in the DB.
 * POST /api/pg-list  { ConnPayload }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makePool, schemaTable, ConnPayload } from './pg-helpers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const conn: ConnPayload = req.body;
  const pool = makePool(conn);
  const st = schemaTable(conn);
  try {
    const result = await pool.query(
      `SELECT DISTINCT tree_name FROM ${st} ORDER BY tree_name`,
    );
    res.json({ trees: result.rows.map((r) => r.tree_name) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  } finally {
    await pool.end();
  }
}

