/**
 * fs-server.ts — Local dev filesystem API server.
 * Serves /api/fs/* routes to read/write FamilyTrees_react/ on disk.
 * Also serves /api/pg-* routes by importing and calling the same handler
 * functions used by Vercel serverless — so Postgres works locally too.
 * Run with: npx tsx api/fs-server.ts
 *
 * This is NOT deployed to Vercel. It runs alongside `vite dev` locally.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IncomingMessage, ServerResponse } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Load .env.local into process.env BEFORE importing any handlers ────────────
// This ensures MONGO_URI, VITE_PG_CONN etc. are available to all handlers
// that read process.env directly (mongo-helpers, pg-helpers, etc.)
const ENV_LOCAL_PATH = path.resolve(__dirname, '../.env.local');
(function loadEnvLocal() {
  try {
    const lines = fs.readFileSync(ENV_LOCAL_PATH, 'utf8').split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch { /* .env.local not found — ok in production */ }
})();

// ── Import the same pg handlers used by Vercel ────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import pgTest from './pg-test.js';
import pgList from './pg-list.js';
import pgExport from './pg-export.js';
import pgImport from './pg-import.js';
import pgDelete from './pg-delete.js';
import mongoLogin from './mongo-login.js';
import mongoLock from './mongo-lock.js';


const PORT = 3001;
// FamilyTrees_react/ lives at the workspace root (two levels up from web_react/api/)
const TREES_ROOT = path.resolve(__dirname, '../../FamilyTrees_react');

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function notFound(res: ServerResponse) {
  json(res, { error: 'Not found' }, 404);
}

// ── .env.local helpers ────────────────────────────────────────────────────────
// ENV_LOCAL_PATH is declared at the top of this file

/** Read all lines from .env.local, return as array */
function readEnvLines(): string[] {
  try { return fs.readFileSync(ENV_LOCAL_PATH, 'utf8').split('\n'); } catch { return []; }
}

/** Set a key=value in .env.local (upsert) */
function setEnvVar(key: string, value: string): void {
  const lines = readEnvLines();
  const idx = lines.findIndex((l) => l.startsWith(key + '=') || l.startsWith('# ' + key + '='));
  const newLine = `${key}=${value}`;
  if (idx >= 0) lines[idx] = newLine;
  else lines.push(newLine);
  fs.writeFileSync(ENV_LOCAL_PATH, lines.join('\n'), 'utf8');
}

/** Get a value from .env.local (or process.env fallback) */
function getEnvVar(key: string): string {
  for (const line of readEnvLines()) {
    const trimmed = line.trim();
    if (trimmed.startsWith(key + '=')) return trimmed.slice(key.length + 1);
  }
  return process.env[key] ?? '';
}

/** Handle GET /api/fs/user-conn — return VITE_PG_CONN for authenticated "user" role (no passphrase needed) */
function handleUserConn(res: ServerResponse): void {
  const conn = getEnvVar('VITE_PG_CONN') || process.env['VITE_PG_CONN'] || '';
  if (!conn) { json(res, { error: 'No PG connection configured on this server.' }, 404); return; }
  const pgSsl = getEnvVar('VITE_PG_SSL') || process.env['VITE_PG_SSL'] || '';
  json(res, { conn, pgSsl });
}

/** Handle GET /api/fs/health — check MongoDB and PostgreSQL connectivity for login page status */
async function handleHealth(res: ServerResponse): Promise<void> {
  const result: { mongo: 'ok' | 'error' | 'unconfigured'; pg: 'ok' | 'error' | 'unconfigured'; mongoError?: string; pgError?: string } = {
    mongo: 'unconfigured',
    pg: 'unconfigured',
  };

  // Check MongoDB
  const mongoUri = getEnvVar('MONGO_URI') || process.env['MONGO_URI'] || '';
  if (mongoUri) {
    try {
      const { MongoClient } = await import('mongodb');
      const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 4000, connectTimeoutMS: 4000 });
      await client.connect();
      const dbName = new URL(mongoUri).pathname.replace(/^\//, '') || 'admin';
      await client.db(dbName).command({ ping: 1 });
      await client.close();
      result.mongo = 'ok';
    } catch (e: unknown) {
      result.mongo = 'error';
      result.mongoError = e instanceof Error ? e.message : String(e);
    }
  }

  // Check PostgreSQL (parse VITE_PG_CONN)
  const pgConn = getEnvVar('VITE_PG_CONN') || process.env['VITE_PG_CONN'] || '';
  if (pgConn) {
    try {
      const { Pool } = await import('pg');
      const url = new URL(pgConn);
      const pgSslEnv = (getEnvVar('VITE_PG_SSL') || process.env['VITE_PG_SSL'] || '').toLowerCase();
      const sslDisabled = pgSslEnv === 'no' || pgSslEnv === 'disable' || pgSslEnv === 'false' || pgSslEnv === '0';
      const sslRequired = pgSslEnv === 'require' || pgSslEnv === 'yes' || pgSslEnv === 'true' || pgSslEnv === '1';
      const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      // omit ssl key entirely when disabled — passing ssl:false can still negotiate in some pg versions
      const sslValue = sslDisabled ? undefined : sslRequired ? { rejectUnauthorized: false } : isLocal ? undefined : { rejectUnauthorized: false };
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

  json(res, result);
}

/** Handle GET /api/fs/dev-conn — return plain conn string if passphrase matches (base64 compare) */
function handleDevConnGet(res: ServerResponse, passphrase: string): void {
  // VITE_DEV_PHRASE is stored as base64 in .env.local; decode and compare
  const storedB64 = getEnvVar('VITE_DEV_PHRASE')
    || getEnvVar('VITE_DEV_PASSPHRASE')
    || process.env['VITE_DEV_PHRASE']
    || process.env['VITE_DEV_PASSPHRASE']
    || '';
  if (!storedB64) { json(res, { error: 'No DEV passphrase configured.' }, 403); return; }
  let storedPlain = '';
  try { storedPlain = Buffer.from(storedB64, 'base64').toString('utf8'); } catch {}
  if (passphrase !== storedPlain) {
    json(res, { error: 'Incorrect passphrase.' }, 403); return;
  }
  // VITE_PG_CONN is stored as plain text
  const conn = getEnvVar('VITE_PG_CONN') || process.env['VITE_PG_CONN'] || '';
  json(res, { conn });
}

/** Handle POST /api/fs/dev-conn — save passphrase as base64 + plain conn string */
async function handleDevConnPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  let data: any = {};
  try { data = JSON.parse(body); } catch {}
  const { passphrase, conn: connString } = data;
  if (!passphrase) { json(res, { error: 'passphrase required' }, 400); return; }
  // Store passphrase as base64
  const b64 = Buffer.from(passphrase, 'utf8').toString('base64');
  setEnvVar('VITE_DEV_PHRASE', b64);
  setEnvVar('VITE_DEV_PASSPHRASE', b64);
  if (connString) setEnvVar('VITE_PG_CONN', connString);
  json(res, { ok: true });
}

/** Handle GET /api/fs/dev-conn-has — check if a passphrase + conn are configured */
function handleDevConnHas(res: ServerResponse): void {
  const storedB64 = getEnvVar('VITE_DEV_PHRASE')
    || getEnvVar('VITE_DEV_PASSPHRASE')
    || process.env['VITE_DEV_PHRASE']
    || process.env['VITE_DEV_PASSPHRASE']
    || '';
  const hasConn = !!(getEnvVar('VITE_PG_CONN') || process.env['VITE_PG_CONN']);
  json(res, { hasPassphrase: !!storedB64, hasConn });
}

// ── Route handlers ────────────────────────────────────────────────────────────

function handleList(res: ServerResponse) {
  ensureDir(TREES_ROOT);
  const entries = fs.readdirSync(TREES_ROOT, { withFileTypes: true });
  const trees = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const treePath = path.join(TREES_ROOT, e.name, 'tree.json');
      try {
        const raw = fs.readFileSync(treePath, 'utf8');
        const data = JSON.parse(raw);
        return { folderName: e.name, treeName: data.tree_name ?? e.name };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  json(res, trees);
}

function handleGetTree(res: ServerResponse, folderName: string) {
  const treePath = path.join(TREES_ROOT, folderName, 'tree.json');
  if (!fs.existsSync(treePath)) return notFound(res);
  const raw = fs.readFileSync(treePath, 'utf8');
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(raw);
}

async function handlePutTree(req: IncomingMessage, res: ServerResponse, folderName: string) {
  const body = await readBody(req);
  const dir = path.join(TREES_ROOT, folderName);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'tree.json'), body, 'utf8');
  json(res, { ok: true });
}

async function handlePostTree(req: IncomingMessage, res: ServerResponse, folderName: string) {
  const body = await readBody(req);
  const dir = path.join(TREES_ROOT, folderName);
  const treePath = path.join(dir, 'tree.json');
  if (fs.existsSync(treePath)) {
    return json(res, { error: `Folder "${folderName}" already exists.` }, 409);
  }
  ensureDir(path.join(dir, 'resources'));
  fs.writeFileSync(treePath, body, 'utf8');
  json(res, { ok: true });
}

function handleDeleteTree(res: ServerResponse, folderName: string) {
  const dir = path.join(TREES_ROOT, folderName);
  if (!fs.existsSync(dir)) return notFound(res);
  fs.rmSync(dir, { recursive: true, force: true });
  json(res, { ok: true });
}

function handleGetImage(res: ServerResponse, folderName: string, filename: string) {
  const imgPath = path.join(TREES_ROOT, folderName, 'resources', filename);
  if (!fs.existsSync(imgPath)) return notFound(res);
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  const mime = mimeMap[ext] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
  fs.createReadStream(imgPath).pipe(res);
}

async function handlePutImage(req: IncomingMessage, res: ServerResponse, folderName: string, filename: string) {
  const resDir = path.join(TREES_ROOT, folderName, 'resources');
  ensureDir(resDir);

  // Parse multipart/form-data (just extract the raw bytes after the boundary)
  const contentType = req.headers['content-type'] ?? '';
  if (contentType.includes('multipart/form-data')) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const buf = Buffer.concat(chunks);
    const boundary = '--' + contentType.split('boundary=')[1];
    const start = buf.indexOf('\r\n\r\n', buf.indexOf(boundary)) + 4;
    const end = buf.lastIndexOf('\r\n--' + contentType.split('boundary=')[1]);
    const imageBytes = buf.slice(start, end);
    fs.writeFileSync(path.join(resDir, filename), imageBytes);
  } else {
    // Raw bytes
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    fs.writeFileSync(path.join(resDir, filename), Buffer.concat(chunks));
  }
  json(res, { ok: true });
}

function handleDeleteImage(res: ServerResponse, folderName: string, filename: string) {
  const imgPath = path.join(TREES_ROOT, folderName, 'resources', filename);
  if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  json(res, { ok: true });
}

function getDirSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) total += getDirSize(full);
    else total += fs.statSync(full).size;
  }
  return total;
}

function handleStorageSize(res: ServerResponse) {
  ensureDir(TREES_ROOT);
  const entries = fs.readdirSync(TREES_ROOT, { withFileTypes: true });
  const trees: { folderName: string; treeName: string; jsonBytes: number; imageBytes: number; totalBytes: number }[] = [];

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const treePath = path.join(TREES_ROOT, e.name, 'tree.json');
    let treeName = e.name;
    let jsonBytes = 0;
    try {
      const raw = fs.readFileSync(treePath, 'utf8');
      jsonBytes = Buffer.byteLength(raw, 'utf8');
      treeName = JSON.parse(raw).tree_name ?? e.name;
    } catch {}
    const imageBytes = getDirSize(path.join(TREES_ROOT, e.name, 'resources'));
    trees.push({ folderName: e.name, treeName, jsonBytes, imageBytes, totalBytes: jsonBytes + imageBytes });
  }

  const totalBytes = trees.reduce((s, t) => s + t.totalBytes, 0);
  json(res, { mode: 'filesystem', totalBytes, trees });
}

// ── Vercel handler adapter ────────────────────────────────────────────────────
// Wraps a Vercel-style handler (req: VercelRequest, res: VercelResponse) so it
// can be called with a plain Node.js IncomingMessage / ServerResponse.
// We only need the subset used by our pg-* handlers: req.method, req.body, res.json, res.status.

async function callVercelHandler(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<VercelResponse | void>,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const bodyText = await readBody(req);
  let body: any = {};
  try { body = JSON.parse(bodyText); } catch { /* empty body */ }

  let statusCode = 200;
  let responded = false;

  const vercelReq = {
    method: req.method,
    body,
    headers: req.headers,
    query: {},
  } as unknown as VercelRequest;

  const vercelRes = {
    statusCode,
    status(code: number) { statusCode = code; return vercelRes; },
    json(data: unknown) {
      if (responded) return vercelRes;
      responded = true;
      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(data));
      return vercelRes;
    },
  } as unknown as VercelResponse;

  // Safety timeout: if the handler never calls res.json() (e.g. DB connection hangs),
  // send an error after 12 s so Vite proxy doesn't get "socket hang up".
  const timeout = setTimeout(() => {
    if (!responded) {
      responded = true;
      res.writeHead(504, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Handler timed out — database did not respond within 12 s. Check host/port and that PostgreSQL is reachable.' }));
    }
  }, 12_000);

  try {
    await handler(vercelReq, vercelRes);
  } catch (err: any) {
    if (!responded) {
      responded = true;
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: err.message ?? 'Internal server error' }));
    }
  } finally {
    clearTimeout(timeout);
  }
}

// ── Main server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  try {
    // GET /api/fs/list
    if (url === '/api/fs/list' && method === 'GET') return handleList(res);

    // GET /api/fs/storage-size
    if (url === '/api/fs/storage-size' && method === 'GET') return handleStorageSize(res);

    // DEV connection string endpoints
    if (url === '/api/fs/dev-conn-has' && method === 'GET') return handleDevConnHas(res);
    if (url === '/api/fs/user-conn' && method === 'GET') return handleUserConn(res);
    if (url === '/api/fs/health' && method === 'GET') return handleHealth(res);
    if (url === '/api/health'    && method === 'GET') return handleHealth(res);  // mirrors Vercel /api/health
    if (method === 'GET' && url.startsWith('/api/fs/dev-conn?')) {
      const params = new URLSearchParams(url.split('?')[1] ?? '');
      return handleDevConnGet(res, params.get('h') ?? '');
    }
    if (url === '/api/fs/dev-conn' && method === 'POST') return handleDevConnPost(req, res);

    // /api/fs/tree/:folderName
    const treeMatch = url.match(/^\/api\/fs\/tree\/([^/]+)$/);
    if (treeMatch) {
      const folder = decodeURIComponent(treeMatch[1]);
      if (method === 'GET')    return handleGetTree(res, folder);
      if (method === 'PUT')    return handlePutTree(req, res, folder);
      if (method === 'POST')   return handlePostTree(req, res, folder);
      if (method === 'DELETE') return handleDeleteTree(res, folder);
    }

    // /api/fs/image/:folderName/:filename
    const imgMatch = url.match(/^\/api\/fs\/image\/([^/]+)\/(.+)$/);
    if (imgMatch) {
      const folder = decodeURIComponent(imgMatch[1]);
      const file = decodeURIComponent(imgMatch[2]);
      if (method === 'GET')    return handleGetImage(res, folder, file);
      if (method === 'PUT')    return handlePutImage(req, res, folder, file);
      if (method === 'DELETE') return handleDeleteImage(res, folder, file);
    }

    // /api/pg-* — delegate to the same Vercel handlers
    if (url === '/api/pg-test')   return callVercelHandler(pgTest, req, res);
    if (url === '/api/pg-list')   return callVercelHandler(pgList, req, res);
    if (url === '/api/pg-export') return callVercelHandler(pgExport, req, res);
    if (url === '/api/pg-import') return callVercelHandler(pgImport, req, res);
    if (url === '/api/pg-delete') return callVercelHandler(pgDelete, req, res);

    // /api/mongo-* — MongoDB auth + lock handlers
    if (url === '/api/mongo-login') return callVercelHandler(mongoLogin, req, res);
    if (url === '/api/mongo-lock')  return callVercelHandler(mongoLock, req, res);

    notFound(res);
  } catch (err: any) {
    json(res, { error: err.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`📁 Filesystem API server running at http://localhost:${PORT}`);
  console.log(`   Serving trees from: ${TREES_ROOT}`);
});

