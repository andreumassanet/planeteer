import { Color, Vector3 } from 'three';
import type { World } from '../geo.ts';
import type { PlanetSurface } from '../planet.ts';
import type { Nearby } from '../places.ts';
import type { Place } from '../places.ts';
import { EARTH_KM, type Shape, buildShapes, createFrame, toUnit } from '../cartography.ts';
import { PLANET_RADIUS, WORLD_SCALE } from '../globe.ts';
import {
  DEFAULT_SIZE, BEARING_DEADZONE, GROUND_CEILING, MAX_PAD_MARKS, MAX_VIEW, MIN_VIEW, PIN_HEAD, PIN_RISE,
  PIN_SPACING, PLACE_SPACING, RIM_WIDTH, SHAPE_BANDS,
} from './constants.ts';
import { fade } from './format.ts';
import { faintInk, ink, ocean } from './palette.ts';
import type { MinimapMonument, MinimapOptions } from './types.ts';

/** The outlines at one resolution, and each ring's faded fill for the countries you are not in. */
export interface ShapeLevel {
  shapes: Shape[];
  faded: string[];
}

/** A road with its bounding cap on the unit sphere. */
export interface RoadLine {
  points: Float32Array;
  cx: number;
  cy: number;
  cz: number;
  radius: number;
}

/**
 * Everything one minimap owns. The modules of `src/minimap/` are functions of
 * it: the canvases, the options and the preallocated buffers are fixed at
 * creation; the rest changes as the player moves.
 */
export interface MinimapState {
  readonly settings: MinimapOptions;
  readonly size: number;
  readonly monuments: readonly MinimapMonument[];
  readonly gazetteer: readonly Place[];
  readonly surface: PlanetSurface | undefined;
  /** The body's radius in world units and kilometres, and the altitude floor of the horizon framing. */
  readonly RADIUS: number;
  readonly RADIUS_KM: number;
  readonly CEILING: number;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** The land, the towns and the pins: geography, redrawn when you move and not when you turn. */
  readonly base: HTMLCanvasElement;
  readonly baseCtx: CanvasRenderingContext2D;
  readonly centre: number;
  readonly discRadius: number;
  /** A body with no sea: the paper is the ground's own colour under the disc's middle. */
  readonly dryBody: boolean;
  readonly paperColour: Color;
  readonly paperAt: Vector3;
  readonly faintInk: string;
  readonly borderWidth: number;
  readonly uiScale: number;
  readonly minAngle: number;
  readonly maxAngle: number;
  readonly levels: ShapeLevel[];

  // Landmarks as unit vectors, and the draw's scratch.
  readonly pinCount: number;
  readonly pinPoint: Float32Array;
  readonly pinScreenX: Float32Array;
  readonly pinScreenY: Float32Array;
  readonly pinDepth: Float32Array;
  readonly pinOrder: Int32Array;
  readonly keptX: Float32Array;
  readonly keptY: Float32Array;
  readonly keptPin: Int32Array;
  readonly padKeptX: Float32Array;
  readonly padKeptY: Float32Array;
  /** Some pad on the disc was still being worked out when the paper was drawn: draw it again. */
  padsWaiting: boolean;

  // The built places, packed and ordered largest-first.
  readonly townUnit: Float32Array;
  readonly townRow: Int32Array;
  readonly townDot: Float32Array;
  readonly townSlot: Map<number, number>;
  readonly townX: Float32Array;
  readonly townY: Float32Array;
  readonly townOrder: Int32Array;
  readonly townKept: Int32Array;
  readonly townKeptX: Float32Array;
  readonly townKeptY: Float32Array;
  townCount: number;
  townFor: number;

  readonly pinRise: number;
  readonly pinHead: number;
  readonly pinSpacing: number;
  readonly placeSpacing: number;
  readonly deadzone: number;

  paper: string;
  peerMarks: readonly { x: number; y: number; z: number }[];
  ratio: number;

  // The player's frame: rebuilt on every update, unpacked to numbers for the traces.
  readonly frame: ReturnType<typeof createFrame>;
  readonly north: { x: number; y: number; z: number };
  ux: number;
  uy: number;
  uz: number;
  fx: number;
  fy: number;
  fz: number;
  rx: number;
  ry: number;
  rz: number;
  // The frame as of the last redraw, for the "has anything moved" test.
  lastUx: number;
  lastUy: number;
  lastUz: number;
  lastHeading: number;
  drawnAt: number;
  previousAt: number;
  baseStale: boolean;
  overlayStale: boolean;
  // The frame and scale the paper was last drawn in.
  baseUx: number;
  baseUy: number;
  baseUz: number;
  baseFx: number;
  baseFy: number;
  baseFz: number;
  baseRx: number;
  baseRy: number;
  baseRz: number;
  baseScale: number;
  /** When the paper was last drawn, and how long it must stand before the next. */
  baseDrawnAt: number;
  baseGap: number;

  /** Where you are, as the caller last said. */
  country: number;
  nearby: Nearby | null;

  /** Half-width of the disc in radians, and pixels per unit of the orthographic projection. */
  view: number;
  scale: number;
  /** Which way the avatar faces as a screen angle (zero is up), and where north is. */
  heading: number;
  northAngle: number;
  /** Units a second, smoothed: what opens the disc. */
  speed: number;
  readonly lastPosition: { x: number; y: number; z: number };
  hasLast: boolean;

  marked: boolean;
  readonly markerPoint: { x: number; y: number; z: number };
  targetAngle: number;
  targetScreen: number;
  /** The ring a course waits for, on the unit sphere, and whether it is the finish. */
  coursed: boolean;
  readonly coursePoint: { x: number; y: number; z: number };
  courseFinish: boolean;

  // What the last redraw touched, and what `update` has cost lately.
  drawnRings: number;
  drawnPoints: number;
  drawnLevel: number;
  drawnPlaces: number;
  drawnPads: number;
  drawnPins: number;
  baseMs: number;
  readonly samples: Float64Array;
  sampleAt: number;
  sampleCount: number;

  roadLines: RoadLine[] | null;
  tileLevel: number;
  tileVersion: number;
  drawnTiles: number;
}

function createLevels(world: World, radius: number, discRadius: number): ShapeLevel[] {
  return SHAPE_BANDS.map((bottom) => {
    const step = (0.5 * (bottom / radius)) / discRadius;
    const shapes = buildShapes(world, step, step);
    return {
      shapes,
      faded: shapes.map((shape) => fade(Number.parseInt(shape.fill.slice(1), 16), 0.45)),
    };
  });
}

/** Builds the canvases, the options and the preallocated buffers of a minimap. */
export function createState(world: World, options: MinimapOptions | number): MinimapState {
  const settings = typeof options === 'number' ? { size: options } : options;
  const size = settings.size ?? DEFAULT_SIZE;
  const monuments = settings.monuments ?? [];
  const gazetteer = settings.places ?? [];
  // The body under the disc: Earth's own constants unless a surface is handed in.
  const surface = settings.surface;
  const RADIUS = surface?.radius ?? PLANET_RADIUS;
  // The widest framing is geography: Earth's grows with `WORLD_SCALE`, another world keeps the nominal one.
  const widest = MAX_VIEW * (surface === undefined ? WORLD_SCALE : 1);

  const canvas = document.createElement('canvas');
  const base = document.createElement('canvas');
  const centre = size / 2;
  // The rim stroke straddles the disc edge, so half of it has to fit inside.
  const discRadius = centre - RIM_WIDTH / 2;
  const uiScale = size / DEFAULT_SIZE;
  const view = widest / RADIUS;

  const pinCount = monuments.length;
  const pinPoint = new Float32Array(pinCount * 3);
  monuments.forEach((monument, i) => {
    toUnit(monument.lat, monument.lon, pinPoint, i * 3);
  });
  const n = gazetteer.length;

  canvas.style.display = 'block';
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  // The card language of the HUD, bent round: the disc is the card.
  canvas.style.borderRadius = '50%';
  canvas.style.boxShadow = `0 5px 0 ${ink}`;

  return {
    settings,
    size,
    monuments,
    gazetteer,
    surface,
    RADIUS,
    RADIUS_KM: surface?.radiusKm ?? EARTH_KM,
    CEILING: surface?.groundCeiling ?? GROUND_CEILING,
    canvas,
    ctx: canvas.getContext('2d')!,
    base,
    baseCtx: base.getContext('2d')!,
    centre,
    discRadius,
    dryBody: surface !== undefined && !surface.sea,
    paperColour: new Color(),
    paperAt: new Vector3(),
    faintInk,
    borderWidth: Math.max(1, size / 200),
    uiScale,
    minAngle: MIN_VIEW / RADIUS,
    maxAngle: widest / RADIUS,
    levels: createLevels(world, RADIUS, discRadius),

    pinCount,
    pinPoint,
    pinScreenX: new Float32Array(pinCount),
    pinScreenY: new Float32Array(pinCount),
    pinDepth: new Float32Array(pinCount),
    pinOrder: new Int32Array(pinCount),
    keptX: new Float32Array(pinCount),
    keptY: new Float32Array(pinCount),
    keptPin: new Int32Array(pinCount),
    padKeptX: new Float32Array(MAX_PAD_MARKS),
    padKeptY: new Float32Array(MAX_PAD_MARKS),
    padsWaiting: false,

    townUnit: new Float32Array(n * 3),
    townRow: new Int32Array(n),
    townDot: new Float32Array(n),
    townSlot: new Map(),
    townX: new Float32Array(n),
    townY: new Float32Array(n),
    townOrder: new Int32Array(n),
    townKept: new Int32Array(n),
    townKeptX: new Float32Array(n),
    townKeptY: new Float32Array(n),
    townCount: 0,
    townFor: -1,

    pinRise: PIN_RISE * uiScale,
    pinHead: PIN_HEAD * uiScale,
    pinSpacing: PIN_SPACING * uiScale,
    placeSpacing: PLACE_SPACING * uiScale,
    deadzone: BEARING_DEADZONE / RADIUS,

    paper: ocean,
    peerMarks: [],
    ratio: 0,

    frame: createFrame(),
    north: { x: 0, y: 0, z: 0 },
    ux: 0, uy: 1, uz: 0,
    fx: 0, fy: 0, fz: 1,
    rx: 1, ry: 0, rz: 0,
    lastUx: 0, lastUy: 0, lastUz: 0,
    lastHeading: 99,
    drawnAt: 0,
    previousAt: 0,
    baseStale: true,
    overlayStale: true,
    baseUx: 0, baseUy: 1, baseUz: 0,
    baseFx: 0, baseFy: 0, baseFz: 1,
    baseRx: 1, baseRy: 0, baseRz: 0,
    baseScale: 1,
    baseDrawnAt: -Infinity,
    baseGap: 0,

    country: 0,
    nearby: null,

    view,
    scale: discRadius / Math.sin(view),
    heading: 0,
    northAngle: 0,
    speed: 0,
    lastPosition: { x: 0, y: 0, z: 0 },
    hasLast: false,

    marked: false,
    markerPoint: { x: 0, y: 0, z: 0 },
    targetAngle: 0,
    targetScreen: 0,
    coursed: false,
    coursePoint: { x: 0, y: 0, z: 0 },
    courseFinish: false,

    drawnRings: 0,
    drawnPoints: 0,
    drawnLevel: 0,
    drawnPlaces: 0,
    drawnPads: 0,
    drawnPins: 0,
    baseMs: 0,
    samples: new Float64Array(60),
    sampleAt: 0,
    sampleCount: 0,

    roadLines: null,
    tileLevel: -1,
    tileVersion: -1,
    drawnTiles: 0,
  };
}
