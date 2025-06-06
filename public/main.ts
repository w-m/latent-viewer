// 1) web-components runtime
import '@playcanvas/web-components';

// 2) expose PlayCanvas build
import * as pc from 'playcanvas';
// Define on window for compatibility with existing code
declare global {
  interface Window {
    pc: typeof pc;
    switchModel: (dir: string) => Promise<void>;
    _pendingSwitchModelDir?: string | null;
    markCellCached?: (row: number, col: number) => void;
    setGridLoading?: (v: boolean) => void;
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

// ---------------------------------------------------------------------------
// No global debounce anymore – dynamic gating is handled inside switchModel.
// ---------------------------------------------------------------------------

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
window._pendingSwitchModelDir = null;

// Placeholder – stores the requested directory until the real implementation
// becomes available (after the PlayCanvas application is ready).
window.switchModel = async (dir: string): Promise<void> => {
  window._pendingSwitchModelDir = dir;
};

function parseRowCol(dir: string): [number, number] | null {
  const m = /model_c(\d+)_r(\d+)/.exec(dir);
  if (!m) return null;
  const col = parseInt(m[1], 10);
  const row = parseInt(m[2], 10);
  return [row, col];
}

// Global initialization flag to prevent multiple initializations
let hasInitialized = false;

// ------------------------------------------------------------------
// Loading indicator (pill in top-left corner)
// ------------------------------------------------------------------

let loadingDiv: HTMLDivElement | null = null;
// Timer identifier for delayed loading indicator
let loadingIndicatorTimer: number | null = null;

function createLoadingIndicator(container: HTMLElement) {
  if (loadingDiv) return;
  loadingDiv = document.createElement('div');
  loadingDiv.textContent = 'Loading model...';
  Object.assign(loadingDiv.style, {
    marginTop: '0px',
    padding: '4px 12px',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '13px',
    borderRadius: '9999px',
    pointerEvents: 'none',
    userSelect: 'none',
    backdropFilter: 'blur(2px)',
    visibility: 'hidden', // reserve layout space while keeping it hidden
  } as CSSStyleDeclaration);
  container.appendChild(loadingDiv);
}

function setLoadingIndicator(visible: boolean) {
  if (!loadingDiv) return;
  loadingDiv.style.visibility = visible ? 'visible' : 'hidden';
}

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

      // Access PlayCanvas application instance
      const app = (pcApp as any).app as pc.Application;

      // ------------------------------------------------------------
      // Background color picker hookup
      // ------------------------------------------------------------

      const colorInput = document.getElementById('bgColorPicker') as HTMLInputElement | null;
      if (colorInput) {
        const applyColor = (hex: string) => {
          // Converts #RRGGBB -> pc.Color
          if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) return;
          const clean = hex.startsWith('#') ? hex.substring(1) : hex;
          const r = parseInt(clean.substring(0, 2), 16) / 255;
          const g = parseInt(clean.substring(2, 4), 16) / 255;
          const b = parseInt(clean.substring(4, 6), 16) / 255;
          const camEnt = app.root.findByName('camera') as (pc.Entity & { camera?: pc.CameraComponent }) | null;
          if (camEnt && camEnt.camera) {
            camEnt.camera.clearColor.set(r, g, b, 1);
          }
        };

        // Initial value
        applyColor(colorInput.value);

        colorInput.addEventListener('input', () => {
          applyColor((colorInput as HTMLInputElement).value);
        });
      }

      // --- dynamic GSplat loader
      // Loading indicator is created in initializeReactGrid now.
      
      // --- dynamic GSplat loader
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

    // Ensure loading indicator exists under the grid (once)
    const section = gridContainer.closest('.latent-section') as HTMLElement | null;
    if (section) {
      createLoadingIndicator(section);
    }

    let gridLoading = false;

    const renderGrid = () => {
      root.render(
        React.createElement(LatentGrid, {
          gridSize: 16,
          totalWidth: 200,
          totalHeight: 200,
          indicatorOpacity: 0.7,
          cornerColors: ['#009775', '#662d91', '#662d91', '#009775'],
          isLoading: gridLoading,
          onLatentChange: (row: number, col: number) => {
            const modelPath = `compressed_head_models_512_16x16/model_c${col
              .toString()
              .padStart(2, '0')}_r${row.toString().padStart(2, '0')}`;
            window.switchModel(modelPath);
          },
        })
      );
    };

    renderGrid();

    // Expose setter so the loader can toggle loading state
    (window as any).setGridLoading = (v: boolean) => {
      gridLoading = v;
      renderGrid();
    };
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

  // Dynamic gating – true while a model is downloading / uploading / waiting
  // for its first frame.  Subsequent requests are queued in nextDir.
  let loading = false;
  let nextDir: string | null = null;

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
    // If already processing a load, just remember the latest requested dir and
    // return.  When the current load completes we'll immediately start this
    // queued request.  This provides *instant* first-load behaviour and
    // throttles only while a model is in-flight.
    if (loading) {
      nextDir = dir;
      return;
    }

    loading = true;

    // Show loading indicator only if loading persists beyond 200 ms to avoid
    // flicker during instantaneous (cached) switches.
    if (loadingIndicatorTimer !== null) {
      clearTimeout(loadingIndicatorTimer);
    }
    loadingIndicatorTimer = window.setTimeout(() => {
      setLoadingIndicator(true);
      (window as any).setGridLoading?.(true);
      loadingIndicatorTimer = null;
    }, 200);

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

        const rc = parseRowCol(dir);
        if (rc) {
          (window as any).markCellCached?.(rc[0], rc[1]);
        }

        // For on-demand renderers request another frame so the removal is
        // visible without user interaction.
        if (typeof (app as any).renderNextFrame === 'function') {
          (app as any).renderNextFrame();
        }

        // Mark loading done and process any queued request.
        loading = false;
        if (!nextDir) {
          if (loadingIndicatorTimer !== null) {
            clearTimeout(loadingIndicatorTimer);
            loadingIndicatorTimer = null;
          }
          setLoadingIndicator(false);
          (window as any).setGridLoading?.(false);
        }
        if (nextDir) {
          const q = nextDir;
          nextDir = null;
          switchModel(q);
        }
      });
    } catch (err) {
      console.error(`Failed to load ${dir}`, err);
      nextEnt.destroy();
      destroyAsset(asset);
      loading = false;
      if (!nextDir) {
        if (loadingIndicatorTimer !== null) {
          clearTimeout(loadingIndicatorTimer);
          loadingIndicatorTimer = null;
        }
        setLoadingIndicator(false);
        (window as any).setGridLoading?.(false);
      }
      if (nextDir) {
        const q = nextDir;
        nextDir = null;
        switchModel(q);
      }
    }
  }

  // Expose to grid
  window.switchModel = switchModel;

  // If a model was requested before the loader was ready, load it now.
  if (window._pendingSwitchModelDir) {
    const dir = window._pendingSwitchModelDir;
    window._pendingSwitchModelDir = null;
    switchModel(dir);
  }

  // The initial model is now selected by the LatentGrid component, which
  // invokes `switchModel` once upon mounting with a randomly chosen cell.
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
