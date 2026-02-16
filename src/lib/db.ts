import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    // SSL is configured in the connection string (sslmode=require)
});

export const db = {
    query: (text: string, params?: any[]) => pool.query(text, params),
};
