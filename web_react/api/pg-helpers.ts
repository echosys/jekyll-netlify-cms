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
