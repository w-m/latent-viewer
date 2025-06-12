const fs = require('fs');
const path = require('path');
const {
  getAbsoluteDataPath,
  getMetadataPath,
} = require('../latent-viewer.config.js');

const dataRoot = getAbsoluteDataPath();

if (!fs.existsSync(dataRoot)) {
  console.log('❌ Data directory does not exist:', dataRoot);
  console.log('');
  console.log('Please run: npm run get-test-data');
  console.log('to download the test data to the configured location.');
  process.exit(1);
}

const cellBytes = {};
let total = 0;
let gridSize = 0;

if (fs.existsSync(dataRoot)) {
  const dirs = fs
    .readdirSync(dataRoot)
    .filter((d) => fs.statSync(path.join(dataRoot, d)).isDirectory());
  gridSize = Math.sqrt(dirs.length);
  for (const dir of dirs) {
    let size = 0;
    const dirPath = path.join(dataRoot, dir);
    for (const file of fs.readdirSync(dirPath)) {
      const fpath = path.join(dirPath, file);
      if (fs.statSync(fpath).isFile()) size += fs.statSync(fpath).size;
    }
    cellBytes[dir] = size;
    total += size;
  }
}

const out = {
  gridSize,
  cellBytes,
  totalBytes: total,
};

fs.writeFileSync(getMetadataPath(), JSON.stringify(out, null, 2));
console.log(`Generated ${getMetadataPath()}`);
