import type { Country, World } from '../../geo.ts';
import type { Place } from '../../places.ts';
import type { Body, Nation } from '../contract.ts';

/** One frontier: the smoothed line two nations share, as `[lon, lat]` points. */
export interface Frontier {
  points: number[][];
  /** The two nations either side, 1-based indices into `Geography.countries`. */
  left: number;
  right: number;
}

/**
 * A world's political map in Earth's own shapes.
 *
 * `countries[i]` is `body.nations[i]` — same order, so a 1-based `countryAt`
 * answer of `k` is nation `k - 1` — with `iso` the nation's key
 * (`keyOf(id)`, `'mars:tharsis'`), `continent` the body's name, the cap's
 * centre as its label point (its biggest town's where an enclave stands on
 * the centre) and `color` the nation's own. `places[i]` is
 * `body.settlements[i]`, with `iso` its nation's key, the biggest town of each
 * nation its capital and the town law's radius.
 */
export interface Geography {
  body: Body;
  countries: Country[];
  places: Place[];
  /** `geo.ts`'s index over `countries`, never answering 0: every point is someone's. */
  world: World;
  /** The lines between two nations, each once; what a map draws as a border. */
  frontiers: Frontier[];
  /** The nation's key: `'<body>:<nation>'`, which the flags, the stamps and the chat carry. */
  keyOf(nationId: string): string;
  /** The nation a key names, or undefined. */
  nationOf(iso: string): Nation | undefined;
  /**
   * The truth the rings were drawn from, as a 1-based index into `countries`.
   * Within about half a degree of a frontier it and `world.countryAt` may
   * differ; everywhere else they agree, and `scripts/check-system.ts` holds
   * them to it.
   */
  truthAt(lat: number, lon: number): number;
}

/**
 * One chapter of the passport: a world and every nation in it, stamped or not.
 *
 * Declared here for the worlds' side and by the same shape in `planet.ts` for
 * the book's, which cannot import this file without pulling the system into
 * Earth's first load; the two must stay structurally identical. `script`
 * writes a nation's name in the species' own glyphs and is supplied by the
 * walking engine once it has loaded, never by this file.
 */
export interface PassportChapter {
  /** The body's id: `'mars'`. */
  body: string;
  /** What the chapter is called: `'Mars'`. */
  name: string;
  /** The body's colour on its tab and its visa: its ground's `look.surface`. */
  color?: number;
  nations: { iso: string; name: string; color: number }[];
  script?: (text: string) => SVGElement;
}
