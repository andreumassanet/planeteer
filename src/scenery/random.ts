/**
 * Determinism for the scenery kit: the same world on every load, and the same
 * world after a house is added to it.
 *
 * The rule is: seed from identity, not from order. Seeding a plot from a
 * running counter reshuffles every later house when one is inserted; seeding it
 * from what it is and where it is (`seedOf('kyoto', column, row)`) keeps the
 * village stable under editing.
 *
 * The mixer below is the same construction as `terrain.ts`'s `mix`, duplicated
 * so that a hill and a house at the same coordinate draw from independent
 * streams.
 */

/** Distinct from `terrain.ts`'s seed, so relief and settlement never rhyme. */
const SEED = 0x5cee11e;

/**
 * Integer avalanche. `Math.imul` rather than `*` because the products overflow
 * 32 bits and plain multiplication would round them as doubles, losing exactly
 * the low bits this is trying to mix.
 */
function scramble(n: number): number {
  let h = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return (h ^ (h >>> 16)) | 0;
}

const unitOf = (n: number): number => (scramble(n) >>> 0) / 4294967296;

/**
 * A seed from anything nameable: ids, region names, grid coordinates, variant
 * numbers. Order of the arguments matters, their kinds do not.
 */
export function seedOf(...parts: readonly (string | number)[]): number {
  let h = SEED;
  for (const part of parts) {
    if (typeof part === 'number') {
      h = scramble(h ^ (Math.imul(part | 0, 0x9e3779b1) | 0));
    } else {
      for (let i = 0; i < part.length; i++) h = scramble(h ^ part.charCodeAt(i));
      h = scramble(h ^ part.length);
    }
  }
  return h;
}

export interface Weighted<T> {
  item: T;
  weight: number;
}

/**
 * One stream of numbers. Every draw advances the stream, so the order a part
 * asks in matters but two attributes never move together, which would make a
 * village read as a rule ("the tall houses are always the red ones").
 */
export interface Rng {
  /** The next number in [0, 1). */
  unit(): number;
  range(min: number, max: number): number;
  /** An integer in [0, count). */
  int(count: number): number;
  /** An integer in [min, max], both ends included. */
  between(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly Weighted<T>[]): T;
  chance(probability: number): boolean;
  /** `mid` scaled by 1 +/- `fraction`. The workhorse of parametric variation. */
  spread(mid: number, fraction: number): number;
  /**
   * A signed nudge in [-1, 1].
   *
   * Separate from `spread` because `spread(0, anything)` is zero — it multiplies
   * — and an offset from a centre is the other half of every placement a part
   * makes. Reaching for the wrong one puts every chimney exactly on the ridge.
   */
  jitter(): number;
  /** -1 or +1. */
  sign(): number;
  /**
   * An independent stream from the same origin.
   *
   * Forked from the *original* seed, not from the current state, so a fork taken
   * late is the same fork taken early. That is what lets one part decide its
   * roof from `rng.fork('roof')` without the decision moving when someone adds a
   * chimney above it.
   */
  fork(salt: string | number): Rng;
}

function rngOf(seed: number): Rng {
  let state = seed | 0;
  // A Weyl step through the whole 32-bit range, hashed. The step is odd, so the
  // sequence visits every state before repeating.
  const unit = (): number => {
    state = (state + 0x9e3779b9) | 0;
    return unitOf(state);
  };

  const rng: Rng = {
    unit,
    range: (min, max) => min + (max - min) * unit(),
    int: (count) => Math.min(count - 1, Math.floor(unit() * count)),
    between: (min, max) => min + Math.min(max - min, Math.floor(unit() * (max - min + 1))),
    pick(items) {
      if (items.length === 0) throw new Error('Rng.pick on an empty list');
      return items[Math.min(items.length - 1, Math.floor(unit() * items.length))]!;
    },
    weighted(items) {
      let total = 0;
      for (const entry of items) total += Math.max(0, entry.weight);
      if (!(total > 0)) throw new Error('Rng.weighted on a list with no weight in it');
      let target = unit() * total;
      for (const entry of items) {
        target -= Math.max(0, entry.weight);
        if (target <= 0) return entry.item;
      }
      return items[items.length - 1]!.item;
    },
    chance: (probability) => unit() < probability,
    spread: (mid, fraction) => mid * (1 + fraction * (unit() * 2 - 1)),
    jitter: () => unit() * 2 - 1,
    sign: () => (unit() < 0.5 ? -1 : 1),
    fork: (salt) => rngOf(seedOf(seed, salt)),
  };
  return rng;
}

/** The one way to get a stream. Seeded from identity: see the note at the top. */
export function rngFrom(...parts: readonly (string | number)[]): Rng {
  return rngOf(seedOf(...parts));
}
