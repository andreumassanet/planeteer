/** Placing one plant: what grows here, whether anything keeps it off, and how it sits on the ground. */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { PLANT_SEATING, drawnFootprint } from '../land-probe.ts';
import type { DrawnFootprint, LandProbe } from '../land-probe.ts';
import { MAX_SLOPE, gradeAt, reliefAt } from '../terrain.ts';
import type { Slope } from '../terrain.ts';
import { BIOMES, biomeAt, biomeSample } from '../biome.ts';
import { VARIANTS } from '../scenery/index.ts';
import type { RegionStyle } from '../scenery/index.ts';
import { latOf, lonOf } from '../sphere.ts';
import type { CountryBuilder } from '../countryside-tile.ts';
import { legibleFloor } from './levels.ts';
import { insideKeepout } from './keepouts.ts';
import type { KeepoutSet } from './keepouts.ts';
import type { Framer, Placed } from './frame.ts';
import type { Site } from './layout.ts';
import type { FlatVariant, Tile } from './tiles.ts';
import type { Variants } from './variants.ts';
import type { PlantSeat } from './types.ts';

const AXIS_Y = new THREE.Vector3(0, 1, 0);

/** Everything one tile build accumulates while its sites are tried. */
export interface TileRun {
  tile: Tile;
  style: RegionStyle;
  /** Whether the tile draws trees with leaf cards. */
  cards: boolean;
  /** The tile is entirely inland, so `shelf + relief` replaces the point-in-polygon elevation. */
  inland: boolean;
  shelf: number;
  levelScale: number;
  placed: Placed[];
  vertices: number;
  leafVertices: number;
  /** The vertices it would have were every tree its lumps. */
  pricedVertices: number;
  plots: number;
  inTheSea: number;
  builtOver: number;
  onRoad: number;
  onSlope: number;
  onCountry: number;
  checked: boolean;
  /** Whether any plant was seated on the relief because the drawn land was not gathered under it. */
  fellBack: boolean;
}

export interface PlanterDeps {
  world: World;
  framer: Framer;
  tileSet: KeepoutSet;
  variants: Variants;
  country: { builder: CountryBuilder } | null;
  land: LandProbe | undefined;
  broken: string[];
  /** `current` is set by `sample` while it asks where each plant's base went; null otherwise. */
  seatLog: { current: PlantSeat[] | null };
}

interface Pick {
  id: string;
  variant: number;
  flat: FlatVariant;
  scale: number;
  relief: number;
  elevation: number;
}

export interface Planter {
  /** Tries one site. False means the tile must be abandoned (a reflecting plant basis). */
  placeSite(run: TileRun, site: Site): boolean;
}

/**
 * Whether a keepout takes the site: 'built' for a town, landmark or field,
 * 'road' for a carriageway, null for none. The plant brings its own spread to
 * the road and field tests, so a verge is one plant wide.
 */
function keptOff(tileSet: KeepoutSet, x: number, z: number, spread: number): 'built' | 'road' | null {
  for (const keepout of tileSet.keepouts) {
    if (insideKeepout(keepout, x, z)) return 'built';
  }
  for (const road of tileSet.roads) {
    const dx = road.x1 - road.x0;
    const dz = road.z1 - road.z0;
    const lengthSq = dx * dx + dz * dz;
    let t = 0;
    if (lengthSq > 1e-6) {
      t = ((x - road.x0) * dx + (z - road.z0) * dz) / lengthSq;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    const ox = road.x0 + t * dx - x;
    const oz = road.z0 + t * dz - z;
    const clear = road.clearance + spread;
    if (ox * ox + oz * oz < clear * clear) return 'road';
  }
  for (const field of tileSet.fields) {
    const dx = x - field.x;
    const dz = z - field.z;
    const clear = field.radius + spread;
    if (dx * dx + dz * dz < clear * clear) return 'built';
  }
  return null;
}

export function createPlanter(deps: PlanterDeps): Planter {
  const { world, framer, tileSet, variants, country, land, broken } = deps;
  const { frame } = framer;
  const scratch = new THREE.Vector3();
  const plantUp = new THREE.Vector3();
  const plantNorth = new THREE.Vector3();
  const plantAcross = new THREE.Vector3();
  const plantBasis = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  /** The rotation that lays a plant on the hill (`TILT_OF`). */
  const lean = new THREE.Quaternion();
  const surfaceUp = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();
  const world4 = new THREE.Matrix4();
  const local4 = new THREE.Matrix4();
  /** What `gradeAt` fills, reused: it is asked once per plot. */
  const slope: Slope = { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 };
  /** What `drawnFootprint` fills, reused the same way. */
  const drawn: DrawnFootprint = { centre: 0, lowest: 0, highest: 0 };
  const sample = biomeSample();

  /** What grows at this site: the ground's biome picks a species and a variant. Null if nothing does. */
  function choose(run: TileRun, site: Site, direction: THREE.Vector3): Pick | null {
    const { tile } = run;
    const { rng } = site;
    const relief = reliefAt(direction.x, direction.y, direction.z);
    const elevation = run.inland ? run.shelf + relief : world.elevationAt(direction);
    // Elevation 0 is the sea, and the coast is a 20-unit cliff.
    if (elevation <= 0) {
      run.inTheSea++;
      return null;
    }

    const lat = latOf(direction.y);
    const lon = lonOf(direction.x, direction.z);
    biomeAt(direction.x, direction.y, direction.z, lat, lon, relief, sample);
    // A probability per plot, not a spacing; inside a grove it was spent at the centre.
    if (!site.dense && !rng.chance(BIOMES[sample.id].cover)) return null;

    const flora = variants.floraFor(sample.id, run.style, tile.level);
    if (flora.length === 0) return null;
    const id = rng.weighted(flora);
    const variant = rng.int(VARIANTS);
    const flat = variants.variantOf(id, run.style, variant);
    if (flat === null) return null;

    const scale = run.levelScale * rng.spread(1, 0.16);
    // `floraFor` dropped the species too small for this level; this drops the one short variant of one that can.
    if (flat.height * scale < legibleFloor(tile.level)) return null;
    return { id, variant, flat, scale, relief, elevation };
  }

  /**
   * Seats the chosen plant: its own upright frame (a level-3 tile's corners
   * are three and a half degrees off its centre's vertical), the slope under
   * its footprint, the lean, and its base on the drawn land or the relief.
   * Returns 'abort' for a reflecting basis, 'skip' for a refused site, else
   * 'placed' with `local4` holding the matrix in the tile's frame.
   */
  function seat(run: TileRun, site: Site, chosen: Pick, x: number, z: number): 'placed' | 'skip' | 'abort' {
    const { tile } = run;
    const { flat, id, scale, relief, elevation } = chosen;
    framer.directionAt(x, z, plantUp);
    plantNorth.set(0, 1, 0).projectOnPlane(plantUp);
    if (plantNorth.lengthSq() < 1e-8) plantNorth.set(1, 0, 0).projectOnPlane(plantUp);
    plantNorth.normalize();
    plantAcross.crossVectors(plantUp, plantNorth).normalize();

    // Four probes at the plant's footprint in its own frame give both how low
    // the ground gets (the bedding) and how it leans (the gradient). The
    // relief is the only term that varies inside a tile, so this is four
    // `reliefAt` calls.
    const reach = Math.max(1.2, flat.footprint * scale * 0.6);
    gradeAt(plantUp, plantAcross, plantNorth, reach, slope);
    const grade = slope.grade;
    const lowest = Math.min(relief, slope.lowest);
    // Nothing grows on the scree.
    if (grade > MAX_SLOPE) {
      run.onSlope++;
      return 'skip';
    }

    plantBasis.makeBasis(plantAcross, plantUp, plantNorth);
    if (!run.checked) {
      run.checked = true;
      if (plantBasis.determinant() <= 0) {
        broken.push(`${tile.key}: plant basis has determinant ${plantBasis.determinant()}`);
        return 'abort';
      }
    }

    quaternion.setFromRotationMatrix(plantBasis);
    quaternion.multiply(spin.setFromAxisAngle(AXIS_Y, site.rng.unit() * Math.PI * 2));
    // The lean is applied in world space outside the upright basis, so the
    // spin is still about the plant's own axis; `setFromUnitVectors` is a
    // rotation by construction and cannot reflect.
    if (flat.tilt > 0 && grade > 1e-4) {
      surfaceUp
        .copy(plantUp)
        .addScaledVector(plantAcross, -slope.across)
        .addScaledVector(plantNorth, -slope.north)
        .normalize()
        .sub(plantUp)
        .multiplyScalar(flat.tilt)
        .add(plantUp)
        .normalize();
      quaternion.premultiply(lean.setFromUnitVectors(plantUp, surfaceUp));
    }
    scaleVector.setScalar(scale);
    // What is left to bed in is the share of the slope the lean did not take.
    // On the drawn land where the probe reaches, since the mesh is up to seven
    // units off the relief; past it, the relief, and a near tile built that way
    // is built again once the probe answers (`provisional`).
    const seating = land === undefined ? 'unknown' : drawnFootprint(land, plantUp, plantAcross, plantNorth, reach, drawn);
    if (seating === 'water') {
      run.inTheSea++;
      return 'skip';
    }
    let base: number;
    if (seating === 'drawn') {
      base = drawn.centre - (drawn.centre - drawn.lowest) * (1 - flat.tilt);
    } else {
      base = PLANET_RADIUS + elevation - (relief - lowest) * (1 - flat.tilt);
      if (land !== undefined) run.fellBack = true;
    }
    base -= flat.height * scale * PLANT_SEATING;
    world4.compose(scratch.copy(plantUp).multiplyScalar(base), quaternion, scaleVector);
    deps.seatLog.current?.push({ id, tree: flat.tilt < 1, drawn: seating === 'drawn', x: scratch.x, y: scratch.y, z: scratch.z, height: flat.height * scale, reach });
    local4.multiplyMatrices(frame.inverse, world4);
    return 'placed';
  }

  function placeSite(run: TileRun, site: Site): boolean {
    run.plots++;
    const { x, z } = site;
    const direction = framer.directionAt(x, z, scratch);
    const chosen = choose(run, site, direction);
    if (chosen === null) return true;
    const { flat, id, variant, scale } = chosen;

    const spread = flat.footprint * scale;
    const kept = keptOff(tileSet, x, z, spread);
    if (kept === 'built') {
      run.builtOver++;
      return true;
    }
    if (kept === 'road') {
      run.onRoad++;
      return true;
    }
    if (country !== null && country.builder.blocks(x, z, spread)) {
      run.onCountry++;
      return true;
    }

    const seated = seat(run, site, chosen, x, z);
    if (seated === 'abort') return false;
    if (seated === 'skip') return true;

    run.pricedVertices += flat.position.length / 3;
    const near = run.cards ? variants.nearOf(id, run.style, variant) : null;
    if (near !== null) {
      run.placed.push({ flat: near.wood, matrix: local4.clone(), leaves: near.leaves, sways: true });
      run.vertices += near.wood.position.length / 3;
      run.leafVertices += near.leaves.position.length / 3;
    } else {
      run.placed.push({ flat, matrix: local4.clone() });
      run.vertices += flat.position.length / 3;
    }
    return true;
  }

  return { placeSite };
}
