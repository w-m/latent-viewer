import '@playcanvas/web-components';
import * as pc from 'playcanvas';
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
import { XrControllers } from 'playcanvas/scripts/esm/xr-controllers.mjs';
import { XrNavigation } from 'playcanvas/scripts/esm/xr-navigation.mjs';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { LatentGrid, LatentGridHandle } from './LatentGrid';

import {
  initDynamicLoader,
  createLoadingIndicator,
  initCachedBytes,
  modelPath,
  gridSize,
  cachedBytes,
} from '../src/loader';
import { initFullscreenButton, initSettingsButton } from '../src/ui';
import { TOTAL_MODEL_BYTES } from '../src/model-sizes';

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
window._pendingSwitchModelDir = null;
window.switchModel = async (dir: string): Promise<void> => {
  window._pendingSwitchModelDir = dir;
};
const placeholderSwitchModel = window.switchModel;

let hasInitialized = false;
let bulkAbort: { canceled: boolean } | null = null;
let updateDownloadStatus: (() => void) | null = null;
let programmaticMove = false;

initCachedBytes();

function initApplication(): void {
  if (hasInitialized) return;
  hasInitialized = true;

  const pcApp = document.querySelector('pc-app');
  if (!pcApp) {
    console.error('<pc-app> not found in DOM');
    return;
  }

  initializeReactGrid();
  initFullscreenButton();
  initSettingsButton();

  pcApp.addEventListener(
    'ready',
    () => {
      pc.registerScript(CameraControls, 'cameraControls');
      pc.registerScript(XrControllers, 'xrControllers');
      pc.registerScript(XrNavigation, 'xrNavigation');

      const app = (pcApp as any).app as pc.Application;

      const colorInput = document.getElementById('bgColorPicker') as HTMLInputElement | null;
      if (colorInput) {
        const applyColor = (hex: string) => {
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
        applyColor(colorInput.value);
        colorInput.addEventListener('input', () => {
          applyColor((colorInput as HTMLInputElement).value);
        });
      }

      initDynamicLoader(pcApp as any, updateDownloadStatus);
    },
    { once: true },
  );
}

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
              console.error(`Error loading model during bulk download: ${modelPath(r, c)}`, error);
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

  const root = createRoot(gridContainer);
  const section = gridContainer.closest('.latent-section') as HTMLElement | null;
  if (section) {
    createLoadingIndicator(section);
  }

  let gridLoading = false;

  const renderGrid = () => {
    root.render(
      React.createElement(LatentGrid, {
        ref: gridRef,
        gridSize,
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
      }),
    );
  };

  renderGrid();

  (window as any).setGridLoading = (v: boolean) => {
    gridLoading = v;
    renderGrid();
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApplication);
} else {
  initApplication();
}

window.addEventListener('load', () => {
  if (!hasInitialized) initApplication();
});
