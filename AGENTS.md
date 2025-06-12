# Latent Viewer — design notes

The project displays 3D Gaussian Splatting scenes in the browser. A React-based
latent grid selects the model to show. PlayCanvas handles rendering via web
components. The viewer is optimized for quick scrubbing and small bundles.

## Core architecture

- **Web components** – `<pc-app>` and `<pc-splat>` create the scene. Helpers
  (`camera-controls`, `xr-controllers`, `xr-navigation`) are ES modules
  registered with `pc.registerScript` once the app is ready.
- **Vite build** – `public` is the root. Production builds disable source maps
  and comments. `package.json` marks `sideEffects: false` for tree shaking.
- **Data root** – `VITE_DATA_ROOT` must point to a folder containing the 16×16
  model grid (`model_c## _r##`). `scripts/gen-meta.js` generates
  `latent-viewer-meta.json` with byte sizes. `scripts/get-test-data.js` downloads
  the demo data in parallel.
- **Latent grid** – `LatentGrid.tsx` uses `react-konva`. It tracks cached cells
  in localStorage and issues a single debounced load request. A bulk download
  button can pre-cache everything and is cancelable.

## Loader behaviour (`public/main.ts`)

The loader evolved across commits `fd7e0a3`, `97e4ba5`, `a95df4f` and now
ensures smooth transitions:

1. Debounce pointer input (~180 ms).
2. Increment a `currentToken` per request and abort stale async stages.
3. Maintain only `liveEnt` and `pendingEnt`. Older pending entities are
   destroyed immediately.
4. Wait for `gsplat.instance.sorter.once('updated')` before considering the new
   model ready.
5. Swap entities on the next `app.on('frameend')` so a model is always visible.
6. Call `app.renderNextFrame?.()` after the swap to wake Safari.

This keeps memory usage bounded and avoids flicker when scrubbing the grid.

## Relative paths

The page should support both loading from it being the root site, but also should
support being included in a iframe in another page. An example is in the root dir,
in index.html, which includes the dist/index.html. It's important that the paths
(both for model loading and for loading the assets JS code) work for both of
these cases.

## Development

- Node 18+. `npm run dev` starts Vite; `npm run build` checks types and builds.
- ESLint and Prettier run on every commit via Husky.
- Vitest contains a loader queue test (`modelSwitch.test.ts`).
