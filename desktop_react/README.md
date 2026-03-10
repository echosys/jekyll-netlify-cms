# desktop_react — WebView wrapper for the React Family Tree App

A lightweight PyQt6 desktop shell that embeds the `web_react` Vite/React app
inside a native window using **QtWebEngine** (Chromium-based).

## Prerequisites

- Python 3.10+
- PyQt6 + PyQt6-WebEngine

```bash
pip install -r requirements.txt
```

## Running

1. Start the React dev server (from `web_react/`):
   ```bash
   npm run dev          # → http://localhost:5173/
   ```

2. In a separate terminal, launch the desktop wrapper (from `desktop_react/`):
   ```bash
   python main.py
   ```

## Configuration — `config.json`

Edit `config.json` (created automatically on first run if missing) to change
any of the settings below, or use **⚙ Settings** inside the running app:

| Key | Default | Description |
|-----|---------|-------------|
| `app_url` | `http://localhost:5173/` | URL the WebView loads on startup |
| `window_title` | `Family Tree App` | Title shown in the OS title bar |
| `window_width` | `1280` | Initial window width (px) |
| `window_height` | `800` | Initial window height (px) |
| `zoom_factor` | `1.0` | Page zoom (0.25 – 5.0) |
| `remember_window_geometry` | `true` | Restore window size/position on relaunch |
| `dev_tools_enabled` | `false` | Reserved — use **View → Developer Tools** or F12 |

## Features

- **Navigation toolbar** — Back, Forward, Reload, URL bar, Home, Settings
- **Zoom** — Ctrl +/- / Ctrl+0 or View menu
- **Developer Tools** — View menu or F12 (opens a separate Dev Tools window)
- **Settings dialog** — change URL, title, zoom without editing JSON
- **Geometry persistence** — window size and position saved across sessions

