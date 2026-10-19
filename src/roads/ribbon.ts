import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS, groundColorAt } from '../globe.ts';
import { DASH, MARKED_STREET, SIDEWALK, asphaltOf, groundStyleFor, trodden } from '../scenery/ground.ts';
import { PALETTE } from '../theme.ts';
import { ROAD_CLASSES } from './classes.ts';
import type { RoadCourse } from './course.ts';
import { onBridge } from './crown.ts';
import type { RoadRamp } from './crown.ts';
import { lampGlow, ribbonGlow } from './glow.ts';
import type { GateLight } from './glow.ts';
import { BAND_WIDTH, SPANS } from './lod.ts';
import { carriageEdges, dashGives, edgeGives, edgeLineAcross, markingRuns, pieceAt } from './markings.ts';
import { MARK_BANK, MARK_GIRDER, MARK_PAINT, MARK_ROAD, MARK_SHOULDER, MARK_WALK } from './material.ts';
import { insideOthers } from './overlap.ts';
import type { OtherRoad } from './overlap.ts';
import type { CoursePath } from './path.ts';
import { createRibbonWriter, dash, dashRun, edgeLine, shoulderStrip } from './ribbon-writer.ts';
import type { Ribbon, RibbonWriter, SurfacePlane } from './ribbon-writer.ts';
import { CARRIAGE_RUN, KNEE_RUN, carriageHalf, onPavement, ribbonHalf, ribbonSection, ribbonStations } from './section.ts';
import type { Road } from './types.ts';

/**
 * Lays one road's ribbon in one band, gate to gate on the course the bake
 * tested. Each piece between two sections (`ribbonSection`) is two banks in
 * the land's colour under their toes and the top. In the near band the top is
 * split into the carriageway and a shoulder each side (or a town's pavement
 * over its approach), the bank gets its skirt, and a marked road gets a dashed
 * centre line and edge lines, all giving way to other roads' surfaces. Further
 * out the top is one quad in the carriageway's colour.
 *
 * Over `CARRIAGE_RUN` into a built town the road becomes the street it enters:
 * the street's carriageway and pavement (`carriageHalf`, `ribbonHalf`), its
 * colours, its centre line dashed on the town's own phase and no edge lines,
 * and the town's paint and patterns in the town's own plane (`Ribbon.surface`),
 * so the kerb between them does not show.
 */

/** A road's end as the ribbon reads it: its town's plane and the street the gate opens. */
export interface RibbonEnd {
  /** The town's `townFrame` axes, its patterns' plane. */
  across: THREE.Vector3;
  north: THREE.Vector3;
  /** Where the street's centre line meets the kerb, a unit vector (`RoadCourse.gateA`). */
  point: THREE.Vector3;
  /** The gate's coordinate along the street's axis in the town's frame, and which way out is along it (+1 or -1). */
  along: number;
  out: number;
  /** Whether the town is built: only then is there a street to become. */
  built: boolean;
}

export interface RibbonInput {
  world: World;
  road: Road;
  course: RoadCourse;
  path: CoursePath;
  ramp: RoadRamp;
  band: number;
  /** The other roads whose tops come near this one (near band only). */
  others: readonly OtherRoad[];
  lights: readonly GateLight[];
  /** The road's own lamp heads (near band only). */
  heads: readonly number[];
  /** The road's middle, a unit vector: where its surface colour is sampled. */
  middle: THREE.Vector3;
  /** The region ids at the road's two ends. */
  regionA: string;
  regionB: string;
  ends: readonly [RibbonEnd, RibbonEnd];
}

const crownA = new THREE.Color();
const crownB = new THREE.Color();
const tarmacA = new THREE.Color();
const tarmacB = new THREE.Color();
const sand = new THREE.Color(PALETTE.sand);
const gravel = new THREE.Color();
const walkA = new THREE.Color();
const walkB = new THREE.Color();
const verge = new THREE.Color();
const ground = new THREE.Color();
/** A bridge's girder: the piers' weathered concrete. */
const girder = new THREE.Color(PALETTE.bone).lerp(new THREE.Color(PALETTE.tan), 0.35).multiplyScalar(0.85);
const ink = new THREE.Color(0x2a1410);
/** Where across a bank its knee is, as `roadMark.y` reads it: `KNEE_RUN` of the way from the top to the toe. */
const BANK_KNEE = KNEE_RUN;
/** A town's street line (`colours.line` in `settlements/ground/job.ts`): what the road's centre line is near a town. */
const STREET_LINE = new THREE.Color(PALETTE.white);
const scratch = new THREE.Vector3();

/**
 * Sets the road's colours for this ribbon: the carriageway is each end's
 * street colour (`GroundStyle.road`, as its town is paved), a trunk worn
 * darker, warmed off the towns (`asphaltOf`); the shoulder is packed earth and
 * gravel; the pavements are each end's own. Returns whether each end's half
 * is marked.
 */
function paintRoad(input: RibbonInput): [boolean, boolean] {
  groundColorAt(input.world, scratch.copy(input.middle).multiplyScalar(PLANET_RADIUS), ground);
  const styleA = groundStyleFor(input.regionA);
  const styleB = groundStyleFor(input.regionB);
  crownA.setHex(styleA.road);
  crownB.setHex(styleB.road);
  if (input.road.cls === 2) {
    crownA.lerp(ink, 0.12);
    crownB.lerp(ink, 0.12);
  }
  trodden(ground, verge);
  gravel.setHex(PALETTE.tan).lerp(sand, 0.35).lerp(verge, 0.2);
  walkA.setHex(styleA.walk);
  walkB.setHex(styleB.walk);
  asphaltOf(crownA, tarmacA);
  asphaltOf(crownB, tarmacB);
  return [styleA.marked && input.band === 0, styleB.marked && input.band === 0];
}

/** The scratch a ribbon is laid with: two rolling sections, their colours and the carriageway's edges. */
interface Laying {
  input: RibbonInput;
  writer: RibbonWriter;
  half: number;
  /** Whether each end's half carries a centre line, and whether its town's street does at the kerb. */
  marked: [boolean, boolean];
  streetLined: [boolean, boolean];
  /** The patterns' plane for each end's half. */
  planes: [SurfacePlane, SurfacePlane];
  near: THREE.Vector3[];
  far: THREE.Vector3[];
  nearTone: THREE.Color[];
  farTone: THREE.Color[];
  nearL: THREE.Vector3;
  nearR: THREE.Vector3;
  farL: THREE.Vector3;
  farR: THREE.Vector3;
  active: OtherRoad[];
  one: OtherRoad[];
  runs: number[];
}

/** How far a point is from either built end's kerb, as the share by which the tarmac is the open road's. */
function fadedAt(input: RibbonInput, sAt: number): number {
  let share = 1;
  if (input.ramp.kerbA > 0) share = Math.min(share, sAt / CARRIAGE_RUN);
  if (input.ramp.kerbB > 0) share = Math.min(share, (input.path.length - sAt) / CARRIAGE_RUN);
  return Math.max(0, Math.min(1, share));
}

/** Whether `sAt` is on end A's half of the road. */
const onA = (input: RibbonInput, sAt: number): boolean => sAt < input.path.length * 0.5;

/** A section's colours: the land under each toe, the same at the bank's top, the tarmac of the nearer end. */
function toneOf(input: RibbonInput, points: readonly THREE.Vector3[], sAt: number, into: THREE.Color[]): void {
  for (const [toe, top] of [[0, 1], [3, 2]] as const) {
    groundColorAt(input.world, points[toe === 0 ? 1 : 4]!, into[toe]!);
    // The bank is the land's own ground from its top to its toe; only its top is worn (`roadScuff`).
    into[top]!.copy(into[toe]!);
  }
  const a = onA(input, sAt);
  into[4]!.copy(a ? crownA : crownB).lerp(a ? tarmacA : tarmacB, fadedAt(input, sAt));
}

/** The plane an end's half draws its patterns in, with the town's paint full at its kerb and gone at `CARRIAGE_RUN`. */
function planeOf(end: RibbonEnd): SurfacePlane {
  const direction = new THREE.Vector3();
  return {
    across: end.across,
    north: end.north,
    share(point) {
      if (!end.built) return 0;
      const s = direction.copy(point).normalize().angleTo(end.point) * PLANET_RADIUS;
      const t = Math.min(1, s / CARRIAGE_RUN);
      return 1 - t * t * (3 - 2 * t);
    },
  };
}

/** The banks (or a bridge's girders and soffit) between the two sections. */
function layBanks(lay: Laying, middle: number): void {
  const { writer, near, far } = lay;
  const n = lay.nearTone;
  const f = lay.farTone;
  if (onBridge(lay.input.ramp, middle)) {
    writer.markAs(MARK_GIRDER);
    writer.quad(near[1]!, far[1]!, far[2]!, near[2]!, girder, girder);
    writer.quad(near[3]!, far[3]!, far[4]!, near[4]!, girder, girder);
    // The deck's soffit, facing the water, so a boat under the bridge sees its underside.
    writer.quad(near[4]!, far[4]!, far[1]!, near[1]!, girder, girder);
    return;
  }
  if (lay.input.band > 0) {
    // Far off, a bank is one quad from its toe to the top: its knee is under a pixel.
    writer.markAs(MARK_BANK, 1, 0);
    writer.patch(near[1]!, far[1]!, far[2]!, near[2]!, n[0]!, f[0]!, f[1]!, n[1]!);
    writer.markAs(MARK_BANK, 0, 1);
    writer.patch(near[3]!, far[3]!, far[4]!, near[4]!, n[2]!, f[2]!, f[3]!, n[3]!);
    return;
  }
  // Each bank in two, toe to knee to top: the knee is in the land's colour too.
  writer.markAs(MARK_BANK, 1, BANK_KNEE);
  writer.patch(near[1]!, far[1]!, far[6]!, near[6]!, n[0]!, f[0]!, f[0]!, n[0]!);
  writer.markAs(MARK_BANK, BANK_KNEE, 0);
  writer.patch(near[6]!, far[6]!, far[2]!, near[2]!, n[0]!, f[0]!, f[1]!, n[1]!);
  writer.markAs(MARK_BANK, 0, BANK_KNEE);
  writer.patch(near[3]!, far[3]!, far[7]!, near[7]!, n[2]!, f[2]!, f[3]!, n[3]!);
  writer.markAs(MARK_BANK, BANK_KNEE, 1);
  writer.patch(near[7]!, far[7]!, far[4]!, near[4]!, n[3]!, f[3]!, f[3]!, n[3]!);
  if (lay.input.band === 0) {
    // The skirts under the toes, buried unless the drawn land sags under the relief.
    writer.markAs(MARK_BANK, -1);
    writer.patch(near[0]!, far[0]!, far[1]!, near[1]!, n[0]!, f[0]!, f[0]!, n[0]!);
    writer.patch(near[4]!, far[4]!, far[5]!, near[5]!, n[3]!, f[3]!, f[3]!, n[3]!);
  }
}

/** The near band's top between two sections: shoulders, carriageway and paint, giving way to the other roads. */
function layNearTop(lay: Laying, sNear: number, sFar: number): void {
  const { input, writer, near, far, half, active, nearL, nearR, farL, farR } = lay;
  const { ramp, path, others } = input;
  carriageEdges(far, ribbonHalf(ramp, half, sFar, path.length - sFar), carriageHalf(ramp, half, sFar, path.length - sFar), farL, farR);
  const middle = (sNear + sFar) * 0.5;
  const shoulder = onPavement(ramp, middle, path.length - middle)
    ? (onA(input, middle) ? walkA : walkB)
    : gravel;
  const crown = onA(input, middle) ? crownA : crownB;
  active.length = 0;
  if (others.length > 0) {
    const probe = pieceAt(nearL, nearR, farL, farR, 0.5, 0.5);
    const reach = (sFar - sNear) * 0.5 + ribbonHalf(ramp, half, middle, path.length - middle) + 1;
    for (const other of others) {
      lay.one[0] = other;
      if (insideOthers(lay.one, probe, (o) => o.half + SIDEWALK + reach) > 0) active.push(other);
    }
  }
  const own = shoulder === gravel ? MARK_SHOULDER : MARK_WALK;
  shoulderStrip(writer, active, near[2]!, far[2]!, farL, nearL, shoulder, own, crown, true);
  writer.markAs(MARK_ROAD, -1, 1);
  writer.patch(nearL, farL, farR, nearR, lay.nearTone[4]!, lay.farTone[4]!, lay.farTone[4]!, lay.nearTone[4]!);
  shoulderStrip(writer, active, nearR, farR, far[3]!, near[3]!, shoulder, own, crown, false);
  writer.markAs(MARK_PAINT);
  layPaint(lay, sNear, sFar);
  nearL.copy(farL);
  nearR.copy(farR);
}

/**
 * The end a piece is within `CARRIAGE_RUN` of, with its distance from the
 * kerb, or null: where the road is its town's street and is painted as it is.
 */
function streetEnd(lay: Laying, middle: number): { end: 0 | 1; s: number } | null {
  const { ramp, path } = lay.input;
  if (ramp.kerbA > 0 && middle < CARRIAGE_RUN && middle <= path.length * 0.5) return { end: 0, s: middle };
  const sB = path.length - middle;
  if (ramp.kerbB > 0 && sB < CARRIAGE_RUN && middle > path.length * 0.5) return { end: 1, s: sB };
  return null;
}

/**
 * The centre line and the two edge lines on one near piece. Near a built
 * town the centre line is dashed as the town dashes its street, on the
 * street's own phase (`DASH` in the town's plane), and the edge lines stop.
 */
function layPaint(lay: Laying, sNear: number, sFar: number): void {
  const { input, writer, active, nearL, nearR, farL, farR, runs } = lay;
  const { ramp, path } = input;
  const middle = (sNear + sFar) * 0.5;
  const length = sFar - sNear;
  const half = (carriageHalf(ramp, lay.half, sNear, path.length - sNear) + carriageHalf(ramp, lay.half, sFar, path.length - sFar)) * 0.5;
  const street = streetEnd(lay, middle);
  if (street !== null) {
    if (!lay.streetLined[street.end]) return;
    const end = input.ends[street.end];
    // The town's coordinate along its street at a distance `s` out from its kerb, and whether a dash is there.
    const dashed = (s: number): boolean => Math.floor((end.along + end.out * s) / DASH + 1e-6) % 2 === 0;
    const sOf = (along: number): number => (street.end === 0 ? sNear + along * length : path.length - (sNear + along * length));
    // The breaks in the dash between the piece's ends, as shares along it.
    const cuts = [0, 1];
    const c0 = end.along + end.out * sOf(0);
    const c1 = end.along + end.out * sOf(1);
    for (let k = Math.ceil(Math.min(c0, c1) / DASH); k * DASH <= Math.max(c0, c1); k++) {
      const share = (k * DASH - c0) / (c1 - c0);
      if (share > 1e-6 && share < 1 - 1e-6) cuts.push(share);
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a0 = cuts[i]!;
      const a1 = cuts[i + 1]!;
      if (a1 - a0 < 1e-4 || !dashed(sOf((a0 + a1) * 0.5))) continue;
      if (active.length === 0) {
        dashRun(writer, nearL, farL, farR, nearR, half, a0, a1, STREET_LINE);
        continue;
      }
      const shown = markingRuns(active, nearL, nearR, farL, farR, 0.5, dashGives, runs);
      for (let r = 0; r < shown.length; r += 2) {
        const from = Math.max(a0, shown[r]!);
        const to = Math.min(a1, shown[r + 1]!);
        if (to - from > 1e-4) dashRun(writer, nearL, farL, farR, nearR, half, from, to, STREET_LINE);
      }
    }
    return;
  }
  if (!lay.marked[onA(input, middle) ? 0 : 1]) return;
  if (active.length === 0) {
    dash(writer, nearL, farL, farR, length, half);
    edgeLine(writer, nearL, farL, farR, nearR, half, false, 0, 1);
    edgeLine(writer, nearL, farL, farR, nearR, half, true, 0, 1);
    return;
  }
  const shown = markingRuns(active, nearL, nearR, farL, farR, 0.5, dashGives, runs);
  for (let r = 0; r < shown.length; r += 2) dash(writer, nearL, farL, farR, length, half, shown[r]!, shown[r + 1]!);
  for (const right of [false, true]) {
    const kept = markingRuns(active, nearL, nearR, farL, farR, edgeLineAcross(half, right), edgeGives, runs);
    for (let r = 0; r < kept.length; r += 2) {
      if ((kept[r + 1]! - kept[r]!) * length < 0.05) continue;
      edgeLine(writer, nearL, farL, farR, nearR, half, right, kept[r]!, kept[r + 1]!);
    }
  }
}

const stations: number[] = [];
const section = (): THREE.Vector3[] => Array.from({ length: 8 }, () => new THREE.Vector3());
/** Colours under each toe, the bank's tops, and the carriageway: left toe, left top, right top, right toe, tarmac. */
const tones = (): THREE.Color[] => Array.from({ length: 5 }, () => new THREE.Color());

/** One road's ribbon in one band. */
export function layRibbon(input: RibbonInput): Ribbon {
  const { world, road, course, path, ramp, band, lights, heads } = input;
  const span = SPANS[band]!.span;
  const writer = createRibbonWriter((p) =>
    heads.length > 0 ? Math.max(ribbonGlow(lights, p), lampGlow(heads, p)) : ribbonGlow(lights, p));
  const style = ROAD_CLASSES[road.cls] ?? ROAD_CLASSES[0]!;
  const half = style.width * 0.5 * (BAND_WIDTH[band] ?? 1);
  const marked = paintRoad(input);
  const lined = (end: 0 | 1): boolean => {
    const carriage = end === 0 ? ramp.carriageA : ramp.carriageB;
    const walk = end === 0 ? ramp.walkA : ramp.walkB;
    // The town lines a street at least `MARKED_STREET` wide; a square with no street (no pavement) has no line.
    return marked[end] && walk > 0 && (carriage + walk) * 2 >= MARKED_STREET;
  };
  const lay: Laying = {
    input, writer, half, marked,
    streetLined: [lined(0), lined(1)],
    planes: [planeOf(input.ends[0]), planeOf(input.ends[1])],
    near: section(), far: section(), nearTone: tones(), farTone: tones(),
    nearL: new THREE.Vector3(), nearR: new THREE.Vector3(), farL: new THREE.Vector3(), farR: new THREE.Vector3(),
    active: [], one: [], runs: [],
  };
  const { near, far } = lay;

  // Stations along the path: every piece at most `span` long, both ends exactly
  // on the kerbs, and every break in the height law a section of its own.
  ribbonStations(path.length, course.approach, ramp, span, stations);
  ribbonSection(world, course, path, ramp, half, stations[0]!, near);
  toneOf(input, near, stations[0]!, lay.nearTone);
  carriageEdges(near, ribbonHalf(ramp, half, stations[0]!, path.length - stations[0]!), carriageHalf(ramp, half, stations[0]!, path.length - stations[0]!), lay.nearL, lay.nearR);
  // `near` rolls into `far` each step, so every point is placed on the ground once.
  for (let k = 1; k < stations.length; k++) {
    const sNear = stations[k - 1]!;
    const sFar = stations[k]!;
    ribbonSection(world, course, path, ramp, half, sFar, far);
    toneOf(input, far, sFar, lay.farTone);
    // One plane a piece, the nearer end's, so no triangle's pattern spans two towns' planes.
    writer.planeAs(lay.planes[onA(input, (sNear + sFar) * 0.5) ? 0 : 1]);
    layBanks(lay, (sNear + sFar) * 0.5);
    if (band === 0) {
      layNearTop(lay, sNear, sFar);
    } else {
      writer.markAs(MARK_ROAD, -1, 1);
      writer.patch(near[2]!, far[2]!, far[3]!, near[3]!, lay.nearTone[4]!, lay.farTone[4]!, lay.farTone[4]!, lay.nearTone[4]!);
    }
    for (let j = 0; j < 8; j++) near[j]!.copy(far[j]!);
    const swap = lay.nearTone;
    lay.nearTone = lay.farTone;
    lay.farTone = swap;
  }
  return writer.finish();
}
