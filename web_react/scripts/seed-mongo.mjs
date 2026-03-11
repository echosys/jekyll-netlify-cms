// seed-mongo.mjs — seeds famt_login db with test users
// Run: node scripts/seed-mongo.mjs
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read MONGO_URI from .env.local
let MONGO_URI = process.env.MONGO_URI ?? '';
if (!MONGO_URI) {
  const envPath = path.resolve(__dirname, '../.env.local');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (t.startsWith('MONGO_URI=')) { MONGO_URI = t.slice('MONGO_URI='.length); break; }
  }
}

if (!MONGO_URI) { console.error('No MONGO_URI found in .env.local'); process.exit(1); }

console.log('Connecting to:', MONGO_URI.replace(/:[^:@]+@/, ':***@'));

const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 6000 });
try {
  await client.connect();
  const db = client.db('famt_login');

  await db.command({ ping: 1 });
  console.log('✅ Ping OK');

  const col = db.collection('famt_login');
  await col.createIndex({ username: 1 }, { unique: true });
  await col.deleteMany({});
  await col.insertMany([
    { username: 'alice', phrase: 'mydevphrase',   role: 'dev',  color: '#1E88E5', lastActivity: 0 },
    { username: 'bob',   phrase: 'bobuserphrase', role: 'user', color: '#43A047', lastActivity: 0 },
  ]);
  console.log('✅ Users inserted: alice (dev), bob (user)');

  const lockCol = db.collection('famt_lock');
  await lockCol.deleteMany({});
  await lockCol.insertOne({ _id: 'global', holder: null, holderActivity: 0 });
  console.log('✅ Lock doc inserted');

  const users = await col.find({}, { projection: { phrase: 0 } }).toArray();
  console.log('Users in DB:', JSON.stringify(users, null, 2));

} catch (e) {
  console.error('❌ Error:', e.message);
  process.exit(1);
} finally {
  await client.close();
}

