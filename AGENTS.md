Gaussian-Splat Viewer — Implementation Notes

High-level goal

Render a single 3D-Gaussian-Splat file (head.ply) in the browser with PlayCanvas, providing:
	•	desktop & mobile orbit / pan / zoom camera
	•	optional WebXR navigation (controllers + teleport)
	•	zero extra UI, audio, or annotations
	•	simple static hosting (e.g. Vite dev server, GitHub Pages)

Engine pieces we rely on

Module	Role	Why chosen
build/playcanvas.mjs	ES-module engine build	integrates with modern bundlers; tree-shakes
@playcanvas/web-components	Registers <pc-app>, <pc-splat>, etc.	removes all manual boot code
scripts/esm/camera-controls.mjs	Orbit / pan / zoom controller incl. inertia	single helper script; no extra inputs needed
scripts/esm/xr-controllers.mjs, xr-navigation.mjs	WebXR hands + teleport	optional; harmless on desktop

These scripts internally import 'playcanvas'; bundlers (Vite/Rollup) rewrite that bare specifier to the engine build. No other helper files (mouse-input, touch-input, etc.) are required—camera-controls.mjs already wires mouse, wheel, touch, and key events.

Core HTML structure

<pc-app>
  <pc-asset id="head" src="head.ply" type="gsplat"></pc-asset>

  <pc-scene>
    <pc-entity name="cameraRoot">
      <pc-entity name="camera" position="0 0 2">
        <pc-camera></pc-camera>
        <pc-scripts>
          <pc-script name="cameraControls"></pc-script>
        </pc-scripts>
      </pc-entity>
      <pc-scripts>
        <pc-script name="xrControllers"></pc-script>
        <pc-script name="xrNavigation"></pc-script>
      </pc-scripts>
    </pc-entity>

    <pc-entity name="head">
      <pc-splat asset="head"></pc-splat>
    </pc-entity>
  </pc-scene>
</pc-app>

<pc-splat> automatically parses .ply or .sogs as Gaussian splats.

JS bootstrap (src/main.js)

import '@playcanvas/web-components';
import * as pc from 'playcanvas/build/playcanvas.mjs';
window.pc = pc;                               // legacy global expected by helpers

import 'playcanvas/scripts/esm/camera-controls.mjs';
import 'playcanvas/scripts/esm/xr-controllers.mjs';
import 'playcanvas/scripts/esm/xr-navigation.mjs';

Nothing else—registration happens on import.

Build & dev with Vite
	•	Project root contains index.html and head.ply; Vite’s default config works.
	•	vite dev → hot-reload at localhost:5173.
	•	vite build tree-shakes helpers + engine; output ≈ 50 kB JS + head.ply.
	•	Updating PlayCanvas or web-components is a simple npm update.

Key understandings
	1.	PlayCanvas helpers are ES modules that rely on a global pc reference and bare-specifier imports. Provide both before they execute.
	2.	@playcanvas/web-components negates the need for manual pc.Application creation—scene graph is pure HTML.
	3.	Gaussian-Splat support lives in the engine core; just set type="gsplat" on <pc-asset>.
	4.	Only one camera helper (camera-controls.mjs) is needed—its internal listeners cover desktop & touch.
	5.	Using a bundler lets us keep helper scripts in node_modules, avoid custom import-maps, and get automatic tree-shaking/minification.