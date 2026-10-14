/**
 * The track bed: a ribbon of ballast at the crown with its shoulders buried in
 * the ground, and near the eye the sleepers and rails on it. It is a mark on
 * the ground, so it carries no ink and reads the ground's weather.
 */
import * as THREE from 'three';
import { GROUND_MARKS_GLSL, PLANET_RADIUS, bindGroundWeather, groundWeatherChunk, groundWeatherGLSL } from '../globe.ts';
import { createToonRamp } from '../theme.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import { coursePoint, courseTangent } from '../roads/course.ts';
import { parameterAt } from '../roads/path.ts';
import { crownAt } from '../rails/crown.ts';
import { BED_FOOT, BED_HALF, GAUGE, SHOULDER_DROP } from '../rails/line.ts';
import { RAIL_TOP } from '../rails/trains.ts';
import type { RailNetwork } from '../rails/network.ts';
import {
  BALLAST, BAND, CHUNK, FAR_ROW, NEAR_ROW, RAIL_HEAD, RAIL_SIDE, RAIL_WIDTH, SHOULDER, SLEEPER, SLEEPER_LENGTH,
  SLEEPER_STEP, SLEEPER_TOP, SLEEPER_WIDTH,
} from './constants.ts';
import type { Crossing } from './crossings.ts';

/** The bed's material: vertex colours, no ink, the ground's weather. */
export function createBedMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  material.userData.outlineParameters = { visible: false };
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -2;
  // The weather chunk calls `atlasNoise`, which `GROUND_MARKS_GLSL` defines;
  // without it the fragment program fails to link and the bed draws nothing.
  material.onBeforeCompile = (shader) => {
    bindGroundWeather(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRailWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvRailWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRailWorld;\n${GROUND_MARKS_GLSL}\n${groundWeatherGLSL()}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n  ${groundWeatherChunk('vRailWorld')}`);
  };
  material.customProgramCacheKey = () => 'railway:bed:weather';
  material.name = 'railway-bed';
  shadeByClouds(material);
  return material;
}

export interface BedSource {
  network: RailNetwork;
  material: THREE.Material;
  crossings(line: number): Crossing[];
  /** The ground's radius at a direction: the lower of the relief and the drawn land. */
  groundAt(direction: THREE.Vector3): number;
  /** The crossing furniture for the crossings inside a near chunk. */
  crossingProps(line: number, here: Crossing[]): THREE.Group | null;
}

/** Triangles relative to a chunk's origin, so the buffer holds small numbers. */
interface BedBuffer {
  positions: number[];
  colors: number[];
  push(v: THREE.Vector3, c: THREE.Color): void;
  /** `a`-`b` across one row left to right, `d`-`c` across the next; faces outward. */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, colour: THREE.Color): void;
  /** A triangle, dropped when two of its corners are the same point. */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, colour: THREE.Color): void;
}

function bedBuffer(origin: THREE.Vector3): BedBuffer {
  const positions: number[] = [];
  const colors: number[] = [];
  const push = (v: THREE.Vector3, c: THREE.Color): void => {
    positions.push(v.x - origin.x, v.y - origin.y, v.z - origin.z);
    colors.push(c.r, c.g, c.b);
  };
  return {
    positions,
    colors,
    push,
    quad(a, b, c, d, colour) {
      push(a, colour); push(b, colour); push(c, colour);
      push(a, colour); push(c, colour); push(d, colour);
    },
    tri(a, b, c, colour) {
      if (a === b || b === c || a === c) return;
      push(a, colour); push(b, colour); push(c, colour);
    },
  };
}

/** One chunk's cross-sections: points left to right, and each row's `s`, direction and crown. */
interface Rows {
  points: THREE.Vector3[][];
  s: number[];
  along: THREE.Vector3[];
  crown: number[];
}

const p = new THREE.Vector3();
const t = new THREE.Vector3();
const side = new THREE.Vector3();
const q = new THREE.Vector3();

function layRows(source: BedSource, line: number, s0: number, s1: number, steps: number, across: readonly number[]): Rows {
  const path = source.network.path(line);
  const crown = source.network.crown(line);
  const course = source.network.course(line);
  const rows: Rows = { points: [], s: [], along: [], crown: [] };
  for (let k = 0; k <= steps; k++) {
    const s = s0 + ((s1 - s0) * k) / steps;
    const tt = parameterAt(path, s);
    coursePoint(course, tt, p);
    courseTangent(course, tt, t);
    side.crossVectors(t, p).normalize();
    const r = crownAt(crown, s);
    const section: THREE.Vector3[] = [];
    for (const x of across) {
      const point = p.clone().addScaledVector(side, x / PLANET_RADIUS).normalize();
      if (Math.abs(x) >= BED_FOOT - 1e-6) {
        const foot = Math.min(r - SHOULDER_DROP, source.groundAt(point) - 1.5);
        section.push(point.multiplyScalar(foot));
      } else section.push(point.multiplyScalar(r));
    }
    rows.points.push(section);
    rows.s.push(s);
    rows.along.push(t.clone());
    rows.crown.push(r);
  }
  return rows;
}

/**
 * Closes every open end of the bed. At a terminus the ballast is hipped at
 * the shoulders' own pitch; anywhere else it stops (a crossing, or a chunk
 * whose neighbour is not built) its section is closed flat.
 */
function closeEnds(
  buffer: BedBuffer, source: BedSource, rows: Rows, drawn: readonly boolean[], steps: number,
  s0: number, s1: number, length: number,
): void {
  const hip = (k: number, outward: number): void => {
    const a = rows.points[k]!;
    const run = (BED_FOOT - BED_HALF) * outward;
    const e = a.map((point, j) => {
      if (j === 0 || j === a.length - 1) return point;
      const out = point.clone().normalize().addScaledVector(rows.along[k]!, run / PLANET_RADIUS).normalize();
      return out.multiplyScalar(Math.min(rows.crown[k]! - SHOULDER_DROP, source.groundAt(out) - 1.5));
    });
    for (let j = 0; j + 1 < a.length; j++) {
      if (outward > 0) {
        buffer.tri(a[j]!, a[j + 1]!, e[j + 1]!, SHOULDER);
        buffer.tri(a[j]!, e[j + 1]!, e[j]!, SHOULDER);
      } else {
        buffer.tri(e[j]!, e[j + 1]!, a[j + 1]!, SHOULDER);
        buffer.tri(e[j]!, a[j + 1]!, a[j]!, SHOULDER);
      }
    }
  };
  const close = (k: number, outward: number): void => {
    const a = rows.points[k]!;
    for (let j = 1; j + 1 < a.length; j++) {
      if (outward > 0) buffer.tri(a[0]!, a[j]!, a[j + 1]!, SHOULDER);
      else buffer.tri(a[0]!, a[j + 1]!, a[j]!, SHOULDER);
    }
  };
  for (let k = 0; k < steps; k++) {
    if (!drawn[k]) continue;
    if (k === 0 || !drawn[k - 1]) {
      if (k === 0 && s0 <= 0) hip(0, -1);
      else close(k, -1);
    }
    if (k === steps - 1 || !drawn[k + 1]) {
      if (k === steps - 1 && s1 >= length) hip(steps, 1);
      else close(k + 1, 1);
    }
  }
}

/** A box laid on the crown at `x` across the track: half-length `hx` across, `hz` along, `h` tall. */
function slab(
  buffer: BedBuffer, at: THREE.Vector3, along: THREE.Vector3, across: THREE.Vector3,
  r: number, x: number, hx: number, hz: number, h: number, colour: THREE.Color,
): void {
  const corner = (dx: number, dz: number, dy: number): THREE.Vector3 =>
    at.clone().addScaledVector(across, (x + dx) / PLANET_RADIUS).addScaledVector(along, dz / PLANET_RADIUS).normalize().multiplyScalar(r + dy);
  const lo = -0.1;
  const c000 = corner(-hx, -hz, lo), c100 = corner(hx, -hz, lo), c010 = corner(-hx, -hz, h), c110 = corner(hx, -hz, h);
  const c001 = corner(-hx, hz, lo), c101 = corner(hx, hz, lo), c011 = corner(-hx, hz, h), c111 = corner(hx, hz, h);
  // `across` is the track's right and right x along is up, so each face below
  // is listed inward and laid the other way round.
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    buffer.push(a, colour);
    buffer.push(c, colour);
    buffer.push(b, colour);
  };
  tri(c010, c011, c111); tri(c010, c111, c110);
  tri(c000, c010, c110); tri(c000, c110, c100);
  tri(c001, c101, c111); tri(c001, c111, c011);
  tri(c000, c001, c011); tri(c000, c011, c010);
  tri(c100, c110, c111); tri(c100, c111, c101);
}

/** Sleepers square to the track, and the two rails, which run on over a crossing's asphalt. */
function layTrack(
  buffer: BedBuffer, source: BedSource, line: number, s0: number, s1: number, steps: number,
  rowS: readonly number[], inCrossing: (s: number) => boolean,
): void {
  const path = source.network.path(line);
  const crown = source.network.crown(line);
  const course = source.network.course(line);
  const first = Math.ceil(s0 / SLEEPER_STEP) * SLEEPER_STEP;
  for (let s = first; s < s1; s += SLEEPER_STEP) {
    if (inCrossing(s)) continue;
    const tt = parameterAt(path, s);
    coursePoint(course, tt, p);
    courseTangent(course, tt, t);
    side.crossVectors(t, p).normalize();
    const r = crownAt(crown, s);
    slab(buffer, p, t, side, r, 0, SLEEPER_LENGTH / 2, SLEEPER_WIDTH / 2, SLEEPER_TOP, SLEEPER);
  }
  for (const hand of [-1, 1]) {
    let last: THREE.Vector3[] | null = null;
    for (let k = 0; k <= steps; k++) {
      const s = rowS[k]!;
      const tt = parameterAt(path, s);
      coursePoint(course, tt, p);
      courseTangent(course, tt, t);
      side.crossVectors(t, p).normalize();
      const r = crownAt(crown, s);
      const centre = p.clone().addScaledVector(side, (hand * GAUGE) / 2 / PLANET_RADIUS).normalize();
      const inner = centre.clone().addScaledVector(side, -RAIL_WIDTH / 2 / PLANET_RADIUS).normalize();
      const outer = centre.clone().addScaledVector(side, RAIL_WIDTH / 2 / PLANET_RADIUS).normalize();
      const here = [
        inner.clone().multiplyScalar(r + SLEEPER_TOP - 0.05),
        inner.clone().multiplyScalar(r + RAIL_TOP),
        outer.clone().multiplyScalar(r + RAIL_TOP),
        outer.clone().multiplyScalar(r + SLEEPER_TOP - 0.05),
      ];
      if (last !== null) {
        buffer.quad(last[0]!, last[1]!, here[1]!, here[0]!, RAIL_SIDE);
        buffer.quad(last[1]!, last[2]!, here[2]!, here[1]!, RAIL_HEAD);
        buffer.quad(last[2]!, last[3]!, here[3]!, here[2]!, RAIL_SIDE);
      }
      // The rail's own end at a terminus, under the buffer stop.
      if (k === 0 && s0 <= 0) buffer.quad(here[3]!, here[2]!, here[1]!, here[0]!, RAIL_SIDE);
      if (k === steps && s1 >= path.length) buffer.quad(here[0]!, here[1]!, here[2]!, here[3]!, RAIL_SIDE);
      last = here;
    }
  }
}

/**
 * One chunk of a line's bed, `index` chunks from terminus A. A near chunk
 * carries sleepers, rails and its crossings' furniture; a far one draws the
 * rails as a darker band down the ballast.
 */
export function buildBed(source: BedSource, line: number, index: number, near: boolean): { bed: THREE.Mesh; props: THREE.Group | null } {
  const path = source.network.path(line);
  const crown = source.network.crown(line);
  const course = source.network.course(line);
  const s0 = index * CHUNK;
  const s1 = Math.min(path.length, s0 + CHUNK);
  const row = near ? NEAR_ROW : FAR_ROW;
  const steps = Math.max(1, Math.ceil((s1 - s0) / row));
  const cuts = source.crossings(line).filter((c) => c.s + c.half > s0 - row && c.s - c.half < s1 + row);
  const inCrossing = (s: number): boolean => cuts.some((c) => Math.abs(s - c.s) < c.half);

  coursePoint(course, parameterAt(path, s0), q);
  const origin = q.clone().multiplyScalar(crownAt(crown, s0));
  const buffer = bedBuffer(origin);

  // The cross-section, left to right looking along +s.
  const across = near ? [-BED_FOOT, -BED_HALF, BED_HALF, BED_FOOT] : [-BED_FOOT, -BED_HALF, -GAUGE / 2 - 0.6, GAUGE / 2 + 0.6, BED_HALF, BED_FOOT];
  const colourOf = near ? [SHOULDER, BALLAST, SHOULDER] : [SHOULDER, BALLAST, BAND, BALLAST, SHOULDER];
  const rows = layRows(source, line, s0, s1, steps, across);
  const drawn: boolean[] = [];
  for (let k = 0; k < steps; k++) drawn.push(!inCrossing((rows.s[k]! + rows.s[k + 1]!) / 2));
  for (let k = 0; k < steps; k++) {
    if (!drawn[k]) continue;
    const a = rows.points[k]!;
    const b = rows.points[k + 1]!;
    for (let j = 0; j + 1 < across.length; j++) buffer.quad(a[j]!, a[j + 1]!, b[j + 1]!, b[j]!, colourOf[j]!);
  }
  closeEnds(buffer, source, rows, drawn, steps, s0, s1, path.length);

  let props: THREE.Group | null = null;
  if (near) {
    layTrack(buffer, source, line, s0, s1, steps, rows.s, inCrossing);
    if (cuts.length > 0) props = source.crossingProps(line, cuts.filter((c) => c.s >= s0 && c.s < s1));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffer.colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const bed = new THREE.Mesh(geometry, source.material);
  bed.position.copy(origin);
  bed.receiveShadow = true;
  bed.castShadow = false;
  bed.name = `rail:${line}:${index}`;
  return { bed, props };
}
