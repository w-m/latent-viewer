/**
 * Latent Viewer Configuration
 *
 * Simple configuration that requires VITE_DATA_ROOT to be set explicitly.
 */

const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

function getDataRoot() {
  const dataRoot = process.env.VITE_DATA_ROOT;
  if (!dataRoot) {
    console.error('❌ VITE_DATA_ROOT environment variable is not set!');
    console.error('');
    console.error('Please set VITE_DATA_ROOT in your .env file, for example:');
    console.error('  VITE_DATA_ROOT=data/compressed_head_models_512_16x16');
    console.error('');
    console.error('Then run: npm run get-test-data');
    process.exit(1);
  }
  return dataRoot;
}

function getAbsoluteDataPath() {
  return path.resolve(__dirname, 'public', getDataRoot());
}

function getMetadataPath() {
  return path.join(getAbsoluteDataPath(), 'latent-viewer-meta.json');
}

// Camera default position (x, y, z)
const cameraPosEnv =
  process.env.VITE_CAMERA_POSITION || process.env.CAMERA_POSITION || null;
if (!cameraPosEnv) {
  console.error('❌ VITE_CAMERA_POSITION environment variable is not set!');
  process.exit(1);
}
const cameraPosition = cameraPosEnv.split(' ').map(Number);

// Vertical offset applied to loaded model (y-axis)
const modelOffsetEnv =
  process.env.VITE_MODEL_OFFSET_Y || process.env.MODEL_OFFSET_Y || null;
if (modelOffsetEnv === null) {
  console.error('❌ VITE_MODEL_OFFSET_Y environment variable is not set!');
  process.exit(1);
}
const modelOffsetY = parseFloat(modelOffsetEnv);

const config = {
  getDataRoot,
  getAbsoluteDataPath,
  getMetadataPath,
  cameraPosition,
  modelOffsetY,
};

module.exports = config;
module.exports.default = config;
