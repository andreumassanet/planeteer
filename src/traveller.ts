/**
 * The traveller's card: how you look, chosen with the figure turning in front
 * of you, and worn at once by the hero and seen by everyone else.
 *
 * It is the settings card's kind of object — a modal over the world or the
 * menu, holding the keyboard (`registerModal`) and the mouse while it is up —
 * and it owns nothing: the appearance is `avatar.ts`'s (`dressHero`), handed
 * in as a getter and a setter by `main.ts`, which also tells the other
 * players; the name is `peers.ts`'s rename. Every click is applied at once:
 * there is no draft and no Save, because the hero behind the card is the
 * thing being dressed.
 *
 * **The preview is a renderer of its own, and only while the card is up.** A
 * small canvas with its own WebGL context, the world's ramp and pen
 * (`OutlineEffect`), a disc of grass and the figure on it in the relaxed
 * idle, turning slowly or by hand. It is made when the card opens and its
 * context is lost on purpose when it closes, so a card nobody opens costs
 * nothing and one that was opened leaves nothing behind. Its people come from
 * the hero's own cast with every outfit loaded (`wardrobeCast`), which the
 * card asks for on its first opening — the fifteen outfits, a little over two
 * megabytes, which the crowd has usually fetched already.
 */
import * as THREE from 'three';
import {
  CLOTH,
  DEFAULT_APPEARANCE,
  HAIR,
  SKINS,
  WARDROBE,
  colourName,
  coloursOf,
  fitAppearance,
  randomAppearance,
  wardrobeOf,
} from './appearance.ts';
import type { Appearance, Slot } from './appearance.ts';
import { AVATAR_HEIGHT } from './stature.ts';
import { paintWith } from './cast.ts';
import type { Cast, Person } from './cast.ts';
import { holdFocus, registerModal } from './controls.ts';
import { OutlineEffect } from './outline.ts';
import { rngFrom } from './scenery/random.ts';
import { PALETTE, SKY_TOP } from './theme.ts';
import { ensureStyle, h, hex, icon, installUi } from './ui.ts';

export interface TravellerOptions {
  /** The appearance, owned by the caller: `set` dresses the hero and tells the others. */
  appearance: { get(): Appearance; set(appearance: Appearance): void };
  /** The cast the preview is dressed from, with every outfit loaded. */
  cast(): Promise<Cast>;
  /** The name over your head, where there are other players to see it. Omit it and the row is not built. */
  name?: { get(): string; set(name: string): string };
  /** Where to hand the pointer back to, if it was locked when the card opened. */
  lockTarget?: HTMLElement | null;
  onOpen?(): void;
  onClose?(): void;
}

export interface Traveller {
  root: HTMLElement;
  readonly open: boolean;
  /**
   * Opens the card. `relock` says whether to ask for the pointer back on
   * closing; left out, it is whether the pointer is locked now — which it is
   * not for a card opened from another card that already released it.
   */
  show(options?: { relock?: boolean }): void;
  hide(): void;
}

const STYLE = `
.atlas-traveller {
  position: fixed;
  inset: 0;
  z-index: 12;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(30, 6, 3, 0.52);
  backdrop-filter: blur(4px);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0s 0.2s;
  font-family: var(--ui-font);
  color: var(--ui-ink);
}
.atlas-traveller.on { opacity: 1; visibility: visible; transition-delay: 0s; }
.atlas-traveller.on .t-panel { animation: ui-pop 0.32s var(--ui-spring) both; }
.t-panel {
  width: min(820px, 100%);
  max-height: min(760px, calc(100vh - 48px));
  overflow: auto;
  padding: 20px 22px 18px;
  display: grid;
  grid-template-columns: 290px 1fr;
  gap: 8px 24px;
  scrollbar-width: thin;
}
.t-head { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; margin-bottom: 6px; }
.t-badge {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border: 3px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-gold);
  box-shadow: 0 3px 0 var(--ui-ink);
}
.t-badge svg { width: 24px; height: 24px; }
.t-title { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
.t-sub { margin-top: 3px; font-size: 12.5px; font-weight: 600; opacity: 0.6; }
.t-close { margin-left: auto; }
.t-stage { display: flex; flex-direction: column; gap: 12px; }
.t-view {
  position: relative;
  height: 380px;
  border: 3px solid var(--ui-ink);
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(${hex(SKY_TOP)}, ${hex(PALETTE.cream)});
  cursor: grab;
  touch-action: none;
}
.t-view:active { cursor: grabbing; }
.t-view canvas { display: block; width: 100%; height: 100%; }
.t-view .t-wait {
  position: absolute;
  inset: auto 0 14px;
  text-align: center;
  font-size: 12.5px;
  font-weight: 800;
  opacity: 0.6;
}
.t-actions { display: flex; gap: 8px; }
.t-actions .ui-btn { flex: 1; }
.t-rows { display: flex; flex-direction: column; }
.t-row { padding: 9px 0; display: grid; gap: 8px; }
.t-row + .t-row { border-top: 1.5px dashed var(--ui-rule); }
.t-line { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
.t-label { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
.t-pick { display: flex; align-items: center; gap: 6px; }
.t-pick .ui-btn.icon { width: 34px; height: 34px; border-radius: 10px; box-shadow: 0 3px 0 var(--ui-ink); }
.t-pick .ui-btn.icon svg { width: 16px; height: 16px; }
.t-pick output {
  min-width: 150px;
  text-align: center;
  font-size: 13.5px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.t-pick output small { display: block; font-size: 10.5px; font-weight: 700; opacity: 0.5; }
.t-swatches { display: flex; flex-wrap: wrap; gap: 6px; }
.t-swatch {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 2.5px solid var(--ui-ink);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.12s var(--ui-spring);
}
.t-swatch:hover { transform: translateY(-2px); }
.t-swatch[aria-pressed='true'] { box-shadow: 0 0 0 2.5px var(--ui-paper), 0 0 0 5px var(--ui-ink); }
.t-swatch:focus-visible { outline: var(--ui-ring); outline-offset: 5px; }
.t-name {
  width: 190px;
  height: 38px;
  padding: 0 12px;
  border: 2.5px solid var(--ui-ink);
  border-radius: 10px;
  background: var(--ui-paper);
  font: 700 14px var(--ui-font);
  color: var(--ui-ink);
}
.t-name::placeholder { color: rgba(30, 6, 3, 0.45); }
.t-name:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.t-foot { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
@media (max-width: 720px) {
  .t-panel { grid-template-columns: 1fr; }
  .t-view { height: 300px; }
}
@media (prefers-reduced-motion: reduce) {
  .atlas-traveller.on .t-panel { animation: none; }
}
`;

/** Radians a second the figure turns by itself, a full turn in about fifteen seconds. */
const TURN_RATE = 0.42;
/** Radians of turn per pixel dragged. */
const DRAG_TURN = 0.012;
/** The lens, narrow so a figure fills the frame without a wide lens's big head. */
const LENS = 26;

const SLOT_TITLE: Readonly<Record<Slot, string>> = { head: 'Hair', top: 'Top', bottom: 'Bottom', feet: 'Shoes' };
const SLOT_COLOUR: Readonly<Record<Slot, 'hair' | 'topColour' | 'bottomColour' | 'feetColour'>> = {
  head: 'hair',
  top: 'topColour',
  bottom: 'bottomColour',
  feet: 'feetColour',
};

/** The preview: a renderer, a scene and a figure, all of it gone when the card closes. */
interface Preview {
  renderer: THREE.WebGLRenderer;
  outline: OutlineEffect;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  turntable: THREE.Group;
  ground: THREE.Mesh;
  person: Person | null;
  frame: number;
  last: number;
}

export function createTraveller(options: TravellerOptions): Traveller {
  installUi();
  ensureStyle('atlas-traveller', STYLE);

  const root = h('div', { class: 'atlas-traveller', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your traveller' });
  const panel = h('div', { class: 't-panel ui-card' });
  root.append(panel);

  const close = h('button', { class: 'ui-btn icon t-close', title: 'Close (Esc)', 'aria-label': 'Close' }, icon('close'));
  panel.append(
    h(
      'div',
      { class: 't-head' },
      h('div', { class: 't-badge' }, icon('walk')),
      h(
        'div',
        {},
        h('div', { class: 't-title', text: 'Your traveller' }),
        h('div', { class: 't-sub', text: 'How you look to everyone else in the world. Saved on this device.' }),
      ),
      close,
    ),
  );

  /* --- the state: one appearance, applied on every change ---------------- */

  let look: Appearance = fitAppearance(options.appearance.get());
  const refreshers: (() => void)[] = [];

  function change(next: Appearance): void {
    look = fitAppearance(next);
    options.appearance.set(look);
    for (const refresh of refreshers) refresh();
    redress();
  }

  /* --- the controls ------------------------------------------------------ */

  function swatches(label: string, colours: readonly number[], get: () => number, set: (index: number) => void): HTMLElement {
    const buttons = colours.map((color, index) => {
      const button = h('button', {
        type: 'button',
        class: 't-swatch',
        title: colourName(color),
        'aria-label': `${label}: ${colourName(color)}`,
        'aria-pressed': 'false',
      });
      button.style.background = hex(color);
      button.addEventListener('click', () => set(index));
      return button;
    });
    refreshers.push(() => buttons.forEach((button, index) => button.setAttribute('aria-pressed', String(index === get()))));
    return h('div', { class: 't-swatches', role: 'group', 'aria-label': label }, ...buttons);
  }

  function row(label: string, side: Node | null, below?: Node): HTMLElement {
    return h('div', { class: 't-row' }, h('div', { class: 't-line' }, h('span', { class: 't-label', text: label }), side), below ?? null);
  }

  const bodyButtons = (['man', 'woman'] as const).map((body) => {
    const button = h('button', { type: 'button', text: body === 'man' ? 'Man' : 'Woman', 'aria-pressed': 'false' });
    // A body is its own wardrobe, so switching keeps the colours and takes
    // that body's first of everything, not the other body's indices.
    button.addEventListener('click', () => {
      if (look.body !== body) change({ ...look, body, head: 0, top: 0, bottom: 0, feet: 0 });
    });
    return [body, button] as const;
  });
  refreshers.push(() => bodyButtons.forEach(([body, button]) => button.setAttribute('aria-pressed', String(body === look.body))));
  const bodyRow = row('Body', h('div', { class: 'ui-seg', role: 'group', 'aria-label': 'Body' }, ...bodyButtons.map(([, button]) => button)));

  const skinRow = row(
    'Skin',
    null,
    swatches('Skin', SKINS, () => look.skin, (skin) => change({ ...look, skin })),
  );

  function slotRow(slot: Slot): HTMLElement {
    const title = SLOT_TITLE[slot];
    const output = h('output', { 'aria-live': 'polite' });
    const step = (by: number) => () => {
      const count = WARDROBE[look.body][slot].length;
      change({ ...look, [slot]: (look[slot] + by + count) % count });
    };
    const previous = h('button', { type: 'button', class: 'ui-btn icon', 'aria-label': `Previous ${title.toLowerCase()}` }, icon('back'));
    const next = h('button', { type: 'button', class: 'ui-btn icon', 'aria-label': `Next ${title.toLowerCase()}` }, icon('next'));
    previous.addEventListener('click', step(-1));
    next.addEventListener('click', step(1));
    refreshers.push(() => {
      const list = WARDROBE[look.body][slot];
      output.replaceChildren(document.createTextNode(list[look[slot]]!.label), h('small', { text: `${look[slot] + 1} of ${list.length}` }));
    });
    const field = SLOT_COLOUR[slot];
    const colours = slot === 'head' ? HAIR : CLOTH;
    return row(
      title,
      h('div', { class: 't-pick' }, previous, output, next),
      swatches(`${title} colour`, colours, () => look[field], (index) => change({ ...look, [field]: index })),
    );
  }

  const packSwitch = h('button', { class: 'ui-switch', role: 'switch', 'aria-label': 'Rucksack' });
  packSwitch.addEventListener('click', () => change({ ...look, pack: !look.pack }));
  refreshers.push(() => packSwitch.setAttribute('aria-checked', String(look.pack)));
  const packRow = row(
    'Rucksack',
    packSwitch,
    swatches('Rucksack colour', CLOTH, () => look.packColour, (packColour) => change({ ...look, packColour, pack: true })),
  );

  const name = options.name;
  const nameInput = h('input', {
    class: 't-name',
    type: 'text',
    maxlength: 20,
    placeholder: 'Traveller',
    autocomplete: 'nickname',
    spellcheck: 'false',
    'aria-label': 'Your name',
  });
  if (name !== undefined) {
    // Handed over on `change` — Enter or leaving the field — because a rename
    // is a reconnection.
    nameInput.addEventListener('change', () => {
      nameInput.value = name.set(nameInput.value);
    });
    nameInput.addEventListener('keydown', (event) => {
      if (event.code === 'Enter') nameInput.blur();
    });
  }

  const rows = h(
    'div',
    { class: 't-rows' },
    name === undefined ? null : row('Name', nameInput),
    bodyRow,
    skinRow,
    ...(['head', 'top', 'bottom', 'feet'] as const).map(slotRow),
    packRow,
  );

  const view = h('div', { class: 't-view', title: 'Drag to turn' });
  const wait = h('div', { class: 't-wait', text: 'Unpacking the wardrobe…' });
  view.append(wait);
  const randomise = h('button', { type: 'button', class: 'ui-btn' }, icon('sparkle'), 'Randomise');
  const reset = h('button', { type: 'button', class: 'ui-btn quiet' }, 'Default');
  randomise.addEventListener('click', () => change(randomAppearance(rngFrom('traveller', Date.now(), Math.random()))));
  reset.addEventListener('click', () => change({ ...DEFAULT_APPEARANCE }));
  const done = h('button', { type: 'button', class: 'ui-btn primary' }, 'Done');

  panel.append(
    h('div', { class: 't-stage' }, view, h('div', { class: 't-actions' }, randomise, reset)),
    rows,
    h('div', { class: 't-foot' }, done),
  );

  /* --- the preview ------------------------------------------------------- */

  let preview: Preview | null = null;
  let cast: Cast | null = null;
  let spin = Math.PI * 0.15;
  const drawn = new THREE.Vector2();
  let dragging: { x: number; spin: number } | null = null;

  function buildPreview(): Preview {
    const canvas = document.createElement('canvas');
    view.prepend(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    const outline = new OutlineEffect(renderer, { defaultThickness: 0.005, defaultColor: [0.11, 0.02, 0.01] });
    const scene = new THREE.Scene();
    // The cast sheet's light, which is the world's by day.
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    scene.add(new THREE.HemisphereLight(SKY_TOP, 0x6b5b47, 0.35));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(-3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -4;
    sun.shadow.camera.right = sun.shadow.camera.top = 4;
    scene.add(sun, sun.target);
    const turntable = new THREE.Group();
    scene.add(turntable);
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(AVATAR_HEIGHT * 0.62, AVATAR_HEIGHT * 0.62, 0.2, 40), new THREE.MeshToonMaterial({ color: PALETTE.green }));
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(LENS, 1, 0.1, 100);
    // Framed on the figure: a little above the middle, from a little above the eye.
    const aim = new THREE.Vector3(0, AVATAR_HEIGHT * 0.5, 0);
    const distance = (AVATAR_HEIGHT * 0.66) / Math.tan(THREE.MathUtils.degToRad(LENS / 2));
    camera.position.set(0, aim.y + distance * 0.16, distance);
    camera.lookAt(aim);
    return { renderer, outline, scene, camera, turntable, ground, person: null, frame: 0, last: performance.now() };
  }

  function redress(): void {
    if (preview === null || cast === null) return;
    const old = preview.person;
    const person = cast.make(wardrobeOf(look), paintWith(coloursOf(look)), AVATAR_HEIGHT);
    const idle = person.actions.get('Idle_Neutral')!;
    idle.reset().play();
    person.mixer.update(0);
    preview.turntable.add(person.root);
    preview.person = person;
    if (old !== null) cast.release(old);
    // The ground takes the ramp the cast was drawn on, and the same pen.
    const ramp = (person.mesh.material as THREE.MeshToonMaterial).gradientMap;
    const groundMaterial = preview.ground.material as THREE.MeshToonMaterial;
    if (groundMaterial.gradientMap !== ramp) {
      groundMaterial.gradientMap = ramp;
      groundMaterial.userData.outlineParameters = (person.mesh.material as THREE.Material).userData.outlineParameters;
      groundMaterial.needsUpdate = true;
    }
  }

  function draw(now: number): void {
    if (preview === null) return;
    const dt = Math.min(0.1, (now - preview.last) / 1000);
    preview.last = now;
    if (dragging === null && !matchMedia('(prefers-reduced-motion: reduce)').matches) spin += dt * TURN_RATE;
    preview.turntable.rotation.y = spin;
    preview.person?.mixer.update(dt);
    const width = view.clientWidth;
    const height = view.clientHeight;
    if (width > 0 && height > 0) {
      preview.renderer.getSize(drawn);
      if (drawn.x !== width || drawn.y !== height) {
        preview.renderer.setSize(width, height, false);
        preview.camera.aspect = width / height;
        preview.camera.updateProjectionMatrix();
      }
      preview.outline.render(preview.scene, preview.camera);
    }
    preview.frame = requestAnimationFrame(draw);
  }

  function openPreview(): void {
    if (preview !== null) return;
    try {
      preview = buildPreview();
    } catch (error) {
      // No WebGL for a second context: the card still dresses the hero.
      console.warn('traveller: no preview', error);
      wait.textContent = 'No preview on this device; the hero wears it anyway.';
      return;
    }
    preview.frame = requestAnimationFrame(draw);
    options
      .cast()
      .then((loaded) => {
        cast = loaded;
        wait.hidden = true;
        redress();
      })
      .catch((error: unknown) => {
        console.warn('traveller: the wardrobe did not load', error);
        wait.textContent = 'The wardrobe did not arrive.';
      });
  }

  function closePreview(): void {
    if (preview === null) return;
    cancelAnimationFrame(preview.frame);
    if (preview.person !== null && cast !== null) cast.release(preview.person);
    preview.ground.geometry.dispose();
    (preview.ground.material as THREE.Material).dispose();
    preview.renderer.dispose();
    // Handed back now rather than when the collector finds it: browsers cap
    // the contexts a page may hold, and the world holds one.
    preview.renderer.forceContextLoss();
    preview.renderer.domElement.remove();
    preview = null;
  }

  view.addEventListener('pointerdown', (event) => {
    dragging = { x: event.clientX, spin };
    view.setPointerCapture(event.pointerId);
  });
  view.addEventListener('pointermove', (event) => {
    if (dragging !== null) spin = dragging.spin + (event.clientX - dragging.x) * DRAG_TURN;
  });
  const endDrag = (): void => {
    dragging = null;
  };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);

  /* --- opening and closing ------------------------------------------------ */

  let showing = false;
  let relock = false;
  let previousFocus: HTMLElement | null = null;
  registerModal(() => showing);

  function show(opening: { relock?: boolean } = {}): void {
    if (showing) return;
    showing = true;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = options.lockTarget ?? null;
    relock = opening.relock ?? (target !== null && document.pointerLockElement === target);
    options.onOpen?.();
    if (document.pointerLockElement) document.exitPointerLock();
    look = fitAppearance(options.appearance.get());
    if (name !== undefined) nameInput.value = name.get();
    for (const refresh of refreshers) refresh();
    if (!root.isConnected) document.body.append(root);
    root.classList.add('on');
    close.focus({ preventScroll: true });
    openPreview();
    redress();
  }

  // A lock granted while the card is up — asked for by whatever closed as it
  // opened — is handed straight back, as the settings card does.
  document.addEventListener('pointerlockchange', () => {
    if (showing && document.pointerLockElement !== null) document.exitPointerLock();
  });

  function hide(): void {
    if (!showing) return;
    showing = false;
    root.classList.remove('on');
    closePreview();
    options.onClose?.();
    const target = options.lockTarget ?? null;
    if (relock && target !== null && typeof target.requestPointerLock === 'function') {
      // Chrome refuses a lock asked for too soon after one was released; that
      // rejection is noise, the same rule `settings.ts` follows.
      try {
        const request: unknown = target.requestPointerLock();
        if (request instanceof Promise) request.catch(() => {});
      } catch {
        // The card is closed either way.
      }
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (!relock && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  close.addEventListener('click', hide);
  done.addEventListener('click', hide);
  root.addEventListener('pointerdown', (event) => {
    if (event.target === root) hide();
  });
  addEventListener('keydown', (event) => {
    if (!showing) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      // Not the menu's Escape as well, which would go back a stage behind the card.
      event.stopImmediatePropagation();
      hide();
    } else {
      holdFocus(event, panel);
    }
  });

  return {
    root,
    get open() {
      return showing;
    },
    show,
    hide,
  };
}
