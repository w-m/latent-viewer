# Latent-Viewer – Gaussian-Splat & SOGS demo

Latent-Viewer is a **zero-boilerplate** PlayCanvas setup for viewing
3-D Gaussian Splat (GSplat) scenes in the browser.  It supports:

* Desktop & mobile orbit / pan / zoom camera (inertia, touch, wheel …)
* Optional WebXR controller + teleport navigation
* Both **raw *.ply** splats and **compressed SOGS** assets
* Ultra-small production builds (≈ 50 kB of JS + the scene data)

Everything is declaratively described in **HTML** via
[`@playcanvas/web-components`](https://github.com/playcanvas/playcanvas-web-components).


---

## Quick start

```bash
# 1. Clone the repo & install deps
git clone https://github.com/w-m/latent-viewer.git
cd latent-viewer

# Uses the latest PlayCanvas engine from GitHub
npm install        # or pnpm / yarn

# 2. Start the dev server
npm run dev        # http://localhost:5173 (auto-reload)

# 3. Build a static bundle (optional)
npm run build      # outputs to ./dist

# 4. Preview production build
npm run preview    # serves the ./dist folder
```

### Requirements

* **Node 18 LTS** or newer (uses modern `import`/`export`)
* Git (for pulling the PlayCanvas engine dependency directly from GitHub)


---

## Project layout

```
latent-viewer/
├── public/            # Everything served as-is by Vite
│   ├── index.html     # Declarative scene graph
│   ├── main.js        # Minimal bootstrap (script registration + URL fix)
│   ├── head.ply       # Example raw GSplat (legacy)
│   └── truck/         # Example SOGS scene (meta.json + textures)
├── src/               # (unused – place app code here if needed)
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

1. **Web components** – `<pc-app>`, `<pc-entity>`, `<pc-splat>` & friends
   auto-create the PlayCanvas application and scene graph:

   ```html
   <pc-asset id="truck" src="truck/meta.json" type="gsplat"></pc-asset>
   <pc-entity><pc-splat asset="truck"></pc-splat></pc-entity>
   ```

2. **Helper scripts** (orbit camera, XR controllers, XR teleport) are ES-modules
   living in `node_modules/playcanvas/scripts/esm/`.  They are imported in
   `public/main.js`, registered with `pc.registerScript`, and then referenced by
   `<pc-script name="cameraControls">` tags.

3. **URL fix for SOGS** – The engine expects the `src` of a GSplat asset to be
   absolute.  `main.js` rewrites any relative URLs so `truck/meta.json` becomes
   `http://localhost:5173/truck/meta.json`, preventing runtime errors.

4. **Bundling** – Vite tree-shakes unused PlayCanvas code and helper scripts.
   A production build is typically < 100 kB gzip.


---

## Adding your own scene

1. Copy your **`*.ply`** or **SOGS folder (`meta.json` + textures)** into
   `public/`.
2. Edit `public/index.html` and replace the `<pc-asset id="truck" …>` and
   matching `<pc-splat asset="…">` tags with your own IDs/paths.

No JavaScript changes required.


---

## Updating PlayCanvas / helpers

The project pins the engine to the **`main` branch on GitHub**:

```json
"dependencies": {
  "playcanvas": "github:playcanvas/engine#main",
  "@playcanvas/web-components": "^0.2.6"
}
```

Simply run `npm update` to pull the latest engine.  Web-components follows semver
so it’s updated through the normal npm workflow.

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
scrubbing fluid while guaranteeing zero flicker and *at most two* GSplat
entities in the scene:

1. **Debounced requests** – the latent-space grid calls `switchModel()` via a
   180 ms trailing-edge debounce so only the cell you *end up on* actually
   initiates a load.

2. **Token-based cancellation** – every call increments `currentToken`.  All
   asynchronous awaits (download → GPU upload → first draw) compare their
   captured token against the global one and self-abort if superseded.  This
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

With this pipeline *Chrome, Safari and Firefox* now all scrub smoothly – no
flash of empty background, no lingering duplicates.

---

## Interactive Latent Grid

This project includes an interactive latent grid component (`LatentGrid.tsx`)
that provides a miniature *latent-space map* for switching between Gaussian
Splat models.  Users simply drag the handle across the grid; the viewer swaps
to the model located at that cell.

Runtime characteristics:

* Emits a *single* debounced load request once the handle settles (≈180 ms).
* Zero allocations on the hot `pointermove` path → stable 60 fps even on
  mobile.
* Works with mouse, touch and stylus out of the box via `react-konva`.

### Model Structure

The models are organized in directories under `public/compressed_head_models/`:

```
compressed_head_models/
  ├── model_a0/
  ├── model_a1/
  ├── model_a2/
  ├── model_b0/
  ├── model_b1/
  ├── model_b2/
  ├── model_c0/
  ├── model_c1/
  └── model_c2/
```

Each model directory contains the necessary SOGS files:
- `meta.json` - Model metadata
- `means_l.webp`, `means_u.webp` - Mean positions
- `quats.webp` - Quaternions for rotation
- `scales.webp` - Scaling factors
- `sh0.webp` - Spherical harmonics

### Grid Navigation

The grid is constructed with rows representing one dimension of the latent space and columns representing another. When a user clicks on a cell in the grid, the corresponding model is loaded using the smooth transition mechanism.

---

## Development Workflow

When working on this project, use the following commands to streamline your workflow:

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

