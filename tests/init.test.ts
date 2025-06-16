import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@playcanvas/web-components', () => ({}));
vi.mock('playcanvas/scripts/esm/camera-controls.mjs', () => ({
  CameraControls: class {},
}));
vi.mock('playcanvas/scripts/esm/xr-controllers.mjs', () => ({
  XrControllers: class {},
}));
vi.mock('playcanvas/scripts/esm/xr-navigation.mjs', () => ({
  XrNavigation: class {},
}));
vi.mock('react', () => {
  const createRef = () => ({ current: null });
  const createElement = () => null;
  return { default: { createRef, createElement }, createRef, createElement };
});
const createRootMock = vi.fn(() => ({ render: vi.fn() }));
vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}));
vi.mock(
  '../src/components/LatentGrid',
  () => ({ LatentGrid: function LatentGrid() {}, LatentGridHandle: {} }),
  { virtual: true }
);
const registerScriptSpy = vi.fn();
vi.mock('playcanvas', () => {
  const { EventEmitter } = require('events');
  class Base extends EventEmitter {}

  class Entity extends Base {
    name: string;
    parent: Entity | null = null;
    children: Entity[] = [];
    gsplat: any = { asset: null, instance: { sorter: new EventEmitter() } };
    setLocalPosition = vi.fn();
    constructor(name = '') {
      super();
      this.name = name;
    }
    addComponent(type: string, opts: any) {
      if (type === 'gsplat') this.gsplat = { ...this.gsplat, ...opts };
    }
    addChild(e: Entity) {
      e.parent = this;
      this.children.push(e);
    }
    destroy() {
      this.children.slice().forEach((c) => c.destroy());
      if (this.parent) {
        const i = this.parent.children.indexOf(this);
        if (i >= 0) this.parent.children.splice(i, 1);
      }
    }
    findByName(name: string): Entity | null {
      if (this.name === name) return this;
      for (const c of this.children) {
        const r = c.findByName(name);
        if (r) return r;
      }
      return null;
    }
  }

  class Asset extends Base {
    name: string;
    type: string;
    file: any;
    data: any = null;
    resource: any = { destroy: vi.fn() };
    constructor(name: string, type: string, opts: { url?: string }) {
      super();
      this.name = name;
      this.type = type;
      this.file = { url: opts.url };
    }
  }

  class AssetRegistry extends Base {
    list: Asset[] = [];
    add(a: Asset) {
      this.list.push(a);
    }
    remove(a: Asset) {
      const i = this.list.indexOf(a);
      if (i >= 0) this.list.splice(i, 1);
    }
    load(a: Asset) {
      setTimeout(() => a.emit('load', a), 1);
    }
  }

  class Application extends Base {
    root = new Entity('root');
    assets = new AssetRegistry();
    renderNextFrame = vi.fn();
    setCanvasFillMode = vi.fn();
    setCanvasResolution = vi.fn();
    resizeCanvas = vi.fn();
    graphicsDevice = { canvas: { style: {} } } as any;
  }

  function registerScript(...args: any[]) {
    registerScriptSpy(...args);
  }

  return {
    Entity,
    Asset,
    Application,
    registerScript,
    FILLMODE_NONE: 0,
    RESOLUTION_AUTO: 'auto',
  };
});

let app: any;
let pcAppEl: HTMLElement & { app: any };

beforeEach(async () => {
  vi.useFakeTimers();
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (global as any).fetch = vi.fn(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ ok: true, json: async () => ({ means: true }) }),
          1
        )
      )
  );

  document.body.innerHTML = `
    <div class="container">
      <div class="latent-section"><div id="latentGrid"></div></div>
      <div id="statusArea"></div>
      <div id="downloadStatus"></div>
      <button id="downloadAllBtn"></button>
      <pc-app></pc-app>
      <button id="fullscreenBtn"></button>
      <button id="settingsBtn"></button>
      <div id="settingsPanel"></div>
      <input id="bgColorPicker" value="#222222" />
    </div>`;

  const pc = await import('playcanvas');
  app = new pc.Application();
  pcAppEl = document.querySelector('pc-app') as HTMLElement & { app: any };
  pcAppEl.app = app;

  await import('../src/bootstrap/index.ts');
});

afterEach(() => {
  vi.useRealTimers();
  registerScriptSpy.mockClear();
  createRootMock.mockClear();
});

describe('application initialization', () => {
  it('runs once and loads queued model', async () => {
    const root = app.root;

    // call switchModel before initialization is ready
    window.switchModel('queued_dir');

    // first init via DOMContentLoaded
    document.dispatchEvent(new Event('DOMContentLoaded'));
    pcAppEl.dispatchEvent(new Event('ready'));

    // pending entity should exist
    expect(root.children.length).toBe(2);
    const pending = root.children[1];

    await vi.runAllTimersAsync();
    pending.gsplat.instance.sorter.emit('updated');
    await vi.runAllTimersAsync();
    app.emit('frameend');

    await vi.runAllTimersAsync();

    expect(root.children.length).toBe(1);
    expect(app.assets.list.length).toBe(1);
    expect(app.assets.list[0].name).toBe('gsplat-queued_dir');

    // simulate window load which would call initApplication again
    window.dispatchEvent(new Event('load'));
    await vi.runAllTimersAsync();

    expect(registerScriptSpy).toHaveBeenCalledTimes(3);
    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(root.children.length).toBe(1);
    expect(app.assets.list.length).toBe(1);
  });
});
