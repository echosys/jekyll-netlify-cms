const { parentPort, workerData } = require('worker_threads');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

export {};

async function makeImageThumb(src: string, dst: string, size = 320) {
  try {
    const dDir = path.dirname(dst);
    if (!fs.existsSync(dDir)) fs.mkdirSync(dDir, { recursive: true });
    await sharp(src).resize(size, size, { fit: 'cover' }).toFile(dst);
    return true;
  } catch (e) {
    return false;
  }
}

async function makeVideoThumb(src: string, dst: string, size = 320) {
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

  for (const f of files) {
    const key = Buffer.from(f.absPath).toString('hex');
    const dst = path.join(outDir, `${key}.jpg`);
    
    let ok = false;
    if (f.type === 'video') {
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
        file: f.absPath,
        thumb: dst,
        thumbBase64,
        count
      });
    }
  }

  parentPort?.postMessage({ type: 'done', count });
}

main();
