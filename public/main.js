// 1) register web-components runtime
import '@playcanvas/web-components';

// 2) bring PlayCanvas ES-module build into the bundle
import * as pc from 'playcanvas';
window.pc = pc;      // legacy helper scripts expect global `pc`

// 3) register the helper modules that sit inside node_modules
// Helper scripts ---------------------------------------------
// Import the helper script classes *and* register them with the
// PlayCanvas script registry so they can be referenced by name
// from the <pc-script> tags defined in index.html. When these
// helpers are loaded via the PlayCanvas asset pipeline the
// registry step is done automatically, but because we import
// them directly here we need to perform the registration
// manually.

import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';
import { XrControllers } from 'playcanvas/scripts/esm/xr-controllers.mjs';
import { XrNavigation } from 'playcanvas/scripts/esm/xr-navigation.mjs';

// The PlayCanvas application is created by the <pc-app> element which
// lives in index.html. We need to defer registration until the app is
// ready, otherwise `pc.registerScript` cannot locate the script
// registry (it lives on the `pc.Application` instance that gets
// created inside <pc-app>).

const pcApp = document.querySelector('pc-app');

// If the element has already finished initialising we can register
// immediately; otherwise listen for its `ready` event.

const registerScripts = () => {
  pc.registerScript(CameraControls, 'cameraControls');
  pc.registerScript(XrControllers, 'xrControllers');
  pc.registerScript(XrNavigation, 'xrNavigation');
};

if (pcApp) {
  if (pcApp.hierarchyReady) {
    registerScripts();
  } else {
    pcApp.addEventListener('ready', registerScripts, { once: true });
  }
} else {
  // pc-app not in the DOM yet – wait until the document is fully parsed
  window.addEventListener('DOMContentLoaded', () => {
    const appEl = document.querySelector('pc-app');
    if (appEl) {
      if (appEl.hierarchyReady) {
        registerScripts();
      } else {
        appEl.addEventListener('ready', registerScripts, { once: true });
      }
    }
  });
}

// All helper scripts will be available to the <pc-script> elements as
// soon as `registerScripts` executes.