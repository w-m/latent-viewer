// 1) web-components runtime
import '@playcanvas/web-components';

// 2) expose PlayCanvas build
import * as pc from 'playcanvas';
// Define on window for compatibility with existing code
declare global {
  interface Window {
    pc: typeof pc;
    switchModel: (dir: string) => Promise<void>;
  }
}
window.pc = pc;

// 3) helper scripts
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
import { XrControllers } from 'playcanvas/scripts/esm/xr-controllers.mjs';
import { XrNavigation } from 'playcanvas/scripts/esm/xr-navigation.mjs';

// 4) React components
import React from 'react';
import { createRoot } from 'react-dom/client';
import { LatentGrid } from './LatentGrid';

// Define interfaces for better type safety
interface GSplatEntity extends pc.Entity {
  gsplat: pc.GSplatComponent;
}

// Initial placeholder implementation
window.switchModel = async (dir: string): Promise<void> => {
  // Placeholder - will be replaced with actual implementation
};

// Global initialization flag to prevent multiple initializations
let hasInitialized = false;

/**
 * Main application initialization function with cross-browser compatibility
 */
function initApplication(): void {
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
      initDynamicLoader(pcApp as any); // TypeScript doesn't know about custom element types
    },
    { once: true }
  );
}

/**
 * Initialize the React grid component
 */
function initializeReactGrid(): void {
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
        onLatentChange: (row: number, col: number) => {
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

/**
 * Initialize the dynamic loader for GSplat models
 */
function initDynamicLoader(pcApp: any): void {
  const app = pcApp.app;
  const GRACE = 5; // frames to overlap (tweak as needed)

  let liveEnt: GSplatEntity = makeViewer();
  let pendingEnt: GSplatEntity | null = null;
  let framesLeft = 0;

  app.root.addChild(liveEnt);

  /**
   * Create a new GSplat viewer entity
   */
  function makeViewer(): GSplatEntity {
    const e = new pc.Entity('gsplat-holder') as GSplatEntity;
    e.addComponent('gsplat', { asset: null });
    return e;
  }

  /**
   * Safely destroy an asset and remove from asset registry
   */
  function destroyAsset(asset: pc.Asset | null): void {
    if (asset?.resource && typeof asset.resource === 'object' && 'destroy' in asset.resource) {
      (asset.resource as { destroy(): void }).destroy();
    }
    if (asset) app.assets.remove(asset);
  }

  // Global post-render hook for cleanup
  app.on('postrender', () => {
    if (pendingEnt && --framesLeft === 0) {
      app.root.removeChild(pendingEnt);
      // Use type assertion to fix TypeScript error
      destroyAsset(pendingEnt.gsplat.asset as pc.Asset | null);
      pendingEnt = null;
    }
  });

  /**
   * Switch to a new GSplat model
   * @param dir - Directory containing the model
   */
  async function switchModel(dir: string): Promise<void> {
    // If a previous pendingEnt still exists, evict it now
    if (pendingEnt) {
      app.root.removeChild(pendingEnt);
      destroyAsset(pendingEnt.gsplat.asset as pc.Asset | null);
      pendingEnt = null;
    }

    // Build new asset + entity
    const url = new URL(`${dir}/meta.json`, document.baseURI).href;
    const asset = new pc.Asset(`gsplat-${dir}`, 'gsplat', { url });
    app.assets.add(asset);

    const nextEnt = makeViewer();
    app.root.addChild(nextEnt);

    try {
      // Wait until JSON + buffers in RAM
      await new Promise<void>((resolve, reject) => {
        asset.once('load', resolve);
        asset.once('error', reject);
        app.assets.load(asset);
      });

      nextEnt.gsplat.asset = asset;   // Start GPU upload, appears soon
      pendingEnt = liveEnt;          // Mark previous as stale
      framesLeft = GRACE;            // Start overlap countdown
      liveEnt = nextEnt;             // Promote new entity
    } catch (err) {
      console.error(`Failed to load ${dir}`, err);
      app.root.removeChild(nextEnt);
      destroyAsset(asset);
    }
  }

  // Expose to grid
  window.switchModel = switchModel;
  
  // Load initial model
  switchModel('compressed_head_models/model_b1');
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
