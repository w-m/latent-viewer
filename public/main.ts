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
    cancelBulkDownload?: () => void;
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
import { LatentGrid, LatentGridHandle } from './LatentGrid';
import { MODEL_SIZES, TOTAL_MODEL_BYTES } from '../src/model-sizes';

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

// Keep a reference to the placeholder for readiness checks
const placeholderSwitchModel = window.switchModel;

function parseRowCol(dir: string): [number, number] | null {
  const m = /model_c(\d+)_r(\d+)/.exec(dir);
  if (!m) return null;
  const col = parseInt(m[1], 10);
  const row = parseInt(m[2], 10);
  return [row, col];
}

// Global initialization flag to prevent multiple initializations
let hasInitialized = false;

// ------------------------------------------------------------
// Bulk download state
// ------------------------------------------------------------

const gridSize = 16;
let cachedBytes = 0;
const countedCells = new Set<string>();
let bulkAbort: { canceled: boolean } | null = null;
let updateDownloadStatus: (() => void) | null = null;
let programmaticMove = false;

function modelPath(row: number, col: number): string {
  return `compressed_head_models_512_16x16/model_c${col.toString().padStart(2, '0')}_r${row.toString().padStart(2, '0')}`;
}

function initCachedBytes() {
  try {
    const stored = localStorage.getItem('cachedCells');
    if (stored) {
      const arr = JSON.parse(stored);
      if (Array.isArray(arr) && arr.length === gridSize) {
        for (let r = 0; r < gridSize; r++) {
          for (let c = 0; c < gridSize; c++) {
            if (arr[r][c]) {
              const p = modelPath(r, c);
              cachedBytes += MODEL_SIZES[p] || 0;
              countedCells.add(`${r},${c}`);
            }
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
}

initCachedBytes();

// ------------------------------------------------------------------
// Loading indicator (pill in top-left corner)
// ------------------------------------------------------------------

let loadingDiv: HTMLDivElement | null = null;
let statusArea: HTMLDivElement | null = null;
// Timer identifier for delayed loading indicator
let loadingIndicatorTimer: number | null = null;

function createLoadingIndicator(container: HTMLElement) {
  // Don't try to find statusArea here - it might not exist yet
  // Instead, we'll look for it when we actually need to show/hide the indicator
  
  // Create fallback loading indicator as before
  if (loadingDiv) return;
  loadingDiv = document.createElement('div');
  loadingDiv.textContent = 'Loading model...';
  Object.assign(loadingDiv.style, {
    marginTop: '0px',
    padding: '4px 12px',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    fontWeight: '400',
    borderRadius: '9999px',
    pointerEvents: 'none',
    userSelect: 'none',
    backdropFilter: 'blur(2px)',
    visibility: 'hidden', // reserve layout space while keeping it hidden
  } as CSSStyleDeclaration);
  container.appendChild(loadingDiv);
}

function setLoadingIndicator(visible: boolean) {
  // Look for statusArea each time we need it (it might not exist during early initialization)
  if (!statusArea) {
    statusArea = document.getElementById('statusArea') as HTMLDivElement | null;
  }
  
  if (statusArea) {
    if (visible) {
      statusArea.textContent = 'Loading model...';
      statusArea.style.color = '#bbb'; // Reset to normal color
    } else {
      statusArea.textContent = '';
    }
  } else if (loadingDiv) {
    loadingDiv.style.visibility = visible ? 'visible' : 'hidden';
  }
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
  initFullscreenButton();
  initSettingsButton();
  
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

  const gridRef = React.createRef<LatentGridHandle>();

  const downloadBtn = document.getElementById('downloadAllBtn') as HTMLButtonElement | null;
  const statusDiv = document.getElementById('downloadStatus') as HTMLDivElement | null;

  const updateStatus = () => {
    if (!statusDiv) return;
    const mb = (cachedBytes / (1024 * 1024)).toFixed(1);
    const totalMb = (TOTAL_MODEL_BYTES / (1024 * 1024)).toFixed(1);
    statusDiv.textContent = `${mb} MB / ${totalMb} MB`;
  };

  updateStatus();
  updateDownloadStatus = updateStatus;

  function cancelBulkDownload() {
    if (bulkAbort && downloadBtn) {
      bulkAbort.canceled = true;
      downloadBtn.classList.remove('downloading');
      downloadBtn.title = 'Download and cache all models';
      programmaticMove = false;
    }
  }
  window.cancelBulkDownload = cancelBulkDownload;
  gridContainer.addEventListener('pointerdown', cancelBulkDownload);

  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      if (bulkAbort) {
        bulkAbort.canceled = true;
        bulkAbort = null;
        downloadBtn.classList.remove('downloading');
        downloadBtn.title = 'Download and cache all models';
        return;
      }

      // Wait for the real switchModel implementation
      if (window.switchModel === placeholderSwitchModel) {
        await new Promise<void>((resolve) => {
          const id = setInterval(() => {
            if (window.switchModel !== placeholderSwitchModel) {
              clearInterval(id);
              resolve();
            }
          }, 50);
        });
      }

      bulkAbort = { canceled: false };
      downloadBtn.classList.add('downloading');
      downloadBtn.title = 'Cancel download';

      let cells: boolean[][] = [];
      try {
        const stored = localStorage.getItem('cachedCells');
        if (stored) cells = JSON.parse(stored);
      } catch {
        cells = [];
      }

      try {
        for (let r = 0; r < gridSize; r++) {
          for (let c = 0; c < gridSize; c++) {
            if (bulkAbort.canceled) break;
            if (cells[r]?.[c]) continue;
            programmaticMove = true;
            gridRef.current?.setActiveCell(r, c);
            try {
              await window.switchModel(modelPath(r, c));
            } catch (error) {
              console.error(
                `Error loading model during bulk download: ${modelPath(r, c)}`,
                error
              );
              bulkAbort.canceled = true;
              break;
            }
            programmaticMove = false;
            if (bulkAbort.canceled) break;
            if (!cells[r]) cells[r] = [] as any;
            cells[r][c] = true;
          }
          if (bulkAbort.canceled) break;
        }
      } finally {
        downloadBtn.classList.remove('downloading');
        downloadBtn.title = 'Download and cache all models';
        bulkAbort = null;
        programmaticMove = false;
      }
    });
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
          ref: gridRef,
          gridSize: 16,
          totalWidth: 200,
          totalHeight: 200,
          indicatorOpacity: 0.7,
          cornerColors: ['#009775', '#662d91', '#662d91', '#009775'],
          isLoading: gridLoading,
          onLatentChange: (row: number, col: number) => {
            if (programmaticMove) return;
            window.cancelBulkDownload?.();
            const path = modelPath(row, col);
            window.switchModel(path);
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
 * Hook up the fullscreen toggle button
 */
function initFullscreenButton(): void {
  const btn = document.getElementById('fullscreenBtn') as HTMLButtonElement | null;
  if (!btn) return;
  const container = document.querySelector('.container') as HTMLElement | null;
  btn.addEventListener('click', () => {
    if (!container) return;
    if (!document.fullscreenElement) {
      const req =
        (container as any).requestFullscreen ||
        (container as any).webkitRequestFullscreen ||
        (container as any).msRequestFullscreen;
      req?.call(container);
    } else {
      const exit =
        (document as any).exitFullscreen ||
        (document as any).webkitExitFullscreen ||
        (document as any).msExitFullscreen;
      exit?.call(document);
    }
  });
}

/**
 * Hook up the settings button and panel
 */
function initSettingsButton(): void {
  const btn = document.getElementById('settingsBtn') as HTMLButtonElement | null;
  const panel = document.getElementById('settingsPanel') as HTMLDivElement | null;
  
  if (!btn || !panel) return;
  
  // Toggle settings panel
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('show');
  });
  
  // Hide panel when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target as Node) && e.target !== btn) {
      panel.classList.remove('show');
    }
  });
  
  // Handle escape key to close panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('show')) {
      panel.classList.remove('show');
    }
  });
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
      // Look for statusArea each time we need it
      if (!statusArea) {
        statusArea = document.getElementById('statusArea') as HTMLDivElement | null;
      }
      
      if (statusArea) {
        statusArea.textContent = 'Loading model...';
        statusArea.style.color = '#bbb';
      } else if (loadingDiv) {
        loadingDiv.textContent = 'Loading model...';
        loadingDiv.style.background = 'rgba(0,0,0,0.6)';
      }
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

    // Listen for asset (JSON or texture) errors for this model
    let assetError: Error | null = null;
    const onAssetError = (a: pc.Asset, e: unknown) => {
      const fileUrl = (a.file as any)?.url;
      if (typeof fileUrl === 'string' && fileUrl.includes(`${dir}/`)) {
        assetError = e instanceof Error ? e : new Error(String(e));
      }
    };
    app.assets.on('error', onAssetError);

    try {
    // 1. Load & sanity-check meta.json (catch both 404 and SPA-fallback)
    const metaResp = await fetch(url);
    if (!metaResp.ok) {
      throw new Error(`Meta file not found for model '${dir}' (HTTP ${metaResp.status})`);
    }
    const metaJson = await metaResp.json();
    if (!metaJson || !metaJson.means) {
      throw new Error(`Invalid meta.json for model '${dir}' (missing means)`);
    }
    asset.data = metaJson;

    // 2. Download / decode JSON + buffers -----------------------------
    await new Promise<void>((resolve, reject) => {
        asset.once('load', resolve);
        asset.once('error', reject);
        app.assets.load(asset);
      });
      if (assetError) throw assetError;

      if (myToken !== currentToken) {
        // Superseded
        nextEnt.destroy();
        destroyAsset(asset);
        return;
      }

      // 3. Kick off GPU upload -----------------------------------------
      nextEnt.gsplat.asset = asset;
      if (assetError) throw assetError;

      // 4. Wait for first sorter update (splat renderer ready) ----------
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
      if (assetError) throw assetError;

      if (myToken !== currentToken) {
        nextEnt.destroy();
        destroyAsset(asset);
        return;
      }

      // 5. Keep both models for the first rendered frame, then retire old
      await new Promise<void>((resolve) => {
        app.once('frameend', () => {
          if (myToken !== currentToken) {
            resolve();
            return;
          }

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
            const key = `${rc[0]},${rc[1]}`;
            if (!countedCells.has(key)) {
              const p = modelPath(rc[0], rc[1]);
              cachedBytes += MODEL_SIZES[p] || 0;
              countedCells.add(key);
              updateDownloadStatus?.();
            }
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
          resolve();
        });
      });
      if (assetError) throw assetError;
    } catch (err) {
      console.error(`Failed to load ${dir}`, err);
      nextEnt.destroy();
      destroyAsset(asset);
      loading = false;
      nextDir = null;
      if (loadingIndicatorTimer !== null) {
        clearTimeout(loadingIndicatorTimer);
        loadingIndicatorTimer = null;
      }
      // Look for statusArea each time we need it
      if (!statusArea) {
        statusArea = document.getElementById('statusArea') as HTMLDivElement | null;
      }
      
      if (statusArea) {
        statusArea.textContent = 'Error loading model';
        statusArea.style.color = '#ff6666';
      } else if (loadingDiv) {
        loadingDiv.textContent = 'Error loading model';
        loadingDiv.style.background = 'rgba(128,0,0,0.8)';
        loadingDiv.style.visibility = 'visible';
      }
      (window as any).setGridLoading?.(false);
    } finally {
      app.assets.off('error', onAssetError);
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
