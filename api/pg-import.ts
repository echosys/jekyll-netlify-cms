/**
 * pg-import.ts — Vercel serverless function: read a tree from PostgreSQL.
 * POST /api/pg-import  { conn: ConnPayload, treeName: string }
 * Returns: { tree: Tree, images: Record<resourceId, base64> }
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
      `SELECT record_type, record_id, payload, image_data
       FROM ${st}
       WHERE tree_name = $1
       ORDER BY record_type`,
      [treeName],
    );

    let treeMeta: any = {};
    const nodes: any[] = [];
    const edges: any[] = [];
    const resources: any[] = [];
    const images: Record<string, string> = {};

    for (const row of result.rows) {
      switch (row.record_type) {
        case 'tree_meta': treeMeta = row.payload; break;
        case 'node':      nodes.push(row.payload); break;
        case 'edge':      edges.push(row.payload); break;
        case 'resource':
          resources.push(row.payload);
          if (row.image_data) images[row.record_id] = row.image_data;
          break;
      }
    }

    const tree = {
      ...treeMeta,
      tree_name: treeName,
      nodes,
      edges,
      resources,
    };

    res.json({ tree, images });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    await pool.end();
  }
}

