const { parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const crypto = require('crypto');

export {};

async function makeImageThumb(srcPath: string, dst: string, size = 320) {
  const src = srcPath.normalize('NFC');
  try {
    const dDir = path.dirname(dst);
    if (!fs.existsSync(dDir)) fs.mkdirSync(dDir, { recursive: true });
    
    // For remote/virtual drives (Google Drive), sometimes sharp fails if the file 
    // is not already cached locally. Reading it into a buffer first can trigger
    // the OS File Provider to download/hydrate it.
    let input = src;
    try {
      // Just read first 4KB to trigger download without killing memory
      const fd = fs.openSync(src, 'r');
      const buf = Buffer.alloc(4096); 
      fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
    } catch (e) {
      console.warn(`[ThumbnailWorker] Pre-read failed for ${src}, sharp might still work.`);
    }

    try {
      await sharp(src).resize(size, size, { fit: 'cover' }).toFile(dst);
    } catch (err) {
      // Retry once after a short delay
      await new Promise(r => setTimeout(r, 100));
      await sharp(src).resize(size, size, { fit: 'cover' }).toFile(dst);
    }
    
    return true;
  } catch (e) {
    console.error(`[ThumbnailWorker] Sharp failed for ${src} after retry:`, e);
    return false;
  }
}

async function makeVideoThumb(srcPath: string, dst: string, size = 320) {
  const src = srcPath.normalize('NFC');
  return new Promise<void>((resolve, reject) => {
    const dDir = path.dirname(dst);
    if (!fs.existsSync(dDir)) fs.mkdirSync(dDir, { recursive: true });
    
    // Simple ffmpeg call to get a frame at 1s
    const ff = spawn('ffmpeg', [
      '-ss', '1',
      '-i', src,
      '-vframes', '1',
      '-s', `${size}x${size}`,
      '-f', 'image2',
      '-y', dst
    ]);

    ff.on('close', (code: number) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });

    ff.on('error', (err: any) => reject(err));
  });
}

async function main() {
  const { files, outDir } = workerData;
  let count = 0;

  const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp', '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw', '.dng']);
  const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg']);

  for (const f of files) {
    // Skip if file type is not image or video
    if (f.type !== 'image' && f.type !== 'video') {
      continue;
    }

    const ext = path.extname(f.absPath).toLowerCase();
    const isImage = IMAGE_EXTENSIONS.has(ext);
    const isVideo = VIDEO_EXTENSIONS.has(ext);
    
    if (!isImage && !isVideo) {
      continue; // Skip files with unsupported extensions
    }

    const key = crypto.createHash('md5').update(f.absPath).digest('hex');
    const dst = path.join(outDir, `${key}.jpg`);
    
    let ok = false;
    if (isVideo) {
      try {
        await makeVideoThumb(f.absPath, dst);
        ok = true;
      } catch (e) {}
    } else {
      ok = await makeImageThumb(f.absPath, dst);
    }

    if (ok) {
      count++;
      const thumbBase64 = fs.readFileSync(dst, { encoding: 'base64' });
      parentPort?.postMessage({
        type: 'thumb',
        file: f.absPath.normalize('NFC'),
        thumb: dst,
        thumbBase64,
        count
      });
    }
  }

  parentPort?.postMessage({ type: 'done', count });
}

main();
