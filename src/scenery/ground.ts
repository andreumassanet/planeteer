import * as THREE from 'three';
import { MOSAIC_LAND, PALETTE } from '../theme.ts';
import { rngFrom } from './random.ts';
import type { RegionId } from './regions.ts';

/**
 * What a settlement stands on: per-region ground styles, the floor's vertical
 * section (lift, terrace step, cut and kerb limits), the street section, and
 * the lattice key every town structure is indexed by.
 *
 * Node-safe, so `pnpm check` measures the town mesh against these numbers
 * rather than copies of them. Colours come from `PALETTE` only: the town mesh
 * is vertex-coloured and nothing here goes through `ctx.toon`'s check.
 */
export interface GroundStyle {
  /** How much of the ground was made rather than trodden. 0 dust, 1 stone. Drives lamp density. */
  hardness: number;

  /**
   * The carriageway, and the floor of the region's towns.
   *
   * Either pale or dark and strongly hued, never a neutral a shade off the
   * ground: in a cel-shaded scene a dark neutral band reads as a shadow.
   */
  road: number;
  /** The pavement along each side of a street, and the stone of retaining walls and steps. */
  walk: number;
  /**
   * A yard, the ground of a cell no street crosses: `land` (the ground the
   * town stands in), `earth` (that ground trodden, `trodden`) or `paved` (the
   * pavement's stone). The embankment round the town is always the land's.
   */
  yard: 'land' | 'earth' | 'paved';
  /** Whether carriageways at least `MARKED_STREET` wide carry a dashed centre line. */
  marked: boolean;
  /** The paving in front of the civic building and under a landmark. */
  plaza: number;
  /** How big a block is, in plot cells: the street lattice runs every `lanes` boundaries. */
  lanes: 2 | 3 | 4;
  /**
   * Width of the carriageway, in world units (not pitches: the person walking
   * it and the eaves either side are absolute sizes). `streetBand` caps it at
   * 0.3 of a cell either side, which binds at the nominal pitch.
   */
  street: number;
}

// ---------------------------------------------------------------------------
// The floor's vertical section: how a town's ground sits on the land
// ---------------------------------------------------------------------------

/**
 * How far above `elevationAt` the paving is laid, in world units.
 *
 * The land mesh is a piecewise-linear approximation of the relief and stands
 * over it in places, so a sheet laid at `elevationAt` disappears under the
 * mesh. The lift is sized against that error (`pnpm check` measures the share
 * of land triangles over the paving) and to make a town read as standing on a
 * made base. The player stands on the floor through `madeHeightAt`, so the
 * lift costs no wading.
 */
export const GROUND_LIFT = 3.0;

/**
 * How tall one step of a hillside town's terraces is, in world units. A street
 * that crosses one gets a ramp at `STREET_GRADE`, or a flight of `STEP_RISE`
 * steps where it has no room (`floor.ts`).
 */
export const TERRACE_STEP = 4;

/**
 * The steepest the ribbon climbs to a gate, rise over run (`rampOf` in
 * `roads.ts`): about the steepest road a car is driven up.
 */
export const RAMP_GRADE = 0.3;

/**
 * The steepest a town street's ramp across a riser may be, rise over run.
 * Steeper than `RAMP_GRADE` because a street has only the level run either
 * side of the riser to ramp in; `buildFloor` spreads most ramps gentler.
 */
export const STREET_GRADE = 0.45;

/**
 * The steepest a street ramp may be where its run is too short for
 * `STREET_GRADE`; a riser that cannot be ramped even at this keeps its stairs.
 */
export const STREET_STEEPEST = 0.6;

/**
 * How deep a town may cut one cell into the hill, in world units. Stated as a
 * depth because what shows is the wall. A steeper cell is not paved; a town
 * left with nothing falls back to a single building at its centre.
 */
export const MAX_CUT = 12;

/**
 * How far a quay's vertical face runs below `elevationAt`, in world units.
 * Below 0 because the land mesh sits under the relief about half the time.
 */
export const KERB_DROP = 0.8;

/**
 * How far out from the kerb line the edge slope meets level ground, in world
 * units: three times the lift, a gradient of 0.33. `edgeSink` in `floor.ts` is
 * solved so the slope crosses level ground exactly this far out.
 */
export const EDGE_RUN = 9;

/**
 * The widest a town's pavement is along each side of a street, in world units.
 * A narrow street keeps 0.7 of its half for the carriageway (`pavementOf`).
 */
export const SIDEWALK = 2.2;

/**
 * The pavement of a street `half` wide either side of its line. One
 * definition: the town draws it and a road carries it out from a gate
 * (`gateMouth` in `grid.ts`).
 */
export function pavementOf(half: number): number {
  return Math.min(SIDEWALK, half * 0.3);
}

/** Half the width of a painted line, in world units. */
export const LINE_HALF = 0.3;

/**
 * The period of a street's dashed line: a dash this long, then a gap. Taken
 * from the town's plane coordinates, so dashes run on across cells.
 */
export const DASH = 4;

/** How wide a street must be before it is marked: two placed hatchbacks and a little. */
export const MARKED_STREET = 7;

/** How deep a zebra crossing is, in from the mouth of a town's middle crossing, in world units. */
export const ZEBRA = 3;

/** How wide one stripe of a zebra is, and one gap, in world units. */
export const ZEBRA_STRIPE = 0.9;

/**
 * Cell and corner key on a settlement's lattice. A town is never more than a
 * few dozen cells from its centre, so ±512 is ample.
 */
export function cellKey(col: number, row: number): number {
  return (col + 512) * 1024 + (row + 512);
}

const P = PALETTE;

/**
 * Tarmac from a street colour: a blue-violet grey becomes a warm grey of the
 * same lightness (a cool grey reads purple on the warm land); an earth colour
 * is left alone. Towns' streets and the roads between them both read it.
 */
const ASPHALT_HUE = 0.09;
const asphaltHsl = { h: 0, s: 0, l: 0 };
export function asphaltOf(street: THREE.Color, into: THREE.Color): THREE.Color {
  street.getHSL(asphaltHsl);
  if (asphaltHsl.h < 0.45 || asphaltHsl.h > 0.92) return into.copy(street);
  return into.setHSL(ASPHALT_HUE, Math.min(0.1, asphaltHsl.s * 0.7), Math.min(0.66, asphaltHsl.l * 1.08));
}
const ASPHALT = asphaltOf(new THREE.Color(P.slate), new THREE.Color()).getHex();
const ASPHALT_POLAR = asphaltOf(new THREE.Color(P.steel), new THREE.Color()).getHex();

/**
 * The ground style of every region. A row's `road` must read against the land
 * round the town and the shade on it (see `GroundStyle.road`).
 */
export const GROUND_STYLES: Record<RegionId, GroundStyle> = {
  nordic: { hardness: 0.35, road: ASPHALT, walk: P.bone, yard: 'land', marked: true, plaza: P.cream, lanes: 3, street: 10.5 },
  'atlantic-europe': { hardness: 0.6, road: ASPHALT, walk: P.bone, yard: 'land', marked: true, plaza: P.cream, lanes: 3, street: 9.75 },
  'east-europe': { hardness: 0.5, road: ASPHALT, walk: P.bone, yard: 'land', marked: true, plaza: P.cream, lanes: 3, street: 9.75 },
  mediterranean: { hardness: 0.6, road: ASPHALT, walk: P.cream, yard: 'paved', marked: true, plaza: P.white, lanes: 2, street: 7.5 },
  // A medina: swept earth, the narrowest and closest lanes, dark because they are in shade.
  maghreb: { hardness: 0.4, road: P.brown, walk: P.sand, yard: 'earth', marked: false, plaza: P.cream, lanes: 2, street: 6 },
  'sub-saharan': { hardness: 0.3, road: P.brown, walk: P.sand, yard: 'earth', marked: false, plaza: P.sand, lanes: 3, street: 8.25 },
  'middle-east': { hardness: 0.45, road: P.brown, walk: P.sand, yard: 'paved', marked: false, plaza: P.cream, lanes: 2, street: 6.9 },
  'south-asia': { hardness: 0.45, road: ASPHALT, walk: P.bone, yard: 'earth', marked: true, plaza: P.cream, lanes: 3, street: 8.25 },
  'east-asia': { hardness: 0.55, road: ASPHALT, walk: P.bone, yard: 'paved', marked: true, plaza: P.cream, lanes: 3, street: 9.75 },
  'southeast-asia': { hardness: 0.3, road: P.brown, walk: P.sand, yard: 'land', marked: false, plaza: P.sand, lanes: 3, street: 8.25 },
  // Suburbs: the widest roads and a lawn in front of every house.
  'north-america': { hardness: 0.45, road: ASPHALT, walk: P.bone, yard: 'land', marked: true, plaza: P.cream, lanes: 4, street: 15 },
  'latin-america': { hardness: 0.5, road: ASPHALT, walk: P.cream, yard: 'paved', marked: true, plaza: P.white, lanes: 3, street: 9.75 },
  oceania: { hardness: 0.45, road: ASPHALT, walk: P.bone, yard: 'land', marked: true, plaza: P.cream, lanes: 4, street: 14.25 },
  // The only ground pale enough for a dark road to read as a road.
  polar: { hardness: 0.45, road: ASPHALT_POLAR, walk: P.bone, yard: 'land', marked: false, plaza: P.white, lanes: 4, street: 12 },
};

const DEFAULT_GROUND: GroundStyle = GROUND_STYLES['atlantic-europe'];

export function groundStyleFor(region: string): GroundStyle {
  return GROUND_STYLES[region as RegionId] ?? DEFAULT_GROUND;
}

// ---------------------------------------------------------------------------
// Turning the local dirt into a town's floor
// ---------------------------------------------------------------------------

const hsl = { h: 0, s: 0, l: 0 };

/** Hue of `PALETTE.brown`, which is what earth is in this palette. */
const EARTH_HUE = 0.0917;

/** Signed distance from `h` to `to` on the wheel, the short way round. */
function towards(h: number, to: number): number {
  let delta = to - h;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
}

/**
 * The same ground trodden to soil: the hue moves most of the way to brown (a
 * desaturated green reads as mown grass), while lightness and saturation stay
 * the biome's, so each region keeps its own dirt.
 */
export function trodden(base: THREE.Color, target: THREE.Color): THREE.Color {
  target.copy(base).getHSL(hsl);
  return target.setHSL(
    (hsl.h + 0.78 * towards(hsl.h, EARTH_HUE) + 1) % 1,
    hsl.s * 0.62,
    hsl.l * 0.94,
  );
}

/**
 * A cell's tone factor, drawn from the same `MOSAIC_LAND` range the land's
 * shader uses and seeded off the town and cell, so a floor has the land's
 * grain. A factor rather than a colour because one cell is drawn in several
 * pieces and colours.
 */
export function cellTone(seed: string, col: number, row: number): number {
  return rngFrom(seed, 'mosaic', col, row).range(MOSAIC_LAND[0], MOSAIC_LAND[1]);
}
