#!/usr/bin/env node
// scripts/seed-users.mjs — create demo users in the Realtime Database emulator users node
import admin from 'firebase-admin';

const projectId = process.argv[2] || process.env.GCLOUD_PROJECT || 'demo-project';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';

if (!admin.apps.length) admin.initializeApp({
  projectId,
  databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`
});
const db = admin.database();

async function run() {
  const users = [
    { uid: 'dev-uid', username: 'dev', phrase: 'devpass', role: 'dev', displayName: 'Developer', avatarColor: '#f44336', allowed_trees: ['test-tree-1'] },
    { uid: 'user-uid', username: 'alice', phrase: 'alicepass', role: 'user', displayName: 'Alice', avatarColor: '#2196F3', allowed_trees: ['test-tree-1'] },
  ];

  for (const u of users) {
    await db.ref(`users_famt/${u.uid}`).set({
      username: u.username,
      phrase: u.phrase,
      role: u.role,
      displayName: u.displayName,
      avatarColor: u.avatarColor,
      allowed_trees: u.allowed_trees
    });
    console.log('Wrote user to RTDB:', u.username);
  }
  console.log('Seed users complete');
}

run().catch((e) => { console.error(e); process.exit(1); });

