/** The stage's shared context: its elements, handles and state. Every module is a set of functions over it. */
import * as THREE from 'three';
import type { Appearance } from '../appearance.ts';
import type { Bridge } from '../bridge.ts';
import type { Cast } from '../cast.ts';
import { ensureStyle, installUi } from '../ui.ts';
import { buildDom, type StageDom } from './dom.ts';
import type { Scene } from './scene.ts';
import { type Shot, SHOTS, WAVE_FIRST } from './shots.ts';
import { STYLE } from './style.ts';
import type { HeroStageOptions, PortraitFrame, StageBackdrop, StageInsets, StageMode, StageShot } from './types.ts';

/** Everything the stage's modules share: its elements, its handles and its state. */
export interface HeroCtx extends StageDom {
  readonly options: HeroStageOptions;
  readonly nameListeners: Set<(name: string) => void>;
  /** The framing drawn, eased towards `target()`. */
  readonly drawnShot: Shot;
  readonly wantedInsets: StageInsets;
  readonly drawnInsets: StageInsets;
  readonly pointer: { x: number; y: number; inside: boolean };
  readonly calm: MediaQueryList;
  readonly size: THREE.Vector2;
  readonly scratch: {
    head: THREE.Vector3;
    target: THREE.Vector3;
    ray: THREE.Raycaster;
    ndc: THREE.Vector2;
    parent: THREE.Quaternion;
    parentInverse: THREE.Quaternion;
    yaw: THREE.Quaternion;
    pitch: THREE.Quaternion;
    axis: THREE.Vector3;
    up: THREE.Vector3;
    crown: THREE.Vector3;
    aim: THREE.Vector3;
    bay: THREE.Vector3;
  };
  readonly portraits: Map<string, ImageData>;
  readonly queue: Map<HTMLCanvasElement, { key: string; look: Appearance; frame: PortraitFrame }>;

  editing: boolean;
  current: StageShot;
  behaviour: StageMode;
  /** The wheel: towards the face above zero, towards the whole body below it. */
  zoom: number;
  /** How much further out the camera starts as the stage comes up, easing to 1. */
  intro: number;
  turn: number;
  look: number;
  /** The creator's turn: by hand, on top of the shot's. */
  handTurn: number;
  headYaw: number;
  headPitch: number;
  clock: number;
  dragging: { x: number; from: number; id: number } | null;
  gesture: { action: THREE.AnimationAction; idle: THREE.AnimationAction; at: number } | null;
  nextWave: number;
  stage: Scene | null;
  cast: Cast | null;
  backdropKind: StageBackdrop;
  /** Frames drawn with everything standing; the canvas shows from the second, its programs compiled. */
  standingFrames: number;
  /** The flight out of the window, while it lasts: when it began, from where, looking where, and to where. */
  leaving: { at: number; from: THREE.Vector3; aim: THREE.Vector3; via: THREE.Vector3; out: THREE.Vector3; look: THREE.Vector3 } | null;
  headRest: THREE.Quaternion | null;
  /** The room, once built: kept for the visit and drawn by whichever renderer the stage has then. */
  bridge: Bridge | null;
  bridgeKit: { module: typeof import('../bridge.ts'); pieces: Awaited<ReturnType<typeof import('../bridge.ts')['loadBridgePieces']>> } | null;
  bridgeAsked: boolean;
  /** The kit did not arrive, or the room could not be built: the disc stands in for it. */
  bridgeFailed: boolean;
  showing: boolean;
  closeTimer: number;
  fadeTimer: number;
  /** The animation-frame callback; set once the context exists. */
  tick: (now: number) => void;
}

export function createHeroCtx(options: HeroStageOptions): HeroCtx {
  installUi();
  ensureStyle('atlas-stage', STYLE);
  return {
    ...buildDom(),
    options,
    nameListeners: new Set(),
    drawnShot: { ...SHOTS.title },
    wantedInsets: { left: 0, right: 0, top: 0, bottom: 0 },
    drawnInsets: { left: 0, right: 0, top: 0, bottom: 0 },
    pointer: { x: 0.5, y: 0.5, inside: false },
    calm: matchMedia('(prefers-reduced-motion: reduce)'),
    size: new THREE.Vector2(),
    scratch: {
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
    },
    portraits: new Map(),
    queue: new Map(),
    editing: false,
    current: 'title',
    behaviour: 'title',
    zoom: 0,
    intro: 1,
    turn: 0,
    look: 0,
    handTurn: 0,
    headYaw: 0,
    headPitch: 0,
    clock: 0,
    dragging: null,
    gesture: null,
    nextWave: WAVE_FIRST,
    stage: null,
    cast: null,
    backdropKind: 'clear',
    standingFrames: 0,
    leaving: null,
    headRest: null,
    bridge: null,
    bridgeKit: null,
    bridgeAsked: false,
    bridgeFailed: false,
    showing: false,
    closeTimer: 0,
    fadeTimer: 0,
    tick: () => {},
  };
}
