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
  '../src/components/LatentGrid',
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

let pcAppEl: HTMLElement & { app: any };

beforeEach(async () => {
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
  pcAppEl = document.querySelector('pc-app') as HTMLElement & { app: any };
  pcAppEl.app = new pc.Application();

  await import('../src/bootstrap/index.ts');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  pcAppEl.dispatchEvent(new Event('ready'));
  await vi.runAllTimersAsync();

  let count = 0;
  window.switchModel = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          count++;
          const status = document.getElementById(
            'downloadStatus'
          ) as HTMLDivElement;
          if (status) status.textContent = `step ${count}`;
          resolve();
        }, 50);
      })
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('bulk download cancel', () => {
  it('stops invoking switchModel after cancelBulkDownload', async () => {
    const btn = document.getElementById('downloadAllBtn') as HTMLButtonElement;
    const status = document.getElementById('downloadStatus') as HTMLDivElement;

    btn.click();

    expect(window.switchModel).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(window.switchModel).toHaveBeenCalledTimes(2);
    expect(status.textContent).toBe('step 1');

    await vi.advanceTimersByTimeAsync(50);
    expect(window.switchModel).toHaveBeenCalledTimes(3);
    expect(status.textContent).toBe('step 2');

    await vi.advanceTimersByTimeAsync(10);
    window.cancelBulkDownload?.();

    await vi.runAllTimersAsync();
    expect(window.switchModel).toHaveBeenCalledTimes(3);
    expect(status.textContent).toBe('step 3');
  });
});
