/**
 * What grows under your feet, answered a point at a time for `grass.ts`: the
 * same refusals as the wood's plots (biome, shore, landmarks, carriageways,
 * the countryside's fields, towns' paving), so a lawn never crosses a road.
 */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS, groundColorAt, rockAt } from '../globe.ts';
import type { LandProbe } from '../land-probe.ts';
import { reliefAt } from '../terrain.ts';
import { BIOMES, biomeAt, biomeSample } from '../biome.ts';
import type { BiomeId } from '../biome.ts';
import type { SceneryContext } from '../scenery/index.ts';
import { prominenceVersion } from '../places.ts';
import { latOf, lonOf, unitAt } from '../sphere.ts';
import { STRIP_LIFT, STRIP_MOWN, STRIP_SWARD, onStrip, stripColor, stripCover } from '../craft/airstrip.ts';
import { strawOf } from '../countryside-tile.ts';
import { cellsOf, rootOf, stepOf } from '../tile-grid.ts';
import { createGrassGather } from './grass-gather.ts';
import { insideKeepout } from './keepouts.ts';
import type { Keepouts } from './keepouts.ts';
import type { VegetationCountry } from './country.ts';
import type { GrassGround, GrassSite, VegetationOptions } from './types.ts';

/** How far off a landmark's plan the grass stops: the blades' own lean. */
const GRASS_TO_PLAN = 0.4;
/** How far a lawn in a town keeps off its streets and its walls. */
const LAWN_MARGIN = 0.6;
/** Units past an airstrip's drawn edge the grass is mown: about a blade's lean. */
const STRIP_GRASS_MARGIN = 0.8;
/** The width of an airstrip's rim, where the grass has no ground, in texels of the field asking. */
const STRIP_RIM = 1.5;
/** Units past the worn track and the threshold's boards the grass keeps off. */
const STRIP_BARE_MARGIN = 0.3;
/** How dry mown grass is at the least: cut and left in the sun. */
const MOWN_DRY = 0.3;
/** Trodden grass (round a fire, a tent or a barn door) loses this share of its blades and goes this far to straw at the bare edge. */
const WORN_THIN = 0.5;
const WORN_DRY = 0.6;
/** How dry each biome's grass is, 0 green to 1 straw. */
const DRY_OF: Readonly<Record<BiomeId, number>> = {
  ice: 0.3,
  tundra: 0.35,
  boreal: 0.05,
  temperate: 0,
  grassland: 0.15,
  steppe: 0.75,
  savanna: 0.85,
  desert: 1,
  tropical: 0,
  rock: 0.3,
};
/** How far either way the made ground is stepped for its slope, units: well inside one face of an edge slope. */
const MADE_STEP = 0.8;
/** A field of straw's grass: the crop's colour, most of the way to dry. */
const STRAW_DRY = 0.75;
/**
 * The ground's colour and the biome's `sward` are sampled on a lattice of
 * their own at this quadtree level (about 43 units a step) and laid between
 * its corners, so a biome's edge is a blend and every corner is asked once.
 */
const GROUND_LEVEL = -2;

/** The ground's colour, the biome's `sward` and its dryness at a lattice corner. */
interface GroundSample {
  density: number;
  r: number;
  g: number;
  b: number;
  dry: number;
}

export interface GrassGroundDeps {
  world: World;
  options: VegetationOptions;
  ctx: SceneryContext;
  land: LandProbe;
  keepouts: Keepouts;
  country: VegetationCountry | null;
}

/** The lattice the grass reads the ground from. */
function createGroundLattice(world: World): (lat: number, lon: number) => GroundSample {
  const sample = biomeSample();
  const groundSamples = new Map<string, GroundSample>();
  const sampleColour = new THREE.Color();
  const sampleDirection = new THREE.Vector3();
  const groundHere: GroundSample = { density: 0, r: 0, g: 0, b: 0, dry: 0 };

  /** Cached by corner: every texel round a point asks the same four. */
  function groundSample(a: number, b: number, root: number): GroundSample {
    const cells = cellsOf(root, GROUND_LEVEL);
    const column = ((b % cells) + cells) % cells;
    const key = `${a}|${column}|${root}`;
    const known = groundSamples.get(key);
    if (known !== undefined) return known;
    const lat = -90 + a * stepOf(GROUND_LEVEL);
    const lon = -180 + column * (360 / cells);
    const { x, y, z } = unitAt(lat, lon, sampleDirection);
    biomeAt(x, y, z, lat, lon, reliefAt(x, y, z), sample);
    groundColorAt(world, sampleDirection, sampleColour);
    const made = { density: BIOMES[sample.id].sward, r: sampleColour.r, g: sampleColour.g, b: sampleColour.b, dry: DRY_OF[sample.id] };
    if (groundSamples.size > 40_000) groundSamples.clear();
    groundSamples.set(key, made);
    return made;
  }

  return function groundAt(lat: number, lon: number): GroundSample {
    const step = stepOf(GROUND_LEVEL);
    const rowAt = (lat + 90) / step;
    const a = Math.floor(rowAt);
    const root = rootOf(a, GROUND_LEVEL);
    const cells = cellsOf(root, GROUND_LEVEL);
    const columnAt = (lon + 180) / (360 / cells);
    const b = Math.floor(columnAt);
    const u = columnAt - b;
    const v = rowAt - a;
    const s00 = groundSample(a, b, root);
    const s10 = groundSample(a, b + 1, root);
    const s01 = groundSample(a + 1, b, root);
    const s11 = groundSample(a + 1, b + 1, root);
    for (const channel of ['density', 'r', 'g', 'b', 'dry'] as const) {
      groundHere[channel] = (s00[channel] * (1 - u) + s10[channel] * u) * (1 - v) + (s01[channel] * (1 - u) + s11[channel] * u) * v;
    }
    return groundHere;
  };
}

export function createGrassGround(deps: GrassGroundDeps): GrassGround {
  const { world, options, ctx, land, keepouts, country } = deps;
  const lawns = options.lawns;
  const groundAt = createGroundLattice(world);
  const { set: grassSet, strips: grassStrips, groundUnder, gather } = createGrassGather(options, land, keepouts);
  /** A field of straw's colour, for the grass that grows as its crop. */
  const strawTint = new THREE.Color();
  const grassProbe = new THREE.Vector3();
  /** The drawn normal under a site, and the site itself in world units, for `rockAt`. */
  const shading = new THREE.Vector3();
  const sitePoint = new THREE.Vector3();
  const slopeA = new THREE.Vector3();
  const slopeB = new THREE.Vector3();
  const slopeN = new THREE.Vector3();

  /**
   * The made ground's normal at `direction` (a town's edge slope, an outer
   * yard), from the surface a step either way along the gather's two axes:
   * its faces are flat, so this is the face's own. False where a step leaves it.
   */
  function madeNormal(direction: THREE.Vector3, out: THREE.Vector3): boolean {
    const step = MADE_STEP / PLANET_RADIUS;
    const ends = [slopeA, slopeB];
    let k = 0;
    for (const along of [grassSet.across, grassSet.north]) {
      grassProbe.copy(direction).addScaledVector(along, step).normalize();
      const ahead = groundUnder(grassProbe, 0);
      if (ahead === null) return false;
      const end = ends[k++]!.copy(grassProbe).multiplyScalar(ahead);
      grassProbe.copy(direction).addScaledVector(along, -step).normalize();
      const behind = groundUnder(grassProbe, 0);
      if (behind === null) return false;
      end.sub(slopeN.copy(grassProbe).multiplyScalar(behind));
    }
    out.crossVectors(slopeA, slopeB);
    if (out.lengthSq() === 0) return false;
    out.normalize();
    if (out.dot(direction) < 0) out.negate();
    return true;
  }

  /** Whether a landmark or a carriageway of the last gather takes the point (x, z) in its frame. */
  function keptBare(x: number, z: number, spread: number): boolean {
    const set = grassSet;
    for (const keepout of set.keepouts) {
      if (keepouts.half[keepout.index]! > 0) continue;
      // The grass grows up to a landmark's plan, not to where the wood stops.
      if (insideKeepout(keepout, x, z, GRASS_TO_PLAN)) return true;
    }
    for (const road of set.roads) {
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
      const clear = road.clearance + 0.8 + spread;
      if (ox * ox + oz * oz < clear * clear) return true;
    }
    return false;
  }

  /**
   * Lowers the ground where it folds up between the field's points: the field
   * lays blades on the line between its points, which passes over a hollow in
   * the air by up to a quarter of the change of slope times the spacing.
   * Lowering by half the second difference where that is a hollow keeps the
   * line under the ground; capped at `spread` because a riser is not a fold.
   */
  function lowered(direction: THREE.Vector3, radius: number, spread: number): number {
    let lower = 0;
    for (const along of [grassSet.across, grassSet.north]) {
      grassProbe.copy(direction).addScaledVector(along, (2 * spread) / PLANET_RADIUS).normalize();
      const ahead = groundUnder(grassProbe, 0);
      grassProbe.copy(direction).addScaledVector(along, (-2 * spread) / PLANET_RADIUS).normalize();
      const behind = groundUnder(grassProbe, 0);
      if (ahead === null || behind === null) continue;
      lower = Math.max(lower, (ahead + behind - 2 * radius) / 2);
    }
    return radius - Math.min(spread, lower);
  }

  function at(direction: THREE.Vector3, out: GrassSite, spread = 0): GrassSite | null {
    const lat = latOf(direction.y);
    const lon = lonOf(direction.x, direction.z);
    const ground = groundAt(lat, lon);
    if (ground.density <= 0) return null;
    // Bare ground is still ground: where the land goes on but nothing grows
    // (shore sand, a pad, a verge, a paddy) the answer is the land's height at
    // no density, so blades beside it have a surface to follow.
    let bare = false;
    // The shore ramp is the one place the relief is under the shelf, and it is sand.
    if (reliefAt(direction.x, direction.y, direction.z) < 0) bare = true;

    const set = grassSet;
    const x = direction.dot(set.across) * PLANET_RADIUS;
    const z = direction.dot(set.north) * PLANET_RADIUS;
    if (!bare && keptBare(x, z, spread)) bare = true;

    // An airstrip is grass cut short and dry: mown on the strip it draws and a
    // little past its edge, none on the worn track or under the threshold's
    // boards (`stripCover`, the one answer both read). The blades root on the
    // drawn strip, `STRIP_LIFT` over the land. The strip's rim, a band
    // `STRIP_RIM` texels wide inside its edge, is no ground at all: a blade
    // laid between a texel on the strip and one beside it would root in the
    // air by that lift. Two strips of one town may cross: bare where either's
    // track is, and a rim only where the point is inside neither.
    let lane = -1;
    let inner = false;
    for (const site of grassStrips) {
      const cover = stripCover(site, direction, STRIP_GRASS_MARGIN + spread, STRIP_BARE_MARGIN + spread);
      if (cover < 0) continue;
      lane = lane === 0 ? 0 : cover;
      if (onStrip(site, direction, STRIP_GRASS_MARGIN + spread - STRIP_RIM * 2 * spread)) inner = true;
    }
    if (lane >= 0) {
      if (!inner) return null;
      if (lane === 0 || ground.density < STRIP_SWARD) bare = true;
    }
    // The countryside: no grass through a paddy, a pond or a ploughed field,
    // grass the colour of the crop in a field of straw, bare under a tent, a
    // fire or a barn and trodden short round it.
    let straw: number | null = null;
    let height = lane >= 0 ? STRIP_MOWN : 1;
    /** How worn the ground is round a piece, 0 to 1: short, thin and dry toward the bare. */
    let worn = 0;
    if (country !== null && !bare) {
      const field = country.planner.fieldAt(direction);
      if (field !== null) {
        straw = strawOf(ctx, field.crop);
        if (straw === null) bare = true;
      }
      if (!bare) {
        worn = 1 - country.planner.trodden(direction, spread);
        height *= 1 - worn;
        if (height <= 0) bare = true;
      }
    }
    let radius = groundUnder(direction, LAWN_MARGIN + spread, shading);
    if (radius === null) return null;
    // Thinned across the band where the land draws its faces as rock, and
    // gone where it is all rock: no blade stands on a cliff.
    // A town's ground answers no drawn normal; where it is the land's own (an
    // edge slope) the town draws it as the land, so it is asked the same.
    if (shading.lengthSq() === 0 && !bare) madeNormal(direction, shading);
    const rock = shading.lengthSq() > 0 ? rockAt(shading, sitePoint.copy(direction).multiplyScalar(radius)) : 0;
    if (spread > 0) radius = lowered(direction, radius, spread);

    out.radius = radius + (lane >= 0 ? STRIP_LIFT : 0);
    out.density = bare ? 0 : ground.density * (1 - worn * WORN_THIN) * (1 - rock);
    // Kept where it is bare too: the height is laid between texels, and a mown blade by the track is mown.
    out.height = height;
    if (lane > 0) {
      strawTint.setRGB(ground.r, ground.g, ground.b);
      stripColor(strawTint, ground.density, strawTint).multiplyScalar(lane);
      out.r = strawTint.r;
      out.g = strawTint.g;
      out.b = strawTint.b;
      out.dry = Math.max(ground.dry, MOWN_DRY);
    } else if (straw === null) {
      out.r = ground.r;
      out.g = ground.g;
      out.b = ground.b;
      out.dry = Math.max(ground.dry, worn * WORN_DRY);
    } else {
      strawTint.set(straw);
      out.r = strawTint.r;
      out.g = strawTint.g;
      out.b = strawTint.b;
      out.dry = Math.max(ground.dry, STRAW_DRY);
    }
    return out;
  }

  return {
    covers: (direction) => land.covers(direction),
    gather,
    at,
    floorChanges: (since, into) => (lawns === undefined ? since : lawns.floorChanges(since, into)),
    version: () => prominenceVersion(),
  };
}
