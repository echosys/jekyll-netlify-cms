import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const endpoint = 'ep-snowy-hall-airij5ix';
const user = process.env.DATABASE_USER || 'koyeb-adm';
const password = process.env.DATABASE_PASSWORD || 'npg_2HW6esLEqVzr';
const host = process.env.DATABASE_HOST || 'ep-snowy-hall-airij5ix.c-4.us-east-1.pg.koyeb.app';
const dbName = process.env.DATABASE_NAME || 'koyebdb';

console.log('--- Debugging Credentials ---');
console.log(`User: '${user}' (Length: ${user.length})`);
console.log(`Pass: '${password.substring(0, 3)}...${password.slice(-3)}' (Length: ${password.length})`); // Check for hidden spaces
console.log(`Host: '${host}'`);
console.log(`DB:   '${dbName}'`);
console.log('-----------------------------\n');

async function runTest(name, url) {
    console.log(`Testing: ${name}`);
    console.log(`URL: ${url.replace(password, '****')}`); // Mask password

    const sql = postgres(url, {
        ssl: 'require',
        connect_timeout: 10
    });

    try {
        const result = await sql`SELECT version()`;
        console.log(`✅ SUCCESS! Connected to ${name}`);
        console.log('Version:', result[0].version);
        return true;
    } catch (err) {
        console.error(`❌ FAILED: ${err.message}`);
        if (err.code) console.error(`   Code: ${err.code} (${err.code === '28P01' ? 'Password Auth Failed' : 'Other'})`);
        return false;
    } finally {
        await sql.end();
    }
}

async function start() {
    // 1. Correct Endpoint Option
    await runTest(
        'Standard (endpoint option)',
        `postgres://${user}:${password}@${host}/${dbName}?options=endpoint%3D${endpoint}`
    );

    // 2. Legacy Project Option (just in case)
    await runTest(
        'Legacy (project option)',
        `postgres://${user}:${password}@${host}/${dbName}?options=project%3D${endpoint}`
    );

    // 3. Try 'postgres' default DB (rule out DB does not exist issue masquerading as auth)
    await runTest(
        'Default DB (postgres)',
        `postgres://${user}:${password}@${host}/postgres?options=endpoint%3D${endpoint}`
    );
}

start();
