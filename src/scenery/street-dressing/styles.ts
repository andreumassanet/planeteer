import { PALETTE } from '../../theme.ts';
import type { Weighted } from '../random.ts';

export type Furniture =
  | 'cafe'
  | 'rack'
  | 'vending'
  | 'bin'
  | 'planter'
  | 'pots'
  | 'stall'
  | 'newsbox'
  | 'hydrant';

export interface DressStyle {
  /** Stripe pairs for awnings and parasols; a pair of one colour is a plain one. */
  fabrics: readonly (readonly [number, number])[];
  /** Sign boards. */
  signs: readonly number[];
  /** Signs that glow after dark, as a share of a window's byte: the neon regions. */
  signGlow: number;
  /** A projecting sign: none, a small square bracket sign, or a tall vertical board. */
  blade: 'none' | 'square' | 'tall';
  /** Chance a block's ground floor is a shop, and a two-storey house's in the centre. */
  shops: number;
  houseShops: number;
  /** Whether a house's shop hangs an awning, or only a sign: a machiya has its own eave. */
  houseAwnings: boolean;
  /** Chance an upper window gets a flower box, a baked building shutters, an upper window an air conditioner. */
  flowers: number;
  shutters: number;
  shutterColors: readonly number[];
  aircon: number;
  /** What stands on the building line, weighted. */
  furniture: readonly Weighted<Furniture>[];
  /** A parasol over a café table. */
  parasol: boolean;
  /** Guide strips along every pavement, and warning pads at every corner; else pads at the zebras only. */
  tactile: boolean;
  /** A kiosk and a street clock by the middle of a town. */
  kiosk: boolean;
  bins: readonly number[];
}

export const P = PALETTE;

export const EUROPE_FURNITURE: Weighted<Furniture>[] = [
  { item: 'cafe', weight: 2 },
  { item: 'rack', weight: 1.5 },
  { item: 'planter', weight: 2 },
  { item: 'bin', weight: 1.2 },
  { item: 'pots', weight: 1 },
];

export const BASE: DressStyle = {
  fabrics: [[P.white, P.crimson], [P.cream, P.darkOlive]],
  signs: [P.darkOlive, P.crimson, P.bark, P.cream],
  signGlow: 0,
  blade: 'square',
  shops: 0.8,
  houseShops: 0.35,
  houseAwnings: true,
  flowers: 0,
  shutters: 0,
  shutterColors: [P.darkOlive],
  aircon: 0,
  furniture: EUROPE_FURNITURE,
  parasol: false,
  tactile: false,
  kiosk: false,
  bins: [P.darkOlive, P.steel],
};

/**
 * By region (`RegionStyle.id`). Every colour is a palette entry: the town's
 * one material reads vertex colours and the kit's rule is the palette.
 */
export const STYLES: Record<string, DressStyle> = {
  nordic: {
    ...BASE,
    fabrics: [[P.white, P.steel], [P.white, P.crimson], [P.cream, P.cream]],
    flowers: 0.12,
    furniture: [
      { item: 'rack', weight: 3 },
      { item: 'planter', weight: 1.5 },
      { item: 'bin', weight: 1.2 },
      { item: 'cafe', weight: 1 },
    ],
  },
  'atlantic-europe': {
    ...BASE,
    fabrics: [[P.cream, P.darkOlive], [P.white, P.crimson], [P.cream, P.bark], [P.white, P.skyBlue]],
    flowers: 0.3,
    shutters: 0.35,
    shutterColors: [P.darkOlive, P.crimson, P.skyBlue, P.cream],
    parasol: false,
    kiosk: true,
  },
  'east-europe': {
    ...BASE,
    fabrics: [[P.cream, P.crimson], [P.white, P.darkOlive], [P.gold, P.gold]],
    flowers: 0.35,
    shutters: 0.45,
    shutterColors: [P.darkOlive, P.bark, P.brown],
    kiosk: true,
  },
  mediterranean: {
    ...BASE,
    fabrics: [[P.white, P.green], [P.white, P.crimson], [P.white, P.skyBlue], [P.cream, P.orange]],
    signs: [P.cream, P.darkOlive, P.skyBlue, P.bark],
    flowers: 0.45,
    shutters: 0.7,
    shutterColors: [P.darkOlive, P.skyBlue, P.brown, P.green],
    houseShops: 0.6,
    parasol: true,
    kiosk: true,
    furniture: [
      { item: 'cafe', weight: 3.5 },
      { item: 'pots', weight: 3 },
      { item: 'planter', weight: 1 },
      { item: 'bin', weight: 0.8 },
      { item: 'rack', weight: 0.3 },
    ],
  },
  maghreb: {
    ...BASE,
    fabrics: [[P.cream, P.clay], [P.sand, P.brown], [P.cream, P.orange], [P.skyBlue, P.cream]],
    signs: [P.skyBlue, P.cream, P.clay, P.darkOlive],
    blade: 'none',
    houseShops: 0.55,
    flowers: 0.1,
    parasol: true,
    furniture: [
      { item: 'stall', weight: 2.5 },
      { item: 'pots', weight: 2 },
      { item: 'cafe', weight: 1.2 },
    ],
    bins: [P.darkOlive],
  },
  'middle-east': {
    ...BASE,
    fabrics: [[P.cream, P.clay], [P.white, P.darkOlive], [P.sand, P.sand]],
    signs: [P.cream, P.darkOlive, P.crimson, P.skyBlue],
    blade: 'none',
    houseShops: 0.45,
    aircon: 0.35,
    furniture: [
      { item: 'stall', weight: 1.8 },
      { item: 'pots', weight: 1.2 },
      { item: 'cafe', weight: 1 },
      { item: 'bin', weight: 0.6 },
    ],
  },
  'sub-saharan': {
    ...BASE,
    fabrics: [[P.gold, P.green], [P.orange, P.cream], [P.skyBlue, P.white]],
    signs: [P.gold, P.skyBlue, P.crimson, P.green],
    blade: 'none',
    houseShops: 0.5,
    furniture: [
      { item: 'stall', weight: 3 },
      { item: 'pots', weight: 0.6 },
    ],
    bins: [P.darkOlive],
  },
  'south-asia': {
    ...BASE,
    fabrics: [[P.orange, P.gold], [P.pink, P.cream], [P.crimson, P.gold], [P.skyBlue, P.white]],
    signs: [P.gold, P.crimson, P.skyBlue, P.cream, P.green],
    signGlow: 0.5,
    blade: 'tall',
    houseShops: 0.65,
    aircon: 0.3,
    tactile: true,
    furniture: [
      { item: 'stall', weight: 3 },
      { item: 'pots', weight: 1 },
      { item: 'bin', weight: 0.4 },
    ],
    bins: [P.darkOlive, P.skyBlue],
  },
  'east-asia': {
    ...BASE,
    fabrics: [[P.skyBlue, P.white], [P.crimson, P.white], [P.darkOlive, P.darkOlive], [P.bark, P.bark]],
    signs: [P.crimson, P.white, P.gold, P.skyBlue, P.bark],
    signGlow: 0.6,
    blade: 'tall',
    houseShops: 0.6,
    houseAwnings: false,
    aircon: 0.4,
    tactile: true,
    furniture: [
      { item: 'vending', weight: 3 },
      { item: 'rack', weight: 2.5 },
      { item: 'pots', weight: 2.2 },
      { item: 'bin', weight: 0.5 },
    ],
    bins: [P.skyBlue, P.steel],
  },
  'southeast-asia': {
    ...BASE,
    fabrics: [[P.skyBlue, P.white], [P.orange, P.cream], [P.red, P.cream], [P.green, P.green]],
    signs: [P.crimson, P.gold, P.skyBlue, P.white],
    signGlow: 0.45,
    blade: 'tall',
    houseShops: 0.6,
    aircon: 0.3,
    furniture: [
      { item: 'stall', weight: 2.5 },
      { item: 'pots', weight: 2 },
      { item: 'vending', weight: 0.4 },
      { item: 'bin', weight: 0.4 },
    ],
  },
  'north-america': {
    ...BASE,
    fabrics: [[P.crimson, P.white], [P.darkOlive, P.cream], [P.bark, P.cream], [P.skyBlue, P.skyBlue]],
    signs: [P.crimson, P.cream, P.darkOlive, P.skyBlue, P.bark],
    signGlow: 0.35,
    furniture: [
      { item: 'bin', weight: 1.5 },
      { item: 'planter', weight: 1.5 },
      { item: 'newsbox', weight: 1.2 },
      { item: 'hydrant', weight: 1.4 },
      { item: 'cafe', weight: 1 },
      { item: 'rack', weight: 0.5 },
    ],
  },
  'latin-america': {
    ...BASE,
    fabrics: [[P.gold, P.crimson], [P.green, P.white], [P.orange, P.cream], [P.skyBlue, P.white], [P.pink, P.cream]],
    signs: [P.gold, P.skyBlue, P.crimson, P.green, P.cream],
    houseShops: 0.65,
    flowers: 0.25,
    shutters: 0.35,
    shutterColors: [P.crimson, P.skyBlue, P.green, P.bark],
    parasol: true,
    furniture: [
      { item: 'cafe', weight: 1.6 },
      { item: 'stall', weight: 1.6 },
      { item: 'pots', weight: 2 },
      { item: 'planter', weight: 0.8 },
    ],
  },
  oceania: {
    ...BASE,
    fabrics: [[P.darkOlive, P.cream], [P.crimson, P.white], [P.skyBlue, P.white]],
    furniture: [
      { item: 'cafe', weight: 1.6 },
      { item: 'planter', weight: 1.5 },
      { item: 'rack', weight: 1 },
      { item: 'bin', weight: 1 },
    ],
  },
  polar: {
    ...BASE,
    fabrics: [[P.crimson, P.white]],
    furniture: [
      { item: 'bin', weight: 1 },
      { item: 'planter', weight: 0.4 },
    ],
  },
};

/**
 * Post boxes in the country's own colour where it has one this palette can
 * say: red (the pillar boxes of Britain, Japan, India), yellow (Spain,
 * Germany, France), blue (the United States, Russia), green (Ireland, China).
 */
export const POST_COLOURS: Record<string, number> = {
  GBR: P.red, JPN: P.red, IND: P.red, CAN: P.red, AUS: P.red, NZL: P.red, PRT: P.red, ITA: P.red,
  NOR: P.red, DNK: P.red, BEL: P.red, POL: P.red, KOR: P.red, ZAF: P.red, MYS: P.red, SGP: P.red,
  PAK: P.red, LKA: P.red, BGD: P.red, MLT: P.red, CYP: P.gold, ARG: P.red, MEX: P.red, CHL: P.red,
  ESP: P.gold, DEU: P.gold, FRA: P.gold, CHE: P.gold, AUT: P.gold, SWE: P.gold, FIN: P.gold, GRC: P.gold,
  TUR: P.gold, BRA: P.gold, CZE: P.orange, NLD: P.orange, HUN: P.crimson, ROU: P.gold,
  USA: P.skyBlue, RUS: P.skyBlue, UKR: P.skyBlue, BLR: P.skyBlue, PHL: P.crimson,
  IRL: P.green, CHN: P.green, HKG: P.green, TWN: P.green,
};

/** The shape a country's post box has; `'post'`, a box on a post, where it is not named. */
export const POST_SHAPES: Record<string, 'pillar' | 'collection' | 'cabinet'> = {
  GBR: 'pillar', IRL: 'pillar', MLT: 'pillar', CYP: 'pillar', IND: 'pillar', PAK: 'pillar', LKA: 'pillar', BGD: 'pillar',
  MYS: 'pillar', SGP: 'pillar', HKG: 'pillar', NZL: 'pillar', ZAF: 'pillar',
  USA: 'collection', CAN: 'collection', MEX: 'collection', PHL: 'collection',
  JPN: 'cabinet', KOR: 'cabinet', CHN: 'cabinet', TWN: 'cabinet', THA: 'cabinet', VNM: 'cabinet',
};

export const FLOWERS = [P.red, P.pink, P.white, P.crimson, P.violet, P.gold, P.salmon] as const;
export const PRODUCE = [P.orange, P.red, P.green, P.gold, P.olive, P.apricot, P.crimson] as const;
