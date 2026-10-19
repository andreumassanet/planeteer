// The shallows: one ribbon along every coastline in the world, at the
// resolution the outlines have, carrying the shelf, the shoals and the surf.
//
// A ring boundary is not a coastline: the rings are country outlines, so 40% of
// their edges are land frontiers, and `coastEdges` in `globe.ts` is the one
// answer to which are sea-facing.

import * as THREE from 'three';
import type { LandRing, World } from '../geo.ts';
import { PLANET_RADIUS, coastEdges, onSphere } from '../globe.ts';
import { latOf, lonOf } from '../sphere.ts';
import { createToonRamp } from '../theme.ts';
import { shadeByClouds } from '../cloud-shade.ts';
import {
  CHUNK_COLS,
  CHUNK_ROWS,
  LIFT_COAST,
  LIFT_SHELF,
  MAX_QUAD,
  PHASE_WRAP,
  SHELF,
  SHORE_BIAS,
  SHORE_INSET,
  SURF_WIDTH,
} from './constants.ts';
import { FOAM_GLSL, addGlint, addSeaWindow, paintSea, seaClock } from './shaders.ts';
import { FOAM_COLOR, clamp, depthMix, waterProfile } from './water-colour.ts';

/*
 * How far the shallows reach and how finely they follow the coast come from
 * `atlas.detail()`. The ribbon scales with the knob and the water sphere does
 * not: the sphere carries the orbital read, which the knob is least able to give
 * up, and at low detail it has to carry more of the depth ramp, not less. The
 * ribbon only sharpens an answer the sphere already gives. `SHELF` does not grow
 * past 1 (a shelf is 86 km); more detail buys a finer tolerance, until it runs
 * out at the outlines themselves. The knob is read once, when the sea is built.
 */
const SHELF_TOLERANCE = 3;
const SHELF_TOLERANCE_MAX = 10;

/** How far the shallows reach at this detail, in world units. */
export function shelfReach(d: number): number {
  return Math.min(SHELF, SHELF * d);
}

/**
 * How far the ribbon's inner edge may cut the corner of a bay, world units. The
 * decimation buys most of the saving; on a concave stretch the chord runs
 * seaward of the coast by up to this much. Capped at ten (a wave and a half of
 * the surf's reach), and the innermost row is inset by it as well so there is
 * never a strip of bare water between the land and the foam.
 */
export function shelfTolerance(d: number): number {
  return Math.min(SHELF_TOLERANCE_MAX, SHELF_TOLERANCE / d);
}

/**
 * Rows across the ribbon, in world units from the coastline, at this detail.
 * The first is inland (see the tolerance); the rest divide the reach into bands
 * no wider than `MAX_QUAD`, evenly: 4 bands at detail 1 and above, 3 at a half,
 * 2 at a quarter.
 */
export function shallowRows(d: number): number[] {
  const reach = shelfReach(d);
  const surf = Math.min(SURF_WIDTH, reach * 0.5);
  const rows = [-(SHORE_INSET + shelfTolerance(d)), surf];
  const outer = reach - surf;
  const bands = Math.max(1, Math.ceil(outer / MAX_QUAD));
  for (let i = 1; i <= bands; i++) rows.push(surf + (outer * i) / bands);
  return rows;
}

/** The shallows' reach as built, which the lift is graded over; see `surfaceLift`. */
let builtReach = SHELF;

/**
 * How high the drawn water stands over the sphere `distance` units from the
 * coast: the ribbon's own grade, `LIFT_COAST` falling to `LIFT_SHELF` over the
 * reach it was built with. The water `seabed.ts` lays over the floor stands where
 * the ribbon it replaces stood.
 */
export function surfaceLift(distance: number): number {
  return LIFT_COAST + (LIFT_SHELF - LIFT_COAST) * clamp(distance / builtReach, 0, 1);
}

/** The ribbon's rows as built, for `ribbonColour`. */
let builtRows: readonly number[] = [];
const rowLow = new THREE.Color();

/**
 * The colour the drawn sea has `distance` units from the coast, as the ribbon
 * draws it: `depthMix` at the two rows either side, mixed linearly across the
 * band as the GPU interpolates the ribbon's vertex colours. Past the ribbon it
 * is the sphere's `depthMix`. `seabed.ts` paints its water with this, so where
 * the two hand over the screen door has nothing to show.
 */
export function ribbonColour(profile: Float64Array, offset: number, distance: number, target: THREE.Color): THREE.Color {
  const rows = builtRows;
  if (rows.length < 2 || distance >= rows[rows.length - 1]!) return depthMix(profile, offset, distance, target);
  let k = 0;
  while (k + 2 < rows.length && distance > rows[k + 1]!) k++;
  const from = rows[k]!;
  const to = rows[k + 1]!;
  const t = clamp((distance - from) / (to - from), 0, 1);
  depthMix(profile, offset, Math.max(0, from), rowLow);
  depthMix(profile, offset, Math.max(0, to), target);
  return target.lerp(rowLow, 1 - t);
}

/**
 * The material the shallows wear: a toon material with the surf mixed in and no
 * ink. `OutlineEffect` builds its own program and ignores `onBeforeCompile`, so
 * a re-coloured surface and its hull would disagree; and a shelf is a change of
 * depth, not an object, so a black line round every coast would compete with the
 * real coastline.
 */
function shallowsMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: createToonRamp(4),
  });
  material.userData.outlineParameters = { visible: false };
  const uniforms = {
    uTime: seaClock,
    uFoam: { value: FOAM_COLOR.clone() },
  };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = uniforms.uTime;
    shader.uniforms['uFoam'] = uniforms.uFoam;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 aShore;\nvarying vec2 vShore;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vShore = aShore;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vShore;
uniform float uTime;
uniform vec3 uFoam;
${FOAM_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  {
    atlasSeaFoam = atlasLace(atlasFoam(vShore.x - ${SHORE_BIAS}.0, vShore.y), atlasWaveChop, atlasWaveFar);
    diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, atlasSeaFoam);
  }`,
      );
  };
  // Two materials that compile to different programs must not share a cache
  // key, and Three keys on the source plus this.
  material.customProgramCacheKey = () => 'atlas-shallows';
  addGlint(material);
  paintSea(material);
  addSeaWindow(material, 'hide');
  return shadeByClouds(material);
}

interface Bucket {
  position: number[];
  normal: number[];
  color: number[];
  shore: number[];
}

/** A stretch of coast resampled for the ribbon: point, sea direction, mitre length, phase. */
interface Run {
  at: THREE.Vector3[];
  out: THREE.Vector3[];
  mitre: number[];
  phase: number[];
}

/**
 * Resamples a raw run (consecutive sea-facing edges and how far along the ring
 * each point stands): merges what is straighter than `tolerance`, splits what is
 * longer than `MAX_QUAD`, and keeps the arc length as the phase. It is resampled
 * before the outward direction and mitre are taken, so those come from the
 * neighbours a kept point actually has. Null when fewer than two points remain.
 */
function resample(rawAt: THREE.Vector3[], rawPhase: number[], tolerance: number): Run | null {
  const n = rawAt.length;
  if (n < 2) return null;
  const along = new THREE.Vector3();
  const c = new THREE.Vector3();
  const chord = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const at: THREE.Vector3[] = [];
  const phase: number[] = [];

  let anchor = 0;
  at.push(rawAt[0]!.clone());
  phase.push(rawPhase[0]!);
  while (anchor < n - 1) {
    let end = anchor + 1;
    // Extend while everything skipped stays inside the tolerance and the chord
    // stays inside one quad's width.
    while (end + 1 < n) {
      const span = rawAt[anchor]!.angleTo(rawAt[end + 1]!) * PLANET_RADIUS;
      if (span > MAX_QUAD) break;
      chord.subVectors(rawAt[end + 1]!, rawAt[anchor]!);
      const length = chord.length();
      if (length === 0) break;
      chord.multiplyScalar(1 / length);
      let worst = 0;
      for (let k = anchor + 1; k <= end; k++) {
        offset.subVectors(rawAt[k]!, rawAt[anchor]!);
        offset.addScaledVector(chord, -offset.dot(chord));
        worst = Math.max(worst, offset.length() * PLANET_RADIUS);
      }
      if (worst > tolerance) break;
      end++;
    }
    // And split what one step of the outline already exceeds.
    const span = rawAt[anchor]!.angleTo(rawAt[end]!) * PLANET_RADIUS;
    const pieces = end === anchor + 1 ? Math.max(1, Math.ceil(span / MAX_QUAD)) : 1;
    for (let piece = 1; piece <= pieces; piece++) {
      const t = piece / pieces;
      at.push(rawAt[anchor]!.clone().lerp(rawAt[end]!, t).normalize());
      phase.push((rawPhase[anchor]! + (rawPhase[end]! - rawPhase[anchor]!) * t) % PHASE_WRAP);
    }
    anchor = end;
  }

  // The sea's direction along each kept segment. Land is on the right of
  // `a -> b`, so the sea is `cross(up, b - a)`, the sign the cliffs and the
  // shore index use.
  const segment: THREE.Vector3[] = [];
  for (let i = 0; i + 1 < at.length; i++) {
    along.subVectors(at[i + 1]!, at[i]!).normalize();
    c.copy(at[i]!).add(at[i + 1]!).normalize();
    segment.push(new THREE.Vector3().crossVectors(c, along).normalize());
  }
  if (segment.length === 0) return null;
  return joinRun(at, phase, segment);
}

/** A turn sharper than this, radians, is rounded on its seaward side rather than mitred. */
const ROUND_FROM = (40 * Math.PI) / 180;
/** The most a round join turns between two of its spokes, radians. */
const ROUND_STEP = (30 * Math.PI) / 180;

/**
 * Each kept point's sea direction and mitre. A gentle turn is mitred, so two
 * bands meet rather than leaving a wedge on the outside of it. A sharp turn
 * whose outside is the sea (a headland, a skerry) is rounded instead: the
 * point is repeated with its direction swung from one side's to the other's,
 * so the surf keeps its width round the corner rather than standing out as a
 * white wedge two and a half times as wide. A sharp turn whose outside is the
 * land keeps a capped mitre, and `untangle` undoes what it folds.
 */
function joinRun(at: THREE.Vector3[], phase: number[], segment: THREE.Vector3[]): Run {
  const run: Run = { at: [], out: [], mitre: [], phase: [] };
  const push = (i: number, out: THREE.Vector3, mitre: number): void => {
    run.at.push(at[i]!);
    run.out.push(out);
    run.mitre.push(mitre);
    run.phase.push(phase[i]!);
  };
  const before = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  push(0, segment[0]!.clone(), 1);
  for (let i = 1; i + 1 < at.length; i++) {
    const previous = segment[i - 1]!;
    const next = segment[i]!;
    const angle = previous.angleTo(next);
    before.subVectors(at[i]!, at[i - 1]!);
    if (angle > ROUND_FROM && next.dot(before) > 0) {
      // Swung about the point's own up, the way that takes one side's direction to the other's.
      const up = at[i]!;
      turn.setFromAxisAngle(up, angle);
      const sign = previous.clone().applyQuaternion(turn).dot(next) > Math.cos(angle * 0.5) ? 1 : -1;
      const steps = Math.ceil(angle / ROUND_STEP);
      for (let k = 0; k <= steps; k++) {
        turn.setFromAxisAngle(up, (sign * angle * k) / steps);
        push(i, previous.clone().applyQuaternion(turn).normalize(), 1);
      }
      continue;
    }
    const joined = previous.clone().add(next).normalize();
    // Capped, because a spit that doubles back on itself would otherwise ask
    // for a spike hundreds of units long.
    push(i, joined, clamp(1 / Math.max(0.4, joined.dot(next)), 1, 2.5));
  }
  push(at.length - 1, segment[segment.length - 1]!.clone(), 1);
  return run;
}

/** Everything the ribbon's runs are laid into. */
interface RibbonBuild {
  rows: number[];
  tolerance: number;
  reach: number;
  /** One bucket per lat/lon cell, so the frustum has something to cull. */
  cells: Map<number, Bucket>;
  spans: number;
  triangles: number;
  /** Scratch laid out per run point and row: position, colour, and the water profile. */
  rowAt: Float64Array;
  rowColor: Float64Array;
  profiles: Float64Array;
}

function bucketFor(build: RibbonBuild, lat: number, lon: number): Bucket {
  const r = clamp(Math.floor(((90 - lat) / 180) * CHUNK_ROWS), 0, CHUNK_ROWS - 1);
  const c = clamp(Math.floor(((lon + 180) / 360) * CHUNK_COLS), 0, CHUNK_COLS - 1);
  const id = r * CHUNK_COLS + c;
  let bucket = build.cells.get(id);
  if (bucket === undefined) {
    bucket = { position: [], normal: [], color: [], shore: [] };
    build.cells.set(id, bucket);
  }
  return bucket;
}

function pushVertex(build: RibbonBuild, run: Run, bucket: Bucket, index: number, row: number): void {
  const at = (index * build.rows.length + row) * 3;
  const x = build.rowAt[at]!;
  const y = build.rowAt[at + 1]!;
  const z = build.rowAt[at + 2]!;
  bucket.position.push(x, y, z);
  const inverse = 1 / Math.hypot(x, y, z);
  bucket.normal.push(x * inverse, y * inverse, z * inverse);
  bucket.color.push(build.rowColor[at]!, build.rowColor[at + 1]!, build.rowColor[at + 2]!);
  bucket.shore.push(build.rows[row]!, run.phase[index]!);
}

/** Lays each row's point and colour for every point of a run. */
function layRows(build: RibbonBuild, run: Run): void {
  const { rows, reach } = build;
  const n = run.at.length;
  if (build.rowAt.length < n * rows.length * 3) {
    build.rowAt = new Float64Array(n * rows.length * 3);
    build.rowColor = new Float64Array(n * rows.length * 3);
    build.profiles = new Float64Array(n * 9);
  }
  const point = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < n; i++) {
    // The profile is asked once per point of the outline and shared by every
    // row above it; the depth ramp is what varies across the ribbon.
    waterProfile(run.at[i]!.x, run.at[i]!.y, run.at[i]!.z, build.profiles, i * 9);
    for (let row = 0; row < rows.length; row++) {
      const distance = rows[row]!;
      point
        .copy(run.at[i]!)
        .addScaledVector(run.out[i]!, (distance * run.mitre[i]!) / PLANET_RADIUS)
        .normalize()
        .multiplyScalar(
          PLANET_RADIUS + LIFT_COAST + (LIFT_SHELF - LIFT_COAST) * clamp(distance / reach, 0, 1),
        );
      const at = (i * rows.length + row) * 3;
      build.rowAt[at] = point.x;
      build.rowAt[at + 1] = point.y;
      build.rowAt[at + 2] = point.z;
      depthMix(build.profiles, i * 9, Math.max(0, distance), color);
      build.rowColor[at] = color.r;
      build.rowColor[at + 1] = color.g;
      build.rowColor[at + 2] = color.b;
    }
  }
  for (let row = 0; row < rows.length; row++) untangle(build, run, row);
}

/** How many times a row is walked for folds; each pass undoes the folds the last one's merges made. */
const UNTANGLE_PASSES = 4;

/**
 * Undoes the folds of one row. Where the coast turns sharply away from the
 * row's side (a fjord's head, for a seaward row) or two points stand closer
 * than their offset, the row's points cross: its segment runs against the
 * coast's, the band beside it folds over, and the surf's distance, which is
 * per vertex, is laid over open water. A folded pair is merged at its midpoint
 * instead, so the row pinches where the coast turns.
 */
function untangle(build: RibbonBuild, run: Run, row: number): void {
  const stride = build.rows.length * 3;
  const p = build.rowAt;
  const n = run.at.length;
  for (let pass = 0; pass < UNTANGLE_PASSES; pass++) {
    let folded = false;
    for (let i = 0; i + 1 < n; i++) {
      const a = i * stride + row * 3;
      const b = a + stride;
      const sx = p[b]! - p[a]!;
      const sy = p[b + 1]! - p[a + 1]!;
      const sz = p[b + 2]! - p[a + 2]!;
      const from = run.at[i]!;
      const to = run.at[i + 1]!;
      if (sx * (to.x - from.x) + sy * (to.y - from.y) + sz * (to.z - from.z) >= 0) continue;
      folded = true;
      const radius = Math.hypot(p[a]!, p[a + 1]!, p[a + 2]!);
      const mx = (p[a]! + p[b]!) / 2;
      const my = (p[a + 1]! + p[b + 1]!) / 2;
      const mz = (p[a + 2]! + p[b + 2]!) / 2;
      const scale = radius / Math.max(1e-9, Math.hypot(mx, my, mz));
      p[a] = p[b] = mx * scale;
      p[a + 1] = p[b + 1] = my * scale;
      p[a + 2] = p[b + 2] = mz * scale;
    }
    if (!folded) return;
  }
}

/** Emits the ribbon for one raw run. */
function emitRun(build: RibbonBuild, rawAt: THREE.Vector3[], rawPhase: number[]): void {
  const run = resample(rawAt, rawPhase, build.tolerance);
  if (run === null) return;
  layRows(build, run);
  const bands = build.rows.length - 1;
  for (let i = 0; i + 1 < run.at.length; i++) {
    build.spans++;
    const lat = latOf(run.at[i]!.y);
    const lon = lonOf(run.at[i]!.x, run.at[i]!.z);
    const bucket = bucketFor(build, lat, lon);
    for (let band = 0; band < bands; band++) {
      // Wound so the face points away from the centre: the sea is only ever
      // looked at from above.
      pushVertex(build, run, bucket, i, band);
      pushVertex(build, run, bucket, i + 1, band);
      pushVertex(build, run, bucket, i + 1, band + 1);
      pushVertex(build, run, bucket, i, band);
      pushVertex(build, run, bucket, i + 1, band + 1);
      pushVertex(build, run, bucket, i, band + 1);
      build.triangles += 2;
    }
  }
}

/** Walks every ring's sea-facing edges into runs and emits each. */
function walkCoasts(world: World, build: RibbonBuild): void {
  const seaward = coastEdges(world);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let rawAt: THREE.Vector3[] = [];
  let rawPhase: number[] = [];
  const flush = (): void => {
    emitRun(build, rawAt, rawPhase);
    rawAt = [];
    rawPhase = [];
  };

  for (let r = 0; r < world.rings.length; r++) {
    const ring = (world.rings as LandRing[])[r]!;
    const flags = seaward[r]!;
    const points = ring.points;
    const n = points.length;
    // Cumulative arc length round the ring, so the swell runs continuously along
    // a coast. It advances over land edges too, so a coast interrupted by a
    // frontier picks the phase up where it left it.
    let travelled = 0;
    // Starting at the first land edge means a coastline that wraps the ring is
    // one run and not two. An island has no land edge and any start does.
    let start = 0;
    while (start < n && flags[start] === 1) start++;
    if (start === n) start = 0;

    rawAt = [];
    rawPhase = [];
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const j = (i + 1) % n;
      onSphere(points[i]![0]!, points[i]![1]!, a);
      onSphere(points[j]![0]!, points[j]![1]!, b);
      const span = a.angleTo(b) * PLANET_RADIUS;

      if (flags[i] !== 1 || span < 0.001) {
        flush();
        travelled += span;
        continue;
      }

      if (rawAt.length === 0) {
        rawAt.push(a.clone());
        rawPhase.push(travelled);
      }
      travelled += span;
      rawAt.push(b.clone());
      rawPhase.push(travelled);
    }
    flush();
  }
}

/** One mesh per non-empty bucket, sharing a material. */
function ribbonMeshes(cells: Map<number, Bucket>): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const material = shallowsMaterial();
  for (const bucket of cells.values()) {
    if (bucket.position.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.position, 3));
    // 127, not 128: `normalized: true` divides a signed byte by 127, so scaling
    // by 128 clips every normal that is exactly 1 on an axis.
    const normal = new Int8Array(bucket.normal.length);
    for (let i = 0; i < normal.length; i++) normal[i] = Math.round(bucket.normal[i]! * 127);
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
    const colour = new Uint8Array(bucket.color.length);
    for (let i = 0; i < colour.length; i++) colour[i] = Math.round(clamp(bucket.color[i]!, 0, 1) * 255);
    geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3, true));
    // Uint16 and not normalized: the pair is a distance from the coast and a
    // distance along it, both in whole world units, so an integer attribute read
    // into a float carries them exactly. The rows run from about -16 to 430
    // (offset by `SHORE_BIAS` so the inland one is positive) and the phase wraps
    // at `PHASE_WRAP`, which both foam wavelengths divide, so the wrap is
    // continuous in the wave. 4 bytes a vertex instead of 8.
    const shore = new Uint16Array(bucket.shore.length);
    for (let i = 0; i < shore.length; i += 2) {
      shore[i] = Math.max(0, Math.round(bucket.shore[i]! + SHORE_BIAS));
      shore[i + 1] = Math.round(bucket.shore[i + 1]!) % PHASE_WRAP;
    }
    geometry.setAttribute('aShore', new THREE.BufferAttribute(shore, 2));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'shallows';
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  return meshes;
}

export interface Shallows {
  meshes: THREE.Mesh[];
  spans: number;
  triangles: number;
  rows: number[];
  tolerance: number;
}

/** Builds the ribbon at detail `d` and records its reach and rows for `surfaceLift` and `ribbonColour`. */
export function buildShallows(world: World, d: number): Shallows {
  const rows = shallowRows(d);
  const tolerance = shelfTolerance(d);
  const reach = shelfReach(d);
  builtReach = reach;
  builtRows = rows;
  const build: RibbonBuild = {
    rows,
    tolerance,
    reach,
    cells: new Map(),
    spans: 0,
    triangles: 0,
    rowAt: new Float64Array(0),
    rowColor: new Float64Array(0),
    profiles: new Float64Array(0),
  };
  walkCoasts(world, build);
  return { meshes: ribbonMeshes(build.cells), spans: build.spans, triangles: build.triangles, rows, tolerance };
}
