// 1) web-components runtime
import '@playcanvas/web-components';

// 2) expose PlayCanvas build
import * as pc from 'playcanvas';
window.pc = pc;

// 3) helper scripts
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
import { XrControllers } from 'playcanvas/scripts/esm/xr-controllers.mjs';
import { XrNavigation } from 'playcanvas/scripts/esm/xr-navigation.mjs';

// 4) React components
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LatentGrid } from './LatentGrid';

// Define a placeholder switchModel immediately, ensuring it's always available
window.switchModel = function(dir) {
  // Placeholder - will be replaced with actual implementation
};

// Global initialization flag to prevent multiple initializations
let hasInitialized = false;

// ------------------------------------------------------------------
// New initialization function that's more robust across browsers
// ------------------------------------------------------------------
function initApplication() {
  // Guard against multiple initializations
  if (hasInitialized) {
    return;
  }
  
  hasInitialized = true;
  
  const pcApp = document.querySelector('pc-app');
  if (!pcApp) {
    console.error('<pc-app> not found in DOM');
    return;
  }
  
  // Initialize React UI immediately - don't wait for pcApp.ready
  initializeReactGrid();
  
  // Wait for the PC app to be ready
  pcApp.addEventListener(
    'ready',
    () => {
      // --- register helper scripts
      pc.registerScript(CameraControls, 'cameraControls');
      pc.registerScript(XrControllers, 'xrControllers');
      pc.registerScript(XrNavigation, 'xrNavigation');

      // --- dynamic GSplat loader with LRU cache
      initDynamicLoader(pcApp);
    },
    { once: true }
  );
}

// Separate function to initialize the React grid
function initializeReactGrid() {
  const gridContainer = document.getElementById('latentGrid');
  if (!gridContainer) {
    console.error('Grid container not found');
    return;
  }
  
  try {
    const root = createRoot(gridContainer);
    root.render(
      React.createElement(LatentGrid, {
        gridSize: 3,
        cellPx: 60,
        cornerColors: ['#009775', '#662d91', '#662d91', '#009775'],
        onLatentChange: (row, col) => {
          const modelLetter = String.fromCharCode(97 + row); // 97 = 'a'
          const modelPath = `compressed_head_models/model_${modelLetter}${col}`;
          window.switchModel(modelPath);
        },
      })
    );
  } catch (error) {
    console.error('Error rendering grid:', error);
  }
}

// ------------------------------------------------------------------
// Dynamic GSplat loader / switcher
// ------------------------------------------------------------------
function initDynamicLoader(pcApp) {
  const app = pcApp.app;

  const GRACE = 5;                 // frames to overlap (tweak as needed)

  let liveEnt     = makeViewer();   // model currently shown
  let pendingEnt  = null;           // model waiting for eviction
  let framesLeft  = 0;              // countdown for pendingEnt

  app.root.addChild(liveEnt);

  // ───────────────── helpers
  function makeViewer() {
    const e = new pc.Entity('gsplat-holder');
    e.addComponent('gsplat', { asset: null });
    return e;
  }

  function destroyAsset(asset) {
    if (asset?.resource) asset.resource.destroy();
    app.assets.remove(asset);
  }

  // global post-render hook ➜ ticks countdown once per frame
  app.on('postrender', () => {
    if (pendingEnt && --framesLeft === 0) {
      app.root.removeChild(pendingEnt);
      destroyAsset(pendingEnt.gsplat.asset);
      pendingEnt = null;
    }
  });

  // ───────────────── model switcher
  async function switchModel(dir) {
    // if a previous pendingEnt still exists, evict it now
    if (pendingEnt) {
      app.root.removeChild(pendingEnt);
      destroyAsset(pendingEnt.gsplat.asset);
      pendingEnt = null;
    }

    // build new asset + entity
    const url   = new URL(`${dir}/meta.json`, document.baseURI).href;
    const asset = new pc.Asset(`gsplat-${dir}`, 'gsplat', { url });
    app.assets.add(asset);

    const nextEnt = makeViewer();
    app.root.addChild(nextEnt);

    try {
      // wait until JSON + buffers in RAM
      await new Promise((res, rej) => {
        asset.once('load', res);
        asset.once('error', rej);
        app.assets.load(asset);
      });

      nextEnt.gsplat.asset = asset;   // start GPU upload, appears soon
      pendingEnt = liveEnt;          // mark previous as stale
      framesLeft = GRACE;            // start overlap countdown
      liveEnt    = nextEnt;          // promote new entity
    } catch (err) {
      console.error(`Failed to load ${dir}`, err);
      app.root.removeChild(nextEnt);
      destroyAsset(asset);
    }
  }

  // expose to grid
  window.switchModel = switchModel;
  switchModel('compressed_head_models/model_b1'); // initial model
}

// ------------------------------------------------------------------
// Start the application - using multiple methods to ensure it runs
// ------------------------------------------------------------------

// Method 1: Use DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApplication);
} else {
  // Method 2: Document already loaded
  initApplication();
}

// Method 3: Use window.onload as a fallback
window.addEventListener('load', () => {
  if (!hasInitialized) {
    initApplication();
  }
});
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApplication);
  console.log('Waiting for DOMContentLoaded event');
} else {
  // Method 2: Document already loaded
  console.log('Document already loaded, initializing now');
  initApplication();
}

// Method 3: Use window.onload as a fallback
window.addEventListener('load', () => {
  console.log('Window load event triggered');
  // Only initialize if we haven't already
  if (!hasInitialized) {
    console.log('Initializing from window.onload fallback');
    initApplication();
  }
});
