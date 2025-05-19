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

