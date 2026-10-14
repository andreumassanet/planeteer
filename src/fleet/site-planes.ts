/**
 * Each plane town's airstrip. No two strips may meet: two drawn over each
 * other are two surfaces at one depth and flicker where they cross.
 *
 * Every plane town first finds the strip it would lay alone (its free strip),
 * and then, against its neighbours':
 *
 * - it keeps its free strip if that meets no bigger town's free strip. Two kept
 *   strips never meet, because of any two that did the smaller would not have
 *   been kept;
 * - otherwise it searches again, off every neighbour's free strip and inside
 *   its own cell of the Voronoi diagram of the free strips' middles, which no
 *   other town that searches again can enter; and it goes without a plane where
 *   nothing fits.
 *
 * A town asks only its neighbours' free strips, never their final ones, so the
 * rule is local to the places. The fleet warms the free strips of every plane
 * town near the player ahead of the first ask (`warm` in `site-index.ts`).
 */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { radiusOf } from '../places.ts';
import { STRIP_HALF, STRIP_LENGTH, stripPoint, stripsMeet } from '../craft/airstrip.ts';
import { FLEET_MODELS } from './models.ts';
import { FIELD_CLEAR, FIELD_STEP, PLANE_FIELD, PLANE_GRADE, PLANE_POP, PLANE_RINGS } from './site-rules.ts';
import type { FieldSearch } from './site-fields.ts';
import type { StripRivals } from './site-strips.ts';
import { PLANE_CANDIDATES, STRIP_HALF_DIAGONAL, STRIP_MEET } from './strip-rules.ts';
import type { FleetSite } from './site-types.ts';
import type { SiteWorld } from './site-world.ts';

export interface Planes {
  keepsPlane(p: number): boolean;
  /** Takes town `p`'s free search on, to its end or until `more()` says stop: true once it has ended. */
  advanceFree(p: number, more?: () => boolean): boolean;
  /** Takes town `p`'s strip on to its end or until `more()` says stop: true once `finals[p]` is settled. */
  advanceFinal(p: number, more?: () => boolean): boolean;
  /** The plane towns whose strips could meet town `p`'s, and a little more. */
  neighboursOf(p: number): readonly number[];
  /** A town's plane and its strip, or nothing where none fits. */
  planeOf(p: number, out: FleetSite[]): void;
  /** Each plane town's strip as it stands, or null; undefined until worked out. */
  readonly finals: (FleetSite | null | undefined)[];
}

export function createPlanes(w: SiteWorld, search: FieldSearch): Planes {
  const { places, centres, shown, townsNear } = w;
  const { fieldSite } = search;

  const keepsPlane = (p: number): boolean => shown[p]! && (places[p]!.pop >= PLANE_POP || places[p]!.capital === true);
  /** The middle of each plane town's free strip, or null where it has none; worked out once. */
  const freeMiddles: (THREE.Vector3 | null | undefined)[] = new Array(places.length);
  const freeSites: (FleetSite | null | undefined)[] = new Array(places.length);
  /** Which candidate each free search found (`foundAt`). */
  const freeFound: number[] = new Array(places.length).fill(-1);
  /** Where each free search not yet finished is to be taken up. */
  const freeNext: number[] = new Array(places.length).fill(0);

  /** Takes town `p`'s free search on: true once it has ended, with `freeSites[p]` its strip or null. */
  function advanceFree(p: number, more?: () => boolean): boolean {
    if (freeSites[p] !== undefined) return true;
    const out: FleetSite[] = [];
    const next = fieldSite(p, FLEET_MODELS.plane, PLANE_FIELD, PLANE_GRADE, 'fleet-plane', out, 0, null, freeNext[p]!, more);
    if (out.length === 0 && next < PLANE_CANDIDATES) {
      freeNext[p] = next;
      return false;
    }
    const found = out[0] ?? null;
    freeFound[p] = search.foundAt();
    freeMiddles[p] = found === null ? null : stripPoint(found, STRIP_LENGTH / 2, 0, new THREE.Vector3());
    freeSites[p] = found;
    return true;
  }

  /** The strip a town would lay with no other town's to keep off: the search alone. */
  function freeStrip(p: number): FleetSite | null {
    advanceFree(p);
    return freeSites[p]!;
  }

  /** The plane towns whose strips could meet town `p`'s, and a little more: each use tests its own bound. */
  const neighbours: (number[] | undefined)[] = new Array(places.length);
  function neighboursOf(p: number): readonly number[] {
    let list = neighbours[p];
    if (list === undefined) {
      const reach = stripReach(p);
      list = townsNear(centres[p]!, reach + stripReach(-1) + 1, []).filter(
        (q) => q !== p && keepsPlane(q) && centres[q]!.angleTo(centres[p]!) * PLANET_RADIUS <= reach + stripReach(q) + 1,
      );
      neighbours[p] = list;
    }
    return list;
  }

  /**
   * The furthest any corner of town `p`'s strip can stand from its centre:
   * its square, the last ring a stand is searched on and the strip run out
   * from there. -1 is the widest square's, for a search round a town.
   */
  const stripReach = (p: number): number =>
    (p < 0 ? 150 : radiusOf(places[p]!)) + PLANE_FIELD + FIELD_CLEAR + 4 + (PLANE_RINGS - 1) * FIELD_STEP + Math.hypot(STRIP_LENGTH + 4, STRIP_HALF) + 1;

  /**
   * Whether town `q` outranks town `p`: the bigger, and between two of a size
   * the one earlier in `places`. A strict order of the places alone.
   */
  const outranks = (q: number, p: number): boolean => places[q]!.pop > places[p]!.pop || (places[q]!.pop === places[p]!.pop && q < p);

  /** A town's plane and its strip, or nothing where none fits. */
  function planeOf(p: number, out: FleetSite[]): void {
    advanceFinal(p);
    const plane = finals[p];
    if (plane !== null && plane !== undefined) out.push(plane);
  }

  /** Each plane town's strip as it stands, or null; worked out once. */
  const finals: (FleetSite | null | undefined)[] = new Array(places.length);
  /** A beaten town's rivals and where its search again is to be taken up, while it is unfinished. */
  const again: (StripRivals | undefined)[] = new Array(places.length);
  const againNext: number[] = new Array(places.length).fill(0);

  function advanceFinal(p: number, more?: () => boolean): boolean {
    if (finals[p] !== undefined) return true;
    const free = keepsPlane(p) ? freeStrip(p) : null;
    if (free === null) {
      finals[p] = null;
      return true;
    }
    let rivals = again[p];
    if (rivals === undefined) {
      if (!beaten(p, free)) {
        finals[p] = free;
        return true;
      }
      // Beaten: every neighbour's free strip, and every one's middle.
      const strips: FleetSite[] = [];
      const middles: THREE.Vector3[] = [];
      for (const q of neighboursOf(p)) {
        if (centres[q]!.angleTo(centres[p]!) * PLANET_RADIUS > stripReach(p) + stripReach(q)) continue;
        const theirs = freeStrip(q);
        if (theirs === null) continue;
        strips.push(theirs);
        middles.push(freeMiddles[q]!);
      }
      again[p] = rivals = { own: freeMiddles[p]!, strips, middles };
      againNext[p] = freeFound[p]!;
    }
    const out: FleetSite[] = [];
    const next = fieldSite(p, FLEET_MODELS.plane, PLANE_FIELD, PLANE_GRADE, 'fleet-plane', out, 0, rivals, againNext[p]!, more);
    if (out.length === 0 && next < PLANE_CANDIDATES) {
      againNext[p] = next;
      return false;
    }
    finals[p] = out[0] ?? null;
    again[p] = undefined;
    return true;
  }

  /**
   * Whether town `p`'s free strip meets a bigger town's. Only the bigger
   * towns decide, and only those whose strip's corners reach as far as its
   * own do, so a town works out no smaller neighbour's strip unless it has to
   * search again.
   */
  function beaten(p: number, free: FleetSite): boolean {
    const centre = centres[p]!;
    const spread = freeMiddles[p]!.angleTo(centre) * PLANET_RADIUS + STRIP_HALF_DIAGONAL;
    for (const q of townsNear(centre, spread + stripReach(-1), [])) {
      if (q === p || !keepsPlane(q) || !outranks(q, p) || centres[q]!.angleTo(centre) * PLANET_RADIUS > spread + stripReach(q)) continue;
      const theirs = freeStrip(q);
      if (theirs !== null && theirs.at.angleTo(free.at) * PLANET_RADIUS < STRIP_MEET && stripsMeet(free, theirs, STRIP_HALF)) return true;
    }
    return false;
  }

  return { keepsPlane, advanceFree, advanceFinal, neighboursOf, planeOf, finals };
}
