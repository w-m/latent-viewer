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
  console.log('Placeholder switchModel called with:', dir);
};

// ------------------------------------------------------------------
// New initialization function that's more robust across browsers
// ------------------------------------------------------------------
function initApplication() {
  console.log('Application initialization starting');
  
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
      console.log('PC App is ready');
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
  console.log('Starting React grid initialization');
  const gridContainer = document.getElementById('latentGrid');
  if (!gridContainer) {
    console.error('Grid container not found');
    return;
  }
  
  console.log('Grid container found:', gridContainer);
  
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
          console.log('Switching to model:', modelPath);
          window.switchModel(modelPath);
        },
      })
    );
    console.log('Grid rendered successfully');
  } catch (error) {
    console.error('Error rendering grid:', error);
  }
}

// ------------------------------------------------------------------
// Dynamic GSplat loader / switcher
// ------------------------------------------------------------------
function initDynamicLoader(pcApp) {
  console.log('Initializing dynamic loader');
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
    console.log('Loading GSplat model:', dir);
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
      console.log('Model loaded successfully:', dir);
    } catch (err) {
      console.error(`Failed to load ${dir}`, err);
      app.root.removeChild(nextEnt);
      destroyAsset(asset);
    }
  }

  // expose to grid
  window.switchModel = switchModel;
  console.log('Initialized window.switchModel, loading initial model');
  switchModel('compressed_head_models/model_b1'); // initial model
}

// ------------------------------------------------------------------
// Start the application - using multiple methods to ensure it runs
// ------------------------------------------------------------------
console.log('Script loaded, preparing to initialize application');

// Method 1: Use DOMContentLoaded
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
  // Check if we've already started initialization
  const pcApp = document.querySelector('pc-app');
  if (pcApp && !pcApp._hasInitializedApp) {
    console.log('Initializing from window.onload fallback');
    pcApp._hasInitializedApp = true;
    initApplication();
  }
});
