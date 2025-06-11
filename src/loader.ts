import * as pc from 'playcanvas';
import { MODEL_SIZES } from './model-sizes';

export const gridSize = 16;

export interface GSplatEntity extends pc.Entity {
  gsplat: pc.GSplatComponent & {
    instance?: {
      sorter: {
        once(event: 'updated', callback: () => void): void;
      };
    };
  };
}

export const countedCells = new Set<string>();
export let cachedBytes = 0;

export function modelPath(row: number, col: number): string {
  return `compressed_head_models_512_16x16/model_c${col
    .toString()
    .padStart(2, '0')}_r${row.toString().padStart(2, '0')}`;
}

export function parseRowCol(dir: string): [number, number] | null {
  const m = /model_c(\d+)_r(\d+)/.exec(dir);
  if (!m) return null;
  const col = parseInt(m[1], 10);
  const row = parseInt(m[2], 10);
  return [row, col];
}

export function initCachedBytes(): void {
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

let loadingDiv: HTMLDivElement | null = null;
let statusArea: HTMLDivElement | null = null;
let loadingIndicatorTimer: number | null = null;

export function createLoadingIndicator(container: HTMLElement) {
  if (loadingDiv) return;
  loadingDiv = document.createElement('div');
  loadingDiv.textContent = 'Loading model...';
  Object.assign(loadingDiv.style, {
    marginTop: '0px',
    padding: '4px 12px',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    fontWeight: '400',
    borderRadius: '9999px',
    pointerEvents: 'none',
    userSelect: 'none',
    backdropFilter: 'blur(2px)',
    visibility: 'hidden',
  } as CSSStyleDeclaration);
  container.appendChild(loadingDiv);
}

export function setLoadingIndicator(visible: boolean) {
  if (!statusArea) {
    statusArea = document.getElementById('statusArea') as HTMLDivElement | null;
  }

  if (statusArea) {
    if (visible) {
      statusArea.textContent = 'Loading model...';
      statusArea.style.color = '#bbb';
    } else {
      statusArea.textContent = '';
    }
  } else if (loadingDiv) {
    loadingDiv.style.visibility = visible ? 'visible' : 'hidden';
  }
}

export function initDynamicLoader(
  pcApp: any,
  updateDownloadStatus: (() => void) | null,
): void {
  const app = pcApp.app as pc.Application;

  let liveEnt: GSplatEntity = makeViewer();
  let pendingEnt: GSplatEntity | null = null;

  let currentToken = 0;
  let loading = false;
  let nextDir: string | null = null;

  app.root.addChild(liveEnt);

  function makeViewer(): GSplatEntity {
    const e = new pc.Entity('gsplat-holder') as GSplatEntity;
    e.addComponent('gsplat', { asset: null });
    return e;
  }

  function destroyAsset(asset: pc.Asset | null): void {
    if (asset?.resource && typeof asset.resource === 'object' && 'destroy' in asset.resource) {
      (asset.resource as { destroy(): void }).destroy();
    }
    if (asset) app.assets.remove(asset);
  }

  async function switchModel(dir: string): Promise<void> {
    if (loading) {
      nextDir = dir;
      return;
    }

    loading = true;

    if (loadingIndicatorTimer !== null) {
      clearTimeout(loadingIndicatorTimer);
    }
    loadingIndicatorTimer = window.setTimeout(() => {
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

    const myToken = ++currentToken;

    if (pendingEnt) {
      const oldAsset = pendingEnt.gsplat?.asset as pc.Asset | null;
      pendingEnt.destroy();
      destroyAsset(oldAsset);
      pendingEnt = null;
    }

    const url = new URL(`${dir}/meta.json`, document.baseURI).href;
    const asset = new pc.Asset(`gsplat-${dir}`, 'gsplat', { url });
    app.assets.add(asset);

    const nextEnt = makeViewer();
    app.root.addChild(nextEnt);
    pendingEnt = nextEnt;

    let assetError: Error | null = null;
    const onAssetError = (a: pc.Asset, e: unknown) => {
      const fileUrl = (a.file as any)?.url;
      if (typeof fileUrl === 'string' && fileUrl.includes(`${dir}/`)) {
        assetError = e instanceof Error ? e : new Error(String(e));
      }
    };
    app.assets.on('error', onAssetError);

    try {
      const metaResp = await fetch(url);
      if (!metaResp.ok) {
        throw new Error(`Meta file not found for model '${dir}' (HTTP ${metaResp.status})`);
      }
      const metaJson = await metaResp.json();
      if (!metaJson || !metaJson.means) {
        throw new Error(`Invalid meta.json for model '${dir}' (missing means)`);
      }
      asset.data = metaJson;

      await new Promise<void>((resolve, reject) => {
        asset.once('load', resolve);
        asset.once('error', reject);
        app.assets.load(asset);
      });
      if (assetError) throw assetError;

      if (myToken !== currentToken) {
        nextEnt.destroy();
        destroyAsset(asset);
        return;
      }

      nextEnt.gsplat.asset = asset;
      if (assetError) throw assetError;

      await new Promise<void>((resolve) => {
        const maxRetries = 5;
        let tries = 0;
        const attach = () => {
          if (nextEnt.gsplat.instance?.sorter) {
            nextEnt.gsplat.instance.sorter.once('updated', resolve);
          } else if (++tries < maxRetries) {
            setTimeout(attach, 50 * tries);
          } else {
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

          if (typeof (app as any).renderNextFrame === 'function') {
            (app as any).renderNextFrame();
          }

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

  (window as any).switchModel = switchModel;

  if ((window as any)._pendingSwitchModelDir) {
    const dir = (window as any)._pendingSwitchModelDir;
    (window as any)._pendingSwitchModelDir = null;
    switchModel(dir);
  }
}

