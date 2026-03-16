
# Run Locally (emulator + dev server)

Date: 260313 (2026-03-13)

This guide shows how to run FamTree locally using the Firebase Emulator Suite and the Vite dev server. It seeds a demo tree and two users (developer and normal user) for quick testing. It also explains how to persist emulator state between runs via export/import.

Prerequisites
- Node.js >= 21
- Java 21 (required by Firebase emulators)
- Firebase CLI (npm install -g firebase-tools) — used to run emulators
- If your network is behind a corporate proxy, either configure HTTP_PROXY/HTTPS_PROXY or manually download emulator artifacts and place them in the firebase cache (see notes below).

Quick steps (copy/paste)

0) Install project dependencies (first time)

```bash
# from repo root
npm install
```

1) Ensure Java 21 is active

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
java -version
```

2) Copy example env and edit if needed

```bash
cp .env.local.example .env.local
# (optional) edit .env.local if you use non-default emulator ports or different project id
```

3) (If needed) place emulator artifacts into the Firebase CLI cache to avoid network downloads

If your environment blocks the emulator JAR/ZIP downloads (corporate proxy), download the following files with your browser and copy them into the Firebase CLI cache:

 - cloud-firestore-emulator-v1.20.2.jar
 - cloud-storage-rules-runtime-v1.1.3.jar
 - ui-v1.15.0.zip

Copy them to one of these locations (examples):

```bash
mkdir -p ~/.cache/firebase/emulators
cp ~/Downloads/cloud-firestore-emulator-v1.20.2.jar ~/.cache/firebase/emulators/
cp ~/Downloads/cloud-storage-rules-runtime-v1.1.3.jar ~/.cache/firebase/emulators/
cp ~/Downloads/ui-v1.15.0.zip ~/.cache/firebase/emulators/
```

4) Start the emulators (recommended: use an import directory so you can persist state)

Two common workflows:

- Fresh start and then export state manually

```bash
# start emulators (fresh)
npx firebase emulators:start --only database,auth --project demo-project

# when ready, open a new terminal to export current state
npx firebase emulators:export ./emulator-data
```

- Start with a previously exported snapshot and auto-export on exit (recommended for everyday dev)

```bash
npx firebase emulators:start --only database,auth --project demo-project --import=./emulator-data --export-on-exit
```

Notes:
- `--import=DIR` loads saved state from DIR if present.
- `--export-on-exit` writes the in-memory state back to the import directory when the emulators shut down.

5) Seed the emulator (create test users, a demo tree, upload a dummy base64 resource)

You can seed using the existing scripts in `scripts/`:

```bash
# seed basic demo content (examples provided by this repo)
node scripts/seed-emulator.mjs
node scripts/seed-users.mjs

# or create specific users with the seeder helper (uses Admin SDK against emulator)
node scripts/create-emulator-user.mjs --uid dev-uid --email dev@local --password devpass --username dev --role dev
node scripts/create-emulator-user.mjs --uid alice-uid --email alice@local --password alicepass --username alice --role user
```

6) Start the Vite dev server (in a separate terminal)

```bash
npm run dev
# open the URL Vite prints (usually http://localhost:5173 or the port printed by Vite)
```

7) Sign in to the app

Use the seeded credentials (email / passphrase):

- Developer: email = `dev@local`, passphrase = `devpass`
- Normal user: email = `alice@local`, passphrase = `alicepass`

Notes about auth and profiles
- The app uses Firebase Auth (email/password). Sign-up requires username + email + passphrase; on first successful Auth sign-in the client will auto-create a `users_famt/{uid}` profile in the Realtime Database with default role `user`.
- Promotions to `dev` should be done by admin (Admin SDK or Firebase Console). Clients must not be able to set their own `role: 'dev'`.

Troubleshooting & tips
- If the Firebase CLI fails to download emulator artifacts due to a proxy (HTTP 407), place the downloaded files into `~/.cache/firebase/emulators/` (or `~/.config/firebase/emulators/`) as shown above.
- Use `npx firebase emulators:export ./emulator-data` to manually save state, and start with `--import=./emulator-data` to restore it. The `--export-on-exit` flag automates this when the emulator process exits cleanly.
- The emulator export includes Realtime Database data, and Auth users (including custom claims) — so seeded users, roles, and tree data will be preserved.
- Emulator UI is available at `http://localhost:4000` by default — use it to inspect Database and Auth state.
- Do not background (`&`) or redirect the dev server process; keep it running in its own terminal so Vite can watch files and serve the HMR client.
- If you need a repeatable seed for other developers, commit a small exported snapshot (careful with any secrets) or include small seeding scripts and document the commands — the scripts in `scripts/` are intended for that.

Security: these instructions are for local development only; do not use seeded passphrases or exported snapshots in production.
