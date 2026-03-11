/**
 * health.ts — GET /api/health
 * Returns MongoDB and PostgreSQL connectivity status for the login page.
 * Deployed as a Vercel serverless function (replaces the local-only /api/fs/health).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMongoDb, getMongoUri } from './mongo-helpers.js';

type Status = 'ok' | 'error' | 'unconfigured';
interface HealthResult {
  mongo: Status;
  pg: Status;
  mongoError?: string;
  pgError?: string;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const result: HealthResult = { mongo: 'unconfigured', pg: 'unconfigured' };

  // ── MongoDB ──────────────────────────────────────────────────────────────
  const mongoUri = getMongoUri();
  if (mongoUri) {
    try {
      const db = await getMongoDb();
      await db.command({ ping: 1 });
      result.mongo = 'ok';
    } catch (e: unknown) {
      result.mongo = 'error';
      result.mongoError = e instanceof Error ? e.message : String(e);
    }
  }

  // ── PostgreSQL ───────────────────────────────────────────────────────────
  const pgConn = process.env['VITE_PG_CONN'] ?? '';
  if (pgConn) {
    try {
      const { Pool } = await import('pg');
      const url = new URL(pgConn);
      const pgSslEnv = (process.env['VITE_PG_SSL'] ?? '').toLowerCase();
      const sslDisabled = ['no', 'disable', 'false', '0'].includes(pgSslEnv);
      const sslRequired = ['require', 'yes', 'true', '1'].includes(pgSslEnv);
      const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      const sslValue = sslDisabled ? undefined
        : sslRequired ? { rejectUnauthorized: false }
        : isLocal    ? undefined
        : { rejectUnauthorized: false };

      const pool = new Pool({
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.replace(/^\//, ''),
        user: url.username,
        password: decodeURIComponent(url.password),
        max: 1,
        connectionTimeoutMillis: 4000,
        ...(sslValue !== undefined ? { ssl: sslValue } : {}),
      });
      const client = await pool.connect();
      client.release();
      await pool.end();
      result.pg = 'ok';
    } catch (e: unknown) {
      result.pg = 'error';
      result.pgError = e instanceof Error ? e.message : String(e);
    }
  }

  return res.status(200).json(result);
}

