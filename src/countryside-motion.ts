import * as THREE from 'three';
import { mergeMeshes } from './merge.ts';
import { createToonRamp, PALETTE } from './theme.ts';
import { shadeByClouds } from './cloud-shade.ts';
import type { SceneryContext } from './scenery/contract.ts';
import { ROTOR_SPEED, buildRotor } from './countryside-kit.ts';
import { BEACON_STRIDE, ROTOR_KINDS, ROTOR_STRIDE, SMOKE_STRIDE } from './countryside-tile.ts';
import type { CountryMotionRows } from './countryside-tile.ts';
import type { SmokeVisitor } from './effects.ts';
import { FIRE_STRIDE, nightAt } from './lights.ts';

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
/**
 * A beam's shape: its length, its radius at the lamp and at the end, and how
 * far it dips over that length. The light is a gaussian across the cone
 * (`BEAM_FRAGMENT`), so these are where it has faded out, not an edge.
 */
const BEAM_LENGTH = 170;
const BEAM_ROOT = 0.8;
const BEAM_END = 12;
const BEAM_DIP = 0.015;
/** Sides of the cone the shaft is drawn in: the light is round whatever the polygon is. */
const BEAM_SIDES = 8;
/** Eight seconds a turn, two beams: a flash every four seconds, as a real light's character is. */
const BEAM_SPEED = (Math.PI * 2) / 8;
/**
 * The lantern room's glass, lit from inside: a shell just outside the
 * lantern's column (`lighthouse` in `countryside-kit.ts`: radius 1.25 on ten
 * sides, 2.3 tall, centred on the beacon), wide enough to clear that column's
 * corners at any yaw and under the gallery's rail at 1.6.
 */
const GLASS_RADIUS = 1.25 / Math.cos(Math.PI / 10) + 0.05;
const GLASS_HALF = 1.12;
const GLASS_SIDES = 10;
/** The halo round the lamp: its radius, never under a few pixels far off, and how far towards the eye it stands, clear of the gallery. */
const HALO_RADIUS = 6;
const HALO_PIXELS = 0.005;
const HALO_FORWARD = 3;
/** How sharply the lamp flashes as a beam passes the eye: across the horizon, and above or below it. */
const FLASH_SHARP = 60;
const FLASH_ELEVATION = 0.35;
/** Vertices a lighthouse takes: two cones, the glass and the halo. */
const BEACON_VERTICES = 2 * BEAM_SIDES * 6 + GLASS_SIDES * 6 + 6;
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
  const rotorMaterial = shadeByClouds(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) }));
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
  const beamVertices = MAX_BEAMS * BEACON_VERTICES;
  const beamGeometry = new THREE.BufferGeometry();
  const beamPosition = new THREE.BufferAttribute(new Float32Array(beamVertices * 3), 3);
  const beamApex = new THREE.BufferAttribute(new Float32Array(beamVertices * 4), 4);
  const beamAxis = new THREE.BufferAttribute(new Float32Array(beamVertices * 4), 4);
  const beamShape = new THREE.BufferAttribute(new Float32Array(beamVertices * 4), 4);
  const beamAttributes = [beamPosition, beamApex, beamAxis, beamShape];
  for (const attribute of beamAttributes) attribute.setUsage(THREE.DynamicDrawUsage);
  beamGeometry.setAttribute('position', beamPosition);
  beamGeometry.setAttribute('beamApex', beamApex);
  beamGeometry.setAttribute('beamAxis', beamAxis);
  beamGeometry.setAttribute('beamShape', beamShape);
  beamGeometry.setDrawRange(0, 0);
  const beamMaterial = createBeamMaterial();
  const beams = new THREE.Mesh(beamGeometry, beamMaterial);
  beams.name = 'country-beams';
  beams.frustumCulled = false;
  beams.castShadow = false;
  beams.receiveShadow = false;
  beams.renderOrder = 2;
  beams.visible = false;
  group.add(beams);

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
  const lift = new THREE.Vector3();
  const rim = new THREE.Vector3();

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

  const toEye = new THREE.Vector3();
  const flat = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const ways = [new THREE.Vector3(), new THREE.Vector3()];
  /** Where the next vertex goes, and what every vertex of the piece being written carries. */
  let cursor = 0;
  const apex = new THREE.Vector3();
  let strength = 0;
  const axisOut = new THREE.Vector3();
  let kind = 0;
  const shape = new THREE.Vector4();

  function vertex(x: number, y: number, z: number): void {
    const position = beamPosition.array as Float32Array;
    const a = beamApex.array as Float32Array;
    const b = beamAxis.array as Float32Array;
    const c = beamShape.array as Float32Array;
    position[cursor * 3] = x;
    position[cursor * 3 + 1] = y;
    position[cursor * 3 + 2] = z;
    const four = cursor * 4;
    a[four] = apex.x;
    a[four + 1] = apex.y;
    a[four + 2] = apex.z;
    a[four + 3] = strength;
    b[four] = axisOut.x;
    b[four + 1] = axisOut.y;
    b[four + 2] = axisOut.z;
    b[four + 3] = kind;
    c[four] = shape.x;
    c[four + 1] = shape.y;
    c[four + 2] = shape.z;
    c[four + 3] = shape.w;
    cursor++;
  }

  /**
   * A frustum of a cone round `along` from `from`, `length` long, `r0` to `r1`
   * across, open at both ends and wound so its front faces look outward: the
   * frame (e1, e2, along) is right-handed, and each quad is (00, 01, 11),
   * (00, 11, 10), whose normal is the rim's own outward direction.
   */
  function frustum(from: THREE.Vector3, along: THREE.Vector3, length: number, r0: number, r1: number, sides: number): void {
    e1.copy(along).cross(lampUp);
    if (e1.lengthSq() < 1e-8) e1.set(1, 0, 0).projectOnPlane(along);
    if (e1.lengthSq() < 1e-8) e1.set(0, 0, 1).projectOnPlane(along);
    e1.normalize();
    e2.crossVectors(along, e1);
    tip.copy(from).addScaledVector(along, length);
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2;
      const a1 = ((k + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const x00 = from.x + (e1.x * c0 + e2.x * s0) * r0;
      const y00 = from.y + (e1.y * c0 + e2.y * s0) * r0;
      const z00 = from.z + (e1.z * c0 + e2.z * s0) * r0;
      const x01 = from.x + (e1.x * c1 + e2.x * s1) * r0;
      const y01 = from.y + (e1.y * c1 + e2.y * s1) * r0;
      const z01 = from.z + (e1.z * c1 + e2.z * s1) * r0;
      const x10 = tip.x + (e1.x * c0 + e2.x * s0) * r1;
      const y10 = tip.y + (e1.y * c0 + e2.y * s0) * r1;
      const z10 = tip.z + (e1.z * c0 + e2.z * s0) * r1;
      const x11 = tip.x + (e1.x * c1 + e2.x * s1) * r1;
      const y11 = tip.y + (e1.y * c1 + e2.y * s1) * r1;
      const z11 = tip.z + (e1.z * c1 + e2.z * s1) * r1;
      vertex(x00, y00, z00);
      vertex(x01, y01, z01);
      vertex(x11, y11, z11);
      vertex(x00, y00, z00);
      vertex(x11, y11, z11);
      vertex(x10, y10, z10);
    }
  }

  /** How far out the cone is drawn at a fraction of its length: past the polygon's flats, so the light's own fade is the edge. */
  const GEOMETRY_WIDEN = 1.02 / Math.cos(Math.PI / BEAM_SIDES);

  function writeBeams(): number {
    cursor = 0;
    let drawn = 0;
    for (let i = 0; i < beamCount; i++) {
      const b = beamRows[i]!;
      const o = beamAt[i]!;
      lampUp.set(b[o + 3]!, b[o + 4]!, b[o + 5]!);
      const night = nightAt(lampUp);
      if (night <= 0.01) continue;
      // Nothing by day, a thread at dusk, the whole shaft once it is dark.
      const dark = Math.pow(night, 1.5);
      drawn++;
      hub.set(b[o]! - beams.position.x, b[o + 1]! - beams.position.y, b[o + 2]! - beams.position.z);
      north.set(0, 1, 0).projectOnPlane(lampUp);
      if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(lampUp);
      north.normalize();
      east.crossVectors(lampUp, north).normalize();
      const angle = b[o + 6]! + clock * BEAM_SPEED;
      // The eye as the lamp sees it: its bearing across the horizon and its height over it.
      toEye.copy(hub).negate();
      const eyeDistance = Math.max(1e-3, toEye.length());
      toEye.divideScalar(eyeDistance);
      const elevation = Math.asin(Math.max(-1, Math.min(1, toEye.dot(lampUp))));
      flat.copy(toEye).addScaledVector(lampUp, -toEye.dot(lampUp));
      const flatLength = flat.length();
      if (flatLength > 1e-6) flat.divideScalar(flatLength);
      let flash = 0;

      for (let half = 0; half < 2; half++) {
        const way = angle + half * Math.PI;
        const heading = ways[half]!;
        heading.copy(east).multiplyScalar(Math.cos(way)).addScaledVector(north, Math.sin(way)).addScaledVector(lampUp, -BEAM_DIP).normalize();
        if (flatLength > 1e-6) {
          const facing = Math.max(0, heading.dot(flat) * Math.hypot(1, BEAM_DIP));
          flash = Math.max(flash, Math.pow(facing, FLASH_SHARP));
        }
        // Is the eye inside this cone? Then its back faces are the ones drawn.
        rim.copy(hub).negate();
        const along = rim.dot(heading);
        let inside = 0;
        if (along > 0 && along < BEAM_LENGTH) {
          const radius = (BEAM_ROOT + ((BEAM_END - BEAM_ROOT) * along) / BEAM_LENGTH) * GEOMETRY_WIDEN;
          if (rim.addScaledVector(heading, -along).lengthSq() < radius * radius) inside = 1;
        }
        apex.copy(hub);
        strength = dark;
        axisOut.copy(heading);
        kind = 0;
        shape.set(BEAM_ROOT, BEAM_END, BEAM_LENGTH, inside);
        frustum(hub, heading, BEAM_LENGTH, BEAM_ROOT * GEOMETRY_WIDEN, BEAM_END * GEOMETRY_WIDEN, BEAM_SIDES);
      }
      flash *= Math.exp(-((elevation / FLASH_ELEVATION) ** 2));

      // The glass, lit from inside, hottest where a beam leaves it.
      apex.copy(hub);
      strength = dark * (1 + flash);
      axisOut.copy(ways[0]!);
      kind = 2;
      shape.set(lampUp.x, lampUp.y, lampUp.z, GLASS_HALF);
      lift.copy(hub).addScaledVector(lampUp, -GLASS_HALF);
      frustum(lift, lampUp, GLASS_HALF * 2, GLASS_RADIUS, GLASS_RADIUS, GLASS_SIDES);

      // The halo: a card square to the eye, level with the horizon, stood
      // in front of the lantern so the glass does not cut it.
      const size = Math.max(HALO_RADIUS, eyeDistance * HALO_PIXELS) * Math.min(1, eyeDistance / (HALO_RADIUS * 4));
      if (eyeDistance > HALO_FORWARD * 2) {
        right.crossVectors(lampUp, toEye);
        if (right.lengthSq() < 1e-8) right.copy(east);
        right.normalize();
        upward.crossVectors(toEye, right);
        apex.copy(hub).addScaledVector(toEye, HALO_FORWARD);
        strength = dark;
        axisOut.set(0, 0, 0);
        kind = 1;
        const corner = (u: number, v: number): void => {
          shape.set(u, v, dark * flash, 0);
          vertex(
            apex.x + (right.x * u + upward.x * v) * size,
            apex.y + (right.y * u + upward.y * v) * size,
            apex.z + (right.z * u + upward.z * v) * size,
          );
        };
        corner(-1, -1);
        corner(1, -1);
        corner(1, 1);
        corner(-1, -1);
        corner(1, 1);
        corner(-1, 1);
      }
    }
    beamLighthouses = drawn;
    return cursor;
  }
  let beamLighthouses = 0;

  const stats: CountryMotionStats = { rotors: 0, beams: 0, smokes: 0, triangles: 0, updateMs: 0 };
  const rotorAttributes = [rotorPosition, rotorNormal, rotorColor, rotorOutline];
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
      beamMaterial.uniforms.uTime!.value = clock % 3600;
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
      stats.beams = beamLighthouses;
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
      return [new THREE.Mesh(proxyGeometry, rotorMaterial), new THREE.Mesh(beamProxy, beamMaterial)];
    },
  };
}

const mouth = new THREE.Vector3();
const smokeUp = new THREE.Vector3();

/**
 * The shaft as light in the air rather than a cone of colour.
 *
 * Each fragment of the cone asks what the ray from the eye through it passes
 * through inside: the light is a gaussian across the beam, so along any ray
 * its integral is closed-form — `exp(-k b^2 / R^2) * R * sqrt(pi / k) / |rp|`,
 * `b` the ray's nearest approach to the axis, `R` the radius where it passes,
 * `rp` the ray's part square to the axis. That one expression is the whole
 * look: seen from the side the band is brightest down its middle and fades
 * to nothing at its edges (so the polygon is never seen), and seen down its
 * length `|rp|` shrinks and it becomes a glow. Energy spreads as the cone
 * widens, so it is brightest and narrowest at the lamp and fades out before
 * its end, and slow dust drifts through it, fixed to the world, so the beam
 * sweeps through the dust rather than carrying it.
 *
 * One surface a pixel: the front faces from outside the cone, the back faces
 * from inside it (`beamShape.w`, decided on the CPU), so the sum is never
 * counted twice. Additive, depth-tested so the land hides it, writing no
 * depth; the haze closes it more gently than it closes the land, so a beam
 * reads as lit air a long way into it.
 *
 * `beamAxis.w` says what a vertex belongs to: 0 a shaft, 1 the halo round the
 * lamp (`beamShape.xy` its corner, `.z` the flash), 2 the lantern's glass
 * (`beamShape.xyz` the lighthouse's up, `.w` its half height).
 */
const BEAM_VERTEX = /* glsl */ `
attribute vec4 beamApex;
attribute vec4 beamAxis;
attribute vec4 beamShape;
varying vec3 vFromApex;
varying vec3 vEyeFromApex;
varying float vStrength;
varying vec4 vAxis;
varying vec4 vShape;
#include <common>
#include <fog_pars_vertex>
void main() {
  // The mesh stands at the eye, so these are small numbers, not the planet's radius.
  vec3 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vFromApex = position - beamApex.xyz;
  vEyeFromApex = (cameraPosition - origin) - beamApex.xyz;
  vStrength = beamApex.w;
  vAxis = beamAxis;
  vShape = beamShape;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const BEAM_FRAGMENT = /* glsl */ `
uniform vec3 uLight;
uniform float uTime;
varying vec3 vFromApex;
varying vec3 vEyeFromApex;
varying float vStrength;
varying vec4 vAxis;
varying vec4 vShape;
#include <common>
#include <fog_pars_fragment>

float beamHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float beamNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(beamHash(i), beamHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(beamHash(i + vec3(0.0, 1.0, 0.0)), beamHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(beamHash(i + vec3(0.0, 0.0, 1.0)), beamHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(beamHash(i + vec3(0.0, 1.0, 1.0)), beamHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}

void main() {
  float value = 0.0;
  if (vAxis.w < 0.5) {
    // The shaft.
    bool inside = vShape.w > 0.5;
    if (inside == gl_FrontFacing) discard;
    vec3 axis = normalize(vAxis.xyz);
    vec3 w = vFromApex;
    vec3 ray = w - vEyeFromApex;
    float reach = length(ray);
    ray /= max(reach, 1e-4);
    vec3 r = w - axis * dot(w, axis);
    vec3 rp = ray - axis * dot(ray, axis);
    float rp2 = max(dot(rp, rp), 1e-4);
    float rdot = dot(r, rp);
    // Where the ray passes nearest the axis, never behind the eye.
    float s = max(-rdot / rp2, -reach);
    vec3 nearest = w + ray * s;
    float t = clamp(dot(nearest, axis) / vShape.z, 0.0, 1.0);
    float radius = mix(vShape.x, vShape.y, t);
    float q = max(dot(r, r) - rdot * rdot / rp2, 0.0) / (radius * radius);
    float edge = clamp(1.0 - q, 0.0, 1.0);
    float across = exp(-3.0 * q) * edge * edge;
    float depth = min(inversesqrt(rp2), 4.0);
    float along = pow(vShape.x / radius, 0.45) * pow(1.0 - t, 1.3) * smoothstep(0.0, 0.03, t);
    float dust = 0.55 * beamNoise(nearest * 0.16 + vec3(0.0, uTime * 0.22, uTime * 0.09))
      + 0.45 * beamNoise(nearest * 0.47 - vec3(uTime * 0.31, 0.0, uTime * 0.17));
    value = vStrength * 1.1 * across * depth * along * (0.62 + 0.76 * dust);
    value = min(value, 3.0);
  } else if (vAxis.w < 1.5) {
    // The halo: a faint glow at rest, over the bloom's threshold only as a beam faces the eye.
    vec2 uv = vShape.xy;
    float r2 = dot(uv, uv);
    if (r2 >= 1.0) discard;
    float window = (1.0 - r2) * (1.0 - r2);
    float core = exp(-r2 * 30.0);
    float glow = exp(-r2 * 6.0) * window;
    float streak = exp(-uv.y * uv.y * 260.0) * exp(-uv.x * uv.x * 2.5) * window;
    value = vStrength * (0.9 * core + 0.18 * glow) + vShape.z * (3.2 * core + 0.7 * glow + 0.5 * streak);
  } else {
    // The glass, lit from inside, hottest where a beam leaves it.
    if (!gl_FrontFacing) discard;
    vec3 up = vShape.xyz;
    float height = dot(vFromApex, up);
    vec3 normal = normalize(vFromApex - up * height);
    vec3 view = normalize(vEyeFromApex - vFromApex);
    float facing = max(dot(normal, view), 0.0);
    float hot = pow(abs(dot(normal, normalize(vAxis.xyz))), 6.0);
    float band = 1.0 - pow(clamp(abs(height) / vShape.w, 0.0, 1.0), 6.0);
    value = vStrength * band * (0.45 + 0.35 * facing + 1.2 * hot);
  }
  // The haze, as the one fog chunk has it, closing this more gently than the land.
  gl_FragColor = vec4(1.0);
  {
    vec3 fogColor = vec3(0.0);
    #include <fog_fragment>
  }
  float haze = 1.0 - gl_FragColor.r;
  gl_FragColor = vec4(uLight * value * (1.0 - haze * haze), 1.0);
  #include <colorspace_fragment>
}
`;

/** The warm white of an old lamp, off the palette: gold most of the way to white. */
const BEAM_LIGHT = new THREE.Color(PALETTE.gold).lerp(new THREE.Color(PALETTE.white), 0.72);

function createBeamMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name: 'country-beams',
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLight: { value: BEAM_LIGHT.clone() }, uTime: { value: 0 } }]),
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: true,
  });
  // Light adds, and is not inked: a light drawn twice by the pen's second pass would clip to white.
  material.userData.outlineParameters = { visible: false };
  return material;
}
