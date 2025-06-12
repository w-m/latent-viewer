const https = require('https');
const fs = require('fs');
const path = require('path');
const { getAbsoluteDataPath } = require('../latent-viewer.config.js');

const baseUrl =
  'https://fraunhoferhhi.github.io/cgs-gan/viewer/compressed_head_models_512_16x16';
const outRoot = getAbsoluteDataPath();

const files = [
  'means_l.webp',
  'means_u.webp',
  'meta.json',
  'quats.webp',
  'scales.webp',
  'sh0.webp',
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed ${url}: ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

async function run() {
  const tasks = [];

  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      const dirName = `model_c${c.toString().padStart(2, '0')}_r${r.toString().padStart(2, '0')}`;
      const localDir = path.join(outRoot, dirName);
      fs.mkdirSync(localDir, { recursive: true });

      for (const f of files) {
        const url = `${baseUrl}/${dirName}/${f}`;
        const dest = path.join(localDir, f);
        if (fs.existsSync(dest)) continue;
        tasks.push(() => {
          console.log(`Downloading ${url}`);
          return download(url, dest);
        });
      }
    }
  }

  const concurrency = 8;
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = index++;
      if (i >= tasks.length) break;
      await tasks[i]();
    }
  });

  await Promise.all(workers);
  console.log('All files downloaded.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
