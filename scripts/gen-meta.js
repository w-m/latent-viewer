const fs = require('fs');
const path = require('path');

const dataRoot = path.resolve(
  process.argv[2] ||
    path.join(__dirname, '../public/compressed_head_models_512_16x16')
);

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

fs.writeFileSync(
  path.join(dataRoot, 'latent-viewer-meta.json'),
  JSON.stringify(out, null, 2)
);
console.log(`Generated ${path.join(dataRoot, 'latent-viewer-meta.json')}`);
