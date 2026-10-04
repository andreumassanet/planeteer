/**
 * The roads of another world: every town joined to its natural neighbours,
 * as Earth's towns are (`roads.ts`, a Gabriel graph over the built towns), by
 * a carriageway that leaves by the end of a main street facing its way, runs
 * straight out over the town's levelled pad, and then crosses the country to
 * the next town's gate.
 *
 * **Which towns a road joins** is the relative-neighbourhood graph of the
 * towns — two are joined when no third is nearer both of them than they are
 * to each other — so every town is reached, nobody's road passes through a
 * third town, and a town has three or four roads and not twenty; a road
 * longer than `LONGEST` is left out, a desert not crossed. **And a road is
 * never laid up a cliff**: Earth's own `MAX_SLOPE` (`terrain.ts`) is asked of
 * the ground along its course, a course that climbs steeper bows round the
 * hill (`BENDS`), and where no bow clears it the two towns are left apart,
 * as Earth's are over a mountain. Pure: a function of the towns and the
 * ground, so every visitor drives the same network and the towns know which
 * of their streets go somewhere (`ends`).
 *
 * **How high it rides** is Earth's railway's crown (`crownProfile` in
 * `rails.ts`) and Earth's road's bank: the ground under the centre line plus
 * `LIFT`, or its moving average over `SMOOTH` points either side where that is
 * higher — a road runs over a dip on an embankment rather than down into it —
 * and never under either edge's own ground plus the lift, so on a hillside the
 * top leans with the hill (`tilt`, smoothed and bounded) and the uphill edge
 * is never buried. At each gate the top comes down to the street it carries
 * on (`CARRIAGE_TOP`) at Earth's `RAMP_GRADE`, level across. Either side, a
 * bank in the ground's own colour falls at `BANK_GRADE` to a toe `TOE_DEPTH`
 * under the ground, so the road neither floats nor is cut by a slope.
 *
 * **One surface, drawn and stood on**: `surfaceAt` reads the same top and
 * bank back, which the foot and the wheels stand on (`index.ts`'s `groundAt`),
 * as `ribbonHeightAt` is on Earth. Streamed in chunks round the traveller,
 * the crown worked out a chunk at a time, merged into one buffer a chunk; no
 * ink, which would draw a hull round a strip.
 *
 * **On a cloud deck the road is a bridge** (`deck`): the same network and the
 * same crown, a lift over the clouds, but no banks to a toe in the ground's
 * colour — a dyke of cloud — and in their place a steel fascia under the
 * top's edge, a rail along each side and pylons every `PYLON_EVERY` points
 * sinking out of sight into the deck. The towns' platforms float, and the
 * skyways between them are what the traffic drives.
 */

import * as THREE from 'three';
import type { WorldSpec } from './contract.ts';
import { newSample } from './terrain.ts';
import type { Terrain } from './terrain.ts';
import type { Site } from './settlements.ts';
import { PALETTE } from '../theme.ts';
import { latOf, lonOf } from '../sphere.ts';
import { MAX_SLOPE } from '../terrain.ts';
import { RAMP_GRADE } from '../scenery/ground.ts';
import { litAtNight } from './night.ts';

/** The longest road, units: past this two towns are left apart. */
const LONGEST = 2600;
/** Units between two points of a road's ribbon. */
const STEP = 5;
/** A chunk of ribbon, points: built and dropped as one. */
const CHUNK = 64;
/** Built within this of the traveller, dropped past the second, units, at the render distance's default. */
const BUILD_REACH = 3000;
const DROP_REACH = 3800;
/** What a road keeps clear of rocks either side of its top, units: its bank and a boulder's half beyond. */
const VERGE = 8;
/** How long a frame may spend building chunks, ms; the nearest one is always built. */
const BUILD_MS = 4;
/** How far over the ground the crown rides, units: an embankment a person's knee high. */
const LIFT = 1.5;
/** The crown's moving average, points either side: 30 units each way. */
const SMOOTH = 6;
/** The steepest the top may lean across, rise over run: a camber, not a hillside. */
const MAX_TILT = 0.12;
/** The gravel either side of the carriageway, at its height, before the bank. */
const SHOULDER = 0.9;
/** The bank: its fall a unit outward, how far under the ground its toe is laid, and the widest it spreads. */
const BANK_GRADE = 0.45;
const TOE_DEPTH = 1;
const BANK_RUN_MAX = 18;
/**
 * The run the slope test reads a grade over, units — a step's worth of rise
 * on a crater's rim is not a climb — and the bows tried round a hill, as
 * shares of the road's angle at its middle.
 */
const GRADE_RUN = 20;
const BENDS = [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36];
/** Over this many units out of a gate the pavement carries on beside the carriageway, then narrows to the shoulder over the second, as Earth's does. */
const PAVEMENT_RUN = 8;
const PAVEMENT_TAPER = 6;
/** The lit dashes down the middle: how long and how wide. */
const DASH = 2.6;
const DASH_HALF = 0.16;
/**
 * The marker posts along the shoulder, as Earth's roads keep theirs
 * (`roadside.ts`): one every this many points of the centre line (fifty
 * units), on alternate sides, none within `POST_CLEAR` points of a gate; how
 * tall and how thick, and how much of the top is the lit reflector.
 */
const POST_EVERY = 10;
/** On a deck: a pylon every this many points (forty units), how far it sinks into the clouds, the fascia's depth and the rail's height. */
const PYLON_EVERY = 8;
/** On a deck the crown rides this high over the clouds, so the skyway reads as a bridge on its pylons; it ramps down to a platform's street at `RAMP_GRADE`. */
const DECK_LIFT = 7;
const PYLON_SINK = 14;
const PYLON_HALF = 0.55;
const FASCIA = 1.1;
const RAIL = 0.95;
const POST_CLEAR = 6;
const POST_HEIGHT = 1.5;
const POST_HALF = 0.11;
const POST_LAMP = 0.32;
/** Points of the centre line a point of the map's line: forty units. */
const MAP_EVERY = 8;
/** How far over the carriageway a dash lies: enough not to flicker into it from far off. */
const DASH_OVER = 0.08;
/** The cells `surfaceAt` reads, units: wider than a piece of road and its banks reach from its first point (`STEP` + the widest half, `SHOULDER`, `BANK_RUN_MAX`). */
const CELL = 40;


/**
 * The top of a town's carriageway over its floor: the street a road carries
 * on, which `settlements.ts` draws and a road's crown comes down to at a gate.
 */
export const CARRIAGE_TOP = 0.12;

/** Which end of a town's main streets a road leaves by: the town's frame's north, east, south, west. */
export type Gate = 'n' | 'e' | 's' | 'w';

/** One road: from a town's gate to another's, bowed `bend` off the great circle. */
export interface Road {
  a: number;
  b: number;
  gateA: Gate;
  gateB: Gate;
  bend: number;
}

export interface RoadNetwork {
  roads: Road[];
  /** Which main street ends of a town go somewhere, by the town's id. */
  ends: ReadonlyMap<string, ReadonlySet<Gate>>;
  /** Neighbours left apart because every course between them climbed past `MAX_SLOPE`. */
  steep: number;
}

/** A town's pavement, `walk` wide at its gate, `s` units out along the road from it. */
function pavementAt(walk: number, s: number): number {
  if (s <= PAVEMENT_RUN) return walk;
  return Math.max(0, walk * (1 - (s - PAVEMENT_RUN) / PAVEMENT_TAPER));
}

/** A gate's direction in its town's frame (`frameAt`: +z north, +x = up x north, which is west). */
const GATE_DIRECTION: Readonly<Record<Gate, { x: number; z: number }>> = {
  n: { x: 0, z: 1 },
  s: { x: 0, z: -1 },
  w: { x: 1, z: 0 },
  e: { x: -1, z: 0 },
};

const scratchQ = new THREE.Quaternion();
const scratchV = new THREE.Vector3();

/** The gate of `site` that faces `toward` (a world direction) best. */
function gateToward(site: Site, toward: THREE.Vector3): Gate {
  scratchV.copy(toward).sub(site.dir).applyQuaternion(scratchQ.copy(site.quaternion).invert());
  let best: Gate = 'n';
  let score = -Infinity;
  for (const gate of ['n', 'e', 's', 'w'] as const) {
    const d = GATE_DIRECTION[gate];
    const s = scratchV.x * d.x + scratchV.z * d.z;
    if (s > score) [best, score] = [gate, s];
  }
  return best;
}

/** A point `out` units past `site`'s gate along its main street, in the world (the town's frame, as `Settlements.toWorld`). */
function gatePoint(site: Site, gate: Gate, out: number): THREE.Vector3 {
  const d = GATE_DIRECTION[gate];
  const half = site.town!.grid.half;
  return new THREE.Vector3(d.x * (half + out), 0, d.z * (half + out)).applyQuaternion(site.quaternion).add(site.origin);
}

/**
 * How high a town's street stands at its gate, over the walkable radius.
 * Measured **at the gate**, not at the town's middle: a town is built on the
 * plane tangent to the sphere at its middle, and at its edge that plane is
 * `d^2 / 2R` higher than the middle's height — on Mercury, three quarters of
 * a unit a hundred units out, which was the step every road met its street by.
 */
function gateHeight(site: Site, gate: Gate, R: number): number {
  const d = GATE_DIRECTION[gate];
  const half = site.town!.grid.half;
  return new THREE.Vector3(d.x * half, site.floor + CARRIAGE_TOP, d.z * half).applyQuaternion(site.quaternion).add(site.origin).length() - R;
}

/**
 * A road's centre line: out of the gate and straight across the pad, then
 * the country along the great circle — bowed sideways by `bend` of its angle
 * at the middle, easing to nothing at either end — then the other town's pad
 * and gate.
 */
function courseOf(A: Site, gateA: Gate, B: Site, gateB: Gate, bend: number, R: number): THREE.CatmullRomCurve3 {
  const control: THREE.Vector3[] = [gatePoint(A, gateA, 0), gatePoint(A, gateA, A.radius * 0.5), gatePoint(A, gateA, A.radius * 1.1)];
  const from = control[control.length - 1]!.clone().normalize();
  const exitB = gatePoint(B, gateB, B.radius * 1.1);
  const to = exitB.clone().normalize();
  const angle = from.angleTo(to);
  const lateral = new THREE.Vector3().crossVectors(from, to).normalize();
  // A control point every 220 units, and at least three where the course bows.
  const inner = Math.max(Math.round((angle * R) / 220) - 1, bend === 0 ? 0 : 3);
  for (let k = 1; k <= inner; k++) {
    const t = k / (inner + 1);
    const p = new THREE.Vector3().copy(from).lerp(to, t).normalize();
    p.addScaledVector(lateral, bend * angle * Math.sin(Math.PI * t)).normalize();
    control.push(p.multiplyScalar(R));
  }
  control.push(exitB, gatePoint(B, gateB, B.radius * 0.5), gatePoint(B, gateB, 0));
  return new THREE.CatmullRomCurve3(control, false, 'centripetal');
}

/** The steepest the ground climbs along `curve`, over `GRADE_RUN`. */
function steepestOf(curve: THREE.CatmullRomCurve3, terrain: Terrain): number {
  const length = curve.getLength();
  const count = Math.max(2, Math.ceil(length / (GRADE_RUN / 2)));
  const p = new THREE.Vector3();
  const heights = new Float64Array(count + 1);
  for (let k = 0; k <= count; k++) {
    curve.getPointAt(k / count, p).normalize();
    heights[k] = terrain.heightAt(p.x, p.y, p.z);
  }
  const run = (2 * length) / count;
  let worst = 0;
  for (let k = 0; k + 2 <= count; k++) worst = Math.max(worst, Math.abs(heights[k + 2]! - heights[k]!) / run);
  return worst;
}

/** The towns' roads: a pure function of the towns and the ground. */
export function roadNetwork(_spec: WorldSpec, sites: readonly Site[], terrain: Terrain): RoadNetwork {
  const R = terrain.radius;
  const ends = new Map<string, Set<Gate>>();
  const roads: Road[] = [];
  let steep = 0;
  const towns = sites.map((site, k) => ({ site, k })).filter((one) => !one.site.landmark && one.site.town !== null);
  const n = towns.length;
  const apart = (i: number, j: number): number => towns[i]!.site.dir.angleTo(towns[j]!.site.dir) * R;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = apart(i, j);
      if (d > LONGEST) continue;
      let blocked = false;
      for (let k = 0; k < n && !blocked; k++) {
        if (k === i || k === j) continue;
        if (Math.max(apart(i, k), apart(j, k)) < d) blocked = true;
      }
      if (blocked) continue;
      const A = towns[i]!.site;
      const B = towns[j]!.site;
      const gateA = gateToward(A, B.dir);
      const gateB = gateToward(B, A.dir);
      // The straightest course the ground allows, or none.
      const bend = BENDS.find((one) => steepestOf(courseOf(A, gateA, B, gateB, one, R), terrain) <= MAX_SLOPE);
      if (bend === undefined) {
        steep++;
        continue;
      }
      roads.push({ a: towns[i]!.k, b: towns[j]!.k, gateA, gateB, bend });
      for (const [site, gate] of [[A, gateA], [B, gateB]] as const) {
        const set = ends.get(site.id) ?? new Set<Gate>();
        set.add(gate);
        ends.set(site.id, set);
      }
    }
  }
  return { roads, ends, steep };
}

export interface Roads {
  group: THREE.Group;
  readonly network: RoadNetwork;
  /** Builds the chunks near `eye` and drops the far ones; `reach` is the render distance's multiple. */
  update(eye: THREE.Vector3, reach: number): void;
  /**
   * The road's surface over the direction `x, y, z` (a unit vector) as a
   * height over the walkable radius — the top, or the bank falling from it —
   * or null off every built road. What a foot and a wheel stand on.
   */
  surfaceAt(x: number, y: number, z: number): number | null;
  /**
   * Every road as a line of `[lat, lon]` a few tens of units a point, for the
   * map: class 1, a road, Earth's middle one.
   */
  lines(): { cls: number; points: [number, number][] }[];
  /** The roads with a point within `within` units of `point`, and how far along each that nearest point is. */
  near(point: THREE.Vector3, within: number): { road: number; s: number }[];
  /** How long a road is, units, gate to gate. */
  lengthOf(road: number): number;
  /** The carriageway's half-width on a road, units. */
  halfOf(road: number): number;
  /**
   * The point on a road's top `s` units from gate A and `lateral` units to
   * its right, written into `at`, and the way the road runs there (from A to
   * B) into `along`: what the traffic drives on.
   */
  place(road: number, s: number, lateral: number, at: THREE.Vector3, along: THREE.Vector3): void;
  /** The nearest point on any road's crown to `point`, within `within` units, and the road's heading there; null past it. */
  nearest(point: THREE.Vector3, within: number): { at: THREE.Vector3; along: THREE.Vector3 } | null;
  /**
   * Every built piece's top read back between its points and across its
   * width, against the drawn ground there: what a check holds the crown to.
   * `each` gets the top's height and the ground's, over the walkable radius.
   */
  sweep(each: (top: number, ground: number) => void): void;
  readonly stats: { roads: number; steep: number; chunks: number; triangles: number };
  /** The worst step between a road's crown at its gate and the town street it meets, units: for the checks. */
  gateStep(): number;
  dispose(): void;
}

/** One road as the ribbon draws it: its centre line, and the crown worked out a chunk at a time. */
interface Ribbon {
  /** Unit directions of the centre line, `STEP` apart. */
  dirs: THREE.Vector3[];
  /** The carriageway's half-width, and the pavement's width at each gate. */
  half: number;
  walkA: number;
  walkB: number;
  /** The street's top at each gate, over the walkable radius. */
  gateA: number;
  gateB: number;
  /** The ground under the centre and either edge of the top, NaN until asked. */
  ground: Float64Array;
  left: Float64Array;
  right: Float64Array;
  /** The same three halfway to the next point: a bump between two points is under a piece drawn straight across it. */
  midGround: Float64Array;
  midLeft: Float64Array;
  midRight: Float64Array;
  /** The crown's height over the centre line and its lean (rise a unit to the right), NaN until worked out. */
  crown: Float64Array;
  tilt: Float64Array;
}

export function createRoads(spec: WorldSpec, terrain: Terrain, sites: readonly Site[], network: RoadNetwork, gradientMap: THREE.Texture): Roads {
  const R = terrain.radius;
  const group = new THREE.Group();
  group.name = 'world-roads';
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  // Faceted as the ground is (`tiles.ts`), so a bank in the ground's colour
  // takes the light the hill beside it does.
  material.defines = { ...material.defines, FLAT_SHADED: '' };
  material.userData.outlineParameters = { visible: false };
  // The dashes glow after dark as the streets' do: a per-vertex weight.
  const glowUniform = { value: 0.6 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = glowUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGlow;');
  };
  material.customProgramCacheKey = () => 'world:roads';
  // Under the lamps and the headlights after dark, as the ground beside it is.
  litAtNight(material);
  const style = spec.civilisation?.architecture;
  // The town's own street colours (`settlements.ts`), and a gravel a shade under the carriageway.
  const grey = new THREE.Color(PALETTE.steel).multiplyScalar(1.25);
  const pavement = new THREE.Color(PALETTE.bone).multiplyScalar(1.04);
  const gravel = new THREE.Color(PALETTE.steel).multiplyScalar(0.95);
  const accent = new THREE.Color(style?.accents[0] ?? PALETTE.gold);
  const white = new THREE.Color(PALETTE.white);
  const deck = spec.ground === 'cloud-deck';
  const steel = new THREE.Color(PALETTE.steel).multiplyScalar(0.9);
  const steelDark = new THREE.Color(PALETTE.steel).multiplyScalar(0.6);

  const mainWalk = (site: Site): number => site.town!.streets.find((street) => street.main)?.walk ?? 0;
  const ribbons: Ribbon[] = [];
  for (const road of network.roads) {
    const A = sites[road.a]!;
    const B = sites[road.b]!;
    const curve = courseOf(A, road.gateA, B, road.gateB, road.bend, R);
    const count = Math.max(2, Math.ceil(curve.getLength() / STEP));
    const dirs: THREE.Vector3[] = [];
    for (let k = 0; k <= count; k++) dirs.push(curve.getPointAt(k / count, new THREE.Vector3()).normalize());
    const half = A.town!.mainCarriage;
    const blank = (): Float64Array => new Float64Array(dirs.length).fill(NaN);
    ribbons.push({
      dirs,
      half,
      walkA: mainWalk(A),
      walkB: mainWalk(B),
      gateA: gateHeight(A, road.gateA, R),
      gateB: gateHeight(B, road.gateB, R),
      ground: blank(),
      left: blank(),
      right: blank(),
      midGround: blank(),
      midLeft: blank(),
      midRight: blank(),
      crown: blank(),
      tilt: blank(),
    });
    // Nothing lies about on it: the decorations keep off the top and a verge
    // either side (`Terrain.keepBare`), before a tile is laid.
    for (let k = 0; k < dirs.length; k += 2) {
      const d = dirs[k]!;
      terrain.keepBare(d.x, d.y, d.z, half + SHOULDER + VERGE);
    }
  }

  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const mid = new THREE.Vector3();

  /** The road's right at point `k`: across the centre line, in the tangent plane. */
  function sideAt(ribbon: Ribbon, k: number, out: THREE.Vector3): THREE.Vector3 {
    const { dirs } = ribbon;
    tangent.subVectors(dirs[Math.min(dirs.length - 1, k + 1)]!, dirs[Math.max(0, k - 1)]!);
    return out.crossVectors(tangent, dirs[k]!).normalize();
  }

  /** How far from the nearer gate point `k` is, units. */
  const fromGate = (ribbon: Ribbon, k: number): number => Math.min(k, ribbon.dirs.length - 1 - k) * STEP;
  /** The edge of the top, from the centre line, at point `k`: the shoulder, or out of a gate the pavement carried on. */
  const edgeOf = (ribbon: Ribbon, k: number): number => {
    const walk = Math.max(pavementAt(ribbon.walkA, k * STEP), pavementAt(ribbon.walkB, (ribbon.dirs.length - 1 - k) * STEP));
    return ribbon.half + Math.max(SHOULDER, walk);
  };

  /** The ground under point `k` and the two edges of its top, read once. */
  function groundOf(ribbon: Ribbon, k: number): void {
    if (!Number.isNaN(ribbon.ground[k]!)) return;
    const d = ribbon.dirs[k]!;
    sideAt(ribbon, k, side).multiplyScalar(edgeOf(ribbon, k) / R);
    ribbon.ground[k] = terrain.heightAt(d.x, d.y, d.z);
    probe.copy(d).sub(side).normalize();
    ribbon.left[k] = terrain.heightAt(probe.x, probe.y, probe.z);
    probe.copy(d).add(side).normalize();
    ribbon.right[k] = terrain.heightAt(probe.x, probe.y, probe.z);
    if (k === ribbon.dirs.length - 1) return;
    mid.copy(d).add(ribbon.dirs[k + 1]!).normalize();
    ribbon.midGround[k] = terrain.heightAt(mid.x, mid.y, mid.z);
    probe.copy(mid).sub(side).normalize();
    ribbon.midLeft[k] = terrain.heightAt(probe.x, probe.y, probe.z);
    probe.copy(mid).add(side).normalize();
    ribbon.midRight[k] = terrain.heightAt(probe.x, probe.y, probe.z);
  }

  /**
   * The crown at points `from` to `to`: the moving average where it is
   * higher than the ground's lift, never under either edge's, down to each
   * gate's street at `RAMP_GRADE`. Reads the ground `SMOOTH` points beyond.
   */
  function crownOf(ribbon: Ribbon, from: number, to: number): void {
    const last = ribbon.dirs.length - 1;
    for (let k = Math.max(0, from - SMOOTH); k <= Math.min(last, to + SMOOTH); k++) groundOf(ribbon, k);
    for (let k = from; k <= to; k++) {
      if (!Number.isNaN(ribbon.crown[k]!)) continue;
      const s = k * STEP;
      const out = fromGate(ribbon, k);
      // The lift itself climbs out of a gate from the street's top.
      const lift = Math.min(deck ? DECK_LIFT : LIFT, CARRIAGE_TOP + RAMP_GRADE * out);
      let sum = 0;
      let lean = 0;
      let n = 0;
      for (let j = Math.max(0, k - SMOOTH); j <= Math.min(last, k + SMOOTH); j++) {
        sum += ribbon.ground[j]!;
        lean += (ribbon.right[j]! - ribbon.left[j]!) / (2 * edgeOf(ribbon, j));
        n++;
      }
      // Level across at a gate, as the street it meets is.
      const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, lean / n)) * Math.min(1, out / (LIFT / RAMP_GRADE + PAVEMENT_RUN + PAVEMENT_TAPER));
      const edge = edgeOf(ribbon, k);
      // No higher than each gate's street plus the grade back to it.
      const cap = Math.min(ribbon.gateA + RAMP_GRADE * s, ribbon.gateB + RAMP_GRADE * (last * STEP - s));
      // Never under the ground plus the lift, here, at either neighbour or
      // halfway to it, under the centre or either edge: a piece is drawn
      // straight across whatever rises between two points.
      let floor = -Infinity;
      for (let j = Math.max(0, k - 1); j <= Math.min(last, k + 1); j++) {
        floor = Math.max(floor, ribbon.ground[j]!, ribbon.left[j]! + tilt * edge, ribbon.right[j]! - tilt * edge);
        if (j < k || (j === k && k < last)) floor = Math.max(floor, ribbon.midGround[j]!, ribbon.midLeft[j]! + tilt * edge, ribbon.midRight[j]! - tilt * edge);
      }
      // And no lower than each gate's street less the grade back to it: a
      // town standing higher than the ground round it — a giant's platform
      // over its deck — is climbed up to, or the road met its street a step
      // under the kerb.
      const low = Math.max(ribbon.gateA - RAMP_GRADE * s, ribbon.gateB - RAMP_GRADE * (last * STEP - s));
      // At the gate itself, exactly the street: a road ends on its town's
      // kerb line at its paving's height, as Earth's do.
      const crown = k === 0 ? ribbon.gateA : k === last ? ribbon.gateB : Math.max(floor + lift, low, Math.min(sum / n + lift, cap));
      ribbon.crown[k] = crown;
      ribbon.tilt[k] = tilt;
    }
  }

  interface Chunk {
    road: number;
    from: number;
    to: number;
    centre: THREE.Vector3;
    mesh: THREE.Mesh | null;
    indexed: boolean;
  }
  const chunks: Chunk[] = [];
  ribbons.forEach((ribbon, road) => {
    for (let from = 0; from < ribbon.dirs.length - 1; from += CHUNK) {
      const to = Math.min(ribbon.dirs.length - 1, from + CHUNK);
      chunks.push({ road, from, to, centre: ribbon.dirs[Math.floor((from + to) / 2)]!.clone().multiplyScalar(R), mesh: null, indexed: false });
    }
  });

  /**
   * Which pieces of which road stand in a cell of space `CELL` wide — as wide
   * as a piece reaches — so `surfaceAt` reads its own cell and the 26 round
   * it, a handful of pieces and not a network. Filled as chunks are first built.
   */
  const cells = new Map<number, { road: number; k: number }[]>();
  const cellOf = (v: number): number => Math.floor((v * R) / CELL) + 8192;
  const cellKey = (i: number, j: number, l: number): number => (i * 16384 + j) * 16384 + l;
  function index(chunk: Chunk): void {
    if (chunk.indexed) return;
    chunk.indexed = true;
    for (let k = chunk.from; k < chunk.to; k++) {
      const d = ribbons[chunk.road]!.dirs[k]!;
      const key = cellKey(cellOf(d.x), cellOf(d.y), cellOf(d.z));
      const list = cells.get(key);
      if (list === undefined) cells.set(key, [{ road: chunk.road, k }]);
      else list.push({ road: chunk.road, k });
    }
  }

  const stats = { roads: ribbons.length, steep: network.steep, chunks: 0, triangles: 0 };
  const sample = newSample();

  function build(chunk: Chunk): void {
    const ribbon = ribbons[chunk.road]!;
    crownOf(ribbon, chunk.from, chunk.to);
    index(chunk);
    const { half } = ribbon;
    const positions: number[] = [];
    const colours: number[] = [];
    const glows: number[] = [];
    const origin = ribbon.dirs[chunk.from]!.clone().multiplyScalar(R + ribbon.crown[chunk.from]!);
    /** Two triangles, `a -> b` along the road and `a -> d` to its right: `a`, `b` take `near`, `c`, `d` take `far`. */
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, near: THREE.Color, far: THREE.Color, glow: number): void => {
      // Wound to face up: a, c, b is clockwise seen from above.
      for (const p of [a, c, b, a, d, c]) {
        positions.push(p.x - origin.x, p.y - origin.y, p.z - origin.z);
        const colour = p === a || p === b ? near : far;
        colours.push(colour.r, colour.g, colour.b);
        glows.push(glow);
      }
    };
    /**
     * A square post standing on `foot` along `up`, `height` tall, its faces
     * square to the road (`along`). Each face wound outward: seen from
     * outside, `a` bottom left, `b` top left, `c` top right, `d` bottom right.
     */
    const post = (foot: THREE.Vector3, up: THREE.Vector3, along: THREE.Vector3, colour: THREE.Color, glow: number, height: number, thick = POST_HALF): void => {
      const right = new THREE.Vector3().crossVectors(along, up).normalize();
      for (const n of [along, right, along.clone().negate(), right.clone().negate()]) {
        const across = new THREE.Vector3().crossVectors(up, n);
        const a = foot.clone().addScaledVector(n, thick).addScaledVector(across, -thick);
        const d = foot.clone().addScaledVector(n, thick).addScaledVector(across, thick);
        quad(a, a.clone().addScaledVector(up, height), d.clone().addScaledVector(up, height), d, colour, colour, glow);
      }
      const top = foot.clone().addScaledVector(up, height);
      const a = top.clone().addScaledVector(along, -thick).addScaledVector(right, -thick);
      quad(a, a.clone().addScaledVector(along, thick * 2), a.clone().addScaledVector(along, thick * 2).addScaledVector(right, thick * 2), a.clone().addScaledVector(right, thick * 2), colour, colour, glow);
    };
    /** The point `offset` across the top at `k`, `over` above it. */
    const across = (k: number, offset: number, over = 0): THREE.Vector3 => {
      sideAt(ribbon, k, side);
      const height = ribbon.crown[k]! + ribbon.tilt[k]! * offset + over;
      return ribbon.dirs[k]!.clone().multiplyScalar(R + height).addScaledVector(side, offset);
    };
    /** The bank's toe at `k` on side `way`: out from the top's edge at `BANK_GRADE`, under the ground there, and the ground's colour. */
    const toes = new Map<number, { point: THREE.Vector3; colour: THREE.Color }>();
    const toe = (k: number, way: -1 | 1): { point: THREE.Vector3; colour: THREE.Color } => {
      const key = k * 2 + (way > 0 ? 1 : 0);
      const known = toes.get(key);
      if (known !== undefined) return known;
      const edge = edgeOf(ribbon, k);
      const top = ribbon.crown[k]! + ribbon.tilt[k]! * edge * way;
      const run = Math.min(BANK_RUN_MAX, Math.max(1, (top - (way > 0 ? ribbon.right[k]! : ribbon.left[k]!) + TOE_DEPTH) / BANK_GRADE));
      sideAt(ribbon, k, side);
      const at = ribbon.dirs[k]!.clone().multiplyScalar(R).addScaledVector(side, (edge + run) * way).normalize();
      terrain.sample(at.x, at.y, at.z, sample);
      const one = { point: at.multiplyScalar(R + sample.height - TOE_DEPTH), colour: new THREE.Color(sample.r, sample.g, sample.b) };
      toes.set(key, one);
      return one;
    };
    for (let k = chunk.from; k < chunk.to; k++) {
      const e0 = edgeOf(ribbon, k);
      const e1 = edgeOf(ribbon, k + 1);
      quad(across(k, -half), across(k + 1, -half), across(k + 1, half), across(k, half), grey, grey, 0);
      // The shoulders, or out of a gate the pavement carried on; then the
      // bank, from the top's edge down to its toe in the ground's colour.
      const shoulder = e0 > half + SHOULDER ? pavement : gravel;
      const r0 = toe(k, 1);
      const r1 = toe(k + 1, 1);
      const l0 = toe(k, -1);
      const l1 = toe(k + 1, -1);
      quad(across(k, half), across(k + 1, half), across(k + 1, e1), across(k, e0), shoulder, shoulder, 0);
      quad(across(k, -e0), across(k + 1, -e1), across(k + 1, -half), across(k, -half), shoulder, shoulder, 0);
      if (deck) {
        // A bridge: the fascia under each edge and a rail along it, faced
        // both ways, and a pylon under each side now and then.
        for (const way of [1, -1] as const) {
          const a0 = across(k, e0 * way);
          const a1 = across(k + 1, e1 * way);
          const d0 = across(k, e0 * way, -FASCIA);
          const d1 = across(k + 1, e1 * way, -FASCIA);
          const t0 = across(k, e0 * way, RAIL);
          const t1 = across(k + 1, e1 * way, RAIL);
          // Wound to face out, away from the carriageway (`quad`'s normal is `(d - a) x (b - a)`).
          if (way > 0) {
            quad(d1, d0, a0, a1, steel, steel, 0);
            quad(a0, a1, t1, t0, white, white, 0);
            quad(t0, t1, a1, a0, white, white, 0);
          } else {
            quad(d0, d1, a1, a0, steel, steel, 0);
            quad(a1, a0, t0, t1, white, white, 0);
            quad(t1, t0, a0, a1, white, white, 0);
          }
          // A lit strip along the rail's top, facing up: after dark the
          // skyways are lines of light between the floating towns.
          const s0 = across(k, (e0 - 0.18) * way, RAIL);
          const s1 = across(k + 1, (e1 - 0.18) * way, RAIL);
          const o0 = across(k, (e0 + 0.18) * way, RAIL);
          const o1 = across(k + 1, (e1 + 0.18) * way, RAIL);
          if (way > 0) quad(s0, s1, o1, o0, accent, accent, 0.9);
          else quad(o0, o1, s1, s0, accent, accent, 0.9);
          if (k % PYLON_EVERY === PYLON_EVERY / 2 && k > POST_CLEAR && k < ribbon.dirs.length - 1 - POST_CLEAR) {
            const top = across(k, (e0 - PYLON_HALF) * way, -FASCIA);
            const up = top.clone().normalize();
            const along = ribbon.dirs[k + 1]!.clone().sub(ribbon.dirs[k]!);
            along.addScaledVector(up, -along.dot(up)).normalize();
            const sink = top.length() - (R + ribbon.ground[k]!) + PYLON_SINK;
            post(top.clone().addScaledVector(up, -sink), up, along, steelDark, 0, sink, PYLON_HALF);
          }
        }
        // The underside, seen from the clouds under it.
        quad(across(k, e0, -FASCIA), across(k + 1, e1, -FASCIA), across(k + 1, -e1, -FASCIA), across(k, -e0, -FASCIA), steelDark, steelDark, 0);
      } else {
        quad(across(k, e0), across(k + 1, e1), r1.point, r0.point, r0.colour, r0.colour, 0);
        quad(l0.point, l1.point, across(k + 1, -e1), across(k, -e0), l0.colour, l0.colour, 0);
      }
      // A marker post on the shoulder's outer edge every `POST_EVERY` points,
      // white with a reflector that burns after dark, alternating sides.
      if (!deck && k % POST_EVERY === 0 && k > POST_CLEAR && k < ribbon.dirs.length - 1 - POST_CLEAR) {
        const way = (k / POST_EVERY) % 2 === 0 ? 1 : -1;
        const foot = across(k, (e0 - 0.25) * way, 0);
        const up = foot.clone().normalize();
        const along = ribbon.dirs[k + 1]!.clone().sub(ribbon.dirs[k]!);
        along.addScaledVector(up, -along.dot(up)).normalize();
        post(foot, up, along, white, 0, POST_HEIGHT - POST_LAMP);
        post(foot.clone().addScaledVector(up, POST_HEIGHT - POST_LAMP), up, along, accent, 0.9, POST_LAMP);
      }
      // A dash on every other step, half a step long: lit dashes with gaps,
      // as the town's main streets have.
      if (k % 2 === 0) {
        const share = DASH / STEP;
        const a0 = across(k, -DASH_HALF, DASH_OVER);
        const b0 = across(k, DASH_HALF, DASH_OVER);
        const a1 = a0.clone().lerp(across(k + 1, -DASH_HALF, DASH_OVER), share);
        const b1 = b0.clone().lerp(across(k + 1, DASH_HALF, DASH_OVER), share);
        quad(a0, a1, b1, b0, accent, accent, 0.8);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setAttribute('aGlow', new THREE.Float32BufferAttribute(glows, 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(origin);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    chunk.mesh = mesh;
    stats.chunks++;
    stats.triangles += positions.length / 9;
  }

  function drop(chunk: Chunk): void {
    if (chunk.mesh === null) return;
    group.remove(chunk.mesh);
    stats.triangles -= chunk.mesh.geometry.getAttribute('position').count / 3;
    chunk.mesh.geometry.dispose();
    chunk.mesh = null;
    stats.chunks--;
  }

  const segment = new THREE.Vector3();
  return {
    group,
    network,
    stats,
    update(eye, reach) {
      const near = BUILD_REACH * Math.max(0.5, reach);
      const far = DROP_REACH * Math.max(0.5, reach);
      // The far ones let go, then the nearest of the wanted built first: a
      // traveller set down on a road sees the road under them first.
      const wanted: { chunk: Chunk; d: number }[] = [];
      for (const chunk of chunks) {
        const d = chunk.centre.distanceTo(eye);
        if (chunk.mesh !== null && d > far) drop(chunk);
        else if (chunk.mesh === null && d < near) wanted.push({ chunk, d });
      }
      wanted.sort((a, b) => a.d - b.d);
      const began = performance.now();
      for (const one of wanted) {
        build(one.chunk);
        if (performance.now() - began > BUILD_MS) break;
      }
    },
    surfaceAt(x, y, z) {
      let best: number | null = null;
      const ci = cellOf(x);
      const cj = cellOf(y);
      const cl = cellOf(z);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (let l = cl - 1; l <= cl + 1; l++) {
      const list = cells.get(cellKey(i, j, l));
      if (list === undefined) continue;
      for (const { road, k } of list) {
        const ribbon = ribbons[road]!;
        const a = ribbon.dirs[k]!;
        // Along the piece and across it, on the tangent plane at `a`.
        segment.subVectors(ribbon.dirs[k + 1]!, a);
        probe.set(x - a.x, y - a.y, z - a.z);
        const t = probe.dot(segment) / segment.lengthSq();
        if (t < 0 || t > 1) continue;
        const offset = probe.dot(sideAt(ribbon, k, side)) * R;
        const edge = edgeOf(ribbon, k);
        const away = Math.abs(offset);
        if (away > edge + BANK_RUN_MAX) continue;
        const crown = ribbon.crown[k]! + (ribbon.crown[k + 1]! - ribbon.crown[k]!) * t;
        const tilt = ribbon.tilt[k]! + (ribbon.tilt[k + 1]! - ribbon.tilt[k]!) * t;
        let height: number;
        if (away <= edge) height = crown + tilt * offset;
        else if (deck) continue;
        else {
          // The bank, as `build` lays it: the top's edge straight down to its toe.
          const way = offset > 0 ? 1 : -1;
          const top = crown + tilt * edge * way;
          const under = way > 0 ? ribbon.right[k]! : ribbon.left[k]!;
          const run = Math.min(BANK_RUN_MAX, Math.max(1, (top - under + TOE_DEPTH) / BANK_GRADE));
          if (away > edge + run) continue;
          height = top + ((away - edge) / run) * (under - TOE_DEPTH - top);
        }
        if (best === null || height > best) best = height;
      }
      }
      return best;
    },
    sweep(each) {
      const at = new THREE.Vector3();
      for (const chunk of chunks) {
        if (chunk.mesh === null) continue;
        const ribbon = ribbons[chunk.road]!;
        for (let k = chunk.from; k < chunk.to; k++) {
          sideAt(ribbon, k, side);
          const edge = Math.min(edgeOf(ribbon, k), edgeOf(ribbon, k + 1));
          for (const t of [0, 0.25, 0.5, 0.75]) {
            for (const offset of [-edge, -edge / 2, 0, edge / 2, edge]) {
              at.copy(ribbon.dirs[k]!).lerp(ribbon.dirs[k + 1]!, t).normalize().addScaledVector(side, offset / R).normalize();
              const crown = ribbon.crown[k]! + (ribbon.crown[k + 1]! - ribbon.crown[k]!) * t;
              const tilt = ribbon.tilt[k]! + (ribbon.tilt[k + 1]! - ribbon.tilt[k]!) * t;
              each(crown + tilt * offset, terrain.groundAt(at.x, at.y, at.z));
            }
          }
        }
      }
    },
    gateStep() {
      let worst = 0;
      for (const ribbon of ribbons) {
        const last = ribbon.dirs.length - 1;
        crownOf(ribbon, 0, 0);
        crownOf(ribbon, last, last);
        worst = Math.max(worst, Math.abs(ribbon.crown[0]! - ribbon.gateA), Math.abs(ribbon.crown[last]! - ribbon.gateB));
      }
      return worst;
    },
    lines() {
      return ribbons.map((ribbon) => {
        const points: [number, number][] = [];
        const last = ribbon.dirs.length - 1;
        for (let k = 0; k < last + MAP_EVERY; k += MAP_EVERY) {
          const d = ribbon.dirs[Math.min(k, last)]!;
          points.push([latOf(d.y), lonOf(d.x, d.z)]);
        }
        return { cls: 1, points };
      });
    },
    near(point, within) {
      const out: { road: number; s: number }[] = [];
      probe.copy(point).normalize();
      const cos = Math.cos(within / R);
      ribbons.forEach((ribbon, road) => {
        let best = -1;
        let bestDot = cos;
        // A coarse pass, then the step itself round the best.
        for (let k = 0; k < ribbon.dirs.length; k += 8) {
          const dot = ribbon.dirs[k]!.dot(probe);
          if (dot > bestDot) [best, bestDot] = [k, dot];
        }
        if (best < 0) return;
        for (let k = Math.max(0, best - 8); k <= Math.min(ribbon.dirs.length - 1, best + 8); k++) {
          const dot = ribbon.dirs[k]!.dot(probe);
          if (dot >= bestDot) [best, bestDot] = [k, dot];
        }
        out.push({ road, s: best * STEP });
      });
      return out;
    },
    lengthOf: (road) => (ribbons[road]!.dirs.length - 1) * STEP,
    halfOf: (road) => ribbons[road]!.half,
    place(road, s, lateral, at, along) {
      const ribbon = ribbons[road]!;
      const last = ribbon.dirs.length - 1;
      const u = Math.min(last - 1e-6, Math.max(0, s / STEP));
      const k = Math.min(last - 1, Math.floor(u));
      const t = u - k;
      crownOf(ribbon, k, k + 1);
      const crown = ribbon.crown[k]! + (ribbon.crown[k + 1]! - ribbon.crown[k]!) * t;
      const tilt = ribbon.tilt[k]! + (ribbon.tilt[k + 1]! - ribbon.tilt[k]!) * t;
      at.copy(ribbon.dirs[k]!).lerp(ribbon.dirs[k + 1]!, t).normalize();
      sideAt(ribbon, k, side);
      at.multiplyScalar(R + crown + tilt * lateral).addScaledVector(side, lateral);
      along.subVectors(ribbon.dirs[k + 1]!, ribbon.dirs[k]!);
      along.addScaledVector(at, -along.dot(at) / at.lengthSq()).normalize();
    },
    nearest(point, within) {
      let best: { at: THREE.Vector3; along: THREE.Vector3 } | null = null;
      let bestD = within;
      ribbons.forEach((ribbon) => {
        for (let k = 0; k < ribbon.dirs.length - 1; k++) {
          const d = probe.copy(ribbon.dirs[k]!).multiplyScalar(R).distanceTo(point);
          if (d < bestD) {
            bestD = d;
            crownOf(ribbon, k, k);
            best = { at: ribbon.dirs[k]!.clone().multiplyScalar(R + ribbon.crown[k]!), along: ribbon.dirs[k + 1]!.clone().sub(ribbon.dirs[k]!).normalize() };
          }
        }
      });
      return best;
    },
    dispose() {
      for (const chunk of chunks) drop(chunk);
      group.removeFromParent();
      material.dispose();
    },
  };
}
