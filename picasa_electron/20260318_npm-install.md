# npm / Electron install: problem, solution, and workarounds (2026-03-18)

## Problem
- `npm install` for Electron (postinstall) was failing with a RequestError ETIMEDOUT to IPs in the 140.82.* range (e.g. `connect ETIMEDOUT 140.82.114.3:443`).
- These IPs are GitHub load-balancer addresses. Electron's postinstall downloads prebuilt binaries from GitHub release assets, so the installer attempted to connect directly to GitHub back-ends.
- In a corporate environment with an outbound proxy / egress filtering, some GitHub backend IPs can be intermittently blocked or time out. Visiting a raw IP like `https://140.82.114.3/` in a browser also fails because TLS certificates are for hostnames (SNI); pointing at the IP causes a cert mismatch.

## Root cause
- Electron downloads runtime binaries from GitHub releases by default; the postinstall script attempted to download assets from GitHub and hit a blocked or flaky GitHub backend IP on your network path.
- The local environment lacked an Electron-specific mirror configuration so the installer fell back to GitHub.

## Solution applied (what I did)
1. Exported company CA roots to `/tmp/cacert.pem` and set npm `cafile` so Node/curl trust the corporate TLS proxy when needed.
2. Configured the Electron binary mirror to point at your Artifactory mirror and made sure npm and child processes inherit it:
   - Set environment variables (add these to `~/.zshrc` / `~/.zprofile`):
     ```bash
     export ELECTRON_MIRROR="https://artifactory.company.com/electron-binaries/"
     export npm_config_electron_mirror="$ELECTRON_MIRROR"
     export HTTP_PROXY="http://<USER>:<PASS>@proxy.company.com:8080"
     export HTTPS_PROXY="$HTTP_PROXY"
     export http_proxy="$HTTP_PROXY"      # lowercase for some tools
     export https_proxy="$HTTP_PROXY"
     export npm_config_proxy="$HTTP_PROXY"
     export npm_config_https_proxy="$HTTPS_PROXY"
     export NODEJS_ORG_MIRROR="https://artifactory.company.com/nodejs-proxy/"  # for nvm/node downloads
     export NVM_NODEJS_ORG_MIRROR="$NODEJS_ORG_MIRROR"
     # optional (company root CA)
     export NODE_EXTRA_CA_CERTS="/Users/$(whoami)/AmexOnDemandRootCAs.pem"
     ```
   - Added to `~/.npmrc`:
     ```ini
     registry=https://artifactory.company.com/api/npm/npm
     electron_mirror=https://artifactory.company.com/electron-binaries/
     fund=false
     ```
3. Verified the Artifactory binaries exist (HEAD requests showed HTTP 200 for the v26 assets):
   - Example HEAD test (no download):
     ```bash
     curl -I --proxy "$HTTP_PROXY" --cacert /tmp/cacert.pem \
       "https://artifactory.company.com/electron-binaries/v26.0.0/electron-v26.0.0-darwin-x64.zip"
     ```
4. Re-ran `npm install --no-save electron@26.0.0 --verbose` with the environment exported so the postinstall used the Artifactory mirror instead of GitHub.  The package installed and `node_modules/electron` appeared.

## Verification commands
- Show effective npm config / envs:
```bash
env | grep -i proxy
npm config get electron_mirror
npm config get cafile
```
- Test Artifactory asset HEAD (replace arch as needed):
```bash
curl -I --proxy "$HTTP_PROXY" --cacert /tmp/cacert.pem \
  "https://artifactory.company.com/electron-binaries/v26.0.0/electron-v26.0.0-darwin-arm64.zip"
```
- Run a verbose install to capture network behavior:
```bash
export npm_config_electron_mirror="$ELECTRON_MIRROR"
export npm_config_proxy="$HTTP_PROXY"
npm install --no-save electron@26.0.0 --verbose 2>&1 | tee /tmp/npm-electron-install.log
# then inspect network lines
grep -nE "artifactory.company.com|release-assets|github|RequestError|ETIMEDOUT" /tmp/npm-electron-install.log || true
```

## Workarounds (if mirror not available or for quick unblock)
- Skip electron binary download (installs JS deps but not the runtime binary):
```bash
ELECTRON_SKIP_DOWNLOAD=1 npm install --no-save electron@26.0.0
# or globally for a session
export ELECTRON_SKIP_DOWNLOAD=1
npm install
```
- Ignore postinstall scripts (no binaries, not runnable until you obtain binaries):
```bash
npm install --no-save electron@26.0.0 --ignore-scripts
```
- Manual: from a machine with unrestricted egress, download the Electron zip for your platform and place it in Artifactory or into Electron's expected cache location so local installs find it.

## Notes for IT / TechCare
- If installs still hit GitHub and time out, provide the failing IP(s) (e.g. `140.82.113.3`, `140.82.114.3`, `140.82.112.4`) to IT and ask them to verify egress/whitelist for GitHub release assets and Artifactory nodes. GitHub publish IP ranges at: `https://api.github.com/meta`.

## Logs and evidence (on my workstation)
- Saved verbose install logs: `/tmp/npm-electron-install.log` and `/tmp/npm-electron-install-artifactory.log` (these contain the RequestError lines and the successful install evidence).
- Artifactory HEAD responses included headers `X-Artifactory-Origin-Remote-Path` showing the original GitHub release URL.

---

If you want, I can append the environment snippet and `.npmrc` lines directly into your `~/.zshrc` and `~/.npmrc` (I will show the exact edits first), or I can draft a short TechCare/IT message including the failing IPs and the log excerpt to request whitelist — which do you prefer?

## Running the app vs opening the Vite dev server in a browser

- Symptom: when you run `npm run dev` and then open `http://localhost:5173` in a regular browser you may see runtime errors like:
  - "Uncaught TypeError: Cannot read properties of undefined (reading 'onScanProgress')" coming from `App.tsx`.

- Cause: The renderer UI expects an Electron preload script to expose a `window.api` bridge (IPC helpers) which is only available when the renderer is running inside Electron with the preload script loaded. Opening the Vite dev server in a normal browser does not load the Electron preload, so `window.api` is undefined and calls like `window.api.onScanProgress(...)` will throw.

- Correct ways to run the app:
  1) Production/bundled run (build everything then start Electron):

     ```bash
     # compile main (ts) and build renderer with Vite
     npm run build
     # then launch electron which will load dist/renderer/index.html
     npm start
     ```

     This ensures the preload script and renderer are packaged and Electron will provide `window.api`.

  2) Development (fast iteration) — two-terminal flow (no extra deps):

     Terminal A (start the Vite dev server):
     ```bash
     npm run dev
     ```

     Terminal B (start Electron after the dev server is running):
     ```bash
     # build the main process (so preload/main JS exists under dist) and start electron
     # tsc must emit JS for the main process first; the project includes a `build` script for that
     npm run build -- --skip-vite # optional: you can run tsc only if you have a helper; otherwise run full build once
     npm start
     ```

     Notes: the repo's current `main.ts` tries to load local files (dist or src). In this two-terminal flow the renderer is served by Vite and Electron will load the local index which references the dev server assets. If you prefer the Electron window to load the dev server URL directly (recommended for a smoother dev experience), you can temporarily modify `createWindow()` in `src/main/main.ts` to detect a dev env and use `mainWindow.loadURL('http://localhost:5173')` when Vite is running.

  3) Quick dev-run without building every change to main/preload:
     - Keep `npm run dev` running for the renderer.
     - In another terminal run `electron .` (or `npm start`) after you compile the main/preload once with `tsc` so Electron can load the preload script.

- Workarounds if you *must* debug in a browser tab:
  - Replace calls to `window.api` in the renderer with guarded checks so the UI doesn't crash when `window.api` is absent. Example pattern:
    ```ts
    const api = (window as any).api;
    api?.onScanProgress?.((m:any)=>{ /* ... */ });
    ```
    This is useful for quick UI-only work, but features that rely on native APIs (file dialogs, filesystem scans, workers started from main) won't function.

- TL;DR: "npm run dev" starts the renderer dev server (Vite) which can be opened in a browser for UI-only work. To use Electron-specific APIs (preload/window.api) start Electron (npm start) so the preload is loaded and IPC bridges are available.

## Small troubleshooting checklist for the TypeError

- Did you open the app in a regular browser tab? If yes, open Electron instead.
- Has the `preload` script been built and available at the path referenced by `main.ts`? If not, run `tsc` (or `npm run build`) to emit the JS.
- For dev-run, try the two-terminal flow above: `npm run dev` (vite) then `npm start` (electron).
- If you still need to open in a browser for UI work, add defensive checks around `window.api` calls so the UI doesn't crash.

## Native module build notes (better-sqlite3)

- Problem: `better-sqlite3` may try to download a prebuilt binary during `npm install` (via prebuild-install). Behind a corporate proxy this can fail (HTTP 407) and npm falls back to compiling from source which often fails due to node-gyp / V8 ABI mismatches or missing build toolchain.
- Recommendations / workarounds:
  - Use a Node.js version that has prebuilt binaries available for `better-sqlite3` (often Node 18 LTS is safest). Switch with `nvm`: 

    ```bash
    nvm install --lts
    nvm use --lts
    node -v
    ```

  - If you must stay on a newer Node, ensure your environment has a working C/C++ toolchain (Xcode command line tools), python, and that the corporate proxy allows the prebuild binary download or configure `prebuild-install` to use your internal mirrors.
  - As a temporary workaround for local dev you can avoid installing `better-sqlite3` by stubbing DB calls or using an alternate JS-only fallback during UI-only development (set an env var and branch in `main` to not require the DB), or run `ELECTRON_SKIP_DOWNLOAD=1 npm install` and obtain binaries separately.

---

If you want, I can:

- Add a small `dev` helper script and a dev-mode branch in `main.ts` to auto-load `http://localhost:5173` when an environment variable is present, or
- Add defensive `window.api` guards in `src/renderer/src/App.tsx` so opening the Vite page doesn't error.

Which would you like me to do next?
