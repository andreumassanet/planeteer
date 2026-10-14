import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS, groundColorAt } from '../globe.ts';
import { SIDEWALK, asphaltOf, groundStyleFor, trodden } from '../scenery/ground.ts';
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
import { createRibbonWriter, dash, edgeLine, shoulderStrip } from './ribbon-writer.ts';
import type { Ribbon, RibbonWriter } from './ribbon-writer.ts';
import { PAVEMENT_RUN, PAVEMENT_TAPER, onPavement, ribbonHalf, ribbonSection, ribbonStations } from './section.ts';
import type { Road } from './types.ts';

/**
 * Lays one road's ribbon in one band, gate to gate on the course the bake
 * tested. Each piece between two sections (`ribbonSection`) is two banks in
 * the land's colour under their toes and the top. In the near band the top is
 * split into the carriageway and a shoulder each side (or a town's pavement
 * over its approach), the bank gets its skirt, and a marked road gets a dashed
 * centre line and edge lines, all giving way to other roads' surfaces. Further
 * out the top is one quad in the carriageway's colour.
 */

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
}

const crown = new THREE.Color();
const tarmac = new THREE.Color();
const sand = new THREE.Color(PALETTE.sand);
const gravel = new THREE.Color();
const walkA = new THREE.Color();
const walkB = new THREE.Color();
const verge = new THREE.Color();
const ground = new THREE.Color();
/** A bridge's girder: the piers' weathered concrete. */
const girder = new THREE.Color(PALETTE.bone).lerp(new THREE.Color(PALETTE.tan), 0.35).multiplyScalar(0.85);
const ink = new THREE.Color(0x2a1410);
const scratch = new THREE.Vector3();

/**
 * Sets the road's colours for this ribbon: the carriageway is the region's
 * street colour (`GroundStyle.road`, as the towns at either end are paved),
 * a trunk worn darker, warmed off the towns (`asphaltOf`); the shoulder is
 * packed earth and gravel; the pavements are each end's own.
 */
function paintRoad(input: RibbonInput): boolean {
  groundColorAt(input.world, scratch.copy(input.middle).multiplyScalar(PLANET_RADIUS), ground);
  const surface = groundStyleFor(input.regionA);
  crown.setHex(surface.road);
  const marked = surface.marked && input.band === 0;
  if (input.road.cls === 2) crown.lerp(ink, 0.12);
  trodden(ground, verge);
  gravel.setHex(PALETTE.tan).lerp(sand, 0.35).lerp(verge, 0.2);
  walkA.setHex(groundStyleFor(input.regionA).walk);
  walkB.setHex(groundStyleFor(input.regionB).walk);
  asphaltOf(crown, tarmac);
  return marked;
}

/** The scratch a ribbon is laid with: two rolling sections, their colours and the carriageway's edges. */
interface Laying {
  input: RibbonInput;
  writer: RibbonWriter;
  half: number;
  marked: boolean;
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

/** How far a point is from either built end's pavement, as the share by which the tarmac is the open road's. */
function fadedAt(input: RibbonInput, sAt: number): number {
  let share = 1;
  if (input.ramp.kerbA > 0) share = Math.min(share, sAt / (PAVEMENT_RUN + PAVEMENT_TAPER));
  if (input.ramp.kerbB > 0) share = Math.min(share, (input.path.length - sAt) / (PAVEMENT_RUN + PAVEMENT_TAPER));
  return Math.max(0, Math.min(1, share));
}

/** A section's colours: the land under each toe, a trodden tone of it at the top, the tarmac. */
function toneOf(input: RibbonInput, points: readonly THREE.Vector3[], sAt: number, into: THREE.Color[]): void {
  for (const [toe, top] of [[0, 1], [3, 2]] as const) {
    groundColorAt(input.world, points[toe === 0 ? 1 : 4]!, into[toe]!);
    trodden(into[toe]!, into[top]!).lerp(gravel, 0.35);
  }
  into[4]!.copy(crown).lerp(tarmac, fadedAt(input, sAt));
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
  writer.markAs(MARK_BANK, 1, 0);
  writer.patch(near[1]!, far[1]!, far[2]!, near[2]!, n[0]!, f[0]!, f[1]!, n[1]!);
  writer.markAs(MARK_BANK, 0, 1);
  writer.patch(near[3]!, far[3]!, far[4]!, near[4]!, n[2]!, f[2]!, f[3]!, n[3]!);
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
  carriageEdges(far, ribbonHalf(ramp, half, sFar, path.length - sFar), half, farL, farR);
  const middle = (sNear + sFar) * 0.5;
  const shoulder = onPavement(ramp, middle, path.length - middle)
    ? (middle < path.length * 0.5 ? walkA : walkB)
    : gravel;
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
  if (lay.marked) layPaint(lay, sFar - sNear);
  nearL.copy(farL);
  nearR.copy(farR);
}

/** The dashed centre line and the two edge lines on one near piece. */
function layPaint(lay: Laying, length: number): void {
  const { writer, half, active, nearL, nearR, farL, farR, runs } = lay;
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
const section = (): THREE.Vector3[] => Array.from({ length: 6 }, () => new THREE.Vector3());
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
  const lay: Laying = {
    input, writer, half, marked,
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
  carriageEdges(near, ribbonHalf(ramp, half, stations[0]!, path.length - stations[0]!), half, lay.nearL, lay.nearR);
  // `near` rolls into `far` each step, so every point is placed on the ground once.
  for (let k = 1; k < stations.length; k++) {
    const sNear = stations[k - 1]!;
    const sFar = stations[k]!;
    ribbonSection(world, course, path, ramp, half, sFar, far);
    toneOf(input, far, sFar, lay.farTone);
    layBanks(lay, (sNear + sFar) * 0.5);
    if (band === 0) {
      layNearTop(lay, sNear, sFar);
    } else {
      writer.markAs(MARK_ROAD, -1, 1);
      writer.patch(near[2]!, far[2]!, far[3]!, near[3]!, lay.nearTone[4]!, lay.farTone[4]!, lay.farTone[4]!, lay.nearTone[4]!);
    }
    for (let j = 0; j < 6; j++) near[j]!.copy(far[j]!);
    const swap = lay.nearTone;
    lay.nearTone = lay.farTone;
    lay.farTone = swap;
  }
  return writer.finish();
}
