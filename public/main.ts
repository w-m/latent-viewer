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

// ------------------------------------------------------------
// Utility: small debounce implementation (trailing-edge only)
// ------------------------------------------------------------

// leading + trailing throttle: first call executes immediately, subsequent
// calls within `interval` are collapsed and only the *last* one is executed at
// the end of the window.
function throttleLatest<F extends (...args: any[]) => void>(
  fn: F,
  interval = 150
) {
  let lastArgs: Parameters<F> | null = null;
  let inCooldown = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return (...args: Parameters<F>) => {
    if (!inCooldown) {
      // Leading edge: run immediately
      fn(...args);
      inCooldown = true;

      timer = setTimeout(() => {
        inCooldown = false;
        if (lastArgs) {
          const callArgs = lastArgs;
          lastArgs = null;
          fn(...callArgs);
        }
      }, interval);
    } else {
      // Within the interval – remember latest args
      lastArgs = args;
    }
  };
}

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
    // Throttle so the *first* cell starts loading instantly, then collapse
    // further pointer moves for 150 ms; finally load the last cell if the
    // pointer settled somewhere else.
    const queuedSwitch = throttleLatest((row: number, col: number) => {
      const modelPath = `compressed_head_models_512_10x10/model_c${col
        .toString()
        .padStart(2, '0')}_r${row.toString().padStart(2, '0')}`;
      console.log(`Debounced switch to model: ${modelPath}`);
      window.switchModel(modelPath);
    }, 180); // ~6 fps – feels instant yet filters frantic scrubs

    root.render(
      React.createElement(LatentGrid, {
        gridSize: 10,
        totalWidth: 200,
        totalHeight: 200,
        indicatorOpacity: 0.7,
        cornerColors: ['#009775', '#662d91', '#662d91', '#009775'],
        onLatentChange: (row: number, col: number) => {
          queuedSwitch(row, col);
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

  // Monotonically increasing token identifying the most recent switchModel() call.
  let currentToken = 0;

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

    // Increment the token that identifies the most-recent request. Any earlier
    // async chains still running will exit once they notice their token is
    // stale.
    const myToken = ++currentToken;

    // Ensure we never have more than two GSplat entities (live + newest
    // pending). If something is already loading, discard it right away.
    if (pendingEnt) {
      const oldAsset = pendingEnt.gsplat?.asset as pc.Asset | null;
      pendingEnt.destroy();
      destroyAsset(oldAsset);
      pendingEnt = null;
    }

    // ---- Build asset & entity ------------------------------------------------
    const url = new URL(`${dir}/meta.json`, document.baseURI).href;
    const asset = new pc.Asset(`gsplat-${dir}`, 'gsplat', { url });
    app.assets.add(asset);

    const nextEnt = makeViewer();
    app.root.addChild(nextEnt);
    pendingEnt = nextEnt;

    try {
      // 1. Download / decode JSON + buffers -----------------------------
      await new Promise<void>((resolve, reject) => {
        asset.once('load', resolve);
        asset.once('error', reject);
        app.assets.load(asset);
      });

      if (myToken !== currentToken) {
        // Superseded
        nextEnt.destroy();
        destroyAsset(asset);
        return;
      }

      // 2. Kick off GPU upload -----------------------------------------
      nextEnt.gsplat.asset = asset;

      // 3. Wait for first sorter update (splat renderer ready) ----------
      await new Promise<void>((resolve) => {
        const maxRetries = 5;
        let tries = 0;
        const attach = () => {
          if (nextEnt.gsplat.instance?.sorter) {
            nextEnt.gsplat.instance.sorter.once('updated', resolve);
          } else if (++tries < maxRetries) {
            setTimeout(attach, 50 * tries);
          } else {
            // Give it a bit more time as a fallback
            setTimeout(resolve, 300);
          }
        };
        attach();
      });

      if (myToken !== currentToken) {
        nextEnt.destroy();
        destroyAsset(asset);
        return;
      }

      // 4. Keep both models for the first rendered frame, then retire old
      app.once('frameend', () => {
        if (myToken !== currentToken) return; // superseded in the meantime

        if (liveEnt && liveEnt !== nextEnt) {
          const liveAsset = liveEnt.gsplat?.asset as pc.Asset | null;
          liveEnt.destroy();
          destroyAsset(liveAsset);
        }

        liveEnt = nextEnt;
        pendingEnt = null;

        // For on-demand renderers request another frame so the removal is
        // visible without user interaction.
        if (typeof (app as any).renderNextFrame === 'function') {
          (app as any).renderNextFrame();
        }
      });
    } catch (err) {
      console.error(`Failed to load ${dir}`, err);
      nextEnt.destroy();
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
