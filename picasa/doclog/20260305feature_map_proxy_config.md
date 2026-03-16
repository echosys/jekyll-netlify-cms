# 20260305 Feature – Map Asset Proxy + Local/CDN Config

## What was added

### Config keys (`config/<machine>/config.json`)

| Key | Default | Description |
|---|---|---|
| `map_use_local_assets` | `true` | Inline downloaded JS/CSS → works offline, no proxy needed |
| `map_proxy` | `""` | Explicit proxy URL, e.g. `http://proxy.corp.com:8080`. Empty = auto-detect from env |

### Proxy resolution order (`_get_proxy_url`)
1. `map_proxy` config value (if set)
2. `HTTPS_PROXY` environment variable
3. `https_proxy` environment variable
4. `HTTP_PROXY` / `http_proxy` environment variables
5. Direct (no proxy)

### `map_use_local_assets = true` (default)
- `_inline_assets(html, proxy_url)` replaces every `<script src="https://…">` /
  `<link href="https://…css">` with the file content read from `cache/map_assets/`
- If a file isn't cached yet, it downloads it via the resolved proxy
- Result: ~673 KB fully self-contained HTML, zero CDN requests at render time
- `setHtml(html, QUrl("about:blank"))` — no origin restrictions needed

### `map_use_local_assets = false` (CDN mode)
- Raw folium HTML is passed directly to `setHtml`
- Proxy is pushed into `QNetworkProxy.setApplicationProxy()` so WebEngine
  fetches CDN resources through it
- `setHtml(html, QUrl("https://localhost/"))` — allows CDN requests

### `download_map_assets.py` (updated)
- Accepts optional proxy as CLI argument: `python3 download_map_assets.py http://proxy:8080`
- Falls back to env vars automatically
- Prints instructions for switching to CDN mode at the end

## How to switch to CDN mode
Edit `config/<machine>/config.json`:
```json
{
  "map_use_local_assets": false,
  "map_proxy": "http://your-proxy.corp.com:8080"
}
```
Or leave `map_proxy` empty to use the system env proxy automatically.

