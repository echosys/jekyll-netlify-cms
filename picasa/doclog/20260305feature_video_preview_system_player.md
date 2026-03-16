# 20260305 Feature – Video Preview & Photo Preview Dialog

## Changes

### `ui/photo_preview.py` – Video support added
- **Images** continue to render inline (PIL → QPixmap, capped at 4K, EXIF-rotated)
- **Videos** are now handled by delegating to the **OS default system player**:
  - macOS: `subprocess.Popen(["open", path])`
  - Windows: `subprocess.Popen(["start", "", path], shell=True)`
  - Linux: `subprocess.Popen(["xdg-open", path])`
- No codec library needed — zero cross-platform decoder complexity
- Video items show a 🎬 placeholder screen with filename + instructions
- **▶ Open in Player** button appears in top toolbar for videos
- **Enter** key also triggers system player when a video is focused
- Counter label prefixed with 🎬 (video) or 🖼 (image)
- `_open_system_player(path)` helper extracted as standalone function

### `feature.md` – Created
Master feature reference document. Covers:
- Full stack and architecture
- Config/cache paths (repo-local, per hostname)
- Workspace panel behaviour
- Scanning pipeline
- Thumbnail cache details
- Folder view hierarchy and tile details
- Timeline view grouping modes
- Map view
- Photo preview dialog (images + videos)
- Menu bar
- How to run / dependencies

---

## Why system player for videos?
Embedding video playback cross-platform requires codec libraries (GStreamer on Linux,
DirectShow/MF on Windows, AVFoundation on macOS) or shipping ffmpeg. Each platform
has different format support, licensing concerns, and Qt multimedia backend quirks.
Delegating to the system player means:
- Works with every format the user's machine can already play
- Zero extra dependencies
- One-line implementation per platform
- Better UX (user's preferred player, familiar controls)

