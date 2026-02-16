import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const { Pool } = pg;

dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
        rejectUnauthorized: false
    },
});

async function init() {
    console.log('🚀 Initializing database...');
    const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf8');

    try {
        await pool.query(schema);
        console.log('✅ Success! The "posts" table has been created.');
    } catch (err) {
        console.error('❌ Error creating table:', err);
    } finally {
        await pool.end();
    }
}

init();
