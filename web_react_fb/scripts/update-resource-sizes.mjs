#!/usr/bin/env node
/*
  scripts/update-resource-sizes.mjs

  Usage:
    node scripts/update-resource-sizes.mjs --project <projectId> [--dry-run] [--emulator]

  Description:
    Scans all documents in `trees/{folder}` and for each resource attempts to read
    the Storage object's metadata (size) and writes size into the resource entry
    on the tree doc: resources[i].size = <number>

    - Safe: runs in batches and supports --dry-run to only report changes.
    - Works with the Firebase Emulator Suite (use --emulator) or real project (service account)

  Requirements:
    - If connecting to a real project, set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON.
    - If using emulator, ensure FIRESTORE_EMULATOR_HOST and FIREBASE_STORAGE_EMULATOR_HOST are set
      (or run via `firebase emulators:exec 'node scripts/update-resource-sizes.mjs --emulator'`)

*/
import admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
function argVal(name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}
const dryRun = argv.includes('--dry-run');
const useEmulator = argv.includes('--emulator');
const projectId = argVal('--project') || process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'demo-project';

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || 'localhost:9199';
}

// Initialize admin SDK
if (!admin.apps.length) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !useEmulator) {
    admin.initializeApp({ projectId });
  } else {
    // For emulator or default application credentials
    admin.initializeApp({ projectId });
  }
}

const db = admin.firestore();
const storage = getStorage();

async function listTrees() {
  const snaps = await db.collection('trees').get();
  return snaps.docs.map((d) => ({ id: d.id, data: d.data() }));
}

async function getObjectSize(folderName, filename) {
  try {
    const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`);
    const file = bucket.file(`resources/${folderName}/${filename}`);
    const [meta] = await file.getMetadata();
    return parseInt(meta.size || '0', 10);
  } catch (e) {
    return null;
  }
}

async function run() {
  console.log('Project:', projectId, 'dryRun=', dryRun, 'useEmulator=', useEmulator);
  const trees = await listTrees();
  console.log('Found', trees.length, 'trees');
  let updated = 0;
  for (const t of trees) {
    const folder = t.id;
    const meta = t.data;
    const resources = meta?.resources ?? [];
    if (!Array.isArray(resources) || resources.length === 0) continue;
    const updates = [];
    for (const res of resources) {
      const filename = res.filename || res.filename?.toString();
      if (!filename) continue;
      const size = await getObjectSize(folder, filename);
      if (size === null) {
        console.log(`  [${folder}] resource ${res.id} (${filename}) -> metadata not found`);
        continue;
      }
      const prev = res.size ?? 0;
      if (prev !== size) {
        updates.push({ id: res.id, filename, size });
        console.log(`  [${folder}] resource ${res.id} (${filename}) size ${prev} -> ${size}`);
      }
    }
    if (updates.length > 0) {
      updated += updates.length;
      if (!dryRun) {
        // Apply transactionally: update the specific resources' size fields
        await db.runTransaction(async (tx) => {
          const ref = db.collection('trees').doc(folder);
          const snap = await tx.get(ref);
          if (!snap.exists) return;
          const data = snap.data() || {};
          const rs = (data.resources || []).map((r) => {
            const u = updates.find((x) => x.id === r.id);
            if (u) return { ...r, size: u.size };
            return r;
          });
          tx.update(ref, { resources: rs, lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp() });
        });
        console.log(`  [${folder}] wrote ${updates.length} size(s)`);
      } else {
        console.log(`  [${folder}] dry-run: would write ${updates.length} size(s)`);
      }
    }
  }
  console.log('Done. total updated resources:', updated);
}

run().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});

