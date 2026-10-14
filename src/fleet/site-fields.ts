/**
 * The search for a field: land under a whole disc, flat enough, clear of
 * towns, roads and landmarks. A plane's field is also the stand of a strip
 * that has to fit down one of several headings.
 */
import * as THREE from 'three';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../globe.ts';
import { radiusOf } from '../places.ts';
import { rngFrom } from '../scenery/random.ts';
import { gradeAt, shoreDistance } from '../terrain.ts';
import { STRIP_HALF, STRIP_LENGTH } from '../craft/airstrip.ts';
import { FLEET_MODELS } from './models.ts';
import type { FieldNeighbourhood } from './site-hood.ts';
import {
  COAST_MARGIN,
  FIELD_BEARINGS,
  FIELD_CLEAR,
  FIELD_RINGS,
  FIELD_STEP,
  PLANE_RINGS,
  SITE_ROOM,
} from './site-rules.ts';
import type { StripRivals, StripTests } from './site-strips.ts';
import { FIELD_SPREAD, PLANE_CANDIDATES, STRIP_CLEAR, STRIP_HEADINGS } from './strip-rules.ts';
import type { FleetSite } from './site-types.ts';
import type { SiteWorld } from './site-world.ts';

export interface FieldSearch {
  /**
   * Searches town `p` for a field of `reach` units whose ground is no steeper
   * than `grade`, appending the site to `out`.
   *
   * `from` skips every plane candidate before it, and `more`, when given, is
   * asked before every stand after the first whether to go on: the search
   * returns the candidate it stopped before, to be taken up there later, or
   * `PLANE_CANDIDATES` once it has tried them all or found one. A candidate's
   * tests are its own, so a search in pieces finds what a search at once does.
   */
  fieldSite(
    p: number,
    model: string,
    reach: number,
    grade: number,
    salt: string,
    out: FleetSite[],
    n?: number,
    rivals?: StripRivals | null,
    from?: number,
    more?: () => boolean,
  ): number;
  /** Which candidate the last plane search found, counted in the order it tries them: ring, bearing, heading. -1 if none. */
  foundAt(): number;
}

export function createFieldSearch(w: SiteWorld, hood: FieldNeighbourhood, tests: StripTests): FieldSearch {
  const { places, wet, north, across, corner, slope, at, forward, around, outward, site } = w;
  const { localise, narrow, nearMonumentLocal, nearTownLocal, nearRoadLocal } = hood;
  const { strip, headings, stripTaken, stripNear, stripGround, discsOf } = tests;

  /** The widest clearance any of the tests asks for: a field's, or a strip's from a town, a road or a landmark. */
  const clearFor = (reach: number): number => Math.max(reach + FIELD_CLEAR, STRIP_HALF + STRIP_CLEAR, FIELD_CLEAR + STRIP_HALF);

  /**
   * Land for `reach` all round, by the coast field alone: `terrain.ts`'s
   * distance to any water. It is trusted only for a whole town's search at
   * once, and with a margin, because near a coast it is out by most of a
   * degree: a coastal town asks the outlines and an inland one does not.
   */
  const inlandFor = (p: number): boolean =>
    shoreDistance(places[p]!.lat, places[p]!.lon) > FIELD_SPREAD / UNITS_PER_DEGREE + COAST_MARGIN;

  /** A field: the cheap tests first, then the relief, then the outlines under five points. */
  function field(direction: THREE.Vector3, reach: number, grade: number, inland: boolean): boolean {
    return fieldClear(direction, reach) && fieldGround(direction, reach, grade, inland);
  }

  /** `field`'s cheap half: clear of the landmarks, towns and roads `active` holds. */
  function fieldClear(direction: THREE.Vector3, reach: number): boolean {
    if (nearMonumentLocal(direction, reach) || nearTownLocal(direction, reach + FIELD_CLEAR)) return false;
    return !nearRoadLocal(direction, reach + FIELD_CLEAR);
  }

  /** `field`'s dear half: the relief, then the outlines. */
  function fieldGround(direction: THREE.Vector3, reach: number, grade: number, inland: boolean): boolean {
    north.set(0, 1, 0).projectOnPlane(direction);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0).projectOnPlane(direction);
    north.normalize();
    across.crossVectors(direction, north).normalize();
    if (gradeAt(direction, across, north, reach, slope).grade > grade) return false;
    if (inland) return true;
    if (wet(direction)) return false;
    for (let k = 0; k < 4; k++) {
      const bearing = (k / 4) * Math.PI * 2;
      corner
        .copy(direction)
        .addScaledVector(across, (Math.sin(bearing) * reach) / PLANET_RADIUS)
        .addScaledVector(north, (Math.cos(bearing) * reach) / PLANET_RADIUS)
        .normalize();
      if (wet(corner)) return false;
    }
    return true;
  }

  /** Whether a field at `spot` of `reach` crosses one this town already has: a strip's discs, or another field's room. */
  function fieldTaken(spot: THREE.Vector3, reach: number, taken: readonly FleetSite[]): boolean {
    for (const other of taken) {
      if (other.kind === 'plane') {
        for (const disc of discsOf(other)) if (disc.at.angleTo(spot) * PLANET_RADIUS < disc.radius + reach) return true;
      } else if (other.at.angleTo(spot) * PLANET_RADIUS < SITE_ROOM[other.kind] + reach + FIELD_CLEAR) return true;
    }
    return false;
  }

  /** Which candidate the last plane search found. */
  let foundAt = -1;

  function fieldSite(
    p: number,
    model: string,
    reach: number,
    grade: number,
    salt: string,
    out: FleetSite[],
    n = 0,
    rivals: StripRivals | null = null,
    from = 0,
    more?: () => boolean,
  ): number {
    const radius = radiusOf(places[p]!);
    const start = rngFrom(salt, p).unit() * Math.PI * 2;
    const plane = model === FLEET_MODELS.plane;
    const rings = plane ? PLANE_RINGS : FIELD_RINGS;
    const inland = inlandFor(p);
    // The furthest point any test below asks about: the last ring's stand, and
    // for a plane the strip's far end down any heading from it.
    const clear = clearFor(reach);
    localise(p, radius + reach + FIELD_CLEAR + 4 + (rings - 1) * FIELD_STEP + (plane ? STRIP_LENGTH : 0) + 1, clear);
    foundAt = -1;
    let stands = 0;
    for (let j = 0; j < rings; j++) {
      const d = radius + reach + FIELD_CLEAR + 4 + j * FIELD_STEP;
      for (let k = 0; k < FIELD_BEARINGS; k++) {
        const first = (j * FIELD_BEARINGS + k) * STRIP_HEADINGS;
        if (plane && first + STRIP_HEADINGS <= from) continue;
        if (stands++ > 0 && more !== undefined && !more()) return Math.max(first, from);
        around(p, start + (k / FIELD_BEARINGS) * Math.PI * 2, d, at);
        // The kinds that came after the plane and the balloon keep off their ground.
        if (!plane && model !== FLEET_MODELS.balloon && fieldTaken(at, reach, out)) continue;
        hood.useLocal();
        if (!plane) {
          if (!field(at, reach, grade, inland)) continue;
          // Facing away from the town, which is the way a take-off goes.
          outward(p, at, forward);
          out.push(site(model, p, n, at, forward));
          return PLANE_CANDIDATES;
        }
        // A plane's stand is only as good as the strip it can take off down:
        // straight out of the town first, then swinging either side of that
        // by a sixteenth of a turn at a time, to straight back past it.
        //
        // A candidate is the stand's field and one heading's strip, and it
        // passes only if every test does, so the tests go cheapest first
        // across all of the stand's headings: the towns, roads and landmarks
        // under the field and every strip, then the relief and the outlines
        // under the field, then under each strip still standing, in order.
        // The first candidate to pass is the one the tests in any order find.
        if (!fieldClear(at, reach)) continue;
        outward(p, at, forward);
        strip.at.copy(at);
        // Every sample of every heading is within a strip's length of the stand.
        narrow(at, STRIP_LENGTH + 1, clear);
        let open = 0;
        for (let h = 0; h < STRIP_HEADINGS; h++) {
          if (first + h < from) continue;
          const turn = Math.ceil(h / 2) * (h % 2 === 1 ? 1 : -1) * ((Math.PI * 2) / STRIP_HEADINGS);
          const heading = headings[h]!.copy(forward).applyAxisAngle(at, turn).projectOnPlane(at).normalize();
          strip.forward.copy(heading);
          if (stripTaken(rivals) || !stripNear()) continue;
          open |= 1 << h;
        }
        if (open === 0 || !fieldGround(at, reach, grade, inland)) continue;
        for (let h = 0; h < STRIP_HEADINGS; h++) {
          if ((open & (1 << h)) === 0) continue;
          strip.forward.copy(headings[h]!);
          if (!stripGround(inland)) continue;
          out.push(site(model, p, 0, at, strip.forward));
          foundAt = first + h;
          return PLANE_CANDIDATES;
        }
      }
    }
    return PLANE_CANDIDATES;
  }

  return { fieldSite, foundAt: () => foundAt };
}
