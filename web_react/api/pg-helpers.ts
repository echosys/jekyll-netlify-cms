/**
 * pg-helpers.ts
 */
import { Pool, PoolConfig } from 'pg';

export interface ConnPayload {
  host: string;
  port: number;
  dbname: string;
  user: string;
  credphrase: string;
  sslMode?: 'auto' | 'require' | 'disable';
  schema?: string;
  table?: string;
}

export function makePool(conn: ConnPayload): Pool {
  const sslMode = conn.sslMode ?? 'auto';
  let ssl: PoolConfig['ssl'];
  if (sslMode === 'disable') {
    ssl = false;
  } else if (sslMode === 'require') {
    ssl = { rejectUnauthorized: false };
  } else {
    const isLocal = conn.host === 'localhost' || conn.host === '127.0.0.1';
    ssl = isLocal ? false : { rejectUnauthorized: false };
  }
  const config: PoolConfig = {
    host: conn.host,
    port: conn.port,
    database: conn.dbname,
    user: conn.user,
    ['password']: conn.credphrase,
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    ssl,
  };
  return new Pool(config);
}

export function schemaTable(conn: ConnPayload): string {
  const schema = conn.schema ?? 'public';
  const table = conn.table ?? 'family_trees';
  return `"${schema}"."${table}"`;
}

export interface ApiErrorBody {
  error: string;
  code: string;
  detail?: unknown;
  hint?: string;
}

export function sendError(
  res: { status: (code: number) => { json: (body: ApiErrorBody) => void } },
  status: number,
  body: ApiErrorBody,
): void {
  res.status(status).json(body);
}

export function isConnPayload(value: unknown): value is ConnPayload {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.host === 'string' &&
    typeof c.port === 'number' &&
    typeof c.dbname === 'string' &&
    typeof c.user === 'string' &&
    typeof c.credphrase === 'string'
  );
}

interface NormalizedError {
  code: string;
  message: string;
  detail: unknown;
}

function normalizeError(err: unknown): NormalizedError {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown; detail?: unknown };
    return {
      code: typeof e.code === 'string' ? e.code : 'UNKNOWN',
      message: typeof e.message === 'string' ? e.message : 'Unknown server error',
      detail: e.detail ?? null,
    };
  }
  if (typeof err === 'string') {
    return { code: 'UNKNOWN', message: err, detail: null };
  }
  return { code: 'UNKNOWN', message: 'Unknown server error', detail: null };
}

export function mapPgError(err: unknown, conn?: Partial<ConnPayload>): { status: number; body: ApiErrorBody } {
  const normalized = normalizeError(err);
  const code = normalized.code;
  const message = normalized.message;
  const detail = normalized.detail;

  if (code === '28P01' || code === '28000') {
    return { status: 401, body: { code, error: 'Authentication failed.', detail, hint: 'Verify username and password.' } };
  }
  if (code === '3D000') {
    return { status: 404, body: { code, error: `Database "${conn?.dbname ?? ''}" does not exist.`, detail } };
  }
  if (code === '42P01') {
    const st = `${conn?.schema ?? 'public'}.${conn?.table ?? 'family_trees'}`;
    return { status: 404, body: { code, error: `Table "${st}" was not found.`, detail, hint: 'Apply schema.sql and verify schema/table names.' } };
  }
  if (code === '42501') {
    return { status: 403, body: { code, error: 'Permission denied for this operation.', detail, hint: 'Grant SELECT/INSERT/UPDATE/DELETE on target table.' } };
  }
  if (code === 'ECONNREFUSED') {
    return {
      status: 503,
      body: {
        code,
        error: `Connection refused at ${conn?.host ?? 'host'}:${conn?.port ?? 'port'}.`,
        detail,
        hint: 'Check DB host/port, firewall, and cloud allowlist.',
      },
    };
  }
  if (code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return {
      status: 503,
      body: {
        code,
        error: `Cannot reach ${conn?.host ?? 'database host'}.`,
        detail,
        hint: 'Validate DNS, network route, and provider access rules.',
      },
    };
  }
  if (message.toLowerCase().includes('ssl')) {
    return {
      status: 400,
      body: {
        code: code || 'SSL_ERROR',
        error: 'SSL/TLS negotiation failed.',
        detail,
        hint: 'Try sslMode=require or disable based on your provider settings.',
      },
    };
  }

  return {
    status: 500,
    body: {
      code: code || 'INTERNAL_ERROR',
      error: message,
      detail,
      hint: 'Check server logs for stack trace and SQL context.',
    },
  };
}
