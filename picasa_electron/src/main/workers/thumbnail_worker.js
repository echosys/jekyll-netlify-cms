const { parentPort, workerData } = require('worker_threads');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function makeThumb(src, dst, size = 320) {
  await sharp(src).rotate().resize(size, size, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(dst);
}

(async () => {
  const { files, outDir } = workerData;
  for (const f of files) {
    try {
      const hashKey = Buffer.from(f.path).toString('hex').slice(0, 16);
      const dst = path.join(outDir, `${hashKey}.jpg`);
      await makeThumb(f.path, dst);
      parentPort.postMessage({ type: 'thumb', file: f.path, thumb: dst });
    } catch (err) {
      parentPort.postMessage({ type: 'error', error: String(err), file: f.path });
    }
  }
  parentPort.postMessage({ type: 'done' });
})();

