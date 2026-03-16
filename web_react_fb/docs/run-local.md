# Run Locally (emulator + dev server)

Date: 260315 (2026-03-15)

This guide shows how to run FamTree locally using the Firebase Emulator Suite and the Vite dev server. It uses **Firebase Realtime Database** (RTDB) for all data persistence and **Firebase Auth**. Image resources are stored as **base64** strings directly in the RTDB.

## Prerequisites
- Node.js >= 21
- Java 21 (required by Firebase emulators)
- Firebase CLI (npm install -g firebase-tools) — used to run emulators

## Quick steps


brew list | grep node
brew list | grep nvm
nvm use 24
    # global 24
nvm alias default 24
    or nvmrc file add 24 then nvm use 


0) Install project dependencies
```bash
npm install
```

1) Ensure Java 21 is active
```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
java -version
```

2) Copy example env
```bash
cp .env.local.example .env.local
```

3) Start the emulators
```bash
# start emulators (fresh)
npx firebase emulators:start --only database,auth --project demo-project

# Or with state persistence:
npx firebase emulators:start --only database,auth --project demo-project --import=./emulator-data --export-on-exit
```

4) Seed the emulator
```bash
# seed demo tree and base64 images
node scripts/seed-emulator.mjs
# seed test users (stored in users_famt node)
node scripts/seed-users.mjs
```

5) Start the Vite dev server
```bash
npm run dev
```

## Troubleshooting
- **Node.js**: The Firebase CLI and project dependencies require Node.js >= 21.
- **Emulator Port**: RTDB emulator defaults to port 9000.
- **Base64**: All image resources are encoded to base64 before upload.

Security: these instructions are for local development only.
