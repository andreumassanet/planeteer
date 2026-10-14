import { POLE_WIDTH } from '../../roadside.ts';
import { AVATAR_HEIGHT, SCENERY_SCALE } from '../../stature.ts';
import { PALETTE } from '../../theme.ts';
import { KINDS as VEHICLE_KINDS, PLACED_SECTION } from '../../traffic/contract.ts';
import { STOREY } from '../contract.ts';
import type { Weighted } from '../random.ts';

export const M = SCENERY_SCALE;

/** The tallest road vehicle as a town places it, in world units: the bus, 4.6 authored at `PLACED_SECTION`. */
export const TALLEST_VEHICLE = Math.max(
  ...Object.values(VEHICLE_KINDS).filter((kind) => kind.medium === 'road').map((kind) => kind.height),
) * PLACED_SECTION;

/**
 * How high over the floor under it the lowest thing hanging over a main street
 * may come: the tallest road vehicle and a quarter of a person. The two main
 * streets are a town's through road (`through.ts`), which the traffic drives, a
 * bus among it.
 */
export const OVERHEAD_CLEAR = TALLEST_VEHICLE + AVATAR_HEIGHT * 0.25;

/**
 * The same over any street but a main one: a placed car and a quarter of a
 * person. A vehicle parked under a line is cleared by its own height
 * (`OverheadSite.parked`).
 */
export const SIDE_CLEAR = VEHICLE_KINDS.car.height * PLACED_SECTION + AVATAR_HEIGHT * 0.25;

/** Where along a street a slot looks for a wall each side, in cells from its own spot, nearest first. */
export const SHIFTS = [0, 0.15, -0.15, 0.3, -0.3, 0.42, -0.42];

/**
 * What share of the slots a region's `main` and `side` chances would string
 * actually carry one. At the regions' own chances an old town strung nearly
 * every cell of its main street and a third of its side streets, and a street
 * under a canopy of pennants read as a fairground, not a town dressed for a
 * day; about two in five keeps them an event down the street, not a ceiling.
 */
export const STRING_DENSITY = 0.4;

/** What a street may put up masts for when its walls are too low: the strings and a banner, not washing or a sail. */
export const MASTED = new Set<Hang>(['pennants', 'picado', 'bulbs', 'lanterns', 'marigolds', 'banner']);

/** How far over or under an anchor the building must still be at about its depth: it is tied to something, not to an edge. */
export const WALL_ABOVE = 0.8;
/**
 * How far past the street's edge a line may be tied: a wall set back from
 * it behind a front step or a front garden, or the slope of a roof over one:
 * 5.5 m.
 */
export const ROOF_REACH = 7;
/** How far an end runs into the wall it is tied to, so no light shows between them. */
export const EMBED = 0.06;
/** The steps an anchor is looked for in, upwards from the lowest that clears. */
export const ANCHOR_STEP = 0.6;
/** How much higher than the lowest an anchor may be looked for: two storeys. */
export const ANCHOR_RANGE = 2 * STOREY;

/** Slab height of the per-variant triangle index the rays read. */
export const SLAB = 0.5;

/**
 * The most triangles one town's strings may come to, and its strings, poles
 * and wires together: the strings stop first, so a city's wires are never
 * the part that was cut.
 */
export const SPAN_CAP = 9000;
export const TRIANGLE_CAP = 13000;

/**
 * How far apart a street's poles stand, in world units: about 28 m, three
 * cells of a town's usual pitch.
 */
export const POLE_GAP = 36;
/** A town's pole, as a share of the country's `POLE_WIDTH`: slimmer in a street than on a verge. */
export const TOWN_POLE = 0.7;
/**
 * A mast's shaft, as a share of `POLE_WIDTH`: a painted iron rod about 9 cm
 * across.
 */
export const MAST_WIDTH = 0.27;
/** At most one pair of masts in this many cells of a main street. */
export const MAST_EVERY = 3;
/** How far in from the street's edge a pole's centre stands. */
export const POLE_INSET = POLE_WIDTH * 0.5 + 0.22;
/** How far the arm reaches out over the street from the pole. */
export const ARM_REACH = 0.75 * M;

export type Hang = 'pennants' | 'lanterns' | 'marigolds' | 'picado' | 'laundry' | 'sail' | 'bulbs' | 'banner';

export interface Profile {
  /** What a street strings across itself, by weight: one kind a street, so a street is one festival. */
  hangs: readonly Weighted<Hang>[];
  /** And a main street, where it differs: nobody hangs their washing over the high street. */
  mainHangs?: readonly Weighted<Hang>[];
  /** The chance a slot on the main street carries a span, and on any other street. */
  main: number;
  side: number;
  /** The chance a street carries a pole line, main street; half that on the others. */
  wires: number;
  /** Wires a pole carries. */
  lines: number;
  /** The colours a string cycles through: bright, and from the palette. */
  colours: readonly number[];
  /** Concrete poles rather than timber ones. */
  concrete?: boolean;
}

export const P = PALETTE;
export const FESTIVE = [P.red, P.gold, P.skyBlue, P.green, P.white, P.orange, P.pink];

/**
 * Per region. The European three string pennants, from wall to wall or from
 * masts down the main street and from the eaves across the side streets; the
 * Mediterranean hangs washing over its side streets; the Maghreb shades its streets with cloth; south
 * Asia strings marigolds and bright pennants between wires; east Asia hangs
 * lanterns on a line and runs its services overhead on concrete poles; Latin
 * America cuts paper; north America and Oceania hang a banner over the main
 * street and little else.
 */
export const PROFILES: Record<string, Profile> = {
  nordic: { hangs: [{ item: 'pennants', weight: 1 }], main: 1, side: 1, wires: 0, lines: 2, colours: [P.red, P.white, P.skyBlue, P.gold] },
  'atlantic-europe': { hangs: [{ item: 'pennants', weight: 1 }], main: 1, side: 1, wires: 0, lines: 2, colours: [P.red, P.white, P.skyBlue, P.gold, P.green] },
  'east-europe': { hangs: [{ item: 'pennants', weight: 1 }], main: 1, side: 1, wires: 0.15, lines: 2, colours: [P.red, P.white, P.gold, P.skyBlue] },
  mediterranean: {
    hangs: [{ item: 'laundry', weight: 5 }, { item: 'pennants', weight: 2 }],
    mainHangs: [{ item: 'pennants', weight: 1 }],
    main: 1, side: 1, wires: 0.1, lines: 2,
    colours: [P.red, P.gold, P.skyBlue, P.white, P.green, P.pink],
  },
  maghreb: {
    hangs: [{ item: 'sail', weight: 4 }, { item: 'bulbs', weight: 1 }],
    mainHangs: [{ item: 'bulbs', weight: 2 }, { item: 'sail', weight: 1 }],
    main: 0.8, side: 0.5, wires: 0.2, lines: 2,
    colours: [P.sand, P.apricot, P.cream, P.clay, P.salmon, P.gold],
  },
  'middle-east': {
    hangs: [{ item: 'bulbs', weight: 3 }, { item: 'sail', weight: 2 }, { item: 'pennants', weight: 1 }],
    main: 0.75, side: 0.4, wires: 0.35, lines: 2,
    colours: [P.gold, P.green, P.white, P.red, P.skyBlue],
  },
  'south-asia': {
    hangs: [{ item: 'marigolds', weight: 3 }, { item: 'pennants', weight: 3 }],
    main: 0.9, side: 0.55, wires: 0.8, lines: 3,
    colours: [P.orange, P.gold, P.pink, P.crimson, P.green, P.violet, P.skyBlue],
  },
  'east-asia': {
    hangs: [{ item: 'lanterns', weight: 1 }],
    main: 0.75, side: 0.35, wires: 0.9, lines: 4,
    colours: [P.red, P.crimson, P.cream],
    concrete: true,
  },
  'southeast-asia': {
    hangs: [{ item: 'pennants', weight: 2 }, { item: 'lanterns', weight: 1 }],
    main: 0.75, side: 0.45, wires: 0.8, lines: 3,
    colours: [P.red, P.gold, P.skyBlue, P.green, P.pink, P.white],
    concrete: true,
  },
  'sub-saharan': { hangs: [{ item: 'pennants', weight: 1 }], main: 0.4, side: 0.15, wires: 0.3, lines: 2, colours: FESTIVE },
  'north-america': { hangs: [{ item: 'banner', weight: 1 }], main: 0.12, side: 0, wires: 0.5, lines: 3, colours: [P.red, P.white, P.skyBlue, P.gold] },
  'latin-america': {
    hangs: [{ item: 'picado', weight: 4 }, { item: 'pennants', weight: 1 }],
    main: 0.9, side: 0.55, wires: 0.7, lines: 3,
    colours: [P.pink, P.violet, P.skyBlue, P.gold, P.orange, P.green, P.red, P.white],
  },
  oceania: { hangs: [{ item: 'banner', weight: 1 }], main: 0.08, side: 0, wires: 0.3, lines: 2, colours: [P.skyBlue, P.white, P.gold, P.green] },
  polar: { hangs: [{ item: 'pennants', weight: 1 }], main: 0.25, side: 0.1, wires: 0.2, lines: 2, colours: [P.red, P.gold, P.skyBlue, P.white] },
};

/** At most this many of a kind in one town, where fewer is the point: one banner over main street. */
export const TOWN_CAP: Partial<Record<Hang, number>> = { banner: 1 };

/**
 * Per kind: how far under its line the lowest thing hangs, and the line's
 * sag as a share of its span. The drop is in metres times `SCENERY_SCALE`.
 */
export const HANG: Record<Hang, { drop: number; sag: number; diagonal: number }> = {
  pennants: { drop: 0.62 * M, sag: 0.045, diagonal: 0.4 },
  picado: { drop: 0.68 * M, sag: 0.045, diagonal: 0.3 },
  marigolds: { drop: 0.62 * M, sag: 0.1, diagonal: 0.3 },
  lanterns: { drop: 0.72 * M, sag: 0.05, diagonal: 0 },
  bulbs: { drop: 0.3 * M, sag: 0.07, diagonal: 0.35 },
  laundry: { drop: 0.8 * M, sag: 0.035, diagonal: 0.2 },
  sail: { drop: 0, sag: 0.06, diagonal: 0 },
  banner: { drop: 1.35 * M, sag: 0.02, diagonal: 0 },
};
