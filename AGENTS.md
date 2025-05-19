Gaussian-Splat Viewer — Implementation Notes

High-level goal

Render a single 3D-Gaussian-Splat file (head.ply) in the browser with PlayCanvas, providing:
	•	desktop & mobile orbit / pan / zoom camera
	•	optional WebXR navigation (controllers + teleport)
	•	zero extra UI, audio, or annotations
	•	simple static hosting (e.g. Vite dev server, GitHub Pages)

Engine pieces we rely on

Module	Role	Why chosen
playcanvas (package "module" field → build/playcanvas.mjs)	ES-module engine build	integrates with modern bundlers; tree-shakes
@playcanvas/web-components	Registers <pc-app>, <pc-splat>, etc.	removes all manual boot code
scripts/esm/camera-controls.mjs	Orbit / pan / zoom controller incl. inertia	single helper script; no extra inputs needed
scripts/esm/xr-controllers.mjs, xr-navigation.mjs	WebXR hands + teleport	optional; harmless on desktop

These scripts internally import 'playcanvas'; bundlers (Vite/Rollup) rewrite that bare specifier to the engine build. No other helper files (mouse-input, touch-input, etc.) are required—camera-controls.mjs already wires mouse, wheel, touch, and key events.

Core HTML structure

<pc-app>
<pc-asset id="truck" src="truck/meta.json" type="gsplat"></pc-asset>

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

    <pc-entity name="truck">
      <pc-splat asset="truck"></pc-splat>
    </pc-entity>
  </pc-scene>
</pc-app>

<pc-splat> automatically parses .ply or .sogs as Gaussian splats.

JS bootstrap (public/main.js)

import '@playcanvas/web-components';
import * as pc from 'playcanvas';
window.pc = pc;                               // legacy global expected by helpers


// Import helper scripts *and* register them so they can be referenced
// by the <pc-script> tags in index.html. When these helpers are loaded
// through PlayCanvas' script asset pipeline the registration is done
// automatically, but because we bundle them with Vite we need to call
// pc.registerScript ourselves.

import { CameraControls }   from 'playcanvas/scripts/esm/camera-controls.mjs';
import { XrControllers }    from 'playcanvas/scripts/esm/xr-controllers.mjs';
import { XrNavigation }     from 'playcanvas/scripts/esm/xr-navigation.mjs';

pc.registerScript(CameraControls, 'cameraControls');
pc.registerScript(XrControllers, 'xrControllers');
pc.registerScript(XrNavigation,  'xrNavigation');

// (Registration must run *after* <pc-app> has created the
// PlayCanvas application – listen for the element's `ready` event
// if the script executes before the DOM has finished parsing.)

Nothing else—once registered <pc-script name="…"> elements work as
expected.

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