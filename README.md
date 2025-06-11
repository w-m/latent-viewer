# Latent-Viewer – Gaussian-Splat & SOGS demo

Latent-Viewer is a **zero-boilerplate** PlayCanvas setup for viewing
3-D Gaussian Splat (GSplat) scenes in the browser. It supports:

- Desktop & mobile orbit / pan / zoom camera (inertia, touch, wheel …)
- Optional WebXR controller + teleport navigation
- Both **raw \*.ply** splats and **compressed SOGS** assets
- Production builds tree-shake and minify dependencies and app code (~2.2 MB uncompressed JS; ~650 kB gzipped JS; scene data loaded on demand)

Everything is declaratively described in **HTML** via
[`@playcanvas/web-components`](https://github.com/playcanvas/playcanvas-web-components).

---

## Quick start

```bash
# 1. Clone the repo & install deps
git clone https://github.com/w-m/latent-viewer.git
cd latent-viewer

# Install dependencies
npm install        # or pnpm / yarn

# 2. Start the dev server
npm run dev        # http://localhost:5173 (auto-reload)

# 3. Build a static bundle (optional)
npm run build      # outputs to ./dist

# 4. Preview production build
npm run preview    # serves the ./dist folder
```

### Download test data (optional)

To experiment with the latent grid using the models from the
[CGS-GAN](https://fraunhoferhhi.github.io/cgs-gan/) paper, run:

```bash
npm run get-test-data
```

This downloads all 256 folders (711.6&nbsp;MB) of compressed head models into
`public/compressed_head_models_512_16x16/`. The script fetches files in parallel
to speed up the process.

### Requirements

- **Node 18 LTS** or newer (uses modern `import`/`export`)
- Git (for cloning the repository)

---

## Project layout

```
latent-viewer/
├── public/                         # Static assets served by Vite
│   ├── index.html                  # Application shell: latent grid + PlayCanvas canvas
│   ├── main.ts                     # Bootstrap & dynamic loader (switchModel, UI hookups)
│   ├── head.ply                    # Example raw GSplat dataset (legacy)
│   ├── compressed_head_models_512_16x16/  # Example compressed SOGS datasets
│   ├── grid-demo.html              # Standalone latent-grid prototype
│   ├── grid-demo.tsx               # Source for grid-demo.html
│   └── LatentGrid.tsx              # React component for the interactive latent grid
├── src/                    # Type definitions and generated model-size index
├── dist/              # Production build (generated)
├── package.json       # Dependencies & scripts
├── vite.config.js     # Vite zero-config with custom root/outDir
└── README.md          # You are here

### Demo pages

* **`/index.html`** – full viewer: latent grid + PlayCanvas canvas.
* **`/grid-demo.html`** – standalone latent-grid demo used during early
  prototyping.
```

---

## How it works

1. **Web components** – `<pc-app>`, `<pc-entity>`, and `<pc-splat>` auto-create the PlayCanvas application and scene graph. Models are loaded dynamically via the `switchModel()` function rather than static asset tags.

2. **Dynamic loader** – `switchModel(dir)` in `public/main.ts`:

   - Fetches and sanity-checks `meta.json`
   - Loads the GSplat JSON and texture assets via the PlayCanvas asset pipeline
   - Waits for the internal sorter update and a frame-end before swapping models
   - Uses token-based cancellation and live/pending-entity logic to guarantee zero flicker and at most two GSplat entities in memory.

3. **Helper scripts** – Orbit camera, XR controllers, and teleport scripts are ES modules in `playcanvas/scripts/esm/`. They are imported and registered in `public/main.ts` (via `pc.registerScript`) so the `<pc-script name="cameraControls">`, `<pc-script name="xrControllers">`, and `<pc-script name="xrNavigation">` tags work out-of-the-box.

4. **Bundling** – Vite tree-shakes the PlayCanvas engine, helper scripts, React, Konva, and application code. Unused code is removed automatically for optimal production builds.

---

## Adding your own scene

To add your own GSplat datasets or raw `.ply` files:

1. Copy your raw `*.ply` file or a SOGS folder (containing `meta.json` and texture files) into the `public/` directory (e.g. under `compressed_head_models_512_16x16/`).
2. Re-generate the model-size index (used for caching and download counters) and restart the dev server:

   ```bash
   npm run dev
   ```

3. Use the latent grid UI to navigate to the cell corresponding to your new model and load it.

---

## Dependencies

The project uses PlayCanvas, @playcanvas/web-components, React, and Konva from npm. To update to the latest versions, run:

```
npm i -g npm-check-updates
ncu -u
npm install
```

---

## Model Switching Implementation

This project includes an enhanced model switching implementation that eliminates flickering between 3D Gaussian Splat models. The implementation uses PlayCanvas's `sorter.on('updated')` event to detect when a model is fully loaded and ready to render before switching.

### Building and Running with Model Switching

```bash
# 1. Install dependencies
npm install

# 2. Development server with hot reload
npm run dev        # Starts the dev server at http://localhost:5173

# 3. Build the project for production
npm run build      # Outputs optimized files to ./dist

# 4. Preview the production build
npm run preview    # Serves the ./dist folder
```

### How Model Switching Works

The **2024-05** rewrite introduced a robust, cross-browser loader that keeps
scrubbing fluid while guaranteeing zero flicker and _at most two_ GSplat
entities in the scene:

1. **Debounced requests** – the latent-space grid calls `switchModel()` via a
   180 ms trailing-edge debounce so only the cell you _end up on_ actually
   initiates a load.

2. **Token-based cancellation** – every call increments `currentToken`. All
   asynchronous awaits (download → GPU upload → first draw) compare their
   captured token against the global one and self-abort if superseded. This
   avoids race conditions that previously left duplicates on screen.

3. **Live + pending entities** – the application keeps exactly two
   `pc.Entity` instances:
   • `liveEnt` – currently visible model.
   • `pendingEnt` – the one that is loading / uploading.
   Any older pending entity is destroyed immediately when a newer request
   arrives, capping memory & GPU usage.

4. **Sorter barrier** – the loader waits for
   `gsplat.instance.sorter.once('updated')`, which fires after PlayCanvas has
   generated draw-call layer lists for the new splat.

5. **Frame-end swap** – the old model is destroyed on the first `app.on('frameend')`
   following the sorter event, so there is always at least one model visible.

6. **On-demand renderers** – after removal we call
   `app.renderNextFrame?.()` to force an extra frame, ensuring Safari (which
   sometimes pauses rendering when nothing moves) immediately shows the new
   scene.

With this pipeline _Chrome, Safari and Firefox_ now all scrub smoothly – no
flash of empty background, no lingering duplicates.

---

## Interactive Latent Grid

This project includes an interactive latent grid component (`LatentGrid.tsx`)
that provides a miniature _latent-space map_ for switching between Gaussian
Splat models. Users simply drag the handle across the grid; the viewer swaps
to the model located at that cell.

Runtime characteristics:

- Emits a _single_ debounced load request once the handle settles (≈180 ms).
- Zero allocations on the hot `pointermove` path → stable 60 fps even on
  mobile.
- Works with mouse, touch and stylus out of the box via `react-konva`.

### Model Structure

The models live under `public/compressed_head_models_512_16x16/` in a 16×16 grid of subdirectories named `model_c<col>_r<row>` (zero-padded column/row indices). For example:

```
compressed_head_models_512_16x16/
  ├── model_c00_r00/
  ├── model_c00_r01/
  ├── model_c00_r02/
  ├── ...
  ├── model_c15_r14/
  └── model_c15_r15/
```

Each model directory contains the necessary SOGS files:

- `meta.json` — model metadata
- `means_l.webp`, `means_u.webp` — mean positions
- `quats.webp` — quaternions for rotation
- `scales.webp` — scaling factors
- `sh0.webp` — spherical harmonics

### Grid Navigation

The grid is constructed with rows representing one dimension of the latent space and columns representing another. When a user clicks on a cell in the grid, the corresponding model is loaded using the smooth transition mechanism.

---

## Development Workflow

When working on this project, use the following commands to streamline your workflow:

### Linting & formatting

The codebase uses **ESLint** for catching bugs and **Prettier** for automatic
code formatting. Both are fully configured in `package.json` and run on every
commit via a Husky _pre-commit_ hook.

Running them manually:

```bash
# Show lint warnings & errors (no writes)
npm run lint

# Auto-fix lint problems where possible
npm run lint:fix

# Format the entire repo with Prettier
npm run format

# Verify that everything *is* formatted (CI-friendly)
npm run format:check
```

The default **pre-commit** hook executes `npm run lint` followed by
`npm run format:check` and will prevent the commit if either step fails. You
can skip the hook with `git commit --no-verify` (not recommended).

#### Continuous integration (GitHub Actions)

All quality checks also run automatically in GitHub Actions on every _push_
and _pull-request_ (see `.github/workflows/quality.yml`). The workflow
executes:

1. `npm run lint` – ESLint warnings/errors.
2. `npm run format:check` – verify Prettier formatting.
3. `npm run tsc` – full TypeScript type-checking.

If any step fails the CI status will be red, preventing the merge until the
issues are fixed.

### Development Server

```bash
npm run dev
```

This starts the Vite development server with hot module reloading. The server watches for changes in your files and automatically refreshes the browser. The dev server will be available at http://localhost:5173.

### Type Checking

```bash
npm run tsc
```

Run TypeScript type checking without emitting output files. This is useful to validate your TypeScript code while developing.

### Building for Production

```bash
npm run build
```

This command:

1. Runs the TypeScript compiler to check types
2. Builds the project with Vite for production
3. Outputs optimized files to the `./dist` directory

The build process automatically:

- Tree-shakes unused code
- Minifies JavaScript and CSS
- Optimizes assets
- Generates production-ready files

### Testing Production Build

```bash
npm run preview
```

After building, use this command to preview the production build locally before deployment.

---
