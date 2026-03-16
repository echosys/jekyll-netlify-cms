# Picasa Electron (Scaffold)

This repository contains a scaffold for the Electron port of the Photo Manager with backup features. It includes:

- Main process TypeScript scaffold (`src/main`)
- A small `BackupManager` that can create a single uncompressed zip part and writes a minimal SQLite entry
- A `JobQueue` stub
- Preload script exposing minimal IPC to the renderer
- A React renderer skeleton (TSX)
- Simple JS libs for `splitter` and `diff` logic with tests under `tests/`

How to run tests:

```bash
# install deps
npm install
# run the simple tests (no build step required for the small JS tests)
npm test
```


# add Node types and React types if TS complains during build:
npm install --save-dev @types/node @types/react @types/react-dom
npm run build        # or npm run dev, depending on your package.json scripts
npm start


ELECTRON_DEV=1 npm start


electron . --remote-debugging-port=9222
# Or via npm
npm start -- --remote-debugging-port=9222
http://localhost:9222 


 dev-only global shortcut (Ctrl+Alt+I / Cmd+Alt+I) to toggle DevTools


Notes:
- This is an initial scaffold; further implementation is required to make a production-ready app.

