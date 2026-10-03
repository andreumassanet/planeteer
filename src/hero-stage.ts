/**
 * The hero on a stage: the traveller drawn large, with the name over their
 * head, behind whatever card is showing them off — the title screen, which
 * stands them on the right, on the bridge of a small ship with the solar
 * system outside its window, and the traveller's creator, which walks the
 * camera up to them and frames whatever is being chosen.
 *
 * **One stage, two callers, and the camera is the transition.** The title and
 * the creator share this object, so pressing *Customise* does not open
 * anything: the title's column slides away, the creator's slides in, and the
 * camera dollies from the title's framing to the creator's (`shot`) while the
 * hero stays where they were, idling. Done is the same move backwards. Opened
 * from the world, where there is no title, the stage comes up on its own over
 * the dimmed world (`show('dim')`) and goes again with the creator.
 *
 * **Where the hero stands on the screen is the caller's.** `insets` says how
 * much of each edge a card covers, and the camera centres the figure in what
 * is left by shifting its lens (`setViewOffset`) rather than by turning, so
 * the figure is never seen from the side because a panel came in.
 *
 * **The backdrop is swappable.** The canvas is transparent and sits on one
 * element (`.hs-backdrop`) whose look is a class: `dim` blurs and darkens the
 * world and stands the hero on a disc of grass, `clear` is the disc over
 * whatever is behind, and `bridge` builds a room round the hero
 * (`bridge.ts`) that covers the whole canvas but its window, so the planet
 * menu's orrery behind is seen through the glass. The bridge and the space
 * kit it is made of arrive by a dynamic import, the first time it is asked
 * for, and stay for the visit; the canvas fades in only once the hero and
 * the room are both standing, so neither appears without the other.
 *
 * **Leaving the bridge is a flight.** `leave` takes the camera over the
 * hero's shoulder and out through the bay of the window nearest the middle of
 * the screen, so the room slides past and what is left is the solar system
 * the menu was drawing all along; the stage fades as the glass goes by.
 *
 * **The figure is a renderer of its own**, made when the stage shows and its
 * context lost on purpose when it goes, so a game that has started holds no
 * second context for it. The same renderer draws the creator's tiles
 * (`portrait`): one small picture a frame, of the hero wearing that choice,
 * drawn into a corner of the canvas and copied out before the stage is drawn
 * over it.
 */
import * as THREE from 'three';
import { coloursOf, encodeAppearance, fitAppearance, wardrobeOf } from './appearance.ts';
import type { Appearance } from './appearance.ts';
import type { Bridge } from './bridge.ts';
import { paintWith } from './cast.ts';
import type { Cast, Person } from './cast.ts';
import { OutlineEffect } from './outline.ts';
import { AVATAR_HEIGHT } from './stature.ts';
import { PALETTE, SKY_TOP } from './theme.ts';
import { ensureStyle, h, installUi } from './ui.ts';

/** How the camera frames the hero. */
export type StageShot = 'title' | 'full' | 'head' | 'top' | 'legs' | 'feet' | 'back';
/** What shows behind the hero: the ship's bridge, nothing (the menu does), or the world dimmed. */
export type StageBackdrop = 'bridge' | 'clear' | 'dim';
/** Who is showing the hero: the title turns them to the pointer, the creator holds them still. */
export type StageMode = 'title' | 'creator';
/** What a creator's tile is a picture of. */
export type PortraitFrame = 'body' | 'head' | 'top' | 'bottom' | 'feet' | 'pack';

export interface StageInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface HeroStageOptions {
  /** The traveller's look, read every frame so a change shows at once. */
  appearance(): Appearance;
  /** The cast the figure is dressed from, with every outfit loaded. */
  cast(): Promise<Cast>;
  /** The traveller's name, for the plate over their head: `set` returns what was kept. */
  name: { get(): string; set(name: string): string };
}

export interface HeroStage {
  root: HTMLElement;
  /** The name over the hero's head. A card adopts it (`adoptPlate`) so its keyboard reaches the pencil. */
  plate: HTMLElement;
  readonly open: boolean;
  /** Whether the wardrobe has arrived and the hero is standing. */
  readonly ready: boolean;
  readonly shotName: StageShot;
  show(backdrop: StageBackdrop): void;
  hide(): void;
  /** Hides the stage by flying the camera out of the bridge's window; off the bridge, or under reduced motion, a plain `hide`. */
  leave(): void;
  mode(mode: StageMode): void;
  /** Moves the camera to a framing; `instant` cuts rather than dollies. */
  shot(shot: StageShot, options?: { instant?: boolean }): void;
  /** How much of each edge, in CSS pixels, a card covers. Eased, as a shot is. */
  insets(insets: Partial<StageInsets>): void;
  /** Puts the name plate in `container`, which may be any element on the page. */
  adoptPlate(container: HTMLElement): void;
  /** A wave, when one is not already under way. */
  wave(): void;
  /** Starts editing the name on the plate. */
  editName(): void;
  /** Reads the name again, after something else changed it. */
  refreshName(): void;
  /** Called with the name kept whenever the plate changes it. Returns the unsubscribe. */
  onName(listener: (name: string) => void): () => void;
  /** Draws the hero in `look` into `canvas`, now if it was drawn before, else within a few frames. */
  portrait(look: Appearance, frame: PortraitFrame, canvas: HTMLCanvasElement): void;
}

/** The lens: narrow, so a figure filling the frame does not get a wide lens's big head. */
const LENS = 24;
const TAN = Math.tan(THREE.MathUtils.degToRad(LENS / 2));
/** How far the figure turns towards the pointer on the title, either way, in radians. */
const LOOK_TURN = 0.75;
/** How fast it follows the pointer there, and how far it sways by itself. */
const LOOK_LAG = 0.35;
const SWAY = 0.12;
/** Radians of turn per pixel dragged. */
const DRAG_TURN = 0.011;
/** Seconds the camera takes to settle on a new framing (a time constant). */
const DOLLY = 0.3;
/** Seconds between two waves on the title while nobody is doing anything, and the first one's delay. */
const WAVE_EVERY = 14;
const WAVE_FIRST = 1.2;
/** How far the head turns towards the pointer, either way, and up or down. */
const HEAD_YAW = 0.75;
const HEAD_UP = 0.3;
const HEAD_DOWN = 0.38;
/** A tile's picture, in device pixels, and how many are kept. */
const PORTRAIT_SIZE = 128;
const PORTRAIT_KEEP = 160;
/** The pen in a tile: wider than the world's, as a share of the view, so the line is a pixel or so. */
const PORTRAIT_INK = 0.017;
/** Over the crown, in units of height: where the plate's point sits. */
const PLATE_AT = 1.06;
/** Seconds the camera takes to fly out of the bridge's window, and when in them the stage starts to fade. */
const LEAVE = 1.25;
const LEAVE_FADE = 0.6;
/** The ship's idle: how far the camera bobs, in units, and rolls, in radians, and how slowly. */
const BOB = 0.035;
const ROLL = 0.0035;

/**
 * A framing, in units of the hero's height: where the camera aims, how much
 * of the height either side of that must show, how much of the width, how
 * high the camera rides over the aim (a share of its distance), and which
 * way the creator turns the hero for it (0 faces the camera).
 */
interface Shot {
  aim: number;
  fill: number;
  width: number;
  elev: number;
  yaw: number;
}

const SHOTS: Readonly<Record<StageShot, Shot>> = {
  title: { aim: 0.5, fill: 0.62, width: 0.55, elev: 0.14, yaw: 0 },
  full: { aim: 0.5, fill: 0.6, width: 0.5, elev: 0.12, yaw: 0.35 },
  head: { aim: 0.9, fill: 0.135, width: 0.14, elev: 0.03, yaw: 0.3 },
  top: { aim: 0.69, fill: 0.25, width: 0.28, elev: 0.06, yaw: 0.35 },
  legs: { aim: 0.3, fill: 0.3, width: 0.3, elev: 0.1, yaw: 0.5 },
  feet: { aim: 0.07, fill: 0.15, width: 0.24, elev: 0.45, yaw: 0.6 },
  back: { aim: 0.66, fill: 0.34, width: 0.36, elev: 0.12, yaw: Math.PI - 0.55 },
};

/** A tile's framing: the same terms, square. */
const PORTRAITS: Readonly<Record<PortraitFrame, Omit<Shot, 'width'>>> = {
  body: { aim: 0.5, fill: 0.56, elev: 0.1, yaw: 0.35 },
  head: { aim: 0.9, fill: 0.14, elev: 0.04, yaw: 0.35 },
  top: { aim: 0.68, fill: 0.22, elev: 0.06, yaw: 0.35 },
  bottom: { aim: 0.3, fill: 0.27, elev: 0.1, yaw: 0.45 },
  feet: { aim: 0.06, fill: 0.12, elev: 0.55, yaw: 0.6 },
  pack: { aim: 0.68, fill: 0.25, elev: 0.1, yaw: Math.PI - 0.6 },
};

const STYLE = `
.atlas-stage {
  position: fixed;
  inset: 0;
  z-index: 10;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.45s ease, visibility 0s 0.45s;
}
.atlas-stage.on { opacity: 1; visibility: visible; transition-delay: 0s; }
.hs-backdrop { position: absolute; inset: 0; transition: background 0.5s ease, backdrop-filter 0.5s ease; }
.hs-backdrop.clear {
  background: radial-gradient(ellipse 34% 46% at var(--hs-x, 70%) 62%, rgba(253, 230, 225, 0.1), transparent 70%);
}
.hs-backdrop.dim {
  background:
    radial-gradient(ellipse 36% 50% at var(--hs-x, 62%) 60%, rgba(253, 230, 225, 0.2), transparent 72%),
    linear-gradient(90deg, rgba(4, 6, 14, 0.78), rgba(4, 6, 14, 0.5) 45%, rgba(4, 6, 14, 0.62));
  backdrop-filter: blur(6px) saturate(0.75);
  -webkit-backdrop-filter: blur(6px) saturate(0.75);
}
.hs-view { position: absolute; inset: 0; pointer-events: auto; cursor: grab; touch-action: none; }
.hs-view.dragging { cursor: grabbing; }
.hs-view canvas { display: block; width: 100%; height: 100%; opacity: 0; transition: opacity 0.5s ease; }
.hs-view.drawn canvas { opacity: 1; }
.atlas-stage.leaving .hs-view { pointer-events: none; }
.hs-wait {
  position: absolute;
  left: var(--hs-x, 70%);
  top: 50%;
  transform: translate(-50%, -50%);
  font: 800 13px var(--ui-font);
  color: rgba(255, 242, 232, 0.8);
  text-shadow: 0 2px 0 rgba(4, 6, 14, 0.7);
}
.hs-plate {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 300px;
  padding: 5px 5px 5px 15px;
  font-family: var(--ui-font);
  color: var(--ui-ink);
  background: var(--ui-paper);
  border: 3px solid var(--ui-ink);
  border-radius: 999px;
  box-shadow: 0 4px 0 var(--ui-ink);
  pointer-events: auto;
  white-space: nowrap;
  transform: translate(-9999px, 0);
  will-change: transform;
  transition: opacity 0.3s ease;
}
.hs-plate[hidden] { display: none; }
.hs-plate.away { opacity: 0; pointer-events: none; }
.hs-plate::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -11px;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  background: var(--ui-paper);
  border: solid var(--ui-ink);
  border-width: 0 3px 3px 0;
  transform: rotate(45deg);
}
.hs-name { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; overflow: hidden; text-overflow: ellipsis; }
.hs-name.empty { opacity: 0.45; }
.hs-plate input {
  width: 180px;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: var(--ui-cream);
  font: 800 17px var(--ui-font);
  letter-spacing: -0.02em;
  color: var(--ui-ink);
}
.hs-plate input::placeholder { color: rgba(30, 6, 3, 0.4); }
.hs-plate input:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--ui-violet); }
.hs-pen {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 2.5px solid var(--ui-ink);
  border-radius: 50%;
  background: var(--ui-gold);
  color: var(--ui-ink);
  cursor: pointer;
  transition: transform 0.12s var(--ui-spring);
}
.hs-pen:hover { transform: rotate(-12deg) scale(1.08); }
.hs-pen:focus-visible { outline: var(--ui-ring); outline-offset: 3px; }
.hs-pen svg { width: 15px; height: 15px; }
@media (prefers-reduced-motion: reduce) {
  .atlas-stage, .hs-backdrop, .hs-view canvas { transition: none; }
}
`;

const PEN = '<path d="M4.5 19.5l1-4.4L15.6 5a2.1 2.1 0 0 1 3 3L8.5 18.5z"/><path d="M13.6 7l3 3"/>';
const CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';
const glyph = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

/** The renderer and everything drawn with it, all of it gone when the stage goes. */
interface Scene {
  renderer: THREE.WebGLRenderer;
  outline: OutlineEffect;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  turntable: THREE.Group;
  plinth: THREE.Mesh[];
  person: Person | null;
  worn: string;
  /** The portraits': a scene of their own with the same light, and a square lens. */
  portraitScene: THREE.Scene;
  portraitTable: THREE.Group;
  portraitCamera: THREE.PerspectiveCamera;
  frame: number;
  last: number;
}

/** The light the world has by day, which the traveller's card always had. */
function light(scene: THREE.Scene, shadows: boolean): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.42));
  scene.add(new THREE.HemisphereLight(SKY_TOP, 0x6b5b47, 0.35));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
  sun.position.set(-3, 6, 4);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -4;
    sun.shadow.camera.right = sun.shadow.camera.top = 4;
  }
  // A warm rim from behind on the other side, so the silhouette lifts off a dark backdrop.
  const rim = new THREE.DirectionalLight(0xffd9b0, 0.9);
  rim.position.set(4, 3, -5);
  scene.add(sun, sun.target, rim, rim.target);
}

export function createHeroStage(options: HeroStageOptions): HeroStage {
  installUi();
  ensureStyle('atlas-stage', STYLE);

  const backdrop = h('div', { class: 'hs-backdrop clear' });
  const view = h('div', { class: 'hs-view', 'aria-hidden': 'true' });
  const wait = h('div', { class: 'hs-wait', text: 'Unpacking the wardrobe…' });
  const root = h('div', { class: 'atlas-stage' }, backdrop, view, wait);

  /* --- the name plate ------------------------------------------------------ */

  const nameText = h('span', { class: 'hs-name' });
  const pen = h('button', { type: 'button', class: 'hs-pen', title: 'Change your name', 'aria-label': 'Change your name', html: glyph(PEN) });
  const nameInput = h('input', {
    type: 'text',
    maxlength: 20,
    placeholder: 'Your name',
    spellcheck: 'false',
    autocomplete: 'nickname',
    'aria-label': 'Your name',
  });
  nameInput.hidden = true;
  const plate = h('div', { class: 'hs-plate' }, nameText, nameInput, pen);
  root.append(plate);
  const nameListeners = new Set<(name: string) => void>();
  let editing = false;

  function refreshName(): void {
    const name = options.name.get();
    nameText.textContent = name === '' ? 'Traveller' : name;
    nameText.classList.toggle('empty', name === '');
    plate.title = name === '' ? 'No name yet: the others see a traveller with a number' : '';
  }

  function editName(): void {
    if (editing) return;
    editing = true;
    nameInput.value = options.name.get();
    nameText.hidden = true;
    nameInput.hidden = false;
    pen.innerHTML = glyph(CHECK);
    pen.title = 'Keep this name (Enter)';
    pen.setAttribute('aria-label', 'Keep this name');
    nameInput.focus({ preventScroll: true });
    nameInput.select();
  }

  function stopEditing(keep: boolean): void {
    if (!editing) return;
    editing = false;
    if (keep) {
      const kept = options.name.set(nameInput.value);
      for (const listener of nameListeners) listener(kept);
    }
    nameInput.hidden = true;
    nameText.hidden = false;
    pen.innerHTML = glyph(PEN);
    pen.title = 'Change your name';
    pen.setAttribute('aria-label', 'Change your name');
    refreshName();
  }

  // The pen keeps the focus off the field as it is pressed, so a click on it
  // while editing is a Keep and not a blur and then an Edit.
  pen.addEventListener('pointerdown', (event) => event.preventDefault());
  pen.addEventListener('click', () => {
    if (editing) {
      stopEditing(true);
      pen.focus({ preventScroll: true });
    } else editName();
  });
  nameText.addEventListener('dblclick', editName);
  nameInput.addEventListener('keydown', (event) => {
    // Not the card's keys as well: Escape here is a cancel, not a close.
    if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault();
      event.stopPropagation();
      stopEditing(true);
      pen.focus({ preventScroll: true });
    } else if (event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stopEditing(false);
      pen.focus({ preventScroll: true });
    }
  });
  nameInput.addEventListener('blur', () => stopEditing(true));

  /* --- the camera's state ---------------------------------------------------- */

  let current: StageShot = 'title';
  let behaviour: StageMode = 'title';
  /** The framing drawn, eased towards `target()`. */
  const drawnShot: Shot = { ...SHOTS.title };
  const wantedInsets: StageInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  const drawnInsets: StageInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  /** The wheel: towards the face above zero, towards the whole body below it. */
  let zoom = 0;
  /** How much further out the camera starts as the stage comes up, easing to 1. */
  let intro = 1;
  let turn = 0;
  let look = 0;
  /** The creator's turn: by hand, on top of the shot's. */
  let handTurn = 0;
  let headYaw = 0;
  let headPitch = 0;
  const pointer = { x: 0.5, y: 0.5, inside: false };
  let clock = 0;
  let dragging: { x: number; from: number; id: number } | null = null;
  let gesture: { action: THREE.AnimationAction; idle: THREE.AnimationAction; at: number } | null = null;
  let nextWave = WAVE_FIRST;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  let stage: Scene | null = null;
  let cast: Cast | null = null;
  let backdropKind: StageBackdrop = 'clear';
  /** Frames drawn with everything standing; the canvas shows from the second, its programs compiled. */
  let standingFrames = 0;
  /** The flight out of the window, while it lasts: when it began, from where, looking where, and to where. */
  let leaving: { at: number; from: THREE.Vector3; aim: THREE.Vector3; via: THREE.Vector3; out: THREE.Vector3; look: THREE.Vector3 } | null = null;
  let headRest: THREE.Quaternion | null = null;
  const size = new THREE.Vector2();
  const scratch = {
    head: new THREE.Vector3(),
    target: new THREE.Vector3(),
    ray: new THREE.Raycaster(),
    ndc: new THREE.Vector2(),
    parent: new THREE.Quaternion(),
    parentInverse: new THREE.Quaternion(),
    yaw: new THREE.Quaternion(),
    pitch: new THREE.Quaternion(),
    axis: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    crown: new THREE.Vector3(),
    aim: new THREE.Vector3(),
    bay: new THREE.Vector3(),
  };

  /* --- portraits --------------------------------------------------------------- */

  const portraits = new Map<string, ImageData>();
  const queue = new Map<HTMLCanvasElement, { key: string; look: Appearance; frame: PortraitFrame }>();
  const portraitKey = (look: Appearance, frame: PortraitFrame): string => `${frame}:${encodeAppearance(look)}`;

  function paste(canvas: HTMLCanvasElement, image: ImageData): void {
    if (canvas.width !== image.width) canvas.width = image.width;
    if (canvas.height !== image.height) canvas.height = image.height;
    canvas.getContext('2d')?.putImageData(image, 0, 0);
    canvas.classList.add('drawn');
  }

  function portrait(look: Appearance, frame: PortraitFrame, canvas: HTMLCanvasElement): void {
    const key = portraitKey(look, frame);
    canvas.dataset['want'] = key;
    const kept = portraits.get(key);
    if (kept !== undefined) {
      queue.delete(canvas);
      paste(canvas, kept);
      return;
    }
    queue.set(canvas, { key, look: fitAppearance(look), frame });
  }

  /** One portrait from the queue, drawn in the canvas's corner and copied out. False if none was due. */
  function drawPortrait(s: Scene): boolean {
    if (cast === null) return false;
    for (const [canvas, job] of queue) {
      queue.delete(canvas);
      if (canvas.dataset['want'] !== job.key || !canvas.isConnected) continue;
      const kept = portraits.get(job.key);
      if (kept !== undefined) {
        paste(canvas, kept);
        continue;
      }
      const ratio = s.renderer.getPixelRatio();
      s.renderer.getSize(size);
      const side = PORTRAIT_SIZE / ratio;
      if (size.x < side || size.y < side) {
        queue.set(canvas, job);
        return false;
      }
      const person = cast.make(wardrobeOf(job.look), paintWith(coloursOf(job.look)), AVATAR_HEIGHT);
      try {
        // A pooled person may come back mid-gesture.
        person.mixer.stopAllAction();
        person.actions.get('Idle_Neutral')?.reset().play();
        person.mixer.update(0.4);
        const framing = PORTRAITS[job.frame];
        s.portraitTable.rotation.y = framing.yaw;
        s.portraitTable.add(person.root);
        const distance = (framing.fill * AVATAR_HEIGHT) / TAN;
        const aim = framing.aim * AVATAR_HEIGHT;
        s.portraitCamera.position.set(0, aim + distance * framing.elev, distance);
        s.portraitCamera.lookAt(0, aim, 0);
        s.portraitCamera.updateMatrixWorld();
        s.renderer.setViewport(0, 0, side, side);
        s.renderer.setScissor(0, 0, side, side);
        s.renderer.setScissorTest(true);
        // The pen is a share of the view, and a tile is a small view: drawn
        // at the world's width its line would be a third of a pixel.
        const material = person.mesh.material as THREE.Material;
        const pen = material.userData['outlineParameters'] as Record<string, unknown> | undefined;
        material.userData['outlineParameters'] = { ...pen, thickness: PORTRAIT_INK };
        try {
          s.outline.render(s.portraitScene, s.portraitCamera);
        } finally {
          if (pen === undefined) delete material.userData['outlineParameters'];
          else material.userData['outlineParameters'] = pen;
        }
        const canvasPixels = s.renderer.domElement;
        const copy = document.createElement('canvas');
        copy.width = copy.height = PORTRAIT_SIZE;
        const context = copy.getContext('2d', { willReadFrequently: true });
        if (context !== null) {
          context.drawImage(canvasPixels, 0, canvasPixels.height - PORTRAIT_SIZE, PORTRAIT_SIZE, PORTRAIT_SIZE, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
          const image = context.getImageData(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
          if (portraits.size >= PORTRAIT_KEEP) portraits.delete(portraits.keys().next().value!);
          portraits.set(job.key, image);
          paste(canvas, image);
        }
      } finally {
        s.renderer.setScissorTest(false);
        s.renderer.setViewport(0, 0, size.x, size.y);
        s.portraitTable.remove(person.root);
        cast.release(person);
      }
      return true;
    }
    return false;
  }

  /* --- the bridge ------------------------------------------------------------------ */

  /** The room, once built: kept for the visit and drawn by whichever renderer the stage has then. */
  let bridge: Bridge | null = null;
  let bridgeKit: { module: typeof import('./bridge.ts'); pieces: Awaited<ReturnType<typeof import('./bridge.ts')['loadBridgePieces']>> } | null = null;
  let bridgeAsked = false;
  /** The kit did not arrive, or the room could not be built: the disc stands in for it. */
  let bridgeFailed = false;

  function wantBridge(): void {
    if (bridgeAsked) return;
    bridgeAsked = true;
    import('./bridge.ts')
      .then(async (module) => {
        bridgeKit = { module, pieces: await module.loadBridgePieces() };
        buildBridge();
      })
      .catch((error: unknown) => {
        console.warn('stage: the bridge did not arrive', error);
        bridgeFailed = true;
        setScenery();
      });
  }

  /** Builds the room once there is both a kit and a hero to take the ramp and the pen from. */
  function buildBridge(): void {
    const person = stage?.person ?? null;
    if (bridge !== null || bridgeKit === null || person === null) return;
    const material = person.mesh.material as THREE.MeshToonMaterial;
    const ink = material.userData['outlineParameters'] as { thickness: number; color: [number, number, number] } | undefined;
    try {
      bridge = bridgeKit.module.buildBridge(bridgeKit.pieces, {
        gradientMap: material.gradientMap!,
        ink: { thickness: ink?.thickness ?? 0.005, color: ink?.color ?? [0.11, 0.02, 0.01] },
      });
    } catch (error) {
      console.warn('stage: the bridge could not be built', error);
      bridgeFailed = true;
    }
    setScenery();
  }

  /** The room on the bridge, the disc of grass everywhere else. */
  function setScenery(): void {
    const s = stage;
    if (s === null) return;
    const onBridge = backdropKind === 'bridge' && bridge !== null;
    for (const mesh of s.plinth) mesh.visible = !onBridge;
    if (bridge === null) return;
    if (onBridge && bridge.group.parent !== s.scene) s.scene.add(bridge.group);
    else if (!onBridge && bridge.group.parent === s.scene) s.scene.remove(bridge.group);
  }

  /** Whether everything this backdrop needs is standing, so the canvas may show. */
  function standing(s: Scene): boolean {
    return s.person !== null && (backdropKind !== 'bridge' || bridge !== null || bridgeFailed);
  }

  /* --- the scene ------------------------------------------------------------------ */

  function build(): Scene {
    const canvas = document.createElement('canvas');
    view.prepend(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    const outline = new OutlineEffect(renderer, { defaultThickness: 0.0035, defaultColor: [0.11, 0.02, 0.01] });
    const scene = new THREE.Scene();
    light(scene, true);
    const turntable = new THREE.Group();
    scene.add(turntable);
    // A little world to stand on: a disc of grass on a bank of earth, round
    // and thick enough to read as one, under the same pen as the figure.
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(AVATAR_HEIGHT * 0.5, AVATAR_HEIGHT * 0.49, AVATAR_HEIGHT * 0.05, 56),
      new THREE.MeshToonMaterial({ color: PALETTE.green }),
    );
    top.position.y = -AVATAR_HEIGHT * 0.025;
    top.receiveShadow = true;
    const bank = new THREE.Mesh(
      new THREE.CylinderGeometry(AVATAR_HEIGHT * 0.47, AVATAR_HEIGHT * 0.38, AVATAR_HEIGHT * 0.1, 56),
      new THREE.MeshToonMaterial({ color: PALETTE.brown }),
    );
    bank.position.y = -AVATAR_HEIGHT * 0.1;
    scene.add(top, bank);
    const camera = new THREE.PerspectiveCamera(LENS, 1, 0.1, 200);
    const portraitScene = new THREE.Scene();
    light(portraitScene, false);
    const portraitTable = new THREE.Group();
    portraitScene.add(portraitTable);
    const portraitCamera = new THREE.PerspectiveCamera(LENS, 1, 0.1, 200);
    return {
      renderer,
      outline,
      scene,
      camera,
      turntable,
      plinth: [top, bank],
      person: null,
      worn: '',
      portraitScene,
      portraitTable,
      portraitCamera,
      frame: 0,
      last: performance.now(),
    };
  }

  function redress(s: Scene, appearance: Appearance): void {
    if (cast === null) return;
    const old = s.person;
    const fitted = fitAppearance(appearance);
    const person = cast.make(wardrobeOf(fitted), paintWith(coloursOf(fitted)), AVATAR_HEIGHT);
    person.mixer.stopAllAction();
    const idle = person.actions.get('Idle_Neutral');
    idle?.reset().play();
    // The idle carries on where it was, so a change of shirt is not a twitch.
    const before = old?.actions.get('Idle_Neutral');
    if (idle !== undefined && before !== undefined) idle.time = before.time;
    person.mixer.update(0);
    const head = person.bones.get('Head');
    headRest = head === undefined ? null : head.quaternion.clone();
    s.turntable.add(person.root);
    s.person = person;
    s.worn = encodeAppearance(appearance);
    gesture = null;
    if (old !== null) {
      s.turntable.remove(old.root);
      cast.release(old);
    }
    buildBridge();
    // The plinth takes the ramp the cast was drawn on, and the same pen.
    const material = person.mesh.material as THREE.MeshToonMaterial;
    for (const mesh of s.plinth) {
      const own = mesh.material as THREE.MeshToonMaterial;
      if (own.gradientMap === material.gradientMap) continue;
      own.gradientMap = material.gradientMap;
      own.userData.outlineParameters = material.userData.outlineParameters;
      own.needsUpdate = true;
    }
  }

  function wave(): void {
    const person = stage?.person;
    if (person === undefined || person === null || gesture !== null || calm.matches) return;
    const action = person.actions.get('Wave');
    const idle = person.actions.get('Idle_Neutral');
    if (action === undefined || idle === undefined) return;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.setEffectiveWeight(0);
    action.play();
    gesture = { action, idle, at: clock };
  }

  /** The framing the camera is easing towards: the shot, pulled by the wheel. */
  function target(): Shot {
    const base = SHOTS[current];
    if (zoom === 0) return base;
    const towards = zoom > 0 ? SHOTS.head : SHOTS.full;
    const t = Math.abs(zoom);
    return {
      aim: THREE.MathUtils.lerp(base.aim, towards.aim, t),
      fill: THREE.MathUtils.lerp(base.fill, towards.fill, t),
      width: THREE.MathUtils.lerp(base.width, towards.width, t),
      elev: THREE.MathUtils.lerp(base.elev, towards.elev, t),
      yaw: base.yaw,
    };
  }

  function placeCamera(s: Scene, width: number, height: number): void {
    const inset = drawnInsets;
    const freeWidth = Math.max(120, width - inset.left - inset.right);
    const freeHeight = Math.max(120, height - inset.top - inset.bottom);
    const H = AVATAR_HEIGHT;
    const distance =
      Math.max((drawnShot.fill * H * height) / (freeHeight * TAN), (drawnShot.width * H * height) / (freeWidth * TAN)) * intro;
    const aim = drawnShot.aim * H;
    s.camera.position.set(0, aim + distance * drawnShot.elev, distance);
    scratch.aim.set(0, aim, 0);
    let roll = 0;
    if (leaving !== null) {
      // Over the shoulder and out through the bay: a curve bent towards `via`, eased in and out.
      const t = Math.min(1, (clock - leaving.at) / LEAVE);
      const e = t * t * (3 - 2 * t);
      const a = (1 - e) * (1 - e);
      const b = 2 * (1 - e) * e;
      const c = e * e;
      s.camera.position.set(
        leaving.from.x * a + leaving.via.x * b + leaving.out.x * c,
        leaving.from.y * a + leaving.via.y * b + leaving.out.y * c,
        leaving.from.z * a + leaving.via.z * b + leaving.out.z * c,
      );
      scratch.aim.lerpVectors(leaving.aim, leaving.look, Math.min(1, e * 1.4));
    } else if (backdropKind === 'bridge' && bridge !== null && !calm.matches) {
      // The ship idles: a slow bob and a slower roll, half as much while the creator frames a detail.
      const amount = behaviour === 'title' ? 1 : 0.5;
      s.camera.position.y += Math.sin(clock * 0.47) * BOB * amount;
      s.camera.position.x += Math.sin(clock * 0.29 + 1.3) * BOB * 0.6 * amount;
      roll = Math.sin(clock * 0.31) * ROLL * amount;
    }
    s.camera.lookAt(scratch.aim);
    if (roll !== 0) s.camera.rotateZ(roll);
    s.camera.aspect = width / height;
    // The lens shifted, not turned, to centre the figure in what the cards leave.
    const centreX = inset.left + freeWidth / 2;
    const centreY = inset.top + freeHeight / 2;
    s.camera.setViewOffset(width, height, width / 2 - centreX, height / 2 - centreY, width, height);
    s.camera.updateProjectionMatrix();
    s.camera.updateMatrixWorld();
    root.style.setProperty('--hs-x', `${((centreX / width) * 100).toFixed(1)}%`);
  }

  /** The head turned towards the pointer, after the clip has posed it. */
  function aimHead(s: Scene, dt: number): void {
    const person = s.person;
    const head = person?.bones.get('Head');
    if (person === null || head === undefined || head.parent === null) return;
    person.root.updateMatrixWorld(true);
    head.getWorldPosition(scratch.head);
    let yawWanted = 0;
    let pitchWanted = 0;
    if (pointer.inside && dragging === null && !calm.matches) {
      scratch.ndc.set(pointer.x * 2 - 1, -(pointer.y * 2 - 1));
      scratch.ray.setFromCamera(scratch.ndc, s.camera);
      const reach = s.camera.position.distanceTo(scratch.head) * 0.6;
      scratch.ray.ray.at(reach, scratch.target).sub(scratch.head);
      const relative = Math.atan2(scratch.target.x, scratch.target.z) - s.turntable.rotation.y;
      const wrapped = Math.atan2(Math.sin(relative), Math.cos(relative));
      // Nobody looks over their own shoulder at a pointer behind them.
      const weight = 1 - THREE.MathUtils.smoothstep(Math.abs(wrapped), 1.3, 2);
      yawWanted = THREE.MathUtils.clamp(wrapped, -HEAD_YAW, HEAD_YAW) * weight;
      const up = Math.atan2(scratch.target.y, Math.hypot(scratch.target.x, scratch.target.z));
      pitchWanted = THREE.MathUtils.clamp(up, -HEAD_DOWN, HEAD_UP) * weight;
    }
    const k = 1 - Math.exp(-dt / 0.22);
    headYaw += (yawWanted - headYaw) * k;
    headPitch += (pitchWanted - headPitch) * k;
    if (Math.abs(headYaw) < 1e-4 && Math.abs(headPitch) < 1e-4) return;
    const turnY = s.turntable.rotation.y;
    scratch.yaw.setFromAxisAngle(scratch.up, headYaw);
    // Looking up is a turn back about the body's own right-hand axis.
    scratch.axis.set(Math.cos(turnY + headYaw), 0, -Math.sin(turnY + headYaw));
    scratch.pitch.setFromAxisAngle(scratch.axis, -headPitch);
    scratch.yaw.premultiply(scratch.pitch);
    head.parent.getWorldQuaternion(scratch.parent);
    scratch.parentInverse.copy(scratch.parent).invert();
    // local' = parent⁻¹ · turn · parent · local
    head.quaternion.premultiply(scratch.parent).premultiply(scratch.yaw).premultiply(scratch.parentInverse);
  }

  function draw(now: number): void {
    const s = stage;
    if (s === null) return;
    s.frame = requestAnimationFrame(draw);
    const dt = Math.min(0.1, Math.max(0, (now - s.last) / 1000));
    s.last = now;
    clock += dt;
    const appearance = options.appearance();
    if (cast !== null && encodeAppearance(appearance) !== s.worn) redress(s, appearance);

    // The framing, eased; under reduced motion it cuts.
    const ease = calm.matches ? 1 : 1 - Math.exp(-dt / DOLLY);
    const aimed = target();
    for (const key of ['aim', 'fill', 'width', 'elev'] as const) drawnShot[key] += (aimed[key] - drawnShot[key]) * ease;
    for (const key of ['left', 'right', 'top', 'bottom'] as const) drawnInsets[key] += (wantedInsets[key] - drawnInsets[key]) * ease;
    intro += (1 - intro) * (calm.matches ? 1 : 1 - Math.exp(-dt / 0.5));

    // Which way the hero faces.
    if (behaviour === 'title') {
      if (dragging === null) {
        const wantedLook = (pointer.x - 0.5) * 2 * LOOK_TURN + (calm.matches ? 0 : Math.sin(clock * 0.4) * SWAY);
        look += (wantedLook - look) * (1 - Math.exp(-dt / LOOK_LAG));
        turn *= Math.exp(-dt / 2.5);
      }
      s.turntable.rotation.y = turn + look;
      if (clock >= nextWave) {
        wave();
        nextWave = clock + WAVE_EVERY;
      }
    } else {
      const facing = SHOTS[current].yaw + handTurn;
      const lag = dragging !== null ? 0.06 : 0.35;
      turn += (facing - turn) * (calm.matches ? 1 : 1 - Math.exp(-dt / lag));
      look += (0 - look) * (1 - Math.exp(-dt / LOOK_LAG));
      s.turntable.rotation.y = turn + look;
    }

    if (gesture !== null) {
      const duration = gesture.action.getClip().duration;
      const t = clock - gesture.at;
      if (t >= duration) {
        gesture.action.stop();
        gesture.idle.setEffectiveWeight(1);
        gesture = null;
      } else {
        const g = THREE.MathUtils.smoothstep(t, 0, 0.25) * (1 - THREE.MathUtils.smoothstep(t, duration - 0.35, duration));
        gesture.action.setEffectiveWeight(g);
        gesture.idle.setEffectiveWeight(1 - g);
      }
    }
    if (s.person !== null) {
      const head = s.person.bones.get('Head');
      if (head !== undefined && headRest !== null) head.quaternion.copy(headRest);
      s.person.mixer.update(dt);
    }

    const width = view.clientWidth;
    const height = view.clientHeight;
    if (width <= 0 || height <= 0) return;
    s.renderer.getSize(size);
    if (size.x !== width || size.y !== height) s.renderer.setSize(width, height, false);
    placeCamera(s, width, height);
    aimHead(s, dt);
    drawPortrait(s);
    if (bridge !== null && bridge.group.parent === s.scene) bridge.update(clock, (height * s.renderer.getPixelRatio()) / (2 * TAN));
    s.outline.render(s.scene, s.camera);
    // Shown once everything stands and has been drawn twice, so no program compiles in sight.
    if (standing(s) && ++standingFrames >= 2 && !view.classList.contains('drawn')) {
      view.classList.add('drawn');
      wait.hidden = true;
    }

    // The plate over the crown.
    scratch.crown.set(0, (s.person?.height ?? AVATAR_HEIGHT) * PLATE_AT, 0).project(s.camera);
    const x = ((scratch.crown.x + 1) / 2) * width;
    const y = Math.max(54, ((1 - scratch.crown.y) / 2) * height);
    plate.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, calc(-100% - 12px))`;
  }

  function openScene(): void {
    if (stage !== null) return;
    try {
      stage = build();
    } catch (error) {
      // No WebGL for a second context: the cards work without the figure.
      console.warn('stage: no figure', error);
      wait.textContent = '';
      return;
    }
    stage.last = performance.now();
    stage.frame = requestAnimationFrame(draw);
    setScenery();
    wait.hidden = cast !== null;
    options
      .cast()
      .then((loaded) => {
        cast = loaded;
        wait.hidden = true;
        if (stage !== null) redress(stage, options.appearance());
      })
      .catch((error: unknown) => {
        console.warn('stage: the wardrobe did not load', error);
        wait.textContent = 'The wardrobe did not arrive.';
      });
  }

  function closeScene(): void {
    const s = stage;
    if (s === null) return;
    cancelAnimationFrame(s.frame);
    // The room outlives the renderer: the next one uploads it again.
    if (bridge !== null && bridge.group.parent === s.scene) s.scene.remove(bridge.group);
    view.classList.remove('drawn');
    root.classList.remove('leaving');
    standingFrames = 0;
    leaving = null;
    if (s.person !== null && cast !== null) cast.release(s.person);
    for (const mesh of s.plinth) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    s.renderer.dispose();
    // Handed back now: browsers cap the contexts a page may hold, and the world holds one.
    s.renderer.forceContextLoss();
    s.renderer.domElement.remove();
    stage = null;
    gesture = null;
    headRest = null;
    queue.clear();
  }

  /* --- the hand ------------------------------------------------------------------ */

  view.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = { x: event.clientX, from: behaviour === 'title' ? turn + look : handTurn, id: event.pointerId };
    if (behaviour === 'title') {
      look = 0;
      turn = dragging.from;
    }
    view.setPointerCapture(event.pointerId);
    view.classList.add('dragging');
  });
  view.addEventListener('pointermove', (event) => {
    if (dragging === null) return;
    const turned = dragging.from + (event.clientX - dragging.x) * DRAG_TURN;
    if (behaviour === 'title') turn = turned;
    else handTurn = turned;
  });
  const endDrag = (): void => {
    if (dragging === null) return;
    if (behaviour === 'title') {
      // Carried on from where the hand left it, easing back to face the pointer.
      look = (pointer.x - 0.5) * 2 * LOOK_TURN;
      turn -= look;
    }
    dragging = null;
    view.classList.remove('dragging');
  };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);
  view.addEventListener(
    'wheel',
    (event) => {
      if (behaviour !== 'creator') return;
      event.preventDefault();
      const notches = event.deltaMode === 1 ? event.deltaY / 3 : event.deltaY / 100;
      zoom = THREE.MathUtils.clamp(zoom - notches * 0.18, -1, 1);
    },
    { passive: false },
  );
  addEventListener('pointermove', (event) => {
    if (stage === null) return;
    pointer.x = Math.min(1, Math.max(0, event.clientX / Math.max(1, innerWidth)));
    pointer.y = Math.min(1, Math.max(0, event.clientY / Math.max(1, innerHeight)));
    pointer.inside = true;
  });
  // Off the page altogether: the head comes back to the camera.
  addEventListener('mouseout', (event) => {
    if (event.relatedTarget === null) pointer.inside = false;
  });

  /* --- showing --------------------------------------------------------------------- */

  let showing = false;
  let closeTimer = 0;
  let fadeTimer = 0;

  function show(kind: StageBackdrop): void {
    backdrop.className = `hs-backdrop ${kind}`;
    backdropKind = kind;
    if (kind === 'bridge') wantBridge();
    setScenery();
    window.clearTimeout(closeTimer);
    window.clearTimeout(fadeTimer);
    if (leaving !== null) {
      // Called back mid-flight: the camera returns to its framing from wherever it had got to.
      leaving = null;
      root.classList.remove('leaving');
    }
    if (showing) return;
    showing = true;
    refreshName();
    if (!root.isConnected) document.body.append(root);
    if (!plate.isConnected) root.append(plate);
    plate.classList.remove('away');
    if (stage === null) {
      // Up from a little further out, so the stage arrives rather than appears;
      // on the bridge only a little, or a narrow screen's camera starts over the ceiling.
      intro = calm.matches ? 1 : kind === 'bridge' ? 1.12 : 1.35;
      Object.assign(drawnShot, target());
      Object.assign(drawnInsets, wantedInsets);
    }
    root.classList.add('on');
    nextWave = clock + WAVE_FIRST;
    openScene();
  }

  function hide(): void {
    if (!showing) return;
    showing = false;
    stopEditing(true);
    root.classList.remove('on');
    plate.classList.add('away');
    // After the fade, so the figure does not vanish ahead of the screen it stands on.
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      if (!showing) closeScene();
    }, 480);
  }

  function leave(): void {
    const s = stage;
    const room = bridge;
    if (!showing || s === null || room === null || backdropKind !== 'bridge' || calm.matches || !view.classList.contains('drawn')) {
      hide();
      return;
    }
    // The bay nearest the middle of the screen, a little to the left of it, where the hero is not.
    let best: (typeof room.bays)[number] | null = null;
    let bestScore = Infinity;
    for (const bay of room.bays) {
      scratch.bay.copy(bay.centre).project(s.camera);
      if (scratch.bay.z > 1 || Math.abs(scratch.bay.x) > 1.1) continue;
      const score = (scratch.bay.x + 0.15) ** 2 + 0.5 * scratch.bay.y ** 2;
      if (score < bestScore) {
        bestScore = score;
        best = bay;
      }
    }
    if (best === null) {
      hide();
      return;
    }
    showing = false;
    stopEditing(true);
    plate.classList.add('away');
    root.classList.add('leaving');
    const from = s.camera.position.clone();
    const out = best.centre.clone().addScaledVector(best.inward, -AVATAR_HEIGHT * 0.6);
    // Up and to the left of the straight line, so the camera passes over the hero's shoulder.
    const via = from.clone().lerp(best.centre, 0.5).add(new THREE.Vector3(-0.4 * AVATAR_HEIGHT, 0.6 * AVATAR_HEIGHT, 0));
    leaving = {
      at: clock,
      from,
      aim: scratch.aim.clone(),
      via,
      out,
      look: best.centre.clone().addScaledVector(best.inward, -AVATAR_HEIGHT * 12),
    };
    Object.assign(wantedInsets, { left: 0, right: 0, top: 0, bottom: 0 });
    wave();
    window.clearTimeout(closeTimer);
    window.clearTimeout(fadeTimer);
    fadeTimer = window.setTimeout(() => root.classList.remove('on'), LEAVE_FADE * 1000);
    closeTimer = window.setTimeout(() => {
      if (!showing) closeScene();
    }, (LEAVE + 0.5) * 1000);
  }

  return {
    root,
    plate,
    get open() {
      return showing;
    },
    get ready() {
      return (stage?.person ?? null) !== null;
    },
    get shotName() {
      return current;
    },
    show,
    hide,
    leave,
    mode(next) {
      if (behaviour === next) return;
      // The hero keeps the way they face; only who turns them changes.
      if (next === 'creator') {
        handTurn = turn + look - SHOTS[current].yaw;
        turn += look;
        look = 0;
      } else {
        turn += look - SHOTS.title.yaw;
        look = 0;
        zoom = 0;
      }
      behaviour = next;
      dragging = null;
    },
    shot(next, opening = {}) {
      if (next !== current) {
        current = next;
        zoom = 0;
        // A new framing brings its own way of facing; the hand's turn is let go.
        handTurn = 0;
      }
      if (opening.instant === true || stage === null) {
        Object.assign(drawnShot, target());
        if (opening.instant === true) intro = 1;
      }
    },
    insets(next) {
      Object.assign(wantedInsets, next);
      if (stage === null) Object.assign(drawnInsets, wantedInsets);
    },
    adoptPlate(container) {
      if (plate.parentElement !== container) container.append(plate);
    },
    wave,
    editName,
    refreshName,
    onName(listener) {
      nameListeners.add(listener);
      return () => nameListeners.delete(listener);
    },
    portrait,
  };
}
