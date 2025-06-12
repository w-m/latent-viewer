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
vi.mock('react-dom/client', () => ({
  createRoot: () => ({ render: vi.fn() }),
}));
vi.mock(
  '../public/LatentGrid',
  () => ({ LatentGrid: function LatentGrid() {}, LatentGridHandle: {} }),
  { virtual: true }
);
vi.mock('playcanvas', () => {
  const { EventEmitter } = require('events');
  class Base extends EventEmitter {}

  class Entity extends Base {
    name: string;
    parent: Entity | null = null;
    children: Entity[] = [];
    gsplat: any = { asset: null, instance: { sorter: new EventEmitter() } };
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
  }

  function registerScript() {}

  return { Entity, Asset, Application, registerScript };
});

let app: any;
let pcAppEl: HTMLElement;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
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
  (pcAppEl as any).app = app;

  await import('../public/main.ts');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  pcAppEl.dispatchEvent(new Event('ready'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('switchModel queue', () => {
  it('processes queued requests and limits entities', async () => {
    const root = app.root;
    expect(root.children.length).toBe(1);

    const firstPromise = window.switchModel('model_a');
    expect(root.children.length).toBe(2);
    const firstPending = root.children[1];

    window.switchModel('model_b');
    window.switchModel('model_c');
    expect(root.children.length).toBe(2);

    await vi.runAllTimersAsync();
    firstPending.gsplat.instance.sorter.emit('updated');
    await vi.runAllTimersAsync();
    app.emit('frameend');
    await firstPromise;

    await vi.runAllTimersAsync();
    expect(root.children.length).toBe(2);
    const secondPending = root.children[1];

    secondPending.gsplat.instance.sorter.emit('updated');
    await vi.runAllTimersAsync();
    app.emit('frameend');

    await vi.runAllTimersAsync();
    expect(root.children.length).toBe(1);
    expect(app.assets.list.length).toBe(1);
    expect(app.assets.list[0].name).toBe('gsplat-model_c');
  });
});

describe('switchModel error handling', () => {
  it('shows an error message for a 404 response', async () => {
    const root = app.root;
    (global as any).fetch = vi.fn(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: false, status: 404 }), 1)
        )
    );

    const promise = window.switchModel('missing_model');
    expect(root.children.length).toBe(2);

    await vi.runAllTimersAsync();
    await promise;

    expect(document.getElementById('statusArea')?.textContent).toBe(
      'Error loading model'
    );
    expect(root.children.length).toBe(1);
    expect(app.assets.list.length).toBe(0);
  });

  it('shows an error message for invalid JSON', async () => {
    const root = app.root;
    (global as any).fetch = vi.fn(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 1)
        )
    );

    const promise = window.switchModel('invalid_model');
    expect(root.children.length).toBe(2);

    await vi.runAllTimersAsync();
    await promise;

    expect(document.getElementById('statusArea')?.textContent).toBe(
      'Error loading model'
    );
    expect(root.children.length).toBe(1);
    expect(app.assets.list.length).toBe(0);
  });
});
