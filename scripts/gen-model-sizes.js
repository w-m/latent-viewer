const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(
  __dirname,
  '../public/compressed_head_models_512_16x16'
);
const result = {};
let total = 0;
if (fs.existsSync(baseDir)) {
  for (const dir of fs.readdirSync(baseDir)) {
    const dirPath = path.join(baseDir, dir);
    if (!fs.statSync(dirPath).isDirectory()) continue;
    let size = 0;
    for (const file of fs.readdirSync(dirPath)) {
      const fpath = path.join(dirPath, file);
      if (fs.statSync(fpath).isFile()) size += fs.statSync(fpath).size;
    }
    result[`compressed_head_models_512_16x16/${dir}`] = size;
    total += size;
  }
}
const out = `export const MODEL_SIZES: Record<string, number> = ${JSON.stringify(result, null, 2)};\nexport const TOTAL_MODEL_BYTES = ${total};\n`;
fs.writeFileSync(path.resolve(__dirname, '../src/model-sizes.ts'), out);
console.log('Generated src/model-sizes.ts');
