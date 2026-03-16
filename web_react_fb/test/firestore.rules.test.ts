import * as fs from 'fs';
import * as path from 'path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

let testEnv;

describe('Firestore security rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-project',
      firestore: { rules: fs.readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8') },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('allows dev user to read and write users doc', async () => {
    // create a dev user
    const dev = testEnv.authenticatedContext('dev-uid', { uid: 'dev-uid' });
    const db = dev.firestore();
    const userRef = db.collection('users').doc('dev-uid');
    await assertSucceeds(userRef.set({ username: 'dev', role: 'dev' }));
    await assertSucceeds(userRef.get());
  });

  it('prevents anon from writing protected tree', async () => {
    const anon = testEnv.unauthenticatedContext();
    const db = anon.firestore();
    const treeRef = db.collection('trees').doc('test-tree');
    await assertFails(treeRef.set({ tree_name: 'hi', public: false }));
  });

  it('allows owner to write tree', async () => {
    const owner = testEnv.authenticatedContext('owner-uid', { uid: 'owner-uid' });
    const db = owner.firestore();
    const treeRef = db.collection('trees').doc('owner-tree');
    await assertSucceeds(treeRef.set({ tree_name: 'owner-tree', ownerUid: 'owner-uid', public: false }));
  });
});
