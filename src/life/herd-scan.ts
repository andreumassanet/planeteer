/**
 * Offers the scan its herds. The biome says what kind of animal, the region
 * says whose (`fauna/regions.ts`). The gates run cheapest first: the seeded
 * draw and the disc before any ground query, the nearest-town pass last.
 * `HerdProbe` counts each gate.
 */
import * as THREE from 'three';
import { BIOMES, biomeAt, biomeSample } from '../biome.ts';
import { KINDS as FAUNA_KINDS } from '../fauna/contract.ts';
import type { Animal } from '../fauna/contract.ts';
import { BY_BIOME, FAUNA_STYLES, nativeHere } from '../fauna/regions.ts';
import type { RegionId } from '../fauna/regions.ts';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { radiusOf } from '../places.ts';
import type { Place } from '../places.ts';
import { regionFor } from '../scenery/regions.ts';
import { rngFrom } from '../scenery/random.ts';
import type { Weighted } from '../scenery/random.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import { MAX_SLOPE, gradeAt, reliefAt } from '../terrain.ts';
import type { Slope } from '../terrain.ts';
import type { HerdProbe, LifeShared } from './api.ts';
import { cellPoint, forEachCell, tangentsAt } from './cells.ts';
import type { HerdSite } from './herd-types.ts';
import type { ClearOfMade } from './made-ground.ts';
import { emptyFrame } from './mover.ts';
import type { Frame, Mover } from './mover.ts';
import type { PlaceIndex } from './place-index.ts';
import type { Consider } from './scan.ts';
import { HERD_CELL, HERD_CHANCE, HERD_HOLD_REACH, HERD_SPREAD, TAU } from './tuning.ts';

export interface HerdScan {
  scan(viewer: THREE.Vector3, herdRange: number, consider: Consider): void;
  trim(cap: number): void;
}

interface HerdScanDeps {
  world: World;
  places: readonly Place[];
  bestiary: ReadonlyMap<string, Animal>;
  continentOf: ReadonlyMap<string, string>;
  placeIndex: PlaceIndex;
  clearOfMade: ClearOfMade;
  /** Written here, read by the builder and the near herds. */
  herdSites: Map<string, HerdSite>;
  herds: HerdProbe;
  movers: ReadonlyMap<string, Mover>;
  shared: LifeShared;
}

export function createHerdScan(deps: HerdScanDeps): HerdScan {
  const { world, places, bestiary, continentOf, placeIndex, clearOfMade, herdSites, herds, movers, shared } = deps;
  /** Elevation and stock per cell, a pure function of the coordinate; emptied wholesale at a bound. */
  const herdGround = new Map<string, number>();
  const herdStock = new Map<string, { list: Weighted<string>[]; region: RegionId; density: number }>();
  const herdSample = biomeSample();
  const herdProbe = new THREE.Vector3();
  const herdSlope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  const northward = new THREE.Vector3();
  const eastward = new THREE.Vector3();
  const probeFrame = emptyFrame();

  /** What each animal could be here, whose, and how densely the land carries them; cached per cell. */
  function stockAt(key: string, centre: THREE.Vector3, ground: number): { list: Weighted<string>[]; region: RegionId; density: number } {
    let choices = herdStock.get(key);
    if (choices !== undefined) return choices;
    const lat = latOf(centre.y);
    const lon = lonOf(centre.x, centre.z);
    const biome = biomeAt(centre.x, centre.y, centre.z, lat, lon, ground, herdSample);
    const index = world.countryAt(lat, lon);
    const country = index > 0 ? world.countries[index - 1] : undefined;
    const region = regionFor(country?.iso ?? '', continentOf.get(country?.iso ?? '') ?? '', lat);
    const style = FAUNA_STYLES[region.id as RegionId];
    // The region's stock weights the biome's list rather than filtering it,
    // so the climate's animals still appear where the region leaves them out.
    const stockOf = (id: string): number =>
      0.6 + (style.stock.find((entry) => entry.item === id)?.weight ?? 0) * 0.5;
    choices = {
      list: BY_BIOME[biome.id]
        .filter((entry) => nativeHere(entry.item, region.id as RegionId) && bestiary.has(entry.item))
        .map((entry) => ({ item: entry.item, weight: entry.weight * stockOf(entry.item) })),
      region: region.id as RegionId,
      // Head count follows the biome's `cover`, the same number vegetation and birds spend.
      density: Math.min(1, 0.15 + BIOMES[biome.id].cover * 1.1) * style.density,
    };
    herdStock.set(key, choices);
    return choices;
  }

  /** The herd at one cell, if every gate passes; counted gate by gate into `herds`. */
  function visit(row: number, col: number, viewer: THREE.Vector3, herdRange: number, consider: Consider): void {
    herds.cells++;
    const rng = rngFrom('herd', row, col);
    if (!rng.chance(HERD_CHANCE)) return;
    herds.chanced++;
    const key = `${row}.${col}`;
    const centre = cellPoint(row, col, HERD_CELL, rng.range(0.2, 0.8), rng.range(0.2, 0.8));

    // The disc before the ground: `forEachCell` walks a square.
    herdProbe.copy(centre).multiplyScalar(PLANET_RADIUS + 20);
    if (herdProbe.distanceTo(viewer) > herdRange + 60) return;
    herds.inRange++;

    let ground = herdGround.get(key);
    if (ground === undefined) {
      ground = world.elevationAt(centre);
      herdGround.set(key, ground);
    }
    if (ground <= 0) return;
    herds.land++;

    const choices = stockAt(key, centre, ground);
    if (choices.list.length === 0) return;
    herds.stocked++;
    if (!rng.chance(choices.density)) return;
    herds.dense++;

    // Outside the nearest built town, by its radius plus a small margin.
    const nearest = places[placeIndex.nearestShown(centre, `p${key}`)];
    if (nearest !== undefined) {
      const keepOut = radiusOf(nearest) + 12;
      unitAt(nearest.lat, nearest.lon, herdProbe);
      if (herdProbe.angleTo(centre) * PLANET_RADIUS < keepOut) return;
    }
    herds.clearOfTown++;

    const species: string = rng.weighted(choices.list);
    const entry = bestiary.get(species)!;
    const [low, high] = FAUNA_KINDS[entry.kind].group;
    const heads = rng.between(low, high);
    // The herd widens with its count, by the animal's own length.
    const spread = Math.max(HERD_SPREAD, entry.size[0] * 0.55 * Math.sqrt(heads));

    // Nothing grazes a mountain face: `gradeAt`'s probes at `spread` give the
    // mean tilt across the disc the animals stand on. Before `clearOfMade`,
    // which is dearer.
    tangentsAt(centre, northward, eastward);
    if (gradeAt(centre, eastward, northward, spread, herdSlope).grade > MAX_SLOPE) return;
    herds.clearOfSlope++;

    // Off carriageways, pads, farms and fields; after the draws so no seed moves.
    if (!clearOfMade(centre, spread)) return;
    // Off a vehicle a player has left in the field: asked only of a herd that
    // is not yet standing, or one far enough off that its going is not seen.
    const inTheWay = shared.inTheWay;
    if (inTheWay?.parked !== undefined) {
      const standing = movers.get(`g${row}.${col}`);
      const unseen = standing === undefined || (!standing.animated && standing.distance > HERD_HOLD_REACH);
      if (unseen && inTheWay.parked(centre, spread)) return;
    }
    herds.clearOfMade++;
    const bearing = rng.unit() * TAU;
    const height = PLANET_RADIUS + ground;
    const moverKey = `g${row}.${col}`;
    // A herd is a mover whose origin never moves; its animals move only near.
    const route = (_clock: number, out: Frame): void => {
      out.dir.copy(centre);
      out.height = height;
      tangentsAt(centre, northward, eastward);
      out.forward
        .copy(northward).multiplyScalar(Math.cos(bearing))
        .addScaledVector(eastward, Math.sin(bearing))
        .normalize();
      out.roll = 0;
      out.pitch = 0;
      out.live = true;
    };

    // The site's frame is taken from the route, so the builder seats each
    // animal in exactly the frame the mesh is drawn in.
    const pooled = `h|${row}.${col}`;
    route(0, probeFrame);
    const forwardAt = probeFrame.forward.clone().projectOnPlane(centre).normalize();
    herdSites.set(pooled, {
      species,
      region: choices.region,
      heads,
      spread,
      centre,
      forward: forwardAt,
      right: new THREE.Vector3().crossVectors(centre, forwardAt).normalize(),
      relief: reliefAt(centre.x, centre.y, centre.z),
      base: height,
    });
    consider({
      family: 'herd',
      key: moverKey,
      pool: pooled,
      speed: 0,
      heads,
      route,
    }, viewer, herdRange);
    herds.offered++;
  }

  function scan(viewer: THREE.Vector3, herdRange: number, consider: Consider): void {
    herds.registry = bestiary.size;
    herds.range = herdRange;
    herds.cells = 0; herds.chanced = 0; herds.inRange = 0; herds.land = 0;
    herds.stocked = 0; herds.dense = 0; herds.clearOfTown = 0; herds.clearOfSlope = 0;
    herds.clearOfMade = 0; herds.offered = 0;
    // Bounded here rather than in the loop, so this scan's sites survive to `serve`.
    if (herdSites.size > 4000) herdSites.clear();
    if (herdRange > 0 && bestiary.size > 0) {
      forEachCell(viewer, HERD_CELL, herdRange, (row, col) => visit(row, col, viewer, herdRange, consider));
    }
  }

  return {
    scan,
    trim(cap) {
      if (herdGround.size > cap) { herdGround.clear(); herdStock.clear(); }
    },
  };
}
