#!/usr/bin/env node
// scripts/seed-emulator.mjs — seed the Realtime Database emulator with a test tree and a base64 image
import admin from 'firebase-admin';

const projectId = process.env.FIREBASE_PROJECT || process.env.GCLOUD_PROJECT || 'demo-project';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';

console.log('Using emulator:', process.env.FIREBASE_DATABASE_EMULATOR_HOST);

if (!admin.apps.length) admin.initializeApp({
  projectId,
  databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`
});
const db = admin.database();

async function run() {
  const folder = 'test-tree-1';
  const resourceId = 'res1';
  const filename = 'a.jpg';

  console.log('Seeding Realtime Database...');

  // 1. Create the tree data
  const tree = {
    tree_id: 'test-tree-id-1',
    tree_name: 'Test Tree 1',
    version: '1.0',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    nodes: [],
    edges: [],
    resources: [{ id: resourceId, filename, original_filename: filename, tags: { persons: [], date: null, location: null, gps: null, custom_tags: [] }, regions: [] }],
  };

  // 2. Create a dummy base64 image
  const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='; // 1x1 transparent PNG

  // 3. Write to RTDB
  const treeRef = db.ref(`trees/${folder}`);
  await treeRef.set({
    tree_name: tree.tree_name,
    public: true,
    data: tree,
    resources: tree.resources,
    lastUpdatedAt: Date.now(),
    images: {
      [resourceId]: {
        filename,
        data: base64Image,
        contentType: 'image/png',
        size: base64Image.length,
        createdAt: Date.now()
      }
    }
  });

  console.log('Wrote tree and image to RTDB:', folder);

  // Read back
  const snap = await treeRef.once('value');
  console.log('Tree exists=', snap.exists(), 'treeName=', snap.val()?.tree_name);
}

run().catch((e) => { console.error(e); process.exit(1); });

