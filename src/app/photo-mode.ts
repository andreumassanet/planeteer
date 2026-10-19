/**
 * Photo mode: the player stands still, the overlay goes, and a free camera
 * flies round them (the movement keys, the mouse, `Shift` faster, the horn's
 * key down and the use key up, `Space` and the descend key too). A small card
 * sets the lens and the look: a focus distance and its blur, exposure, a
 * filter, the vignette, the hour and whether it runs. `P` takes the picture as
 * ever. The mode's key or `Esc` with the mouse free leaves, and everything it
 * changed goes back.
 */
import * as THREE from 'three';
import { actionOf, inputBlocked, labelOf, modalOpen, onKeyLabels } from '../controls.ts';
import type { PhotoFilter } from '../post.ts';
import { SCENERY_SCALE } from '../stature.ts';
import { ensureStyle, h, kbd } from '../ui.ts';
import type { App } from './context.ts';

/** Flying speed, units a second, and how much `Shift` multiplies it. */
const FLY_SPEED = 14;
const FLY_RUSH = 5;
/** How quickly the camera takes up a new speed, per second. */
const FLY_EASE = 8;
/** How far the camera may wander from the player, units: the world is streamed round them. */
const TETHER = 600;
/** How far over the ground or a town's floor the lens is kept, units. */
const CLEARANCE = 0.6;
/** How far up or down the camera may look, radians. */
const PITCH_LIMIT = 1.5;
/** The focus slider's ends, units, on a log scale; its zero is automatic (the player). */
const FOCUS_NEAR = 2;
const FOCUS_FAR = 3000;

const FILTERS: readonly [PhotoFilter, string][] = [
  ['none', 'None'],
  ['warm', 'Warm'],
  ['cool', 'Cool'],
  ['mono', 'B&W'],
  ['vintage', 'Vintage'],
];

const STYLE = `
.atlas-photo-card {
  position: fixed; top: 16px; right: 16px; z-index: 60;
  width: min(290px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box;
}
.atlas-photo-card label { display: flex; flex-direction: column; gap: 4px; font-weight: 700; font-size: 13px; }
.atlas-photo-card .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.atlas-photo-card .value { font-weight: 800; opacity: 0.7; font-variant-numeric: tabular-nums; }
.atlas-photo-card .help { font-size: 12px; line-height: 1.5; opacity: 0.75; }
.atlas-photo-card .ui-seg { display: flex; flex-wrap: wrap; }
.atlas-photo-card .ui-seg button { flex: 1 1 auto; }
.atlas-photo-card .actions { display: flex; gap: 8px; }
.atlas-photo-card .actions .ui-btn { flex: 1; justify-content: center; }
body.atlas-photo .atlas-pause, body.atlas-photo .atlas-chat { visibility: hidden !important; }
`;

interface Saved {
  hidden: boolean;
  exposure: number;
  vignette: number;
  live: boolean;
  fast: boolean;
  time: number;
  real: number;
}

export interface PhotoMode {
  readonly active: boolean;
  toggle(): void;
  /** Flies the camera in place of the player's own frame; false when the mode is off. */
  frame(dt: number): boolean;
}

let mode: PhotoMode | null = null;

/** The one photo mode, made on the first ask. */
export function photoModeOf(app: App): PhotoMode {
  mode ??= createPhotoMode(app);
  return mode;
}

/** Whether photo mode is on, without making it. */
export const photoModeOn = (): boolean => mode?.active === true;

function createPhotoMode(app: App): PhotoMode {
  const { rig, input, post, sky, hud, timeOfDay, player } = app;
  ensureStyle('atlas-photo-style', STYLE);

  const position = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const wanted = new THREE.Vector3();
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();
  const look = new THREE.Vector3();
  const target = new THREE.Vector3();
  const aim = new THREE.Matrix4();
  let pitch = 0;
  let active = false;
  let frozen = false;
  let saved: Saved | null = null;
  const held = { up: false, down: false };

  // ---- the card ---------------------------------------------------------------
  const value = (): HTMLElement => h('span', { class: 'value' });
  const slider = (min: number, max: number, step: number): HTMLInputElement =>
    h('input', { type: 'range', class: 'ui-range', min, max, step });
  const field = (name: string, input: HTMLInputElement, shown: HTMLElement): HTMLElement =>
    h('label', {}, h('span', { class: 'row' }, h('span', { text: name }), shown), input);

  const focusShown = value();
  const focus = slider(0, 100, 1);
  const blurShown = value();
  const blur = slider(0, 4, 0.1);
  const exposureShown = value();
  const exposure = slider(0.3, 3, 0.05);
  const vignetteShown = value();
  const vignette = slider(0, 1, 0.02);
  const hourShown = value();
  const hour = slider(0, 23.75, 0.25);
  const freeze = h('button', { class: 'ui-switch', role: 'switch', 'aria-checked': 'false', 'aria-label': 'Freeze time' });
  const filters = h('div', { class: 'ui-seg', role: 'group', 'aria-label': 'Filter' });
  const filterButtons = FILTERS.map(([id, name]) => {
    const button = h('button', { type: 'button', text: name, 'aria-pressed': 'false' });
    button.addEventListener('click', () => {
      post.photo.filter = id;
      showFilter();
      button.blur();
    });
    filters.append(button);
    return button;
  });
  const shoot = h('button', { type: 'button', class: 'ui-btn small primary' });
  const leave = h('button', { type: 'button', class: 'ui-btn small quiet' });
  const help = h('div', { class: 'help' });
  const card = h(
    'div',
    { class: 'ui-card atlas-photo-card', role: 'dialog', 'aria-label': 'Photo mode' },
    h('div', { class: 'ui-eyebrow', text: 'Photo mode' }),
    help,
    field('Focus', focus, focusShown),
    field('Blur', blur, blurShown),
    field('Exposure', exposure, exposureShown),
    h('label', {}, h('span', { text: 'Filter' }), filters),
    field('Vignette', vignette, vignetteShown),
    field('Time of day', hour, hourShown),
    h('div', { class: 'row' }, h('span', { text: 'Freeze time', style: 'font-weight:700;font-size:13px' }), freeze),
    h('div', { class: 'actions' }, shoot, leave),
  );

  function labels(): void {
    help.textContent =
      `${labelOf('forward')}${labelOf('left')}${labelOf('back')}${labelOf('right')} fly, mouse looks, ` +
      `${labelOf('run')} faster, ${labelOf('horn')} down, ${labelOf('use')} up. ` +
      'Esc frees the mouse for this card; Esc again leaves.';
    shoot.replaceChildren('Take photo', kbd(labelOf('photo')));
    leave.replaceChildren('Leave', kbd(labelOf('photoMode')));
  }
  onKeyLabels(labels);

  const metres = (units: number): string => {
    const m = units / SCENERY_SCALE;
    return m < 10 ? `${m.toFixed(1)} m` : `${Math.round(m).toLocaleString('en')} m`;
  };
  const focusUnits = (step: number): number | null =>
    step <= 0 ? null : FOCUS_NEAR * Math.pow(FOCUS_FAR / FOCUS_NEAR, (step - 1) / 99);
  const hhmm = (h24: number): string => {
    const minutes = Math.round(h24 * 60) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  };

  function showFilter(): void {
    filterButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(FILTERS[i]![0] === post.photo.filter)));
  }
  function show(): void {
    const units = post.photo.focus;
    focusShown.textContent = units === null ? 'Auto' : metres(units);
    blurShown.textContent = post.photo.blur.toFixed(1);
    exposureShown.textContent = post.exposure.toFixed(2);
    vignetteShown.textContent = post.vignette.toFixed(2);
    hourShown.textContent = hhmm(Number(hour.value));
    freeze.setAttribute('aria-checked', String(frozen));
    showFilter();
  }

  focus.addEventListener('input', () => {
    post.photo.focus = focusUnits(Number(focus.value));
    show();
  });
  blur.addEventListener('input', () => {
    post.photo.blur = Number(blur.value);
    show();
  });
  exposure.addEventListener('input', () => {
    post.exposure = Number(exposure.value);
    show();
  });
  vignette.addEventListener('input', () => {
    post.vignette = Number(vignette.value);
    show();
  });
  hour.addEventListener('input', () => {
    timeOfDay.setHour(Number(hour.value));
    show();
  });
  // A slider keeps the focus after a drag, which would hold the keys; let it go.
  for (const range of [focus, blur, exposure, vignette, hour]) range.addEventListener('change', () => range.blur());
  freeze.addEventListener('click', () => {
    setFrozen(!frozen);
    freeze.blur();
  });
  shoot.addEventListener('click', () => {
    app.photoWanted = true;
    shoot.blur();
  });
  leave.addEventListener('click', () => exit());

  function setFrozen(on: boolean): void {
    frozen = on;
    if (on) sky.setRate(0);
    else timeOfDay.fast.set(saved?.fast ?? false);
    show();
  }

  // ---- entering and leaving -----------------------------------------------------
  function enter(): void {
    if (active) return;
    active = true;
    saved = {
      hidden: hud.hidden,
      exposure: post.exposure,
      vignette: post.vignette,
      live: timeOfDay.live(),
      fast: timeOfDay.fast.get(),
      time: sky.state.time.getTime(),
      real: Date.now(),
    };
    position.copy(rig.camera.position);
    up.copy(position).normalize();
    rig.camera.getWorldDirection(look);
    const along = look.dot(up);
    pitch = -Math.asin(THREE.MathUtils.clamp(along, -1, 1));
    forward.copy(look).addScaledVector(up, -along);
    if (forward.lengthSq() < 1e-6) forward.copy(rig.heading);
    forward.normalize();
    velocity.set(0, 0, 0);
    held.up = held.down = false;
    frozen = false;
    hud.setHidden(true);
    document.body.classList.add('atlas-photo');
    focus.value = '0';
    post.photo.focus = null;
    blur.value = String(post.photo.blur);
    exposure.value = String(post.exposure);
    vignette.value = String(post.vignette);
    hour.value = String(Math.round(timeOfDay.hour() * 4) / 4);
    labels();
    show();
    document.body.append(card);
  }

  function exit(): void {
    if (!active || saved === null) return;
    active = false;
    card.remove();
    document.body.classList.remove('atlas-photo');
    hud.setHidden(saved.hidden);
    post.exposure = saved.exposure;
    post.vignette = saved.vignette;
    post.photo.focus = null;
    post.photo.filter = 'none';
    if (saved.live) timeOfDay.setLive();
    else {
      sky.setTime(saved.time + (Date.now() - saved.real) * (saved.fast ? 60 : 1));
      timeOfDay.fast.set(saved.fast);
    }
    frozen = false;
    saved = null;
    // The chase takes the camera back from wherever it was flown.
    rig.snap(app.trainRide.subject(), app.groundAt);
  }

  addEventListener('keydown', (event) => {
    if (!active || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Escape') {
      if (document.pointerLockElement === null && !modalOpen()) exit();
      return;
    }
    if (inputBlocked(event)) return;
    const action = actionOf(event.code);
    if (action === 'horn' || action === 'descend') held.down = true;
    else if (action === 'use' || action === 'jump') held.up = true;
  });
  addEventListener('keyup', (event) => {
    const action = actionOf(event.code);
    if (action === 'horn' || action === 'descend') held.down = false;
    else if (action === 'use' || action === 'jump') held.up = false;
  });
  addEventListener('blur', () => {
    held.up = held.down = false;
  });

  // ---- the flight ---------------------------------------------------------------
  function frame(dt: number): boolean {
    if (!active) return false;
    const state = input.state;
    up.copy(position).normalize();
    // Carried over the curve: the heading is kept in the ground's plane.
    forward.addScaledVector(up, -forward.dot(up)).normalize();
    if (state.look.x !== 0) forward.applyAxisAngle(up, -state.look.x).normalize();
    pitch = THREE.MathUtils.clamp(pitch + state.look.y, -PITCH_LIMIT, PITCH_LIMIT);
    look.copy(forward).multiplyScalar(Math.cos(pitch)).addScaledVector(up, -Math.sin(pitch));
    right.crossVectors(forward, up).normalize();

    const speed = FLY_SPEED * (state.run ? FLY_RUSH : 1);
    const lift = (held.up ? 1 : 0) - (held.down ? 1 : 0);
    wanted.copy(look).multiplyScalar(state.move.y).addScaledVector(right, state.move.x).addScaledVector(up, lift);
    if (wanted.lengthSq() > 1) wanted.normalize();
    wanted.multiplyScalar(speed);
    velocity.lerp(wanted, 1 - Math.exp(-FLY_EASE * dt));
    position.addScaledVector(velocity, dt);

    // Kept near the player, where the world is built, and above what is drawn.
    const away = position.distanceTo(player.position);
    if (away > TETHER) position.sub(player.position).multiplyScalar(TETHER / away).add(player.position);
    const floor = Math.max(app.groundAt(position), app.settlements.madeHeightAt(position)) + CLEARANCE;
    if (position.length() < floor) position.setLength(floor);

    up.copy(position).normalize();
    target.copy(position).add(look);
    aim.lookAt(position, target, up);
    rig.camera.position.copy(position);
    rig.camera.quaternion.setFromRotationMatrix(aim);
    rig.camera.updateMatrixWorld();
    return true;
  }

  return {
    get active() {
      return active;
    },
    toggle() {
      if (active) exit();
      else enter();
    },
    frame,
  };
}
