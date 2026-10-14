import './loop.ts';
import { loadWorldSpec } from '../../src/worlds/registry.ts';
import { createTerrain } from '../../src/worlds/terrain.ts';
import { geographyOf } from '../../src/system/geography.ts';
import { surfaceOf } from '../../src/worlds/surface.ts';
import * as THREE from 'three';
import { createSettlements } from '../../src/worlds/settlements.ts';
import { ctx, gradientMap } from './ground.ts';
import { createSky } from '../../src/worlds/sky.ts';
import { createGround } from '../../src/worlds/tiles.ts';
import { createFrontiers } from '../../src/worlds/frontiers.ts';
import { fail, only } from './setup.ts';

// ===========================================================================
// 4. The shell
// ===========================================================================

/**
 * Just enough of a page for the shell's cards to be built and taken down
 * headless — the same shape `check-input.ts` builds its HUD and chat over:
 * elements that hold children, classes, attributes and listeners and draw
 * nothing, and a 2D context every call of which is a no-op.
 */
class FakeElement extends EventTarget {
  readonly tagName: string;
  readonly nodeName: string;
  id = '';
  className = '';
  hidden = false;
  title = '';
  lang = '';
  dir = '';
  type = '';
  value = '';
  checked = false;
  disabled = false;
  tabIndex = 0;
  width = 0;
  height = 0;
  isContentEditable = false;
  offsetWidth = 0;
  offsetHeight = 0;
  clientWidth = 0;
  clientHeight = 0;
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly childNodes: (FakeElement | string)[] = [];
  parentNode: FakeElement | null = null;
  readonly style: Record<string, unknown> = {
    setProperty: (name: string, value: string) => {
      this.style[name] = value;
    },
    removeProperty: (name: string) => {
      delete this.style[name];
    },
  };
  readonly classList = {
    held: new Set<string>(),
    add: (...names: string[]) => names.forEach((name) => this.classList.held.add(name)),
    remove: (...names: string[]) => names.forEach((name) => this.classList.held.delete(name)),
    toggle: (name: string, force?: boolean) => {
      const on = force ?? !this.classList.held.has(name);
      if (on) this.classList.held.add(name);
      else this.classList.held.delete(name);
      return on;
    },
    contains: (name: string) => this.classList.held.has(name),
  };
  constructor(tag: string) {
    super();
    this.tagName = tag.toUpperCase();
    this.nodeName = this.tagName;
  }
  get children(): FakeElement[] {
    return this.childNodes.filter((node): node is FakeElement => typeof node !== 'string');
  }
  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
  get firstChild(): FakeElement | string | null {
    return this.childNodes[0] ?? null;
  }
  get parentElement(): FakeElement | null {
    return this.parentNode;
  }
  get isConnected(): boolean {
    let at: FakeElement | null = this;
    while (at.parentNode !== null) at = at.parentNode;
    return at === fakePage.root;
  }
  get textContent(): string {
    return this.childNodes.map((node) => (typeof node === 'string' ? node : node.textContent)).join('');
  }
  set textContent(text: string) {
    this.replaceChildren(text);
  }
  get innerHTML(): string {
    return '';
  }
  set innerHTML(html: string) {
    this.replaceChildren(...(html === '' ? [] : [new FakeElement(/^<(\w+)/.exec(html)?.[1] ?? 'span')]));
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }
  toggleAttribute(name: string, force?: boolean): boolean {
    const on = force ?? !this.attributes.has(name);
    if (on) this.attributes.set(name, '');
    else this.attributes.delete(name);
    return on;
  }
  private adopt(node: FakeElement | string): FakeElement | string {
    if (typeof node !== 'string') {
      node.remove();
      node.parentNode = this;
    }
    return node;
  }
  append(...nodes: (FakeElement | string | null)[]): void {
    for (const node of nodes) if (node !== null) this.childNodes.push(this.adopt(node));
  }
  appendChild<T extends FakeElement>(node: T): T {
    this.append(node);
    return node;
  }
  prepend(...nodes: (FakeElement | string)[]): void {
    this.childNodes.unshift(...nodes.map((node) => this.adopt(node)));
  }
  insertBefore<T extends FakeElement>(node: T, before: FakeElement | null): T {
    const at = before === null ? -1 : this.childNodes.indexOf(before);
    this.adopt(node);
    if (at < 0) this.childNodes.push(node);
    else this.childNodes.splice(at, 0, node);
    return node;
  }
  replaceChildren(...nodes: (FakeElement | string)[]): void {
    for (const node of this.childNodes) if (typeof node !== 'string') node.parentNode = null;
    this.childNodes.length = 0;
    this.append(...nodes);
  }
  removeChild<T extends FakeElement>(node: T): T {
    node.remove();
    return node;
  }
  remove(): void {
    const parent = this.parentNode;
    if (parent === null) return;
    const at = parent.childNodes.indexOf(this);
    if (at >= 0) parent.childNodes.splice(at, 1);
    this.parentNode = null;
  }
  contains(node: unknown): boolean {
    for (let at = node instanceof FakeElement ? node : null; at !== null; at = at.parentNode) if (at === this) return true;
    return false;
  }
  querySelector(): null {
    return null;
  }
  querySelectorAll(): FakeElement[] {
    return [];
  }
  closest(): null {
    return null;
  }
  matches(): boolean {
    return false;
  }
  focus(): void {
    fakePage.active = this;
  }
  blur(): void {
    if (fakePage.active === this) fakePage.active = null;
  }
  click(): void {
    this.dispatchEvent(new Event('click'));
  }
  select(): void {}
  setSelectionRange(): void {}
  scrollIntoView(): void {}
  requestPointerLock(): void {}
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  getContext(): unknown {
    return noDrawing;
  }
  animate(): { cancel(): void; onfinish: (() => void) | null } {
    return { cancel: () => {}, onfinish: null };
  }
  toDataURL(): string {
    return '';
  }
}

/** A 2D context that takes every call and every setting and draws nothing. */
const noDrawing: unknown = new Proxy({} as Record<string | symbol, unknown>, {
  get: (target, name) => (name in target ? target[name] : () => noDrawing),
  set: (target, name, value) => {
    target[name] = value;
    return true;
  },
});

const fakePage = { root: new FakeElement('html'), active: null as FakeElement | null };

/** Runs `run` over a fake page whose window delivers `keys`, counting the listeners held by type. */
async function withPage(run: (keys: EventTarget, body: FakeElement, live: () => Map<string, number>) => Promise<void>): Promise<void> {
  const keys = new EventTarget();
  const held = new Map<string, Set<unknown>>();
  const set = (type: string): Set<unknown> => held.get(type) ?? held.set(type, new Set()).get(type)!;
  const add = (type: string, listener: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void => {
    keys.addEventListener(type, listener, options);
    const signal = typeof options === 'object' ? options.signal : undefined;
    if (listener === null || signal?.aborted === true) return;
    set(type).add(listener);
    signal?.addEventListener('abort', () => set(type).delete(listener));
  };
  const remove = (type: string, listener: EventListenerOrEventListenerObject | null): void => {
    keys.removeEventListener(type, listener);
    set(type).delete(listener);
  };
  fakePage.root = new FakeElement('html');
  const head = new FakeElement('head');
  const body = new FakeElement('body');
  fakePage.root.append(head, body);
  const find = (id: string): FakeElement | null => {
    const walk = (at: FakeElement): FakeElement | null => {
      if (at.id === id) return at;
      for (const child of at.children) {
        const found = walk(child);
        if (found !== null) return found;
      }
      return null;
    };
    return walk(fakePage.root);
  };
  const documentTarget = Object.assign(new EventTarget(), {
    head,
    body,
    documentElement: fakePage.root,
    hidden: false,
    visibilityState: 'visible',
    pointerLockElement: null,
    get activeElement() {
      return fakePage.active;
    },
    createElement: (tag: string) => new FakeElement(tag),
    createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
    createTextNode: (text: string) => text,
    getElementById: find,
    exitPointerLock: () => {},
    fonts: { ready: Promise.resolve() },
  });
  const unref = <T>(timer: T): T => {
    (timer as { unref?: () => void }).unref?.();
    return timer;
  };
  const items = new Map<string, string>();
  const globals: Record<string, unknown> = {
    addEventListener: add,
    removeEventListener: remove,
    document: documentTarget,
    window: {
      addEventListener: add,
      removeEventListener: remove,
      setTimeout: (handler: () => void, ms?: number) => unref(setTimeout(handler, ms)),
      clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
      setInterval: (handler: () => void, ms?: number) => unref(setInterval(handler, ms)),
      clearInterval: (timer: ReturnType<typeof setInterval>) => clearInterval(timer),
      devicePixelRatio: 1,
    },
    localStorage: {
      getItem: (name: string) => items.get(name) ?? null,
      setItem: (name: string, value: string) => void items.set(name, value),
      removeItem: (name: string) => void items.delete(name),
    },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    Node: FakeElement,
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLInputElement: FakeElement,
    HTMLButtonElement: FakeElement,
    HTMLCanvasElement: FakeElement,
    SVGElement: FakeElement,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  };
  const originals = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  try {
    await run(keys, body, () => new Map([...held].map(([type, listeners]) => [type, listeners.size])));
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

async function checkShell(): Promise<void> {
  console.log('\n=== the shell ===\n');
  const spec = await loadWorldSpec('mars');
  const terrain = createTerrain(spec);
  const geography = geographyOf(spec.body);
  const surface = surfaceOf(terrain, geography);
  await withPage(async (keys, body, live) => {
    const { createShell } = await import('../../src/worlds/shell.ts');
    const { createWorldPlayer } = await import('../../src/worlds/player.ts');
    const { createWorldRig } = await import('../../src/worlds/camera.ts');
    const { createInput } = await import('../../src/input.ts');
    const { BINDINGS, resetBindings } = await import('../../src/controls.ts');
    resetBindings();
    // Welcomed already: the first-run card holds the keyboard while it is up.
    localStorage.setItem('atlas.welcomed.v1', '1');
    const lockTarget = new FakeElement('canvas');
    const baseline = live();
    const bodyChildren = body.children.length;
    const build = () => {
      const scene = new THREE.Scene();
      const avatar = {
        group: new THREE.Group(),
        stride: () => {},
        land: () => {},
        sit: () => {},
        reset: () => {},
        emote: () => true,
        emoting: null,
        phase: 0,
      } as unknown as Parameters<typeof createWorldPlayer>[1];
      const player = createWorldPlayer({ radius: terrain.radius, gravity: spec.body.gravity, groundAt: () => 0, collide: () => false }, avatar);
      const input = createInput(lockTarget as unknown as HTMLElement);
      const settlements = createSettlements(spec, terrain, ctx, gradientMap);
      const sky = createSky(spec, scene);
      const ground = createGround(terrain, { gradientMap });
      const frontiers = createFrontiers(geography, terrain);
      const crowd = {
        group: new THREE.Group(),
        walkers: [],
        update: () => {},
        nearest: () => null,
        headOf: (_walker: unknown, out: THREE.Vector3) => out,
        stats: { walkers: 0, bodies: 0, buildMs: 0, animated: 0 },
        dispose: () => {},
      } as unknown as Parameters<typeof createShell>[0]['crowd'];
      let left = 0;
      const shell = createShell({
        host: {
          renderer: { domElement: lockTarget, info: { render: { triangles: 0, calls: 0 } } } as unknown as THREE.WebGLRenderer,
          draw: () => {},
          pixelRatio: () => 1,
          sound: () => null,
          appearance: () => ({}) as never,
          cast: () => Promise.reject(new Error('no cast headless')),
          name: () => 'Tester',
          mode: 'offline',
          time: () => new Date('2026-10-01T12:00:00Z'),
          exit: () => {},
        },
        spec,
        geography,
        surface,
        terrain,
        scene,
        ctx,
        player,
        rig: createWorldRig(() => false),
        sky,
        ground,
        frontiers,
        settlements,
        crowd,
        crafts: [],
        roadLines: () => [],
        roadRibbons: () => [],
        pads: [],
        saucers: [],
        input,
        groundAt: () => 0,
        craftInReach: () => null,
        jumpTo: () => {},
        home: { lat: 0, lon: 0, name: 'Home' },
        leave: () => left++,
        rocketInReach: () => null,
        riding: () => null,
        boardRocket: () => {},
        leaveRocket: () => {},
      });
      return {
        shell,
        dispose: () => {
          shell.dispose();
          input.dispose();
          settlements.dispose();
          sky.dispose();
          ground.dispose();
          frontiers.dispose();
        },
      };
    };
    const first = build();
    const during = live();
    if ((during.get('keydown') ?? 0) <= (baseline.get('keydown') ?? 0)) fail('the shell listens for no key while it stands');
    first.dispose();
    const after = live();
    for (const type of new Set([...baseline.keys(), ...after.keys()])) {
      if ((after.get(type) ?? 0) !== (baseline.get(type) ?? 0)) fail(`the shell taken down leaves ${(after.get(type) ?? 0) - (baseline.get(type) ?? 0)} '${type}' listeners behind`);
    }
    if (body.children.length !== bodyChildren) fail(`the shell taken down leaves ${body.children.length - bodyChildren} elements on the page`);
    // A second shell after it, run for a few frames — the badge, the disc,
    // the book and the map layer asked as the loop asks them — and then one
    // key, one card.
    const second = build();
    for (let k = 0; k < 5; k++) {
      second.shell.update(0.25);
      second.shell.drawn(1, 1);
    }
    const ground = second.shell.hud.clock;
    if (!/^\d\d:\d\d$/.test(ground)) fail(`the shell's clock reads '${ground}'`);
    const press = (code: string): void => {
      keys.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code, repeat: false }));
    };
    press(BINDINGS.settings[0]!);
    const opened = body.children.filter((element) => element.classList.contains('on') || element.classList.contains('open')).length;
    if (opened === 0) fail('the second shell\'s settings did not open on its key');
    press('Escape');
    second.dispose();
    const end = live();
    for (const type of new Set([...baseline.keys(), ...end.keys()])) {
      if ((end.get(type) ?? 0) !== (baseline.get(type) ?? 0)) fail(`two shells taken down leave '${type}' listeners behind`);
    }
    console.log(`  built and taken down twice: ${[...during].map(([type, count]) => `${count - (baseline.get(type) ?? 0)} ${type}`).join(', ')} listeners, all let go`);
  });
}

if (only === undefined || only === 'mars') await checkShell();
