# Auth & Roles (dev ↔ prod parity)

Date: 260313 (2026-03-13)

This document describes the recommended production-friendly authentication and role workflow, plus exact commands to seed the Auth emulator and create user profile docs. The goal: identical behavior in emulator and production, with secure role promotion.

Summary
- Use Firebase Auth for authentication (email/password or provider).
- Keep a small `users_famt/{uid}` profile in RTDB for per-user metadata (role, allowed_trees, avatarColor).
- Clients sign up with Auth and create their own `users_famt/{uid}` profile (role defaults to `user`).
- Admins promote users to `dev` using Admin SDK or Firebase Console. This action sets `users_famt/{uid}.role = 'dev'`.
- Realtime Database security rules prevent clients from setting their own role to `dev`.

Doc: why profile doc + optional custom claim
- Profile node (`users_famt/{uid}`): stores larger metadata (allowed_trees array, avatarColor). Clients can read their own data after Auth sign-in. This is flexible and easy to manage.
- Recommended: use the RTDB profile for all metadata.

Security rules
- `firestore.rules` is production-safe and enforces:
  - `users/{uid}` can be created by the user themselves (only with `role: 'user'`).
  - Users may update only their own profile and may not change `role`. Admin/dev can change `role`.
  - `trees/{treeId}` reads/writes are governed by owner/allowed_uids/public/dev checks.

Emulator: create user & profile steps
1) Start emulators:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
unset NODE_OPTIONS
npx firebase emulators:start --only auth,database --project demo-project
```

2) Create an auth user (two ways):
- UI way: open Emulator UI at http://localhost:4000 → Authentication → Create user (email/password)
- CLI way (script):

```bash
node scripts/create-emulator-user.mjs \
  --uid 9kHcA7EimtgSbRkpljubMZO069HW \
  --email "dev@example.local" \
  --password "devpass" \
  --username "dev" \
  --role "dev"
```

`create-emulator-user.mjs` will create the Auth user and write `users_famt/{uid}` profile with role `dev` (for local testing). In production you must promote via Admin Console or Admin SDK.

3) Optionally set a custom claim for faster rule checking (Admin SDK required):

```bash
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
node -e "const admin=require('firebase-admin'); admin.initializeApp({projectId:'demo-project'}); (async()=>{ await admin.auth().setCustomUserClaims('9kHcA7EimtgSbRkpljubMZO069HW',{role:'dev'}); console.log('custom claim set'); })().catch(console.error)"
```

In production, run the same Admin SDK command with service account credentials.

Client-side sign-up
- Create account using `createUserWithEmailAndPassword`.
- After sign-in, write a minimal profile at `users_famt/{uid}` with `role: 'user'`, e.g.:

```ts
await createUserWithEmailAndPassword(auth, email, pass);
const db = getDatabase();
await set(ref(db, `users_famt/${uid}`), { username, email, role:'user', allowed_trees: [] });
```

Admin promotion (production)
- Use Firebase Console or Admin SDK to update `users_famt/{uid}.role = 'dev'`.

Notes
- Clients are prevented by rules from setting `role` to `dev`.
- Use the Emulator UI or Admin SDK to promote in dev; use Admin Console or Admin SDK in prod.


