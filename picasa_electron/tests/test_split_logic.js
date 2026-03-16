const assert = require('assert');
const { splitFilesIntoParts } = require('../src/lib/splitter');

function randFiles(n, maxSize) {
  const arr = [];
  for (let i=0;i<n;i++) arr.push({ path: `f${i}.jpg`, size: Math.floor(Math.random()*maxSize) });
  return arr;
}

(function testSimple() {
  const files = [ {path:'a', size: 4}, {path:'b', size:5}, {path:'c', size:7}, {path:'d', size:3} ];
  const parts = splitFilesIntoParts(files, 10);
  // ensure no part sum > 10
  for (const p of parts) {
    const s = p.reduce((a,x)=>a+x.size, 0);
    assert(s <= 10, 'part exceeds max size');
  }
  console.log('test_split_logic: simple passed');
})();

(function testLargeFile() {
  const files = [ {path:'big', size: 50}, {path:'a', size: 4} ];
  const parts = splitFilesIntoParts(files, 10);
  assert(parts.length === 2, 'expected 2 parts when one file > max');
  console.log('test_split_logic: large file passed');
})();

