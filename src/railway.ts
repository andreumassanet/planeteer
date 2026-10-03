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
import { shadeByClouds } from './cloud-shade.ts';
import { PROUD, assemble, craftContext, soupOf } from './craft/build.ts';
import { DOOR_JAMB, TONES, createSceneryContext, doorPaint } from './scenery/contract.ts';
import type { SceneryContext } from './scenery/contract.ts';
import { regionFor } from './scenery/regions.ts';
import { rngFrom } from './scenery/random.ts';
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
import { BENCH_SEAT, sitAhead } from './bench.ts';
import type { Bench } from './bench.ts';

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

/**
 * A station's benches under its canopy, backs to the hall, in the station's
 * own frame with the platform toward +X (`buildStation` mirrors by its
 * `sign`): their middle's distance off the track's side, their middles along
 * the line, and the seat's depth and the back's front behind the middle. The
 * seat's top is `BENCH_SEAT` over the deck, where the sitting clip's thighs
 * rest, so a body sits on one as on a town's bench (`bench.ts`), at the
 * spots `STATION_SIT_ALONG` either side of a bench's middle.
 */
const STATION_BENCH_X = PLATFORM_INNER + PLATFORM_WIDTH - 0.2 - 1.1;
const STATION_BENCH_ZS = [HALL_FROM + HALL_LENGTH / 2 - 4.2 * 2.5, HALL_FROM + HALL_LENGTH / 2 + 4.2 * 2.5] as const;
const STATION_BENCH_DEPTH = 0.95;
const STATION_BENCH_BACK = 0.43;
const STATION_SIT_ALONG = [-0.9, 0.9] as const;

const BALLAST = new THREE.Color(PALETTE.tan).multiplyScalar(0.78);
const SHOULDER = new THREE.Color(PALETTE.tan).multiplyScalar(0.66);
const BAND = new THREE.Color(PALETTE.bark).multiplyScalar(0.95);
/** The bed's own colours, apart from the sleepers' and the rails': what `pnpm railway` walks for open sections. */
export const BED_COLOURS: readonly THREE.Color[] = [BALLAST, SHOULDER, BAND];
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
  /** The standing stations' benches whose sitter's spot is inside `radius` of `point`, pushed onto `out`. */
  benchesNear(point: THREE.Vector3, radius: number, out: Bench[]): void;
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
  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));

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
  shadeByClouds(bedMaterial);

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
    /** Each row's direction along the line and its crown, for the caps. */
    const rowT: THREE.Vector3[] = [];
    const rowR: number[] = [];
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
      rowT.push(t.clone());
      rowR.push(r);
    }
    const drawn: boolean[] = [];
    for (let k = 0; k < steps; k++) drawn.push(!inCrossing((rowS[k]! + rowS[k + 1]!) / 2));
    for (let k = 0; k < steps; k++) {
      if (!drawn[k]) continue;
      const a = rows[k]!;
      const b = rows[k + 1]!;
      for (let j = 0; j + 1 < across.length; j++) quad(a[j]!, a[j + 1]!, b[j + 1]!, b[j]!, colourOf[j]!);
    }

    // --- the ends: no section of the bed is ever left open ---
    // A triangle, dropped where two of its corners are one point.
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, colour: THREE.Color): void => {
      if (a === b || b === c || a === c) return;
      push(a, colour); push(b, colour); push(c, colour);
    };
    /**
     * Where the line itself ends, at a terminus, the ballast is hipped like
     * its sides: the crown's corners run on `BED_FOOT - BED_HALF` and down to
     * the foot, so the end is a slope of the shoulders' own pitch.
     */
    const hip = (k: number, outward: number): void => {
      const a = rows[k]!;
      const run = (BED_FOOT - BED_HALF) * outward;
      const e = a.map((point, j) => {
        if (j === 0 || j === a.length - 1) return point;
        const out = point.clone().normalize().addScaledVector(rowT[k]!, run / PLANET_RADIUS).normalize();
        return out.multiplyScalar(Math.min(rowR[k]! - SHOULDER_DROP, groundAt(out) - 1.5));
      });
      for (let j = 0; j + 1 < a.length; j++) {
        if (outward > 0) {
          tri(a[j]!, a[j + 1]!, e[j + 1]!, SHOULDER);
          tri(a[j]!, e[j + 1]!, e[j]!, SHOULDER);
        } else {
          tri(e[j]!, e[j + 1]!, a[j + 1]!, SHOULDER);
          tri(e[j]!, a[j + 1]!, a[j]!, SHOULDER);
        }
      }
    };
    /**
     * Anywhere else the bed stops — a level crossing's carriageway, or the end
     * of a chunk whose neighbour is not built yet, at the haze or while it
     * streams in — its section is closed flat. Between two chunks that both
     * stand, the two faces are inside the ballast and nothing sees them.
     */
    const close = (k: number, outward: number): void => {
      const a = rows[k]!;
      for (let j = 1; j + 1 < a.length; j++) {
        if (outward > 0) tri(a[0]!, a[j]!, a[j + 1]!, SHOULDER);
        else tri(a[0]!, a[j + 1]!, a[j]!, SHOULDER);
      }
    };
    for (let k = 0; k < steps; k++) {
      if (!drawn[k]) continue;
      if (k === 0 || !drawn[k - 1]) {
        if (k === 0 && s0 <= 0) hip(0, -1);
        else close(k, -1);
      }
      if (k === steps - 1 || !drawn[k + 1]) {
        if (k === steps - 1 && s1 >= path.length) hip(steps, 1);
        else close(k + 1, 1);
      }
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
          // The rail's own end at a terminus, under the buffer stop.
          if (k === 0 && s0 <= 0) quad(here[3]!, here[2]!, here[1]!, here[0]!, RAIL_SIDE);
          if (k === steps && s1 >= path.length) quad(here[0]!, here[1]!, here[2]!, here[3]!, RAIL_SIDE);
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

  /**
   * A station's model in its own frame: +Z out along the line, the platform
   * toward +X times `sign`, y = 0 at the crown, and `drop` how far its slabs
   * reach down to the lowest ground under them.
   *
   * A small country station, dressed in its city's region (`regionFor`): a hall
   * in the region's render under a hipped roof with eaves, a base course and a
   * shadow band, framed windows and a door in each long face; a canopy on iron
   * posts along the platform, falling toward the track, with a fretted valance
   * on its edge; benches, a clock hung from the canopy, name boards on legs and
   * lamps; and a buffer stop on the rails at the terminus. One buffer, inked.
   */
  let sceneryKit: SceneryContext | null = null;
  function buildStation(sign: number, drop: number, place: Place, key: string): THREE.Group {
    const base = craftContext();
    sceneryKit ??= createSceneryContext(base);
    const kit = sceneryKit;
    const { box, column, tone, strut } = base;
    const g = new THREE.Group();
    const x = (v: number): number => sign * v;
    const rng = rngFrom('station', key);
    const continent = continentOf.get(place.iso ?? '') ?? '';
    const style = regionFor(place.iso ?? '', continent, place.lat);
    const wall = rng.pick(style.walls);
    const tile = rng.pick(style.roofs);
    const course = tone(wall, TONES.course);
    const shade = tone(wall, TONES.eave);
    const surround = tone(wall, TONES.light);
    const iron = tone(PALETTE.green, 0.55);
    const timber = tone(PALETTE.brown, 0.9);
    const cream = PALETTE.cream;
    const lean = new THREE.Vector3();
    const foot = new THREE.Vector3();

    // --- the platform: a slab from the ground to a step over the crown, its
    // coping a shade lighter, and a yellow line along its edge ---
    const deck = PLATFORM_RISE;
    const platform = box(PLATFORM_WIDTH, deck + drop, PLATFORM_LENGTH, tone(PALETTE.bone, 1.05));
    platform.position.set(x(PLATFORM_INNER + PLATFORM_WIDTH / 2), -drop, PLATFORM_FROM + PLATFORM_LENGTH / 2);
    g.add(platform);
    const coping = box(0.7, 0.2, PLATFORM_LENGTH + 2 * PROUD, tone(PALETTE.bone, 1.15));
    coping.position.set(x(PLATFORM_INNER + 0.35 - PROUD), deck - 0.2 + PROUD, PLATFORM_FROM + PLATFORM_LENGTH / 2);
    g.add(coping);
    const edge = box(0.35, PROUD, PLATFORM_LENGTH - 0.4, PALETTE.gold);
    edge.position.set(x(PLATFORM_INNER + 1.0), deck, PLATFORM_FROM + PLATFORM_LENGTH / 2);
    g.add(edge);

    // --- the hall ---
    const hallX = PLATFORM_INNER + PLATFORM_WIDTH + HALL_DEPTH / 2 - 0.2;
    const hallZ = HALL_FROM + HALL_LENGTH / 2;
    const wallHeight = 7.5;
    const walls = box(HALL_DEPTH, wallHeight + drop - PROUD, HALL_LENGTH, wall);
    walls.position.set(x(hallX), -drop, hallZ);
    g.add(walls);
    const plinth = box(HALL_DEPTH + 2 * PROUD, 0.9 + drop, HALL_LENGTH + 2 * PROUD, course);
    plinth.position.set(x(hallX), -drop, hallZ);
    g.add(plinth);
    const band = box(HALL_DEPTH + 2 * PROUD, 0.4, HALL_LENGTH + 2 * PROUD, shade);
    band.position.set(x(hallX), wallHeight - 0.4, hallZ);
    g.add(band);
    // Quoins at the four corners, a shade lighter: what makes a box a building.
    for (const along of [-1, 1]) {
      for (const across of [-1, 1]) {
        const quoin = box(0.7, wallHeight - 1.3, 0.7, surround);
        quoin.position.set(x(hallX + across * (HALL_DEPTH / 2 - 0.35 + PROUD)), 0.9, hallZ + along * (HALL_LENGTH / 2 - 0.35 + PROUD));
        g.add(quoin);
      }
    }

    // Each long face: a door in the middle bay and a pair of tall windows to
    // either side of it, laid out as bays so neither reaches the other.
    const bay = 4.2;
    const doorPaintHere = doorPaint(rng, style, wall);
    for (const face of [-1, 1]) {
      const platformSide = face < 0;
      const faceX = hallX + (face * HALL_DEPTH) / 2;
      const turn = (sign * face * Math.PI) / 2;
      const sill = platformSide ? deck : 0.9;
      for (const half of [-1, 1]) {
        const row = kit.windows({ count: 2, width: 1.8, height: 3, panes: 2, frame: surround, spread: bay });
        row.rotation.y = turn;
        row.position.set(x(faceX), sill + 1.3, hallZ + half * bay * 1.5);
        g.add(row);
      }
      const door = kit.door({ width: 2.6, height: 4.2, leaf: doorPaintHere, frame: surround });
      door.rotation.y = turn;
      door.position.set(x(faceX), sill, hallZ);
      g.add(door);
      if (!platformSide) {
        // The town's door is up a step from the lowest ground under the hall.
        const step = box(1, 0.9 + drop, 2.6 + DOOR_JAMB * 2, course);
        step.position.set(x(faceX + 0.5), -drop, hallZ);
        g.add(step);
      }
    }

    // The roof: hipped, with eaves, a ridge cap and a chimney.
    const eaves = 1.2;
    const rise = 3.2;
    const ridge = HALL_LENGTH * rng.range(0.35, 0.6);
    const roof = kit.roof(HALL_LENGTH + eaves * 2, HALL_DEPTH + eaves * 2, rise, ridge, tile);
    roof.rotation.y = Math.PI / 2;
    roof.position.set(x(hallX), wallHeight, hallZ);
    g.add(roof);
    const ridgeCap = box(0.42, 0.3, ridge + 0.3, tone(tile, TONES.cap));
    ridgeCap.position.set(x(hallX), wallHeight + rise - 0.1, hallZ);
    g.add(ridgeCap);
    const chimney = box(0.9, 2.4, 0.9, course);
    chimney.position.set(x(hallX + 1.6), wallHeight + 0.6, hallZ + HALL_LENGTH * 0.22 * rng.sign());
    g.add(chimney);
    const pot = box(1.1, 0.3, 1.1, tone(tile, TONES.cap));
    pot.position.set(chimney.position.x, chimney.position.y + 2.4, chimney.position.z);
    g.add(pot);

    // --- the canopy: iron posts, a roof falling toward the track, a valance ---
    const canopyFrom = HALL_FROM - 6;
    const canopyTo = HALL_FROM + HALL_LENGTH + 6;
    const canopyLength = canopyTo - canopyFrom;
    const canopyZ = (canopyFrom + canopyTo) / 2;
    const wallFace = PLATFORM_INNER + PLATFORM_WIDTH - 0.2;
    const lip = PLATFORM_INNER + 0.3;
    const high = 6.6;
    const low = 5.9;
    const heightAt = (v: number): number => low + ((high - low) * (v - lip)) / (wallFace - lip);
    const postX = PLATFORM_INNER + 1.5;
    const posts = 5;
    for (let k = 0; k < posts; k++) {
      const z = canopyFrom + 1 + ((canopyLength - 2) * k) / (posts - 1);
      const post = column(0.16, heightAt(postX) - deck, iron, 8);
      post.position.set(x(postX), deck, z);
      g.add(post);
      const shoe = box(0.5, 0.4, 0.5, iron);
      shoe.position.set(x(postX), deck, z);
      g.add(shoe);
      // A bracket from the post up and back under the roof.
      g.add(strut(lean.set(x(postX), heightAt(postX) - 1.1, z), foot.set(x(postX + 1.6), heightAt(postX + 1.6) - 0.1, z), 0.14, iron));
    }
    const beam = box(0.3, 0.35, canopyLength, iron);
    beam.position.set(x(postX), heightAt(postX) - 0.35, canopyZ);
    g.add(beam);
    const slope = Math.atan2(high - low, wallFace - lip);
    const span = Math.hypot(high - low, wallFace - lip);
    const sheet = box(span + 0.3, 0.22, canopyLength, tone(tile, 0.92));
    sheet.rotation.z = sign * slope;
    sheet.position.set(x((lip + wallFace) / 2), (low + high) / 2 - 0.11, canopyZ);
    g.add(sheet);
    g.add(valance(x(lip - 0.12), low - 0.05, canopyFrom, canopyTo, cream));

    // A clock on the hall's end wall, facing up the platform from the town's
    // end of it, where the canopy does not hide it.
    const clockX = x(wallFace + 1.7);
    const clockY = 5.9;
    const rim = column(0.82, 0.2, iron, 16);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(clockX, clockY, HALL_FROM - 0.2);
    g.add(rim);
    const dial = column(0.68, 0.28, cream, 16);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(clockX, clockY, HALL_FROM - 0.28);
    g.add(dial);
    const hour = box(0.1, 0.4, PROUD, PALETTE.ink);
    hour.position.set(clockX, clockY, HALL_FROM - 0.28 - PROUD / 2);
    g.add(hour);
    const minute = box(0.52, 0.08, PROUD, PALETTE.ink);
    minute.position.set(clockX + 0.22, clockY + 0.02, HALL_FROM - 0.28 - PROUD / 2);
    g.add(minute);

    // Benches under the canopy, backs to the hall (`STATION_BENCH_X`), the
    // seat's top at `BENCH_SEAT` over the deck.
    const benchX = STATION_BENCH_X;
    const legs = BENCH_SEAT - 0.14;
    for (const z of STATION_BENCH_ZS) {
      const seat = box(STATION_BENCH_DEPTH, 0.14, 3.6, timber);
      seat.position.set(x(benchX), deck + legs, z);
      g.add(seat);
      const back = box(0.14, 0.75, 3.6, timber);
      back.position.set(x(benchX + STATION_BENCH_BACK + 0.07), deck + legs + 0.26, z);
      g.add(back);
      for (const end of [-1, 1]) {
        const leg = box(1.05, legs, 0.14, iron);
        leg.position.set(x(benchX + 0.05), deck, z + end * 1.5);
        g.add(leg);
        const arm = box(0.14, 0.95, 0.14, iron);
        arm.position.set(x(benchX + STATION_BENCH_BACK + 0.07), deck + legs, z + end * 1.5);
        g.add(arm);
      }
    }

    // Name boards on two legs, one at each end of the platform, facing the
    // track and the hall alike; the letters are blocks through the board.
    const letters = rng.between(5, 9);
    const boardBlue = tone(PALETTE.skyBlue, 0.5);
    for (const z of [PLATFORM_FROM + 4.5, PLATFORM_FROM + PLATFORM_LENGTH - 7]) {
      const boardX = PLATFORM_INNER + PLATFORM_WIDTH - 1.4;
      for (const end of [-1, 1]) {
        const leg = column(0.1, 4.2, iron, 6);
        leg.position.set(x(boardX), deck, z + end * 2.6);
        g.add(leg);
      }
      const frame = box(0.16, 1.3, 5.9, cream);
      frame.position.set(x(boardX), deck + 3.1, z);
      g.add(frame);
      const panel = box(0.32, 1.0, 5.5, boardBlue);
      panel.position.set(x(boardX), deck + 3.25, z);
      g.add(panel);
      const pitch = 4.4 / letters;
      for (let k = 0; k < letters; k++) {
        const letter = box(0.48, 0.5, pitch * 0.62, cream);
        letter.position.set(x(boardX), deck + 3.5, z - 2.2 + pitch * (k + 0.5));
        g.add(letter);
      }
    }

    // Lamps down the open ends of the platform.
    for (const z of [PLATFORM_FROM + 1.2, canopyTo + 3, PLATFORM_FROM + PLATFORM_LENGTH - 1.2]) {
      const lampX = PLATFORM_INNER + PLATFORM_WIDTH - 0.8;
      const pole = column(0.1, 5, iron, 6);
      pole.position.set(x(lampX), deck, z);
      g.add(pole);
      const lantern = box(0.55, 0.7, 0.55, cream);
      lantern.position.set(x(lampX), deck + 5, z);
      g.add(lantern);
      const hat = kit.roof(0.95, 0.95, 0.45, 0, iron);
      hat.position.set(x(lampX), deck + 5.7, z);
      g.add(hat);
    }

    // --- the buffer stop at the terminus, on the rails and the sleepers ---
    // A painted headstock at buffer height on two posts, two buffers toward
    // the train, and two stays down behind it to the rails.
    const stopZ = 2.2;
    const headY = RAIL_TOP + 1.55;
    const red = tone(PALETTE.red, 0.9);
    for (const hand of [-1, 1]) {
      const rail = (hand * GAUGE) / 2;
      const sole = box(0.5, 0.3, 2.6, iron);
      sole.position.set(rail, RAIL_TOP - 0.05, stopZ - 0.9);
      g.add(sole);
      const post = box(0.36, headY - RAIL_TOP + 0.3, 0.36, iron);
      post.position.set(rail, RAIL_TOP + 0.2, stopZ);
      g.add(post);
      g.add(strut(lean.set(rail, headY + 0.1, stopZ - 0.1), foot.set(rail, RAIL_TOP + 0.25, stopZ - 2.1), 0.26, iron));
      const buffer = column(0.2, 0.55, PALETTE.steel, 10);
      buffer.rotation.x = Math.PI / 2;
      buffer.position.set(rail, headY + 0.35, stopZ + 0.2);
      g.add(buffer);
      const head = column(0.36, 0.12, PALETTE.steel, 12);
      head.rotation.x = Math.PI / 2;
      head.position.set(rail, headY + 0.35, stopZ + 0.75);
      g.add(head);
    }
    const headstock = box(GAUGE + 1.4, 0.7, 0.55, red);
    headstock.position.set(0, headY, stopZ);
    g.add(headstock);
    for (let k = -2; k <= 2; k++) {
      if (k === 0) continue;
      const chevron = box(0.38, 0.5, PROUD, PALETTE.white);
      chevron.position.set(k * 0.42, headY + 0.1, stopZ + 0.275 + PROUD / 2);
      chevron.rotation.z = (k < 0 ? 1 : -1) * 0.5;
      g.add(chevron);
    }
    const lamp = box(0.4, 0.4, 0.3, red);
    lamp.position.set(0, headY + 0.7, stopZ);
    g.add(lamp);

    const assembled = assemble('station', [soupOf(g)]);
    assembled.traverse((part) => {
      part.castShadow = true;
      part.receiveShadow = true;
    });
    return assembled;
  }

  /**
   * A fretted valance board along Z at `atX`, its top at `top`: a band and a
   * row of points under it, both faces, as one mesh of `color`. Each piece is
   * a closed prism, every face wound away from its own middle.
   */
  function valance(atX: number, top: number, from: number, to: number, color: number): THREE.Mesh {
    const BAND = 0.32;
    const POINT = 0.3;
    const THICK = 0.1;
    const PITCH = 0.62;
    const points: number[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const n = new THREE.Vector3();
    const face = (corners: THREE.Vector3[], centre: THREE.Vector3): void => {
      for (let k = 1; k + 1 < corners.length; k++) {
        const p0 = corners[0]!, p1 = corners[k]!, p2 = corners[k + 1]!;
        n.crossVectors(a.subVectors(p1, p0), b.subVectors(p2, p0));
        const flip = n.dot(a.subVectors(p0, centre)) < 0;
        for (const v of flip ? [p0, p2, p1] : [p0, p1, p2]) points.push(v.x, v.y, v.z);
      }
    };
    /** A prism: a polygon in (z, y) extruded across X by `THICK`. */
    const prism = (outline: readonly (readonly [number, number])[]): void => {
      const front = outline.map(([z, y]) => new THREE.Vector3(atX + THICK / 2, y, z));
      const back = outline.map(([z, y]) => new THREE.Vector3(atX - THICK / 2, y, z));
      const centre = new THREE.Vector3();
      for (const v of front) centre.add(v);
      for (const v of back) centre.add(v);
      centre.divideScalar(front.length * 2);
      face(front, centre);
      face(back, centre);
      for (let k = 0; k < outline.length; k++) {
        const k1 = (k + 1) % outline.length;
        face([front[k]!, front[k1]!, back[k1]!, back[k]!], centre);
      }
    };
    prism([[from, top - BAND], [to, top - BAND], [to, top], [from, top]]);
    const count = Math.max(1, Math.floor((to - from) / PITCH));
    const step = (to - from) / count;
    for (let k = 0; k < count; k++) {
      const z0 = from + k * step;
      prism([[z0, top - BAND], [z0 + step / 2, top - BAND - POINT], [z0 + step, top - BAND]]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, craftContext().toon(color));
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
        const built = buildStation(frame.hand > 0 ? -1 : 1, drop, places[end === 0 ? network.lines[line]!.a : network.lines[line]!.b]!, key);
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
    benchesNear(point, radius, out) {
      for (const station of stations.values()) {
        if (station.group.position.distanceToSquared(point) > (radius + 120) ** 2) continue;
        const sign = station.frame.hand > 0 ? -1 : 1;
        const world = station.group.matrixWorld;
        // The sitter's root, `sitAhead` of the back's front, on the deck.
        const spotX = sign * (STATION_BENCH_X - sitAhead(STATION_BENCH_BACK));
        STATION_BENCH_ZS.forEach((z, bench) => {
          for (const [k, along] of STATION_SIT_ALONG.entries()) {
            const position = new THREE.Vector3(spotX, PLATFORM_RISE, z + along).applyMatrix4(world);
            if (position.distanceTo(point) > radius) continue;
            const facing = new THREE.Vector3(-sign, 0, 0).transformDirection(world);
            out.push({ position, facing, sink: 0, key: `station:${station.key}:${bench}:${k}` });
          }
        });
      }
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
