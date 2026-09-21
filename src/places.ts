import * as THREE from 'three';
import { DATA_URL, decodePlaces, inflate } from './pack.ts';

/**
 * The 29,545 populated places, and the one question worth asking of them:
 * **what is the nearest, and are you in it?**
 *
 * The data is `public/data/places.bin`, baked by `scripts/build-places.mjs`
 * from GeoNames `cities5000` (CC BY 4.0, credited in `README.md` and on the
 * loading card), with every row already checked to sit on land and to agree
 * with `countryAt`. It replaced Natural Earth's own populated places, which are
 * a *cartographic* file rather than a gazetteer and gave Spain 48 towns.
 *
 * The bake thins it against `radiusFor` below — a gazetteer lists one row per
 * municipality, so 60% of the raw rows had a neighbour inside their own built
 * radius — which is why 64,229 rows arrive here as 29,545 with no overlap left
 * at all.
 *
 * This file is deliberately not the settlement builder. It answers where you
 * are; what gets *built* at a place is `src/settlements.ts`, which reads the
 * same array out of here rather than parsing 29,545 rows a second time. Two
 * indexes over the same data that can drift apart is the exact shape of bug
 * this project keeps writing down.
 */
export interface Place {
  name: string;
  /** ADM0_A3, the same key the flags and the outlines use. */
  iso: string;
  lat: number;
  lon: number;
  /** Natural Earth's `POP_MAX`: the metro figure, not the municipality. */
  pop: number;
  capital?: boolean;
  /** How far the bake had to move it to get it onto land, in real km. */
  snappedKm?: number;
  /**
   * How far, in world units, to the nearest place of at least
   * `PROMINENCE_RATIO` times this one's rank, floored to a whole unit and
   * capped at `PROMINENCE_CAP`; a capital is stored at the cap. Baked by
   * `prominenceField` below, and `isShown` is the only thing that reads it.
   */
  prominence: number;
  /**
   * GeoNames' own IANA time zone for the row — `America/Edmonton` for Calgary,
   * `Europe/Moscow` for Kazan — which is what the chip's clock reads wherever
   * the nearest built town stands in the country you are standing in; see
   * `clockAt` in `timezone.ts`.
   */
  zone: string;
}

export interface Nearby {
  place: Place;
  /** Its index in `places`, so a caller can key its own state on it. */
  index: number;
  /** Great-circle distance along the surface, in world units. */
  units: number;
  /** The same distance in real Earth kilometres. */
  km: number;
  /** Where its buildings reach; see `radiusFor`. */
  radius: number;
  /** And where its name still reaches; see `labelRadiusFor`. */
  labelRadius: number;
  /** Inside the buildings. "Palma". */
  inside: boolean;
  /** Inside the name's reach, buildings or not. "near Palma". */
  near: boolean;
}

export interface Places {
  all: readonly Place[];
  /**
   * The closest place to a point, by angle on the sphere, so altitude does not
   * enter into it: from the plane you are still over somewhere.
   *
   * Never null — every point on Earth has a nearest city, even if it is 600 km
   * away. `near` is the field that says whether naming it would be a lie.
   */
  nearest(point: THREE.Vector3): Nearby;
}

const EARTH_KM = 6371;

/**
 * Radius of a settlement, in world units, from its population.
 *
 * **A city cannot be drawn at its own size and this is the compression, stated
 * once.** One unit is 0.4 km, so Tokyo's built-up area is a disc of about 125
 * units — and `SCENERY_SCALE` has already made a single house 12 units across,
 * so 125 units of Tokyo would hold about a hundred buildings. There is no scale
 * at which both the city and the house are right, exactly as there is none at
 * which both the planet and the monument are, and `build-monuments.ts` resolved
 * that the same way: keep the *ordering* and give up the ratio.
 *
 * So this is a power law fitted to two ends and nothing in between, and **both
 * ends and the exponent moved once somebody looked at the world instead of at
 * the law**. The old one was `3.97 * pop^0.1876`, clamped to [10, 100], and the
 * exponent is the whole story: 0.1876 is nearly flat, so a population range of
 * **1,258 to 1 came out as a size range of 3.8 to 1**.
 *
 * ```
 *   population      old     new
 *        5,000     19.6    12.0      the floor of `cities5000`, and of this law
 *       19,800     25.4    16.4      the median place in the file
 *      120,000     35.6    31.3      Ulm
 *      500,000     46.5    52.4
 *    2,000,000     60.4    86.3
 *    9,200,000     78.6   150.0      where the cap starts
 *   24,900,000     96.9   150.0      Shanghai
 * ```
 *
 * The user's sentence was *"se nota como si el mundo estuviera lleno de casas
 * sin fin, no parece que haya ciudades sino casas por todo"* — the world reads
 * as endless houses rather than as cities — and that is exactly what a flat law
 * builds: every settlement on the planet within a factor of two of every other,
 * so a place of five thousand and a place of half a million are the same mark.
 * The gazetteer fixed *where the names are* and did nothing about *hierarchy*.
 *
 * - **The bottom is the smallest thing that still reads as a settlement**, and
 *   that is a fact about the *houses*, not about the horizon. `settlements.ts`
 *   lays its plots on a lattice whose pitch is capped by the largest building a
 *   region can build — 11 to 13 units — so a disc of radius `r` holds
 *   `pi r^2 / pitch^2` cells: 12 units is about three cells and two or three
 *   houses, and 9 is one building and a name, which is a shed. It is *lower*
 *   than the old 19.6 because that floor **was** the median: the bottom half of
 *   `cities5000` sat between 19.6 and 25.4 units, which is the flatness stated
 *   from the other end.
 * - **The top is what one settlement may cost the streamer.** Measured on the
 *   world's largest town, Shanghai at radius 96.9: **277 plots, 32,268
 *   triangles and 13.5 ms of building**, and a town's geometry goes as its
 *   area. `TRIANGLE_BUDGET` is 380,000 and no single town should take more than
 *   a fifth of it, which is 76,000 triangles and puts the cap at
 *   `96.9 * sqrt(76000 / 32268)` = **150**. What that costs was then measured
 *   rather than predicted, and it is worse than the prediction: **Beijing is
 *   514 plots, 80,960 triangles and 43.7 ms warm; Shanghai 691 plots, 68,386
 *   triangles and 34.4 ms** — 21% of the budget for one town, and a hitch of
 *   about three frames, because `raise` builds a town atomically. Splitting a
 *   large town's build across frames is the honest next move and is not built.
 * - **The exponent is then whatever joins them.** 0.36 is nearly double the old
 *   0.1876 and it is the whole of the hierarchy.
 *
 * **What it costs, measured by replaying `build-places.mjs`'s own thinning over
 * the same 64,306 source rows before anything was re-baked.** `p90/p10` is the
 * spread across ordinary towns rather than across the clamps, `over 70` is the
 * share of places whose disc and their nearest neighbour's together cover more
 * than seven tenths of the gap between them — the measure of whether any open
 * country is left — and the last two columns are what the thinning eats:
 *
 * ```
 *                            kept   p10/med/p90   p90/p10   gap  over70  caps  >1M
 *   3.97 p^0.1876 [10,100] 24,010  20.4 25.4 37.6   1.84    73 u  57.9%    15  104
 *   0.62 p^0.35   [12,130] 26,262  13.0 18.5 37.6   2.89    65 u  44.6%    19  142
 *   0.932 p^0.30  [12,110] 29,224  12.7 17.3 31.4   2.47    60 u  44.4%    14  119
 *   0.465 p^0.36  [12,150] 29,692  12.0 15.2 30.9   2.57    56 u  42.9%    14  140
 * ```
 *
 * Two of those rows are the ones worth keeping, because both were surprises.
 *
 * **A steeper law loses *fewer* famous names, not more** — 14 capitals absorbed
 * against today's 15, and the one it gains back is Hong Kong. The intuition
 * says a bigger city eats more, and the arithmetic says the opposite: what
 * decides whether Amsterdam survives Rotterdam is the size of a *million*-person
 * city, not of a twenty-million one, and a steep law with a small coefficient is
 * **smaller** through the whole middle of the range. `0.62 p^0.35`, which grows
 * the middle instead of the top, is the row that loses Amsterdam, Bratislava and
 * Rabat.
 *
 * **And the cap is bounded by the gazetteer before it is bounded by the frame.**
 * At 200 the two biggest cities in a delta eat each other: Beijing and Tianjin
 * are 113 km apart, which is 282 units, so any cap over 141 deletes Tianjin, and
 * Guangzhou–Shenzhen goes at 131. 150 keeps both by a margin measured in a
 * couple of kilometres, and that is the same bound the triangle budget gave
 * independently.
 *
 * What it does *not* buy is free, and the re-bake is what settled the numbers:
 * **the world keeps 24% more places — 29,545 against 23,866** — because a
 * smaller village is absorbed by fewer neighbours, and the names are the one
 * incompressible thing in `places.bin`. That is **266 KB on the wire against
 * 323**, and `roads.bin` 128 against 149 with it. The 15 capitals standing
 * inside a larger neighbour are the *same fifteen* as before to one swap:
 * Hong Kong is a place again and Macau is inside it.
 *
 * **It lives here rather than in `settlements.ts` because two of them would
 * drift.** This is the ground truth for both the buildings that get placed and
 * the name the HUD is willing to print, and a chip that says "Lyon" over ground
 * with no Lyon on it is the same class of bug as two definitions of the relief.
 * Four other files read it and each is a consequence to check when it moves:
 * `build-places.mjs` thins against it, `roads.ts` reads a road's class off it,
 * `terrain.ts` refines the land mesh under it, and `lights.ts` sizes a city's
 * mark from it — and that last one clamps to `MAX_PIXELS`, so from orbit the
 * light field still flattens what this spreads.
 */
/**
 * The largest a settlement may be drawn, in world units.
 *
 * Exported because the bake's thinning has to search out to *the largest radius
 * anywhere* plus its own, and it had that written down as a literal `100` — a
 * number that was true of the old law and would silently have missed conflicts
 * under this one.
 */
export const BIGGEST_SETTLEMENT = 150;
/** And the smallest, for the same reason: it is the floor of the same law. */
export const SMALLEST_SETTLEMENT = 12;

export function radiusFor(pop: number): number {
  return Math.min(BIGGEST_SETTLEMENT, Math.max(SMALLEST_SETTLEMENT, 0.465 * pop ** 0.36));
}

/**
 * How far out the *name* still applies, as opposed to the buildings.
 *
 * These have to be two numbers and it is worth saying why, because collapsing
 * them was the obvious thing and it is wrong. `radiusFor` is where the houses
 * are, and at 1:400 a median town's houses are a 15-unit disc — a third of a
 * second's walk. A chip that only named a place while you stood
 * inside that would essentially never name one, which is the whole feature.
 *
 * A city's name has always reached further than its last house anyway: you are
 * "in Barcelona" well before the first building. So the band is an approach,
 * and it is pinned to the thing that makes naming honest — **you can see the
 * place you are being told you are near.** From the ground the fog closes at
 * about 1,000 units and a settlement is a low, wide cluster rather than a
 * tower, so it stops reading as a town well before it stops being drawn.
 *
 * The consequence to keep in mind: inside `radiusFor` the chip says *Palma*,
 * and in the band outside it says *near Palma*. The second is not a weaker
 * version of the first — it is a different and true statement, and the reason
 * the band is allowed to be generous.
 *
 * 220 is where the measurement put it. Sampling points whose nearest place is
 * inside 1,200 units — a rough stand-in for inhabited land — the share that
 * gets named at all. **It was taken against the old size law and is not
 * restated**: the built radii are smaller now, so the first row is smaller
 * still and every argument it makes is stronger.
 *
 * | approach | named |
 * |---|---|
 * | 0 (buildings only) | **1.5%** |
 * | 120 | 21% |
 * | **220** | **40%** |
 * | 320 | 54% |
 * | 500 | 69% |
 *
 * The first row is the argument for the band existing: with the built radius
 * alone the chip would name a place on one and a half percent of the land you
 * can stand on, which is a feature that does not exist. 40% is a country in the
 * countryside and a city in the places that have one, which is what a map does.
 */
/**
 * How far out the *mesh* has to stay fine under a settlement, as opposed to how
 * far its houses reach.
 *
 * **A third radius, and it exists because the size law shrank the villages out
 * from under the land mesh's refinement.** `setDetailSites` tightens the
 * triangulation's error budget inside a disc of `radius * DETAIL_MARGIN` so the
 * paving, which is laid from the exact relief, meets the mesh you can see; the
 * floor on how fine that can get is `PAD_MIN_EDGE`, `MIN_EDGE / 3` = **7.33
 * units**, and that is an absolute length. A 12-unit village is 24 units across
 * — **three of those edges** — so the refinement has nowhere to put a vertex
 * inside it, and the town lands on whatever plane the coarse triangulation
 * happened to draw.
 *
 * Measured by `pnpm check`, triangles inside a settlement disagreeing with the
 * relief by more than `GROUND_LIFT`:
 *
 * ```
 *   law                       detail radius   over lift      of     rate   land mesh
 *   3.97 p^0.1876 [10,100]    radiusFor           6,666  238,460   2.80%   1,635,240
 *   0.465 p^0.36  [12,150]    radiusFor           5,668  183,149   3.09%   1,575,218
 *   0.465 p^0.36  [12,150]    max(20, radiusFor)  4,365  197,161   2.21%   1,644,313
 *   0.465 p^0.36  [12,150]    max(25, radiusFor)  3,542  209,729   1.69%   1,725,670
 * ```
 *
 * The absolute count falls with the built ground either way — there is 20% less
 * town on the planet — and the *rate* is what moved, which is the honest sign
 * that the mesh under a small town got relatively worse rather than better. 20
 * buys back more than the law took, for **0.6% of the land mesh** and half a
 * megabyte; 25 is better again and costs 5.5% of the mesh and 4.7 MB, which is
 * the wrong side of a trade this project has already made once — see the
 * `setDetailSites` note in `terrain.ts` for the 6.2% it paid there.
 *
 * It is a floor and not a margin: `DETAIL_MARGIN` already carries the apron, and
 * multiplying it would widen the pad under Shanghai, where nothing is wrong.
 */
const DETAIL_FLOOR = 20;

export function detailRadiusFor(pop: number): number {
  return Math.max(DETAIL_FLOOR, radiusFor(pop));
}

const APPROACH = 220;

export function labelRadiusFor(pop: number): number {
  return radiusFor(pop) + APPROACH;
}

// ---------------------------------------------------------------------------
// Prominence: which of the 29,545 places is a *built* town
// ---------------------------------------------------------------------------

/**
 * A national capital ranks as a place of at least this many people.
 *
 * The one departure from population order, and it is a bound rather than a
 * preference: it is what stops Valletta losing Malta to a suburb, and the
 * sweep that chose 100,000 over 50,000 and 250,000 is written beside the bake's
 * thinning in `build-places.mjs`. It lives here because two things now rank a
 * place — the bake's footprint thinning and `prominenceField` below — and two
 * copies of the number would be two answers to "which of these is bigger".
 */
export const CAPITAL_RANK = 100_000;

export function rankOf(place: { pop: number; capital?: boolean }): number {
  return place.capital ? Math.max(place.pop, CAPITAL_RANK) : place.pop;
}

/**
 * A place is hidden when a place at least this many times its rank stands
 * within `PROMINENCE_RADIUS` of it. Baked into the field, so changing it is a
 * re-bake and not a knob; see `PROMINENCE_RADIUS` for why it is 2 and not 1.
 */
export const PROMINENCE_RATIO = 2;
/** The field's ceiling, in world units: a place with nothing bigger inside it is stored at the cap. */
export const PROMINENCE_CAP = 4000;

/**
 * How near a much bigger place has to be before this one is not built at all,
 * in world units.
 *
 * **The gazetteer is a hierarchy and the footprint thinning is not.** The bake
 * keeps every row whose disc touches no larger disc, which is what stops towns
 * interpenetrating and is nothing to do with whether they should all exist:
 * the survivors' median spacing was **57 units**, and Mallorca carried nine of
 * them — Palma, Manacor, Inca, Alcúdia, Santanyí, Capdepera, Santa Margalida,
 * Campos, Cala Millor — on an island 235 units across. The user's sentence was
 * that Mallorca should show **only Palma**, and that is a statement about
 * rank, not about overlap.
 *
 * A population threshold was the obvious lever and it is the one this project
 * already rejected once (`build-places.mjs`: cities15000 regressed eleven of
 * sixteen countries). Re-measured on the shipped file (2026-09-05): Palma-only
 * needs a floor of **50,000**, which empties Menorca, Ibiza and 3 of
 * Mongolia's 32 places and loses 49 capitals. So the rule is relative instead
 * — *hidden iff a place within R has at least k times your rank* — and the two
 * numbers were swept over the whole file, with the world count, the islands,
 * and a set of peer-city pairs read off each row:
 *
 * ```
 *   rule            shown   Mallorca            Menorca      Amsterdam+Rotterdam  Leeds/Liverpool  capitals lost
 *   k=1  R=125      8,787   Palma               Ciutadella   yes, by 20 units     both hidden      5
 *   k=1  R=150      6,980   Palma               Ciutadella   no (145 u apart)     both hidden      8
 *   k=2  R=125     11,976   Palma               both         yes                  both shown       1
 *   k=2  R=150      9,732   Palma               both         yes                  both shown       2
 *   k=2  R=200      6,649   Palma               both         yes                  both shown       4
 *   k=3  R=150     11,729   Palma               both         yes                  both shown       2
 *   k=4  R=150     13,371   Palma + Capdepera   both         yes                  both shown       1
 * ```
 *
 * **The ratio is what keeps peer cities.** Without it (k=1, pure "a bigger
 * place is near") the rule eats Leeds into Sheffield at 116 units, Liverpool
 * into Manchester at 125 and Cardiff into Bristol at 102, and Amsterdam
 * survives Rotterdam at R=125 by 20 units, which is not a margin a knob should
 * rest on. With k=2 the pairs that are *twins* stand: Amsterdam–Rotterdam are
 * 145 units apart at a rank ratio of **1.17**, so no radius hides either;
 * Ciutadella and Maó (29.2k and 29.1k) are the two ends of Menorca and both
 * stay. What k=2 does hide is the real hierarchy: Palma–Manacor is 121 units
 * at a ratio of **10.3**, Milan–Bergamo 114 at 11.3, Madrid–Toledo 170 at 37.7
 * (which R=150 leaves standing, and R=200 would not).
 *
 * 150 rather than 125 because 125 sits four units from Palma–Manacor's 121,
 * and rather than 200 because at 200 the Netherlands is 8 places and Java 14.
 * At k=2, R=150 the world keeps **9,732 of 29,545** places and 67.7% of the
 * built area; the survivors' nearest-neighbour spacing goes from p10/median/p90
 * of 34/57/129 to **74/160/249**, the top population decile keeps 90% and the
 * bottom 12%, and every hidden place stands inside its hider's label band —
 * trivially, since 150 is under `APPROACH` — so the chip in hidden Manacor says
 * *near Palma*, which is true (see `indexPlaces` for the two places on the
 * planet where the hider is itself hidden and the chip falls back to the
 * country). The named cost: Tel Aviv hides behind Jerusalem
 * (135 units, 2.2x), Leicester behind Birmingham, Bergamo behind Milan.
 *
 * A capital is never hidden — the bake's own precedent, and it costs two
 * places (Bratislava, 138 units from Vienna at 4.5x, and Kuwait City, which
 * GeoNames gives a 60k municipal figure).
 *
 * It is a runtime knob and not a bake because the *field* is what is baked:
 * `prominence` is the distance to the nearest place at `PROMINENCE_RATIO`
 * times the rank, so any radius up to `PROMINENCE_CAP` is one comparison per
 * place. `atlas.prominence(r)` moves it live and every streamer rescans. It
 * does not scale with `atlas.detail()`: how far the world is built is a budget,
 * and which towns exist is not.
 */
export const PROMINENCE_RADIUS = 150;

let radius = PROMINENCE_RADIUS;
/** Bumped on every change, so a streamer can notice at the top of `update`; see `detailVersion` in `view.ts`. */
let version = 0;

export const prominenceRadius = (): number => radius;
export const prominenceVersion = (): number => version;

export function setProminenceRadius(value: number): number {
  const next = Math.min(PROMINENCE_CAP, Math.max(0, Number.isFinite(value) ? value : PROMINENCE_RADIUS));
  if (next === radius) return radius;
  radius = next;
  version++;
  return radius;
}

/**
 * Whether anything is built at a place. The one definition: the settlements,
 * the vegetation's keepouts, the herds, the menu's pins and the chip all ask
 * this and nothing else.
 *
 * The capital clause is belt and braces — the bake stores a capital at the cap,
 * so the comparison alone would keep it — and it is here so that the promise
 * does not depend on a bake having been run.
 */
export function isShown(place: Place): boolean {
  return place.capital === true || place.prominence >= radius;
}

/**
 * The field, computed once by the bake and once more by `pnpm check`.
 *
 * For every place, the great-circle distance to the nearest place whose rank is
 * at least `PROMINENCE_RATIO` times its own, searched on the bake's own
 * half-degree grid in doubling squares: everything inside X units lies inside
 * the square scanned for X, so the first square that finds anything holds the
 * true nearest. Floored, not rounded, so that `prominence < R` is exactly
 * "a hider is nearer than R" at whole-unit radii. Capped at `PROMINENCE_CAP`,
 * which 266 places reach on the shipped file (2026-09-05; p10 46, median 102,
 * p90 359); a capital is stored at the cap without searching. 86 ms in the
 * bake over 29,545 rows.
 *
 * Shared between the writer and the check for the reason `proximityGraph` is:
 * a field the check recomputed with its own copy of the search would be a
 * second definition of what "prominent" means.
 */
export function prominenceField(
  places: readonly { lat: number; lon: number; pop: number; capital?: boolean }[],
  planetRadius: number,
): Uint16Array {
  const n = places.length;
  const DEG = Math.PI / 180;
  const CELL = 0.5;
  const COLS = Math.round(360 / CELL);
  const ROWS = Math.round(180 / CELL);
  const ux = new Float64Array(n);
  const uy = new Float64Array(n);
  const uz = new Float64Array(n);
  const rank = new Float64Array(n);
  const buckets: (number[] | undefined)[] = new Array(ROWS * COLS);
  for (let i = 0; i < n; i++) {
    const place = places[i]!;
    const cos = Math.cos(place.lat * DEG);
    ux[i] = cos * Math.cos(place.lon * DEG);
    uy[i] = Math.sin(place.lat * DEG);
    uz[i] = -cos * Math.sin(place.lon * DEG);
    rank[i] = rankOf(place);
    const row = Math.min(ROWS - 1, Math.floor((place.lat + 90) / CELL));
    const col = (((Math.floor((place.lon + 180) / CELL) % COLS) + COLS) % COLS);
    (buckets[row * COLS + col] ??= []).push(i);
  }
  // The radius is a parameter for the reason `indexPlaces` takes one: this
  // file does not import `globe.ts`, and a literal here would be a second
  // definition of `PLANET_RADIUS`.
  const PLANET = planetRadius;
  const unitsPerCell = CELL * DEG * PLANET;

  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    if (places[i]!.capital) {
      out[i] = PROMINENCE_CAP;
      continue;
    }
    const want = PROMINENCE_RATIO * rank[i]!;
    const lat = places[i]!.lat;
    const row = Math.min(ROWS - 1, Math.floor((lat + 90) / CELL));
    const col = (((Math.floor((places[i]!.lon + 180) / CELL) % COLS) + COLS) % COLS);
    let best = PROMINENCE_CAP;
    for (let reach = unitsPerCell; ; reach = Math.min(PROMINENCE_CAP, reach * 2)) {
      const dRows = Math.ceil(reach / unitsPerCell);
      // The span is taken at the poleward edge of the square, not at the place,
      // so a wide search at high latitude does not under-cover its top rows.
      const edge = Math.cos(Math.min(89, Math.abs(lat) + dRows * CELL) * DEG);
      const span = Math.min(COLS >> 1, Math.ceil(dRows / Math.max(0.02, edge)));
      // The chord that corresponds to `reach` along the surface; compared
      // squared, so the loop costs no trigonometry per candidate.
      const chordLimit = 2 * Math.sin(Math.min(Math.PI, reach / PLANET) / 2);
      let bestChord = chordLimit;
      for (let dr = -dRows; dr <= dRows; dr++) {
        const r = row + dr;
        if (r < 0 || r >= ROWS) continue;
        for (let dc = -span; dc <= span; dc++) {
          const bucket = buckets[r * COLS + (((col + dc) % COLS) + COLS) % COLS];
          if (bucket === undefined) continue;
          for (const j of bucket) {
            if (j === i || rank[j]! < want) continue;
            const dx = ux[i]! - ux[j]!;
            const dy = uy[i]! - uy[j]!;
            const dz = uz[i]! - uz[j]!;
            const chord = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (chord < bestChord) bestChord = chord;
          }
        }
      }
      if (bestChord < chordLimit) {
        best = Math.min(PROMINENCE_CAP, Math.floor(2 * PLANET * Math.asin(Math.min(1, bestChord / 2))));
        break;
      }
      if (reach >= PROMINENCE_CAP) break;
    }
    out[i] = best;
  }
  return out;
}

export async function loadPlaces(
  radius: number,
  url = `${DATA_URL}places.bin`,
): Promise<Places> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return indexPlaces(decodePlaces(await inflate(await response.arrayBuffer())), radius);
}

/**
 * Builds the index. Separate from the fetch so `check-world.ts` can hand it an
 * array off disk without pretending to be a browser.
 *
 * There is no spatial grid here, and that is a measurement rather than an
 * omission: the whole set is one flat `Float32Array` of unit vectors, and the
 * nearest is the largest dot product. 29,545 rows is 89,000 multiply-adds,
 * which `pnpm check` measures at about 20 microseconds — a hundredth of a
 * 60 fps frame, for a question the HUD asks once. It was 5 us over Natural
 * Earth's 7,320; a grid becomes worth its second structure somewhere well past this. A grid would be faster and would also be a second
 * structure to keep in step with the array, for no budget that is under threat.
 */
export function indexPlaces(all: readonly Place[], radius: number): Places {
  const DEG = Math.PI / 180;
  const unit = new Float64Array(all.length * 3);
  const claim = new Float64Array(all.length);
  const label = new Float64Array(all.length);
  for (let i = 0; i < all.length; i++) {
    const place = all[i]!;
    const cos = Math.cos(place.lat * DEG);
    unit[i * 3] = cos * Math.cos(place.lon * DEG);
    unit[i * 3 + 1] = Math.sin(place.lat * DEG);
    // Negative, like every other conversion in the project. A `+` here puts
    // east where west belongs; see the mirrored-planet trap in CLAUDE.md.
    unit[i * 3 + 2] = -cos * Math.sin(place.lon * DEG);
    claim[i] = radiusFor(place.pop);
    label[i] = labelRadiusFor(place.pop);
  }

  /**
   * The built rows, packed, rebuilt when the radius moves.
   *
   * **A hidden place is never the nearest.** Nothing is built there, so a chip
   * saying *Manacor* over an empty field would be the "Lyon over ground with no
   * Lyon on it" bug that `radiusFor` lives here to prevent; skipping it makes
   * the chip say *near Palma*, which is true. Every hidden place is inside its
   * *hider's* label band (`PROMINENCE_RADIUS` is under `APPROACH`), and the
   * hider may itself be hidden, so the nearest built town can be further:
   * measured (2026-09-05), 19,809 of the 19,811 hidden places are inside a
   * built place's name and the two that are not — Kara-Kulja, Fort Irwin — read
   * as their country, which is the honest sentence there. The rows stay in
   * `all` because `roads.bin` indexes them; the scan runs over this packed copy
   * so that hiding two thirds of the file makes the query faster, not slower.
   */
  const builtUnit = new Float64Array(all.length * 3);
  const builtIndex = new Int32Array(all.length);
  let builtCount = 0;
  let builtFor = -1;
  const refresh = (): void => {
    if (builtFor === prominenceVersion()) return;
    builtCount = 0;
    for (let i = 0; i < all.length; i++) {
      if (!isShown(all[i]!)) continue;
      builtUnit[builtCount * 3] = unit[i * 3]!;
      builtUnit[builtCount * 3 + 1] = unit[i * 3 + 1]!;
      builtUnit[builtCount * 3 + 2] = unit[i * 3 + 2]!;
      builtIndex[builtCount] = i;
      builtCount++;
    }
    builtFor = prominenceVersion();
  };

  const direction = new THREE.Vector3();

  return {
    all,
    nearest(point) {
      refresh();
      direction.copy(point).normalize();
      const { x, y, z } = direction;
      let best = -2;
      let found = 0;
      for (let k = 0; k < builtCount; k++) {
        const dot = x * builtUnit[k * 3]! + y * builtUnit[k * 3 + 1]! + z * builtUnit[k * 3 + 2]!;
        if (dot > best) {
          best = dot;
          found = builtIndex[k]!;
        }
      }
      // Along the surface, not through the planet: at 600 units apart the chord
      // and the arc differ by a millimetre, but at a quarter of the way round
      // the world they differ by a fifth, and the HUD prints this number.
      const angle = Math.acos(Math.min(1, Math.max(-1, best)));
      const units = angle * radius;
      return {
        place: all[found]!,
        index: found,
        units,
        km: angle * EARTH_KM,
        radius: claim[found]!,
        labelRadius: label[found]!,
        inside: units <= claim[found]!,
        near: units <= label[found]!,
      };
    },
  };
}
