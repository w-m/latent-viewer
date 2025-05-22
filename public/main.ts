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
  gsplat: pc.GSplatComponent & {
    instance?: {
      sorter: {
        once(event: 'updated', callback: () => void): void;
        on(event: 'updated', callback: () => void): void;
      };
    };
  };
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
        gridSize: 10, // Keep 10x10 grid
        totalWidth: 200, // Keep total size as is (assuming 120px * 10 cells)
        totalHeight: 200, // Keep total size as is (assuming 120px * 10 cells)
        indicatorOpacity: 0.7, // Example: Make indicator 70% opaque
        cornerColors: ['#009775', '#662d91', '#662d91', '#009775'],
        onLatentChange: (row: number, col: number) => {
          const modelPath = `compressed_head_models_512_10x10/model_c${col.toString().padStart(2, '0')}_r${row.toString().padStart(2, '0')}`;
          console.log(`Switching model to: ${modelPath}`);
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

  let liveEnt: GSplatEntity = makeViewer();
  let pendingEnt: GSplatEntity | null = null;

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

  /**
   * Switch to a new GSplat model
   * @param dir - Directory containing the model
   */
  async function switchModel(dir: string): Promise<void> {
    console.log(`Switching to model: ${dir}`);
    
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
        asset.once('load', () => {
          console.log(`Asset loaded: ${dir}`);
          resolve();
        });
        asset.once('error', (err) => {
          console.error(`Asset loading error: ${dir}`, err);
          reject(err);
        });
        app.assets.load(asset);
      });

      // Set the asset to start GPU upload
      nextEnt.gsplat.asset = asset;
      console.log(`Asset assigned to entity, waiting for renderer: ${dir}`);
      
      // Wait for the sorter to update - a single update means the model is rendered
      await new Promise<void>(resolve => {
        const maxRetries = 5;
        let retries = 0;
        
        const tryAttachSorterListener = () => {
          if (nextEnt.gsplat.instance?.sorter) {
            console.log(`Found sorter, attaching event listener: ${dir}`);
            nextEnt.gsplat.instance.sorter.once('updated', () => {
              console.log(`Sorter updated event received: ${dir}`);
              resolve();
            });
          } else {
            retries++;
            if (retries < maxRetries) {
              console.log(`Sorter not found, retry ${retries}/${maxRetries} for: ${dir}`);
              setTimeout(tryAttachSorterListener, 50 * retries); // Increasing backoff
            } else {
              // Fallback if sorter is not available after retries
              console.warn(`GSplat sorter not found after ${maxRetries} retries for ${dir}, using fallback`);
              setTimeout(resolve, 300);
            }
          }
        };
        
        // Start the retry process
        setTimeout(tryAttachSorterListener, 20);
      });
      
      // Now that new model is rendered, remove the old one
      if (liveEnt !== nextEnt) {
        console.log(`Removing old model, switching to: ${dir}`);
        app.root.removeChild(liveEnt);
        destroyAsset(liveEnt.gsplat.asset as pc.Asset | null);
      }
      
      // Promote new entity to live
      liveEnt = nextEnt;
      console.log(`Model switch complete: ${dir}`);
    } catch (err) {
      console.error(`Failed to load ${dir}`, err);
      app.root.removeChild(nextEnt);
      destroyAsset(asset);
    }
  }

  // Expose to grid
  window.switchModel = switchModel;
  
  // Load initial model
  switchModel('compressed_head_models_512_10x10/model_c04_r04');
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
