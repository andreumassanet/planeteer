import type { Rng } from '../../scenery/random.ts';
import type { Alien, Nation, Species } from '../contract.ts';

export interface AlienOptions {
  /**
   * Where this one stands, if anywhere. **It reaches the wardrobe and not the
   * body**, which is the whole of the arrangement below.
   */
  nation?: Nation;
  /** 0 to 1 from the body's own ground model. More cover where it is colder. */
  warmth?: number;
  pose?: Alien['pose'];
}

/**
 * A seeded individual, and the two forks are the point of the function.
 *
 * `dress.ts` states it and measures it: *clothing is regional; appearance is
 * not*. Every kind of person lives everywhere, so a kit that handed out bodies
 * from a place table would be wrong about the world; `lookFor` draws the body
 * from `rng.fork('who')` and the wardrobe from `rng.fork('worn')`, and `fork`
 * forks from the **original** seed rather than from the current state, so
 * neither side can move the other however many draws it makes. Over 600 seeds
 * in fourteen regions that measured **600 of 600 identical people, dressed 200
 * of 200 differently.**
 *
 * The identical arrangement holds here and the check script makes the identical
 * measurement across Mars's fourteen countries. The reason it matters more on
 * an invented species than on a real one: an alien is the one place where
 * "everyone from Hellas looks like this" is the easiest possible thing to write
 * and the hardest to take back.
 *
 * **The wardrobe's colour is the nation's own map colour**, at a chance, which
 * is a rule rather than a second table — and it is the same economy
 * `GROUND_STYLES` makes when it blends every colour against what `groundColorAt`
 * already said the land is.
 */
export function alienFor(rng: Rng, species: Species, options: AlienOptions = {}): Alien {
  const who = rng.fork('who');
  const worn = rng.fork(options.nation === undefined ? 'worn' : `worn:${options.nation.id}`);
  const morph = species.morph;

  // The body. Nothing in this block may consult `options`.
  const height = who.spread(morph.height, 0.11);
  const girth = who.range(0.86, 1.18);
  const hide = who.pick(species.hides);
  const sway = who.jitter() * 0.5;
  const stoop = who.chance(0.18) ? who.range(0.05, 0.22) : 0;

  // The wardrobe. Everything in this block may.
  const warmth = options.warmth ?? 0.5;
  // Colder ground puts more on: the same lever `DressStyle.warmth` is, and it
  // *multiplies* the species' own weights rather than replacing them, so one
  // table covers a polar station and an equatorial one.
  const cold = 1 - warmth;
  const wears = species.wears.map((entry) => ({
    item: entry.item,
    weight:
      entry.weight *
      (entry.item === 'cloak' || entry.item === 'suit' ? 0.5 + 2.2 * cold : entry.item === 'none' ? 0.4 + 1.8 * warmth : 1),
  }));
  const wear = worn.weighted(wears);
  const carry = worn.weighted(species.carries);
  const trim = worn.pick(species.trims);
  const accent =
    options.nation !== undefined && worn.chance(0.45) ? options.nation.color : worn.pick(species.accents);

  return {
    height,
    girth,
    hide,
    trim,
    accent,
    wear,
    carry,
    pose: options.pose ?? worn.weighted([
      { item: 'stand' as const, weight: 4 },
      { item: 'watch' as const, weight: 3 },
      { item: 'work' as const, weight: 3 },
      { item: 'walk' as const, weight: 2 },
    ]),
    sway,
    stoop,
  };
}
