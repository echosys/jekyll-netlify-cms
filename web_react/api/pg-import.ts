/**
 * pg-import.ts — Vercel serverless function: read a tree from PostgreSQL.
 * POST /api/pg-import  { conn: ConnPayload, treeName: string }
 * Returns: { tree: Tree, images: Record<resourceId, base64> }
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
    const result = await pool.query(
      `SELECT record_type, record_id, payload, image_data
       FROM ${st}
       WHERE tree_name = $1
       ORDER BY record_type`,
      [treeName],
    );

    let treeMeta: Record<string, unknown> = {};
    const nodes: unknown[] = [];
    const edges: unknown[] = [];
    const resources: unknown[] = [];
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
  } catch (err: unknown) {
    const mapped = mapPgError(err, conn);
    sendError(res, mapped.status, mapped.body);
  } finally {
    await pool.end();
  }
}
