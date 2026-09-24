import * as THREE from 'three';
import { PALETTE, createToonRamp } from './theme.ts';
import { AVATAR_HEIGHT } from './stature.ts';
import { PLANET_RADIUS } from './globe.ts';
import type { BiomeId } from './biome.ts';
import type { CraftKind, CraftModel, PlayerState } from './craft/contract.ts';
import { BOAT_BOOST, CAR_BOOST, PLANE_CRUISE_LOW, PLANE_ROTATE } from './vehicles.ts';

/**
 * What the world leaves behind it as it moves: a launch's wake, the rings
 * round a swimmer, a plane's trail of smoke balls, a car's exhaust and the dust
 * off its wheels, a crash's burst and its debris, the burner's flame.
 *
 * **Three pools and four draw calls, whatever is happening.** Everything here
 * is one of three things, each a fixed pool drawn as one mesh:
 *
 * - **Puffs**, an instanced ball of smoke, spray, dust or flame: a flat-shaded
 *   icosahedron on the world's four-band ramp, so a puff steps through the
 *   same cel bands as the house beside it and goes dark with it at night. A
 *   flame is a puff with `glow`, which takes its colour unlit. **No ink**: the
 *   pen is screen space, so a puff shrinking away would end as a black dot of
 *   the pen's own width, and a puff is gone by shrinking, not by fading.
 * - **Foam**, flat rings and discs lying on the sea, rewritten into one buffer
 *   every frame: a trail is a chain of discs, a wake's V the same discs
 *   emitted from the bow's shoulders with a push outward, a ripple a ring that
 *   opens and thins. A disc goes by hollowing into a ring and the ring thinning
 *   to nothing, so nothing on the water is ever see-through — a see-through
 *   fill is the ink's enemy even without a hull. Also un-inked.
 * - **Debris**, a few tumbling cubes thrown by a crash. These are inked, as
 *   the world's solid things are: two draw calls, the fill and its hull.
 *
 * **Nothing allocates per frame.** Every particle is a row of a typed array;
 * a dead one is swapped with the last live one, so the live ones are always
 * the first `count` rows and the instance count is simply that. A full pool
 * refuses a new particle and counts it (`stats.dropped`) rather than growing.
 *
 * **The meshes ride with the player.** Each frame they are placed at the
 * player's position and every particle is written relative to it, so the
 * float32 an instance matrix is stored in carries millimetres and not the
 * 16,000 units of the planet's radius.
 *
 * **Near only.** A puff lives a second or two and a disc a few, so everything
 * the player makes stays near him by construction; everything somebody else
 * makes — another player's vehicle, a boat under way in the traffic — is
 * emitted only inside `REACH` of the camera.
 */

const H = AVATAR_HEIGHT;

/** Pool sizes: the caps the whole world shares. */
export const MAX_PUFFS = 320;
export const MAX_FOAM = 640;
export const MAX_DEBRIS = 40;
/** Round a foam disc: sides, which is what the silhouette of one reads as. */
const FOAM_SIDES = 8;
/**
 * The foam's height over the sea's own sphere. The shallows ride up to 0.75
 * over it at a coast, so this clears them everywhere; `polygonOffset` does the
 * rest where the sphere's own facets bow.
 */
const FOAM_LIFT = 0.8;
const FOAM_RADIUS = PLANET_RADIUS + FOAM_LIFT;
/** How far from the camera anybody else's vehicle still leaves anything. */
const REACH = 700;
/** Gravity on spray and debris, in units a second squared: brisk, as a comic's is. */
const FALL = 30;
/** No emitter makes more than this many of anything in one frame, whatever a long frame asked. */
const FRAME_BURST = 8;
/** A move longer than this in one frame is a teleport, and nothing is laid along it. */
const JUMP = 400;

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

/** What the player just did that leaves a mark: `player.ts`'s `PlayerEvent`s, and the two foot callbacks. */
export type EffectsEvent = 'swim' | 'ashore' | 'took-off' | 'landed' | 'water-refused' | 'steep-refused' | 'crashed';

export interface EffectsStats {
  enabled: boolean;
  puffs: number;
  foam: number;
  debris: number;
  /** Particles refused by a full pool since the page loaded. */
  dropped: number;
  /** Other vehicles followed this frame. */
  tracked: number;
  /** Draw calls this frame: a pool with nothing alive is hidden. */
  calls: number;
  updateMs: number;
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
  /** A `PlayerEvent`, with its strength. */
  event(event: EffectsEvent, strength: number): void;
  /** On foot, down again after a jump or a fall, at `speed`. */
  touchdown(speed: number): void;
  /** On foot, a heel strike at `weight` times a walk. */
  step(weight: number): void;
  /** For the console: a crash, a splash, a landing's dust or a ripple where the player is. */
  burst(kind: 'crash' | 'splash' | 'dust' | 'ripple'): void;
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

// A foam disc: centre, velocity along the water, its own two axes on the
// water, age, life, start and end radius, how hollow it starts, drag.
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

const FOAM_VERTICES = FOAM_SIDES * 2;
const FOAM_INDICES = FOAM_SIDES * 6;

// Per emitter, what it carries from frame to frame: a fraction of a particle
// owed, and the distance run since the last disc or ball.
const E_EXHAUST = 0;
const E_DUST = 1;
const E_SKID = 2;
const E_SPRAY = 3;
const E_TRAIL = 4;
const E_VEE = 5;
const E_CONTRAIL = 6;
const E_FLAME = 7;
const E_RING = 8;
const E_SWIM = 9;
const E_TAXI = 10;
const E_SLOTS = 11;

// A followed vehicle: last position, frame last seen, speed and climb eased,
// and its emitter slots.
const T_LAST = 0;
const T_SEEN = 3;
const T_SPEED = 4;
const T_CLIMB = 5;
const T_SLOTS = 6;
const T_STRIDE = T_SLOTS + E_SLOTS;

/** A followed vehicle's row, and its emitter slots as a view made once. */
interface Track {
  row: Float64Array;
  slots: Float64Array;
}
function newTrack(): Track {
  const row = new Float64Array(T_STRIDE);
  return { row, slots: row.subarray(T_SLOTS) };
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

  /* --- foam ----------------------------------------------------------- */
  const foamPositions = new Float32Array(MAX_FOAM * FOAM_VERTICES * 3);
  const foamIndex = new Uint32Array(MAX_FOAM * FOAM_INDICES);
  for (let i = 0; i < MAX_FOAM; i++) {
    const base = i * FOAM_VERTICES;
    for (let k = 0; k < FOAM_SIDES; k++) {
      const next = (k + 1) % FOAM_SIDES;
      const inner = base + 2 * k;
      const outer = inner + 1;
      const inner1 = base + 2 * next;
      const outer1 = inner1 + 1;
      // Counter-clockwise seen from above: `e1 x e2` is up (see `spawnFoam`).
      foamIndex.set([inner, outer, outer1, inner, outer1, inner1], (i * FOAM_SIDES + k) * 6);
    }
  }
  const foamGeo = new THREE.BufferGeometry();
  const foamAttribute = new THREE.BufferAttribute(foamPositions, 3);
  foamAttribute.setUsage(THREE.DynamicDrawUsage);
  foamGeo.setAttribute('position', foamAttribute);
  // The disc lies on the water and its normal is the water's, written with it.
  const foamNormals = new Float32Array(MAX_FOAM * FOAM_VERTICES * 3);
  const foamNormal = new THREE.BufferAttribute(foamNormals, 3);
  foamNormal.setUsage(THREE.DynamicDrawUsage);
  foamGeo.setAttribute('normal', foamNormal);
  foamGeo.setIndex(new THREE.BufferAttribute(foamIndex, 1));
  foamGeo.setDrawRange(0, 0);
  const foamMat = new THREE.MeshToonMaterial({
    color: PALETTE.white,
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
  const f = new Float64Array(MAX_FOAM * F_STRIDE);
  let foamCount = 0;

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

  const stats: EffectsStats = { enabled: true, puffs: 0, foam: 0, debris: 0, dropped: 0, tracked: 0, calls: 0, updateMs: 0 };
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
  let speedAlong = 0;
  let climb = 0;
  let turnRate = 0;
  let accel = 0;
  let paved = true;
  let dust: number | null = null;
  const mine = new Float64Array(E_SLOTS);
  let others: ((visit: OtherVisitor) => void) | null = null;

  /** Followed vehicles, by object; their rows come from `trackFree` and go back to it. */
  const tracks = new Map<THREE.Object3D, Track>();
  const trackFree: Track[] = [];

  // Scratch.
  const right = new THREE.Vector3();
  const at = new THREE.Vector3();
  const vel = new THREE.Vector3();
  /** The emitter's own velocity, which the particles inherit a share of: never the scratch they are written into. */
  const motion = new THREE.Vector3();
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
    p[o + P_POS] = pos.x; p[o + P_POS + 1] = pos.y; p[o + P_POS + 2] = pos.z;
    p[o + P_VEL] = v.x; p[o + P_VEL + 1] = v.y; p[o + P_VEL + 2] = v.z;
    p[o + P_UP] = up.x; p[o + P_UP + 1] = up.y; p[o + P_UP + 2] = up.z;
    p[o + P_AGE] = 0;
    p[o + P_LIFE] = life;
    p[o + P_S0] = s0;
    p[o + P_S1] = s1;
    p[o + P_HOLD] = hold;
    const color = linearOf(hex);
    p[o + P_COLOR] = color.r; p[o + P_COLOR + 1] = color.g; p[o + P_COLOR + 2] = color.b;
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
  function spawnFoam(pos: THREE.Vector3, v: THREE.Vector3, life: number, r0: number, r1: number, ring: number, drag: number): void {
    if (foamCount >= MAX_FOAM) {
      stats.dropped++;
      return;
    }
    const o = foamCount++ * F_STRIDE;
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

  /* --- where on a vehicle ---------------------------------------------- */

  /** A point in a vehicle's frame — `x` to its right, `y` up, `z` forward — into `out`. */
  function local(origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(origin).addScaledVector(side, x).addScaledVector(up, y).addScaledVector(fwd, z);
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

  /** Particles owed at `rate` a second over `dt`, carried in `slots[slot]`. */
  function owed(slots: Float64Array, slot: number, rate: number, dt: number): number {
    const due = slots[slot]! + rate * dt;
    const whole = Math.min(FRAME_BURST, Math.floor(due));
    slots[slot] = due - Math.floor(due);
    return whole;
  }

  /** Discs or balls owed for `run` more units at one every `spacing`, carried in `slots[slot]`. */
  function spaced(slots: Float64Array, slot: number, run: number, spacing: number): number {
    const due = slots[slot]! + run / spacing;
    const whole = Math.min(FRAME_BURST, Math.floor(due));
    slots[slot] = due - Math.floor(due);
    return whole;
  }

  /* --- what each kind leaves ------------------------------------------- */

  /**
   * A boat's wake: a chain of discs off the stern that spread and hollow out
   * behind it, the V — smaller discs off the bow's shoulders pushed outward, so
   * the chain from each side angles away — and at speed, spray thrown up off
   * the bow and falling back.
   */
  function wake(slots: Float64Array, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3, speed: number, run: number, length: number, width: number, dt: number): void {
    if (speed < 1.5) return;
    const k = clamp(speed / BOAT_BOOST, 0, 1);
    const spacing = Math.max(width * 0.4, speed * 0.05);
    for (let n = spaced(slots, E_TRAIL, run, spacing); n > 0; n--) {
      local(origin, fwd, up, side, rand(-0.1, 0.1) * width, 0, -length * 0.45, at);
      vel.copy(fwd).multiplyScalar(speed * 0.15);
      spawnFoam(at, vel, 2.5 + 3 * k, Math.max(width * 0.35, spacing * 0.6), width * (0.7 + 0.6 * k), 0, 1.2);
    }
    for (let n = spaced(slots, E_VEE, run, spacing); n > 0; n--) {
      for (let hand = -1; hand <= 1; hand += 2) {
        local(origin, fwd, up, side, hand * width * 0.5, 0, length * 0.2, at);
        vel.copy(side).multiplyScalar(hand * speed * 0.2);
        spawnFoam(at, vel, 1.8 + 2 * k, width * 0.14, width * (0.3 + 0.2 * k), 0, 0.6);
      }
    }
    if (k > 0.4) {
      for (let n = owed(slots, E_SPRAY, 16 * k, dt); n > 0; n--) {
        const hand = Math.random() < 0.5 ? -1 : 1;
        local(origin, fwd, up, side, hand * width * 0.45, 0.2, length * 0.35, at);
        vel.copy(fwd).multiplyScalar(speed * 0.7).addScaledVector(side, hand * rand(3, 7) * k).addScaledVector(up, rand(4, 7));
        spawnPuff(at, vel, up, rand(0.45, 0.65), H * 0.05, H * 0.11, 0.4, PALETTE.white, 0, 1.5, -FALL);
      }
    }
  }

  /** A plane's trail: balls of smoke off the tail, larger the faster it goes, so the trail still reads from the framing a fast plane is seen at. */
  function contrail(slots: Float64Array, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3, speed: number, run: number, length: number, height: number, throttle: number): void {
    const grow = clamp(1 + (speed / PLANE_CRUISE_LOW - 1) * 0.35, 1, 8);
    const spacing = Math.max(length * 0.22, speed * 0.045) * (throttle > 0 ? 0.65 : 1);
    for (let n = spaced(slots, E_CONTRAIL, run, spacing); n > 0; n--) {
      local(origin, fwd, up, side, rand(-0.05, 0.05) * length, height * 0.35, -length * 0.55 - (n - 1) * spacing, at);
      vel.set(0, 0, 0);
      spawnPuff(at, vel, up, 2.4, length * 0.07 * grow, length * 0.13 * grow, 0.15, PALETTE.white, 0, 0, 0.6);
    }
  }

  /** A car's exhaust: a puff or two a second idling, a stream under the throttle. */
  function exhaust(slots: Float64Array, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3, speed: number, push: number, v: THREE.Vector3, length: number, width: number, height: number, dt: number): void {
    const rate = 2.5 + 12 * clamp(push / 20, 0, 1) + (Math.abs(speed) / CAR_BOOST) * 3;
    for (let n = owed(slots, E_EXHAUST, rate, dt); n > 0; n--) {
      local(origin, fwd, up, side, width * 0.28, height * 0.16, -length * 0.5, at);
      vel.copy(v).multiplyScalar(0.25).addScaledVector(fwd, -rand(1.5, 3)).addScaledVector(up, rand(0.5, 1.5));
      const hard = push > 12;
      spawnPuff(at, vel, up, rand(0.7, 1.0), H * 0.05, H * (hard ? 0.2 : 0.14), 0.35, hard ? PALETTE.bone : PALETTE.cream, 0, 2, 2.5);
    }
  }

  /** Dust off both rear wheels, or tyre smoke in a hard turn: `hex` is its colour, `rate` how much a second. */
  function wheels(slots: Float64Array, slot: number, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3, v: THREE.Vector3, length: number, width: number, rate: number, hex: number, size: number, dt: number): void {
    for (let n = owed(slots, slot, rate, dt); n > 0; n--) {
      const hand = Math.random() < 0.5 ? -1 : 1;
      local(origin, fwd, up, side, hand * width * 0.45, 0.15, -length * 0.35, at);
      vel.copy(v).multiplyScalar(0.12).addScaledVector(up, rand(1, 3));
      addAcross(up, rand(0.5, 2), vel);
      spawnPuff(at, vel, up, rand(0.9, 1.3), size * 0.4, size, 0.4, hex, 0, 1.6, 0.6);
    }
  }

  /** The burner, climbing: flame licking up from the coil into the envelope's mouth, lit by itself. */
  function flame(slots: Float64Array, origin: THREE.Vector3, up: THREE.Vector3, burner: readonly [number, number], dt: number): void {
    const [from, to] = burner;
    for (let n = owed(slots, E_FLAME, 40, dt); n > 0; n--) {
      at.copy(origin).addScaledVector(up, from);
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
    spawnFoam(at, vel, 1.1, reach * 0.35, reach, 0.72, 0);
    spawnFoam(at, vel, 1.6, reach * 0.15, reach * 0.6, 0, 0);
    for (let i = 0; i < count; i++) {
      at.copy(centre);
      addAcross(burstUp, rand(0, reach * 0.25), at);
      vel.copy(burstUp).multiplyScalar(rand(6, 11));
      addAcross(burstUp, rand(1.5, 4), vel);
      spawnPuff(at, vel, burstUp, rand(0.55, 0.8), H * 0.06, H * rand(0.1, 0.16), 0.45, PALETTE.white, 0, 1, -FALL);
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

  function playerMarks(dt: number, s: EffectsSubject): void {
    const kind = s.ride?.model.kind ?? null;
    const up = s.up;
    const fwd = s.forward;
    right.crossVectors(up, fwd).normalize();
    vel.subVectors(s.position, last);
    const run = hasLast ? vel.length() : 0;
    if (!hasLast || run > JUMP || dt <= 0) {
      last.copy(s.position);
      lastForward.copy(fwd);
      hasLast = true;
      speedAlong = 0;
      climb = 0;
      accel = 0;
      turnRate = 0;
      return;
    }
    const along = vel.dot(fwd) / dt;
    const rising = vel.dot(up) / dt;
    accel += ((along - speedAlong) / dt - accel) * Math.min(1, dt * 6);
    speedAlong = along;
    climb += (rising - climb) * Math.min(1, dt * 4);
    axis.crossVectors(lastForward, fwd);
    const turned = Math.atan2(axis.dot(up), lastForward.dot(fwd));
    turnRate += (turned / dt - turnRate) * Math.min(1, dt * 8);
    last.copy(s.position);
    lastForward.copy(fwd);
    // The velocity the particles inherit a share of, in units a second.
    motion.copy(vel).multiplyScalar(1 / dt);

    if (s.state === 'swim' && kind === null) {
      // Rings round a swimmer, closer together moving, and a little trail.
      const moving = Math.abs(along) > 1;
      for (let n = owed(mine, E_RING, moving ? 2.2 : 0.9, dt); n > 0; n--) {
        at.copy(s.position);
        spawnFoam(at, fwdAt.set(0, 0, 0), 1.6, H * 0.3, H * (moving ? 0.8 : 1.0), 0.8, 0);
      }
      if (moving) {
        for (let n = spaced(mine, E_SWIM, run, H * 0.3); n > 0; n--) {
          local(s.position, fwd, up, right, rand(-0.1, 0.1) * H, 0, -H * 0.25, at);
          spawnFoam(at, fwdAt.set(0, 0, 0), 1.3, H * 0.12, H * 0.3, 0, 0);
        }
      }
      return;
    }
    if (kind === null || s.ride === null) return;
    const model = s.ride.model;
    const [length, width, height] = model.size;
    const speed = Math.abs(along);

    if (kind === 'boat') {
      wake(mine, s.position, fwd, up, right, along, run, length, width, dt);
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
    const at = object.getWorldPosition(seen);
    let entry = tracks.get(object);
    if (entry === undefined) {
      entry = trackFree.pop() ?? newTrack();
      const track = entry.row;
      track.fill(0);
      p3(track, T_LAST, at.x, at.y, at.z);
      track[T_SEEN] = frame;
      tracks.set(object, entry);
      return;
    }
    const track = entry.row;
    track[T_SEEN] = frame;
    const dx = at.x - track[T_LAST]!, dy = at.y - track[T_LAST + 1]!, dz = at.z - track[T_LAST + 2]!;
    p3(track, T_LAST, at.x, at.y, at.z);
    const run = Math.hypot(dx, dy, dz);
    if (run > JUMP || frameDt <= 0) return;
    upAt.copy(at).normalize();
    track[T_SPEED] = track[T_SPEED]! + (run / frameDt - track[T_SPEED]!) * Math.min(1, frameDt * 4);
    const rising = (dx * upAt.x + dy * upAt.y + dz * upAt.z) / frameDt;
    track[T_CLIMB] = track[T_CLIMB]! + (rising - track[T_CLIMB]!) * Math.min(1, frameDt * 4);
    if (at.distanceTo(eye) > REACH) return;
    const speed = track[T_SPEED]!;
    object.getWorldDirection(fwdAt);
    fwdAt.addScaledVector(upAt, -fwdAt.dot(upAt)).normalize();
    rightAt.crossVectors(upAt, fwdAt).normalize();
    const slots = entry.slots;
    const length = model?.size[0] ?? H * 2;
    const width = model?.size[1] ?? H * 0.8;
    const height = model?.size[2] ?? H;
    motion.set(dx, dy, dz).multiplyScalar(1 / frameDt);
    if (kind === 'boat') wake(slots, at, fwdAt, upAt, rightAt, speed, run, length, width, frameDt);
    else if (kind === 'plane') {
      if (speed > PLANE_ROTATE * 1.05) contrail(slots, at, fwdAt, upAt, rightAt, speed, run, length, height, 0);
    } else if (kind === 'car' || kind === 'van') {
      if (speed > 0.5) exhaust(slots, at, fwdAt, upAt, rightAt, speed, 0, motion, length, width, height, frameDt);
    } else if (kind === 'balloon' && model?.burner !== undefined && track[T_CLIMB]! > 0.3) {
      flame(slots, at, upAt, model.burner, frameDt);
    }
  };

  const forget = (entry: Track, object: THREE.Object3D): void => {
    if (entry.row[T_SEEN] === frame) return;
    tracks.delete(object);
    trackFree.push(entry);
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

  function advanceFoam(dt: number): void {
    for (let i = 0; i < foamCount; i++) {
      let o = i * F_STRIDE;
      f[o + F_AGE] = f[o + F_AGE]! + dt;
      if (f[o + F_AGE]! >= f[o + F_LIFE]!) {
        foamCount--;
        if (i !== foamCount) f.copyWithin(o, foamCount * F_STRIDE, (foamCount + 1) * F_STRIDE);
        i--;
        continue;
      }
      o = i * F_STRIDE;
      const damp = Math.exp(-f[o + F_DRAG]! * dt);
      let x = f[o + F_POS]!, y = f[o + F_POS + 1]!, z = f[o + F_POS + 2]!;
      const vx = f[o + F_VEL]! * damp, vy = f[o + F_VEL + 1]! * damp, vz = f[o + F_VEL + 2]! * damp;
      f[o + F_VEL] = vx; f[o + F_VEL + 1] = vy; f[o + F_VEL + 2] = vz;
      x += vx * dt; y += vy * dt; z += vz * dt;
      // Back onto the water's sphere: a disc drifting along a tangent would
      // otherwise rise off the sea at a rate of its speed squared.
      const onto = FOAM_RADIUS / Math.hypot(x, y, z);
      x *= onto; y *= onto; z *= onto;
      f[o + F_POS] = x; f[o + F_POS + 1] = y; f[o + F_POS + 2] = z;
      const t = f[o + F_AGE]! / f[o + F_LIFE]!;
      const outer = f[o + F_R0]! + (f[o + F_R1]! - f[o + F_R0]!) * (1 - (1 - t) * (1 - t));
      const ring = f[o + F_RING]!;
      const inner = outer * Math.min(1, ring + (1 - ring) * smooth((t - 0.35) / 0.65));
      const cx = x - anchor.x, cy = y - anchor.y, cz = z - anchor.z;
      const nx = x / FOAM_RADIUS, ny = y / FOAM_RADIUS, nz = z / FOAM_RADIUS;
      const base = i * FOAM_VERTICES * 3;
      for (let k = 0; k < FOAM_SIDES; k++) {
        const cos = COS[k]!, sin = SIN[k]!;
        const dx = f[o + F_E1]! * cos + f[o + F_E2]! * sin;
        const dy = f[o + F_E1 + 1]! * cos + f[o + F_E2 + 1]! * sin;
        const dz = f[o + F_E1 + 2]! * cos + f[o + F_E2 + 2]! * sin;
        const v = base + k * 6;
        foamPositions[v] = cx + dx * inner;
        foamPositions[v + 1] = cy + dy * inner;
        foamPositions[v + 2] = cz + dz * inner;
        foamPositions[v + 3] = cx + dx * outer;
        foamPositions[v + 4] = cy + dy * outer;
        foamPositions[v + 5] = cz + dz * outer;
        foamNormals[v] = nx; foamNormals[v + 1] = ny; foamNormals[v + 2] = nz;
        foamNormals[v + 3] = nx; foamNormals[v + 4] = ny; foamNormals[v + 5] = nz;
      }
    }
    foamGeo.setDrawRange(0, foamCount * FOAM_INDICES);
    foam.visible = foamCount > 0;
    if (foamCount > 0) {
      markRange(foamAttribute, foamCount * FOAM_VERTICES * 3);
      markRange(foamNormal, foamCount * FOAM_VERTICES * 3);
    }
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
      const scale = Math.max(1e-4, size * (t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1));
      axis.set(d[o + D_AXIS]!, d[o + D_AXIS + 1]!, d[o + D_AXIS + 2]!);
      quaternion.setFromAxisAngle(axis, d[o + D_ANGLE]!);
      const m = i * 16;
      writeRotation(matrices, m, quaternion, scale);
      matrices[m + 12] = at.x - anchor.x;
      matrices[m + 13] = at.y - anchor.y;
      matrices[m + 14] = at.z - anchor.z;
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
    foamCount = 0;
    debrisCount = 0;
    puffs.count = 0;
    debris.count = 0;
    puffs.visible = false;
    debris.visible = false;
    foam.visible = false;
    foamGeo.setDrawRange(0, 0);
    mine.fill(0);
    hasLast = false;
    tracks.forEach((track) => trackFree.push(track));
    tracks.clear();
  }

  /* --- the events -------------------------------------------------------- */

  function event(name: EffectsEvent, strength: number): void {
    const s = subject;
    if (!enabled || s === null) return;
    const kind = s.ride?.model.kind ?? null;
    const size = s.ride?.model.size;
    right.crossVectors(s.up, s.forward).normalize();
    if (name === 'swim') {
      splash(s.position, s.up, H * 1.2, 10);
    } else if (name === 'crashed' && size !== undefined) {
      const ahead = speedAlong >= 0 ? 1 : -1;
      local(s.position, s.forward, s.up, right, 0, size[2] * 0.4, ahead * size[0] * 0.5, at);
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
      tracks.forEach(forget);
      stats.tracked = tracks.size;
      advancePuffs(dt);
      advanceFoam(dt);
      advanceDebris(dt);
      stats.puffs = puffCount;
      stats.foam = foamCount;
      stats.debris = debrisCount;
      stats.calls = (puffCount > 0 ? 1 : 0) + (foamCount > 0 ? 1 : 0) + (debrisCount > 0 ? 2 : 0);
      stats.updateMs = Math.round((performance.now() - began) * 1000) / 1000;
    },
    setGround(onMade, biome) {
      paved = onMade;
      dust = dustOf(biome);
    },
    setOthers(visit) {
      others = visit;
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
        local(s.position, s.forward, s.up, right, rand(-0.1, 0.1) * H, 0.05, -H * 0.1, at);
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
      else {
        at.copy(s.position);
        spawnFoam(at, fwdAt.set(0, 0, 0), 1.6, H * 0.3, H * 1.4, 0.8, 0);
      }
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
const COS = Float64Array.from({ length: FOAM_SIDES }, (_, k) => Math.cos((k / FOAM_SIDES) * Math.PI * 2));
const SIN = Float64Array.from({ length: FOAM_SIDES }, (_, k) => Math.sin((k / FOAM_SIDES) * Math.PI * 2));

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
