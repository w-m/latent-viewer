// 1) web-components runtime
import '@playcanvas/web-components';

// 2) expose PlayCanvas build
import * as pc from 'playcanvas';
window.pc = pc;

// 3) helper scripts
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
import { XrControllers } from 'playcanvas/scripts/esm/xr-controllers.mjs';
import { XrNavigation } from 'playcanvas/scripts/esm/xr-navigation.mjs';

import React from 'react';

// ------------------------------------------------------------------
// kick off everything once <pc-app> exists AND signals `ready`
// ------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  const pcApp = document.querySelector('pc-app');
  if (!pcApp) {
    console.error('<pc-app> not found in DOM');
    return;
  }

  pcApp.addEventListener(
    'ready',
    () => {
      // --- register helper scripts
      pc.registerScript(CameraControls, 'cameraControls');
      pc.registerScript(XrControllers,  'xrControllers');
      pc.registerScript(XrNavigation,   'xrNavigation');

      // --- dynamic GSplat loader with LRU cache
      initDynamicLoader(pcApp);
    },
    { once: true }
  );
});

// ------------------------------------------------------------------
// Dynamic GSplat loader / switcher
//  • keeps at most TWO entities in scene
//  • old one stays visible for GRACE frames,
//    even if the user drags again during that period
// ------------------------------------------------------------------
function initDynamicLoader(pcApp) {
  const app = pcApp.app;

  const GRACE = 20;                 // frames to overlap (tweak as needed)

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


import { createRoot } from 'react-dom/client';
import { LatentGrid } from './LatentGrid';

document.addEventListener('DOMContentLoaded', () => {
  console.log('Grid integration starting...');
  const gridContainer = document.getElementById('latentGrid');
  if (!gridContainer) {
    console.error('Grid container not found');
    return;
  }
  const root = createRoot(gridContainer);
  
  // Just render the grid with minimal props
  root.render(
    React.createElement(LatentGrid, {
      gridSize: 3,
      cellPx: 60,  // small size to fit in 200px sidebar
      cornerColors: ['#009775', '#662d91', '#662d91', '#009775'],
      onLatentChange: (row, col) => {
        // Convert row,col to model name (a0 through c2)
        const modelLetter = String.fromCharCode(97 + row); // 97 = 'a'
        const modelPath = `compressed_head_models/model_${modelLetter}${col}`;
        window.switchModel(modelPath);
      },
    })
  );
});
