import { bytesOf } from '../raster.ts';
import { PALETTE } from '../theme.ts';
import { tone } from '../monuments/contract.ts';

/** The level each family of marks comes in at. */
export const ROADS_FROM = 5;
export const TOWNS_FROM = 5;
export const RAILS_FROM = 6;
export const STRIPS_FROM = 6;
export const LANDMARKS_FROM = 6;
export const PLANS_FROM = 7;
export const FIELDS_FROM = 7;
export const WOODS_FROM = 7;
export const PADS_FROM = 7;
export const INKED_FROM = 8;
export const PIECES_FROM = 8;
export const ROWS_FROM = 9;
/** A step's slice of a strip search, ms. */
export const STRIP_SLICE_MS = 2;
/** Roads, and a wood's crowns, filled a batch at a time, a step each. */
export const ROAD_BATCH = 24;
export const CROWN_BATCH = 200;

export const INK = bytesOf(PALETTE.ink);
/** The ink's line on a building, a field, a town's edge: pixels, by level. */
export const inkWidth = (z: number): number => (z >= 10 ? 1.1 : z >= 9 ? 0.9 : z >= 8 ? 0.7 : 0.5);

/**
 * The wood's symbol: a crown every `WOOD_PITCH` units of a lattice fixed to
 * the sheet, kept where the biome's `cover` says a wood is — the chance the
 * wood's own sites are kept by — and in its canopy's colour, the biome's
 * ground darkened, as the wood reads from the air. At level 7 a crown is a
 * blot two pixels wide; from level 8 a crown, inked once it is `INKED_CROWN` wide.
 */
export const WOOD_PITCH = 9;
/** Two colours' bytes mixed, `t` of the second. */
const mix = (a: number, b: number, t: number): [number, number, number] => {
  const x = bytesOf(a);
  const y = bytesOf(b);
  return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
};
export const CANOPY = mix(tone(PALETTE.green, 0.66), tone(PALETTE.olive, 0.6), 0.35);
/** The crown's radius, pixels, from which it is inked. */
export const INKED_CROWN = 3;
export const CANOPY_DARK = bytesOf(tone(PALETTE.darkOlive, 0.8));
/** The shade a wood throws to the south-east, and the light on its crowns' shoulders. */
export const CANOPY_SHADE = bytesOf(tone(PALETTE.darkOlive, 0.62));
export const CANOPY_LIGHT = mix(tone(PALETTE.green, 0.9), PALETTE.olive, 0.3);
/** The groves' noise lattice, in crowns. */
export const GROVE = 7;
/**
 * The shade a building throws onto its street: this many world units to the
 * south-east, held between two sizes in pixels, at this strength of ink.
 */
export const SHADE_UNITS = 1.4;
export const SHADE_MIN = 0.5;
export const SHADE_MAX = 3;
export const BUILDING_SHADE = 0.3;
/** The rings of shade round a town, pixels out and their ink, outermost first. */
export const TOWN_HALO: readonly (readonly [number, number])[] = [[3, 0.09], [1.3, 0.13]];
/** The share of a far town's square that is its darker core. */
export const TOWN_CORE = 0.5;
/** A tree in a town's yard. */
export const YARD_TREE = bytesOf(tone(PALETTE.green, 0.62));

/**
 * The countryside's pieces by part, in a colour of each — a symbol, since a
 * piece's model is only built near. Anything not named is a small dot in
 * `stone`; trees and props too small to see from above are left out.
 */
export const PIECE_COLOURS: Record<string, number | null> = {
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
  cairn: PALETTE.bone,
  bench: null,
  signpost: null,
  rocks: PALETTE.bone,
  palm: null,
  olive: null,
  tractor: null,
};
/** A countryside dwelling (a farm's house: a scenic part) and anything else unnamed. */
export const FARMHOUSE = tone(PALETTE.clay, 1.05);

/** A landmark's ground: the stone of a plaza. */
export const LANDMARK_FILL = bytesOf(PALETTE.bone);
export const LANDMARK_CORE = bytesOf(tone(PALETTE.slate, 1.1));
/** A strip's mown grass and its centre track. */
export const STRIP_FILL = bytesOf(tone(PALETTE.sand, 0.9));
export const PAD_FILL = bytesOf(PALETTE.bone);
export const PAD_MARK = bytesOf(PALETTE.red);
/** The railway: its bed, and the sleepers' dashes over it at a near zoom. */
export const RAIL_BED = bytesOf(tone(PALETTE.steel, 0.85));
export const RAIL_TIE = bytesOf(PALETTE.bone);
/** The shade a road throws, pixels to the south-east, and its strength. */
export const ROAD_SHADE_X = 0.7;
export const ROAD_SHADE_Y = 0.9;
export const ROAD_SHADE = 0.2;
/**
 * A road while it is a symbol (under `LINED_FROM`), by class (lane, road, trunk):
 * the sheet's colours, cased, and its half-width in pixels.
 */
export const ROAD_SYMBOL: readonly [number, number, number][] = [bytesOf(PALETTE.cream), bytesOf(PALETTE.white), bytesOf(PALETTE.apricot)];
export const SYMBOL_HALF: readonly number[] = [0.55, 0.7, 1.05];
/** The dashed line down a road's middle, from this level: its colour, its dash and its half-width in world units. */
export const LINED_FROM = 9;
export const CENTRE_LINE = bytesOf(PALETTE.cream);
export const CENTRE_DASH = 3;
export const CENTRE_HALF = 0.22;

export const DEG = Math.PI / 180;
