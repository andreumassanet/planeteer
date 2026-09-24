import * as THREE from 'three';
import { mergeMeshes } from './merge.ts';
import { createToonRamp, PALETTE } from './theme.ts';
import type { SceneryContext } from './scenery/contract.ts';
import { ROTOR_SPEED, buildRotor } from './countryside-kit.ts';
import { BEACON_STRIDE, ROTOR_KINDS, ROTOR_STRIDE, SMOKE_STRIDE } from './countryside-tile.ts';
import type { CountryMotionRows } from './countryside-tile.ts';
import type { SmokeVisitor } from './effects.ts';
import { nightAt } from './lights.ts';

/**
 * What moves in the country: the sails of the mills, the turbines' blades
 * and the windpumps' wheels, a lighthouse's beam sweeping round after dark,
 * and the smoke off a campfire.
 *
 * **A merged mesh cannot move and a moving mesh cannot merge**, so none of it
 * is in the tiles that hold the mills and the lighthouses: the two finest
 * levels hand their rotors, lamps and fires over as rows of numbers
 * (`countryside-tile.ts`), and this draws them. **Two meshes, whatever is
 * standing**: every rotor near the camera rewritten into one buffer a frame,
 * the way the birds are (`MAX_ROTORS` of them, nearest first), and every beam
 * into another, un-inked and additive, lit by the terminator where each
 * lighthouse stands (`nightAt`, the windows' own rule). The smoke is the
 * effects' puffs (`effects.ts`), handed each fire near enough to see.
 *
 * Nothing allocates in `update`: the candidates are kept in fixed arrays and
 * the buffers are written in place.
 */

/** The most rotors turned at once, nearest first; the coarser tiles hold theirs still. */
export const MAX_ROTORS = 32;
/** And no further than this from the camera: a sail at twice it is a few pixels. */
const ROTOR_REACH = 1800;
/** Lighthouses whose beams are drawn, nearest first, and how far off one still sweeps the sky. */
export const MAX_BEAMS = 6;
const BEAM_REACH = 9000;
/** A beam's length, its radius at the end, its sides and how fast it goes round (radians a second). */
const BEAM_LENGTH = 110;
const BEAM_RADIUS = 11;
const BEAM_SIDES = 8;
const BEAM_SPEED = 0.7;
/** Fires whose smoke rises: the effects keep their own reach under this. */
const SMOKE_REACH = 700;

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
  /** One mesh per program, for `warm.ts`. */
  proxies(): THREE.Object3D[];
}

interface Template {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  outline: Float32Array;
  count: number;
}

export function createCountryMotion(ctx: Pick<SceneryContext, 'THREE' | 'box' | 'column' | 'taper' | 'tone'>): CountryMotion {
  const group = new THREE.Group();
  group.name = 'country-motion';

  // --- the rotors ---------------------------------------------------------
  const templates: Template[] = ROTOR_KINDS.map((kind) => {
    const built = buildRotor(ctx, kind);
    const merged = mergeMeshes(built);
    built.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    return { ...merged, count: merged.position.length / 3 };
  });
  const widest = Math.max(...templates.map((t) => t.count));
  const capacity = MAX_ROTORS * widest;
  const rotorGeometry = new THREE.BufferGeometry();
  const rotorPosition = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
  const rotorNormal = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
  const rotorColor = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
  const rotorOutline = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3);
  for (const attribute of [rotorPosition, rotorNormal, rotorColor, rotorOutline]) attribute.setUsage(THREE.DynamicDrawUsage);
  rotorGeometry.setAttribute('position', rotorPosition);
  rotorGeometry.setAttribute('normal', rotorNormal);
  rotorGeometry.setAttribute('color', rotorColor);
  rotorGeometry.setAttribute('outlineNormal', rotorOutline);
  rotorGeometry.setDrawRange(0, 0);
  const rotorMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  rotorMaterial.userData.outlineParameters = { thickness: 0.005, color: [0.11, 0.02, 0.01], outlineNormal: true };
  const rotors = new THREE.Mesh(rotorGeometry, rotorMaterial);
  rotors.name = 'country-rotors';
  // Rewritten every frame round the camera: no bounding sphere would be true for long.
  rotors.frustumCulled = false;
  rotors.castShadow = false;
  rotors.receiveShadow = true;
  rotors.visible = false;
  group.add(rotors);

  // --- the beams ------------------------------------------------------------
  const beamVertices = MAX_BEAMS * 2 * BEAM_SIDES * 3;
  const beamGeometry = new THREE.BufferGeometry();
  const beamPosition = new THREE.BufferAttribute(new Float32Array(beamVertices * 3), 3);
  const beamColor = new THREE.BufferAttribute(new Float32Array(beamVertices * 3), 3);
  beamPosition.setUsage(THREE.DynamicDrawUsage);
  beamColor.setUsage(THREE.DynamicDrawUsage);
  beamGeometry.setAttribute('position', beamPosition);
  beamGeometry.setAttribute('color', beamColor);
  beamGeometry.setDrawRange(0, 0);
  // Light adds, writes no depth, and is not inked: see `lights.ts` on why a
  // light drawn twice by the pen's second pass would clip to white.
  const beamMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  beamMaterial.userData.outlineParameters = { visible: false };
  const beams = new THREE.Mesh(beamGeometry, beamMaterial);
  beams.name = 'country-beams';
  beams.frustumCulled = false;
  beams.renderOrder = 2;
  beams.visible = false;
  group.add(beams);
  /** The lamp's light at the root of a beam, off the palette and towards white, as the windows' is. */
  const LIGHT = new THREE.Color(PALETTE.gold).lerp(new THREE.Color(PALETTE.white), 0.5).multiplyScalar(0.55);

  // --- choosing the nearest, without allocating ---------------------------------
  const rotorRows: (Float32Array | null)[] = new Array(MAX_ROTORS).fill(null);
  const rotorAt = new Int32Array(MAX_ROTORS);
  const rotorDistance = new Float64Array(MAX_ROTORS);
  let rotorCount = 0;
  const beamRows: (Float32Array | null)[] = new Array(MAX_BEAMS).fill(null);
  const beamAt = new Int32Array(MAX_BEAMS);
  const beamDistance = new Float64Array(MAX_BEAMS);
  let beamCount = 0;
  let smokeSource: CountryMotionSource | null = null;

  /** Keeps a candidate if it is among the `cap` nearest so far, the list sorted nearest first. */
  function offer(rows: Float32Array, offset: number, d: number, list: (Float32Array | null)[], at: Int32Array, dist: Float64Array, count: number, cap: number): number {
    if (count === cap && d >= dist[cap - 1]!) return count;
    let i = count < cap ? count : cap - 1;
    while (i > 0 && dist[i - 1]! > d) {
      list[i] = list[i - 1]!;
      at[i] = at[i - 1]!;
      dist[i] = dist[i - 1]!;
      i--;
    }
    list[i] = rows;
    at[i] = offset;
    dist[i] = d;
    return count < cap ? count + 1 : count;
  }

  const eyeAt = new THREE.Vector3();
  const visitRows = (rows: CountryMotionRows): void => {
    const r = rows.rotors;
    for (let o = 0; o < r.length; o += ROTOR_STRIDE) {
      const dx = r[o]! - eyeAt.x;
      const dy = r[o + 1]! - eyeAt.y;
      const dz = r[o + 2]! - eyeAt.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d > ROTOR_REACH * ROTOR_REACH) continue;
      rotorCount = offer(r, o, d, rotorRows, rotorAt, rotorDistance, rotorCount, MAX_ROTORS);
    }
    const b = rows.beacons;
    for (let o = 0; o < b.length; o += BEACON_STRIDE) {
      const dx = b[o]! - eyeAt.x;
      const dy = b[o + 1]! - eyeAt.y;
      const dz = b[o + 2]! - eyeAt.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d > BEAM_REACH * BEAM_REACH) continue;
      beamCount = offer(b, o, d, beamRows, beamAt, beamDistance, beamCount, MAX_BEAMS);
    }
  };

  // --- writing ---------------------------------------------------------------------
  let clock = 0;
  const hub = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const upward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const lampUp = new THREE.Vector3();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  const heading = new THREE.Vector3();
  const across = new THREE.Vector3();
  const lift = new THREE.Vector3();
  const rim = new THREE.Vector3();
  const rim2 = new THREE.Vector3();

  /** A template's vectors turned by the angle about Z, into the rotor's frame, scaled and moved to its hub if they are points. */
  function turn(from: Float32Array, to: Float32Array, cursor: number, count: number, c: number, s: number, k: number, point: boolean): void {
    const ox = point ? hub.x : 0;
    const oy = point ? hub.y : 0;
    const oz = point ? hub.z : 0;
    for (let t = 0; t < count * 3; t += 3) {
      const x = from[t]!;
      const y = from[t + 1]!;
      const z = from[t + 2]!;
      const rx = x * c - y * s;
      const ry = x * s + y * c;
      to[cursor + t] = (right.x * rx + upward.x * ry + axis.x * z) * k + ox;
      to[cursor + t + 1] = (right.y * rx + upward.y * ry + axis.y * z) * k + oy;
      to[cursor + t + 2] = (right.z * rx + upward.z * ry + axis.z * z) * k + oz;
    }
  }

  function writeRotors(): number {
    const position = rotorPosition.array as Float32Array;
    const normal = rotorNormal.array as Float32Array;
    const color = rotorColor.array as Float32Array;
    const outline = rotorOutline.array as Float32Array;
    let cursor = 0;
    for (let i = 0; i < rotorCount; i++) {
      const r = rotorRows[i]!;
      const o = rotorAt[i]!;
      const kind = r[o + 9]!;
      const template = templates[kind]!;
      const scale = r[o + 11]!;
      const angle = r[o + 10]! + clock * ROTOR_SPEED[ROTOR_KINDS[kind]!];
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      hub.set(r[o]! - rotors.position.x, r[o + 1]! - rotors.position.y, r[o + 2]! - rotors.position.z);
      axis.set(r[o + 3]!, r[o + 4]!, r[o + 5]!);
      upward.set(r[o + 6]!, r[o + 7]!, r[o + 8]!);
      // X = Y x Z: the rotor's own frame, right-handed, so nothing mirrors.
      right.crossVectors(upward, axis);
      turn(template.position, position, cursor, template.count, c, s, scale, true);
      turn(template.normal, normal, cursor, template.count, c, s, 1, false);
      turn(template.outline, outline, cursor, template.count, c, s, 1, false);
      color.set(template.color, cursor);
      cursor += template.count * 3;
    }
    return cursor / 3;
  }

  function writeBeams(): number {
    const position = beamPosition.array as Float32Array;
    const color = beamColor.array as Float32Array;
    let cursor = 0;
    for (let i = 0; i < beamCount; i++) {
      const b = beamRows[i]!;
      const o = beamAt[i]!;
      lampUp.set(b[o + 3]!, b[o + 4]!, b[o + 5]!);
      const night = nightAt(lampUp);
      if (night <= 0.01) continue;
      hub.set(b[o]! - beams.position.x, b[o + 1]! - beams.position.y, b[o + 2]! - beams.position.z);
      north.set(0, 1, 0).projectOnPlane(lampUp);
      if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(lampUp);
      north.normalize();
      east.crossVectors(lampUp, north).normalize();
      const angle = b[o + 6]! + clock * BEAM_SPEED;
      for (let half = 0; half < 2; half++) {
        const way = angle + half * Math.PI;
        heading.copy(east).multiplyScalar(Math.cos(way)).addScaledVector(north, Math.sin(way));
        across.crossVectors(heading, lampUp).normalize();
        for (let k = 0; k < BEAM_SIDES; k++) {
          const a0 = (k / BEAM_SIDES) * Math.PI * 2;
          const a1 = ((k + 1) / BEAM_SIDES) * Math.PI * 2;
          rim.copy(hub).addScaledVector(heading, BEAM_LENGTH).addScaledVector(across, Math.cos(a0) * BEAM_RADIUS).addScaledVector(lift.copy(lampUp), Math.sin(a0) * BEAM_RADIUS * 0.6 - BEAM_LENGTH * 0.04);
          rim2.copy(hub).addScaledVector(heading, BEAM_LENGTH).addScaledVector(across, Math.cos(a1) * BEAM_RADIUS).addScaledVector(lift.copy(lampUp), Math.sin(a1) * BEAM_RADIUS * 0.6 - BEAM_LENGTH * 0.04);
          const base = cursor * 3;
          position[base] = hub.x;
          position[base + 1] = hub.y;
          position[base + 2] = hub.z;
          position[base + 3] = rim.x;
          position[base + 4] = rim.y;
          position[base + 5] = rim.z;
          position[base + 6] = rim2.x;
          position[base + 7] = rim2.y;
          position[base + 8] = rim2.z;
          // Bright at the lamp and gone by the end: additive, so black is nothing.
          color[base] = LIGHT.r * night;
          color[base + 1] = LIGHT.g * night;
          color[base + 2] = LIGHT.b * night;
          for (let n = 3; n < 9; n++) color[base + n] = 0;
          cursor += 3;
        }
      }
    }
    return cursor;
  }

  const stats: CountryMotionStats = { rotors: 0, beams: 0, smokes: 0, triangles: 0, updateMs: 0 };
  const rotorAttributes = [rotorPosition, rotorNormal, rotorColor, rotorOutline];
  const beamAttributes = [beamPosition, beamColor];
  const mark = (attribute: THREE.BufferAttribute, vertices: number): void => {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, vertices * 3);
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

  return {
    group,
    stats,
    update(dt, eye, source) {
      const began = performance.now();
      clock += dt;
      eyeAt.copy(eye);
      smokeSource = source;
      rotorCount = 0;
      beamCount = 0;
      source.motion(visitRows);
      // Written round the camera, so a float carries millimetres, not the planet's radius.
      rotors.position.copy(eye);
      beams.position.copy(eye);
      const rotorVertices = writeRotors();
      rotorGeometry.setDrawRange(0, rotorVertices);
      rotors.visible = rotorVertices > 0;
      if (rotorVertices > 0) for (const attribute of rotorAttributes) mark(attribute, rotorVertices);
      const beamVerticesUsed = writeBeams();
      beamGeometry.setDrawRange(0, beamVerticesUsed);
      beams.visible = beamVerticesUsed > 0;
      if (beamVerticesUsed > 0) for (const attribute of beamAttributes) mark(attribute, beamVerticesUsed);
      stats.rotors = rotorCount;
      stats.beams = beamVerticesUsed / (BEAM_SIDES * 6);
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
      return [new THREE.Mesh(proxyGeometry, rotorMaterial), new THREE.Mesh(proxyGeometry.clone(), beamMaterial)];
    },
  };
}

const mouth = new THREE.Vector3();
const smokeUp = new THREE.Vector3();
