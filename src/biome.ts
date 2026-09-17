import { PALETTE } from './theme.ts';
import { fbm, oceanDistance, MAX_RELIEF } from './terrain.ts';

/**
 * What the ground *is*, as opposed to whose it is.
 *
 * **The land used to be coloured by country and that is why the world felt
 * uniform.** `paletteFor` in `globe.ts` gave every ring one flat colour off a
 * continent table, so the whole of Spain was one green, the whole of Algeria one
 * clay, and walking two hundred kilometres changed nothing you could see. A
 * political map is a fine thing to look at from orbit and it is the wrong thing
 * to stand on.
 *
 * So this file is the second half of the pair `terrain.ts` started: `reliefAt`
 * says how high the ground is, `biomeAt` says what it is made of. Both are pure
 * functions of a point, both are the ONE definition of what they answer, and
 * everything downstream reads them rather than deciding for itself — the land
 * mesh takes its colour from here, the vegetation takes its density and its
 * species from here, and a settlement takes the colour of its own dirt from
 * here. Two of those disagreeing is a forest of pines on a sand dune.
 *
 * The model is the schoolbook one — temperature against moisture — because it
 * is the smallest one that produces the Sahara, the Amazon, the taiga and the
 * steppe from three lines of arithmetic and no data file. What it costs is the
 * cases those three lines cannot know: see `Known misses` below.
 */

const DEG = Math.PI / 180;

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * How much of the temperature range the full height of the relief spends.
 *
 * The planet is 1:400 and the relief is compressed with it: `MAX_RELIEF` is 680
 * units, which is 272 km if you take the scale literally and obviously is not.
 * What it *stands for* is about 8 km of real mountain, so the honest conversion
 * is a ratio and not a distance — the top of the tallest range gives up as much
 * warmth as 8 km of real air does, which at 6.5 degrees a kilometre is around
 * 52 degrees and is most of the way from the equator to the pole. That is why
 * Kilimanjaro has a white top three degrees off the equator.
 */
const LAPSE = 0.78;

/** Degrees from the shore at which a place counts as fully continental. */
const INTERIOR = 14;

/** Biomes, in the order the classifier reaches for them. */
export type BiomeId =
  | 'ice'
  | 'tundra'
  | 'boreal'
  | 'temperate'
  | 'grassland'
  | 'steppe'
  | 'savanna'
  | 'desert'
  | 'tropical'
  | 'rock';

export interface Biome {
  id: BiomeId;
  /** The ground itself, before any country tint. */
  color: number;
  /**
   * How much grows here, 0 to 1.
   *
   * Read by the vegetation scatter as a *probability per plot*, not as a
   * spacing: a desert with 0.04 is not a forest with wider gaps, it is a desert
   * with the occasional thing alive in it.
   */
  cover: number;
  /**
   * How thick the grass under your feet is, 0 to 1: the share of the sward's
   * sites that grow a clump (`vegetation.ts`). A second number and not `cover`,
   * because they are two questions — the taiga is 0.72 of trees on a thin floor
   * of moss, and a grassland is 0.22 of trees in grass to the knee.
   */
  sward: number;
  /**
   * The scenic parts that belong here, most likely first. Ids from
   * `src/scenery/parts/`; an id that does not exist is skipped, so this table
   * may name a plant before anyone has built it.
   *
   * **Order is load-bearing.** `vegetation.ts` reads the list with geometric
   * weights — 1, 0.45, 0.20, 0.09 — so the first entry is most of what you see
   * and the fourth is the one you notice once an hour. Reordering a list is a
   * change to what a biome looks like, not a tidy-up.
   *
   * The list is per *biome* and not per region, which is a deliberate limit and
   * a wrong one in at least one place: a saguaro is American and this table
   * will put one in the Sahara. Gating a species by region is `regions.ts`'s
   * job, not this file's — biome says what grows, region says whose it is —
   * and nothing does it yet.
   */
  plants: readonly string[];
}

/**
 * The table.
 *
 * Colours come out of `PALETTE` and nowhere else — the 24 from folio-2025 that
 * the whole world is painted with. Picking a "realistic" sand or a "realistic"
 * green off a colour wheel is the fastest way to make one mesh look like it
 * came from a different project, which is the exact problem the palette was
 * adopted to solve.
 */
export const BIOMES: Record<BiomeId, Biome> = {
  ice: { id: 'ice', color: PALETTE.white, cover: 0, sward: 0, plants: [] },
  tundra: { id: 'tundra', color: PALETTE.bone, cover: 0.12, sward: 0.35, plants: ['shrub', 'boulder', 'grass-tuft'] },
  boreal: { id: 'boreal', color: PALETTE.darkOlive, cover: 0.72, sward: 0.5, plants: ['conifer-tree', 'shrub', 'broadleaf-tree', 'boulder'] },
  temperate: { id: 'temperate', color: PALETTE.green, cover: 0.5, sward: 1, plants: ['broadleaf-tree', 'conifer-tree', 'shrub', 'grass-tuft'] },
  grassland: { id: 'grassland', color: PALETTE.olive, cover: 0.22, sward: 1, plants: ['grass-tuft', 'shrub', 'broadleaf-tree'] },
  steppe: { id: 'steppe', color: PALETTE.tan, cover: 0.14, sward: 0.55, plants: ['grass-tuft', 'shrub', 'boulder'] },
  savanna: { id: 'savanna', color: PALETTE.gold, cover: 0.2, sward: 0.7, plants: ['acacia-tree', 'grass-tuft', 'shrub', 'broadleaf-tree'] },
  desert: { id: 'desert', color: PALETTE.sand, cover: 0.03, sward: 0, plants: ['boulder', 'palm-tree', 'cactus'] },
  tropical: { id: 'tropical', color: PALETTE.green, cover: 0.9, sward: 0.6, plants: ['palm-tree', 'broadleaf-tree', 'shrub'] },
  rock: { id: 'rock', color: PALETTE.slate, cover: 0.05, sward: 0.12, plants: ['boulder', 'conifer-tree'] },
};

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];

export interface BiomeSample {
  id: BiomeId;
  /** 0 polar, 1 equatorial, after the height has been taken off it. */
  warmth: number;
  /** 0 desert, 1 rainforest. */
  moisture: number;
  /** How far above the shelf this point is, in world units. Passed straight through. */
  elevation: number;
}

/**
 * Moisture by latitude alone: the Hadley cells, as a table.
 *
 * Wet on the equator where the air rises, dry at the horse latitudes where it
 * comes back down, wet again at the polar front, dry at the poles because cold
 * air holds nothing. That one term is most of the world's deserts — the Sahara,
 * Arabia, the Kalahari, the Australian interior, northern Mexico and the
 * Atacama all sit in the same two bands, which is not a coincidence and is why
 * a lookup this crude gets this far.
 *
 * A table of knots rather than a cosine because the real curve is not
 * symmetric about its trough: the dry belt is narrow and deep and the wet belt
 * either side of it is broad and shallow, and a cosine fitted to the trough
 * puts the Sahel in Ireland's rainfall.
 */
const MOISTURE_KNOTS: readonly [number, number][] = [
  [0, 0.95],
  [8, 0.80],
  [16, 0.34],
  [24, 0.10],
  [32, 0.34],
  [42, 0.62],
  [55, 0.80],
  [68, 0.65],
  [90, 0.40],
];

function zonalMoisture(lat: number): number {
  const a = Math.abs(lat);
  for (let i = 1; i < MOISTURE_KNOTS.length; i++) {
    const [x1, y1] = MOISTURE_KNOTS[i]!;
    if (a <= x1) {
      const [x0, y0] = MOISTURE_KNOTS[i - 1]!;
      return y0 + ((y1 - y0) * (a - x0)) / (x1 - x0);
    }
  }
  return MOISTURE_KNOTS[MOISTURE_KNOTS.length - 1]![1];
}

/**
 * Mean temperature falls roughly linearly with latitude, not as a cosine.
 *
 * This was `cos(lat) ** 0.8` first, and it put Finland and central Siberia in
 * the same band as France: the cosine is still 0.45 at 63 degrees where the
 * real mean annual temperature has gone from +27 to about -10. The straight
 * line through those two ends — 27 degrees at the equator, six tenths of a
 * degree lost per degree of latitude — reproduces the taiga, the tundra and the
 * treeline within a few degrees each, which no amount of tuning the exponent
 * did.
 */
const WARMTH_PER_DEGREE = 1 / 86.7;

/**
 * The classifier.
 *
 * `elevation` is the relief above the shelf in world units — what `reliefAt`
 * returns, not the radius. `prepareTerrain` has to have run, because the
 * continentality term reads the coast field.
 *
 * It fills `target` rather than returning a new object: the land mesh calls this
 * once per triangle, which is 770,000 times in a single build, and an allocation
 * there is a garbage collection in the middle of the loading screen.
 */
export function biomeAt(
  x: number,
  y: number,
  z: number,
  lat: number,
  lon: number,
  elevation: number,
  target: BiomeSample,
): BiomeSample {
  // Cooler towards the poles and cooler with height, and the second term is the
  // one that puts snow on a mountain in the tropics.
  const warmth = clamp(
    1 - Math.abs(lat) * WARMTH_PER_DEGREE - (elevation / MAX_RELIEF) * LAPSE,
    0,
    1,
  );

  // Three terms, and the noise is the smallest of them on purpose: it is there
  // so that a biome boundary is a ragged line rather than a latitude, not so
  // that the map is a surprise.
  //
  // Continentality is damped near the equator, which is not a fudge: the ITCZ
  // rains on the tropics wherever they are, so the middle of the Amazon is not
  // dry the way the middle of Asia is. Without the damping the rainforest came
  // out as savanna for the same reason the Gobi is a desert.
  //
  // And it is damped again by cold, which is the other half of the same
  // correction: what a place needs is not rainfall but rainfall against
  // evaporation. Central Siberia gets less rain than Madrid and is covered in
  // forest, so a model that reads the interior of a continent as dry without
  // asking how cold it is turns the taiga into a prairie — which is exactly
  // what this did before the term went in.
  const tropicness = 0.35 + 0.65 * smoothstep(6, 22, Math.abs(lat));
  const thirst = 0.35 + 0.65 * warmth;
  // **The ocean and not the water**, and the difference is two continents wide.
  // `shoreDistance` counts a lake as a shore, which is right for the ramp the
  // land builds down to it and wrong here: with lakes in that field, Iowa came
  // out temperate rather than grassland and the Sahel temperate rather than
  // savanna, because Lake Michigan and Lake Volta are inside `INTERIOR` of
  // both. Continentality is distance from the sea; see `oceanField`.
  const continental = smoothstep(1.5, INTERIOR, oceanDistance(lat, lon));
  const moisture = clamp(
    zonalMoisture(lat) -
      continental * 0.55 * tropicness * thirst +
      fbm(x * 3.1, y * 3.1, z * 3.1, 2) * 0.16,
    0,
    1,
  );

  target.warmth = warmth;
  target.moisture = moisture;
  target.elevation = elevation;

  // Order matters and it is the order the real world decides in: cold beats
  // everything, then bare rock, then dryness, then how warm what is left is.
  if (warmth < 0.08) target.id = 'ice';
  else if (elevation > MAX_RELIEF * 0.62) target.id = 'rock';
  else if (warmth < 0.17) target.id = 'tundra';
  else if (moisture < 0.22) target.id = warmth > 0.55 ? 'desert' : 'steppe';
  else if (moisture < 0.42) target.id = warmth > 0.62 ? 'savanna' : 'grassland';
  else if (warmth > 0.78 && moisture > 0.6) target.id = 'tropical';
  else if (warmth < 0.32) target.id = 'boreal';
  else target.id = 'temperate';

  return target;
}

/**
 * Known misses, checked against 25 named places by `pnpm check`.
 *
 * Twenty-one land where they should. The four that do not are all the same
 * kind of failure — **a zonal model has no mountains and no continents, only
 * latitudes and a distance to the sea** — and each would need a term this file
 * has deliberately not got:
 *
 * - **The Atacama** comes out steppe rather than desert. It is dry because the
 *   Andes wring the air out before it arrives, and a rain shadow needs to know
 *   which way the wind blows over which range.
 * - **The Empty Quarter** comes out savanna. Arabia is narrow, so the
 *   continentality term barely fires, and what actually dries it is sitting
 *   dead under the subtropical high.
 * - **The Serengeti** comes out tropical. East Africa is dry at the equator
 *   where the model says it must be wet.
 * - **The east coasts of the subtropics** — Florida, the south-east of China,
 *   south-east Brazil — come out savanna where they are wet forest. Trade winds
 *   make the east of a continent wetter than the west at the same latitude, and
 *   "which side of a landmass" is not something a latitude knows.
 *
 * All four are visible from orbit and none of them is visible standing on the
 * ground, which is the trade this file is making. Add a term only with the
 * measurement that shows it pays.
 */

/** A sample to hand to `biomeAt`, so callers do not each invent one. */
export function biomeSample(): BiomeSample {
  return { id: 'temperate', warmth: 0.5, moisture: 0.5, elevation: 0 };
}
