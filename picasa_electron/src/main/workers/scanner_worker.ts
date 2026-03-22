const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { exiftool } = require('exiftool-vendored');

export {};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp', '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw', '.dng']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg']);
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.cache', 'AppData', 'Library', 'System Volume Information', '$RECYCLE.BIN', 'tmp', '.DS_Store']);

function getDriveName(root: string) {
  if (process.platform === 'win32') {
    const p = path.parse(root);
    if (p.root && p.root.length > 0) return p.root.replace(':\\', ':').replace('\\', '');
    return p.root || path.basename(root);
  }
  return path.basename(root) || root;
}

async function scan() {
  const { root } = workerData;
  const driveName = getDriveName(root);
  const discoveredFiles: any[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return; // Skip directories we can't access
    }

    const currentDirFiles: any[] = [];

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue; // Avoid symlink cycles

      const fullPath = path.join(dir, entry.name);
      const isPackage = entry.name.toLowerCase().endsWith('.app') || 
                        entry.name.toLowerCase().endsWith('.framework') || 
                        entry.name.toLowerCase().endsWith('.bundle');

      if (entry.isDirectory() && !isPackage) {
        await walk(fullPath);
      } else {
        // Treat as file
        try {
            const stats = fs.statSync(fullPath);
            const ext = isPackage ? '' : path.extname(entry.name).toLowerCase();
            const fileInfo: any = {
              absPath: fullPath,
              rel: path.relative(root, fullPath).split(path.sep).join('/'),
              size: stats.size,
              mtime: Math.floor(stats.mtimeMs),
              driveName,
              ext,
              type: (isPackage) ? 'file' : (IMAGE_EXTENSIONS.has(ext) ? 'image' : (VIDEO_EXTENSIONS.has(ext) ? 'video' : 'file'))
            };
            discoveredFiles.push(fileInfo);

            // Instant updates for discovered files (every 1000 files)
            if (discoveredFiles.length % 1000 === 0) {
              parentPort?.postMessage({ type: 'discovered', files: discoveredFiles.slice(-1000) });
            }
        } catch (e) {}
      }
    }
    
    // Send remaining in this folder
    if (currentDirFiles.length > 0 && currentDirFiles.length % 10 !== 0) {
        // We could send more precisely but batching is fine
    }
  }

  try {
    parentPort?.postMessage({ type: 'status', message: `Scanning ${root}...` });
    await walk(root);
    
    // Final remaining discovered files
    const remaining = discoveredFiles.length % 1000;
    if (remaining > 0) {
        parentPort?.postMessage({ type: 'discovered', files: discoveredFiles.slice(-remaining) });
    }

    parentPort?.postMessage({ type: 'status', message: `Reading metadata for ${discoveredFiles.length} files...` });

    // Process EXIF in batches
    const BATCH_SIZE = 20;
    for (let i = 0; i < discoveredFiles.length; i += BATCH_SIZE) {
      const batch = discoveredFiles.slice(i, i + BATCH_SIZE);
      const updates = await Promise.all(batch.map(async (fileInfo) => {
        if (fileInfo.type === 'image') {
          try {
            const tags = await exiftool.read(fileInfo.absPath);
            const update: any = { absPath: fileInfo.absPath };
            update.dateTaken = tags.DateTimeOriginal ? tags.DateTimeOriginal.toDate().getTime() : fileInfo.mtime;
            if (tags.GPSLatitude && tags.GPSLongitude) {
              update.lat = tags.GPSLatitude;
              update.lon = tags.GPSLongitude;
            }
            if (tags.Make || tags.Model) {
              update.camera = `${tags.Make || ''} ${tags.Model || ''}`.trim();
            }
            if (tags.UserComment && tags.UserComment.includes('_picasa_location')) {
              try {
                const loc = JSON.parse(tags.UserComment.replace('ASCII\x00\x00\x00', ''));
                update.location = loc;
              } catch (e) {}
            }
            return update;
          } catch (e) {
            return { absPath: fileInfo.absPath };
          }
        }
        return { absPath: fileInfo.absPath };
      }));

      parentPort?.postMessage({ type: 'exif-update', updates });
      parentPort?.postMessage({ type: 'progress', count: i + batch.length, total: discoveredFiles.length });
    }

    await exiftool.end();
    parentPort?.postMessage({ type: 'done', count: discoveredFiles.length });
  } catch (err) {
    parentPort?.postMessage({ type: 'error', error: String(err) });
  }
}

scan();
