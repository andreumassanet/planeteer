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
 * blot two pixels wide; from level 8 it is inked.
 */
export const WOOD_PITCH = 9;
export const CANOPY = bytesOf(tone(PALETTE.green, 0.66));
export const CANOPY_DARK = bytesOf(tone(PALETTE.darkOlive, 0.8));
/** The groves' noise lattice, in crowns. */
export const GROVE = 7;
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
/** A road while it is a symbol (under level 7): the sheet's cream, cased. */
export const ROAD_SYMBOL = bytesOf(PALETTE.cream);

export const DEG = Math.PI / 180;
