/**
 * How a harbour looks by region: its stone, its timber, its sheds' walls and
 * roofs, the colours its boats are painted. Palette entries only.
 */
import { PALETTE } from '../theme.ts';
import type { RegionId } from '../scenery/regions.ts';

export interface HarbourStyle {
  /** The quay's dressed stone, its coping, and the breakwater's armour. */
  stone: number;
  coping: number;
  rock: number;
  /** The piers' planks and their piles. */
  timber: number;
  piles: number;
  /** A shed's walls, its trim and door, and its roof. */
  walls: readonly number[];
  trim: number;
  roof: number;
  /** A roof of thatch on a stilt hut, a curved tiled one, or a pitched one. */
  roofForm: 'pitched' | 'flat' | 'thatch' | 'curved';
  /** The hulls, and a stripe or a trim along them. */
  hulls: readonly number[];
  stripes: readonly number[];
  /** Paper lanterns strung along a quay. */
  lanterns: boolean;
}

const P = PALETTE;

const ATLANTIC: HarbourStyle = {
  stone: P.tan, coping: P.bone, rock: P.slate, timber: P.brown, piles: P.bark,
  walls: [P.cream, P.tan, P.white], trim: P.skyBlue, roof: P.slate, roofForm: 'pitched',
  hulls: [P.white, P.skyBlue, P.red, P.green, P.cream], stripes: [P.red, P.skyBlue, P.gold, P.white], lanterns: false,
};

const STYLES: Partial<Record<RegionId, HarbourStyle>> = {
  mediterranean: {
    stone: P.sand, coping: P.cream, rock: P.bone, timber: P.tan, piles: P.brown,
    walls: [P.white, P.cream], trim: P.skyBlue, roof: P.clay, roofForm: 'pitched',
    hulls: [P.white, P.skyBlue, P.white, P.apricot], stripes: [P.skyBlue, P.red, P.green, P.gold], lanterns: false,
  },
  maghreb: {
    stone: P.sand, coping: P.cream, rock: P.tan, timber: P.tan, piles: P.brown,
    walls: [P.white, P.cream], trim: P.skyBlue, roof: P.white, roofForm: 'flat',
    hulls: [P.skyBlue, P.white, P.green], stripes: [P.white, P.red, P.gold], lanterns: false,
  },
  'middle-east': {
    stone: P.sand, coping: P.cream, rock: P.tan, timber: P.brown, piles: P.bark,
    walls: [P.sand, P.cream], trim: P.green, roof: P.sand, roofForm: 'flat',
    hulls: [P.white, P.brown, P.skyBlue], stripes: [P.green, P.red, P.gold], lanterns: false,
  },
  nordic: {
    stone: P.slate, coping: P.bone, rock: P.slate, timber: P.bark, piles: P.bark,
    walls: [P.red, P.crimson, P.red], trim: P.white, roof: P.steel, roofForm: 'pitched',
    hulls: [P.white, P.red, P.green, P.skyBlue], stripes: [P.red, P.white, P.skyBlue], lanterns: false,
  },
  polar: {
    stone: P.slate, coping: P.bone, rock: P.slate, timber: P.bark, piles: P.bark,
    walls: [P.red, P.gold, P.skyBlue], trim: P.white, roof: P.steel, roofForm: 'pitched',
    hulls: [P.red, P.white], stripes: [P.white, P.red], lanterns: false,
  },
  'east-europe': { ...ATLANTIC, walls: [P.cream, P.gold, P.white], roof: P.clay },
  'north-america': {
    ...ATLANTIC, timber: P.tan, walls: [P.tan, P.white, P.red, P.skyBlue], trim: P.white, roof: P.steel,
    hulls: [P.white, P.red, P.green, P.skyBlue, P.gold],
  },
  'east-asia': {
    stone: P.bone, coping: P.tan, rock: P.slate, timber: P.bark, piles: P.bark,
    walls: [P.brown, P.tan, P.cream], trim: P.crimson, roof: P.slate, roofForm: 'curved',
    hulls: [P.brown, P.skyBlue, P.white, P.tan], stripes: [P.crimson, P.white, P.skyBlue], lanterns: true,
  },
  'southeast-asia': {
    stone: P.tan, coping: P.bone, rock: P.bark, timber: P.tan, piles: P.brown,
    walls: [P.tan, P.brown, P.sand], trim: P.green, roof: P.sand, roofForm: 'thatch',
    hulls: [P.skyBlue, P.green, P.apricot, P.pink, P.white], stripes: [P.red, P.gold, P.white, P.skyBlue], lanterns: false,
  },
  oceania: {
    stone: P.tan, coping: P.bone, rock: P.bark, timber: P.tan, piles: P.brown,
    walls: [P.white, P.skyBlue, P.tan], trim: P.white, roof: P.steel, roofForm: 'pitched',
    hulls: [P.white, P.skyBlue, P.gold, P.green], stripes: [P.skyBlue, P.red, P.white], lanterns: false,
  },
  'south-asia': {
    stone: P.sand, coping: P.cream, rock: P.tan, timber: P.brown, piles: P.bark,
    walls: [P.apricot, P.skyBlue, P.pink], trim: P.white, roof: P.clay, roofForm: 'flat',
    hulls: [P.brown, P.skyBlue, P.green, P.apricot], stripes: [P.red, P.gold, P.white], lanterns: false,
  },
  'sub-saharan': {
    stone: P.clay, coping: P.sand, rock: P.bark, timber: P.brown, piles: P.bark,
    walls: [P.sand, P.clay, P.apricot], trim: P.skyBlue, roof: P.sand, roofForm: 'thatch',
    hulls: [P.skyBlue, P.green, P.gold, P.red, P.white], stripes: [P.gold, P.red, P.green], lanterns: false,
  },
  'latin-america': {
    stone: P.sand, coping: P.cream, rock: P.tan, timber: P.brown, piles: P.bark,
    walls: [P.apricot, P.skyBlue, P.pink, P.gold], trim: P.white, roof: P.clay, roofForm: 'pitched',
    hulls: [P.skyBlue, P.green, P.white, P.red, P.gold], stripes: [P.white, P.red, P.gold], lanterns: false,
  },
};

export function harbourStyle(region: RegionId): HarbourStyle {
  return STYLES[region] ?? ATLANTIC;
}
