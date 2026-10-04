import * as THREE from 'three';
import { PLANET_RADIUS } from './globe.ts';
import { PALETTE, createToonRamp } from './theme.ts';
import { assemble, craftContext, craftMaterial, loft, soupOf } from './craft/build.ts';
import type { Station } from './craft/build.ts';
import {
  CRUISER_KINDS,
  DOLPHIN_SLOT,
  WHALE_SLOT,
  podCellOf,
  podIn,
  roundAt,
  seaDepthAt,
} from './sea-floor.ts';
import type { Cruiser, CruiserKind, Pod, School, TileLife } from './sea-floor.ts';
import { hash3 } from './weather.ts';
import { proxyOf } from './warm.ts';
import { shadeByClouds } from './cloud-shade.ts';

/**
 * What swims: schools of fish over the reef and the kelp, the odd shark, ray
 * and turtle, dolphins that pass and jump, and a whale now and then far out.
 *
 * **Nothing here is stored or random**, as nothing in `ambient.ts` is. The
 * schools and the big swimmers belong to the floor's tiles (`tileLife` in
 * `sea-floor.ts`) and where each is at an instant is a pure function of its
 * seed and the sky's clock (`roundAt`); the dolphins and the whales are passes
 * decided by a coarse cell and a slot of time (`podIn`). So two players at the
 * same reef see the same fish in the same places, and a pod of dolphins
 * crossing one's bow crosses the other's.
 *
 * **A fish is not a boid, and it looks like one.** A school is a centre on a
 * lazy round and its fish hold places about it that turn with it, each on a
 * wobble of its own; nothing asks its neighbours anything, which is what makes
 * a hundred and sixty of them cost less than a tenth of a millisecond.
 *
 * **Draw calls**: the fish, one instanced mesh without ink — a fish is a
 * couple of pixels and the pen would be all of it; each kind of big swimmer
 * its own instanced mesh, inked with the craft's material, and hidden when
 * none of its kind is near, which is nearly always; and the bubbles, one
 * `Points`. Near only, capped, allocated once.
 */

/** Where things are seen from, in units from the camera. */
const FISH_RANGE = 110;
const CRUISER_RANGE = 170;
const DOLPHIN_RANGE = 450;
const WHALE_RANGE = 1600;
/** Caps. */
const MAX_FISH = 180;
const MAX_CRUISERS = 6;
const MAX_DOLPHINS = 12;
const MAX_WHALES = 2;
const MAX_BUBBLES = 96;

/** A dolphin's leap: how often, how long it is in the air, and how high. */
const LEAP_EVERY = 3.6;
const LEAP_TIME = 1.1;
const LEAP_HEIGHT = 2.6;
/** How deep a dolphin cruises between leaps. */
const DOLPHIN_DEPTH = 1.8;
/** A whale's breath: how long a cycle, how much of it at the surface, how deep it sounds. */
const WHALE_CYCLE = 44;
const WHALE_UP = 14;
const WHALE_SOUND = 16;

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const POD_KINDS = ['dolphin', 'whale'] as const;

// ---------------------------------------------------------------------------
// The shapes
// ---------------------------------------------------------------------------

/**
 * A small fish, facing +Z, half a unit long: a diamond body and a forked
 * tail. The tail's vertices carry `aTail`, which the vertex shader swings by.
 */
function fishGeometry(): THREE.BufferGeometry {
  const p: number[] = [];
  const tail: number[] = [];
  const nose = [0, 0, 0.3];
  const back = [0, 0, -0.18];
  const ring = [[0, 0.11, 0.02], [0.06, 0, 0.02], [0, -0.08, 0.02], [-0.06, 0, 0.02]];
  for (let k = 0; k < 4; k++) {
    const a = ring[k]!;
    const b = ring[(k + 1) % 4]!;
    p.push(...nose, ...b, ...a);
    p.push(...back, ...a, ...b);
    tail.push(0, 0, 0, 0.35, 0, 0);
  }
  // The tail: two blades off the wrist, a fork.
  p.push(0, 0, -0.16, 0, 0.13, -0.38, 0, 0.01, -0.3);
  p.push(0, 0, -0.16, 0, -0.01, -0.3, 0, -0.12, -0.37);
  tail.push(0.4, 1, 0.8, 0.4, 0.8, 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('aTail', new THREE.Float32BufferAttribute(tail, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function fishMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ gradientMap: createToonRamp(4), side: THREE.DoubleSide });
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uFishTime'] = fishTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTail;\nuniform float uFishTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  transformed.x += sin(uFishTime * 11.0 + float(gl_InstanceID) * 1.7) * aTail * 0.09;`,
      );
  };
  material.customProgramCacheKey = () => 'atlas-fish';
  return shadeByClouds(material);
}

const fishTime: THREE.IUniform<number> = { value: 0 };

/** The body built by a craft file's helpers, as one inked geometry. */
function soupGeometry(name: string, group: THREE.Group): THREE.BufferGeometry {
  const built = assemble(name, [soupOf(group)]);
  const body = built.getObjectByName('body') as THREE.Mesh;
  return body.geometry;
}

/** A streamlined body: sections of an ellipse along +Z, `stations` as [z, half-width, top, bottom]. */
function body(stations: readonly (readonly [number, number, number, number])[], color: number, sides = 8): THREE.Mesh {
  const lofted: Station[] = stations.map(([z, half, top, bottom]) => ({
    z,
    ring: Array.from({ length: sides }, (_, k) => {
      const a = (k / sides) * Math.PI * 2;
      const s = Math.sin(a);
      return [Math.cos(a) * half, s >= 0 ? s * top : s * bottom] as [number, number];
    }),
  }));
  return loft(lofted, color);
}

/** A flat fin from `root` to `tip`, as a thin box. */
function fin(root: THREE.Vector3, tip: THREE.Vector3, chord: number, color: number): THREE.Mesh {
  const ctx = craftContext();
  return ctx.strut(root, tip, chord, color);
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** A palette colour a shade off, which is every colour a craft's helpers take. */
const toned = (colour: number, factor: number): number => craftContext().tone(colour, factor);

function sharkGeometry(): THREE.BufferGeometry {
  const g = new THREE.Group();
  const grey = toned(PALETTE.steel, 1.3);
  g.add(body([[-2.1, 0.05, 0.08, 0.05], [-1.4, 0.24, 0.3, 0.22], [-0.2, 0.42, 0.5, 0.36], [0.9, 0.36, 0.42, 0.3], [1.7, 0.16, 0.2, 0.14], [2.1, 0.03, 0.04, 0.03]], grey));
  g.add(fin(V(0, 0.4, -0.1), V(0, 1.25, -0.55), 0.12, grey));
  g.add(fin(V(0, 0.05, -2.0), V(0, 0.95, -2.5), 0.1, grey));
  g.add(fin(V(0, 0.0, -2.0), V(0, -0.6, -2.35), 0.1, grey));
  for (const side of [-1, 1]) g.add(fin(V(side * 0.3, -0.15, 0.3), V(side * 1.1, -0.45, -0.2), 0.1, grey));
  return soupGeometry('shark', g);
}

function rayGeometry(): THREE.BufferGeometry {
  const g = new THREE.Group();
  const sand = toned(PALETTE.brown, 0.85);
  // A wide flat diamond: the ring is broad and thin, the stations short.
  g.add(body([[-0.9, 0.2, 0.06, 0.04], [-0.3, 1.1, 0.14, 0.08], [0.3, 1.2, 0.16, 0.08], [0.9, 0.18, 0.06, 0.04]], sand, 6));
  g.add(fin(V(0, 0.02, -0.9), V(0, 0.04, -2.6), 0.05, toned(PALETTE.brown, 0.6)));
  return soupGeometry('ray', g);
}

function turtleGeometry(): THREE.BufferGeometry {
  const g = new THREE.Group();
  const shell = toned(PALETTE.olive, 0.62);
  const skin = toned(PALETTE.green, 0.9);
  g.add(body([[-0.8, 0.3, 0.2, 0.08], [-0.3, 0.62, 0.42, 0.14], [0.35, 0.6, 0.42, 0.14], [0.85, 0.28, 0.18, 0.08]], shell, 8));
  g.add(body([[0.8, 0.12, 0.12, 0.1], [1.2, 0.13, 0.13, 0.1], [1.4, 0.08, 0.08, 0.07]], skin, 6));
  for (const side of [-1, 1]) {
    g.add(fin(V(side * 0.45, 0, 0.45), V(side * 1.25, -0.05, 0.1), 0.12, skin));
    g.add(fin(V(side * 0.4, 0, -0.5), V(side * 0.8, -0.05, -0.85), 0.1, skin));
  }
  return soupGeometry('turtle', g);
}

function dolphinGeometry(): THREE.BufferGeometry {
  const g = new THREE.Group();
  const blue = toned(PALETTE.slate, 0.95);
  g.add(body([[-1.7, 0.06, 0.08, 0.06], [-1.1, 0.22, 0.28, 0.22], [-0.1, 0.36, 0.42, 0.34], [0.8, 0.3, 0.36, 0.3], [1.3, 0.13, 0.16, 0.12], [1.75, 0.06, 0.06, 0.05]], blue));
  g.add(fin(V(0, 0.38, 0.05), V(0, 0.95, -0.4), 0.1, blue));
  // The flukes, flat across the tail.
  g.add(fin(V(-0.05, 0, -1.65), V(-0.65, 0.02, -2.05), 0.08, blue));
  g.add(fin(V(0.05, 0, -1.65), V(0.65, 0.02, -2.05), 0.08, blue));
  for (const side of [-1, 1]) g.add(fin(V(side * 0.25, -0.18, 0.5), V(side * 0.75, -0.4, 0.15), 0.08, blue));
  return soupGeometry('dolphin', g);
}

function whaleGeometry(): THREE.BufferGeometry {
  const g = new THREE.Group();
  const slate = toned(PALETTE.steel, 0.95);
  g.add(body([[-9, 0.3, 0.35, 0.3], [-6, 1.3, 1.5, 1.2], [-1, 2.3, 2.6, 2.2], [3.5, 2.2, 2.4, 2.1], [7, 1.5, 1.4, 1.5], [9, 0.5, 0.4, 0.5]], slate, 10));
  g.add(fin(V(-0.3, 0, -8.8), V(-3.6, 0.1, -10.8), 0.35, slate));
  g.add(fin(V(0.3, 0, -8.8), V(3.6, 0.1, -10.8), 0.35, slate));
  g.add(fin(V(0, 2.2, -4), V(0, 3.0, -5.2), 0.3, slate));
  for (const side of [-1, 1]) g.add(fin(V(side * 1.8, -1.2, 3), V(side * 4.2, -2.1, 1.2), 0.3, slate));
  return soupGeometry('whale', g);
}

/** A soft round dot, for the bubbles and the spout. */
function dotTexture(): THREE.DataTexture {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
      const ring = d > 1 ? 0 : d > 0.7 ? 1 : 0.35 + 0.4 * d;
      const o = (y * size + x) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = Math.round(ring * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/** A school's colours by where it lives: the reef is bright, the cold water silver. */
const SCHOOL_COLOURS: Readonly<Record<School['zone'], readonly number[]>> = {
  reef: [PALETTE.gold, PALETTE.skyBlue, PALETTE.orange, PALETTE.violet, 0x4fd1c5, PALETTE.pink, PALETTE.apricot],
  meadow: [PALETTE.bone, 0xa9b4b8, PALETTE.olive, 0x8fa7b3],
  kelp: [PALETTE.bone, 0x9aa7ad, PALETTE.orange, 0x7b8a8f],
  barren: [PALETTE.bone, 0x8f9aa0],
};

// ---------------------------------------------------------------------------
// The swimmers
// ---------------------------------------------------------------------------

export interface SeaLifeFrame {
  /** The camera, world position. */
  camera: THREE.Vector3;
  /** The sky's clock, seconds: what every client agrees on. */
  seconds: number;
  /** Where a diver's head is, for his bubbles, or null. */
  diver: THREE.Vector3 | null;
  /** Where a submerged submarine's screw is, for its bubbles, and how fast it goes; or null. */
  screw: THREE.Vector3 | null;
  screwSpeed: number;
}

export interface SeaLifeStats {
  enabled: boolean;
  fish: number;
  schools: number;
  cruisers: number;
  dolphins: number;
  whales: number;
  bubbles: number;
  calls: number;
  updateMs: number;
}

export interface SeaLife {
  group: THREE.Group;
  enabled: boolean;
  readonly stats: SeaLifeStats;
  update(dt: number, frame: SeaLifeFrame, tiles: (visit: (life: TileLife) => void) => void): void;
  /** Every swimmer's position, rounded and sorted: the same clock gives the same list. */
  snapshot(): string[];
  proxies(): THREE.Object3D[];
}

export interface SeaLifeOptions {
  /** A splash on the water at a point, `reach` units across (`effects.splashAt`). */
  splash?(point: THREE.Vector3, reach: number): void;
}

export function createSeaLife(options: SeaLifeOptions = {}): SeaLife {
  const group = new THREE.Group();
  group.name = 'sea life';

  const fish = new THREE.InstancedMesh(fishGeometry(), fishMaterial(), MAX_FISH);
  fish.name = 'fish';
  fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fish.setColorAt(0, new THREE.Color());
  fish.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  fish.frustumCulled = false;
  fish.count = 0;
  group.add(fish);

  const cruiserMeshes: Record<CruiserKind, THREE.InstancedMesh> = {
    shark: new THREE.InstancedMesh(sharkGeometry(), craftMaterial(), MAX_CRUISERS),
    ray: new THREE.InstancedMesh(rayGeometry(), craftMaterial(), MAX_CRUISERS),
    turtle: new THREE.InstancedMesh(turtleGeometry(), craftMaterial(), MAX_CRUISERS),
  };
  const dolphins = new THREE.InstancedMesh(dolphinGeometry(), craftMaterial(), MAX_DOLPHINS);
  const whales = new THREE.InstancedMesh(whaleGeometry(), craftMaterial(), MAX_WHALES);
  const big = [...CRUISER_KINDS.map((kind) => cruiserMeshes[kind]), dolphins, whales];
  for (const mesh of big) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    group.add(mesh);
  }
  CRUISER_KINDS.forEach((kind) => (cruiserMeshes[kind].name = kind));
  dolphins.name = 'dolphins';
  whales.name = 'whales';

  // The bubbles: a ring of particles, each born somewhere and rising.
  const bubblePosition = new Float32Array(MAX_BUBBLES * 3);
  const bubbleVelocity = new Float32Array(MAX_BUBBLES * 3);
  const bubbleAge = new Float32Array(MAX_BUBBLES).fill(Infinity);
  const bubbleLife = new Float32Array(MAX_BUBBLES).fill(1);
  const bubbleGeometry = new THREE.BufferGeometry();
  const bubbleAttribute = new THREE.BufferAttribute(bubblePosition, 3);
  bubbleAttribute.setUsage(THREE.DynamicDrawUsage);
  bubbleGeometry.setAttribute('position', bubbleAttribute);
  const bubbleMaterial = new THREE.PointsMaterial({
    size: 0.45,
    map: dotTexture(),
    transparent: true,
    depthWrite: false,
    color: 0xeaf8ff,
    opacity: 0.85,
  });
  bubbleMaterial.userData.outlineParameters = { visible: false };
  const bubbles = new THREE.Points(bubbleGeometry, bubbleMaterial);
  bubbles.name = 'bubbles';
  bubbles.frustumCulled = false;
  group.add(bubbles);
  let nextBubble = 0;

  const stats: SeaLifeStats = { enabled: true, fish: 0, schools: 0, cruisers: 0, dolphins: 0, whales: 0, bubbles: 0, calls: 0, updateMs: 0 };

  // Scratch, so a frame allocates nothing.
  const home = new THREE.Vector3();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  const at = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  const placeSide = new THREE.Vector3();
  const placeUp = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const heading = new THREE.Vector3();
  const eye = new THREE.Vector3();
  /** The frame's clock and camera, for `visitTile`. */
  let now = 0;
  const podEye = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const scaled = new THREE.Matrix4();
  const colour = new THREE.Color();
  const round = { e: 0, n: 0, lift: 0 };
  const roundAhead = { e: 0, n: 0, lift: 0 };
  const axis = new THREE.Vector3();
  const podStart = new THREE.Vector3();
  const podHeading = new THREE.Vector3();
  const splashAt = new THREE.Vector3();
  /** What swam this frame, for `snapshot`: a kind each and three numbers each, kept rather than formatted. */
  const seenKinds: string[] = [];
  const seenAt: number[] = [];
  const saw = (kind: string, where: THREE.Vector3): void => {
    seenKinds.push(kind);
    seenAt.push(where.x, where.y, where.z);
  };
  let fishCount = 0;
  let schoolCount = 0;
  const bigCount: Record<string, number> = {};
  /**
   * Each dolphin's last height over the surface and the frame it was taken
   * on, as pairs by its place in its pod, to see it break the water. Kept by
   * the animal and not by its instance: the instances are handed out afresh
   * every frame in the order the pods are met, so a slot's last height was
   * often another dolphin's, and a splash fell where nothing leapt.
   */
  const dolphinWas = new WeakMap<Pod, Float64Array>();
  let podFrame = 0;

  /** Unit east and north at a unit direction. */
  function frameAt(unit: THREE.Vector3): void {
    north.set(0, 1, 0).projectOnPlane(unit);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(unit);
    north.normalize();
    east.crossVectors(north, unit).normalize();
  }

  /**
   * An instance's matrix: at `position`, nose along `forward`, back towards
   * `upward`, scaled by `size`. `side = up x forward` makes the basis
   * right-handed, which is asserted: a reflected instance draws as a blob of
   * ink.
   */
  function place(mesh: THREE.InstancedMesh, index: number, position: THREE.Vector3, fwd: THREE.Vector3, upward: THREE.Vector3, size: number): void {
    placeSide.crossVectors(upward, fwd).normalize();
    placeUp.crossVectors(fwd, placeSide).normalize();
    matrix.makeBasis(placeSide, placeUp, fwd);
    scaled.makeScale(size, size, size);
    matrix.multiply(scaled).setPosition(position);
    if (!(matrix.determinant() > 0)) throw new Error('sea life: a swimmer\'s basis would be mirrored');
    mesh.setMatrixAt(index, matrix);
  }

  /** A swimmer on its round about `home` (unit), at depth `depth` under the sea's radius. */
  function onRound(seed: number, roam: number, speed: number, t: number, depth: number, lift: number): void {
    roundAt(seed, roam, speed, t, round);
    roundAt(seed, roam, speed, t + 0.25, roundAhead);
    at.copy(home).addScaledVector(east, round.e / PLANET_RADIUS).addScaledVector(north, round.n / PLANET_RADIUS).normalize();
    ahead.copy(home).addScaledVector(east, roundAhead.e / PLANET_RADIUS).addScaledVector(north, roundAhead.n / PLANET_RADIUS).normalize();
    const radius = PLANET_RADIUS - depth + round.lift * lift;
    const radiusAhead = PLANET_RADIUS - depth + roundAhead.lift * lift;
    at.multiplyScalar(radius);
    ahead.multiplyScalar(radiusAhead);
    forward.subVectors(ahead, at);
    if (forward.lengthSq() < 1e-10) forward.copy(east);
    forward.normalize();
  }

  function bubble(from: THREE.Vector3, rise: number, spread: number, life: number): void {
    const i = nextBubble;
    nextBubble = (nextBubble + 1) % MAX_BUBBLES;
    up.copy(from).normalize();
    bubblePosition[i * 3] = from.x + (Math.random() - 0.5) * spread;
    bubblePosition[i * 3 + 1] = from.y + (Math.random() - 0.5) * spread;
    bubblePosition[i * 3 + 2] = from.z + (Math.random() - 0.5) * spread;
    bubbleVelocity[i * 3] = up.x * rise + (Math.random() - 0.5) * 0.3;
    bubbleVelocity[i * 3 + 1] = up.y * rise + (Math.random() - 0.5) * 0.3;
    bubbleVelocity[i * 3 + 2] = up.z * rise + (Math.random() - 0.5) * 0.3;
    bubbleAge[i] = 0;
    bubbleLife[i] = life;
  }

  let diverClock = 0;
  let screwClock = 0;
  const spoutClock = new Float32Array(MAX_WHALES);

  const life: SeaLife = {
    group,
    enabled: true,
    stats,
    update(dt, frame, tiles) {
      const began = performance.now();
      stats.enabled = life.enabled;
      group.visible = life.enabled;
      if (!life.enabled) return;
      fishTime.value = frame.seconds % 1000;
      now = frame.seconds;
      eye.copy(frame.camera);
      fishCount = 0;
      schoolCount = 0;
      for (const kind of CRUISER_KINDS) bigCount[kind] = 0;
      bigCount.dolphin = 0;
      bigCount.whale = 0;
      seenKinds.length = 0;
      seenAt.length = 0;

      tiles(visitTile);
      fish.count = fishCount;
      // As the big swimmers below: no school, no draw and no upload, which
      // is every frame away from a reef — two calls, fill and ink, and 13 KB
      // sent to the GPU for nothing.
      fish.visible = fishCount > 0;
      if (fishCount > 0) {
        fish.instanceMatrix.needsUpdate = true;
        if (fish.instanceColor !== null) fish.instanceColor.needsUpdate = true;
      }

      pods(frame, now, dt);

      for (const mesh of big) {
        const count = mesh === dolphins ? bigCount.dolphin! : mesh === whales ? bigCount.whale! : bigCount[mesh.name]!;
        mesh.count = count;
        mesh.visible = count > 0;
        if (count > 0) mesh.instanceMatrix.needsUpdate = true;
      }

      // The diver's breath, and a submarine's screw.
      if (frame.diver !== null) {
        diverClock -= dt;
        if (diverClock <= 0) {
          diverClock = 1.4 + Math.random() * 0.8;
          for (let k = 0; k < 4; k++) bubble(frame.diver, 1.6 + Math.random(), 0.25, 3);
        }
      }
      if (frame.screw !== null && frame.screwSpeed > 0.5) {
        screwClock -= dt * Math.min(4, frame.screwSpeed / 4);
        if (screwClock <= 0) {
          screwClock = 0.12;
          bubble(frame.screw, 1.2, 0.6, 2.2);
        }
      }
      let alive = 0;
      for (let i = 0; i < MAX_BUBBLES; i++) {
        const age = bubbleAge[i]! + dt;
        if (age === Infinity) continue;
        bubbleAge[i] = age;
        const o = i * 3;
        at.set(bubblePosition[o]!, bubblePosition[o + 1]!, bubblePosition[o + 2]!);
        // A bubble that reaches the surface, or outlives itself, is gone.
        if (bubbleAge[i]! > bubbleLife[i]! || at.length() > PLANET_RADIUS + 0.3 + (bubbleLife[i]! < 1.5 ? 8 : 0)) {
          bubbleAge[i] = Infinity;
          bubblePosition[o] = bubblePosition[o + 1] = bubblePosition[o + 2] = 0;
          continue;
        }
        bubblePosition[o] = at.x + bubbleVelocity[o]! * dt;
        bubblePosition[o + 1] = at.y + bubbleVelocity[o + 1]! * dt;
        bubblePosition[o + 2] = at.z + bubbleVelocity[o + 2]! * dt;
        alive++;
      }
      if (alive > 0) bubbleAttribute.needsUpdate = true;
      bubbles.visible = alive > 0;

      stats.fish = fishCount;
      stats.schools = schoolCount;
      stats.cruisers = (bigCount.shark ?? 0) + (bigCount.ray ?? 0) + (bigCount.turtle ?? 0);
      stats.dolphins = bigCount.dolphin ?? 0;
      stats.whales = bigCount.whale ?? 0;
      stats.bubbles = alive;
      let calls = (fishCount > 0 ? 1 : 0) + (alive > 0 ? 1 : 0);
      for (const mesh of big) if (mesh.visible) calls++;
      stats.calls = calls;
      stats.updateMs = performance.now() - began;
    },
    snapshot() {
      return seenKinds
        .map((kind, i) => `${kind} ${seenAt[i * 3]!.toFixed(3)},${seenAt[i * 3 + 1]!.toFixed(3)},${seenAt[i * 3 + 2]!.toFixed(3)}`)
        .sort();
    },
    proxies() {
      // Programs are keyed on the instancing and the instance colour, and a
      // point sprite is not a mesh, so each proxy is drawn the way its
      // swimmers are; the geometry is the proxy's own, since the warm-up
      // disposes what it is handed.
      const fishProxy = new THREE.InstancedMesh(proxyOf(fish.material as THREE.Material).geometry, fish.material, 1);
      fishProxy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3);
      const bigProxy = new THREE.InstancedMesh(proxyOf(dolphins.material as THREE.Material).geometry, dolphins.material, 1);
      const bubbleProxy = new THREE.BufferGeometry();
      bubbleProxy.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      return [fishProxy, bigProxy, new THREE.Points(bubbleProxy, bubbleMaterial)];
    },
  };

  /** One tile's schools and big swimmers, as they are at `now` from `eye`. */
  function visitTile(tile: TileLife): void {
    const t = now;
    const camera = eye;
    for (const school of tile.schools) {
      home.set(school.x, school.y, school.z);
      at.copy(home).multiplyScalar(PLANET_RADIUS - school.swim);
      if (at.distanceTo(camera) > FISH_RANGE + school.roam) continue;
      if (fishCount + 1 > MAX_FISH) break;
      schoolCount++;
      frameAt(home);
      onRound(school.seed, school.roam, school.speed, t, school.swim, Math.min(1.5, school.swim * 0.2));
      // The floor where the school is now, not where it lives: a round
      // that crosses a rise keeps over it.
      const local = seaDepthAt(at);
      at.setLength(clamp(at.length(), PLANET_RADIUS - local + 0.9, PLANET_RADIUS - 0.8));
      centre.copy(at);
      heading.copy(forward);
      const palette = SCHOOL_COLOURS[school.zone];
      colour.setHex(palette[Math.floor(school.tone * palette.length) % palette.length]!);
      const spread = 1.2 + school.count * 0.09;
      up.copy(centre).normalize();
      side.crossVectors(up, heading).normalize();
      for (let k = 0; k < school.count && fishCount < MAX_FISH; k++) {
        // A place in the school: a flattened ball about the centre, each
        // fish wobbling on its own and turned a little off the school's
        // heading as it does.
        const a = hash3(school.seed, k, 1) * Math.PI * 2;
        const r = spread * Math.sqrt(hash3(school.seed, k, 2));
        const wob = t * (1.3 + hash3(school.seed, k, 3)) + a;
        const lateral = Math.cos(a) * r + Math.sin(wob) * 0.25;
        const along = Math.sin(a) * r + Math.cos(wob * 0.7) * 0.25;
        const high = (hash3(school.seed, k, 4) - 0.5) * spread * 0.5 + Math.sin(wob * 1.1) * 0.15;
        ahead.copy(centre).addScaledVector(side, lateral).addScaledVector(heading, along).addScaledVector(up, high);
        // Kept in the water: under the surface and over the floor.
        const radius = ahead.length();
        const ceiling = PLANET_RADIUS - 0.5;
        const floor = PLANET_RADIUS - local + 0.4;
        ahead.setLength(clamp(radius, floor, ceiling));
        forward.copy(heading).addScaledVector(side, Math.sin(wob) * 0.25).normalize();
        place(fish, fishCount, ahead, forward, up, 1 + 0.35 * hash3(school.seed, k, 5));
        fish.setColorAt(fishCount, colour);
        fishCount++;
      }
      saw('school', centre);
    }
    for (const cruiser of tile.cruisers) swimCruiser(cruiser, camera, t);
  }

  function swimCruiser(cruiser: Cruiser, camera: THREE.Vector3, t: number): void {
    const mesh = cruiserMeshes[cruiser.kind];
    const index = bigCount[cruiser.kind]!;
    if (index >= MAX_CRUISERS) return;
    home.set(cruiser.x, cruiser.y, cruiser.z);
    at.copy(home).multiplyScalar(PLANET_RADIUS - cruiser.swim);
    if (at.distanceTo(camera) > CRUISER_RANGE + cruiser.roam) return;
    frameAt(home);
    onRound(cruiser.seed, cruiser.roam, cruiser.speed, t, cruiser.swim, cruiser.kind === 'ray' ? 0.3 : 1.2);
    // Kept over the floor it swims over, and under the surface.
    const floor = PLANET_RADIUS - seaDepthAt(at) + (cruiser.kind === 'ray' ? 0.35 : 1.2);
    at.setLength(clamp(at.length(), floor, PLANET_RADIUS - 1.2));
    up.copy(at).normalize();
    place(mesh, index, at, forward, up, 1);
    bigCount[cruiser.kind] = index + 1;
    saw(cruiser.kind, at);
  }

  /** The dolphins and the whales passing near the camera now. */
  function pods(frame: SeaLifeFrame, t: number, dt: number): void {
    const camera = frame.camera;
    podEye.copy(camera).normalize();
    podFrame++;
    for (const kind of POD_KINDS) {
      const slotLength = kind === 'dolphin' ? DOLPHIN_SLOT : WHALE_SLOT;
      const slot = Math.floor(t / slotLength);
      const cell = podCellOf(kind, podEye.x, podEye.y, podEye.z);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const pod = podIn(kind, cell.row + dr, cell.col + dc, slot);
          if (pod === null) continue;
          if (t < pod.from || t > pod.from + pod.length) continue;
          if (kind === 'dolphin') swimDolphins(pod, t, camera);
          else swimWhale(pod, t, camera, dt);
        }
      }
    }
  }

  /** Where a pod's lead is at `t`: along the great circle it set out on. */
  function podAt(pod: Pod, t: number): void {
    podStart.set(pod.x, pod.y, pod.z);
    podHeading.set(pod.hx, pod.hy, pod.hz);
    axis.crossVectors(podStart, podHeading).normalize();
    const travelled = (pod.speed * (t - pod.from)) / PLANET_RADIUS;
    at.copy(podStart).applyAxisAngle(axis, travelled);
    forward.copy(podHeading).applyAxisAngle(axis, travelled).normalize();
  }

  function swimDolphins(pod: Pod, t: number, camera: THREE.Vector3): void {
    podAt(pod, t);
    home.copy(at);
    heading.copy(forward);
    up.copy(home);
    side.crossVectors(up, heading).normalize();
    let was = dolphinWas.get(pod);
    if (was === undefined) {
      was = new Float64Array(pod.count * 2).fill(NaN);
      dolphinWas.set(pod, was);
    }
    for (let k = 0; k < pod.count; k++) {
      const index = bigCount.dolphin!;
      if (index >= MAX_DOLPHINS) return;
      // Abreast and a little staggered, each leaping on a clock of its own.
      const lateral = (k - (pod.count - 1) / 2) * 3.2 + Math.sin(t * 0.5 + k) * 0.6;
      const behind = (k % 2) * 2.5 + hash3(pod.seed, k, 1) * 2;
      const phase = ((t + hash3(pod.seed, k, 2) * LEAP_EVERY) % LEAP_EVERY) / LEAP_EVERY;
      const leapShare = LEAP_TIME / LEAP_EVERY;
      let height = -DOLPHIN_DEPTH + Math.sin(t * 1.3 + k) * 0.3;
      let climb = 0;
      if (phase < leapShare) {
        // A parabola from under the surface, over it, and back in.
        const u = phase / leapShare;
        height = -DOLPHIN_DEPTH * 0.5 + (LEAP_HEIGHT + DOLPHIN_DEPTH * 0.5) * 4 * u * (1 - u);
        climb = (LEAP_HEIGHT + DOLPHIN_DEPTH * 0.5) * 4 * (1 - 2 * u);
      } else {
        const u = (phase - leapShare) / (1 - leapShare);
        climb = -Math.sin(u * Math.PI * 2) * 0.4;
      }
      at.copy(home)
        .addScaledVector(side, lateral / PLANET_RADIUS)
        .addScaledVector(heading, -behind / PLANET_RADIUS)
        .normalize();
      const upHere = splashAt.copy(at);
      at.multiplyScalar(PLANET_RADIUS + height);
      // Out and back in, judged against its own height a frame ago: one not
      // seen last frame (out of range, past the cap) has nothing to compare.
      const broke = was[k * 2 + 1] === podFrame - 1 && (was[k * 2]! < 0) !== (height < 0);
      was[k * 2] = height;
      was[k * 2 + 1] = podFrame;
      if (at.distanceTo(camera) > DOLPHIN_RANGE) continue;
      // Nose up out of the water and down into it: the arc's own slope.
      forward.copy(heading).multiplyScalar(pod.speed).addScaledVector(upHere, climb).normalize();
      place(dolphins, index, at, forward, upHere, 1);
      // A splash where it breaks the surface.
      if (broke && options.splash !== undefined && at.distanceTo(camera) < 250) {
        options.splash(splashAt.multiplyScalar(PLANET_RADIUS + 0.5), 2.2);
      }
      bigCount.dolphin = index + 1;
      saw('dolphin', at);
    }
  }

  function swimWhale(pod: Pod, t: number, camera: THREE.Vector3, dt: number): void {
    const index = bigCount.whale!;
    if (index >= MAX_WHALES) return;
    podAt(pod, t);
    const upHere = home.copy(at);
    // Up to breathe, then down: the back awash at the surface, the tail
    // rising as it sounds.
    const cycle = ((t - pod.from + hash3(pod.seed, 1, 1) * WHALE_CYCLE) % WHALE_CYCLE);
    let depth: number;
    let pitch = 0;
    if (cycle < WHALE_UP) {
      depth = 1.2 + Math.sin((cycle / WHALE_UP) * Math.PI * 3) * 0.2;
    } else {
      const u = (cycle - WHALE_UP) / (WHALE_CYCLE - WHALE_UP);
      depth = 1.2 + WHALE_SOUND * Math.sin(u * Math.PI);
      pitch = -Math.cos(u * Math.PI) * 0.28;
    }
    at.multiplyScalar(PLANET_RADIUS - depth);
    if (at.distanceTo(camera) > WHALE_RANGE) return;
    forward.addScaledVector(upHere, pitch).normalize();
    place(whales, index, at, forward, upHere, 1);
    bigCount.whale = index + 1;
    // The spout, every few seconds while it is up.
    if (cycle < WHALE_UP) {
      spoutClock[index] = (spoutClock[index] ?? 0) - dt;
      if (spoutClock[index]! <= 0) {
        spoutClock[index] = 4;
        ahead.copy(at).addScaledVector(forward, 5).setLength(PLANET_RADIUS + 1.5);
        for (let k = 0; k < 14; k++) bubble(ahead, 5 + Math.random() * 3, 0.8, 1.2);
      }
    }
    saw('whale', at);
  }

  return life;
}
