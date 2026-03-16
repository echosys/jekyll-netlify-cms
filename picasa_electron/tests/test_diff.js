const assert = require('assert');
const { computeDiff } = require('../src/lib/diff');

(function testDiff() {
  const sources = [ {rel_path: 'a.jpg', mtime: 10, size: 100}, {rel_path: 'b.jpg', mtime: 5, size: 50} ];
  const backups = [ {rel_path: 'a.jpg', mtime: 10, size: 100} ];
  const res = computeDiff(sources, backups);
  assert(res.identical.length === 1, 'a.jpg should be identical');
  assert(res.newFiles.length === 1 && res.newFiles[0].rel_path === 'b.jpg');
  console.log('test_diff: passed');
})();

