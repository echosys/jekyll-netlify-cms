/**
 * pg.ts — Single Vercel serverless function handling all PostgreSQL endpoints.
 * Replaces: pg-test, pg-list, pg-export, pg-import, pg-delete
 *
 * Routes (via vercel.json rewrites):
 *   POST /api/pg-test   → action=test
 *   POST /api/pg-list   → action=list
 *   POST /api/pg-export → action=export
 *   POST /api/pg-import → action=import
 *   POST /api/pg-delete → action=delete
 *
 * The original URL path is preserved by rewrites; internally dispatched
 * by the last path segment (e.g. /api/pg-import → "import").
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { makePool, schemaTable, ConnPayload, isConnPayload, mapPgError, sendError } from './pg-helpers.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TreeLike {
  tree_id?: unknown;
  tree_name?: unknown;
  version?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  nodes?: Record<string, unknown>[];
  edges?: Record<string, unknown>[];
  resources?: (Record<string, unknown> & { id: string })[];
  [key: string]: unknown;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleTest(req: VercelRequest, res: VercelResponse) {
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
  } catch (err) {
    const mapped = mapPgError(err, conn);
    sendError(res, mapped.status, mapped.body);
  } finally {
    await pool.end();
  }
}

async function handleList(req: VercelRequest, res: VercelResponse) {
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
  } catch (err) {
    const mapped = mapPgError(err, conn);
    sendError(res, mapped.status, mapped.body);
  } finally {
    await pool.end();
  }
}

async function handleExport(req: VercelRequest, res: VercelResponse) {
  const body = req.body as { conn?: unknown; tree?: unknown; images?: Record<string, string> };
  if (!isConnPayload(body?.conn) || !body.tree || typeof body.tree !== 'object') {
    return sendError(res, 400, {
      code: 'INVALID_REQUEST',
      error: 'Body must include { conn: ConnPayload, tree: object }.',
    });
  }
  const conn = body.conn as ConnPayload;
  const tree = body.tree as TreeLike;
  const images: Record<string, string> = body.images ?? {};
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
      await client.query(upsert, [
        randomUUID(), treeName, 'tree_meta', tree.tree_id, version,
        JSON.stringify({ tree_id: tree.tree_id, tree_name: treeName, created_at: tree.created_at, updated_at: tree.updated_at }),
        null,
      ]);
      for (const node of tree.nodes ?? []) {
        await client.query(upsert, [randomUUID(), treeName, 'node', node['id'], version, JSON.stringify(node), null]);
      }
      for (const edge of tree.edges ?? []) {
        await client.query(upsert, [randomUUID(), treeName, 'edge', edge['id'], version, JSON.stringify(edge), null]);
      }
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
  } catch (err) {
    const mapped = mapPgError(err, conn);
    sendError(res, mapped.status, mapped.body);
  } finally {
    await pool.end();
  }
}

async function handleImport(req: VercelRequest, res: VercelResponse) {
  const body = req.body as { conn?: unknown; treeName?: unknown };
  if (!isConnPayload(body?.conn) || typeof body?.treeName !== 'string' || !body.treeName.trim()) {
    return sendError(res, 400, {
      code: 'INVALID_REQUEST',
      error: 'Body must include { conn: ConnPayload, treeName: string }.',
    });
  }
  const conn = body.conn as ConnPayload;
  const treeName = body.treeName;
  const pool = makePool(conn);
  const st = schemaTable(conn);
  try {
    const result = await pool.query(
      `SELECT record_type, record_id, payload, image_data FROM ${st} WHERE tree_name = $1 ORDER BY record_type`,
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
    res.json({ tree: { ...treeMeta, tree_name: treeName, nodes, edges, resources }, images });
  } catch (err) {
    const mapped = mapPgError(err, conn);
    sendError(res, mapped.status, mapped.body);
  } finally {
    await pool.end();
  }
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const body = req.body as { conn?: unknown; treeName?: unknown };
  if (!isConnPayload(body?.conn) || typeof body?.treeName !== 'string' || !body.treeName.trim()) {
    return sendError(res, 400, {
      code: 'INVALID_REQUEST',
      error: 'Body must include { conn: ConnPayload, treeName: string }.',
    });
  }
  const conn = body.conn as ConnPayload;
  const treeName = body.treeName;
  const pool = makePool(conn);
  const st = schemaTable(conn);
  try {
    const result = await pool.query(`DELETE FROM ${st} WHERE tree_name = $1`, [treeName]);
    res.json({ ok: true, rowsDeleted: result.rowCount });
  } catch (err) {
    const mapped = mapPgError(err, conn);
    sendError(res, mapped.status, mapped.body);
  } finally {
    await pool.end();
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Extract the sub-action from the original URL path, e.g. /api/pg-import → "import"
  const url = (req.url ?? '').split('?')[0];
  const action = url.replace(/^\/api\/pg-?/, '') || (req.body as Record<string, unknown>)?.action as string;

  if (req.method !== 'POST') {
    return sendError(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });
  }

  switch (action) {
    case 'test':   return handleTest(req, res);
    case 'list':   return handleList(req, res);
    case 'export': return handleExport(req, res);
    case 'import': return handleImport(req, res);
    case 'delete': return handleDelete(req, res);
    default:
      return sendError(res, 400, { code: 'UNKNOWN_ACTION', error: `Unknown pg action: "${action}".` });
  }
}

