/**
 * The tests an airstrip's candidate strip is put through: clear of towns, roads
 * and landmarks, flat enough, on land, and clear of the neighbours' strips.
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { gradeAt } from '../terrain.ts';
import {
  STRIP_BACK,
  STRIP_HALF,
  STRIP_LENGTH,
  stripCorners,
  stripPoint,
  stripsMeet,
} from '../craft/airstrip.ts';
import type { FieldNeighbourhood } from './site-hood.ts';
import { PLANE_GRADE } from './site-rules.ts';
import {
  STRIP_ALONG,
  STRIP_CLEAR,
  STRIP_HEADINGS,
  STRIP_MEET,
  STRIP_SAMPLES,
  STRIP_WATER_STEP,
  stripKeepouts,
} from './strip-rules.ts';
import type { FieldKeepout, FleetSite } from './site-types.ts';
import type { SiteWorld } from './site-world.ts';

/** What a strip that has to search again keeps off: see `planeOf` in `site-planes.ts`. */
export interface StripRivals {
  /** The middle of the town's own free strip. */
  own: THREE.Vector3;
  /** Its neighbours' free strips, and their middles. */
  strips: readonly FleetSite[];
  middles: readonly THREE.Vector3[];
}

export interface StripTests {
  /** The strip being tried: a stand and a heading, written by the search. */
  readonly strip: { at: THREE.Vector3; forward: THREE.Vector3 };
  /** A stand's headings, worked out once for both passes over them. */
  readonly headings: THREE.Vector3[];
  /** Whether the strip being tried crosses into what `rivals` keep. */
  stripTaken(rivals: StripRivals | null): boolean;
  /** A strip's cheap half: every sample clear of the landmarks, towns and roads held. */
  stripNear(): boolean;
  /** A strip's dear half: the relief under every sample, then the outlines. */
  stripGround(inland: boolean): boolean;
  /** An airstrip's discs, worked out once. */
  discsOf(site: FleetSite): readonly FieldKeepout[];
}

export function createStripTests(w: SiteWorld, hood: FieldNeighbourhood): StripTests {
  const { corner, slope, wet } = w;
  const { nearMonumentLocal, nearTownLocal, nearRoadLocal } = hood;
  const strip = { at: new THREE.Vector3(), forward: new THREE.Vector3() };
  const stripAcross = new THREE.Vector3();
  /** A stand's headings, worked out once for both passes over them. */
  const headings = Array.from({ length: STRIP_HEADINGS }, () => new THREE.Vector3());
  /** A strip's samples, in `STRIP_ORDER`, laid again by each half of its tests. */
  const stripSamples = Array.from({ length: STRIP_SAMPLES }, () => new THREE.Vector3());

  /**
   * The strip from a stand at `strip.at` down `strip.forward` has to be flat
   * enough over its own width, clear of the towns, the roads and the
   * landmarks, and (unless the town is `inland`) on land from edge to edge.
   * The samples go in `STRIP_ORDER` and each test runs over all of them before
   * the next, cheapest first; a strip passes only if every test passes at every
   * sample, so the order changes what a strip costs and never whether it
   * passes. The water is walked again at `STRIP_WATER_STEP` once everything
   * else has passed, because a creek or a fjord is narrower than the gap
   * between two samples.
   */
  function stripNear(): boolean {
    const clear = STRIP_HALF + STRIP_CLEAR;
    for (let n = 0; n < STRIP_SAMPLES; n++) {
      const point = stripPoint(strip, STRIP_ALONG[n]!, 0, stripSamples[n]!);
      if (nearMonumentLocal(point, STRIP_HALF) || nearTownLocal(point, clear) || nearRoadLocal(point, clear)) return false;
    }
    return true;
  }

  /** A strip's dear half: the relief under every sample, then the outlines. */
  function stripGround(inland: boolean): boolean {
    stripAcross.crossVectors(strip.forward, strip.at).normalize();
    for (let n = 0; n < STRIP_SAMPLES; n++) stripPoint(strip, STRIP_ALONG[n]!, 0, stripSamples[n]!);
    for (let n = 0; n < STRIP_SAMPLES; n++) {
      if (gradeAt(stripSamples[n]!, stripAcross, strip.forward, STRIP_HALF, slope).grade > PLANE_GRADE) return false;
    }
    if (inland) return true;
    for (let n = 0; n < STRIP_SAMPLES; n++) {
      const along = STRIP_ALONG[n]!;
      if (wet(stripSamples[n]!) || wet(stripPoint(strip, along, STRIP_HALF, corner)) || wet(stripPoint(strip, along, -STRIP_HALF, corner))) return false;
    }
    for (let along = -STRIP_BACK; along <= STRIP_LENGTH; along += STRIP_WATER_STEP) {
      for (let edge = -1; edge <= 1; edge++) if (wet(stripPoint(strip, along, edge * STRIP_HALF, corner))) return false;
    }
    return true;
  }

  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  /**
   * Whether the strip being tried (`strip`) crosses into what `rivals` keep:
   * whether it meets any of their free strips, `STRIP_HALF` of ground either
   * side of each, or any corner of it is nearer one of their middles than its
   * own town's — outside its cell of the Voronoi diagram of those middles,
   * which is convex on the sphere, so a strip whose four corners are in it is
   * in it whole.
   */
  function stripTaken(rivals: StripRivals | null): boolean {
    if (rivals === null) return false;
    stripCorners(strip, STRIP_HALF, corners);
    for (const corner of corners) {
      const mine = corner.dot(rivals.own);
      for (const other of rivals.middles) if (corner.dot(other) > mine) return true;
    }
    for (const other of rivals.strips) {
      if (other.at.angleTo(strip.at) * PLANET_RADIUS < STRIP_MEET && stripsMeet(strip, other, STRIP_HALF)) return true;
    }
    return false;
  }

  const strips = new Map<FleetSite, readonly FieldKeepout[]>();
  const discsOf = (entry: FleetSite): readonly FieldKeepout[] => {
    let discs = strips.get(entry);
    if (discs === undefined) strips.set(entry, (discs = stripKeepouts(entry)));
    return discs;
  };

  return { strip, headings, stripTaken, stripNear, stripGround, discsOf };
}
