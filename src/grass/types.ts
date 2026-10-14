/** The grass's rings, fields, budgets, colours and public types. */
import type * as THREE from 'three';
import { SCENERY_SCALE, STATURE } from '../stature.ts';

/** Units a metre of the figure the grass was measured against: a person is `STATURE` times life size. */
export const METRE = SCENERY_SCALE * STATURE;

export type GrassQuality = 'low' | 'medium' | 'high';

/** One ring of blades, in reference metres. */
export interface Ring {
  /** Between two roots on the ring's grid. */
  spacing: number;
  /** Where its last blades go, from the camera along the ground. */
  radius: number;
  /** Rows of the strip under its tip. */
  segments: number;
  /** A blade's width at its widest. */
  width: number;
  /** How much a blade turns to face the camera, 0 to 1. */
  faceCamera: number;
}

/**
 * The rings a quality draws. A ring draws `(ceil(2 radius / spacing) + 1)^2`
 * instances whatever is culled, most of them collapsed in the vertex stage
 * off the disc or off the screen. In units at `METRE` the high rings reach
 * 28, 56, 116 and 237, the medium 26, 54, 108 and 205.
 */
export const RINGS: Readonly<Record<GrassQuality, readonly Ring[]>> = {
  high: [
    { spacing: 0.1, radius: 13, segments: 5, width: 0.055, faceCamera: 0.25 },
    { spacing: 0.2, radius: 26, segments: 4, width: 0.085, faceCamera: 0.45 },
    { spacing: 0.42, radius: 54, segments: 3, width: 0.15, faceCamera: 0.8 },
    { spacing: 0.9, radius: 110, segments: 2, width: 0.28, faceCamera: 1 },
  ],
  medium: [
    { spacing: 0.125, radius: 12, segments: 4, width: 0.065, faceCamera: 0.3 },
    { spacing: 0.25, radius: 25, segments: 3, width: 0.1, faceCamera: 0.5 },
    { spacing: 0.52, radius: 50, segments: 3, width: 0.17, faceCamera: 0.85 },
    { spacing: 1.1, radius: 95, segments: 2, width: 0.3, faceCamera: 1 },
  ],
  low: [
    { spacing: 0.17, radius: 11, segments: 4, width: 0.08, faceCamera: 0.35 },
    { spacing: 0.36, radius: 24, segments: 3, width: 0.13, faceCamera: 0.6 },
    { spacing: 0.8, radius: 60, segments: 2, width: 0.26, faceCamera: 1 },
  ],
};

/** How far each quality's rings reach, units: the furthest ring's radius at `METRE`. */
export const RING_REACH = Object.fromEntries(
  Object.entries(RINGS).map(([quality, rings]) => [quality, Math.max(...rings.map((ring) => ring.radius)) * METRE]),
) as Readonly<Record<GrassQuality, number>>;

/**
 * The quality the detail knob (`view.ts`) asks for: the knob starts at 0.5 on
 * every machine and moves itself by the frame rate within [0.25, 2].
 */
export function qualityFor(knob: number): GrassQuality {
  return knob < 0.4 ? 'low' : knob < 0.9 ? 'medium' : 'high';
}

/**
 * The two fields, in units a texel and texels a side. The fine one is 192
 * units across round the camera, which holds the first two rings at every
 * quality with the camera up to 40 units off its middle; at 1.5 units a texel
 * a verge ends within a unit of its kerb, against a carriageway of 7.2. The
 * coarse one is 640 across, the widest ring's 237 each way and a lag to spare.
 */
export const FINE = { texel: 1.5, size: 128 } as const;
export const COARSE = { texel: 5, size: 128 } as const;
/**
 * How much further than the grass itself the bake keeps a texel off a made
 * surface, in texels: the lookup lays a blade up to half a texel past the hull
 * of the texels that grow (`grassLookup`), so half a texel is what keeps a
 * blade off the street.
 */
export const GRASS_SPREAD = 0.5;
/** Both fields, for `pnpm seated`, which bakes them headless the way `bakeTexel` does. */
export const GRASS_FIELDS = { fine: FINE, coarse: COARSE } as const;
/** How far the camera may go from the frame's anchor before the grass is laid round a new one. */
export const FRAME_REACH = 1500;
/** Past this in one frame the camera has jumped, and what stands round the old place is no use. */
export const JUMP = 300;
/**
 * Milliseconds of the frame's building the bake may take (`mayBuild`). A
 * texel costs a few microseconds, nearly all of it the ground's answer, so a
 * layer's two fields are a couple of hundred milliseconds of work spread over
 * frames.
 */
export const BUILD_MS = 2.5;
/** Texels between two looks at the clock. */
export const TEXEL_BATCH = 16;
/** How long a layer takes to grow in, and the one it replaces to go. */
export const APPEAR_SECONDS = 0.6;

/**
 * The colours, measured off a reference. The grass takes its middle from the
 * ground it grows in (`groundColorAt`), and its root and tip from these as a
 * lightness against the reference's middle green (0.38 and 1.98 of it), with
 * the tip pushed off grey (`TIP_SATURATION`) and warmed (`TIP_WARM`): a
 * tundra's grass is the tundra's colour, darker at the root and lit at the
 * tip. The dry colours are absolute: straw is straw.
 */
export const REFERENCE = {
  root: '#41692c',
  mid: '#74a244',
  tip: '#b9d66c',
  dryRoot: '#ab7f2c',
  dryTip: '#f4cf68',
  translucent: '#f2f59a',
} as const;
/** How far the tip is pushed off grey, and how much warmer it is: a lit blade is a yellower green, not a paler one. */
export const TIP_SATURATION = 1.3;
/** The most the tip is lit over the middle. */
export const TIP_GAIN_CAP = 1.45;
export const TIP_WARM = [1.05, 1, 0.85] as const;
/** How much light a lit blade lets through from behind it, times its own colour. */
export const TRANSLUCENCY = 1.4;
/** Wrap on the diffuse term: a blade half turned from the sun is not in shade. */
export const WRAP = 0.6;

export interface GrassStats {
  /** Drawing at all this frame. */
  visible: boolean;
  quality: GrassQuality;
  rings: number;
  /** Instances drawn this frame, culled or not: what the vertex stage pays for. */
  instances: number;
  /** Where the frame is anchored, and how far the camera is from it. */
  anchor: string;
  fromAnchor: number;
  /** Texels a side and units a texel, fine and coarse. */
  fine: string;
  coarse: string;
  /** Whether each of the shown layer's fields is on the screen. */
  fineReady: boolean;
  coarseReady: boolean;
  /** Texels of work queued: fills, lines entering, and patches a changed floor dirtied. */
  pending: number;
  /** Texels baked since the world loaded, and the mean cost of one. */
  texels: number;
  microsecondsATexel: number;
  /** Milliseconds the last frame's bake took. */
  lastBakeMs: number;
  /** Milliseconds from a layer's start to both its fields standing, for the last one filled. */
  lastFillMs: number;
  /** Layers laid round a new anchor since the world loaded. */
  anchors: number;
}

export interface GrassFrame {
  camera: THREE.Camera;
  /** The player's feet on foot, a seated vehicle's origin (`Player.position`): what `press` is laid round. */
  player: THREE.Vector3;
  /**
   * What presses the grass apart round `player`, or null for nothing: a body
   * on foot (`length` and `width` 0, the blades parted round a point), a
   * vehicle whose wheels are on the ground (its footprint, half its length
   * along `forward` and half its width, units). Only as far as it is down in
   * the blades: the shader lifts the press off them with the height of
   * `player` over their ground, so a jump, a flight or a deck presses nothing.
   */
  press: { forward: THREE.Vector3; length: number; width: number } | null;
  /** The camera's height over the ground under it. */
  height: number;
  /** The wind where you stand: metres a second, and the bearing it comes from (`weather.here()`). */
  wind: { speed: number; from: number };
  /** Out of sight: under the sea, indoors. Nothing is drawn and nothing baked. */
  hidden: boolean;
}

export interface Grass {
  group: THREE.Group;
  stats: GrassStats;
  /** Off hides it and stops the bake. */
  enabled: boolean;
  /** A multiplier on every blade's height, 1 as measured. */
  height: number;
  proxies(): THREE.Object3D[];
  update(frame: GrassFrame): void;
  /** Throws every field away and bakes them again round the camera. */
  rebake(): void;
}

/** Another world's grass: its own radius, and none of Earth's patches or weather on it. */
export interface GrassOptions {
  /** The planet's radius, units; Earth's (`PLANET_RADIUS`) when omitted. */
  radius?: number;
  /** Whether the blades carry Earth's ground marks and its weather (snow lying, wet); true when omitted. */
  earth?: boolean;
}
