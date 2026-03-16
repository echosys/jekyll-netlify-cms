#!/usr/bin/env node
// scripts/create-emulator-user.mjs
// Usage:
//   node scripts/create-emulator-user.mjs --uid <uid> --email <email> --password <password> --username <username> --role <role>
import admin from 'firebase-admin';

const argv = process.argv.slice(2);
function argVal(name) {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  return argv[i+1] ?? null;
}
const uid = argVal('--uid') || `user-${Date.now()}`;
const email = argVal('--email') || `${uid}@example.local`;
const password = argVal('--password') || 'devpass';
const username = argVal('--username') || email.split('@')[0];
const role = argVal('--role') || 'user';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-project' });

(async () => {
  try {
    // Create auth user (if already exists, update password/email)
    try {
      await admin.auth().getUser(uid);
      console.log('Auth user exists, updating...');
      await admin.auth().updateUser(uid, { email, password });
    } catch (e) {
      console.log('Creating auth user...', uid);
      await admin.auth().createUser({ uid, email, password });
    }

    // Create the profile doc
    const db = admin.firestore();
    await db.collection('users').doc(uid).set({
      username,
      email,
      role,
      displayName: username,
      avatarColor: '#888',
      allowed_trees: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Also set a custom claim on the auth user in the emulator so rules can use request.auth.token.role
    try {
      await admin.auth().setCustomUserClaims(uid, { role });
      console.log('Set custom claim role=%s for %s', role, uid);
    } catch (e) {
      console.warn('Failed to set custom claims for', uid, e);
    }

    console.log('Created profile user doc for', uid);
    process.exit(0);
  } catch (err) {
    console.error('Error creating emulator user:', err);
    process.exit(1);
  }
})();

