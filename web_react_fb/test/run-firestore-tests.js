const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Load CJS entry from rules-unit-testing
const r = require('../node_modules/@firebase/rules-unit-testing/dist/index.cjs.js');

async function run() {
  const rules = fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
  console.log('[test] Initializing test environment...');
  const testEnv = await r.initializeTestEnvironment({
    projectId: 'demo-project',
    firestore: { rules },
  });

  try {
    console.log('[test] Creating dev context...');
    const dev = testEnv.authenticatedContext('dev-uid', { uid: 'dev-uid' });
    const dbDev = dev.firestore();
    const userRef = dbDev.collection('users').doc('dev-uid');
    await r.assertSucceeds(userRef.set({ username: 'dev', role: 'dev' }));
    await r.assertSucceeds(userRef.get());
    console.log('[test] dev user read/write succeeded');

    console.log('[test] Testing anonymous write deny...');
    const anon = testEnv.unauthenticatedContext();
    const dbAnon = anon.firestore();
    const treeRef = dbAnon.collection('trees').doc('test-tree');
    try {
      await r.assertFails(treeRef.set({ tree_name: 'hi', public: false }));
      console.log('[test] anonymous write correctly denied');
    } catch (e) {
      console.error('[test] anonymous write test failed', e);
      throw e;
    }

    console.log('[test] Testing owner write succeed...');
    const owner = testEnv.authenticatedContext('owner-uid', { uid: 'owner-uid' });
    const dbOwner = owner.firestore();
    const ownerRef = dbOwner.collection('trees').doc('owner-tree');
    await r.assertSucceeds(ownerRef.set({ tree_name: 'owner-tree', ownerUid: 'owner-uid', public: false }));
    console.log('[test] owner write succeeded');

    console.log('[test] All rule checks passed');
    await testEnv.cleanup();
    process.exit(0);
  } catch (e) {
    console.error('[test] FAILURE', e);
    try { await testEnv.cleanup(); } catch {}
    process.exit(1);
  }
}

run();

