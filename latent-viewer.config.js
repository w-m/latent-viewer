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

module.exports = {
  getDataRoot,
  getAbsoluteDataPath,
  getMetadataPath,
};
