/**
 * Who a person is, and what they are wearing: two independent draws.
 *
 * Clothing is regional; appearance is not. `SKIN_TONES` is drawn uniformly
 * from the seed everywhere on the planet, and `DRESS` is drawn from the region
 * and the climate. `lookFor` draws the body and face from `rng.fork('who')`
 * and the clothes from `rng.fork('worn')`, so the same seed is the same
 * person in Oslo and in Bamako, wearing different clothes. The one place the
 * two touch is hair colour, weighted on the skin tone (`HAIR_FOR`), inside the
 * `who` fork.
 *
 * The tables are in `dress/`; this file draws a `Look` from them.
 */

import { BODY_SCALE } from '../stature.ts';
import { GREY, HAIRSTYLES, HAIR_FOR, SKIN_TONES, hairBandOf } from './dress/appearance.ts';
import { dressFor } from './dress/styles.ts';
import type { Age, Carry, Garment, Headwear, Look, Pose, Sleeves } from './people.ts';
import type { Rng, Weighted } from './random.ts';

export { SKIN_TONES } from './dress/appearance.ts';
export { DRESS, DRESS_IDS, dressFor } from './dress/styles.ts';
export type { DressStyle } from './dress/styles.ts';

/**
 * How much of a crowd is children, and it is one number for the whole planet.
 *
 * A per-region table here would be a table of birth rates, which is not
 * something this project is going to ship in order to make a street look right.
 * One in five is enough for a village to read as inhabited rather than as a
 * workforce.
 */
export const CROWD_MIX: readonly Weighted<string>[] = [
  { item: 'villager', weight: 8 },
  { item: 'child', weight: 2 },
];

// Climate

/**
 * What the weather does to a wardrobe, as multipliers on the region's own
 * weights. The region says what kind of clothes exist here; the climate says
 * how many of them are on, so one Chilean row covers the Atacama and Patagonia
 * with no second table. Nothing goes below 0.06, so a polar shirt still exists.
 */
const COLD: Partial<Record<Garment | Headwear | Sleeves, number>> = {
  coat: 3.2,
  robe: 0.35,
  dress: 0.5,
  apron: 0.6,
  poncho: 1.5,
  tunic: 0.8,
  none: 0.3,
  beanie: 3.0,
  hood: 3.2,
  scarf: 1.4,
  brim: 0.25,
  conical: 0.15,
  turban: 0.6,
  bare: 0.08,
  short: 0.4,
  long: 2.6,
};

const HOT: Partial<Record<Garment | Headwear | Sleeves, number>> = {
  coat: 0.06,
  robe: 1.5,
  tunic: 1.4,
  dress: 1.2,
  poncho: 0.7,
  beanie: 0.1,
  hood: 0.12,
  brim: 2.4,
  conical: 2.4,
  turban: 1.3,
  helmet: 0.6,
  bare: 2.8,
  short: 1.3,
  long: 0.25,
};

/**
 * The multiplier at a warmth, interpolated through 1 at the middle.
 *
 * Two straight lines rather than one, because 0.5 has to mean "no correction"
 * exactly: a single lerp from COLD to HOT would leave a temperate region
 * permanently half-way into a parka.
 */
function climate(item: string, warmth: number): number {
  const w = Math.min(1, Math.max(0, warmth));
  if (w < 0.5) {
    const cold = COLD[item as Garment] ?? 1;
    return cold + (1 - cold) * (w / 0.5);
  }
  const hot = HOT[item as Garment] ?? 1;
  return 1 + (hot - 1) * ((w - 0.5) / 0.5);
}

function weathered<T extends string>(
  list: readonly Weighted<T>[],
  warmth: number,
): Weighted<T>[] {
  return list.map((entry) => ({
    item: entry.item,
    weight: Math.max(0.02, entry.weight * climate(entry.item, warmth)),
  }));
}

// Drawing a person

export interface LookOptions {
  /**
   * `biome.ts`'s own number: 0 polar, 1 equatorial. Left out, the region's own
   * `warmth` is used — see the note on `DressStyle.warmth`.
   */
  warmth?: number;
  /** Forced, when the caller is placing a specific kind of person. */
  age?: Age;
  /** Forced. Leave it out and the load decides, which is usually what you want. */
  pose?: Pose;
}

/** Loads that only make sense in one pose, because the arms have to be there. */
const POSE_FOR_LOAD: Partial<Record<Carry, Pose>> = {
  headload: 'lift',
  basket: 'carry',
};

/** What people are doing when they are not carrying anything in particular. */
const IDLE_POSES: readonly Weighted<Pose>[] = [
  { item: 'stand', weight: 5 },
  { item: 'walk', weight: 6 },
  { item: 'stride', weight: 2 },
  { item: 'talk', weight: 3 },
  { item: 'rest', weight: 2 },
];

/**
 * One person. `who` draws the body, the face and the hair; `worn` draws
 * everything from the wardrobe. `Rng.fork` forks from the original seed rather
 * than from the current state, so adding a draw to either side cannot move the
 * other: the same eight people in two regions have the same eight faces.
 */
export function lookFor(rng: Rng, region: string, options: LookOptions = {}): Look {
  const style = dressFor(region);
  const warmth = options.warmth ?? style.warmth;

  // --- who they are: no region in this block, and there is not going to be ---
  const who = rng.fork('who');
  const age: Age =
    options.age ?? (who.chance(0.13) ? 'elder' : 'adult');
  const tone = who.int(SKIN_TONES.length);
  const skin = SKIN_TONES[tone]!;
  const hair = who.weighted(HAIRSTYLES);
  const greying = age === 'elder' ? who.chance(0.82) : who.chance(0.02);
  const hairColor = greying
    ? who.weighted(GREY)
    : who.weighted(HAIR_FOR[hairBandOf(tone)]!);
  // A beard is a facial-hair draw and belongs with the face, not with a region.
  const beard = age === 'child' ? false : who.chance(age === 'elder' ? 0.42 : 0.22);

  const heightSpread =
    age === 'child'
      ? who.range(3.7, 5.15) * BODY_SCALE
      : who.range(5.95, 7.15) * BODY_SCALE * (age === 'elder' ? 0.965 : 1);
  const girth = who.range(0.87, 1.17) * (age === 'child' ? 1.03 : 1);
  const stoop = age === 'elder' ? who.range(0.06, 0.19) : who.range(0, 0.03);
  const sway = who.jitter();

  // --- what they are wearing: region and weather, and nothing about them -----
  const worn = rng.fork('worn');
  const garment = worn.weighted(weathered(style.garments, warmth));
  const sleeves = worn.weighted(
    weathered(
      [
        { item: 'bare' as Sleeves, weight: 3 },
        { item: 'short' as Sleeves, weight: 4 },
        { item: 'long' as Sleeves, weight: 3 },
      ],
      warmth,
    ),
  );
  const headwear = worn.weighted(weathered(style.headwear, warmth));

  // A garment the same colour as the skin under it deletes the boundary between
  // the two, and at 120 units a person becomes one flesh-coloured post. Redrawn
  // rather than dodged in the table: every row would have to avoid all eight
  // tones and would end up with no pale cloth in it at all.
  let top = worn.pick(style.cloth);
  for (let tries = 0; tries < 4 && top === skin; tries++) top = worn.pick(style.cloth);
  let bottom = worn.pick(style.under);
  for (let tries = 0; tries < 4 && bottom === skin; tries++) bottom = worn.pick(style.under);
  const trim = worn.pick(style.trim);
  const accent = worn.pick(style.accent);

  // A child does not carry the water and does not lean on a staff.
  const loads =
    age === 'child'
      ? style.carried.filter((entry) => entry.item === 'none' || entry.item === 'pack')
      : style.carried;
  const carry = worn.weighted(loads.length > 0 ? loads : style.carried);

  const pose =
    options.pose ?? POSE_FOR_LOAD[carry] ?? worn.weighted(IDLE_POSES);

  return {
    height: heightSpread,
    girth,
    age,
    hair,
    beard,
    headwear,
    garment,
    sleeves,
    carry,
    pose,
    stoop,
    sway,
    skin,
    hairColor,
    top,
    // A robe is one garment: the lower body is the same cloth as the upper, and
    // saying so here is what stops `buildPerson` needing to know what a robe is.
    bottom: garment === 'robe' ? top : bottom,
    trim,
    accent,
  };
}
