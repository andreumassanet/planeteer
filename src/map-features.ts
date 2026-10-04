/**
 * What stands on Earth, painted onto the map's tiles (`map-tiles.ts`): the
 * roads, the railway, the towns as they are built, the fields and the woods,
 * the landmarks' ground, the airstrips and the rockets' pads.
 *
 * **Every mark is read off the definition the world itself is built from.**
 * A road is its `coursePath`, at the carriageway's width, in its region's
 * tarmac (`asphaltOf` of `GroundStyle.road`, a trunk worn darker), as
 * `roads.ts` lays the ribbon; a railway is `RailNetwork.path`; a town is its
 * `TownPlan` (`settlements.ts`): the cells its floor paves, coloured as the
 * floor colours them, the streets on their bands, and every building's plan
 * box — the box `solids.ts` collides with — filled with its own variant's
 * roof colour and inked; a field is the countryside's `CropField` in its
 * crop's plate (`cropPlate`), a farm or a mill its `CountryPiece`; a
 * landmark is its plan (`landmark-ground.ts`); a strip is `stripCorners`; a
 * pad is `PadIndex.padsWithin` at `PAD_RADIUS`. Positions go through each
 * thing's own frame onto the tile (`TileView.frame`), so a town is drawn the
 * way its own `townFrame` turns, and nothing here decides which way east is.
 *
 * Two marks are symbols rather than records, and say so: **a wood** is dots
 * on a lattice thinned by the biome's own `cover` — the number the wood
 * itself is thinned by — rather than each tree `vegetation.ts` plants, which
 * would mean raising its tiles; and **a countryside piece** is a footprint in
 * a colour by its part, since its model is built only near.
 *
 * Levels (a level-`z` tile is 392/2^z units a pixel at the equator):
 *
 * ```
 *   z5   12 u/px   roads as lines, towns as squares
 *   z6    6 u/px   + the railway, strips, landmarks, towns as their cells
 *   z7    3 u/px   + streets, blocks of buildings, fields, woods, pads
 *   z8  1.5 u/px   + every building inked, trees, farms and mills
 *   z9  0.8 u/px   + a field's rows, fences
 * ```
 */
import * as THREE from 'three';
import type { World } from './geo.ts';
import type { Place } from './places.ts';
import { isShown, radiusOf } from './places.ts';
import { type Road, courseOf, coursePath, emptyCourse } from './roads.ts';
import type { RailNetwork } from './rails.ts';
import { BED_HALF } from './rails.ts';
import type { TownPlan } from './settlements.ts';
import { CARRIAGEWAY_HALF, cellCentre, gatesOf, isAvenue, outskirtsOf, townGrid } from './scenery/grid.ts';
import { asphaltOf, cellKey, groundStyleFor } from './scenery/ground.ts';
import { regionFor } from './scenery/regions.ts';
import type { Countryside, CropField, CountryPiece } from './countryside.ts';
import { cropPlate } from './countryside-tile.ts';
import { cellAt, cellBounds, stepOf } from './tile-grid.ts';
import { type Plan, landmarkFrame, planShape } from './landmark-ground.ts';
import { STRIP_DRAWN, type StripSite, stripCorners } from './craft/airstrip.ts';
import { PAD_RADIUS } from './rocket.ts';
import { FIELD_SPREAD } from './fleet.ts';
import { BIOMES, biomeAt, biomeSample } from './biome.ts';
import { reliefAt } from './terrain.ts';
import { unitAt } from './sphere.ts';
import { PALETTE } from './theme.ts';
import { tone } from './monuments/contract.ts';
import type { Affine, MapFeatures, TileView } from './map-tiles.ts';
import { SHEET_HEIGHT, latOfV } from './map-tiles.ts';
import type { Raster } from './raster.ts';
import { bytesOf } from './raster.ts';

/** As much of a placement as the map draws: where it stands and its plan. */
export interface MapLandmark {
  lat: number;
  lon: number;
  footprint?: number;
  plan?: Plan;
}

export interface EarthFeatureSources {
  world: World;
  /** Every place, the array `roads.bin` indexes into. */
  places: readonly Place[];
  roads: readonly Road[];
  rails?: RailNetwork | null;
  landmarks?: readonly MapLandmark[];
  /** The plane sites, whose strips are drawn: `FieldIndex.planesNear`. */
  planesNear?: (direction: THREE.Vector3, radius: number, out: StripSite[]) => StripSite[];
  /**
   * Works the strips round a point out while `more` allows, true once they
   * are (`SiteIndex.warm`; asked `FIELD_SPREAD` wider, as `planesNear`
   * looks): a city's strip search is the dear one, up to 26 ms, and
   * `planesNear` would do it all at once.
   */
  stripsReady?: (direction: THREE.Vector3, radius: number, more: () => boolean) => boolean;
  /** The pads within `radius` of `direction`; false while some are still being worked out (`PadIndex.padsWithin`). */
  pads?: (direction: THREE.Vector3, radius: number, out: { at: THREE.Vector3 }[]) => boolean;
  /** The countryside's planner, once the vegetation has one. */
  countryside?: () => Countryside | null;
  /** A town's plan (`Settlements.townPlan`): undefined while it is worked out. */
  plans?: (index: number) => TownPlan | null | undefined;
}

/** The level each family of marks comes in at. */
const ROADS_FROM = 5;
const TOWNS_FROM = 5;
const RAILS_FROM = 6;
const STRIPS_FROM = 6;
const LANDMARKS_FROM = 6;
const PLANS_FROM = 7;
const FIELDS_FROM = 7;
const WOODS_FROM = 7;
const PADS_FROM = 7;
const INKED_FROM = 8;
const PIECES_FROM = 8;
const ROWS_FROM = 9;
/** A step's slice of a strip search, ms. */
const STRIP_SLICE_MS = 2;
/** Roads, and a wood's crowns, filled a batch at a time, a step each. */
const ROAD_BATCH = 24;
const CROWN_BATCH = 200;

const INK = bytesOf(PALETTE.ink);
/** The ink's line on a building, a field, a town's edge: pixels, by level. */
const inkWidth = (z: number): number => (z >= 10 ? 1.1 : z >= 9 ? 0.9 : z >= 8 ? 0.7 : 0.5);

/**
 * The wood's symbol: a crown every `WOOD_PITCH` units of a lattice fixed to
 * the sheet, kept where the biome's `cover` says a wood is — the chance the
 * wood's own sites are kept by — and in its canopy's colour, the biome's
 * ground darkened, as the wood reads from the air. At level 7 a crown is a
 * blot two pixels wide; from level 8 it is inked.
 */
const WOOD_PITCH = 9;
const CANOPY = bytesOf(tone(PALETTE.green, 0.66));
const CANOPY_DARK = bytesOf(tone(PALETTE.darkOlive, 0.8));
/** The groves' noise lattice, in crowns. */
const GROVE = 7;
/** A tree in a town's yard. */
const YARD_TREE = bytesOf(tone(PALETTE.green, 0.62));

/**
 * The countryside's pieces by part, in a colour of each — a symbol, since a
 * piece's model is only built near. Anything not named is a small dot in
 * `stone`; trees and props too small to see from above are left out.
 */
const PIECE_COLOURS: Record<string, number | null> = {
  barn: tone(PALETTE.red, 0.8),
  silo: PALETTE.bone,
  'hay-bale': PALETTE.gold,
  windpump: PALETTE.steel,
  windmill: PALETTE.cream,
  turbine: PALETTE.white,
  lighthouse: PALETTE.white,
  'wayside-cross': PALETTE.bone,
  chapel: PALETTE.cream,
  torii: PALETTE.red,
  'road-shrine': PALETTE.bone,
  chorten: PALETTE.white,
  'prayer-flags': null,
  'spirit-house': PALETTE.gold,
  marabout: PALETTE.white,
  'hindu-shrine': PALETTE.salmon,
  'standing-stone': PALETTE.bone,
  'ruin-column': PALETTE.sand,
  'ruin-wall': PALETTE.tan,
  tent: PALETTE.cream,
  ger: PALETTE.white,
  'nomad-tent': PALETTE.brown,
  campfire: PALETTE.orange,
  'fishing-hut': PALETTE.brown,
  jetty: tone(PALETTE.brown, 0.85),
  rowboat: null,
  cairn: PALETTE.bone,
  bench: null,
  signpost: null,
  rocks: PALETTE.bone,
  palm: null,
  olive: null,
  tractor: null,
};
/** A countryside dwelling (a farm's house: a scenic part) and anything else unnamed. */
const FARMHOUSE = tone(PALETTE.clay, 1.05);

/** A landmark's ground: the stone of a plaza. */
const LANDMARK_FILL = bytesOf(PALETTE.bone);
const LANDMARK_CORE = bytesOf(tone(PALETTE.slate, 1.1));
/** A strip's mown grass and its centre track. */
const STRIP_FILL = bytesOf(tone(PALETTE.sand, 0.9));
const PAD_FILL = bytesOf(PALETTE.bone);
const PAD_MARK = bytesOf(PALETTE.red);
/** The railway: its bed, and the sleepers' dashes over it at a near zoom. */
const RAIL_BED = bytesOf(tone(PALETTE.steel, 0.85));
const RAIL_TIE = bytesOf(PALETTE.bone);
/** A road while it is a symbol (under level 7): the sheet's cream, cased. */
const ROAD_SYMBOL = bytesOf(PALETTE.cream);

const DEG = Math.PI / 180;

export function createEarthFeatures(sources: EarthFeatureSources): MapFeatures {
  const { world, places, roads } = sources;
  const continentOf = new Map<string, string>(world.countries.map((country) => [country.iso, country.continent]));
  const regionOf = (place: Place) => regionFor(place.iso, continentOf.get(place.iso) ?? '', place.lat);

  // --- the towns, bucketed by degree ----------------------------------------

  let townBuckets: Map<number, number[]> | null = null;
  const bucketKey = (lat: number, lon: number): number => (Math.floor(lat) + 90) * 400 + (Math.floor(lon) + 180);
  function townsIn(south: number, north: number, west: number, east: number): number[] {
    if (townBuckets === null) return [];
    // The biggest square reaches 0.54 degrees of latitude from its centre.
    const out: number[] = [];
    for (let lat = Math.floor(south - 0.6); lat <= Math.floor(north + 0.6); lat++) {
      const spread = 0.6 / Math.max(0.05, Math.cos(Math.min(89, Math.abs(lat) + 1) * DEG));
      for (let lon = Math.floor(west - spread); lon <= Math.floor(east + spread); lon++) {
        const wrapped = ((lon + 180) % 360 + 360) % 360 - 180;
        const list = townBuckets.get(bucketKey(lat, wrapped));
        if (list !== undefined) out.push(...list);
      }
    }
    return out;
  }

  // --- the roads: their boxes, and their paths when first drawn -------------

  interface RoadEntry {
    south: number;
    north: number;
    west: number;
    east: number;
    path: Float64Array | null;
    tarmac: [number, number, number];
  }
  let roadEntries: RoadEntry[] | null = null;
  const roadCourse = emptyCourse();
  const roadColour = new THREE.Color();
  const roadAsphalt = new THREE.Color();
  const roadList = (): RoadEntry[] => roadEntries ?? [];
  function roadEntry(road: Road): RoadEntry {
    {
      const a = places[road.a];
      const b = places[road.b];
      if (a === undefined || b === undefined) return { south: 1, north: 0, west: 1, east: 0, path: null, tarmac: [0, 0, 0] };
      let lonB = b.lon;
      if (lonB - a.lon > 180) lonB -= 360;
      else if (a.lon - lonB > 180) lonB += 360;
      // A road's bow takes it a fraction of its length off the chord; a
      // quarter of the length round both ends is more than any bake wrote.
      const pad = 0.25 * Math.hypot(lonB - a.lon, b.lat - a.lat) + 0.05;
      // The ribbon's own surface (`roads.ts`): the region's carriageway at the
      // road's first town, warmed off the towns, a trunk worn darker.
      roadColour.setHex(groundStyleFor(regionOf(a).id).road);
      if (road.cls === 2) roadColour.lerp(new THREE.Color(PALETTE.ink), 0.12);
      asphaltOf(roadColour, roadAsphalt);
      return {
        south: Math.min(a.lat, b.lat) - pad,
        north: Math.max(a.lat, b.lat) + pad,
        west: Math.min(a.lon, lonB) - pad,
        east: Math.max(a.lon, lonB) + pad,
        path: null,
        tarmac: bytesOf(roadAsphalt.getHex()),
      };
    }
  }

  /**
   * The indexes, built the first time a tile asks, in slices — the towns
   * by degree, the roads' boxes and tarmacs — so a tile's first step is
   * not a pass over 29,651 places and every road.
   */
  let prepared = false;
  let preparing: Generator<undefined, void, void> | null = null;
  function* prepareSteps(): Generator<undefined, void, void> {
    const buckets = new Map<number, number[]>();
    for (let index = 0; index < places.length; index++) {
      if ((index & 2047) === 2047) yield;
      const place = places[index]!;
      if (!isShown(place)) continue;
      const k = bucketKey(place.lat, place.lon);
      const list = buckets.get(k);
      if (list === undefined) buckets.set(k, [index]);
      else list.push(index);
    }
    const entries: RoadEntry[] = [];
    for (let index = 0; index < roads.length; index++) {
      if ((index & 511) === 511) yield;
      entries.push(roadEntry(roads[index]!));
    }
    townBuckets = buckets;
    roadEntries = entries;
  }
  function* ready(): Generator<undefined, void, void> {
    while (!prepared) {
      preparing ??= prepareSteps();
      if (preparing.next().done === true) {
        prepared = true;
        preparing = null;
      } else yield;
    }
  }
  function pathOf(index: number): Float64Array {
    const entry = roadList()[index]!;
    if (entry.path === null) {
      courseOf(roads[index]!, places, roadCourse);
      entry.path = coursePath(roadCourse).xyz;
    }
    return entry.path;
  }
  const overlaps = (view: TileView, s: number, n: number, w: number, e: number): boolean => {
    if (n < view.south || s > view.north) return false;
    for (const shift of [0, -360, 360]) if (e + shift >= view.west && w + shift <= view.east) return true;
    return false;
  };

  // --- shared scratch ---------------------------------------------------------

  const p = { x: 0, y: 0 };
  const q = { x: 0, y: 0 };
  const affine: Affine = { ox: 0, oy: 0, xx: 0, xy: 0, zx: 0, zy: 0 };
  const xs: number[] = [];
  const ys: number[] = [];
  const unit = new THREE.Vector3();
  const sample = biomeSample();

  /** A polyline of unit vectors (x, y, z runs) onto the tile, into `xs`/`ys`; false if none of it is near. */
  function project(view: TileView, xyz: ArrayLike<number>, count: number, margin: number): boolean {
    xs.length = 0;
    ys.length = 0;
    let near = false;
    for (let k = 0; k < count; k++) {
      view.at({ x: xyz[k * 3]!, y: xyz[k * 3 + 1]!, z: xyz[k * 3 + 2]! }, p);
      xs.push(p.x);
      ys.push(p.y);
      if (view.inside(p.x, p.y, margin)) near = true;
    }
    // A run near enough to the tile to be on it between its points.
    if (!near && count > 1) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (let k = 0; k < count; k++) {
        x0 = Math.min(x0, xs[k]!);
        x1 = Math.max(x1, xs[k]!);
        y0 = Math.min(y0, ys[k]!);
        y1 = Math.max(y1, ys[k]!);
      }
      near = x1 >= -margin && y1 >= -margin && x0 <= 256 + margin && y0 <= 256 + margin;
    }
    return near;
  }

  /** A box in a local frame — centre, first axis `(c, s)`, half extents — as a parallelogram on the tile. */
  function localBox(raster: Raster, a: Affine, x: number, z: number, c: number, s: number, hx: number, hz: number): void {
    const cx = a.ox + a.xx * x + a.zx * z;
    const cy = a.oy + a.xy * x + a.zy * z;
    raster.box(cx, cy, (a.xx * c + a.zx * s) * hx, (a.xy * c + a.zy * s) * hx, (-a.xx * s + a.zx * c) * hz, (-a.xy * s + a.zy * c) * hz);
  }

  /** The same box's four corners, for its ink. */
  function localCorners(a: Affine, x: number, z: number, c: number, s: number, hx: number, hz: number): void {
    xs.length = 0;
    ys.length = 0;
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const lx = x + c * hx * i - s * hz * j;
      const lz = z + s * hx * i + c * hz * j;
      xs.push(a.ox + a.xx * lx + a.zx * lz);
      ys.push(a.oy + a.xy * lx + a.zy * lz);
    }
  }

  // --- the woods ----------------------------------------------------------------

  function* paintWoods(view: TileView, raster: Raster): Generator<undefined, void, void> {
    // A lattice fixed to the sheet at this level, so two tiles agree at their
    // seam: its pitch in pixels is the level's, not the tile's latitude's
    // (a tile's own `unitsPerPixel` drew two lattices either side of every
    // row of tiles), taken at 45 degrees, where most of the land is.
    const atLevel = (360 / view.scale) * view.radius * DEG * Math.SQRT1_2;
    const step = Math.max(2, WOOD_PITCH / atLevel);
    // The cover on a coarse lattice first — most of a tile is one biome —
    // fixed to the sheet, so a crown near a seam is asked the same cover by
    // both tiles and kept by both or neither.
    const L = 32;
    const gx0 = Math.floor((view.u0 * view.scale - 2 * step) / L);
    const gy0 = Math.floor((view.v0 * view.scale - 2 * step) / L);
    const G = Math.ceil((256 + 4 * step) / L) + 2;
    const cover = new Float32Array(G * G);
    for (let gy = 0; gy < G; gy++) {
      const lat = latOfV(Math.min(SHEET_HEIGHT, Math.max(0, ((gy0 + gy) * L) / view.scale)));
      for (let gx = 0; gx < G; gx++) {
        const lon = ((gx0 + gx) * L) / view.scale * 360 - 180;
        unitAt(lat, lon, unit);
        const relief = reliefAt(unit.x, unit.y, unit.z);
        biomeAt(unit.x, unit.y, unit.z, lat, lon, relief, sample);
        cover[gy * G + gx] = BIOMES[sample.id].cover;
      }
    }
    yield;
    const columns = Math.ceil(256 / step) + 2;
    const originX = Math.floor((view.u0 * view.scale) / step);
    const originY = Math.floor((view.v0 * view.scale) / step);
    // A crown its own size from level 8, inked; at level 7, where it is two
    // pixels, a blot wide enough to run into its neighbours, so a wood reads
    // as a wood and not as a scatter of specks.
    const r = view.z >= INKED_FROM ? Math.max(0.9, (WOOD_PITCH * 0.42) / atLevel) : step * 0.62;
    const inked = view.z >= INKED_FROM;
    const dots: number[] = [];
    for (let row = -1; row < columns; row++) {
      for (let col = -1; col < columns; col++) {
        const gx = originX + col;
        const gy = originY + row;
        const h1 = hash2(gx, gy);
        const x = (gx + 0.2 + 0.6 * h1) * step - view.u0 * view.scale;
        const y = (gy + 0.2 + 0.6 * hash2(gy + 7.1, gx - 3.3)) * step - view.v0 * view.scale;
        if (!view.inside(x, y, r)) continue;
        const fx = (x + view.u0 * view.scale) / L - gx0;
        const fy = (y + view.v0 * view.scale) / L - gy0;
        const ix = Math.min(G - 2, Math.max(0, Math.floor(fx)));
        const iy = Math.min(G - 2, Math.max(0, Math.floor(fy)));
        const tx = fx - ix;
        const ty = fy - iy;
        const c =
          (cover[iy * G + ix]! * (1 - tx) + cover[iy * G + ix + 1]! * tx) * (1 - ty) +
          (cover[(iy + 1) * G + ix]! * (1 - tx) + cover[(iy + 1) * G + ix + 1]! * tx) * ty;
        // A wood is groves and clearings, not an even scatter: the chance is
        // the cover, against smooth noise over a lattice `GROVE` crowns wide,
        // so the crowns kept run together into woods with edges.
        if (groveNoise(gx / GROVE, gy / GROVE) * 0.8 + h1 * 0.2 > c * 0.92) continue;
        // Not in the sea: asked of the outlines only where a crown is kept.
        unitAt(latAt(view, y), view.west + (x / 256) * (view.east - view.west), unit);
        if (world.countryAtPoint(unit) <= 0) continue;
        dots.push(x, y);
      }
      if ((row & 3) === 3) yield;
    }
    // A batch of crowns at a time: each batch's rims, then its canopies, so
    // a crown overlapping one of the batch before is drawn over it whole.
    for (let at = 0; at < dots.length; at += CROWN_BATCH * 2) {
      const end = Math.min(dots.length, at + CROWN_BATCH * 2);
      if (inked) {
        for (let k = at; k < end; k += 2) raster.circle(dots[k]!, dots[k + 1]!, r + inkWidth(view.z));
        raster.fill(...CANOPY_DARK, 0.9);
      }
      for (let k = at; k < end; k += 2) raster.circle(dots[k]!, dots[k + 1]!, r);
      raster.fill(...CANOPY);
      yield;
    }
  }

  // --- the countryside ----------------------------------------------------------

  const cellScratch = { south: 0, west: 0, dLat: 0, dLon: 0 };
  function* paintCountry(view: TileView, raster: Raster): Generator<undefined, void, void> {
    const planner = sources.countryside?.() ?? null;
    if (planner === null) return;
    const step = stepOf(0);
    const fields: CropField[] = [];
    const pieces: CountryPiece[] = [];
    const lines: { from: THREE.Vector3; to: THREE.Vector3 }[] = [];
    const seen = new Set<string>();
    for (let lat = view.south - step; lat <= view.north + step; lat += step) {
      const first = cellAt(Math.max(-89.9, Math.min(89.9, lat)), view.west, 0);
      cellBounds(0, first.row, first.column, cellScratch);
      for (let lon = cellScratch.west; lon <= view.east + cellScratch.dLon; lon += cellScratch.dLon) {
        const cell = cellAt(Math.max(-89.9, Math.min(89.9, lat)), lon, 0);
        const key = `${cell.row}:${cell.column}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const plan = planner.plan(cell.row, cell.column);
        fields.push(...plan.fields);
        pieces.push(...plan.pieces);
        if (view.z >= ROWS_FROM) lines.push(...plan.lines);
        yield;
      }
    }
    // The fields, each its crop's plate and, close enough, its rows.
    for (const field of fields) {
      const plate = cropPlate(field.crop);
      frameAt(field.at);
      view.frame(field.at, frameAcross, frameNorth, affine);
      const c = Math.cos(field.yaw);
      const s = -Math.sin(field.yaw);
      if (field.round) {
        view.at(field.at, p);
        raster.circle(p.x, p.y, field.halfX / view.unitsPerPixel);
      } else localBox(raster, affine, 0, 0, c, s, field.halfX, field.halfZ);
      raster.fill(...bytesOf(plate[0]));
      if (view.z >= ROWS_FROM && !field.round) {
        // Its rows along its local Z, every other one in the second tone.
        const spacing = Math.max(2.4, 2 * view.unitsPerPixel);
        for (let x = -field.halfX + spacing / 2; x < field.halfX; x += spacing * 2) {
          localBox(raster, affine, x * c, x * s, c, s, spacing / 2, field.halfZ);
        }
        raster.fill(...bytesOf(plate[1]), 0.7);
      }
      if (view.z >= INKED_FROM && !field.round) {
        localCorners(affine, 0, 0, c, s, field.halfX, field.halfZ);
        raster.outline(xs, ys, 4, inkWidth(view.z) * 0.5);
        raster.fill(...INK, 0.35);
      }
    }
    yield;
    for (const line of lines) {
      view.at(line.from, p);
      view.at(line.to, q);
      raster.segment(p.x, p.y, q.x, q.y, 0.35);
    }
    if (lines.length > 0) raster.fill(...INK, 0.45);
    if (view.z < PIECES_FROM) return;
    // The pieces: a footprint each, in its part's colour, inked.
    for (const piece of pieces) {
      const colour = piece.scenic ? FARMHOUSE : PIECE_COLOURS[piece.part] === undefined ? PALETTE.bone : PIECE_COLOURS[piece.part]!;
      if (colour === null) continue;
      view.at(piece.at, p);
      if (!view.inside(p.x, p.y, 20)) continue;
      const half = Math.max(0.8 / view.unitsPerPixel, piece.footprint * 0.62);
      frameAt(piece.at);
      view.frame(piece.at, frameAcross, frameNorth, affine);
      const c = Math.cos(piece.yaw);
      const s = -Math.sin(piece.yaw);
      const round = piece.part === 'silo' || piece.part === 'ger' || piece.part === 'windmill' || piece.part === 'lighthouse' || piece.part === 'turbine' || piece.part === 'campfire' || piece.part === 'hay-bale';
      const ink = inkWidth(view.z);
      if (round) {
        const r = Math.max(1, (piece.footprint * 0.6) / view.unitsPerPixel);
        raster.circle(p.x, p.y, r + ink);
        raster.fill(...INK);
        raster.circle(p.x, p.y, r);
      } else {
        localCorners(affine, 0, 0, c, s, half, half * (piece.part === 'jetty' ? 2.2 : 0.75));
        raster.outline(xs, ys, 4, ink);
        raster.fill(...INK);
        localBox(raster, affine, 0, 0, c, s, half, half * (piece.part === 'jetty' ? 2.2 : 0.75));
      }
      raster.fill(...bytesOf(colour));
    }
  }

  const frameAcross = new THREE.Vector3();
  const frameNorth = new THREE.Vector3();
  /** The tangent frame at a point, as `townFrame` builds it. */
  function frameAt(up: THREE.Vector3): void {
    landmarkFrame(up, frameAcross, frameNorth);
  }

  // --- the roads and the railway ------------------------------------------------

  function* paintRoads(view: TileView, raster: Raster): Generator<undefined, void, void> {
    const list = roadList();
    const symbol = view.z < PLANS_FROM;
    const half = Math.max(symbol ? 0.7 : 0.6, CARRIAGEWAY_HALF / view.unitsPerPixel);
    const casing = symbol ? 0.75 : inkWidth(view.z) + 0.15;
    const drawn: { xs: number[]; ys: number[]; colour: [number, number, number] }[] = [];
    let k = 0;
    for (let index = 0; index < list.length; index++) {
      const entry = list[index]!;
      if (!overlaps(view, entry.south, entry.north, entry.west, entry.east)) continue;
      // A road's path is worked out the first time it is drawn, a few at a step.
      if (entry.path === null && (++k & 3) === 0) yield;
      const path = pathOf(index);
      if (!project(view, path, path.length / 3, half + 4)) continue;
      drawn.push({ xs: [...xs], ys: [...ys], colour: entry.tarmac });
    }
    if (drawn.length === 0) return;
    // Casing under every road first, so a junction is one piece of road — in
    // batches of `ROAD_BATCH`, a step each, so a far tile's hundreds of roads
    // are not one long fill.
    for (let at = 0; at < drawn.length; at += ROAD_BATCH) {
      for (const line of drawn.slice(at, at + ROAD_BATCH)) raster.polyline(line.xs, line.ys, line.xs.length, half + casing);
      raster.fill(...INK, symbol ? 0.7 : 0.85);
      yield;
    }
    // Then each in its own tarmac, or the sheet's cream while it is a symbol.
    for (let at = 0; at < drawn.length; at += ROAD_BATCH) {
      const byColour = new Map<string, typeof drawn>();
      for (const line of drawn.slice(at, at + ROAD_BATCH)) {
        const key = symbol ? '' : line.colour.join(',');
        const group = byColour.get(key);
        if (group === undefined) byColour.set(key, [line]);
        else group.push(line);
      }
      for (const group of byColour.values()) {
        for (const line of group) raster.polyline(line.xs, line.ys, line.xs.length, half);
        if (symbol) raster.fill(...ROAD_SYMBOL);
        else raster.fill(...group[0]!.colour);
      }
      yield;
    }
  }

  function* paintRails(view: TileView, raster: Raster): Generator<undefined, void, void> {
    const network = sources.rails;
    if (network === null || network === undefined) return;
    const half = Math.max(0.6, BED_HALF / view.unitsPerPixel);
    const lines: { xs: number[]; ys: number[] }[] = [];
    for (let line = 0; line < network.lines.length; line++) {
      const path = network.path(line);
      if (!project(view, path.xyz, path.count, half + 4)) continue;
      lines.push({ xs: [...xs], ys: [...ys] });
      yield;
    }
    if (lines.length === 0) return;
    for (const line of lines) raster.polyline(line.xs, line.ys, line.xs.length, half + 0.6);
    raster.fill(...INK, 0.8);
    for (const line of lines) raster.polyline(line.xs, line.ys, line.xs.length, half);
    raster.fill(...RAIL_BED);
    if (view.z < INKED_FROM) return;
    // The sleepers' dashes down the middle, the railway's own symbol.
    const dash = 3 / view.unitsPerPixel;
    for (const line of lines) {
      let carry = 0;
      for (let k = 1; k < line.xs.length; k++) {
        const x0 = line.xs[k - 1]!;
        const y0 = line.ys[k - 1]!;
        const length = Math.hypot(line.xs[k]! - x0, line.ys[k]! - y0);
        if (length <= 0) continue;
        const dx = (line.xs[k]! - x0) / length;
        const dy = (line.ys[k]! - y0) / length;
        for (let t = carry; t < length; t += dash * 2) {
          const t1 = Math.min(length, t + dash);
          raster.segment(x0 + dx * t, y0 + dy * t, x0 + dx * t1, y0 + dy * t1, Math.max(0.35, half * 0.35));
        }
        carry = Math.max(0, carry - length);
      }
    }
    raster.fill(...RAIL_TIE);
  }

  // --- the towns ----------------------------------------------------------------

  /** Which gates each town's roads come in by, from `roads.bin`. */
  let roadGates: Map<number, number[]> | null = null;
  /**
   * A town's cells as `settlements.ts` keeps them before its plan is known:
   * the square, less the outskirts given up from the edge in, keeping every
   * street a road comes in by. What a far tile draws a town as.
   */
  const townCells = new Map<number, Uint8Array>();
  function cellsOf(index: number): Uint8Array {
    const known = townCells.get(index);
    if (known !== undefined) return known;
    if (roadGates === null) {
      roadGates = new Map();
      for (const road of roads) {
        for (const [end, gate] of [[road.a, road.gateA], [road.b, road.gateB]] as const) {
          const list = roadGates.get(end);
          if (list === undefined) roadGates.set(end, [gate]);
          else list.push(gate);
        }
      }
    }
    const place = places[index]!;
    const grid = townGrid(radiusOf(place));
    const kept = new Set<number>();
    const gates = gatesOf(grid);
    for (const g of roadGates.get(index) ?? []) {
      const gate = gates[g];
      if (gate === undefined) continue;
      for (const [col, row] of gate.cells) {
        for (let c = 0; c < grid.cells; c++) kept.add(gate.outX !== 0 ? cellKey(c, row) : cellKey(col, c));
      }
    }
    const outskirts = outskirtsOf(grid, `${place.name}@${place.lat},${place.lon}`, (col, row) => kept.has(cellKey(col, row)));
    const cells = new Uint8Array(grid.cells * grid.cells);
    for (let row = 0; row < grid.cells; row++) {
      for (let col = 0; col < grid.cells; col++) {
        if (!outskirts.has(cellKey(col, row))) cells[row * grid.cells + col] = isAvenue(grid, col, row) ? 2 : 1;
      }
    }
    if (townCells.size > 4000) townCells.clear();
    townCells.set(index, cells);
    return cells;
  }

  const townUp = new THREE.Vector3();
  /** A town before its plan: its cells in its region's paving, inked round the edge. */
  function paintTownCells(view: TileView, raster: Raster, index: number): void {
    const place = places[index]!;
    const grid = townGrid(radiusOf(place));
    const cells = cellsOf(index);
    unitAt(place.lat, place.lon, townUp);
    frameAt(townUp);
    view.frame(townUp, frameAcross, frameNorth, affine);
    const n = grid.cells;
    const half = grid.pitch / 2;
    const style = groundStyleFor(regionOf(place).id);
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (cells[row * n + col] === 0) continue;
        localBox(raster, affine, cellCentre(grid, col), cellCentre(grid, row), 1, 0, half + 0.3, half + 0.3);
      }
    }
    raster.fill(...bytesOf(tone(style.walk, 0.86)));
    inkCells(raster, grid, (col, row) => cells[row * n + col] !== 0, inkWidth(view.z));
  }

  /** The ink round the cells that stand: every side whose neighbour does not. */
  function inkCells(raster: Raster, grid: ReturnType<typeof townGrid>, standing: (col: number, row: number) => boolean, width: number): void {
    const n = grid.cells;
    const half = grid.pitch / 2;
    const at = (x: number, z: number, out: { x: number; y: number }): void => {
      out.x = affine.ox + affine.xx * x + affine.zx * z;
      out.y = affine.oy + affine.xy * x + affine.zy * z;
    };
    const stands = (col: number, row: number): boolean => col >= 0 && row >= 0 && col < n && row < n && standing(col, row);
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (!stands(col, row)) continue;
        const x0 = cellCentre(grid, col) - half;
        const z0 = cellCentre(grid, row) - half;
        const x1 = x0 + grid.pitch;
        const z1 = z0 + grid.pitch;
        const side = (ax: number, az: number, bx: number, bz: number): void => {
          at(ax, az, p);
          at(bx, bz, q);
          raster.segment(p.x, p.y, q.x, q.y, width, width);
        };
        if (!stands(col, row - 1)) side(x0, z0, x1, z0);
        if (!stands(col, row + 1)) side(x0, z1, x1, z1);
        if (!stands(col - 1, row)) side(x0, z0, x0, z1);
        if (!stands(col + 1, row)) side(x1, z0, x1, z1);
      }
    }
    raster.fill(...INK);
  }

  /** A town as it stands: its floor, its streets, its buildings and its trees. */
  function* paintPlan(view: TileView, raster: Raster, plan: TownPlan): Generator<undefined, void, void> {
    const { grid, cells } = plan;
    const n = grid.cells;
    const half = grid.pitch / 2;
    view.frame(plan.up, plan.across, plan.north, affine);
    const colours = [0, plan.colours.yard, plan.colours.walk, plan.colours.land, plan.colours.plaza];
    // The floor, a colour at a time.
    for (let code = 1; code <= 4; code++) {
      let any = false;
      for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
          if (cells[row * n + col] !== code) continue;
          localBox(raster, affine, cellCentre(grid, col), cellCentre(grid, row), 1, 0, half + 0.25, half + 0.25);
          any = true;
        }
      }
      if (any) raster.fill(...bytesOf(colours[code]!));
    }
    // The streets: the avenues' whole cells and the bands between two cells,
    // each piece within a cell that is paved — the pavement first, the
    // carriageway inside it.
    const paved = (col: number, row: number): boolean => col >= 0 && row >= 0 && col < n && row < n && cells[row * n + col] !== 0;
    const pieces: [number, number, number, number][] = [];
    for (let c = 0; c < n; c++) {
      const avenue = grid.avenue[c] === 1;
      const banded = c + 1 < n && (grid.high[c] === 1 || grid.low[c + 1] === 1);
      for (let k = 0; k < n; k++) {
        // Along z at column c (a north-south street), and along x at row c.
        if (avenue) {
          if (paved(c, k)) pieces.push([cellCentre(grid, c), cellCentre(grid, k), half, half]);
          if (paved(k, c)) pieces.push([cellCentre(grid, k), cellCentre(grid, c), half, half]);
        }
        if (banded) {
          const edge = cellCentre(grid, c) + half;
          if (paved(c, k) || paved(c + 1, k)) pieces.push([edge, cellCentre(grid, k), plan.band, half]);
          if (paved(k, c) || paved(k, c + 1)) pieces.push([cellCentre(grid, k), edge, half, plan.band]);
        }
      }
    }
    for (const [x, z, hx, hz] of pieces) localBox(raster, affine, x, z, 1, 0, hx + 0.2, hz + 0.2);
    raster.fill(...bytesOf(plan.colours.walk));
    for (const [x, z, hx, hz] of pieces) {
      // The carriageway: the street less a pavement each side, across its width only.
      const across = hx < hz;
      localBox(raster, affine, x, z, 1, 0, across ? Math.max(0.5, hx - plan.walk) : hx + 0.2, across ? hz + 0.2 : Math.max(0.5, hz - plan.walk));
    }
    raster.fill(...bytesOf(plan.colours.road));
    inkCells(raster, grid, paved, inkWidth(view.z) * 0.8);
    yield;
    // The trees in the yards.
    if (view.z >= INKED_FROM && plan.trees.length > 0) {
      for (let k = 0; k < plan.trees.length; k += 3) {
        const x = plan.trees[k]!;
        const z = plan.trees[k + 1]!;
        raster.circle(affine.ox + affine.xx * x + affine.zx * z, affine.oy + affine.xy * x + affine.zy * z, Math.max(0.8, (plan.trees[k + 2]! * 0.55) / view.unitsPerPixel));
      }
      raster.fill(...YARD_TREE);
    }
    yield;
    // The buildings: each plan box in its roof's colour, inked.
    const b = plan.buildings;
    const count = b.length / 6;
    const ink = view.z >= INKED_FROM ? inkWidth(view.z) : 0.45;
    for (let k = 0; k < count; k++) {
      localCorners(affine, b[k * 6]!, b[k * 6 + 1]!, b[k * 6 + 2]!, b[k * 6 + 3]!, b[k * 6 + 4]!, b[k * 6 + 5]!);
      raster.outline(xs, ys, 4, ink);
    }
    raster.fill(...INK, view.z >= INKED_FROM ? 1 : 0.6);
    yield;
    const byRoof = new Map<number, number[]>();
    for (let k = 0; k < count; k++) {
      const roof = plan.roofs[k]!;
      const list = byRoof.get(roof);
      if (list === undefined) byRoof.set(roof, [k]);
      else list.push(k);
    }
    for (const [roof, list] of byRoof) {
      for (const k of list) localBox(raster, affine, b[k * 6]!, b[k * 6 + 1]!, b[k * 6 + 2]!, b[k * 6 + 3]!, b[k * 6 + 4]!, b[k * 6 + 5]!);
      raster.fill(...bytesOf(roof));
    }
  }

  function* paintTowns(view: TileView, raster: Raster): Generator<'wait' | undefined, void, void> {
    const indices = townsIn(view.south, view.north, view.west, view.east).filter((index) => {
      const place = places[index]!;
      view.px(place.lat, place.lon, p);
      return view.inside(p.x, p.y, radiusOf(place) / view.unitsPerPixel + 2);
    });
    if (indices.length === 0) return;
    if (view.z < RAILS_FROM) {
      // A square each, in its region's paving.
      for (const index of indices) {
        const place = places[index]!;
        view.px(place.lat, place.lon, p);
        const side = (radiusOf(place) * Math.SQRT1_2) / view.unitsPerPixel;
        raster.rect(p.x - side, p.y - side, side * 2, side * 2);
      }
      raster.fill(...bytesOf(tone(PALETTE.blush, 0.9)));
      return;
    }
    if (view.z < PLANS_FROM || sources.plans === undefined) {
      for (const index of indices) {
        paintTownCells(view, raster, index);
        yield;
      }
      return;
    }
    // The plans, waiting for those still being worked out — until the tile
    // is told to hurry, when a town still waiting is drawn as its cells.
    for (;;) {
      let waiting = 0;
      for (const index of indices) if (sources.plans(index) === undefined) waiting++;
      if (waiting === 0 || view.hurry) break;
      yield 'wait';
    }
    for (const index of indices) {
      const plan = sources.plans(index);
      if (plan === undefined) {
        view.incomplete = true;
        paintTownCells(view, raster, index);
      } else if (plan !== null) yield* paintPlan(view, raster, plan);
      yield;
    }
  }

  // --- landmarks, strips and pads -------------------------------------------------

  const landmarkUp = new THREE.Vector3();
  function paintLandmarks(view: TileView, raster: Raster): void {
    for (const landmark of sources.landmarks ?? []) {
      if (landmark.lat < view.south - 0.3 || landmark.lat > view.north + 0.3) continue;
      view.px(landmark.lat, landmark.lon, p);
      if (!view.inside(p.x, p.y, 120 / view.unitsPerPixel)) continue;
      const shape = planShape(landmark);
      unitAt(landmark.lat, landmark.lon, landmarkUp);
      frameAt(landmarkUp);
      view.frame(landmarkUp, frameAcross, frameNorth, affine);
      // The plan box, trimmed to the footprint's disc where the disc is tighter.
      const hx = Math.min(shape.hx, shape.radius);
      const hz = Math.min(shape.hz, shape.radius);
      const ink = Math.max(0.6, inkWidth(view.z));
      localCorners(affine, shape.cx, shape.cz, 1, 0, hx, hz);
      raster.outline(xs, ys, 4, ink);
      raster.fill(...INK);
      localBox(raster, affine, shape.cx, shape.cz, 1, 0, hx, hz);
      raster.fill(...LANDMARK_FILL);
      // And what stands on it, as the darker heart of the plan.
      localBox(raster, affine, shape.cx, shape.cz, 1, 0, hx * 0.62, hz * 0.62);
      raster.fill(...LANDMARK_CORE);
    }
  }

  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const centre = new THREE.Vector3();
  function tileReach(view: TileView): number {
    const midLat = (view.south + view.north) / 2;
    unitAt(midLat, (view.west + view.east) / 2, centre);
    unitAt(view.north, view.west, unit);
    return centre.angleTo(unit) * view.radius * 1.05 + 60;
  }

  function* paintStrips(view: TileView, raster: Raster): Generator<'wait' | undefined, void, void> {
    if (sources.planesNear === undefined) return;
    const reach = tileReach(view);
    if (sources.stripsReady !== undefined) {
      // A slice of the search a step; it keeps what it found between steps.
      for (;;) {
        const until = performance.now() + STRIP_SLICE_MS;
        if (sources.stripsReady(centre, reach + FIELD_SPREAD, () => performance.now() < until)) break;
        yield;
        tileReach(view);
      }
    }
    for (const site of sources.planesNear(centre, reach, [])) {
      stripCorners(site, STRIP_DRAWN / 2, corners);
      xs.length = 0;
      ys.length = 0;
      for (const corner of corners) {
        view.at(corner, p);
        xs.push(p.x);
        ys.push(p.y);
      }
      raster.outline(xs, ys, 4, Math.max(0.5, inkWidth(view.z)));
      raster.fill(...INK, 0.8);
      raster.moveTo(xs[0]!, ys[0]!);
      for (let k = 1; k < 4; k++) raster.lineTo(xs[k]!, ys[k]!);
      raster.fill(...STRIP_FILL);
    }
  }

  function* paintPads(view: TileView, raster: Raster): Generator<'wait' | undefined, void, void> {
    if (sources.pads === undefined) return;
    const reach = tileReach(view);
    const found: { at: THREE.Vector3 }[] = [];
    for (;;) {
      found.length = 0;
      if (sources.pads(centre, reach, found)) break;
      if (view.hurry) {
        view.incomplete = true;
        break;
      }
      yield 'wait';
      tileReach(view);
    }
    const r = Math.max(1.5, PAD_RADIUS / view.unitsPerPixel);
    for (const pad of found) {
      view.at(pad.at, p);
      if (!view.inside(p.x, p.y, r + 2)) continue;
      raster.circle(p.x, p.y, r + Math.max(0.6, inkWidth(view.z)));
      raster.fill(...INK);
      raster.circle(p.x, p.y, r);
      raster.fill(...PAD_FILL);
      raster.circle(p.x, p.y, r * 0.38);
      raster.fill(...PAD_MARK);
    }
  }

  return {
    stamp: `e${places.length}:${roads.length}:${sources.rails?.lines.length ?? 0}:${sources.landmarks?.length ?? 0}`,
    fromLevel: ROADS_FROM,
    *paint(view, raster) {
      yield* ready();
      if (view.z >= WOODS_FROM) yield* paintWoods(view, raster);
      if (view.z >= FIELDS_FROM) yield* paintCountry(view, raster);
      if (view.z >= STRIPS_FROM) yield* paintStrips(view, raster);
      if (view.z >= ROADS_FROM) yield* paintRoads(view, raster);
      if (view.z >= RAILS_FROM) yield* paintRails(view, raster);
      if (view.z >= TOWNS_FROM) yield* paintTowns(view, raster);
      if (view.z >= LANDMARKS_FROM) paintLandmarks(view, raster);
      if (view.z >= PADS_FROM) yield* paintPads(view, raster);
    },
  };
}

/** The latitude at a tile's pixel row. */
function latAt(view: TileView, y: number): number {
  return latOfV(Math.min(SHEET_HEIGHT, Math.max(0, view.v0 + y / view.scale)));
}

/** Value noise over `hash2`'s lattice, smoothed: a grove's shape. */
function groveNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix + 0.5, iy + 211.3);
  const b = hash2(ix + 1.5, iy + 211.3);
  const c = hash2(ix + 0.5, iy + 212.3);
  const d = hash2(ix + 1.5, iy + 212.3);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** A hash of two lattice numbers to [0, 1): Dave Hoskins' without a sine, as the land's marks use. */
export function hash2(x: number, y: number): number {
  let px = (x * 0.1031) % 1;
  let py = (y * 0.103) % 1;
  let pz = (x * 0.0973) % 1;
  if (px < 0) px += 1;
  if (py < 0) py += 1;
  if (pz < 0) pz += 1;
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += d;
  py += d;
  pz += d;
  const v = ((px + py) * pz) % 1;
  return v < 0 ? v + 1 : v;
}
