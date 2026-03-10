/**
 * pg-test.ts — Vercel serverless function: test a PostgreSQL connection.
 * POST /api/pg-test  { ConnPayload }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { makePool, ConnPayload } from './pg-helpers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const conn: ConnPayload = req.body;
  const pool = makePool(conn);
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ ok: true });
  } catch (err: any) {
    // Map pg / Node.js error codes to human-readable messages
    const code: string = err.code ?? '';
    let hint = '';
    if (code === '28P01' || code === '28000') hint = 'Authentication failed — wrong username or credphrase.';
    else if (code === '3D000') hint = `Database "${conn.dbname}" does not exist on this server.`;
    else if (code === 'ECONNREFUSED') hint = `Connection refused — is PostgreSQL running at ${conn.host}:${conn.port}?`;
    else if (code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') hint = `Cannot reach "${conn.host}" — check the host name/IP, port, and firewall rules.`;
    else if (code === '42501') hint = 'Permission denied — this user lacks required privileges.';
    else if (err.message?.includes('SSL') || err.message?.includes('ssl')) hint = `SSL error: ${err.message} — try setting SSL Mode to "Disable SSL" in the connection form.`;
    else if (err.message?.includes('timeout')) hint = `Connection timed out after 10 s — is "${conn.host}:${conn.port}" reachable?`;
    const message = hint || err.message || `Unknown error (pg code: ${code || 'none'})`;
    res.status(400).json({ error: message, code, detail: err.detail ?? null });
  } finally {
    await pool.end();
  }
}
