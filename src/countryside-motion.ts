import * as THREE from 'three';
import type { SceneryContext } from './scenery/contract.ts';
import { BEACON_STRIDE, ROTOR_STRIDE, SMOKE_STRIDE } from './countryside-tile.ts';
import type { CountryMotionRows } from './countryside-tile.ts';
import type { SmokeVisitor } from './effects.ts';
import { FIRE_STRIDE } from './lights.ts';
import { BEAM_REACH, MAX_BEAMS, createBeams } from './countryside-motion/beams.ts';
import { createNearest } from './countryside-motion/nearest.ts';
import { MAX_ROTORS, createRotors } from './countryside-motion/rotors.ts';

/**
 * What moves in the country: the sails of the mills, the turbines' blades
 * and the windpumps' wheels, a lighthouse's beam sweeping round after dark,
 * and the smoke off a campfire.
 *
 * A merged mesh cannot move and a moving mesh cannot merge, so none of it
 * is in the tiles that hold the mills and the lighthouses: the two finest
 * levels hand their rotors, lamps and fires over as rows of numbers
 * (`countryside-tile.ts`), and this draws them. Two meshes, whatever is
 * standing: every rotor near the camera rewritten into one buffer a frame
 * (`MAX_ROTORS` of them, nearest first), and every beam into another,
 * un-inked and additive, lit by the terminator where each lighthouse stands
 * (`nightAt`, the windows' own rule). The smoke is the effects' puffs
 * (`effects.ts`), handed each fire near enough to see.
 *
 * Nothing allocates in `update`: the candidates are kept in fixed arrays and
 * the buffers are written in place. The parts live in `countryside-motion/`.
 */

export { MAX_BEAMS, MAX_ROTORS };

/** No further than this from the camera: a sail at twice it is a few pixels. */
const ROTOR_REACH = 1800;
/** Fires whose smoke rises: the effects keep their own reach under this. */
const SMOKE_REACH = 700;
/**
 * How far under a campfire's smoke its flame's heart is: the smoke leaves at
 * 0.7 over the base (`campfire` in `countryside-kit.ts`) and the tallest
 * flame is 0.8 tall from 0.1, so its middle is about 0.35 lower.
 */
const FIRE_HEART = 0.35;

export interface CountryMotionStats {
  rotors: number;
  beams: number;
  smokes: number;
  triangles: number;
  updateMs: number;
}

export interface CountryMotionSource {
  motion(visit: (rows: CountryMotionRows) => void): void;
}

export interface CountryMotion {
  group: THREE.Group;
  stats: CountryMotionStats;
  /** Every frame: what turns turned, the beams swept, and which fires are near. */
  update(dt: number, eye: THREE.Vector3, source: CountryMotionSource): void;
  /** For `effects.setSmokers`: every fire near the camera, its mouth and its up. */
  smokers(visit: SmokeVisitor): void;
  /**
   * The campfires within `reach` of the last `update`'s eye, nearest first,
   * at most `max`, into `out` as `lights.ts`'s `setFires` reads them (`x, y,
   * z, distance, phase`, `FIRE_STRIDE` floats each): the heart of the flame,
   * and a phase of its own so no two flicker together. Returns how many.
   */
  fires(out: Float32Array, max: number, reach: number): number;
  /** One mesh per program, for `warm.ts`. */
  proxies(): THREE.Object3D[];
}

export function createCountryMotion(ctx: Pick<SceneryContext, 'THREE' | 'box' | 'column' | 'taper' | 'tone'>): CountryMotion {
  const group = new THREE.Group();
  group.name = 'country-motion';

  const nearRotors = createNearest(MAX_ROTORS);
  const nearBeams = createNearest(MAX_BEAMS);
  const rotors = createRotors(ctx, nearRotors);
  const beams = createBeams(nearBeams);
  group.add(rotors.mesh);
  group.add(beams.mesh);
  let smokeSource: CountryMotionSource | null = null;

  const eyeAt = new THREE.Vector3();
  const visitRows = (rows: CountryMotionRows): void => {
    const r = rows.rotors;
    for (let o = 0; o < r.length; o += ROTOR_STRIDE) {
      const dx = r[o]! - eyeAt.x;
      const dy = r[o + 1]! - eyeAt.y;
      const dz = r[o + 2]! - eyeAt.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d > ROTOR_REACH * ROTOR_REACH) continue;
      nearRotors.offer(r, o, d);
    }
    const b = rows.beacons;
    for (let o = 0; o < b.length; o += BEACON_STRIDE) {
      const dx = b[o]! - eyeAt.x;
      const dy = b[o + 1]! - eyeAt.y;
      const dz = b[o + 2]! - eyeAt.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d > BEAM_REACH * BEAM_REACH) continue;
      nearBeams.offer(b, o, d);
    }
  };

  let clock = 0;
  const stats: CountryMotionStats = { rotors: 0, beams: 0, smokes: 0, triangles: 0, updateMs: 0 };
  const mark = (attribute: THREE.BufferAttribute, vertices: number): void => {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, vertices * attribute.itemSize);
    attribute.needsUpdate = true;
  };
  /** The visitor `smokers` walks the tiles with, and what it hands on to. */
  let smokeVisit: SmokeVisitor | null = null;
  let smokeCount = 0;
  const visitSmokes = (rows: CountryMotionRows): void => {
    const f = rows.smokes;
    for (let o = 0; o < f.length; o += SMOKE_STRIDE) {
      const dx = f[o]! - eyeAt.x;
      const dy = f[o + 1]! - eyeAt.y;
      const dz = f[o + 2]! - eyeAt.z;
      if (dx * dx + dy * dy + dz * dz > SMOKE_REACH * SMOKE_REACH) continue;
      mouth.set(f[o]!, f[o + 1]!, f[o + 2]!);
      smokeUp.set(f[o + 3]!, f[o + 4]!, f[o + 5]!);
      smokeVisit!(mouth, smokeUp);
      smokeCount++;
    }
  };

  /** What `fires` walks the tiles with: the nearest so far, kept sorted, in `fireOut`. */
  let fireOut: Float32Array = new Float32Array(0);
  let fireMax = 0;
  let fireReach = 0;
  let fireCount = 0;
  const visitFires = (rows: CountryMotionRows): void => {
    const f = rows.smokes;
    for (let o = 0; o < f.length; o += SMOKE_STRIDE) {
      // The heart of the flame, under where its smoke leaves it.
      const x = f[o]! - f[o + 3]! * FIRE_HEART;
      const y = f[o + 1]! - f[o + 4]! * FIRE_HEART;
      const z = f[o + 2]! - f[o + 5]! * FIRE_HEART;
      const distance = Math.hypot(x - eyeAt.x, y - eyeAt.y, z - eyeAt.z);
      if (distance > fireReach) continue;
      // Insertion into the sorted few: past the last of a full list, nothing.
      let at = fireCount;
      while (at > 0 && fireOut[(at - 1) * FIRE_STRIDE + 3]! > distance) at--;
      if (at >= fireMax) continue;
      const last = Math.min(fireCount, fireMax - 1);
      fireOut.copyWithin((at + 1) * FIRE_STRIDE, at * FIRE_STRIDE, last * FIRE_STRIDE);
      const w = at * FIRE_STRIDE;
      fireOut[w] = x;
      fireOut[w + 1] = y;
      fireOut[w + 2] = z;
      fireOut[w + 3] = distance;
      // Off where it stands, so a fire keeps its own beat however it arrives.
      fireOut[w + 4] = (Math.abs(Math.sin(f[o]! * 0.137 + f[o + 1]! * 0.271 + f[o + 2]! * 0.419)) * 1e4) % (Math.PI * 2);
      fireCount = Math.min(fireCount + 1, fireMax);
    }
  };

  return {
    group,
    stats,
    fires(out, max, reach) {
      if (smokeSource === null) return 0;
      fireOut = out;
      fireMax = Math.min(max, Math.floor(out.length / FIRE_STRIDE));
      fireReach = reach;
      fireCount = 0;
      smokeSource.motion(visitFires);
      return fireCount;
    },
    update(dt, eye, source) {
      const began = performance.now();
      clock += dt;
      beams.setTime(clock % 3600);
      eyeAt.copy(eye);
      smokeSource = source;
      nearRotors.clear();
      nearBeams.clear();
      source.motion(visitRows);
      // Written round the camera, so a float carries millimetres, not the planet's radius.
      rotors.mesh.position.copy(eye);
      beams.mesh.position.copy(eye);
      const rotorVertices = rotors.write(clock);
      rotors.show(rotorVertices);
      if (rotorVertices > 0) for (const attribute of rotors.attributes) mark(attribute, rotorVertices);
      const beamVerticesUsed = beams.write(clock);
      beams.show(beamVerticesUsed);
      if (beamVerticesUsed > 0) for (const attribute of beams.attributes) mark(attribute, beamVerticesUsed);
      stats.rotors = nearRotors.count;
      stats.beams = beams.lighthouses();
      stats.triangles = (rotorVertices + beamVerticesUsed) / 3;
      stats.updateMs = Math.round((performance.now() - began) * 1000) / 1000;
    },
    smokers(visit) {
      if (smokeSource === null) return;
      smokeVisit = visit;
      smokeCount = 0;
      smokeSource.motion(visitSmokes);
      stats.smokes = smokeCount;
    },
    proxies() {
      const proxyGeometry = new THREE.BufferGeometry();
      proxyGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      proxyGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
      proxyGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(1), 3));
      proxyGeometry.setAttribute('outlineNormal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
      const beamProxy = new THREE.BufferGeometry();
      beamProxy.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
      for (const name of ['beamApex', 'beamAxis', 'beamShape']) beamProxy.setAttribute(name, new THREE.BufferAttribute(new Float32Array(12), 4));
      return [new THREE.Mesh(proxyGeometry, rotors.material), new THREE.Mesh(beamProxy, beams.material)];
    },
  };
}

const mouth = new THREE.Vector3();
const smokeUp = new THREE.Vector3();
