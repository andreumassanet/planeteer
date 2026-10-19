// The land mesh: each ring's surface at its height plus the relief, a smooth
// normal and a biome colour a vertex, an apron running down into the sea from
// every coastline and a vertical wall under every other boundary. The surface
// and `world.elevationAt` are the same sum, so a foot lands on what is drawn.

import * as THREE from 'three';
import { ShapeUtils } from 'three';
import type { World } from '../geo.ts';
import { insideRing } from '../geo.ts';
import { SHORE_APRON, apronDepth, detailWeightAt, flattenWeightAt, padPoints, prepareTerrain, reliefAt, shoreAt, shoreSample } from '../terrain.ts';
import type { FlagLayer, LandFlagData, RingSpan } from '../land-flags.ts';
import { latOf, lonOf } from '../sphere.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE, onSphere } from './planet.ts';
import { densify, inlandAlong, sagFor, setTightGround } from './tessellation.ts';
import { refine, retriangulate, steinerPoints } from './delaunay.ts';
import type { Lake, LakePlan } from './lakes.ts';
import { clampLat, lakesOf, planLakes, subtractLake } from './lakes.ts';
import { groundShade, paletteFor } from './ground-color.ts';
import { WALL_SHADE, landFlags, toonMaterial } from './materials.ts';

/** How far a wall sinks below sea level, hiding the seam with the ocean sphere. */
const EMBED = 25;
/**
 * How far past the apron's foot the drawn apron runs on down its own line,
 * units, so its edge is under the sea floor `seabed.ts` lays near the player.
 */
const APRON_TUCK = 4;
const APRON_REACH = SHORE_APRON + APRON_TUCK;
/** How much darker the apron is than the ground at its top: wet sand. */
const APRON_SHADE = 0.86;
/**
 * How far the shore has fallen (`shoreAt`) at a boundary edge's middle for the
 * edge to be a coastline: the fall is 1 on the water's edge and loses a
 * hundredth every quarter unit or so inland; a frontier is well short of it.
 */
const COAST_FALL = 0.97;

/**
 * Thinnest triangle worth keeping, world units: its area over its longest edge,
 * which is its own height. Positions are float32 (about a thousandth of a unit
 * at this radius), so the normal of a sliver is rounding error. Height, not
 * area, tells a sliver from a small triangle: the mesh's finest legitimate
 * triangle is a hundred times this.
 */
const MIN_TRIANGLE_HEIGHT = 0.05;

/** A ring's surface, smoothed: what `emit` writes a corner from. */
interface Smooth {
  /** The corners of the triangle being emitted, as indices into the ring's points. */
  a: number;
  b: number;
  c: number;
  /** A normal and a colour a point, as the buffer stores them. */
  normals: Int8Array;
  colors: Uint8Array;
  /** Points under this index are on the ring's outline or a hole's. */
  boundary: number;
  /** Pairs of (offset in the normal buffer, point index) written for outline points. */
  seams: number[];
  /** The raised points, whose coordinates key the seams. */
  keys: THREE.Vector3[];
}

/**
 * A summed normal as three signed bytes, scaled by 127 (`normalized: true`
 * divides a signed byte by 127, so 128 would clip), falling back to the
 * sphere's own up where the sum is nothing.
 */
function packNormal(x: number, y: number, z: number, up: THREE.Vector3, into: Int8Array, i: number): void {
  let length = Math.hypot(x, y, z);
  if (length < 1e-9) {
    x = up.x;
    y = up.y;
    z = up.z;
    length = 1;
  }
  into[i * 3] = Math.round((x / length) * 127);
  into[i * 3 + 1] = Math.round((y / length) * 127);
  into[i * 3 + 2] = Math.round((z / length) * 127);
}

/** Everything the per-ring passes share. Normals and colours are bytes, positions floats. */
interface LandBuild {
  positions: number[];
  normals: number[];
  colors: number[];
  /** Which triangles belong to which ring; see `RingSpan` in `land-flags.ts`. */
  spans: RingSpan[];
  palette: THREE.Color[];
  plan: LakePlan;
  /** The summed face normals at every ring-boundary point, by the point. */
  seamNormals: Map<string, [number, number, number]>;
  /** Every ring's smoothing record, for the seams' second pass. */
  seamsOf: Smooth[];
  /** What the splice could not pair up, and what dropping triangles cost instead. */
  unpaired: number;
  droppedFaces: number;
  /** Faces the ear clipper left inside a hole, and the filter took out. */
  strayFaces: number;
  emit: (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    facing: THREE.Vector3,
    color: THREE.Color,
    smooth?: Smooth,
  ) => void;
}

/** Appends triangles to the build's buffers, flipping each if its normal disagrees with `facing`. */
function createEmitter(build: Pick<LandBuild, 'positions' | 'normals' | 'colors'>): LandBuild['emit'] {
  const { positions, normals, colors } = build;
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const normal = new THREE.Vector3();
  return (a, b, c, facing, color, smooth) => {
    normal.crossVectors(edge1.subVectors(b, a), edge2.subVectors(c, a));
    // Degenerate triangles draw nothing but carry a meaningless normal
    // (Antarctica's ring runs along latitude -90, where every point is the same
    // point). Twice the area over the longest edge is the triangle's height.
    const longest = Math.sqrt(Math.max(
      edge1.lengthSq(),
      edge2.lengthSq(),
      b.distanceToSquared(c),
    ));
    const length = normal.length();
    if (length < MIN_TRIANGLE_HEIGHT * longest) return;
    const flipped = normal.dot(facing) < 0;
    const second = flipped ? c : b;
    const third = flipped ? b : c;
    positions.push(a.x, a.y, a.z, second.x, second.y, second.z, third.x, third.y, third.z);
    if (smooth !== undefined) {
      // The surface's own normals and colours, a vertex each, in the order the
      // corners were just written.
      const order = flipped ? [smooth.a, smooth.c, smooth.b] : [smooth.a, smooth.b, smooth.c];
      for (const i of order) {
        const at = normals.length;
        normals.push(smooth.normals[i * 3]!, smooth.normals[i * 3 + 1]!, smooth.normals[i * 3 + 2]!);
        colors.push(smooth.colors[i * 3]!, smooth.colors[i * 3 + 1]!, smooth.colors[i * 3 + 2]!);
        if (i < smooth.boundary) smooth.seams.push(at, i);
      }
      return;
    }
    // The winding decides the sign: emitting `a, c, b` reverses the cross
    // product, and the normal has to be the one the emitted triangle has.
    const scale = length > 0 ? ((flipped ? -127 : 127) / length) : 0;
    const nx = Math.round(normal.x * scale);
    const ny = Math.round(normal.y * scale);
    const nz = Math.round(normal.z * scale);
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b8 = Math.round(color.b * 255);
    for (let v = 0; v < 3; v++) {
      normals.push(nx, ny, nz);
      colors.push(r, g, b8);
    }
  };
}

/** How one ring deals with each lake it touches. */
interface RingCuts {
  /** The coastline, with every spliced lake taken out of it. */
  points: number[][];
  /** Lakes wholly inside the ring, cut as holes. */
  holes: Lake[];
  /** Lakes that could not be paired; their triangles are dropped instead. */
  drops: Lake[];
}

/**
 * Takes the lakes out of a ring's coastline before anything is built. A splice
 * changes the outline itself, so it happens on the raw points before `densify`:
 * two countries sharing a border through a lake then hand `densify` the same
 * ends and get the same subdivision.
 */
function cutLakes(build: LandBuild, index: number): RingCuts {
  let points = build.plan.land[index]!.points;
  const holes: Lake[] = [];
  const drops: Lake[] = [];
  for (const { lake, cut } of build.plan.cuts[index]!) {
    if (cut.kind === 'hole') {
      holes.push(lake);
      continue;
    }
    if (cut.kind === 'unpaired') {
      build.unpaired++;
      drops.push(lake);
      continue;
    }
    // Asked again against the coastline as it now stands: two lakes on one ring
    // are two cuts, and the second must see what the first did.
    const again = subtractLake(points, lake);
    if (again.kind === 'splice') points = again.contour;
    else if (again.kind === 'hole') holes.push(lake);
    else if (again.kind === 'unpaired') {
      build.unpaired++;
      drops.push(lake);
    }
  }
  return { points, holes, drops };
}

/** A ring's triangulated surface, as indices into `unit` / `relief`. */
interface RingSurface {
  outline: number[][];
  holeOutlines: number[][][];
  /** Contour points then each hole's: the ring's boundary vertices come first. */
  boundary: number;
  unit: THREE.Vector3[];
  relief: number[];
  triangles: number[][];
}

/** How close to each other, and to the ring's own boundary, a lake's shore point may be put into the mesh, degrees. */
const SHORE_POINT_CLEAR = 0.02;

/**
 * The interior points of a ring with a lake it could not splice: the lattice
 * off the water, and the lake's own shore where it runs inside the ring. The
 * faces on the water are dropped afterwards, and with vertices on the shore
 * the drop follows it, where with the lattice alone a kept triangle could
 * reach a whole lattice step out over the water.
 */
function shoreSteiner(lattice: readonly number[], drops: readonly Lake[], outline: readonly number[][]): number[] {
  const out: number[] = [];
  for (let i = 0; i < lattice.length; i += 2) {
    const lon = lattice[i]!;
    const lat = lattice[i + 1]!;
    if (!drops.some((lake) => insideRing(lake.points, lon, clampLat(lat)))) out.push(lon, lat);
  }
  const ring = outline as number[][];
  const c = SHORE_POINT_CLEAR;
  for (const lake of drops) {
    let lastLon = Infinity;
    let lastLat = Infinity;
    for (const [lon, lat] of lake.outline) {
      if (Math.abs(lon! - lastLon) < c && Math.abs(lat! - lastLat) < c) continue;
      const clear = [[0, 0], [c, 0], [-c, 0], [0, c], [0, -c]].every(([dx, dy]) => insideRing(ring, lon! + dx!, clampLat(lat! + dy!)));
      if (!clear) continue;
      out.push(lon!, lat!);
      lastLon = lon!;
      lastLat = lat!;
    }
  }
  return out;
}

/** Spacing of the points laid under a monument's pad, world units. */
const PAD_POINT_SPACING = 18;

/**
 * Points on a square lattice under every monument's pad that falls in this
 * ring (`padPoints`), clear of its outline and of its lakes by
 * `SHORE_POINT_CLEAR`, for `retriangulate` to put in with the ring's own.
 */
function padSteiner(outline: readonly number[][], wet: readonly Lake[]): number[] {
  const out: number[] = [];
  let w = Infinity;
  let e = -Infinity;
  let s = Infinity;
  let n = -Infinity;
  for (const [lon, lat] of outline) {
    w = Math.min(w, lon!);
    e = Math.max(e, lon!);
    s = Math.min(s, lat!);
    n = Math.max(n, lat!);
  }
  const ring = outline as number[][];
  const c = SHORE_POINT_CLEAR;
  for (const pad of padPoints()) {
    const dLat = pad.reach / UNITS_PER_DEGREE;
    const dLon = dLat / Math.max(0.05, Math.cos(pad.lat * (Math.PI / 180)));
    if (pad.lat + dLat < s || pad.lat - dLat > n || pad.lon + dLon < w || pad.lon - dLon > e) continue;
    const stepLat = PAD_POINT_SPACING / UNITS_PER_DEGREE;
    const stepLon = stepLat / Math.max(0.05, Math.cos(pad.lat * (Math.PI / 180)));
    for (let lat = pad.lat - dLat; lat <= pad.lat + dLat; lat += stepLat) {
      for (let lon = pad.lon - dLon; lon <= pad.lon + dLon; lon += stepLon) {
        const clear = [[0, 0], [c, 0], [-c, 0], [0, c], [0, -c]].every(([dx, dy]) => insideRing(ring, lon + dx!, clampLat(lat + dy!)));
        if (!clear || wet.some((lake) => insideRing(lake.points, lon, clampLat(lat)))) continue;
        out.push(lon, lat);
      }
    }
  }
  return out;
}

/** Triangulates a ring: ear clipper, Delaunay with interior points, relief refinement, a final flip pass. Null when it yields nothing. */
function triangulateRing(build: LandBuild, cuts: RingCuts): RingSurface | null {
  const { holes, drops } = cuts;
  const outline = densify(cuts.points);
  const holeOutlines = holes.map((lake) => lake.outline);
  const contour = outline.map(([lon, lat]) => new THREE.Vector2(lon!, lat!));

  let faces: number[][];
  try {
    faces = ShapeUtils.triangulateShape(
      contour,
      holeOutlines.map((hole) => hole.map(([lon, lat]) => new THREE.Vector2(lon!, lat!))),
    );
  } catch {
    return null;
  }
  if (faces.length === 0) return null;

  // The vertex list earcut indexed: the contour, then each hole in turn.
  const all = holeOutlines.length === 0 ? outline : outline.concat(...holeOutlines);
  const unit = all.map(([lon, lat]) => onSphere(lon!, lat!, new THREE.Vector3()));
  // The same points in the plane they were triangulated in, where `refine`
  // takes its midpoints.
  const lonLat = all.flatMap(([lon, lat]) => [lon!, lat!]);
  const lattice = steinerPoints([outline, ...holeOutlines]).concat(padSteiner(outline, [...holes, ...drops]));
  faces = retriangulate(unit, lonLat, faces, drops.length === 0 ? lattice : shoreSteiner(lattice, drops, outline), undefined, true);
  const relief = unit.map((p) => reliefAt(p.x, p.y, p.z));
  const scratch = new THREE.Vector3();
  // A second flip pass after the refinement, which leaves fans of needles. A
  // new edge must pass the test `refine` put every other edge to.
  let triangles = retriangulate(unit, lonLat, refine(unit, lonLat, relief, faces), [], (a, b) => {
    onSphere((lonLat[a * 2]! + lonLat[b * 2]!) * 0.5, (lonLat[a * 2 + 1]! + lonLat[b * 2 + 1]!) * 0.5, scratch);
    const pad = Math.max(flattenWeightAt(scratch.x, scratch.y, scratch.z), detailWeightAt(scratch.x, scratch.y, scratch.z));
    return Math.abs(reliefAt(scratch.x, scratch.y, scratch.z) - (relief[a]! + relief[b]!) * 0.5) <= sagFor(pad, inlandAlong(unit[a]!, unit[b]!, scratch));
  });

  // The fallback for a lake that could not be spliced: drop the faces on the
  // water, whose shore the lake's own points (`shoreSteiner`) are vertices of.
  // A hole is asked too: a lake outline that touches itself at a point is a
  // hole the ear clipper fills a lobe of, and those faces are water as well.
  const wet = [...drops, ...holes];
  if (wet.length > 0) {
    const before = triangles.length;
    let strays = 0;
    triangles = triangles.filter(([a, b, c]) => {
      // From `unit`, not `all`: `refine` grew the vertex array.
      scratch.copy(unit[a!]!).add(unit[b!]!).add(unit[c!]!).normalize();
      const lat = clampLat(latOf(scratch.y));
      const lon = lonOf(scratch.x, scratch.z);
      for (const lake of wet) {
        const [w, south, e, north] = lake.box;
        if (lon < w || lon > e || lat < south || lat > north || !insideRing(lake.points, lon, lat)) continue;
        if (holes.includes(lake)) strays++;
        return false;
      }
      return true;
    });
    build.strayFaces += strays;
    build.droppedFaces += before - triangles.length - strays;
  }
  return { outline, holeOutlines, boundary: all.length, unit, relief, triangles };
}

/**
 * Emits a ring's surface with the area-weighted mean normal of the faces round
 * each vertex and the biome's colour at its own point. A continuous light on
 * flat faces would show a hard crease the size of each triangle.
 *
 * A ring's outline is shared with its neighbour, and each side would average
 * only its own faces, leaving a seam of light along every frontier. Boundary
 * vertices therefore keep their sums in `seamNormals`, keyed by the raised point
 * (both rings raise it from the same numbers, so the key is exact), and are
 * rewritten once every ring is in.
 */
function emitSurface(
  build: LandBuild,
  surface: RingSurface,
  raised: THREE.Vector3[],
  tint: THREE.Color,
): void {
  const { unit, relief, triangles, boundary } = surface;
  const { seamNormals } = build;
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const ground = new THREE.Color();
  const count = raised.length;
  const vertexNormals = new Float32Array(count * 3);
  for (const [a, b, c] of triangles as [number, number, number][]) {
    const pa = raised[a]!;
    const pb = raised[b]!;
    const pc = raised[c]!;
    normal.crossVectors(edge1.subVectors(pb, pa), edge2.subVectors(pc, pa));
    // Outward, whichever way the triangulator wound it; the length is twice
    // the area, which is the weight.
    if (normal.dot(unit[a]!) < 0) normal.negate();
    for (const i of [a, b, c]) {
      vertexNormals[i * 3] = vertexNormals[i * 3]! + normal.x;
      vertexNormals[i * 3 + 1] = vertexNormals[i * 3 + 1]! + normal.y;
      vertexNormals[i * 3 + 2] = vertexNormals[i * 3 + 2]! + normal.z;
    }
  }
  for (let i = 0; i < boundary; i++) {
    const p = raised[i]!;
    const key = `${p.x},${p.y},${p.z}`;
    const sum = seamNormals.get(key);
    if (sum === undefined) seamNormals.set(key, [vertexNormals[i * 3]!, vertexNormals[i * 3 + 1]!, vertexNormals[i * 3 + 2]!]);
    else {
      sum[0] += vertexNormals[i * 3]!;
      sum[1] += vertexNormals[i * 3 + 1]!;
      sum[2] += vertexNormals[i * 3 + 2]!;
    }
  }
  const smooth: Smooth = {
    a: 0,
    b: 0,
    c: 0,
    normals: new Int8Array(count * 3),
    colors: new Uint8Array(count * 3),
    boundary,
    seams: [],
    keys: raised,
  };
  const used = new Uint8Array(count);
  for (const [a, b, c] of triangles as [number, number, number][]) used[a] = used[b] = used[c] = 1;
  for (let i = 0; i < count; i++) {
    if (used[i] === 0) continue;
    packNormal(vertexNormals[i * 3]!, vertexNormals[i * 3 + 1]!, vertexNormals[i * 3 + 2]!, unit[i]!, smooth.normals, i);
    const u = unit[i]!;
    groundShade(u.x, u.y, u.z, relief[i]!, tint, ground);
    smooth.colors[i * 3] = Math.round(ground.r * 255);
    smooth.colors[i * 3 + 1] = Math.round(ground.g * 255);
    smooth.colors[i * 3 + 2] = Math.round(ground.b * 255);
  }
  for (const [a, b, c] of triangles as [number, number, number][]) {
    smooth.a = a;
    smooth.b = b;
    smooth.c = c;
    build.emit(raised[a]!, raised[b]!, raised[c]!, unit[a]!, ground, smooth);
  }
  build.seamsOf.push(smooth);
}

/**
 * One quad per boundary edge. The outline was densified before triangulating,
 * so these edges are exactly the boundary of the surface above, relief
 * included, since the quads are built from the raised points.
 *
 * A coastline's quad is the apron: from the edge down the apron's line
 * (`apronDepth`) to `APRON_REACH` out to sea, square to the edge; at a corner
 * a wedge joins one quad's foot to the next's. Any other boundary (a frontier) drops a vertical wall to
 * `EMBED` under the sea, hidden under the neighbour's land. `boundaries` lists
 * `[start, length]` runs of the ring's vertices: the coastline first, then
 * each lake rim this ring owns, whose every edge is a shore.
 */
function emitWalls(
  build: LandBuild,
  surface: RingSurface,
  raised: THREE.Vector3[],
  tint: THREE.Color,
  boundaries: [number, number][],
): void {
  const { unit, relief } = surface;
  const base = PLANET_RADIUS - EMBED;
  const apronFoot = PLANET_RADIUS - apronDepth(APRON_REACH);
  const up = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const cliff = new THREE.Color();
  const mid = new THREE.Vector3();
  const footA = new THREE.Vector3();
  const footB = new THREE.Vector3();
  const footC = new THREE.Vector3();
  const wayMean = new THREE.Vector3();
  const shore = shoreSample();
  /** A corner's foot: out along `way` to `APRON_REACH`, at the apron's foot. */
  const footAt = (corner: THREE.Vector3, way: THREE.Vector3, out: THREE.Vector3): void => {
    out.copy(corner).addScaledVector(way, APRON_REACH / PLANET_RADIUS).setLength(apronFoot);
  };
  boundaries.forEach(([start, count], run) => {
    // Rings are wound with the land on the right of a -> b, so outward is
    // cross(up, b - a) on a right-handed planet; a lake rim is wound so the
    // same sign points at the water. The reverse builds every wall facing
    // inland, where it is invisible.
    const outward: THREE.Vector3[] = [];
    const coast = new Uint8Array(count);
    for (let n = 0; n < count; n++) {
      const i = start + n;
      const j = start + ((n + 1) % count);
      up.copy(unit[i]!);
      dir.subVectors(raised[j]!, raised[i]!);
      outward.push(new THREE.Vector3().crossVectors(up, dir).projectOnPlane(up).normalize());
      mid.addVectors(unit[i]!, unit[j]!).normalize();
      coast[n] = run > 0 || shoreAt(mid.x, mid.y, mid.z, shore).fall > COAST_FALL ? 1 : 0;
    }
    /** Whether the coast bulges seaward where edge `n` ends: the next edge's outward turns on along `n`. */
    const turnsOut = (n: number): boolean => {
      const next = (n + 1) % count;
      if (coast[next] === 0) return true;
      dir.subVectors(raised[start + next]!, raised[start + n]!);
      return outward[next]!.dot(dir) >= 0;
    };
    /** The way out at corner `c` for edge `e` (one it ends or starts): the edge's own at a bulge, else the mean of both, so the feet do not cross. */
    const wayAt = (c: number, e: number): THREE.Vector3 => {
      const before = (c + count - 1) % count;
      if (coast[before] === 0 || coast[c] === 0 || turnsOut(before)) return outward[e]!;
      wayMean.addVectors(outward[before]!, outward[c]!).projectOnPlane(unit[start + c]!);
      return wayMean.lengthSq() < 1e-12 ? outward[e]! : wayMean.normalize();
    };
    for (let n = 0; n < count; n++) {
      const i = start + n;
      const j = start + ((n + 1) % count);
      const topA = raised[i]!;
      const topB = raised[j]!;
      up.copy(unit[i]!);
      // The wall is the ground above it a shade down; taking the shade from the
      // biome rather than the country makes a Saharan coast a sand cliff and a
      // Norwegian one grey.
      groundShade(up.x, up.y, up.z, relief[i]!, tint, cliff);
      if (coast[n] === 1) {
        const next = (n + 1) % count;
        const convex = turnsOut(n);
        footAt(unit[i]!, wayAt(n, n), footA);
        footAt(unit[j]!, wayAt(next, n), footB);
        cliff.multiplyScalar(APRON_SHADE);
        build.emit(topA, footA, footB, up, cliff);
        build.emit(topA, footB, topB, up, cliff);
        // The wedge a convex corner leaves between this quad's foot and the next's.
        if (coast[next] === 1 && convex) {
          footAt(unit[j]!, outward[next]!, footC);
          build.emit(topB, footB, footC, up, cliff);
        }
        continue;
      }
      cliff.multiplyScalar(WALL_SHADE);
      footA.copy(unit[i]!).multiplyScalar(base);
      footB.copy(unit[j]!).multiplyScalar(base);
      build.emit(topA, footA, footB, outward[n]!, cliff);
      build.emit(topA, footB, topB, outward[n]!, cliff);
    }
  });
}

/** Builds one land ring's surface and walls into the shared buffers; a ring that triangulates to nothing is skipped. */
function buildRing(build: LandBuild, index: number): void {
  const ring = build.plan.land[index]!;
  const cuts = cutLakes(build, index);
  const surface = triangulateRing(build, cuts);
  if (surface === null) return;
  const { unit, relief, outline, holeOutlines } = surface;

  // The shelf comes from the ring, the relief from the point: exactly the sum
  // `world.elevationAt` returns.
  const height = PLANET_RADIUS + ring.height;
  const raised = unit.map((p, i) => p.clone().multiplyScalar(height + relief[i]!));
  const tint = build.palette[ring.country - 1]!;

  // Where this ring's triangles start, so `land-flags.ts` can find them again:
  // the buffer is grouped as a ring's surface, then its wall, then the next ring.
  const surfaceFrom = build.positions.length / 9;
  emitSurface(build, surface, raised, tint);

  const wallFrom = build.positions.length / 9;
  const boundaries: [number, number][] = [[0, outline.length]];
  let cursor = outline.length;
  cuts.holes.forEach((lake, k) => {
    const length = holeOutlines[k]!.length;
    if (build.plan.wallOwner.get(lake) === ring) boundaries.push([cursor, length]);
    cursor += length;
  });
  emitWalls(build, surface, raised, tint, boundaries);

  build.spans.push({
    ring,
    surface: [surfaceFrom, wallFrom],
    wall: [wallFrom, build.positions.length / 9],
  });
}

/** Rewrites every boundary vertex with the mean over every ring that shares the point. */
function resolveSeams(build: LandBuild): void {
  const scratch = new THREE.Vector3();
  const packed = new Int8Array(3);
  for (const smooth of build.seamsOf) {
    for (let k = 0; k < smooth.seams.length; k += 2) {
      const at = smooth.seams[k]!;
      const i = smooth.seams[k + 1]!;
      const p = smooth.keys[i]!;
      const sum = build.seamNormals.get(`${p.x},${p.y},${p.z}`)!;
      packNormal(sum[0], sum[1], sum[2], scratch.copy(p).normalize(), packed, 0);
      build.normals[at] = packed[0]!;
      build.normals[at + 1] = packed[1]!;
      build.normals[at + 2] = packed[2]!;
    }
  }
}

/**
 * The land, built from the country outlines themselves: a surface at the ring's
 * height plus its relief, and the apron running from it into the sea. The
 * coastline and `countryAt` are the same data, so a monument snapped to the
 * shore lands on the shore you can see; the waterline is `SHORE_WATERLINE`
 * further out, on the apron.
 *
 * Normals and colours are bytes: position as Float32 is needed this far from the
 * origin, but a unit normal and a palette colour lose a quarter of a degree at
 * eight bits, and this is the largest buffer in the project.
 *
 * `tight` names the ground that must keep to the relief inland as well as at
 * the coast (`roadCorridors`): every builder of the land hands in the same, or
 * the drawn land differs between them.
 */
export function buildLand(world: World, tight: ((point: THREE.Vector3) => boolean) | null = null): THREE.Mesh {
  setTightGround(tight);
  try {
    return buildLandWith(world);
  } finally {
    setTightGround(null);
  }
}

function buildLandWith(world: World): THREE.Mesh {
  // Idempotent, and normally already done by `loadWorld`: a mesh built against
  // a different terrain than the one the player walks on is the failure this
  // arrangement exists to prevent.
  prepareTerrain(world.rings, UNITS_PER_DEGREE, (lat, lon) => world.countryAt(lat, lon) !== 0);

  const lakes = lakesOf(world);
  const plan = planLakes(world, lakes);
  const buffers = { positions: [] as number[], normals: [] as number[], colors: [] as number[] };
  const build: LandBuild = {
    ...buffers,
    spans: [],
    palette: paletteFor(world),
    plan,
    seamNormals: new Map(),
    seamsOf: [],
    unpaired: 0,
    droppedFaces: 0,
    strayFaces: 0,
    emit: createEmitter(buffers),
  };

  for (let index = 0; index < plan.land.length; index++) buildRing(build, index);
  resolveSeams(build);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(build.positions, 3));
  // Non-indexed: the surface carries a smooth normal a vertex and the walls a
  // flat one a face, which an index could not share.
  geometry.setAttribute('normal', new THREE.Int8BufferAttribute(build.normals, 3, true));
  geometry.setAttribute('color', new THREE.Uint8BufferAttribute(build.colors, 3, true));
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, toonMaterial());
  mesh.name = 'land';
  // Receives the sun's shadows and never casts them: a shadow pass over the
  // whole land is a second draw of the planet.
  mesh.receiveShadow = true;
  // Where every ring's triangles are and the shade its wall took, which is all
  // `land-flags.ts` needs to paint a flag over them.
  mesh.userData['landFlags'] = { spans: build.spans, wallShade: WALL_SHADE } satisfies LandFlagData;
  mesh.userData['flags'] = (): Promise<FlagLayer> => landFlags(world, mesh);
  // What the lakes cost and what the splice could not do, for `pnpm check`.
  mesh.userData['lakes'] = {
    count: lakes.length,
    holes: plan.cuts.reduce((n, cuts) => n + cuts.filter((c) => c.cut.kind === 'hole').length, 0),
    splices: plan.cuts.reduce((n, cuts) => n + cuts.filter((c) => c.cut.kind === 'splice').length, 0),
    unpaired: build.unpaired,
    droppedFaces: build.droppedFaces,
    strayFaces: build.strayFaces,
  };
  return mesh;
}
