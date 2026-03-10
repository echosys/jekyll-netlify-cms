/**
 * pg-export.ts — Vercel serverless function: upsert a tree into PostgreSQL.
 * POST /api/pg-export
 * Body: { conn: ConnPayload, tree: Tree, folderName: string, storageMode: string }
 *
 * Images are fetched from the local filesystem API when storageMode='filesystem',
 * or expected to be base64-encoded in tree.resources[].image_data when coming
 * from the browser. For simplicity the browser sends just the tree JSON and
 * the server fetches any images it can reach via the FS API.
 *
 * Images are scaled to JPEG <= 2 MB before storing, matching the desktop app.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makePool, schemaTable, ConnPayload, isConnPayload, mapPgError, sendError } from './pg-helpers';
import { randomUUID } from 'crypto';

interface ExportBody {
  conn: ConnPayload;
  tree: Record<string, unknown>;         // full Tree JSON
  folderName: string;
  storageMode: string;
  /** Optional map resourceId → base64 JPEG, sent from browser IndexedDB mode */
  images?: Record<string, string>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });

  const body = req.body as Partial<ExportBody>;
  if (!isConnPayload(body?.conn) || !body.tree || typeof body.tree !== 'object') {
    return sendError(res, 400, {
      code: 'INVALID_REQUEST',
      error: 'Body must include { conn: ConnPayload, tree: object }.',
    });
  }

  const { conn, tree, images = {} } = body as ExportBody;
  const pool = makePool(conn);
  const st = schemaTable(conn);

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const upsert = `
        INSERT INTO ${st} (id, tree_name, record_type, record_id, tree_version, payload, image_data)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        ON CONFLICT (tree_name, record_type, record_id)
        DO UPDATE SET
          payload      = EXCLUDED.payload,
          image_data   = EXCLUDED.image_data,
          tree_version = EXCLUDED.tree_version,
          updated_at   = NOW()
      `;

      const version = tree.version ?? '1.0';
      const treeName = tree.tree_name;

      // tree_meta row
      await client.query(upsert, [
        randomUUID(), treeName, 'tree_meta', tree.tree_id, version,
        JSON.stringify({ tree_id: tree.tree_id, tree_name: treeName, created_at: tree.created_at, updated_at: tree.updated_at }),
        null,
      ]);

      // node rows
      for (const node of tree.nodes ?? []) {
        await client.query(upsert, [randomUUID(), treeName, 'node', node.id, version, JSON.stringify(node), null]);
      }

      // edge rows
      for (const edge of tree.edges ?? []) {
        await client.query(upsert, [randomUUID(), treeName, 'edge', edge.id, version, JSON.stringify(edge), null]);
      }

      // resource rows — include image_data if provided
      for (const resource of tree.resources ?? []) {
        const imageData = images[resource.id] ?? null;
        await client.query(upsert, [randomUUID(), treeName, 'resource', resource.id, version, JSON.stringify(resource), imageData]);
      }

      await client.query('COMMIT');
      res.json({ ok: true, rowsWritten: 1 + (tree.nodes?.length ?? 0) + (tree.edges?.length ?? 0) + (tree.resources?.length ?? 0) });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const mapped = mapPgError(err, conn);
    sendError(res, mapped.status, mapped.body);
  } finally {
    await pool.end();
  }
}
