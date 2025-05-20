// 1) web-components runtime
import '@playcanvas/web-components';

// 2) expose PlayCanvas build
import * as pc from 'playcanvas';
window.pc = pc;

// 3) helper scripts
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
import { XrControllers } from 'playcanvas/scripts/esm/xr-controllers.mjs';
import { XrNavigation } from 'playcanvas/scripts/esm/xr-navigation.mjs';

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
// ------------------------------------------------------------------
function initDynamicLoader(pcApp) {
  const app      = pcApp.app;
  const toggle   = document.getElementById('modelToggle');

  // permanent entity that owns the gsplat component
  const holder = new pc.Entity('viewer');
  holder.addComponent('gsplat', { asset: null });
  app.root.addChild(holder);

  // simple LRU cache: dir → Asset  (insertion order = recency)
  const cache      = new Map();
  const MAX_CACHE  = 8;               // keep last N models in RAM

  // hard-unload asset + purge handler caches
  function evict(asset) {
    if (holder.gsplat.asset === asset) holder.gsplat.asset = null;

    app.assets.remove(asset);
    asset.resource?.destroy();        // VB / IB / textures
    asset.unload();

    const texH = app.loader.getHandler('texture');
    const binH = app.loader.getHandler('binary');
    asset.file?.textures?.forEach((t) => texH._cache.delete(t.url));
    asset.file?.buffers ?.forEach((b) => binH._cache.delete(b.url));
  }

  async function getAsset(dir) {
    if (cache.has(dir)) {
      // bump to most-recent
      const a = cache.get(dir);
      cache.delete(dir);
      cache.set(dir, a);
      return a;
    }

    const url   = new URL(`${dir}/meta.json`, document.baseURI).href;
    const asset = new pc.Asset(`gsplat-${dir}`, 'gsplat', { url });
    app.assets.add(asset);

    // start load *before* waiting for completion
    app.assets.load(asset);
    await new Promise((res, rej) => {
      asset.once('load', res);
      asset.once('error', rej);
    });

    cache.set(dir, asset);

    // LRU eviction
    if (cache.size > MAX_CACHE) {
      const [ , oldest ] = cache.entries().next().value; // first inserted
      cache.delete(oldest.name.replace('gsplat-', ''));
      evict(oldest);
    }
    return asset;
  }

  async function switchModel(dir) {
    holder.gsplat.asset = await getAsset(dir);
  }

  // initial model
  switchModel('truck');

  // UI toggle
  toggle.addEventListener('change', () =>
    switchModel(toggle.checked ? 'face' : 'truck')
  );
}