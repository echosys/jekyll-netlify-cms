import { Pool } from 'pg';

if (!process.env.POSTGRES_URL) {
    console.error("❌ ERROR: POSTGRES_URL environment variable is MISSING.");
    console.info("Please check your .env.local file. If you switched between Neon and Supabase, make sure the variable name is correct.");
}

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    // SSL is configured in the connection string (sslmode=require)
});

pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle database client', err);
});

export const db = {
    query: async (text: string, params?: any[]) => {
        if (!process.env.POSTGRES_URL) {
            throw new Error("Database connection URL is missing. Check your environment variables.");
        }
        return pool.query(text, params);
    },
};
