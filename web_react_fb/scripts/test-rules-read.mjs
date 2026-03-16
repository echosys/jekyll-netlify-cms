#!/usr/bin/env node
import admin from 'firebase-admin';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-project' });
const db = admin.firestore();
(async ()=>{
  try {
    const u=await db.collection('users').get();
    console.log('users count', u.size);
    u.forEach(d=>console.log(' user', d.id, JSON.stringify(d.data())));
    const t=await db.collection('trees').get();
    console.log('trees count', t.size);
    t.forEach(d=>console.log(' tree', d.id, Object.keys(d.data())));
  }catch(e){ console.error('err',e); process.exit(1); }
})();

