// 1) bring PlayCanvas ES-module build into the bundle
import * as pc from 'playcanvas/build/playcanvas.mjs';
window.pc = pc;      // legacy helper scripts expect global `pc`

// 2) register the helper modules that sit inside node_modules
import 'playcanvas/scripts/esm/camera-controls.mjs';
import 'playcanvas/scripts/esm/xr-controllers.mjs';
import 'playcanvas/scripts/esm/xr-navigation.mjs';

// nothing else needed: <pc-asset> tags in index.html pick them up