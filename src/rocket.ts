/**
 * A rocket on its pad: the way off a world.
 *
 * Walk up to one, `E` gets in, and **`Space` held** lights it: the engine
 * coughs and builds, smoke rolls out across the pad, the ground shakes, and
 * when the ignition is full the clamps let go and it climbs — slowly, then
 * faster, the flame and a column of smoke under it — with the camera on the
 * ground beside the pad watching it go, until it is high enough that the
 * curtain comes down and the world hands you back to the solar system. Let
 * go of `Space` before the ignition is full and it dies down again; `E` gets
 * out at any moment before it leaves the pad.
 *
 * **Nobody owns one and none is ever used up.** A launch is the player's own:
 * nothing goes on the wire, and the rocket that left is back on its pad the
 * next time the world is built — which, for whoever launched it, is the next
 * visit. Online, every player sees every pad full. The ones nobody boards
 * launch on their own now and then (`autolaunch`), which is the sight a pad
 * is there for: a column of smoke going up beyond the next town.
 *
 * Code-built, as the monuments are — primitives on the world's ramp, inked —
 * and drawn in separate meshes, because it moves; the pad and the tower beside
 * it stay. The exhaust is `effects.ts`'s puffs (`Effects.plume`), the sound is
 * synthesised here: a roar of filtered noise over a low rumble, crackle on
 * top, rising with the thrust and falling away with the distance.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from './theme.ts';
import { AVATAR_HEIGHT } from './stature.ts';
import type { Effects } from './effects.ts';

const H = AVATAR_HEIGHT;
/** The rocket from the pad to the tip of the nose: six and a half bodies. */
export const ROCKET_HEIGHT = H * 6.5;
/** Its body's radius. */
const BODY = H * 0.62;
/** The pad's radius and how high it stands: a step, not a wall. */
const PAD = BODY * 3.4;
const PAD_TOP = 0.35;
/** How far the pad's drum reaches under its seat: the fall across it a slope can have. */
export const PAD_FOOT = 4;
/** The pad's radius, for whoever seats it on the ground. */
export const PAD_RADIUS = PAD;
/** The wall a parked rocket and its tower are to a body, units round the rocket's axis. */
export const ROCKET_WALL = BODY * 2.9;
/** How near a body has to be to get in. */
export const ROCKET_REACH = ROCKET_WALL + 4;
/** The keep-clear a town gives a pad, units: the pad and a margin. */
export const ROCKET_CLEAR = PAD + 3;
/** Seconds of `Space` held from cold to lift-off; and how fast a released ignition dies, a second. */
const IGNITION_TIME = 2.2;
const IGNITION_DECAY = 0.9;
/** The climb: the acceleration at lift-off and how it grows, units a second squared and per second. */
const LIFT_ACCEL = 4;
const LIFT_JERK = 11;
/** How high the climb goes before the curtain starts to fall, and how long the curtain takes. */
const CURTAIN_AT = 420;
const CURTAIN_SECONDS = 0.7;
/** How high an unmanned launch climbs before it is gone, and how long its pad stands empty. */
const AUTO_GONE = 1800;
const AUTO_EMPTY = [40, 90] as const;
/** A sound past this is not heard, units. */
const EARSHOT = 2600;
/**
 * Where the lens watches a launch from, in rocket heights off the pad: out
 * along the pad's side (`up x ahead`, away from the tower) and along its
 * `ahead`, the porthole's way. Earth turns a pad so this lands on open ground
 * (`watchHeading`).
 */
const WATCH_SIDE = 1.3;
const WATCH_AHEAD = 0.6;

/** Where the bell's mouth is over the vehicle's base. */
const BELL_MOUTH = PAD_TOP + 0.3;

export type RocketState = 'parked' | 'boarded' | 'flying' | 'gone';

export interface Rocket {
  /** The pad, the tower and the vehicle, oriented to the ground: add it to the scene. */
  readonly object: THREE.Group;
  /** The pad's centre on the ground. */
  readonly position: THREE.Vector3;
  /** Where the seated body is, in the world: what the streamers and the others follow. */
  readonly seat: THREE.Vector3;
  readonly state: RocketState;
  /** 0 cold to 1 ready to lift. */
  readonly ignition: number;
  /** How high the vehicle is over the pad, units. */
  readonly height: number;
  /** 0 to 1: how far the curtain is down over a launch the player is riding. */
  readonly curtain: number;
  /** Takes a body in; it is hidden while inside. */
  board(body: THREE.Object3D): void;
  /** Lets it out beside the pad again; only before lift-off. Returns where to stand, or null. */
  leave(out: THREE.Vector3): boolean;
  /** One step: `hold` is `Space` held by whoever is in it. */
  update(dt: number, hold: boolean, listener: THREE.Vector3, effects: Effects | null, sound: RocketSound | null): void;
  /** The lens, while the player rides it: on the ground beside the pad, watching it go. */
  frame(camera: THREE.PerspectiveCamera, dt: number): void;
  /** Nobody in it: lights itself and goes, if it is on its pad. */
  autolaunch(): boolean;
  /** Back on the pad, cold. */
  reset(): void;
  /** Its roar let go, now: a rocket put away mid-launch fades for a moment, and is not heard doing it. */
  silence(): void;
  dispose(): void;
}

/** The page's audio, as `WorldHost.sound` and `Audio.output` hand it. */
export interface RocketSound {
  context: AudioContext;
  node: AudioNode;
}

/* --- the model ------------------------------------------------------------ */

interface Kit {
  materials: Map<number, THREE.MeshToonMaterial>;
  geometries: Map<string, THREE.BufferGeometry>;
  /** Each assembly's pieces merged by colour (`assemble`), once a ramp. */
  assemblies: Map<string, { color: number; geometry: THREE.BufferGeometry }[]>;
}

/** Materials by colour, one set a ramp: every rocket on a world shares them. */
const kits = new WeakMap<THREE.Texture, Kit>();

function kitFor(gradientMap: THREE.Texture): Kit {
  let kit = kits.get(gradientMap);
  if (kit === undefined) {
    kit = { materials: new Map(), geometries: new Map(), assemblies: new Map() };
    kits.set(gradientMap, kit);
  }
  return kit;
}

function paint(kit: Kit, gradientMap: THREE.Texture, color: number): THREE.MeshToonMaterial {
  let material = kit.materials.get(color);
  if (material === undefined) {
    material = new THREE.MeshToonMaterial({ color, gradientMap });
    material.userData.outlineParameters = { thickness: 0.004, color: [0.11, 0.02, 0.01] };
    kit.materials.set(color, material);
  }
  return material;
}

/** A shape made once a ramp and shared by every rocket on it. */
function shape(kit: Kit, key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geometry = kit.geometries.get(key);
  if (geometry === undefined) {
    geometry = make();
    kit.geometries.set(key, geometry);
  }
  return geometry;
}

/** One piece of an assembly: a shape, its colour, and where it stands, turned about +y. */
interface Piece {
  geometry: THREE.BufferGeometry;
  color: number;
  matrix: THREE.Matrix4;
}

function part(pieces: Piece[], geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number, turn = 0): void {
  // A turn about +y and a move: a rotation, determinant +1.
  pieces.push({ geometry, color, matrix: new THREE.Matrix4().makeRotationY(turn).setPosition(x, y, z) });
}

/**
 * An assembly — the vehicle, or the pad and its tower — as one mesh a
 * colour: its pieces merged by colour once a ramp (`Kit.assemblies`), and
 * every rocket drawing the same few shapes. Piece by piece a rocket was 24
 * meshes, 48 draws with the ink's pass; Earth stands several within sight of
 * a crowded delta's airstrips, and merged it is 9. A merged mesh is still
 * hulled per triangle, so every piece keeps its line.
 */
function assemble(kit: Kit, gradientMap: THREE.Texture, key: string, make: () => Piece[]): THREE.Group {
  let colours = kit.assemblies.get(key);
  if (colours === undefined) {
    const byColour = new Map<number, THREE.BufferGeometry[]>();
    for (const piece of make()) {
      const placed = (piece.geometry.index !== null ? piece.geometry.toNonIndexed() : piece.geometry.clone()).applyMatrix4(piece.matrix);
      // Position and normal only: the ramp needs nothing else, and the shapes disagree on the rest.
      for (const name of Object.keys(placed.attributes)) if (name !== 'position' && name !== 'normal') placed.deleteAttribute(name);
      let list = byColour.get(piece.color);
      if (list === undefined) byColour.set(piece.color, (list = []));
      list.push(placed);
    }
    colours = [];
    for (const [color, list] of byColour) {
      const geometry = mergeGeometries(list)!;
      for (const one of list) one.dispose();
      kit.geometries.set(`${key}:${color}`, geometry);
      colours.push({ color, geometry });
    }
    kit.assemblies.set(key, colours);
  }
  const g = new THREE.Group();
  for (const { color, geometry } of colours) {
    const mesh = new THREE.Mesh(geometry, paint(kit, gradientMap, color));
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

/** The vehicle, its base at the origin, +y up, +z the side its porthole faces. */
function buildVehicle(kit: Kit, gradientMap: THREE.Texture): THREE.Group {
  return assemble(kit, gradientMap, 'vehicle', () => {
    const g: Piece[] = [];
    const white = PALETTE.white;
    const red = PALETTE.red;
    const steel = PALETTE.steel;
    const glass = PALETTE.slate;
    const bellHeight = H * 0.45;
    const bodyFrom = BELL_MOUTH + bellHeight;
    const bodyHeight = ROCKET_HEIGHT * 0.66;
    const noseHeight = ROCKET_HEIGHT - bodyFrom - bodyHeight;
    // Twelve sides: a curve's segments are chosen by how many ink lines it
    // should carry, and twelve reads as round without hatching it.
    const bell = shape(kit, 'bell', () => new THREE.CylinderGeometry(BODY * 0.42, BODY * 0.7, bellHeight, 12, 1, true));
    const body = shape(kit, 'body', () => new THREE.CylinderGeometry(BODY, BODY, bodyHeight, 12));
    // A band stands `PROUD` of the body, or the pen draws no line round it.
    const band = shape(kit, 'band', () => new THREE.CylinderGeometry(BODY + 0.08, BODY + 0.08, H * 0.3, 12));
    const nose = shape(kit, 'nose', () => new THREE.ConeGeometry(BODY, noseHeight, 12));
    const port = shape(kit, 'port', () => new THREE.CylinderGeometry(BODY * 0.32, BODY * 0.32, 0.3, 12).rotateX(Math.PI / 2));
    // A fin swept back from the body: its root up the side, its tip out and
    // down to the pad, as a sounding rocket's are. Drawn in the fin's own
    // plane and turned so its span runs along +z, the way it is set out.
    const fin = shape(kit, 'fin', () => {
      const outline = new THREE.Shape();
      outline.moveTo(0, H * 1.9);
      outline.lineTo(0, H * 0.1);
      outline.lineTo(BODY * 0.95, -H * 0.05);
      outline.lineTo(BODY * 0.95, H * 0.6);
      outline.closePath();
      const made = new THREE.ExtrudeGeometry(outline, { depth: 0.3, bevelEnabled: false });
      made.translate(0, 0, -0.15);
      return made.rotateY(-Math.PI / 2);
    });
    const ring = shape(kit, 'ring', () => new THREE.CylinderGeometry(BODY * 0.5, BODY * 0.5, H * 0.12, 12));
    const mast = shape(kit, 'mast', () => new THREE.CylinderGeometry(0.06, 0.06, H * 0.7, 5));
    part(g, bell, steel, 0, BELL_MOUTH + bellHeight / 2, 0);
    part(g, body, white, 0, bodyFrom + bodyHeight / 2, 0);
    part(g, band, red, 0, bodyFrom + bodyHeight * 0.18, 0);
    part(g, band, red, 0, bodyFrom + bodyHeight * 0.86, 0);
    part(g, nose, red, 0, bodyFrom + bodyHeight + noseHeight / 2, 0);
    part(g, port, glass, 0, bodyFrom + bodyHeight * 0.7, BODY + 0.05);
    for (let k = 0; k < 4; k++) {
      const turn = (k / 4) * Math.PI * 2 + Math.PI / 4;
      part(g, fin, red, Math.sin(turn) * BODY * 0.92, PAD_TOP + H * 0.1, Math.cos(turn) * BODY * 0.92, turn);
    }
    // The nozzle's throat ring, and a whip of an antenna off the nose's shoulder.
    part(g, ring, steel, 0, BELL_MOUTH + bellHeight + H * 0.02, 0);
    part(g, mast, steel, BODY * 0.55, bodyFrom + bodyHeight + noseHeight * 0.25 + H * 0.3, 0);
    return g;
  });
}

/** The pad and its tower: still, standing on the ground at the origin. */
function buildPad(kit: Kit, gradientMap: THREE.Texture): THREE.Group {
  return assemble(kit, gradientMap, 'pad', () => {
    const g: Piece[] = [];
    const steel = PALETTE.steel;
    const bone = PALETTE.bone;
    const red = PALETTE.red;
    // Sunk `PAD_FOOT` into the ground, so a pad seated on the highest ground
    // under it (`PAD_RADIUS`) has no gap under its downhill edge.
    const towerHeight = ROCKET_HEIGHT * 0.86;
    const deck = shape(kit, 'deck', () => new THREE.CylinderGeometry(PAD, PAD * 1.06, PAD_TOP + PAD_FOOT, 16));
    // A lattice, not a slab: four legs, a ring of girders a level and a cross
    // of braces on every face between them, merged into one shape.
    const tower = shape(kit, 'tower', () => lattice(H * 0.9, towerHeight, 7));
    const tank = shape(kit, 'tank', () => new THREE.SphereGeometry(H * 0.55, 12, 8));
    const tankLegs = shape(kit, 'tank-legs', () => new THREE.CylinderGeometry(H * 0.42, H * 0.5, H * 0.6, 8));
    const light = shape(kit, 'light', () => new THREE.BoxGeometry(H * 0.32, H * 0.2, H * 0.14));
    const pole = shape(kit, 'pole', () => new THREE.CylinderGeometry(0.09, 0.12, H * 2.4, 5));
    const arm = shape(kit, 'arm', () => new THREE.BoxGeometry(BODY * 1.6, H * 0.18, H * 0.3));
    const cap = shape(kit, 'cap', () => new THREE.BoxGeometry(H * 0.75, H * 0.25, H * 0.75));
    part(g, deck, bone, 0, PAD_TOP - (PAD_TOP + PAD_FOOT) / 2, 0);
    const x = -(BODY + H * 0.9);
    part(g, tower, steel, x, 0, 0);
    part(g, cap, red, x, towerHeight + H * 0.12, 0);
    for (const at of [0.35, 0.62, 0.84]) part(g, arm, red, x + BODY * 0.85, towerHeight * at, 0);
    // A propellant tank on its stand behind the tower, and two floodlights
    // across the pad from it, aimed at the vehicle.
    part(g, tankLegs, steel, x - H * 0.2, PAD_TOP + H * 0.3, PAD * 0.62);
    part(g, tank, PALETTE.white, x - H * 0.2, PAD_TOP + H * 1.05, PAD * 0.62);
    for (const side of [-1, 1]) {
      const px = PAD * 0.62;
      const pz = side * PAD * 0.55;
      part(g, pole, steel, px, PAD_TOP + H * 1.2, pz);
      // Its face (+Z) toward the vehicle on the pad's axis.
      part(g, light, PALETTE.gold, px - H * 0.12, PAD_TOP + H * 2.45, pz, Math.atan2(-px, -pz));
    }
    return g;
  });
}

/**
 * A square lattice tower `width` across and `height` tall, its feet at y = 0:
 * four legs, a ring of girders at each of `levels`, and an X of braces on
 * every face of every level, as one geometry.
 */
function lattice(width: number, height: number, levels: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const half = width / 2;
  const leg = 0.2;
  const rod = 0.09;
  const step = height / levels;
  /** A bar from a to b, square in section. */
  const bar = (a: THREE.Vector3, b: THREE.Vector3, thick: number): void => {
    const length = a.distanceTo(b);
    const geometry = new THREE.BoxGeometry(thick, length, thick);
    const middle = a.clone().add(b).multiplyScalar(0.5);
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    geometry.applyMatrix4(new THREE.Matrix4().compose(middle, turn, new THREE.Vector3(1, 1, 1)));
    parts.push(geometry);
  };
  const corners = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ] as const;
  for (const [cx, cz] of corners) bar(new THREE.Vector3(cx, 0, cz), new THREE.Vector3(cx, height, cz), leg);
  for (let level = 0; level <= levels; level++) {
    const y = level * step;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k]!;
      const [bx, bz] = corners[(k + 1) % 4]!;
      bar(new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz), rod * 1.4);
      if (level === levels) continue;
      bar(new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y + step, bz), rod);
      bar(new THREE.Vector3(bx, y, bz), new THREE.Vector3(ax, y + step, az), rod);
    }
  }
  const merged = mergeGeometries(parts)!;
  for (const one of parts) one.dispose();
  return merged;
}

/* --- the sound ------------------------------------------------------------- */

interface Roar {
  gain: GainNode;
  low: BiquadFilterNode;
  crackle: GainNode;
  rumble: GainNode;
  sources: AudioScheduledSourceNode[];
}

/**
 * Two seconds of the roar's noise, made once a context and shared by every
 * roar: 96,000 random samples on the main thread each time one came into
 * earshot was a stall, and every frame while it was being rebuilt.
 */
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(context: AudioContext): AudioBuffer {
  const kept = noises.get(context);
  if (kept !== undefined) return kept;
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  // Brown noise, integrated white: the roar is in the low end.
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  noises.set(context, buffer);
  return buffer;
}

/** Whether two ways out are the same: by what they are, not by the object carrying them. */
const sameSound = (a: RocketSound | null, b: RocketSound | null): boolean =>
  a === b || (a !== null && b !== null && a.context === b.context && a.node === b.node);

function startRoar(sound: RocketSound): Roar {
  const { context, node } = sound;
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(node);
  const buffer = noiseBuffer(context);
  const roar = context.createBufferSource();
  roar.buffer = buffer;
  roar.loop = true;
  const low = context.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 180;
  roar.connect(low).connect(gain);
  // The crackle: the same noise high-passed and gated hard, so it spits.
  const crack = context.createBufferSource();
  crack.buffer = buffer;
  crack.loop = true;
  crack.playbackRate.value = 1.7;
  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1900;
  band.Q.value = 0.8;
  const crackle = context.createGain();
  crackle.gain.value = 0;
  crack.connect(band).connect(crackle).connect(gain);
  // A rumble under it all, felt more than heard.
  const hum = context.createOscillator();
  hum.type = 'triangle';
  hum.frequency.value = 38;
  const rumble = context.createGain();
  rumble.gain.value = 0;
  hum.connect(rumble).connect(gain);
  roar.start();
  crack.start();
  hum.start();
  return { gain, low, crackle, rumble, sources: [roar, crack, hum] };
}

function stopRoar(roar: Roar): void {
  const now = roar.gain.context.currentTime;
  roar.gain.gain.setTargetAtTime(0, now, 0.15);
  for (const source of roar.sources) source.stop(now + 0.8);
  window.setTimeout(() => roar.gain.disconnect(), 1000);
}

/* --- the rocket ------------------------------------------------------------ */

/** How far from the pad the lens watching a launch stands, units along the ground. */
export const WATCH_REACH = ROCKET_HEIGHT * Math.hypot(WATCH_SIDE, WATCH_AHEAD);

/**
 * The `heading` to hand `createRocket` so the lens that watches the launch
 * (`frame`) stands out along `toward` — a unit tangent at the pad, where `up`
 * is the pad's up — `WATCH_REACH` from it. The lens is at `cos a side + sin a
 * ahead` with `side = up x ahead` and `tan a = WATCH_AHEAD / WATCH_SIDE`, so
 * with `t = up x toward` the heading is `sin a toward - cos a t`: put back in,
 * `side = sin a t + cos a toward`, and the sum is `toward`.
 */
export function watchHeading(up: THREE.Vector3, toward: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const a = Math.atan2(WATCH_AHEAD, WATCH_SIDE);
  const t = new THREE.Vector3().crossVectors(up, toward);
  return out.copy(toward).multiplyScalar(Math.sin(a)).addScaledVector(t, -Math.cos(a));
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/**
 * A rocket standing at `at` (on the ground) with `up` its world's up there,
 * its porthole and its tower turned by `heading` (a tangent).
 */
export function createRocket(at: THREE.Vector3, up: THREE.Vector3, heading: THREE.Vector3, gradientMap: THREE.Texture): Rocket {
  const kit = kitFor(gradientMap);
  const object = new THREE.Group();
  object.name = 'rocket';
  const pad = buildPad(kit, gradientMap);
  const vehicle = buildVehicle(kit, gradientMap);
  object.add(pad, vehicle);
  const position = at.clone();
  const upward = up.clone().normalize();
  const ahead = heading.clone().addScaledVector(upward, -heading.dot(upward));
  if (ahead.lengthSq() < 1e-8) ahead.set(upward.y, -upward.x, 0);
  ahead.normalize();
  const side = new THREE.Vector3().crossVectors(upward, ahead).normalize();
  // +x = up x z, so x cross y = z: a rotation, determinant +1.
  const basis = new THREE.Matrix4().makeBasis(side, upward, ahead);
  console.assert(basis.determinant() > 0, 'rocket: a mirrored basis');
  object.quaternion.setFromRotationMatrix(basis);
  object.position.copy(position);

  let state: RocketState = 'parked';
  let ignition = 0;
  let height = 0;
  let speed = 0;
  let flight = 0;
  let curtain = 0;
  let manned = false;
  let emptyFor = 0;
  let passenger: THREE.Object3D | null = null;
  let roar: Roar | null = null;
  let roarOn: RocketSound | null = null;
  const carry = new Float64Array(2);
  const seat = new THREE.Vector3();
  const mouth = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const shake = new THREE.Vector3();

  function place(): void {
    vehicle.position.y = height;
    seat.copy(position).addScaledVector(upward, height + ROCKET_HEIGHT * 0.6);
  }
  place();

  function silence(): void {
    if (roar !== null) stopRoar(roar);
    roar = null;
    roarOn = null;
  }

  const rocket: Rocket = {
    object,
    position,
    seat,
    get state() {
      return state;
    },
    get ignition() {
      return ignition;
    },
    get height() {
      return height;
    },
    get curtain() {
      return curtain;
    },
    board(body) {
      if (state !== 'parked') return;
      state = 'boarded';
      manned = true;
      passenger = body;
      body.visible = false;
    },
    leave(out) {
      if (state !== 'boarded') return false;
      state = 'parked';
      manned = false;
      if (passenger !== null) passenger.visible = true;
      passenger = null;
      out.copy(position).addScaledVector(ahead, ROCKET_WALL + 1.6);
      return true;
    },
    autolaunch() {
      if (state !== 'parked') return false;
      state = 'boarded';
      manned = false;
      return true;
    },
    update(dt, hold, listener, effects, sound) {
      if (state === 'gone') {
        emptyFor -= dt;
        if (emptyFor <= 0) rocket.reset();
        return;
      }
      if (state === 'parked') {
        ignition = Math.max(0, ignition - IGNITION_DECAY * dt);
      } else if (state === 'boarded') {
        // Unmanned, the hand on the switch is the rocket's own.
        const lit = manned ? hold : true;
        ignition = lit ? Math.min(1, ignition + dt / IGNITION_TIME) : Math.max(0, ignition - IGNITION_DECAY * dt);
        if (ignition >= 1) {
          state = 'flying';
          flight = 0;
          speed = 0;
        }
      } else {
        flight += dt;
        speed += (LIFT_ACCEL + LIFT_JERK * flight) * dt;
        height += speed * dt;
        if (manned && height > CURTAIN_AT) curtain = Math.min(1, curtain + dt / CURTAIN_SECONDS);
        if (!manned && height > AUTO_GONE) {
          state = 'gone';
          object.remove(vehicle);
          emptyFor = rand(AUTO_EMPTY[0], AUTO_EMPTY[1]);
          silence();
          return;
        }
      }
      place();

      // The thrust: a cough and a build while it is held down, then all of it.
      const power = state === 'flying' ? 1 : ignition < 0.04 ? 0 : 0.2 + 0.6 * ignition;
      const flicker = state === 'boarded' ? 0.85 + 0.3 * Math.random() : 1;
      mouth.copy(position).addScaledVector(upward, height + BELL_MOUTH);
      effects?.plume(carry, mouth, upward, power * flicker, height + BELL_MOUTH, dt);

      const away = listener.distanceTo(mouth);
      const near = Math.max(0, 1 - away / EARSHOT);
      // By its context and node: Earth's frame hands a new object each time,
      // and by identity the roar was torn down and started again every frame
      // — fifty chains overlapping, none of them ever reaching its level.
      if (!sameSound(sound, roarOn)) silence();
      if (power > 0 && near > 0 && sound !== null) {
        if (roar === null) {
          roar = startRoar(sound);
          roarOn = sound;
        }
        const now = sound.context.currentTime;
        const loud = power * near * near * (manned ? 1 : 0.7);
        roar.gain.gain.setTargetAtTime(0.55 * loud, now, 0.12);
        roar.low.frequency.setTargetAtTime(160 + 900 * power * near, now, 0.2);
        roar.crackle.gain.setTargetAtTime(0.35 * power * flicker, now, 0.05);
        roar.rumble.gain.setTargetAtTime(0.5 * power, now, 0.2);
      } else if (roar !== null && (power === 0 || near === 0)) silence();
    },
    frame(camera, dt) {
      // On the ground beside the pad, off the tower's side, rising slower than
      // the rocket so it climbs up the frame and away.
      eye.copy(position)
        .addScaledVector(side, ROCKET_HEIGHT * WATCH_SIDE)
        .addScaledVector(ahead, ROCKET_HEIGHT * WATCH_AHEAD)
        .addScaledVector(upward, H * 1.6 + Math.min(height * 0.22, ROCKET_HEIGHT * 3));
      aim.copy(position).addScaledVector(upward, height + ROCKET_HEIGHT * 0.5);
      const power = state === 'flying' ? Math.max(0, 1 - height / 500) : ignition * 0.6;
      const reach = H * 0.05 * power;
      shake.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(reach);
      camera.position.copy(eye).add(shake);
      camera.up.copy(upward);
      camera.lookAt(aim);
      // Wider as it climbs, so it stays in the frame longer.
      const fov = 50 + Math.min(16, height / 20);
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
      camera.near = 0.5;
      camera.updateProjectionMatrix();
    },
    reset() {
      silence();
      state = 'parked';
      ignition = 0;
      height = 0;
      speed = 0;
      flight = 0;
      curtain = 0;
      manned = false;
      if (passenger !== null) passenger.visible = true;
      passenger = null;
      if (vehicle.parent !== object) object.add(vehicle);
      place();
    },
    silence,
    dispose() {
      silence();
      object.removeFromParent();
    },
  };
  return rocket;
}

/** Every rocket built on a ramp shares its materials and geometry: let them go with the world. */
export function disposeRockets(gradientMap: THREE.Texture): void {
  const kit = kits.get(gradientMap);
  if (kit === undefined) return;
  for (const material of kit.materials.values()) material.dispose();
  for (const geometry of kit.geometries.values()) geometry.dispose();
  kits.delete(gradientMap);
}
