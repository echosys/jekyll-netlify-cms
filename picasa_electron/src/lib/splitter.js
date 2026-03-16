// Simple splitter: groups files into parts where each part total size <= maxPartSize
function splitFilesIntoParts(files, maxPartSize) {
  const parts = [];
  let current = [];
  let currentSize = 0n;

  for (const f of files) {
    const size = BigInt(f.size || 0);
    if (size > maxPartSize) {
      // place large file into its own part
      if (current.length > 0) {
        parts.push(current);
        current = [];
        currentSize = 0n;
      }
      parts.push([f]);
      continue;
    }
    if (currentSize + size > maxPartSize) {
      parts.push(current);
      current = [f];
      currentSize = size;
    } else {
      current.push(f);
      currentSize += size;
    }
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

module.exports = { splitFilesIntoParts };

