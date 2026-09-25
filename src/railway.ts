import * as THREE from 'three';
import type { World } from './geo.ts';
import { GROUND_MARKS_GLSL, PLANET_RADIUS, bindGroundWeather, groundWeatherChunk, groundWeatherGLSL } from './globe.ts';
import type { Place } from './places.ts';
import type { Model } from './models.ts';
import { paintModel } from './models.ts';
import { ROAD_CLASSES, coursePoint, courseTangent, parameterAt, roadGeometryFor, roadIndexFor } from './roads.ts';
import type { Road } from './roads.ts';
import { createToonRamp, PALETTE } from './theme.ts';
import { frameOpenFor } from './view.ts';
import { PROUD, assemble, craftContext, soupOf } from './craft/build.ts';
import {
  BED_FOOT,
  BED_HALF,
  CAR_GAP,
  CAR_PITCH,
  CAR_WIDTH,
  GAUGE,
  HALL_DEPTH,
  HALL_FROM,
  HALL_LENGTH,
  PLATFORM_FROM,
  PLATFORM_INNER,
  PLATFORM_LENGTH,
  PLATFORM_RISE,
  PLATFORM_WIDTH,
  RAIL_TOP,
  SHOULDER_DROP,
  TRAIN_SPEED,
  consistOf,
  crownAt,
  emptyStation,
  lineStation,
  nearestOnPath,
  phaseOf,
  stationPoint,
  trainAt,
} from './rails.ts';
import type { RailNetwork, StationFrame, TrainState } from './rails.ts';
import type { PassingSource } from './passing-sound.ts';

/**
 * The railway, drawn and run: the track laid near the eye, the stations, the
 * level crossings and the trains.
 *
 * **The track is laid the way a road is**, as a ribbon on the line's own
 * course (`rails.ts`), in chunks of `CHUNK` units streamed round the camera: a
 * bed of ballast at the crown with its shoulders buried in the ground, and —
 * within `DETAIL_REACH` — the sleepers and the two rails on it, which past
 * that are one darker band down the bed. No ink on any of it, for the road's
 * reason: it is a mark on the ground, not a thing on it, and it reads the
 * ground's weather (snow lies on the ballast as on the verge). Where a road
 * crosses, the bed stops for the carriageway and the rails run on over the
 * asphalt; two posts with a crossbuck stand at each corner, their lamps
 * flashing while a train is near.
 *
 * **A station and a train are things**, inked and solid. A station is a
 * platform along its track, a canopy and a hall behind it, merged into one
 * buffer the way a craft is (`craft/build.ts`). A train is its cars, each
 * one of the Train Kit's baked models (`scripts/build-kit.ts`) scaled to the
 * traffic's section and stood on the rail head, one mesh a car: a moving
 * thing is its own mesh, so the trains are near and capped (`MAX_TRAINS`).
 * Where each is comes from `trainAt`: nothing here integrates.
 */

const CHUNK = 150;
const NEAR_ROW = 3;
const FAR_ROW = 9;
/** Within this of the eye a chunk carries its sleepers and rails. */
const DETAIL_REACH = 420;
/** And past this, capped by the haze, nothing is drawn. */
const DRAW_REACH = 2600;
const STATION_REACH = 1800;
const TRAIN_REACH = 1600;
const MAX_TRAINS = 4;
const RESCAN_S = 0.4;
const RESCAN_MOVE = 60;
/** Chunks built a frame at most, nearest first; the first near one always goes. */
const BUILDS_PER_FRAME = 3;

const SLEEPER_STEP = 1.3;
const SLEEPER_LENGTH = 2.6 * (GAUGE / 1.435);
const SLEEPER_WIDTH = 0.45;
const SLEEPER_TOP = 0.28;
const RAIL_WIDTH = 0.22;
/** How far past the carriageway's edge the bed stops at a level crossing. */
const CROSSING_MARGIN = 0.6;

const BALLAST = new THREE.Color(PALETTE.tan).multiplyScalar(0.78);
const SHOULDER = new THREE.Color(PALETTE.tan).multiplyScalar(0.66);
const BAND = new THREE.Color(PALETTE.bark).multiplyScalar(0.95);
const SLEEPER = new THREE.Color(PALETTE.bark);
const RAIL_SIDE = new THREE.Color(PALETTE.steel);
const RAIL_HEAD = new THREE.Color(PALETTE.bone).multiplyScalar(0.9);

export interface RailwayFrame {
  dt: number;
  seconds: number;
  camera: THREE.Camera;
  player: THREE.Vector3;
  fogFar: number;
}

export interface Railway {
  readonly group: THREE.Group;
  update(frame: RailwayFrame): void;
  /** How high the ballast or a platform stands here, as a radius, or 0 off them. */
  bedHeightAt(point: THREE.Vector3): number;
  /** The trains' cars and the station halls as walls: true if a body of `radius` at `point` overlaps one, and `push` the way out. */
  collide(point: THREE.Vector3, radius: number, push: THREE.Vector3): boolean;
  /** Every drawn car, as a point and a radius, for what the road traffic stops for. */
  eachCar(visit: (point: THREE.Vector3, radius: number, moving: boolean) => void): void;
  /** The nearest train this frame, for the ear, or null. */
  readonly passing: PassingSource | null;
  /** Told when a train sounds its horn at a crossing, with how near it is: 1 beside it. */
  onHorn: ((near: number) => void) | null;
  /** The Train Kit's models, once they arrive: until then the track and the stations stand and no train runs. */
  setKit(kit: ReadonlyMap<string, Model>): void;
  enabled: boolean;
  readonly stats: { lines: number; chunks: number; stations: number; trains: number; cars: number; nearestMoving: number; ms: number };
}

export interface RailwayOptions {
  world: World;
  places: readonly Place[];
  roads: readonly Road[];
  network: RailNetwork;
  /** The Train Kit's baked models, by id, or empty until they arrive (`setKit`). */
  kit?: ReadonlyMap<string, Model>;
  /** The material the kit's models are drawn with (`modelMaterial`). */
  material: THREE.Material;
  /**
   * The drawn land's radius under a point (`drawnRadius`), where the mesh and
   * the relief part: the bed's shoulders and a station's slabs reach down to
   * the lower of the two, so neither hangs over a dip the mesh drew. The relief
   * alone when absent.
   */
  drawnGround?: (point: THREE.Vector3) => number;
}

interface Crossing {
  s: number;
  /** How far along the line either side of `s` the road's carriageway reaches. */
  half: number;
  /** The road's direction there, a unit tangent. */
  across: THREE.Vector3;
  point: THREE.Vector3;
}

interface Chunk {
  key: string;
  line: number;
  index: number;
  near: boolean;
  bed: THREE.Mesh;
  props: THREE.Group | null;
  seen: number;
}

interface Drawn {
  key: string;
  group: THREE.Group;
  frame: StationFrame;
  level: number;
  seen: number;
}

interface Car {
  holder: THREE.Group;
  model: string;
  half: number;
  height: number;
}

interface Train {
  line: number;
  cars: Car[];
  state: TrainState;
  seen: number;
  /** The crossings this train has sounded its horn for on its current run. */
  sounded: Set<number>;
  direction: number;
}

export function createRailway(options: RailwayOptions): Railway {
  const { world, places, roads, network } = options;
  let kit: ReadonlyMap<string, Model> = options.kit ?? new Map();
  const group = new THREE.Group();
  group.name = 'railway';
  const roadIndex = roads.length > 0 ? roadIndexFor(roads, places) : null;
  const roadGeometry = roads.length > 0 ? roadGeometryFor(roads, places) : null;

  // --- materials -------------------------------------------------------------

  const bedMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: createToonRamp(4) });
  bedMaterial.userData.outlineParameters = { visible: false };
  bedMaterial.polygonOffset = true;
  bedMaterial.polygonOffsetFactor = -1;
  bedMaterial.polygonOffsetUnits = -2;
  // The weather's chunk calls `atlasNoise`, which `GROUND_MARKS_GLSL` defines:
  // without it the fragment program fails to link and the bed, the sleepers
  // and the rails — one mesh a chunk, all this material — draw nothing, while
  // the trains, drawn with the kit's material, run on air.
  bedMaterial.onBeforeCompile = (shader) => {
    bindGroundWeather(shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRailWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvRailWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRailWorld;\n${GROUND_MARKS_GLSL}\n${groundWeatherGLSL()}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n  ${groundWeatherChunk('vRailWorld')}`);
  };
  bedMaterial.customProgramCacheKey = () => 'railway:bed:weather';
  bedMaterial.name = 'railway-bed';

  // --- crossings -------------------------------------------------------------

  const crossingsOf = new Map<number, Crossing[]>();
  const roadHits: number[] = [];
  const cp = new THREE.Vector3();
  const ct = new THREE.Vector3();
  /**
   * Where a line crosses the roads, worked out on first ask: walked every
   * `CROSSING_STEP`, each road met within its carriageway's reach followed
   * until it is left, and the crossing put where the line came nearest its
   * centre — the walk `rail-trial.ts` tested the line with.
   */
  const CROSSING_STEP = 2;
  function crossings(line: number): Crossing[] {
    const known = crossingsOf.get(line);
    if (known !== undefined) return known;
    const found: Crossing[] = [];
    if (roadIndex !== null && roadGeometry !== null) {
      const path = network.path(line);
      const course = network.course(line);
      const runs = new Map<number, { best: number; s: number; roadS: number }>();
      const live = new Set<number>();
      const settle = (r: number, run: { best: number; s: number; roadS: number }): void => {
        if (run.best > CROSSING_STEP * 1.5) return;
        const roadPath = roadGeometry.path(r);
        courseTangent(roadGeometry.course(r), parameterAt(roadPath, run.roadS), ct);
        const railTangent = courseTangent(course, parameterAt(path, run.s), new THREE.Vector3());
        const sin = Math.max(0.3, Math.sqrt(Math.max(0, 1 - railTangent.dot(ct) ** 2)));
        const carriageway = ROAD_CLASSES[roads[r]!.cls]!.width / 2;
        found.push({ s: run.s, half: carriageway / sin + CROSSING_MARGIN, across: ct.clone(), point: coursePoint(course, parameterAt(path, run.s), new THREE.Vector3()) });
      };
      for (let s = 0; s <= path.length; s += CROSSING_STEP) {
        coursePoint(course, parameterAt(path, s), cp);
        live.clear();
        for (const r of roadIndex.near(cp, 12, roadHits)) {
          const hit = nearestOnPath(roadGeometry.path(r), cp);
          if (hit.off > 12) continue;
          live.add(r);
          const run = runs.get(r);
          if (run === undefined) runs.set(r, { best: hit.off, s, roadS: hit.s });
          else if (hit.off < run.best) {
            run.best = hit.off;
            run.s = s;
            run.roadS = hit.s;
          }
        }
        for (const [r, run] of runs) {
          if (live.has(r)) continue;
          settle(r, run);
          runs.delete(r);
        }
      }
      for (const [r, run] of runs) settle(r, run);
    }
    found.sort((a, b) => a.s - b.s);
    crossingsOf.set(line, found);
    return found;
  }

  // --- the bed ---------------------------------------------------------------

  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const q = new THREE.Vector3();

  /** The ground's radius at a direction: the lower of the relief and the drawn land. */
  const drawnGround = options.drawnGround;
  const groundAt = (direction: THREE.Vector3): number => {
    const relief = PLANET_RADIUS + world.elevationAt(direction);
    if (drawnGround === undefined) return relief;
    // Over the water the probe answers the sea's radius: the relief there.
    const drawn = drawnGround(direction);
    return drawn > PLANET_RADIUS + 0.5 ? Math.min(relief, drawn) : relief;
  };

  function buildBed(line: number, index: number, near: boolean): { bed: THREE.Mesh; props: THREE.Group | null } {
    const path = network.path(line);
    const crown = network.crown(line);
    const course = network.course(line);
    const s0 = index * CHUNK;
    const s1 = Math.min(path.length, s0 + CHUNK);
    const row = near ? NEAR_ROW : FAR_ROW;
    const steps = Math.max(1, Math.ceil((s1 - s0) / row));
    const cuts = crossings(line).filter((c) => c.s + c.half > s0 - row && c.s - c.half < s1 + row);
    const inCrossing = (s: number): boolean => cuts.some((c) => Math.abs(s - c.s) < c.half);

    // Relative to the chunk's first point, so the buffer is small numbers.
    coursePoint(course, parameterAt(path, s0), q);
    const origin = q.clone().multiplyScalar(crownAt(crown, s0));

    const positions: number[] = [];
    const colors: number[] = [];
    const push = (v: THREE.Vector3, c: THREE.Color): void => {
      positions.push(v.x - origin.x, v.y - origin.y, v.z - origin.z);
      colors.push(c.r, c.g, c.b);
    };
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, colour: THREE.Color): void => {
      // a-b across one row, left to right, d-c across the next: with `side`
      // the track's right (`t x up`), right x along is up, so this faces out.
      push(a, colour); push(b, colour); push(c, colour);
      push(a, colour); push(c, colour); push(d, colour);
    };

    // The cross-section, left to right looking along +s.
    const across = near ? [-BED_FOOT, -BED_HALF, BED_HALF, BED_FOOT] : [-BED_FOOT, -BED_HALF, -GAUGE / 2 - 0.6, GAUGE / 2 + 0.6, BED_HALF, BED_FOOT];
    const colourOf = near ? [SHOULDER, BALLAST, SHOULDER] : [SHOULDER, BALLAST, BAND, BALLAST, SHOULDER];
    const rows: THREE.Vector3[][] = [];
    const rowS: number[] = [];
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
          const foot = Math.min(r - SHOULDER_DROP, groundAt(point) - 1.5);
          section.push(point.multiplyScalar(foot));
        } else section.push(point.multiplyScalar(r));
      }
      rows.push(section);
      rowS.push(s);
    }
    for (let k = 0; k < steps; k++) {
      const mid = (rowS[k]! + rowS[k + 1]!) / 2;
      if (inCrossing(mid)) continue;
      const a = rows[k]!;
      const b = rows[k + 1]!;
      for (let j = 0; j + 1 < across.length; j++) quad(a[j]!, a[j + 1]!, b[j + 1]!, b[j]!, colourOf[j]!);
    }

    let props: THREE.Group | null = null;
    if (near) {
      // Sleepers, square to the track, on the crown.
      const first = Math.ceil(s0 / SLEEPER_STEP) * SLEEPER_STEP;
      for (let s = first; s < s1; s += SLEEPER_STEP) {
        if (inCrossing(s)) continue;
        const tt = parameterAt(path, s);
        coursePoint(course, tt, p);
        courseTangent(course, tt, t);
        side.crossVectors(t, p).normalize();
        up.copy(p);
        const r = crownAt(crown, s);
        slab(p, t, side, up, r, 0, SLEEPER_LENGTH / 2, SLEEPER_WIDTH / 2, SLEEPER_TOP, SLEEPER, push);
      }
      // The two rails, the whole chunk, crossings included: over the asphalt.
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
            quad(last[0]!, last[1]!, here[1]!, here[0]!, RAIL_SIDE);
            quad(last[1]!, last[2]!, here[2]!, here[1]!, RAIL_HEAD);
            quad(last[2]!, last[3]!, here[3]!, here[2]!, RAIL_SIDE);
          }
          last = here;
        }
      }
      // The crossings' furniture: a post with a crossbuck and a lamp at each corner.
      if (cuts.length > 0) props = crossingProps(line, cuts.filter((c) => c.s >= s0 && c.s < s1));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const bed = new THREE.Mesh(geometry, bedMaterial);
    bed.position.copy(origin);
    bed.receiveShadow = true;
    bed.castShadow = false;
    bed.name = `rail:${line}:${index}`;
    return { bed, props };
  }

  /** A box laid on the crown at `x` across the track: half-length `hx` across, `hz` along, `h` tall. */
  function slab(
    at: THREE.Vector3, along: THREE.Vector3, across: THREE.Vector3, upward: THREE.Vector3,
    r: number, x: number, hx: number, hz: number, h: number, colour: THREE.Color,
    push: (v: THREE.Vector3, c: THREE.Color) => void,
  ): void {
    const corner = (dx: number, dz: number, dy: number): THREE.Vector3 =>
      at.clone().addScaledVector(across, (x + dx) / PLANET_RADIUS).addScaledVector(along, dz / PLANET_RADIUS).normalize().multiplyScalar(r + dy);
    void upward;
    const lo = -0.1;
    const c000 = corner(-hx, -hz, lo), c100 = corner(hx, -hz, lo), c010 = corner(-hx, -hz, h), c110 = corner(hx, -hz, h);
    const c001 = corner(-hx, hz, lo), c101 = corner(hx, hz, lo), c011 = corner(-hx, hz, h), c111 = corner(hx, hz, h);
    // Wound outward: `across` is the track's right and right x along is up,
    // so each face below is listed inward and laid the other way round.
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
      push(a, colour);
      push(c, colour);
      push(b, colour);
    };
    // Top, and the four sides.
    tri(c010, c011, c111); tri(c010, c111, c110);
    tri(c000, c010, c110); tri(c000, c110, c100);
    tri(c001, c101, c111); tri(c001, c111, c011);
    tri(c000, c001, c011); tri(c000, c011, c010);
    tri(c100, c110, c111); tri(c100, c111, c101);
  }

  // --- the crossings' posts ---------------------------------------------------

  const lampPoints: { at: THREE.Vector3; line: number; s: number }[] = [];
  function crossingProps(line: number, here: Crossing[]): THREE.Group | null {
    if (here.length === 0) return null;
    const holder = new THREE.Group();
    const ctx = craftContext();
    const crown = network.crown(line);
    for (const crossing of here) {
      const r = crownAt(crown, crossing.s);
      const course = network.course(line);
      const path = network.path(line);
      const tt = parameterAt(path, crossing.s);
      courseTangent(course, tt, t);
      coursePoint(course, tt, p);
      for (const along of [-1, 1]) {
        for (const acrossRoad of [-1, 1]) {
          // At each corner: out along the road past its edge, and back along the rail past the bed.
          const at = p
            .clone()
            .addScaledVector(crossing.across, (acrossRoad * (BED_FOOT + 1.5)) / PLANET_RADIUS)
            .addScaledVector(t, (along * 0) / PLANET_RADIUS);
          const rail = at.clone().addScaledVector(t, (along * (crossing.half + 1.2)) / PLANET_RADIUS).normalize();
          const post = new THREE.Group();
          const pole = ctx.column(0.12, 4.2, PALETTE.white, 6);
          post.add(pole);
          for (const lean of [0.62, -0.62]) {
            const arm = ctx.box(1.9, 0.28, 0.08, PALETTE.white);
            arm.position.set(0, 3.55, 0.14);
            arm.rotation.z = lean;
            const stripe = ctx.box(0.5, 0.3, 0.1, PALETTE.red);
            stripe.position.set(0, 3.55, 0.15);
            stripe.rotation.z = lean;
            post.add(arm, stripe);
          }
          const lamp = ctx.box(0.5, 0.36, 0.3, PALETTE.ink);
          lamp.position.set(0, 2.7, 0.16);
          post.add(lamp);
          const assembled = assemble('crossing-post', [soupOf(post)]);
          standAt(assembled, rail, r - 0.3, crossing.across.clone().multiplyScalar(-acrossRoad));
          assembled.traverse((part) => {
            part.castShadow = false;
          });
          holder.add(assembled);
          lampPoints.push({ at: assembled.localToWorld(new THREE.Vector3(0, 2.9, 0.4)), line, s: crossing.s });
        }
      }
    }
    return holder;
  }

  /** Stands an object at `direction`, `radius` from the centre, facing `facing` (a tangent). */
  const standBasis = new THREE.Matrix4();
  const standX = new THREE.Vector3();
  const standY = new THREE.Vector3();
  const standZ = new THREE.Vector3();
  function standAt(object: THREE.Object3D, direction: THREE.Vector3, radius: number, facing: THREE.Vector3): void {
    standY.copy(direction).normalize();
    standZ.copy(facing).addScaledVector(standY, -facing.dot(standY)).normalize();
    standX.crossVectors(standY, standZ).normalize();
    standBasis.makeBasis(standX, standY, standZ);
    if (standBasis.determinant() <= 0) throw new Error('railway: a mirrored placement');
    object.position.copy(standY).multiplyScalar(radius);
    object.quaternion.setFromRotationMatrix(standBasis);
    object.updateMatrixWorld(true);
  }

  // --- stations ----------------------------------------------------------------

  /** A station's model in its own frame: +Z out along the line, the platform toward +X times `sign`. */
  function buildStation(sign: number, drop: number): THREE.Group {
    const ctx = craftContext();
    const { box, column, tone } = ctx;
    const g = new THREE.Group();
    const x = (v: number): number => sign * v;
    // The platform: a slab from the ground up to a step over the crown, and a yellow line along its edge.
    const platform = box(PLATFORM_WIDTH, PLATFORM_RISE + drop, PLATFORM_LENGTH, tone(PALETTE.bone, 1.05));
    platform.position.set(x(PLATFORM_INNER + PLATFORM_WIDTH / 2), -drop, PLATFORM_FROM + PLATFORM_LENGTH / 2);
    g.add(platform);
    const edge = box(0.35, PROUD, PLATFORM_LENGTH - 0.4, PALETTE.gold);
    edge.position.set(x(PLATFORM_INNER + 0.45), PLATFORM_RISE, PLATFORM_FROM + PLATFORM_LENGTH / 2);
    g.add(edge);
    // A canopy over the platform's middle: posts and a roof.
    const canopyLength = PLATFORM_LENGTH * 0.55;
    const canopyZ = PLATFORM_FROM + PLATFORM_LENGTH * 0.35;
    for (let k = 0; k <= 3; k++) {
      const post = column(0.16, 4.2, PALETTE.steel, 6);
      post.position.set(x(PLATFORM_INNER + PLATFORM_WIDTH - 1.1), PLATFORM_RISE, canopyZ - canopyLength / 2 + (canopyLength * k) / 3);
      g.add(post);
    }
    const roof = box(PLATFORM_WIDTH + 0.6, 0.35, canopyLength + 1, tone(PALETTE.red, 0.85));
    roof.position.set(x(PLATFORM_INNER + PLATFORM_WIDTH / 2 - 0.2), PLATFORM_RISE + 4.2, canopyZ);
    roof.rotation.z = sign * 0.08;
    g.add(roof);
    // A bench under it.
    const bench = box(0.8, 0.5, 3, PALETTE.brown);
    bench.position.set(x(PLATFORM_INNER + PLATFORM_WIDTH - 0.9), PLATFORM_RISE, canopyZ);
    g.add(bench);
    // The hall: walls, a band of windows either side of a door, a hipped roof.
    const hallX = PLATFORM_INNER + PLATFORM_WIDTH + HALL_DEPTH / 2 - 0.2;
    const hallZ = HALL_FROM + HALL_LENGTH / 2;
    const wallHeight = 6;
    const walls = box(HALL_DEPTH, wallHeight + drop, HALL_LENGTH, PALETTE.blush);
    walls.position.set(x(hallX), -drop, hallZ);
    g.add(walls);
    const base = box(HALL_DEPTH + 2 * PROUD, 0.9 + drop, HALL_LENGTH + 2 * PROUD, tone(PALETTE.clay, 0.9));
    base.position.set(x(hallX), -drop, hallZ);
    g.add(base);
    for (const face of [-1, 1]) {
      // Windows on both long faces: the platform's and the town's.
      const faceX = hallX + (face * (HALL_DEPTH / 2 + PROUD / 2));
      for (let k = 0; k < 4; k++) {
        const z = HALL_FROM + 2.5 + k * ((HALL_LENGTH - 5) / 3);
        if (k === 1 || k === 2) continue;
        const pane = box(PROUD, 2.2, 2.4, tone(PALETTE.slate, 0.72));
        pane.position.set(x(faceX), 2.2, z);
        g.add(pane);
      }
      const door = box(PROUD, 3.4, 3.2, tone(PALETTE.brown, 0.8));
      door.position.set(x(faceX), 0.9, hallZ);
      g.add(door);
      const lintel = box(PROUD * 2, 0.4, 3.8, PALETTE.white);
      lintel.position.set(x(faceX), 4.3, hallZ);
      g.add(lintel);
    }
    // The roof: two slopes meeting over the hall's middle, eaves proud.
    for (const slope of [-1, 1]) {
      const half = box(HALL_DEPTH / 2 + 1.2, 0.4, HALL_LENGTH + 1.6, tone(PALETTE.clay, 1.05));
      half.position.set(x(hallX + slope * (HALL_DEPTH / 4 + 0.35)), wallHeight + 0.55, hallZ);
      half.rotation.z = sign * slope * -0.42;
      g.add(half);
    }
    const gable = box(0.8, 1.6, 0.8, PALETTE.white);
    gable.position.set(x(hallX), wallHeight + 1.9, hallZ);
    g.add(gable);
    // A clock over the door on the platform side.
    const clock = column(0.7, PROUD * 2, PALETTE.white, 12);
    clock.rotation.z = Math.PI / 2;
    clock.position.set(x(hallX - HALL_DEPTH / 2 - PROUD), 5.1, hallZ);
    g.add(clock);
    // The buffer stop at the terminus.
    const stop = box(GAUGE + 1.2, 1.3, 0.7, PALETTE.red);
    stop.position.set(0, 0.2, 0);
    g.add(stop);
    const stripe = box(GAUGE + 1.2 + 2 * PROUD, 0.3, 0.7 + 2 * PROUD, PALETTE.white);
    stripe.position.set(0, 1.05, 0);
    g.add(stripe);
    const assembled = assemble('station', [soupOf(g)]);
    assembled.traverse((part) => {
      part.castShadow = true;
      part.receiveShadow = true;
    });
    return assembled;
  }

  // --- trains --------------------------------------------------------------------

  /** A car: its baked model scaled to the traffic's section and to one pitch, under a holder the pose moves. */
  function buildCar(id: string): Car | null {
    const model = kit.get(id);
    if (model === undefined) return null;
    const size = model.box.getSize(new THREE.Vector3());
    const mesh = new THREE.Mesh(paintModel(model), options.material);
    const across = CAR_WIDTH / Math.max(0.1, size.x);
    const along = (CAR_PITCH - CAR_GAP) / Math.max(0.1, size.z);
    // Scale in the model's own axes, under the holder's rotation: `T * R * S`
    // split across the two, so the numbers land on the axes they name.
    mesh.scale.set(across, across, along);
    mesh.position.set(-((model.box.min.x + model.box.max.x) / 2) * across, -model.box.min.y * across, -((model.box.min.z + model.box.max.z) / 2) * along);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const holder = new THREE.Group();
    holder.add(mesh);
    return { holder, model: id, half: (CAR_PITCH - CAR_GAP) / 2, height: size.y * across };
  }

  const trains = new Map<number, Train>();
  const consists = new Map<number, { cars: string[] }>();
  const consistFor = (line: number): { cars: string[] } => {
    let known = consists.get(line);
    if (known === undefined) consists.set(line, (known = consistOf(network.lines[line]!, places, network.path(line).length)));
    return known;
  };
  const carPool = new Map<string, Car[]>();
  function takeCar(id: string): Car | null {
    const free = carPool.get(id);
    const car = free?.pop() ?? buildCar(id);
    if (car !== null) {
      car.holder.visible = true;
      if (car.holder.parent !== group) group.add(car.holder);
    }
    return car;
  }
  function giveCar(car: Car): void {
    car.holder.visible = false;
    let free = carPool.get(car.model);
    if (free === undefined) carPool.set(car.model, (free = []));
    free.push(car);
  }

  // --- the scan ------------------------------------------------------------------

  const chunks = new Map<string, Chunk>();
  const stations = new Map<string, Drawn>();
  const lineHits: number[] = [];
  let wanted: { line: number; index: number; near: boolean; distance: number }[] = [];
  const eye = new THREE.Vector3();
  const player = new THREE.Vector3();
  const eyeDir = new THREE.Vector3();
  const scanFrom = new THREE.Vector3(Infinity, 0, 0);
  let scanAt = -Infinity;
  let scanCount = 0;
  let nearLines: number[] = [];
  const frame0 = emptyStation();

  function scan(fogFar: number): void {
    scanCount++;
    eyeDir.copy(eye).normalize();
    const reach = Math.min(DRAW_REACH, fogFar * 1.05);
    nearLines = [...network.near(eyeDir, reach, lineHits)];
    wanted = [];
    for (const line of nearLines) {
      const path = network.path(line);
      const count = Math.ceil(path.length / CHUNK);
      for (let index = 0; index < count; index++) {
        const s = Math.min(path.length, (index + 0.5) * CHUNK);
        coursePoint(network.course(line), parameterAt(path, s), p);
        const distance = p.multiplyScalar(crownAt(network.crown(line), s)).distanceTo(eye) - CHUNK / 2;
        if (distance > reach) continue;
        wanted.push({ line, index, near: distance < DETAIL_REACH, distance });
      }
      // The two stations.
      for (const end of [0, 1] as const) {
        const key = `${line}:${end}`;
        lineStation(network.lines[line]!, end, places, frame0);
        const crown = network.crown(line);
        const level = end === 0 ? crown.levelA : crown.levelB;
        const distance = frame0.at.clone().multiplyScalar(level).distanceTo(eye);
        const known = stations.get(key);
        if (distance > Math.min(STATION_REACH, reach)) continue;
        if (known !== undefined) {
          known.seen = scanCount;
          continue;
        }
        // The floor sits at the station's level; its slabs reach down to the lowest ground under it.
        const frame = lineStation(network.lines[line]!, end, places, emptyStation());
        let lowest = level;
        for (let z = -8; z <= PLATFORM_FROM + PLATFORM_LENGTH + 4; z += 10) {
          for (const xs of [PLATFORM_INNER, PLATFORM_INNER + PLATFORM_WIDTH + HALL_DEPTH]) lowest = Math.min(lowest, groundAt(stationPoint(frame, xs, z, q)));
        }
        const drop = Math.max(1, level - lowest + 1);
        // The model's +X is `up x out`, the platform's side is `side`: the two agree when the hand is -1.
        const built = buildStation(frame.hand > 0 ? -1 : 1, drop);
        standAt(built, frame.at, level, frame.out);
        group.add(built);
        stations.set(key, { key, group: built, frame, level, seen: scanCount });
      }
    }
    wanted.sort((a, b) => a.distance - b.distance);
    for (const [key, station] of stations) {
      if (station.seen === scanCount) continue;
      group.remove(station.group);
      disposeGroup(station.group);
      stations.delete(key);
    }
  }

  function disposeGroup(object: THREE.Object3D): void {
    object.traverse((part) => {
      const mesh = part as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  }

  function serveChunks(): void {
    const want = new Set<string>();
    let built = 0;
    for (const w of wanted) {
      const key = `${w.line}:${w.index}:${w.near ? 1 : 0}`;
      want.add(key);
      const known = chunks.get(key);
      if (known !== undefined) {
        known.seen = scanCount;
        continue;
      }
      if (built >= BUILDS_PER_FRAME || !frameOpenFor(built, w.distance < 600)) continue;
      const { bed, props } = buildBed(w.line, w.index, w.near);
      group.add(bed);
      if (props !== null) group.add(props);
      chunks.set(key, { key, line: w.line, index: w.index, near: w.near, bed, props, seen: scanCount });
      built++;
    }
    // A chunk no longer wanted goes once its replacement at the other detail stands, so nothing opens a gap.
    for (const [key, chunk] of chunks) {
      if (want.has(key)) continue;
      const other = `${chunk.line}:${chunk.index}:${chunk.near ? 0 : 1}`;
      if (want.has(other) && !chunks.has(other)) continue;
      group.remove(chunk.bed);
      chunk.bed.geometry.dispose();
      if (chunk.props !== null) {
        group.remove(chunk.props);
        disposeGroup(chunk.props);
        for (let i = lampPoints.length - 1; i >= 0; i--) {
          const lamp = lampPoints[i]!;
          if (lamp.line === chunk.line && lamp.s >= chunk.index * CHUNK && lamp.s < (chunk.index + 1) * CHUNK) lampPoints.splice(i, 1);
        }
      }
      chunks.delete(key);
    }
  }

  // --- the lamps at the crossings ---------------------------------------------------

  const LAMPS = 128;
  const lampPosition = new Float32Array(LAMPS * 3);
  const lampColor = new Float32Array(LAMPS * 4);
  const lampGeometry = new THREE.BufferGeometry();
  lampGeometry.setAttribute('position', new THREE.BufferAttribute(lampPosition, 3).setUsage(THREE.DynamicDrawUsage));
  lampGeometry.setAttribute('color', new THREE.BufferAttribute(lampColor, 4).setUsage(THREE.DynamicDrawUsage));
  lampGeometry.setDrawRange(0, 0);
  const lampMaterial = new THREE.PointsMaterial({ size: 6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false });
  lampMaterial.userData.outlineParameters = { visible: false };
  const lamps = new THREE.Points(lampGeometry, lampMaterial);
  lamps.frustumCulled = false;
  lamps.name = 'crossing-lamps';
  group.add(lamps);

  // --- the frame ----------------------------------------------------------------------

  const carPoint = new THREE.Vector3();
  const carAhead = new THREE.Vector3();
  const carBehind = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const bx = new THREE.Vector3();
  const by = new THREE.Vector3();
  const bz = new THREE.Vector3();
  const passingOut: PassingSource = { distance: 0, closing: 0, effort: 0 };
  let passing: PassingSource | null = null;
  const stats = { lines: network.lines.length, chunks: 0, stations: 0, trains: 0, cars: 0, nearestMoving: Infinity, ms: 0 };

  /** A point `s` along a line at the rail head, over the planet's centre. */
  function railHead(line: number, s: number, out: THREE.Vector3): THREE.Vector3 {
    const path = network.path(line);
    const clamped = Math.min(path.length, Math.max(0, s));
    coursePoint(network.course(line), parameterAt(path, clamped), out);
    return out.multiplyScalar(crownAt(network.crown(line), clamped) + RAIL_TOP);
  }

  const probeState: TrainState = { head: 0, direction: 1, speed: 0, standing: true };
  function runTrains(seconds: number, trainReach: number): void {
    const want: { line: number; distance: number }[] = [];
    for (const line of nearLines) {
      const path = network.path(line);
      const consist = consistFor(line);
      const state = trainAt(path.length, consist.cars.length, phaseOf(network.lines[line]!), seconds, probeState);
      const middle = state.head - (state.direction * consist.cars.length * CAR_PITCH) / 2;
      const distance = railHead(line, middle, carPoint).distanceTo(eye);
      if (distance < trainReach) want.push({ line, distance });
    }
    want.sort((a, b) => a.distance - b.distance);
    const keep = new Set(want.slice(0, MAX_TRAINS).map((w) => w.line));
    for (const [line, train] of trains) {
      if (keep.has(line)) continue;
      for (const car of train.cars) giveCar(car);
      trains.delete(line);
    }
    passing = null;
    let nearest = Infinity;
    stats.nearestMoving = Infinity;
    for (const line of keep) {
      const path = network.path(line);
      const consist = consistFor(line);
      let train = trains.get(line);
      if (train === undefined) {
        const cars: Car[] = [];
        for (const id of consist.cars) {
          const car = takeCar(id);
          if (car !== null) cars.push(car);
        }
        if (cars.length !== consist.cars.length) {
          for (const car of cars) giveCar(car);
          continue;
        }
        train = { line, cars, state: { head: 0, direction: 1, speed: 0, standing: true }, seen: 0, sounded: new Set(), direction: 0 };
        trains.set(line, train);
      }
      const state = trainAt(path.length, train.cars.length, phaseOf(network.lines[line]!), seconds, train.state);
      if (state.direction !== train.direction) {
        train.sounded.clear();
        train.direction = state.direction;
      }
      train.cars.forEach((car, k) => {
        // Car `k` from the leading end; its centre half a pitch back.
        const centre = state.head - state.direction * (k + 0.5) * CAR_PITCH;
        railHead(line, centre + state.direction * car.half * 0.8, carAhead);
        railHead(line, centre - state.direction * car.half * 0.8, carBehind);
        railHead(line, centre, carPoint);
        by.copy(carPoint).normalize();
        bz.subVectors(carAhead, carBehind).normalize();
        // The end cars face out: the last one runs backwards.
        if (k === train!.cars.length - 1 && k > 0) bz.negate();
        by.addScaledVector(bz, -by.dot(bz)).normalize();
        bx.crossVectors(by, bz).normalize();
        basis.makeBasis(bx, by, bz);
        car.holder.position.copy(carPoint);
        car.holder.quaternion.setFromRotationMatrix(basis);
      });
      // The ear: the nearest car of the nearest train, and how fast it closes.
      const head = railHead(line, state.head, carAhead);
      const distance = head.distanceTo(eye);
      if (!state.standing) stats.nearestMoving = Math.min(stats.nearestMoving, head.distanceTo(player) - train.cars.length * CAR_PITCH);
      if (distance < nearest && !state.standing) {
        nearest = distance;
        const behind = railHead(line, state.head - state.direction * 2, carBehind);
        bz.subVectors(head, behind).normalize();
        by.subVectors(eye, head).normalize();
        passingOut.distance = distance;
        passingOut.closing = bz.dot(by) * state.speed;
        passingOut.effort = state.speed / TRAIN_SPEED;
        passing = passingOut;
      }
      // The horn, once a run, as it comes up on a crossing.
      if (!state.standing && traffic.onHorn !== null) {
        for (const [k, crossing] of crossings(line).entries()) {
          const before = (crossing.s - state.head) * state.direction;
          if (before > 0 && before < 90 && !train.sounded.has(k)) {
            train.sounded.add(k);
            const near = Math.max(0, 1 - crossing.point.clone().multiplyScalar(PLANET_RADIUS).distanceTo(eye) / 700);
            if (near > 0) traffic.onHorn(near);
          }
        }
      }
    }
    stats.trains = trains.size;
    stats.cars = [...trains.values()].reduce((n, train) => n + train.cars.length, 0);
  }

  function lightLamps(seconds: number): void {
    let count = 0;
    const flash = Math.floor(seconds * 2) % 2;
    for (const lamp of lampPoints) {
      if (count >= LAMPS) break;
      const train = trains.get(lamp.line);
      if (train === undefined) continue;
      const state = train.state;
      const tail = state.head - state.direction * train.cars.length * CAR_PITCH;
      const lo = Math.min(state.head, tail) - 160;
      const hi = Math.max(state.head, tail) + 160;
      if (lamp.s < lo || lamp.s > hi) continue;
      lampPosition[count * 3] = lamp.at.x;
      lampPosition[count * 3 + 1] = lamp.at.y;
      lampPosition[count * 3 + 2] = lamp.at.z;
      const on = (count % 2 === flash) ? 1 : 0.15;
      lampColor[count * 4] = 1;
      lampColor[count * 4 + 1] = 0.18;
      lampColor[count * 4 + 2] = 0.1;
      lampColor[count * 4 + 3] = on;
      count++;
    }
    lampGeometry.setDrawRange(0, count);
    (lampGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (lampGeometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  // --- what a foot stands on and walks into --------------------------------------------

  const hit = { line: 0, s: 0, off: 0 };
  const probeDir = new THREE.Vector3();
  const local = new THREE.Vector3();
  const inverse = new THREE.Matrix4();

  const traffic: Railway = {
    group,
    enabled: true,
    onHorn: null,
    get passing() {
      return passing;
    },
    stats,
    update(frame) {
      const began = performance.now();
      group.visible = traffic.enabled;
      if (!traffic.enabled) return;
      frame.camera.getWorldPosition(eye);
      player.copy(frame.player);
      if (Math.abs(frame.seconds - scanAt) > RESCAN_S || scanFrom.distanceTo(eye) > RESCAN_MOVE) {
        scanAt = frame.seconds;
        scanFrom.copy(eye);
        scan(frame.fogFar);
      }
      serveChunks();
      runTrains(frame.seconds, Math.min(TRAIN_REACH, frame.fogFar * 1.05));
      lightLamps(frame.seconds);
      stats.chunks = chunks.size;
      stats.stations = stations.size;
      stats.ms = stats.ms * 0.9 + (performance.now() - began) * 0.1;
    },
    bedHeightAt(point) {
      probeDir.copy(point).normalize();
      let best = 0;
      const found = network.nearest(probeDir, BED_FOOT, hit);
      if (found !== null) {
        const crown = crownAt(network.crown(found.line), found.s);
        const fall = found.off <= BED_HALF ? 0 : ((found.off - BED_HALF) / (BED_FOOT - BED_HALF)) * SHOULDER_DROP;
        best = crown - fall;
      }
      for (const station of stations.values()) {
        inverse.copy(station.group.matrixWorld).invert();
        local.copy(point).applyMatrix4(inverse);
        const sx = station.frame.hand > 0 ? -local.x : local.x;
        if (local.z >= PLATFORM_FROM && local.z <= PLATFORM_FROM + PLATFORM_LENGTH && sx >= PLATFORM_INNER && sx <= PLATFORM_INNER + PLATFORM_WIDTH) {
          best = Math.max(best, station.level + PLATFORM_RISE);
        }
      }
      return best;
    },
    collide(point, radius, push) {
      let hitAny = false;
      push.set(0, 0, 0);
      const test = (object: THREE.Object3D, halfX: number, halfZ: number, height: number, centreX: number, centreZ: number): void => {
        inverse.copy(object.matrixWorld).invert();
        local.copy(point).applyMatrix4(inverse);
        if (local.y < -1 || local.y > height) return;
        const dx = local.x - centreX;
        const dz = local.z - centreZ;
        const ox = halfX + radius - Math.abs(dx);
        const oz = halfZ + radius - Math.abs(dz);
        if (ox <= 0 || oz <= 0) return;
        // Out along the shallower side, in the object's frame, then back to the world's.
        const out = ox < oz ? new THREE.Vector3(Math.sign(dx || 1) * ox, 0, 0) : new THREE.Vector3(0, 0, Math.sign(dz || 1) * oz);
        out.applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
        push.add(out);
        hitAny = true;
      };
      for (const train of trains.values()) {
        for (const car of train.cars) {
          if (car.holder.position.distanceToSquared(point) > (CAR_PITCH + radius) ** 2) continue;
          test(car.holder, CAR_WIDTH / 2, car.half, car.height, 0, 0);
        }
      }
      for (const station of stations.values()) {
        if (station.group.position.distanceToSquared(point) > 120 * 120) continue;
        const sign = station.frame.hand > 0 ? -1 : 1;
        test(station.group, HALL_DEPTH / 2, HALL_LENGTH / 2, 12, sign * (PLATFORM_INNER + PLATFORM_WIDTH + HALL_DEPTH / 2 - 0.2), HALL_FROM + HALL_LENGTH / 2);
      }
      return hitAny;
    },
    setKit(models) {
      kit = models;
      for (const [line, train] of trains) {
        for (const car of train.cars) giveCar(car);
        trains.delete(line);
      }
    },
    eachCar(visit) {
      for (const train of trains.values()) {
        for (const car of train.cars) visit(car.holder.position, car.half, !train.state.standing);
      }
    },
  };
  return traffic;
}
