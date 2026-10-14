/**
 * One flat colour per country, taken from the country's own flag, with no two
 * touching countries alike.
 *
 * A flag is read as geometry (`country-colors/flag-shapes.ts`), never through a
 * canvas, so the answer is identical on every machine. The largest area of the
 * flag that is a colour the land can wear is the country's colour
 * (`flagColor`, `country-colors/palette.ts`). Neighbours whose colours are
 * closer than `APART` are then separated greedily, the smaller country moving
 * (`buildCountryColors`): first by small hue, lightness and chroma shifts of its
 * flag colour, then by another colour of the same flag
 * (`country-colors/nudge.ts`). Adjacency comes from the outlines' shared
 * vertices (`country-colors/adjacency.ts`); distances are OKLab
 * (`country-colors/oklab.ts`).
 */
import type { World } from './geo.ts';
import { walkNeighbours } from './country-colors/adjacency.ts';
import { APART, candidates } from './country-colors/nudge.ts';
import type { Candidate } from './country-colors/nudge.ts';
import { choices, flagColor } from './country-colors/palette.ts';
import { distance, toOklab } from './country-colors/oklab.ts';
import type { Oklab, RGB } from './country-colors/oklab.ts';

export type { Oklab, RGB } from './country-colors/oklab.ts';
export { distance, fromOklab, toOklab } from './country-colors/oklab.ts';
export type { FlagColour } from './country-colors/palette.ts';
export { flagColor, flagPalette } from './country-colors/palette.ts';

/** Each stage's share of the progress number: reading flags, walking rings, placing countries. */
const STAGE_READ = 106 / 236;
const STAGE_TOUCH = 70 / 236;

export interface CountryColorTable {
  /** The colour for a 1-based country index, or null where there is no flag. */
  color(country: number): RGB | null;
  /** How many countries were moved off their flag colour, and the worst move. */
  moved: number;
  worstNudge: number;
  /** How many took a different colour of their own flag rather than a nudge. */
  switched: number;
  /** The closest pair of touching countries that survives, in OKLab. */
  worst: { a: string; b: string; distance: number };
  /** Frontiers still inside `APART` after the walk, worst first. */
  short: { a: string; b: string; distance: number }[];
  /** Countries coloured and frontiers judged. */
  countries: number;
  pairs: number;
  /**
   * Wall clock from the first step to the last. Run to the end in one go that
   * is what the table cost; for a caller turning `buildCountryColors` a step at
   * a time it is how long it took to get round to finishing, which is a different
   * number and a much larger one — `land-flags.ts` keeps its own.
   */
  buildMs: number;
}

/** Land area, near enough: each ring's shoelace area narrowed by the cosine of its middle latitude. */
function landAreas(world: World): Float64Array {
  const area = new Float64Array(world.countries.length + 1);
  for (const ring of world.rings) {
    if (ring.water || ring.country <= 0) continue;
    let south = Infinity;
    let north = -Infinity;
    for (const p of ring.points) {
      if (p[1]! < south) south = p[1]!;
      if (p[1]! > north) north = p[1]!;
    }
    area[ring.country]! += ring.area * Math.cos((((south + north) / 2) * Math.PI) / 180);
  }
  return area;
}

/** The colours chosen so far, and how each country got its own. */
interface Placement {
  readonly chosen: Map<number, RGB>;
  readonly chosenLab: Map<number, Oklab>;
  /** Each country's own flag colour, as OKLab. */
  readonly home: Map<number, Oklab>;
  /** Which colour of its flag each country ended on, and how far off it. */
  readonly usedRank: Map<number, number>;
  readonly usedDrift: Map<number, number>;
}

/**
 * Colours one country against the neighbours that already have a colour (the
 * ones ahead of it in the order, which is what makes the walk greedy): its
 * flag colour if that clears `APART`, else the cheapest candidate that does,
 * else the one with the most room.
 */
function placeCountry(country: number, iso: string, neighbours: readonly number[], state: Placement): void {
  const against: Oklab[] = [];
  for (const other of neighbours) {
    if (other === country) continue;
    const lab = state.chosenLab.get(other);
    if (lab !== undefined) against.push(lab);
  }
  const clearance = (lab: Oklab): number => {
    let least = Infinity;
    for (const other of against) least = Math.min(least, distance(lab, other));
    return least;
  };

  const flagLab = state.home.get(country)!;
  let pick = flagColor(iso)!;
  let pickLab = flagLab;
  let rank = 0;
  let drift = 0;

  if (against.length > 0 && clearance(flagLab) < APART) {
    // A colour at a time down the flag's own palette, cheapest first within
    // each: every tint, shade and small turn of the dominant colour is tried
    // before the second colour is looked at.
    let best: Candidate | null = null;
    let bestRank = 0;
    let fallback: Candidate | null = null;
    let fallbackRank = 0;
    let fallbackRoom = clearance(flagLab);
    const depth = choices(iso).length;
    for (let r = 0; r < depth && best === null; r++) {
      for (const candidate of candidates(iso, r)) {
        const room = clearance(candidate.lab);
        if (room >= APART) {
          best = candidate;
          bestRank = r;
          break;
        }
        if (room > fallbackRoom) {
          fallbackRoom = room;
          fallback = candidate;
          fallbackRank = r;
        }
      }
    }
    const won = best ?? fallback;
    if (won !== null) {
      pick = won.rgb;
      pickLab = won.lab;
      rank = best !== null ? bestRank : fallbackRank;
      drift = won.drift;
    }
  }

  state.chosen.set(country, pick);
  state.chosenLab.set(country, pickLab);
  state.usedRank.set(country, rank);
  state.usedDrift.set(country, drift);
}

/** The frontiers still closer than `APART`, the closest surviving pair and the number judged. */
function judgeFrontiers(
  adjacency: Map<number, number[]>,
  chosenLab: Map<number, Oklab>,
  iso: (country: number) => string,
): Pick<CountryColorTable, 'short' | 'worst' | 'pairs'> {
  const short: { a: string; b: string; distance: number }[] = [];
  let worst = { a: '', b: '', distance: Infinity };
  let pairs = 0;
  for (const [country, list] of adjacency) {
    const one = chosenLab.get(country);
    if (one === undefined) continue;
    for (const other of list) {
      if (other <= country) continue;
      const two = chosenLab.get(other);
      if (two === undefined) continue;
      pairs++;
      const gap = distance(one, two);
      if (gap < APART) short.push({ a: iso(country), b: iso(other), distance: gap });
      if (gap < worst.distance) worst = { a: iso(country), b: iso(other), distance: gap };
    }
  }
  short.sort((one, two) => one.distance - two.distance);
  return { short, worst, pairs };
}

/**
 * Builds the table in steps a caller can spend against a frame budget; each
 * step yields how far along it is, 0 to 1, so a resumed generator shows the
 * number climbing and a restarted one shows it reset. Run to the end in one go
 * it suits anything that is not inside a frame.
 */
export function* buildCountryColors(world: World): Generator<number, CountryColorTable> {
  const started = Date.now();

  // `yield*` would pass the delegate's own 0-to-1 straight through; the
  // adjacency is turned by hand so its progress scales into this stage's share.
  const walk = walkNeighbours(world);
  let step = walk.next();
  while (!step.done) {
    yield step.value * STAGE_TOUCH;
    step = walk.next();
  }
  const adjacency = step.value;

  const area = landAreas(world);
  const iso = (country: number): string => world.countries[country - 1]!.iso;
  const bigFirst = (a: number, b: number): number => area[b]! - area[a]! || (iso(a) < iso(b) ? -1 : 1);

  // Reading a flag spec as geometry is the longest stage, so it yields most often.
  const order: number[] = [];
  for (let i = 1; i <= world.countries.length; i++) {
    if (flagColor(iso(i)) !== null) order.push(i);
    yield STAGE_TOUCH + (i / world.countries.length) * STAGE_READ;
  }
  // Larger countries are placed first, so a country is only ever pushed off its
  // flag by one that is being read more than it is.
  order.sort(bigFirst);

  const state: Placement = {
    chosen: new Map(),
    chosenLab: new Map(),
    home: new Map(),
    usedRank: new Map(),
    usedDrift: new Map(),
  };
  for (const country of order) state.home.set(country, toOklab(flagColor(iso(country))!));

  const placed = STAGE_TOUCH + STAGE_READ;
  for (let i = 0; i < order.length; i++) {
    placeCountry(order[i]!, iso(order[i]!), adjacency.get(order[i]!) ?? [], state);
    yield placed + ((i + 1) / order.length) * (1 - placed);
  }

  let moved = 0;
  let switched = 0;
  let worstNudge = 0;
  for (const country of order) {
    if (distance(state.chosenLab.get(country)!, state.home.get(country)!) <= 1e-9) continue;
    moved++;
    if ((state.usedRank.get(country) ?? 0) > 0) switched++;
    // Measured against the flag colour the country is a version of, not the
    // dominant one: taking the flag's blue is a different colour, not a nudge.
    worstNudge = Math.max(worstNudge, state.usedDrift.get(country) ?? 0);
  }

  return {
    color: (country) => state.chosen.get(country) ?? null,
    moved,
    worstNudge,
    switched,
    ...judgeFrontiers(adjacency, state.chosenLab, iso),
    countries: state.chosen.size,
    buildMs: Date.now() - started,
  };
}
