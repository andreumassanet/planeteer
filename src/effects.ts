import * as THREE from 'three';
import { PALETTE, createToonRamp } from './theme.ts';
import { AVATAR_HEIGHT } from './stature.ts';
import { PLANET_RADIUS } from './globe.ts';
import type { BiomeId } from './biome.ts';
import type { CraftKind, CraftModel, PlayerState } from './craft/contract.ts';
import { BALLOON_CLIMB, BALLOON_SPEED, BOAT_BOOST, CAR_BOOST, PLANE_CRUISE_HIGH, PLANE_CRUISE_LOW, PLANE_ROTATE } from './vehicles.ts';

/**
 * What the world leaves behind it as it moves: a launch's wake, the rings
 * round a swimmer, a plane's trail of smoke balls, a car's exhaust and the dust
 * off its wheels, a crash's burst and its debris, the burner's flame.
 *
 * **Three pools and four draw calls, whatever is happening.** Everything here
 * is one of three things, each drawn as one mesh:
 *
 * - **Puffs**, an instanced ball of smoke, spray, dust or flame: a flat-shaded
 *   icosahedron on the world's four-band ramp, so a puff steps through the
 *   same cel bands as the house beside it and goes dark with it at night. A
 *   flame is a puff with `glow`, which takes its colour unlit. **No ink**: the
 *   pen is screen space, so a puff shrinking away would end as a black dot of
 *   the pen's own width, and a puff is gone by shrinking, not by fading.
 * - **Foam**, flat on the sea and rewritten into one buffer every frame. A
 *   wake is **ribbons**: a strip following the recorded path of the stern, and
 *   one from each of the bow's shoulders whose points drift outward, which is
 *   the V. A ribbon widens with age and then goes — the stern's by hollowing
 *   into two edges that thin away, the V's by narrowing — so nothing on the
 *   water is ever see-through, which is the ink's enemy even without a hull.
 *   Splashes and a swimmer's ripples are **discs and rings**, gone the same
 *   way. Un-inked.
 * - **Debris**, a few tumbling cubes thrown by a crash. These are inked, as
 *   the world's solid things are: two draw calls, the fill and its hull.
 *
 * **The same at 20 frames a second as at 144.** Nothing is emitted per
 * frame: a trail owes one point or ball every so many units run and a stream
 * one puff every so many seconds, both carried from frame to frame, and each
 * is put where the emitter *was* at that instant — interpolated along the
 * frame's move — so a long frame lays down the same marks as many short ones
 * rather than a clump at the end of it.
 *
 * **A jump is not a move.** Boarding, a teleport, a remote pose arriving late:
 * any move longer than the fastest the kind goes (`topSpeed`), or a change of
 * vehicle, resets the emitter and lays nothing along it, and every speed an
 * emitter reads is clamped to that top — so no frame can throw a disc the size
 * of a harbour or spray at a thousand units a second.
 *
 * **Nothing allocates per frame.** Every particle is a row of a typed array;
 * a dead puff, disc or piece is swapped with the last live one, and a ribbon
 * is a ring of points. A full pool refuses and counts it (`stats.dropped`).
 *
 * **The meshes ride with the player.** Each frame they are placed at the
 * player's position and every particle is written relative to it, so float32
 * carries millimetres and not the 16,000 units of the planet's radius.
 *
 * **Near only.** Everything the player makes stays near him by construction;
 * everything somebody else makes — another player's vehicle, a boat under way
 * in the traffic — is emitted only inside `REACH` of the camera.
 */

const H = AVATAR_HEIGHT;

/** Pool sizes: the caps the whole world shares. */
export const MAX_PUFFS = 384;
export const MAX_DISCS = 256;
export const MAX_DEBRIS = 40;
/** Ribbons, three to a boat: the player's own and seven other boats'. */
export const MAX_RIBBONS = 24;
/** Points one ribbon holds: a stern trail at full boost needs about 120 of them. */
export const RIBBON_POINTS = 192;
/** Round a foam disc: sides, which is what the silhouette of one reads as. */
const DISC_SIDES = 8;
/** Vertices a disc writes, and a ribbon segment: two bands of two triangles. */
const DISC_VERTICES = DISC_SIDES * 6;
const SEGMENT_VERTICES = 12;
const FOAM_VERTEX_CAP = MAX_DISCS * DISC_VERTICES + MAX_RIBBONS * RIBBON_POINTS * SEGMENT_VERTICES;
/**
 * The foam's height over the sea's own sphere. The shallows ride up to 0.75
 * over it at a coast, so this clears them everywhere; `polygonOffset` does the
 * rest where the sphere's own facets bow.
 */
const FOAM_LIFT = 0.8;
const FOAM_RADIUS = PLANET_RADIUS + FOAM_LIFT;
/**
 * Foam and spray are white. The palette's own `white` is a warm cream that on
 * the sea reads as sand, and the reference's foam is the whitest thing on the
 * screen.
 */
const FOAM_COLOR = 0xffffff;
/** How far from the camera anybody else's vehicle still leaves anything. */
const REACH = 700;
/** Gravity on spray and debris, in units a second squared: brisk, as a comic's is. */
const FALL = 30;
/**
 * The most of anything one emitter makes in one frame. Well over what the
 * slowest frame the loop allows (a tenth of a second) owes at any rate here,
 * so it never shapes a trail; it only bounds a pathological one.
 */
const FRAME_BURST = 48;
/** Faster than anybody runs, for the foot's pose-jump guard. */
const FOOT_TOP = 40;

/** The fastest a kind of vehicle goes, with room: a move faster than this in a frame is a jump. */
function topSpeed(kind: CraftKind | null): number {
  switch (kind) {
    case 'boat':
      return BOAT_BOOST * 1.3;
    case 'car':
    case 'van':
      return CAR_BOOST * 1.3;
    case 'plane':
      return PLANE_CRUISE_HIGH * 1.3;
    case 'balloon':
      return (BALLOON_SPEED + BALLOON_CLIMB) * 2;
    default:
      return FOOT_TOP;
  }
}

/** Whether a move of `run` units in `dt` seconds is a jump rather than travel. */
const isJump = (run: number, dt: number, kind: CraftKind | null): boolean => run > topSpeed(kind) * dt + 1;
/** Puffs a second off a fire. */
const SMOKE_RATE = 2.2;

/**
 * The dust a wheel or a foot raises on a biome's bare ground, or null where
 * the ground is grown over: sand in a desert, the tan of dry earth on rock,
 * the steppe and the savanna, snow in the cold. The grass, the woods and the
 * jungle raise nothing.
 */
export function dustOf(biome: BiomeId): number | null {
  switch (biome) {
    case 'desert':
      return PALETTE.sand;
    case 'rock':
    case 'steppe':
    case 'savanna':
      return PALETTE.tan;
    case 'ice':
    case 'tundra':
      return PALETTE.white;
    default:
      return null;
  }
}

/** How hard a crash is felt, 0 to 1, from the speed the knock took off: a quarter at the threshold, all of it at full boost. */
export function crashStrength(lost: number): number {
  return Math.min(1, Math.max(0.25, (lost / CAR_BOOST) * 1.4));
}

/** The part of the player the effects read: `Player` is one. */
export interface EffectsSubject {
  readonly position: THREE.Vector3;
  readonly forward: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly state: PlayerState;
  readonly airborne: boolean;
  readonly grounded: boolean;
  readonly ride: { readonly model: CraftModel } | null;
}

/** Somebody else's vehicle, or a boat of the traffic: its object (posed in the world), what it is, and its model if known. */
export type OtherVisitor = (object: THREE.Object3D, kind: CraftKind, model: CraftModel | null) => void;

/**
 * Something that smokes where it stands — a campfire in the country
 * (`countryside-motion.ts`) — called once a frame for each one near: its
 * mouth and the up it rises along.
 */
export type SmokeVisitor = (at: THREE.Vector3, up: THREE.Vector3) => void;

/** What the player just did that leaves a mark: `player.ts`'s `PlayerEvent`s, and the two foot callbacks. */
export type EffectsEvent = 'swim' | 'ashore' | 'took-off' | 'landed' | 'water-refused' | 'steep-refused' | 'crashed';

export interface EffectsStats {
  enabled: boolean;
  puffs: number;
  /** Splash and ripple discs. */
  discs: number;
  /** Wake points held across every ribbon, and the ribbons holding any. */
  ribbonPoints: number;
  ribbons: number;
  /** Foam vertices written this frame. */
  foamVertices: number;
  debris: number;
  /** Particles refused by a full pool since the page loaded. */
  dropped: number;
  /** Moves thrown away as jumps since the page loaded: boarding, teleports, late poses. */
  jumps: number;
  /** Other vehicles followed this frame. */
  tracked: number;
  /** Draw calls this frame: a pool with nothing alive is hidden. */
  calls: number;
  updateMs: number;
}

/** What `probe` reads off the wakes: for the headless check. */
export interface WakeProbe {
  points: number;
  /** The longest joined segment in any ribbon, in units. */
  maxGap: number;
  /** Joined segments. */
  segments: number;
}

export interface Effects {
  group: THREE.Group;
  /** Off clears every pool and makes nothing; the Settings card's *Effects*. */
  enabled: boolean;
  readonly stats: EffectsStats;
  /** Every frame, after everything that moves has moved. */
  update(dt: number, subject: EffectsSubject, camera: THREE.Camera): void;
  /** The ground under the player, as the slow sampling in the loop sees it: paved (a town, a road), and the biome. */
  setGround(paved: boolean, biome: BiomeId): void;
  /** Who else is moving: called by `update` with the visitor, once a frame. */
  setOthers(others: ((visit: OtherVisitor) => void) | null): void;
  /** What smokes where it stands: called by `update` with the visitor, once a frame. */
  setSmokers(smokers: ((visit: SmokeVisitor) => void) | null): void;
  /** A `PlayerEvent`, with its strength. */
  event(event: EffectsEvent, strength: number): void;
  /** On foot, down again after a jump or a fall, at `speed`. */
  touchdown(speed: number): void;
  /** On foot, a heel strike at `weight` times a walk. */
  step(weight: number): void;
  /** For the console: a crash, a splash, a landing's dust or a ripple where the player is. */
  burst(kind: 'crash' | 'splash' | 'dust' | 'ripple'): void;
  /** The wakes' points and their longest joined segment. */
  probe(): WakeProbe;
  /** One mesh per program, for `warm.ts`. */
  proxies(): THREE.Object3D[];
}

/* --- the pools' rows ------------------------------------------------------ */

// A puff: position, velocity, the up it rises along, age, life, start and end
// size, when it starts to shrink, colour, glow, drag, rise, and a rotation.
const P_POS = 0;
const P_VEL = 3;
const P_UP = 6;
const P_AGE = 9;
const P_LIFE = 10;
const P_S0 = 11;
const P_S1 = 12;
const P_HOLD = 13;
const P_COLOR = 14;
const P_GLOW = 17;
const P_DRAG = 18;
const P_RISE = 19;
const P_ROT = 20;
const P_STRIDE = 29;

// A disc: centre, velocity along the water, its own two axes on the water,
// age, life, start and end radius, how hollow it starts, drag.
const F_POS = 0;
const F_VEL = 3;
const F_E1 = 6;
const F_E2 = 9;
const F_AGE = 12;
const F_LIFE = 13;
const F_R0 = 14;
const F_R1 = 15;
const F_RING = 16;
const F_DRAG = 17;
const F_STRIDE = 18;

// A ribbon point: position, velocity along the water, the side the band
// spreads across, age, life, start and end half-width, drag, whether it is
// joined to the point before it, and how it goes (1 hollowing, 0 narrowing).
const R_POS = 0;
const R_VEL = 3;
const R_SIDE = 6;
const R_AGE = 9;
const R_LIFE = 10;
const R_W0 = 11;
const R_W1 = 12;
const R_DRAG = 13;
const R_LINK = 14;
const R_HOLLOW = 15;
const R_STRIDE = 16;

// A piece of debris: position, velocity, up, age, life, size, colour, spin
// axis, spin rate, angle, and the ground's radius it bounces on.
const D_POS = 0;
const D_VEL = 3;
const D_UP = 6;
const D_AGE = 9;
const D_LIFE = 10;
const D_SIZE = 11;
const D_COLOR = 12;
const D_AXIS = 15;
const D_SPIN = 18;
const D_ANGLE = 19;
const D_FLOOR = 20;
const D_STRIDE = 21;

// Per emitter, what it carries from frame to frame: a fraction of a puff owed
// (time-based), or the units run since the last point or ball (distance-based).
const E_EXHAUST = 0;
const E_DUST = 1;
const E_SKID = 2;
const E_SPRAY = 3;
const E_TRAIL = 4;
const E_CONTRAIL = 5;
const E_FLAME = 6;
const E_RING = 7;
const E_SWIM = 8;
const E_TAXI = 9;
const E_SLOTS = 10;

// A followed vehicle: last position, frame last seen, speed and climb eased,
// and its emitter slots.
const T_LAST = 0;
const T_SEEN = 3;
const T_SPEED = 4;
const T_CLIMB = 5;
const T_SLOTS = 6;
const T_STRIDE = T_SLOTS + E_SLOTS;

/** A followed vehicle's row, its emitter slots as a view made once, and its three ribbons (-1 for none). */
interface Track {
  row: Float64Array;
  slots: Float64Array;
  ribbons: Int32Array;
}
function newTrack(): Track {
  const row = new Float64Array(T_STRIDE);
  return { row, slots: row.subarray(T_SLOTS), ribbons: new Int32Array(3).fill(-1) };
}

const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** A palette colour in the renderer's linear space, cached: there are only a few. */
const linear = new Map<number, THREE.Color>();
function linearOf(hex: number): THREE.Color {
  let color = linear.get(hex);
  if (color === undefined) linear.set(hex, (color = new THREE.Color(hex)));
  return color;
}

/**
 * The puffs' material: the world's ramp, with an instanced `fxGlow` that
 * takes a puff's colour unlit — a flame is the one thing here that is its own
 * light, and it should read at night.
 */
function puffMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ gradientMap: createToonRamp(4) });
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float fxGlow;\nvarying float vFxGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFxGlow = fxGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFxGlow;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix( outgoingLight, diffuseColor.rgb, vFxGlow );\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'atlas-effects-puff';
  return material;
}

/** A faceted ball: flat normals, because the ramp needs facets to step across. */
function puffGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  geometry.computeVertexNormals();
  return geometry;
}

export function createEffects(): Effects {
  const group = new THREE.Group();
  group.name = 'effects';

  /* --- puffs ---------------------------------------------------------- */
  const puffGeo = puffGeometry();
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS), 1);
  glow.setUsage(THREE.DynamicDrawUsage);
  puffGeo.setAttribute('fxGlow', glow);
  const puffMat = puffMaterial();
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, MAX_PUFFS);
  puffs.name = 'effects-puffs';
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  puffs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 3), 3);
  puffs.instanceColor.setUsage(THREE.DynamicDrawUsage);
  // Culled by nothing: its bounding sphere would be the one three computed
  // for whatever the pool held the first frame it asked.
  puffs.frustumCulled = false;
  puffs.castShadow = false;
  puffs.receiveShadow = false;
  puffs.count = 0;
  group.add(puffs);
  const p = new Float64Array(MAX_PUFFS * P_STRIDE);
  let puffCount = 0;

  /* --- foam: discs and ribbons, one buffer ------------------------------ */
  const foamPositions = new Float32Array(FOAM_VERTEX_CAP * 3);
  const foamNormals = new Float32Array(FOAM_VERTEX_CAP * 3);
  const foamGeo = new THREE.BufferGeometry();
  const foamAttribute = new THREE.BufferAttribute(foamPositions, 3);
  foamAttribute.setUsage(THREE.DynamicDrawUsage);
  foamGeo.setAttribute('position', foamAttribute);
  // The foam lies on the water and its normal is the water's, written with it.
  const foamNormal = new THREE.BufferAttribute(foamNormals, 3);
  foamNormal.setUsage(THREE.DynamicDrawUsage);
  foamGeo.setAttribute('normal', foamNormal);
  foamGeo.setDrawRange(0, 0);
  const foamMat = new THREE.MeshToonMaterial({
    color: FOAM_COLOR,
    gradientMap: createToonRamp(4),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  foamMat.userData.outlineParameters = { visible: false };
  const foam = new THREE.Mesh(foamGeo, foamMat);
  foam.name = 'effects-foam';
  foam.frustumCulled = false;
  foam.castShadow = false;
  foam.receiveShadow = false;
  foam.visible = false;
  group.add(foam);
  const f = new Float64Array(MAX_DISCS * F_STRIDE);
  let discCount = 0;
  /** Foam vertices written so far this frame. */
  let cursor = 0;

  const r = new Float64Array(MAX_RIBBONS * RIBBON_POINTS * R_STRIDE);
  /** Each ribbon's oldest point, how many it holds, whether an emitter holds it, and the frame its emitter last ran. */
  const ribbonHead = new Int32Array(MAX_RIBBONS);
  const ribbonCount = new Int32Array(MAX_RIBBONS);
  const ribbonOwned = new Uint8Array(MAX_RIBBONS);
  const ribbonActive = new Float64Array(MAX_RIBBONS).fill(-Infinity);
  /** Set by a jump: the ribbon's next point starts a new strip, whatever ran last frame. */
  const ribbonBroken = new Uint8Array(MAX_RIBBONS);
  /** The player's own boat's three: the stern and the two shoulders. */
  const MINE = new Int32Array([0, 1, 2]);
  for (const ribbon of MINE) ribbonOwned[ribbon] = 1;

  /* --- debris --------------------------------------------------------- */
  const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
  const debrisMat = new THREE.MeshToonMaterial({ gradientMap: createToonRamp(4) });
  debrisMat.userData.outlineParameters = { thickness: 0.004, color: [0.11, 0.02, 0.01] };
  const debris = new THREE.InstancedMesh(debrisGeo, debrisMat, MAX_DEBRIS);
  debris.name = 'effects-debris';
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DEBRIS * 3), 3);
  debris.instanceColor.setUsage(THREE.DynamicDrawUsage);
  debris.frustumCulled = false;
  debris.castShadow = false;
  debris.receiveShadow = false;
  debris.count = 0;
  group.add(debris);
  const d = new Float64Array(MAX_DEBRIS * D_STRIDE);
  let debrisCount = 0;

  const stats: EffectsStats = {
    enabled: true, puffs: 0, discs: 0, ribbonPoints: 0, ribbons: 0, foamVertices: 0,
    debris: 0, dropped: 0, jumps: 0, tracked: 0, calls: 0, updateMs: 0,
  };
  let enabled = true;
  /** Where the meshes are this frame: every particle is written relative to it. */
  const anchor = new THREE.Vector3();
  const eye = new THREE.Vector3();
  let frame = 0;
  let frameDt = 1 / 60;

  /* --- the player, as the last frame left him ------------------------- */
  let subject: EffectsSubject | null = null;
  const last = new THREE.Vector3();
  const lastForward = new THREE.Vector3();
  let hasLast = false;
  /** What the player was in last frame, so boarding or stepping out resets rather than counts as a move. */
  let lastModel: CraftModel | null = null;
  let lastState: PlayerState = 'foot';
  let speedAlong = 0;
  let climb = 0;
  let turnRate = 0;
  let accel = 0;
  let paved = true;
  let dust: number | null = null;
  const mine = new Float64Array(E_SLOTS);
  let others: ((visit: OtherVisitor) => void) | null = null;
  let smokers: ((visit: SmokeVisitor) => void) | null = null;

  /** Followed vehicles, by object; their rows come from `trackFree` and go back to it. */
  const tracks = new Map<THREE.Object3D, Track>();
  const trackFree: Track[] = [];

  // Scratch.
  const right = new THREE.Vector3();
  const at = new THREE.Vector3();
  const vel = new THREE.Vector3();
  /** The emitter's own velocity, which the particles inherit a share of. */
  const motion = new THREE.Vector3();
  /** The emitter's move this frame, which interpolated emission walks back along. */
  const delta = new THREE.Vector3();
  /** Where a followed vehicle is, which its emitters start from. */
  const seen = new THREE.Vector3();
  /** Where a burst is centred, copied in, so a caller may pass any scratch vector. */
  const centre = new THREE.Vector3();
  const burstUp = new THREE.Vector3();
  const foamUp = new THREE.Vector3();
  const foamVel = new THREE.Vector3();
  const foamE1 = new THREE.Vector3();
  const foamE2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const upAt = new THREE.Vector3();
  const fwdAt = new THREE.Vector3();
  const rightAt = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const axis = new THREE.Vector3();

  /* --- spawning ------------------------------------------------------- */

  function spawnPuff(
    pos: THREE.Vector3, v: THREE.Vector3, up: THREE.Vector3,
    life: number, s0: number, s1: number, hold: number,
    hex: number, glowing: number, drag: number, rise: number,
  ): void {
    if (puffCount >= MAX_PUFFS) {
      stats.dropped++;
      return;
    }
    const o = puffCount++ * P_STRIDE;
    p3(p, o + P_POS, pos.x, pos.y, pos.z);
    p3(p, o + P_VEL, v.x, v.y, v.z);
    p3(p, o + P_UP, up.x, up.y, up.z);
    p[o + P_AGE] = 0;
    p[o + P_LIFE] = life;
    p[o + P_S0] = s0;
    p[o + P_S1] = s1;
    p[o + P_HOLD] = hold;
    const color = linearOf(hex);
    p3(p, o + P_COLOR, color.r, color.g, color.b);
    p[o + P_GLOW] = glowing;
    p[o + P_DRAG] = drag;
    p[o + P_RISE] = rise;
    // A uniformly random rotation, from a random unit quaternion, written out
    // as its matrix: a rotation, so its determinant is +1 and the scale that
    // multiplies it every frame is positive.
    const u1 = Math.random(), u2 = Math.random() * Math.PI * 2, u3 = Math.random() * Math.PI * 2;
    const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
    quaternion.set(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
    writeRotation(p, o + P_ROT, quaternion);
  }

  /**
   * A disc on the water at `pos` (projected onto the foam's sphere), moving
   * along it at `v`; `ring` is how hollow it starts — 0 a disc, near 1 a ring.
   */
  function spawnDisc(pos: THREE.Vector3, v: THREE.Vector3, life: number, r0: number, r1: number, ring: number, drag: number): void {
    if (discCount >= MAX_DISCS) {
      stats.dropped++;
      return;
    }
    const o = discCount++ * F_STRIDE;
    foamUp.copy(pos).normalize();
    p3(f, o + F_POS, foamUp.x * FOAM_RADIUS, foamUp.y * FOAM_RADIUS, foamUp.z * FOAM_RADIUS);
    // Along the water only.
    foamVel.copy(v).addScaledVector(foamUp, -v.dot(foamUp));
    p3(f, o + F_VEL, foamVel.x, foamVel.y, foamVel.z);
    // Two axes on the water, at a random turn so no two discs line their
    // corners up; `e2 = up x e1`, which makes `e1 x e2` up and the winding
    // counter-clockwise from above.
    foamE1.set(0, 1, 0).cross(foamUp);
    if (foamE1.lengthSq() < 1e-8) foamE1.set(1, 0, 0);
    foamE1.normalize().applyAxisAngle(foamUp, Math.random() * Math.PI * 2);
    foamE2.crossVectors(foamUp, foamE1).normalize();
    p3(f, o + F_E1, foamE1.x, foamE1.y, foamE1.z);
    p3(f, o + F_E2, foamE2.x, foamE2.y, foamE2.z);
    f[o + F_AGE] = 0;
    f[o + F_LIFE] = life;
    f[o + F_R0] = r0;
    f[o + F_R1] = r1;
    f[o + F_RING] = ring;
    f[o + F_DRAG] = drag;
  }

  /**
   * A point on ribbon `ribbon`, joined to the one before it if the ribbon's
   * emitter ran last frame or earlier this one; a full ribbon gives up its
   * oldest point.
   */
  function pushPoint(
    ribbon: number, pos: THREE.Vector3, v: THREE.Vector3, side: THREE.Vector3,
    life: number, w0: number, w1: number, drag: number, hollow: number,
  ): void {
    if (ribbonCount[ribbon] === RIBBON_POINTS) {
      ribbonHead[ribbon] = (ribbonHead[ribbon]! + 1) % RIBBON_POINTS;
      ribbonCount[ribbon] = RIBBON_POINTS - 1;
      stats.dropped++;
    }
    const index = (ribbonHead[ribbon]! + ribbonCount[ribbon]!) % RIBBON_POINTS;
    const o = (ribbon * RIBBON_POINTS + index) * R_STRIDE;
    const joined = ribbonBroken[ribbon] === 0 && ribbonCount[ribbon]! > 0 && ribbonActive[ribbon]! >= frame - 1;
    ribbonBroken[ribbon] = 0;
    ribbonCount[ribbon] = ribbonCount[ribbon]! + 1;
    foamUp.copy(pos).normalize();
    p3(r, o + R_POS, foamUp.x * FOAM_RADIUS, foamUp.y * FOAM_RADIUS, foamUp.z * FOAM_RADIUS);
    foamVel.copy(v).addScaledVector(foamUp, -v.dot(foamUp));
    p3(r, o + R_VEL, foamVel.x, foamVel.y, foamVel.z);
    foamE1.copy(side).addScaledVector(foamUp, -side.dot(foamUp)).normalize();
    p3(r, o + R_SIDE, foamE1.x, foamE1.y, foamE1.z);
    r[o + R_AGE] = 0;
    r[o + R_LIFE] = life;
    r[o + R_W0] = w0;
    r[o + R_W1] = w1;
    r[o + R_DRAG] = drag;
    r[o + R_LINK] = joined ? 1 : 0;
    r[o + R_HOLLOW] = hollow;
    ribbonActive[ribbon] = frame;
  }

  /** A ribbon nobody holds and that has drained, for a newly followed boat; -1 if every one is busy. */
  function takeRibbon(): number {
    for (let i = MINE.length; i < MAX_RIBBONS; i++) {
      if (ribbonOwned[i] === 0 && ribbonCount[i] === 0) {
        ribbonOwned[i] = 1;
        ribbonBroken[i] = 1;
        return i;
      }
    }
    return -1;
  }

  function spawnDebris(pos: THREE.Vector3, v: THREE.Vector3, up: THREE.Vector3, floor: number, size: number, hex: number, life: number): void {
    if (debrisCount >= MAX_DEBRIS) {
      stats.dropped++;
      return;
    }
    const o = debrisCount++ * D_STRIDE;
    p3(d, o + D_POS, pos.x, pos.y, pos.z);
    p3(d, o + D_VEL, v.x, v.y, v.z);
    p3(d, o + D_UP, up.x, up.y, up.z);
    d[o + D_AGE] = 0;
    d[o + D_LIFE] = life;
    d[o + D_SIZE] = size;
    const color = linearOf(hex);
    p3(d, o + D_COLOR, color.r, color.g, color.b);
    axis.set(rand(-1, 1), rand(-1, 1), rand(-1, 1));
    if (axis.lengthSq() < 1e-6) axis.set(0, 1, 0);
    axis.normalize();
    p3(d, o + D_AXIS, axis.x, axis.y, axis.z);
    d[o + D_SPIN] = rand(6, 14) * (Math.random() < 0.5 ? -1 : 1);
    d[o + D_ANGLE] = Math.random() * Math.PI * 2;
    d[o + D_FLOOR] = floor;
  }

  /* --- where, and when --------------------------------------------------- */

  /**
   * A point in a vehicle's frame — `x` to its right, `y` up, `z` forward —
   * into `out`, as it stood at `share` of the way through the frame's move:
   * the point now, walked back along `delta` by what of the move was still to
   * come. The turn within the frame is left out; at any frame rate the loop
   * runs, it is a few degrees.
   */
  function local(
    origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3,
    x: number, y: number, z: number, out: THREE.Vector3, share = 1,
  ): THREE.Vector3 {
    out.copy(origin).addScaledVector(side, x).addScaledVector(up, y).addScaledVector(fwd, z);
    if (share < 1) out.addScaledVector(delta, share - 1);
    return out;
  }

  /** A random direction along the ground at `up`, scaled by `length`, added to `out`. */
  function addAcross(up: THREE.Vector3, length: number, out: THREE.Vector3): THREE.Vector3 {
    e1.set(0, 1, 0).cross(up);
    if (e1.lengthSq() < 1e-8) e1.set(1, 0, 0);
    e1.normalize();
    e2.crossVectors(up, e1);
    const turn = Math.random() * Math.PI * 2;
    return out.addScaledVector(e1, Math.cos(turn) * length).addScaledVector(e2, Math.sin(turn) * length);
  }

  /**
   * Time-based: puffs owed at `rate` a second over `dt`, carried in
   * `slots[slot]` as a fraction of one. The `i`-th of `n` is put at
   * `(i + 0.5) / n` of the way through the frame.
   */
  function owed(slots: Float64Array, slot: number, rate: number, dt: number): number {
    const due = slots[slot]! + rate * dt;
    const whole = Math.floor(due);
    slots[slot] = due - whole;
    return Math.min(FRAME_BURST, whole);
  }

  /** Where in its move a spaced emission falls: set by `spaced`, read through `shareOf`. */
  let firstAt = 0;
  let spacingNow = 1;
  let runNow = 0;

  /**
   * Distance-based: points or balls owed for `run` more units at one every
   * `spacing`, carried in `slots[slot]` as the units run since the last. The
   * `j`-th falls `firstAt + j * spacing` units into this frame's move.
   */
  function spaced(slots: Float64Array, slot: number, run: number, spacing: number): number {
    const total = slots[slot]! + run;
    const whole = Math.floor(total / spacing);
    firstAt = spacing - slots[slot]!;
    spacingNow = spacing;
    runNow = run;
    slots[slot] = total - whole * spacing;
    return Math.min(FRAME_BURST, whole);
  }

  /** The share of the frame's move at which the `j`-th spaced emission falls. */
  const shareOf = (j: number): number => (runNow > 1e-9 ? clamp((firstAt + j * spacingNow) / runNow, 0, 1) : 1);

  /* --- what each kind leaves ------------------------------------------- */

  /**
   * A fire's smoke: a thin grey column, a puff every half second or so, that
   * drifts and swells as it climbs. Only inside `REACH` of the camera, like
   * anybody else's exhaust; the rate is a chance a frame rather than a slot,
   * because a fire has no row of its own to carry what it owes.
   */
  const smoke: SmokeVisitor = (mouth, up) => {
    if (mouth.distanceToSquared(eye) > REACH * REACH) return;
    if (Math.random() > SMOKE_RATE * frameDt) return;
    at.copy(mouth);
    addAcross(up, rand(0, H * 0.04), at);
    vel.copy(up).multiplyScalar(rand(1.2, 2));
    addAcross(up, rand(0.2, 0.7), vel);
    spawnPuff(at, vel, up, rand(3, 4), H * 0.05, H * rand(0.26, 0.36), 0.45, Math.random() < 0.6 ? PALETTE.bone : PALETTE.cream, 0, 0.35, 0.5);
  };

  /**
   * A boat's wake: a ribbon off the stern that widens and hollows behind it,
   * and one from each of the bow's shoulders whose points are pushed outward,
   * so the two angle away — the V; and at speed, spray thrown up off the bow
   * and falling back. `ribbons` are the stern's and the shoulders'.
   */
  function wake(
    slots: Float64Array, ribbons: Int32Array, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3,
    speed: number, run: number, length: number, width: number, dt: number,
  ): void {
    if (speed < 1.5) return;
    const k = clamp(speed / BOAT_BOOST, 0, 1);
    const spacing = Math.max(width * 0.5, speed * 0.03);
    const trailLife = 2.5 + 2.5 * k;
    const veeLife = 1.8 + 1.8 * k;
    for (let j = 0, n = spaced(slots, E_TRAIL, run, spacing); j < n; j++) {
      const share = shareOf(j);
      if (ribbons[0]! >= 0) {
        local(origin, fwd, up, side, 0, 0, -length * 0.45, at, share);
        vel.copy(fwd).multiplyScalar(speed * 0.1);
        pushPoint(ribbons[0]!, at, vel, side, trailLife, width * 0.3, width * (0.55 + 0.45 * k), 1.2, 1);
      }
      for (let hand = -1; hand <= 1; hand += 2) {
        const ribbon = ribbons[hand < 0 ? 1 : 2]!;
        if (ribbon < 0) continue;
        local(origin, fwd, up, side, hand * width * 0.5, 0, length * 0.2, at, share);
        vel.copy(side).multiplyScalar(hand * speed * 0.2);
        pushPoint(ribbon, at, vel, side, veeLife, width * 0.07, width * (0.14 + 0.08 * k), 0.6, 0);
      }
    }
    // The emitter ran this frame, whether or not it owed a point: the next
    // point joins the last one.
    for (let i = 0; i < 3; i++) if (ribbons[i]! >= 0) ribbonActive[ribbons[i]!] = frame;
    if (k > 0.4) {
      for (let j = 0, n = owed(slots, E_SPRAY, 16 * k, dt); j < n; j++) {
        const hand = Math.random() < 0.5 ? -1 : 1;
        local(origin, fwd, up, side, hand * width * 0.45, 0.2, length * 0.35, at, (j + 0.5) / n);
        vel.copy(fwd).multiplyScalar(speed * 0.7).addScaledVector(side, hand * rand(3, 7) * k).addScaledVector(up, rand(4, 7));
        spawnPuff(at, vel, up, rand(0.45, 0.65), H * 0.05, H * 0.11, 0.4, FOAM_COLOR, 0, 1.5, -FALL);
      }
    }
  }

  /** A plane's trail: balls of smoke off the tail, larger the faster it goes, so the trail still reads from the framing a fast plane is seen at. */
  function contrail(
    slots: Float64Array, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3,
    speed: number, run: number, length: number, height: number, throttle: number,
  ): void {
    const grow = clamp(1 + (speed / PLANE_CRUISE_LOW - 1) * 0.35, 1, 8);
    const spacing = Math.max(length * 0.22, speed * 0.045) * (throttle > 0 ? 0.65 : 1);
    for (let j = 0, n = spaced(slots, E_CONTRAIL, run, spacing); j < n; j++) {
      local(origin, fwd, up, side, rand(-0.05, 0.05) * length, height * 0.35, -length * 0.55, at, shareOf(j));
      vel.set(0, 0, 0);
      spawnPuff(at, vel, up, 2.4, length * 0.07 * grow, length * 0.13 * grow, 0.15, FOAM_COLOR, 0, 0, 0.6);
    }
  }

  /** A car's exhaust: a puff or two a second idling, a stream under the throttle. */
  function exhaust(
    slots: Float64Array, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3,
    speed: number, push: number, v: THREE.Vector3, length: number, width: number, height: number, dt: number,
  ): void {
    const rate = 2.5 + 12 * clamp(push / 20, 0, 1) + (Math.abs(speed) / CAR_BOOST) * 3;
    const hard = push > 12;
    for (let j = 0, n = owed(slots, E_EXHAUST, rate, dt); j < n; j++) {
      local(origin, fwd, up, side, width * 0.28, height * 0.16, -length * 0.5, at, (j + 0.5) / n);
      vel.copy(v).multiplyScalar(0.25).addScaledVector(fwd, -rand(1.5, 3)).addScaledVector(up, rand(0.5, 1.5));
      spawnPuff(at, vel, up, rand(0.7, 1.0), H * 0.05, H * (hard ? 0.2 : 0.14), 0.35, hard ? PALETTE.bone : PALETTE.cream, 0, 2, 2.5);
    }
  }

  /** Dust off both rear wheels, or tyre smoke in a hard turn: `hex` is its colour, `rate` how much a second. */
  function wheels(
    slots: Float64Array, slot: number, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3,
    v: THREE.Vector3, length: number, width: number, rate: number, hex: number, size: number, dt: number,
  ): void {
    for (let j = 0, n = owed(slots, slot, rate, dt); j < n; j++) {
      const hand = Math.random() < 0.5 ? -1 : 1;
      local(origin, fwd, up, side, hand * width * 0.45, 0.15, -length * 0.35, at, (j + 0.5) / n);
      vel.copy(v).multiplyScalar(0.12).addScaledVector(up, rand(1, 3));
      addAcross(up, rand(0.5, 2), vel);
      spawnPuff(at, vel, up, rand(0.9, 1.3), size * 0.4, size, 0.4, hex, 0, 1.6, 0.6);
    }
  }

  /** The burner, climbing: flame licking up from the coil into the envelope's mouth, lit by itself. */
  function flame(slots: Float64Array, origin: THREE.Vector3, up: THREE.Vector3, burner: readonly [number, number], dt: number): void {
    const [from, to] = burner;
    for (let j = 0, n = owed(slots, E_FLAME, 40, dt); j < n; j++) {
      at.copy(origin).addScaledVector(up, from).addScaledVector(delta, (j + 0.5) / n - 1);
      addAcross(up, H * 0.02, at);
      const life = rand(0.18, 0.28);
      vel.copy(up).multiplyScalar((to - from) / life);
      const hex = Math.random() < 0.4 ? PALETTE.gold : Math.random() < 0.6 ? PALETTE.apricot : PALETTE.orange;
      spawnPuff(at, vel, up, life, H * 0.07, H * 0.12, 0.3, hex, 1, 0, 0);
    }
  }

  /** A splash: spray thrown up and falling back, and a ring opening on the water. */
  function splash(point: THREE.Vector3, up: THREE.Vector3, reach: number, count: number): void {
    centre.copy(point);
    burstUp.copy(up);
    at.copy(burstUp).multiplyScalar(FOAM_RADIUS);
    vel.set(0, 0, 0);
    spawnDisc(at, vel, 1.1, reach * 0.35, reach, 0.72, 0);
    spawnDisc(at, vel, 1.6, reach * 0.15, reach * 0.6, 0, 0);
    for (let i = 0; i < count; i++) {
      at.copy(centre);
      addAcross(burstUp, rand(0, reach * 0.25), at);
      vel.copy(burstUp).multiplyScalar(rand(6, 11));
      addAcross(burstUp, rand(1.5, 4), vel);
      spawnPuff(at, vel, burstUp, rand(0.55, 0.8), H * 0.06, H * rand(0.1, 0.16), 0.45, FOAM_COLOR, 0, 1, -FALL);
    }
  }

  /** A burst of dust round `point`, low and spreading: a landing, a touchdown, a take-off. */
  function dustBurst(point: THREE.Vector3, up: THREE.Vector3, reach: number, count: number, hex: number, size: number): void {
    centre.copy(point);
    for (let i = 0; i < count; i++) {
      at.copy(centre);
      addAcross(up, rand(0, reach), at);
      vel.copy(up).multiplyScalar(rand(0.5, 2));
      addAcross(up, rand(2, 5), vel);
      spawnPuff(at, vel, up, rand(0.6, 1.0), size * 0.4, size * rand(0.8, 1.2), 0.35, hex, 0, 3, 0.5);
    }
  }

  /** A crash: chunky puffs out of the knock, and debris thrown up that tumbles, bounces and goes. */
  function crash(point: THREE.Vector3, up: THREE.Vector3, facing: THREE.Vector3, floor: number, strength: number): void {
    centre.copy(point);
    const puffsCount = Math.round(8 + 8 * strength);
    for (let i = 0; i < puffsCount; i++) {
      at.copy(centre);
      addAcross(up, rand(0, H * 0.3), at);
      vel.copy(facing).multiplyScalar(-rand(1, 4)).addScaledVector(up, rand(1, 4));
      addAcross(up, rand(3, 8) * strength, vel);
      const hex = dust ?? (Math.random() < 0.5 ? PALETTE.bone : PALETTE.cream);
      spawnPuff(at, vel, up, rand(0.7, 1.1), H * 0.1, H * rand(0.25, 0.4) * (0.7 + 0.5 * strength), 0.4, hex, 0, 3, 1);
    }
    const pieces = Math.round(4 + 6 * strength);
    for (let i = 0; i < pieces; i++) {
      at.copy(centre).addScaledVector(up, H * 0.15);
      vel.copy(up).multiplyScalar(rand(6, 11) * (0.6 + 0.4 * strength)).addScaledVector(facing, -rand(2, 6));
      addAcross(up, rand(3, 9) * strength, vel);
      const hex = i % 3 === 0 ? PALETTE.steel : i % 3 === 1 ? PALETTE.bark : PALETTE.bone;
      spawnDebris(at, vel, up, floor, H * rand(0.05, 0.1), hex, rand(1.3, 1.9));
    }
  }

  /* --- the player's own marks ------------------------------------------ */

  /** Forget the player's motion: the next frame starts his emitters afresh and joins no ribbon to the last. */
  function resetMine(s: EffectsSubject): void {
    last.copy(s.position);
    lastForward.copy(s.forward);
    hasLast = true;
    speedAlong = 0;
    climb = 0;
    accel = 0;
    turnRate = 0;
    mine.fill(0);
    for (let i = 0; i < 3; i++) ribbonBroken[MINE[i]!] = 1;
  }

  function playerMarks(dt: number, s: EffectsSubject): void {
    const model = s.ride?.model ?? null;
    const kind = model?.kind ?? null;
    const up = s.up;
    const fwd = s.forward;
    right.crossVectors(up, fwd).normalize();
    delta.subVectors(s.position, last);
    const run = delta.length();
    // Boarding, stepping out, a teleport: a jump, not a move.
    if (!hasLast || dt <= 0 || model !== lastModel || s.state !== lastState || isJump(run, dt, kind)) {
      if (hasLast && dt > 0) stats.jumps++;
      lastModel = model;
      lastState = s.state;
      resetMine(s);
      return;
    }
    const top = topSpeed(kind);
    const along = clamp(delta.dot(fwd) / dt, -top, top);
    const rising = delta.dot(up) / dt;
    accel += ((along - speedAlong) / dt - accel) * Math.min(1, dt * 6);
    speedAlong = along;
    climb += (rising - climb) * Math.min(1, dt * 4);
    axis.crossVectors(lastForward, fwd);
    const turned = Math.atan2(axis.dot(up), lastForward.dot(fwd));
    turnRate += (turned / dt - turnRate) * Math.min(1, dt * 8);
    last.copy(s.position);
    lastForward.copy(fwd);
    // The velocity the particles inherit a share of, in units a second.
    motion.copy(delta).multiplyScalar(1 / dt);

    if (s.state === 'swim' && kind === null) {
      // Rings round a swimmer, closer together moving, and a little trail of discs.
      const moving = Math.abs(along) > 1;
      for (let j = 0, n = owed(mine, E_RING, moving ? 2.2 : 0.9, dt); j < n; j++) {
        local(s.position, fwd, up, right, 0, 0, 0, at, (j + 0.5) / n);
        spawnDisc(at, fwdAt.set(0, 0, 0), 1.6, H * 0.3, H * (moving ? 0.8 : 1.0), 0.8, 0);
      }
      if (moving) {
        for (let j = 0, n = spaced(mine, E_SWIM, run, H * 0.3); j < n; j++) {
          local(s.position, fwd, up, right, rand(-0.1, 0.1) * H, 0, -H * 0.25, at, shareOf(j));
          spawnDisc(at, fwdAt.set(0, 0, 0), 1.3, H * 0.12, H * 0.3, 0, 0);
        }
      }
      return;
    }
    if (model === null) return;
    const [length, width, height] = model.size;
    const speed = Math.abs(along);

    if (kind === 'boat') {
      wake(mine, MINE, s.position, fwd, up, right, along, run, length, width, dt);
    } else if (kind === 'plane') {
      if (s.airborne) contrail(mine, s.position, fwd, up, right, speed, run, length, height, accel);
      else if (speed > 12) {
        // The take-off run and the roll-out: dust off the main wheels, or on
        // grass the wash of the propeller lifting a little of it.
        const hex = paved ? null : dust ?? PALETTE.bone;
        if (hex !== null) {
          const rate = 30 * clamp(speed / PLANE_ROTATE, 0, 1);
          wheels(mine, E_TAXI, s.position, fwd, up, right, motion, length * 0.4, width * 0.3, rate, hex, H * (dust === null ? 0.18 : 0.3), dt);
        }
      }
    } else if (kind === 'car' || kind === 'van') {
      exhaust(mine, s.position, fwd, up, right, along, accel, motion, length, width, height, dt);
      if (!s.airborne) {
        if (!paved && dust !== null && speed > 10) {
          wheels(mine, E_DUST, s.position, fwd, up, right, motion, length, width, 30 * clamp(speed / CAR_BOOST, 0, 1), dust, H * 0.4, dt);
        }
        // Sliding: a hard turn at speed smokes the tyres on a road and throws
        // dust off one.
        const lateral = Math.abs(turnRate) * speed;
        if (speed > 20 && lateral > 24) {
          wheels(mine, E_SKID, s.position, fwd, up, right, motion, length, width, 25, paved || dust === null ? PALETTE.bone : dust, H * 0.3, dt);
        }
      }
    } else if (kind === 'balloon') {
      const burner = model.burner;
      if (burner !== undefined && climb > 0.3) flame(mine, s.position, up, burner, dt);
    }
  }

  /* --- everybody else --------------------------------------------------- */

  const follow: OtherVisitor = (object, kind, model) => {
    const now = object.getWorldPosition(seen);
    let entry = tracks.get(object);
    if (entry === undefined) {
      entry = trackFree.pop() ?? newTrack();
      entry.row.fill(0);
      p3(entry.row, T_LAST, now.x, now.y, now.z);
      entry.row[T_SEEN] = frame;
      tracks.set(object, entry);
      return;
    }
    const track = entry.row;
    track[T_SEEN] = frame;
    delta.set(now.x - track[T_LAST]!, now.y - track[T_LAST + 1]!, now.z - track[T_LAST + 2]!);
    p3(track, T_LAST, now.x, now.y, now.z);
    const run = delta.length();
    if (frameDt <= 0) return;
    if (isJump(run, frameDt, kind)) {
      // A pose that arrived late, or a pooled group put to another vehicle:
      // start again from here.
      stats.jumps++;
      track[T_SPEED] = 0;
      track[T_CLIMB] = 0;
      entry.slots.fill(0);
      for (let i = 0; i < 3; i++) if (entry.ribbons[i]! >= 0) ribbonBroken[entry.ribbons[i]!] = 1;
      return;
    }
    upAt.copy(now).normalize();
    const top = topSpeed(kind);
    track[T_SPEED] = track[T_SPEED]! + (Math.min(top, run / frameDt) - track[T_SPEED]!) * Math.min(1, frameDt * 4);
    const rising = delta.dot(upAt) / frameDt;
    track[T_CLIMB] = track[T_CLIMB]! + (rising - track[T_CLIMB]!) * Math.min(1, frameDt * 4);
    if (now.distanceTo(eye) > REACH) return;
    const speed = track[T_SPEED]!;
    object.getWorldDirection(fwdAt);
    fwdAt.addScaledVector(upAt, -fwdAt.dot(upAt)).normalize();
    rightAt.crossVectors(upAt, fwdAt).normalize();
    const length = model?.size[0] ?? H * 2;
    const width = model?.size[1] ?? H * 0.8;
    const height = model?.size[2] ?? H;
    motion.copy(delta).multiplyScalar(1 / frameDt);
    if (kind === 'boat') {
      for (let i = 0; i < 3; i++) if (entry.ribbons[i]! < 0) entry.ribbons[i] = takeRibbon();
      wake(entry.slots, entry.ribbons, now, fwdAt, upAt, rightAt, speed, run, length, width, frameDt);
    } else if (kind === 'plane') {
      if (speed > PLANE_ROTATE * 1.05) contrail(entry.slots, now, fwdAt, upAt, rightAt, speed, run, length, height, 0);
    } else if (kind === 'car' || kind === 'van') {
      if (speed > 0.5) exhaust(entry.slots, now, fwdAt, upAt, rightAt, speed, 0, motion, length, width, height, frameDt);
    } else if (kind === 'balloon' && model?.burner !== undefined && track[T_CLIMB]! > 0.3) {
      flame(entry.slots, now, upAt, model.burner, frameDt);
    }
  };

  /** Lets a followed vehicle go: its ribbons drain where they are and are then free for another. */
  function release(entry: Track): void {
    for (let i = 0; i < 3; i++) {
      const ribbon = entry.ribbons[i]!;
      if (ribbon >= 0) ribbonOwned[ribbon] = 0;
      entry.ribbons[i] = -1;
    }
    trackFree.push(entry);
  }

  const forget = (entry: Track, object: THREE.Object3D): void => {
    if (entry.row[T_SEEN] === frame) return;
    tracks.delete(object);
    release(entry);
  };

  /* --- advancing and writing -------------------------------------------- */

  function advancePuffs(dt: number): void {
    const matrices = puffs.instanceMatrix.array as Float32Array;
    const colors = puffs.instanceColor!.array as Float32Array;
    const glows = glow.array as Float32Array;
    for (let i = 0; i < puffCount; i++) {
      let o = i * P_STRIDE;
      p[o + P_AGE] = p[o + P_AGE]! + dt;
      if (p[o + P_AGE]! >= p[o + P_LIFE]!) {
        puffCount--;
        if (i !== puffCount) p.copyWithin(o, puffCount * P_STRIDE, (puffCount + 1) * P_STRIDE);
        i--;
        continue;
      }
      o = i * P_STRIDE;
      const damp = Math.exp(-p[o + P_DRAG]! * dt);
      const rise = p[o + P_RISE]! * dt;
      for (let c = 0; c < 3; c++) {
        const v = p[o + P_VEL + c]! * damp + p[o + P_UP + c]! * rise;
        p[o + P_VEL + c] = v;
        p[o + P_POS + c] = p[o + P_POS + c]! + v * dt;
      }
      const t = p[o + P_AGE]! / p[o + P_LIFE]!;
      const grown = 1 - (1 - Math.min(1, t / 0.3)) ** 2;
      const hold = p[o + P_HOLD]!;
      let size = p[o + P_S0]! + (p[o + P_S1]! - p[o + P_S0]!) * grown;
      if (t > hold) size *= 1 - smooth((t - hold) / (1 - hold));
      size = Math.max(size, 1e-4);
      const m = i * 16;
      for (let c = 0; c < 3; c++) {
        matrices[m + c] = p[o + P_ROT + c]! * size;
        matrices[m + 4 + c] = p[o + P_ROT + 3 + c]! * size;
        matrices[m + 8 + c] = p[o + P_ROT + 6 + c]! * size;
      }
      matrices[m + 3] = 0;
      matrices[m + 7] = 0;
      matrices[m + 11] = 0;
      matrices[m + 12] = p[o + P_POS]! - anchor.x;
      matrices[m + 13] = p[o + P_POS + 1]! - anchor.y;
      matrices[m + 14] = p[o + P_POS + 2]! - anchor.z;
      matrices[m + 15] = 1;
      colors[i * 3] = p[o + P_COLOR]!;
      colors[i * 3 + 1] = p[o + P_COLOR + 1]!;
      colors[i * 3 + 2] = p[o + P_COLOR + 2]!;
      glows[i] = p[o + P_GLOW]!;
    }
    puffs.count = puffCount;
    puffs.visible = puffCount > 0;
    if (puffCount > 0) {
      markRange(puffs.instanceMatrix, puffCount * 16);
      markRange(puffs.instanceColor!, puffCount * 3);
      markRange(glow, puffCount);
    }
  }

  /** One foam vertex, relative to the anchor, with the water's normal. */
  function vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    const v = cursor * 3;
    foamPositions[v] = x - anchor.x;
    foamPositions[v + 1] = y - anchor.y;
    foamPositions[v + 2] = z - anchor.z;
    foamNormals[v] = nx;
    foamNormals[v + 1] = ny;
    foamNormals[v + 2] = nz;
    cursor++;
  }

  function advanceDiscs(dt: number): void {
    for (let i = 0; i < discCount; i++) {
      let o = i * F_STRIDE;
      f[o + F_AGE] = f[o + F_AGE]! + dt;
      if (f[o + F_AGE]! >= f[o + F_LIFE]!) {
        discCount--;
        if (i !== discCount) f.copyWithin(o, discCount * F_STRIDE, (discCount + 1) * F_STRIDE);
        i--;
        continue;
      }
      o = i * F_STRIDE;
      const damp = Math.exp(-f[o + F_DRAG]! * dt);
      let x = f[o + F_POS]!, y = f[o + F_POS + 1]!, z = f[o + F_POS + 2]!;
      const vx = f[o + F_VEL]! * damp, vy = f[o + F_VEL + 1]! * damp, vz = f[o + F_VEL + 2]! * damp;
      p3(f, o + F_VEL, vx, vy, vz);
      x += vx * dt; y += vy * dt; z += vz * dt;
      // Back onto the water's sphere: a disc drifting along a tangent would
      // otherwise rise off the sea at a rate of its speed squared.
      const onto = FOAM_RADIUS / Math.hypot(x, y, z);
      x *= onto; y *= onto; z *= onto;
      p3(f, o + F_POS, x, y, z);
      if (cursor + DISC_VERTICES > FOAM_VERTEX_CAP) continue;
      const t = f[o + F_AGE]! / f[o + F_LIFE]!;
      const outer = f[o + F_R0]! + (f[o + F_R1]! - f[o + F_R0]!) * (1 - (1 - t) * (1 - t));
      const ring = f[o + F_RING]!;
      const inner = outer * Math.min(1, ring + (1 - ring) * smooth((t - 0.35) / 0.65));
      const nx = x / FOAM_RADIUS, ny = y / FOAM_RADIUS, nz = z / FOAM_RADIUS;
      for (let k = 0; k < DISC_SIDES; k++) {
        const k1 = (k + 1) % DISC_SIDES;
        const ax = f[o + F_E1]! * COS[k]! + f[o + F_E2]! * SIN[k]!;
        const ay = f[o + F_E1 + 1]! * COS[k]! + f[o + F_E2 + 1]! * SIN[k]!;
        const az = f[o + F_E1 + 2]! * COS[k]! + f[o + F_E2 + 2]! * SIN[k]!;
        const bx = f[o + F_E1]! * COS[k1]! + f[o + F_E2]! * SIN[k1]!;
        const by = f[o + F_E1 + 1]! * COS[k1]! + f[o + F_E2 + 1]! * SIN[k1]!;
        const bz = f[o + F_E1 + 2]! * COS[k1]! + f[o + F_E2 + 2]! * SIN[k1]!;
        // Counter-clockwise from above: `e1 x e2` is up (see `spawnDisc`).
        vertex(x + ax * inner, y + ay * inner, z + az * inner, nx, ny, nz);
        vertex(x + ax * outer, y + ay * outer, z + az * outer, nx, ny, nz);
        vertex(x + bx * outer, y + by * outer, z + bz * outer, nx, ny, nz);
        vertex(x + ax * inner, y + ay * inner, z + az * inner, nx, ny, nz);
        vertex(x + bx * outer, y + by * outer, z + bz * outer, nx, ny, nz);
        vertex(x + bx * inner, y + by * inner, z + bz * inner, nx, ny, nz);
      }
    }
  }

  /** A ribbon point's band now: its half-width out to `bandOuter` from `bandInner`, by its age. */
  let bandInner = 0;
  let bandOuter = 0;
  function band(o: number): void {
    const t = clamp(r[o + R_AGE]! / r[o + R_LIFE]!, 0, 1);
    let outer = r[o + R_W0]! + (r[o + R_W1]! - r[o + R_W0]!) * (1 - (1 - t) * (1 - t));
    let inner = 0;
    if (r[o + R_HOLLOW]! > 0) inner = outer * smooth((t - 0.3) / 0.7);
    else outer *= 1 - smooth((t - 0.5) / 0.5);
    if (t >= 1) inner = outer;
    bandInner = inner;
    bandOuter = outer;
  }

  /**
   * One side of a segment, from point `a` to point `b`, as two triangles
   * wound to face up: the band `hand` of the path, between each end's inner
   * and outer half-width.
   */
  function halfBand(a: number, b: number, hand: number, ai: number, ao: number, bi: number, bo: number): void {
    const ax = r[a + R_POS]!, ay = r[a + R_POS + 1]!, az = r[a + R_POS + 2]!;
    const bx = r[b + R_POS]!, by = r[b + R_POS + 1]!, bz = r[b + R_POS + 2]!;
    const asx = r[a + R_SIDE]! * hand, asy = r[a + R_SIDE + 1]! * hand, asz = r[a + R_SIDE + 2]! * hand;
    const bsx = r[b + R_SIDE]! * hand, bsy = r[b + R_SIDE + 1]! * hand, bsz = r[b + R_SIDE + 2]! * hand;
    const nx = ax / FOAM_RADIUS, ny = ay / FOAM_RADIUS, nz = az / FOAM_RADIUS;
    // Which way round is up: the side crossed with the way along, against the water's normal.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const facing = (asy * uz - asz * uy) * nx + (asz * ux - asx * uz) * ny + (asx * uy - asy * ux) * nz;
    const aix = ax + asx * ai, aiy = ay + asy * ai, aiz = az + asz * ai;
    const aox = ax + asx * ao, aoy = ay + asy * ao, aoz = az + asz * ao;
    const bix = bx + bsx * bi, biy = by + bsy * bi, biz = bz + bsz * bi;
    const box = bx + bsx * bo, boy = by + bsy * bo, boz = bz + bsz * bo;
    if (facing > 0) {
      vertex(aix, aiy, aiz, nx, ny, nz); vertex(aox, aoy, aoz, nx, ny, nz); vertex(box, boy, boz, nx, ny, nz);
      vertex(aix, aiy, aiz, nx, ny, nz); vertex(box, boy, boz, nx, ny, nz); vertex(bix, biy, biz, nx, ny, nz);
    } else {
      vertex(aix, aiy, aiz, nx, ny, nz); vertex(box, boy, boz, nx, ny, nz); vertex(aox, aoy, aoz, nx, ny, nz);
      vertex(aix, aiy, aiz, nx, ny, nz); vertex(bix, biy, biz, nx, ny, nz); vertex(box, boy, boz, nx, ny, nz);
    }
  }

  function advanceRibbons(dt: number): void {
    let points = 0;
    let live = 0;
    for (let ribbon = 0; ribbon < MAX_RIBBONS; ribbon++) {
      let count = ribbonCount[ribbon]!;
      if (count === 0) continue;
      const base = ribbon * RIBBON_POINTS;
      let head = ribbonHead[ribbon]!;
      for (let i = 0; i < count; i++) {
        const o = (base + ((head + i) % RIBBON_POINTS)) * R_STRIDE;
        r[o + R_AGE] = r[o + R_AGE]! + dt;
        const damp = Math.exp(-r[o + R_DRAG]! * dt);
        const x = r[o + R_POS]!, y = r[o + R_POS + 1]!, z = r[o + R_POS + 2]!;
        const vx = r[o + R_VEL]! * damp, vy = r[o + R_VEL + 1]! * damp, vz = r[o + R_VEL + 2]! * damp;
        p3(r, o + R_VEL, vx, vy, vz);
        const nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
        const onto = FOAM_RADIUS / Math.hypot(nx, ny, nz);
        p3(r, o + R_POS, nx * onto, ny * onto, nz * onto);
      }
      // The oldest go first; a point older than its life in the middle of a
      // ribbon is drawn at no width until its turn comes.
      while (count > 0) {
        const o = (base + head) * R_STRIDE;
        if (r[o + R_AGE]! < r[o + R_LIFE]!) break;
        head = (head + 1) % RIBBON_POINTS;
        count--;
      }
      ribbonHead[ribbon] = head;
      ribbonCount[ribbon] = count;
      if (count === 0) continue;
      points += count;
      live++;
      for (let i = 1; i < count; i++) {
        const b = (base + ((head + i) % RIBBON_POINTS)) * R_STRIDE;
        if (r[b + R_LINK] === 0) continue;
        if (cursor + SEGMENT_VERTICES > FOAM_VERTEX_CAP) break;
        const a = (base + ((head + i - 1) % RIBBON_POINTS)) * R_STRIDE;
        band(a);
        const ai = bandInner, ao = bandOuter;
        band(b);
        const bi = bandInner, bo = bandOuter;
        if (ao <= ai && bo <= bi) continue;
        halfBand(a, b, 1, ai, ao, bi, bo);
        halfBand(a, b, -1, ai, ao, bi, bo);
      }
    }
    stats.ribbonPoints = points;
    stats.ribbons = live;
  }

  function advanceDebris(dt: number): void {
    const matrices = debris.instanceMatrix.array as Float32Array;
    const colors = debris.instanceColor!.array as Float32Array;
    for (let i = 0; i < debrisCount; i++) {
      let o = i * D_STRIDE;
      d[o + D_AGE] = d[o + D_AGE]! + dt;
      if (d[o + D_AGE]! >= d[o + D_LIFE]!) {
        debrisCount--;
        if (i !== debrisCount) d.copyWithin(o, debrisCount * D_STRIDE, (debrisCount + 1) * D_STRIDE);
        i--;
        continue;
      }
      o = i * D_STRIDE;
      const size = d[o + D_SIZE]!;
      at.set(d[o + D_POS]!, d[o + D_POS + 1]!, d[o + D_POS + 2]!);
      vel.set(d[o + D_VEL]!, d[o + D_VEL + 1]!, d[o + D_VEL + 2]!);
      upAt.set(d[o + D_UP]!, d[o + D_UP + 1]!, d[o + D_UP + 2]!);
      vel.addScaledVector(upAt, -FALL * dt);
      at.addScaledVector(vel, dt);
      // The ground it was thrown over, as a sphere at its radius: a bounce
      // that keeps a third of the fall and slows the roll and the spin.
      const floor = d[o + D_FLOOR]! + size * 0.5;
      const radius = at.length();
      if (radius < floor) {
        at.multiplyScalar(floor / radius);
        e1.copy(at).normalize();
        const into = vel.dot(e1);
        if (into < 0) {
          vel.addScaledVector(e1, -into * 1.35).multiplyScalar(0.7);
          d[o + D_SPIN] = d[o + D_SPIN]! * 0.6;
        }
      }
      p3(d, o + D_POS, at.x, at.y, at.z);
      p3(d, o + D_VEL, vel.x, vel.y, vel.z);
      d[o + D_ANGLE] = d[o + D_ANGLE]! + d[o + D_SPIN]! * dt;
      const t = d[o + D_AGE]! / d[o + D_LIFE]!;
      // The last quarter of its life a piece sinks into the ground rather than
      // shrinking: it is inked, the pen is screen space, and a piece shrunk
      // to nothing left its hull behind as a black dot. The sink is drawn
      // only, so the bounce above never sees it.
      const sink = t > 0.75 ? Math.min(1, (t - 0.75) / 0.25) * size * 1.2 : 0;
      axis.set(d[o + D_AXIS]!, d[o + D_AXIS + 1]!, d[o + D_AXIS + 2]!);
      quaternion.setFromAxisAngle(axis, d[o + D_ANGLE]!);
      const m = i * 16;
      writeRotation(matrices, m, quaternion, size);
      const down = sink / at.length();
      matrices[m + 12] = at.x * (1 - down) - anchor.x;
      matrices[m + 13] = at.y * (1 - down) - anchor.y;
      matrices[m + 14] = at.z * (1 - down) - anchor.z;
      colors[i * 3] = d[o + D_COLOR]!;
      colors[i * 3 + 1] = d[o + D_COLOR + 1]!;
      colors[i * 3 + 2] = d[o + D_COLOR + 2]!;
    }
    debris.count = debrisCount;
    debris.visible = debrisCount > 0;
    if (debrisCount > 0) {
      markRange(debris.instanceMatrix, debrisCount * 16);
      markRange(debris.instanceColor!, debrisCount * 3);
    }
  }

  function clear(): void {
    puffCount = 0;
    discCount = 0;
    debrisCount = 0;
    puffs.count = 0;
    debris.count = 0;
    puffs.visible = false;
    debris.visible = false;
    foam.visible = false;
    foamGeo.setDrawRange(0, 0);
    ribbonCount.fill(0);
    ribbonHead.fill(0);
    ribbonActive.fill(-Infinity);
    ribbonBroken.fill(1);
    mine.fill(0);
    hasLast = false;
    tracks.forEach(release);
    tracks.clear();
  }

  /* --- the events -------------------------------------------------------- */

  function event(name: EffectsEvent, strength: number): void {
    const s = subject;
    if (!enabled || s === null) return;
    const kind = s.ride?.model.kind ?? null;
    const size = s.ride?.model.size;
    if (name === 'swim') {
      splash(s.position, s.up, H * 1.2, 10);
    } else if (name === 'crashed' && size !== undefined) {
      const ahead = speedAlong >= 0 ? 1 : -1;
      at.copy(s.position).addScaledVector(s.up, size[2] * 0.4).addScaledVector(s.forward, ahead * size[0] * 0.5);
      fwdAt.copy(s.forward).multiplyScalar(ahead);
      crash(at, s.up, fwdAt, s.position.length(), crashStrength(strength));
    } else if (name === 'water-refused' && size !== undefined) {
      at.copy(s.up).multiplyScalar(FOAM_RADIUS);
      splash(at, s.up, Math.max(size[0], size[1]) * 0.6, 14);
    } else if ((name === 'landed' || name === 'took-off') && size !== undefined) {
      const hex = paved ? PALETTE.bone : dust ?? PALETTE.bone;
      const count = kind === 'plane' ? (name === 'landed' ? 14 : 8) : 6;
      dustBurst(s.position, s.up, Math.max(size[0], size[1]) * 0.35, count, hex, H * (kind === 'plane' ? 0.35 : 0.25));
    }
  }

  const effects: Effects = {
    group,
    get enabled() {
      return enabled;
    },
    set enabled(on: boolean) {
      if (on === enabled) return;
      enabled = on;
      stats.enabled = on;
      if (!on) clear();
    },
    stats,
    update(dt, s, camera) {
      const began = performance.now();
      subject = s;
      frame++;
      frameDt = dt;
      camera.getWorldPosition(eye);
      if (!enabled) {
        stats.updateMs = 0;
        stats.calls = 0;
        return;
      }
      anchor.copy(s.position);
      group.position.copy(anchor);
      playerMarks(dt, s);
      if (others !== null) others(follow);
      if (smokers !== null) smokers(smoke);
      tracks.forEach(forget);
      stats.tracked = tracks.size;
      advancePuffs(dt);
      cursor = 0;
      advanceDiscs(dt);
      advanceRibbons(dt);
      foamGeo.setDrawRange(0, cursor);
      foam.visible = cursor > 0;
      if (cursor > 0) {
        markRange(foamAttribute, cursor * 3);
        markRange(foamNormal, cursor * 3);
      }
      advanceDebris(dt);
      stats.puffs = puffCount;
      stats.discs = discCount;
      stats.foamVertices = cursor;
      stats.debris = debrisCount;
      stats.calls = (puffCount > 0 ? 1 : 0) + (cursor > 0 ? 1 : 0) + (debrisCount > 0 ? 2 : 0);
      stats.updateMs = Math.round((performance.now() - began) * 1000) / 1000;
    },
    setGround(onMade, biome) {
      paved = onMade;
      dust = dustOf(biome);
    },
    setOthers(visit) {
      others = visit;
    },
    setSmokers(visit) {
      smokers = visit;
    },
    event,
    touchdown(speed) {
      const s = subject;
      if (!enabled || s === null || speed < 6 || s.state !== 'foot') return;
      const hex = paved || dust === null ? PALETTE.bone : dust;
      dustBurst(s.position, s.up, H * 0.2, Math.round(4 + Math.min(6, speed / 4)), hex, H * 0.14);
    },
    step(weight) {
      const s = subject;
      if (!enabled || s === null || weight < 1.6 || paved || dust === null || s.state !== 'foot') return;
      right.crossVectors(s.up, s.forward).normalize();
      for (let i = 0; i < 2; i++) {
        at.copy(s.position).addScaledVector(right, rand(-0.1, 0.1) * H).addScaledVector(s.up, 0.05).addScaledVector(s.forward, -H * 0.1);
        vel.copy(s.up).multiplyScalar(rand(0.5, 1.5)).addScaledVector(s.forward, -rand(0.5, 1.5));
        spawnPuff(at, vel, s.up, rand(0.5, 0.7), H * 0.04, H * 0.1, 0.35, dust, 0, 2.5, 0.4);
      }
    },
    burst(kind) {
      const s = subject;
      if (s === null) return;
      if (kind === 'crash') {
        fwdAt.copy(s.forward);
        at.copy(s.position).addScaledVector(s.forward, H);
        crash(at, s.up, fwdAt, s.position.length(), 1);
      } else if (kind === 'splash') splash(s.position, s.up, H * 1.2, 10);
      else if (kind === 'dust') dustBurst(s.position, s.up, H * 0.6, 12, dust ?? PALETTE.bone, H * 0.3);
      else spawnDisc(s.position, fwdAt.set(0, 0, 0), 1.6, H * 0.3, H * 1.4, 0.8, 0);
    },
    probe() {
      let points = 0;
      let segments = 0;
      let maxGap = 0;
      for (let ribbon = 0; ribbon < MAX_RIBBONS; ribbon++) {
        const count = ribbonCount[ribbon]!;
        const base = ribbon * RIBBON_POINTS;
        const head = ribbonHead[ribbon]!;
        points += count;
        for (let i = 1; i < count; i++) {
          const b = (base + ((head + i) % RIBBON_POINTS)) * R_STRIDE;
          if (r[b + R_LINK] === 0) continue;
          const a = (base + ((head + i - 1) % RIBBON_POINTS)) * R_STRIDE;
          segments++;
          maxGap = Math.max(maxGap, Math.hypot(r[b]! - r[a]!, r[b + 1]! - r[a + 1]!, r[b + 2]! - r[a + 2]!));
        }
      }
      return { points, maxGap, segments };
    },
    proxies() {
      // Programs are keyed on the instancing and the instance colour, so the
      // proxies carry both; their geometry is their own, because the warm-up
      // disposes what it is handed.
      const puffProxy = new THREE.InstancedMesh(puffGeo.clone(), puffMat, 1);
      puffProxy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
      const debrisProxy = new THREE.InstancedMesh(debrisGeo.clone(), debrisMat, 1);
      debrisProxy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
      const foamProxyGeo = new THREE.BufferGeometry();
      foamProxyGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1e-3, 0, 0, 0, 0, 1e-3]), 3));
      foamProxyGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
      return [puffProxy, debrisProxy, new THREE.Mesh(foamProxyGeo, foamMat)];
    },
  };
  return effects;
}

/** The foam disc's corners, once. */
const COS = Float64Array.from({ length: DISC_SIDES }, (_, k) => Math.cos((k / DISC_SIDES) * Math.PI * 2));
const SIN = Float64Array.from({ length: DISC_SIDES }, (_, k) => Math.sin((k / DISC_SIDES) * Math.PI * 2));

function p3(array: Float64Array, offset: number, x: number, y: number, z: number): void {
  array[offset] = x;
  array[offset + 1] = y;
  array[offset + 2] = z;
}

/**
 * A unit quaternion's rotation, times `scale`, into nine (or with `scale`, the
 * upper three columns of sixteen) column-major slots at `offset`. A rotation
 * has determinant +1 and the scale is positive, so what is written is never a
 * reflection — the one thing an instance matrix may not be (the ink draws a
 * mirrored hull as a solid blob). The check script holds every matrix the
 * pools write to that.
 */
function writeRotation(out: Float64Array | Float32Array, offset: number, q: THREE.Quaternion, scale?: number): void {
  const { x, y, z, w } = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const s = scale ?? 1;
  // Three columns, three rows each; a 4x4 when scaled, packed nine otherwise.
  const stride = scale === undefined ? 3 : 4;
  out[offset] = (1 - (yy + zz)) * s;
  out[offset + 1] = (xy + wz) * s;
  out[offset + 2] = (xz - wy) * s;
  out[offset + stride] = (xy - wz) * s;
  out[offset + stride + 1] = (1 - (xx + zz)) * s;
  out[offset + stride + 2] = (yz + wx) * s;
  out[offset + 2 * stride] = (xz + wy) * s;
  out[offset + 2 * stride + 1] = (yz - wx) * s;
  out[offset + 2 * stride + 2] = (1 - (xx + yy)) * s;
  if (stride === 4) {
    out[offset + 3] = 0;
    out[offset + 7] = 0;
    out[offset + 11] = 0;
    out[offset + 15] = 1;
  }
}

/** Uploads only the first `count` numbers of an attribute this frame. */
function markRange(attribute: THREE.BufferAttribute, count: number): void {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count);
  attribute.needsUpdate = true;
}
