import { PALETTE } from './theme.ts';
import { fbm, oceanDistance, MAX_RELIEF } from './terrain.ts';

/**
 * What the ground is made of, as opposed to whose it is: the second half of the
 * pair `terrain.ts` started. `reliefAt` says how high the ground is, `biomeAt`
 * says what it is. Both are pure functions of a point and the one definition of
 * what they answer; the land mesh takes its colour from here, the vegetation its
 * density and species, and a settlement the colour of its own dirt, so they
 * cannot disagree (a forest of pines on a sand dune).
 *
 * The model is the schoolbook one, temperature against moisture: the smallest
 * that produces the Sahara, the Amazon, the taiga and the steppe from a few
 * lines of arithmetic. See "Known misses" below for what it cannot know.
 */

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * How much of the temperature range the full height of the relief spends. The
 * relief's `MAX_RELIEF` stands for about 8 km of real mountain, which at 6.5
 * degrees a kilometre is around 52 degrees: most of the way from the equator to
 * the pole, so Kilimanjaro has a white top three degrees off the equator.
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
  /** How much grows here, 0 to 1: the vegetation scatter's probability per plot, not a spacing. */
  cover: number;
  /** How thick the grass under your feet is, 0 to 1 (`vegetation.ts`'s `grass`). Separate from `cover`: taiga is mostly trees on thin moss, grassland mostly grass. */
  sward: number;
  /**
   * The scenic parts that belong here, most likely first (ids from
   * `src/scenery/parts/`; an unknown id is skipped). Order matters:
   * `vegetation.ts` weights the list 1, 0.45, 0.20, 0.09. The list is per biome,
   * not per region, so a saguaro can land in the Sahara; gating a species by
   * region is `regions.ts`'s job.
   */
  plants: readonly string[];
}

/** The table. Colours come from `PALETTE` only, so the ground matches the rest of the world. */
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

export interface BiomeSample {
  id: BiomeId;
  /** 0 polar, 1 equatorial, after the height has been taken off it. */
  warmth: number;
  /** 0 desert, 1 rainforest. */
  moisture: number;
  /** How far above the shelf this point is, in world units. Passed straight through. */
  elevation: number;
  /** How continental the place is, 0 on the coast to 1 deep inland (the ocean distance through `INTERIOR`); the weather's seasons read the same value. */
  continental: number;
  /** Permanent snow, 0 to 1 (`snowlineAt`). Past a half the id is `ice`; under it `groundShade` whitens the ground by this much. */
  snow: number;
}

/**
 * Mean annual temperature at sea level in degrees Celsius, by latitude: the
 * real zonal means, rounded. A second temperature beside `warmth`, which is a
 * classifier axis and read as degrees puts France at zero; the weather needs a
 * number a thermometer would agree with (rain or snow is a question about zero).
 * The south is colder than the north at the same latitude, as on the Earth.
 */
const TEMPERATURE_KNOTS_NORTH: readonly [number, number][] = [
  [0, 27], [10, 26.5], [20, 24.5], [30, 19], [40, 13.5], [50, 9], [60, 3], [70, -7], [80, -15], [90, -20],
];
const TEMPERATURE_KNOTS_SOUTH: readonly [number, number][] = [
  [0, 27], [10, 26], [20, 23], [30, 18], [40, 13], [50, 6], [60, -2], [70, -12], [80, -24], [90, -30],
];
export const TEMPERATURE_KNOTS = { north: TEMPERATURE_KNOTS_NORTH, south: TEMPERATURE_KNOTS_SOUTH };

/** Degrees Celsius lost per world unit of height: `MAX_RELIEF` stands for 8 km at the standard 6.5 degrees a kilometre. */
export const LAPSE_PER_UNIT = (6.5 * 8) / MAX_RELIEF;

/**
 * Half the swing between the warmest month and the coldest, in degrees: about a
 * degree in the tropics, rising to seventeen past sixty degrees, and more in a
 * continent's middle than on its coast. `continental` is `BiomeSample.continental`.
 */
export function seasonalSwing(lat: number, continental: number): number {
  return (
    SWING.tropics +
    SWING.range * smoothstep(SWING.from, SWING.to, Math.abs(lat)) * (SWING.coast + (1 - SWING.coast) * continental)
  );
}

/** `seasonalSwing`'s numbers, exported because the ground shader restates it in GLSL (`globe/ground-weather.ts`). */
export const SWING = { tropics: 1, range: 16, from: 15, to: 65, coast: 0.45 } as const;

function knotAt(knots: readonly [number, number][], a: number): number {
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i]!;
    if (a <= x1) {
      const [x0, y0] = knots[i - 1]!;
      return y0 + ((y1 - y0) * (a - x0)) / (x1 - x0);
    }
  }
  return knots[knots.length - 1]![1];
}

/** Mean annual temperature at `lat`, `elevation` world units over the shelf. */
export function meanTemperature(lat: number, elevation: number): number {
  const knots = lat >= 0 ? TEMPERATURE_KNOTS_NORTH : TEMPERATURE_KNOTS_SOUTH;
  return knotAt(knots, Math.abs(lat)) - LAPSE_PER_UNIT * Math.max(0, elevation);
}

/**
 * Where the snow never goes, by the warmest month: a glacier survives where the
 * summer cannot melt what the winter laid, so the line is the summer isotherm
 * near freezing rather than a mean (the mean put Siberia under ice). The margin
 * is the band over which the ground goes from speckled to white.
 */
export const SNOWLINE_SUMMER = -3;
export const SNOWLINE_MARGIN = 1.5;

/**
 * A dry range holds no ice however cold it is, since a glacier is fed by
 * snowfall: dryness raises the line by this many degrees for every unit of
 * moisture under `ARID_FROM`.
 */
const ARID_SNOWLINE = 30;
const ARID_FROM = 0.45;

/**
 * The snowline's factor for a place, 0 to 1. `ragged` is a noise in [0, 1] that
 * moves the line by two degrees either way; `moisture` is the biome's.
 */
export function snowlineAt(lat: number, elevation: number, continental: number, ragged: number, moisture: number): number {
  const summer =
    meanTemperature(lat, elevation) +
    seasonalSwing(lat, continental) +
    (ragged - 0.5) * 4 +
    ARID_SNOWLINE * Math.max(0, ARID_FROM - moisture);
  return smoothstep(SNOWLINE_SUMMER + SNOWLINE_MARGIN, SNOWLINE_SUMMER - SNOWLINE_MARGIN, summer);
}

/**
 * Moisture by latitude alone: the Hadley cells as a table. Wet on the equator,
 * dry at the horse latitudes (most of the world's deserts), wet at the polar
 * front, dry at the poles. A table of knots rather than a cosine because the dry
 * belt is narrow and deep and the wet belts broad and shallow.
 */
export const MOISTURE_KNOTS: readonly [number, number][] = [
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

export function zonalMoisture(lat: number): number {
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

/** Warmth falls linearly with latitude (a cosine puts Finland in France's band). */
const WARMTH_PER_DEGREE = 1 / 86.7;

/** How continental a place is, 0 on the coast to 1 at `INTERIOR` degrees from the sea; shared with the weather and the ground shader. */
export function continentalityAt(lat: number, lon: number): number {
  return smoothstep(1.5, INTERIOR, oceanDistance(lat, lon));
}

/**
 * The classifier. `elevation` is the relief above the shelf in world units (what
 * `reliefAt` returns); `prepareTerrain` must have run. It fills `target` rather
 * than allocating, since the land mesh calls it once per vertex.
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
  // Cooler towards the poles and with height.
  const warmth = clamp(
    1 - Math.abs(lat) * WARMTH_PER_DEGREE - (elevation / MAX_RELIEF) * LAPSE,
    0,
    1,
  );

  // Zonal moisture less continentality, plus a small noise so a biome boundary
  // is ragged rather than a latitude. Continentality is damped near the equator
  // (the ITCZ rains on the tropics wherever they are) and by cold (what matters
  // is rainfall against evaporation: Siberia is drier than Madrid and forested).
  const tropicness = 0.35 + 0.65 * smoothstep(6, 22, Math.abs(lat));
  const thirst = 0.35 + 0.65 * warmth;
  // Distance from the ocean, not from any water: counting lakes would make Iowa
  // and the Sahel read as coastal (see `oceanField` in `terrain/coast-field.ts`).
  const continental = continentalityAt(lat, lon);
  const ragged = fbm(x * 3.1, y * 3.1, z * 3.1, 2);
  const moisture = clamp(
    zonalMoisture(lat) -
      continental * 0.55 * tropicness * thirst +
      ragged * 0.16,
    0,
    1,
  );
  // The same noise frays the snowline: one more `fbm` per vertex is expensive.
  const snow = snowlineAt(lat, elevation, continental, ragged, moisture);

  target.warmth = warmth;
  target.moisture = moisture;
  target.elevation = elevation;
  target.continental = continental;
  target.snow = snow;

  // Order matters: cold beats everything, then bare rock, then dryness, then how
  // warm what is left is. The snowline puts white tops on ranges that `warmth`
  // alone never took to `ice`.
  if (warmth < 0.08 || snow > 0.5) target.id = 'ice';
  else if (elevation > MAX_RELIEF * 0.62) target.id = 'rock';
  else if (warmth < 0.17) target.id = 'tundra';
  else if (moisture < 0.22) target.id = warmth > 0.55 ? 'desert' : 'steppe';
  else if (moisture < 0.42) target.id = warmth > 0.62 ? 'savanna' : 'grassland';
  else if (warmth > 0.78 && moisture > 0.6) target.id = 'tropical';
  else if (warmth < 0.32) target.id = 'boreal';
  else target.id = 'temperate';

  return target;
}

/*
 * Known misses, against the named places in `pnpm check`: a zonal model has no
 * mountains and no continents, only latitudes and a distance to the sea.
 *
 * - The Atacama comes out steppe (a rain shadow needs wind and range direction).
 * - The Empty Quarter comes out savanna (Arabia is narrow, so continentality
 *   barely fires; the subtropical high dries it).
 * - The Serengeti comes out tropical (East Africa is dry at the equator).
 * - The Kazakh steppe comes out temperate (the interior's drying is scaled by
 *   warmth, which is what keeps the taiga a forest).
 * - The east coasts of the subtropics (Florida, south-east China, south-east
 *   Brazil) come out savanna where they are wet forest.
 *
 * All are visible from orbit and none from the ground. Add a term only with the
 * measurement that shows it pays.
 */

/** A sample to hand to `biomeAt`, so callers do not each invent one. */
export function biomeSample(): BiomeSample {
  return { id: 'temperate', warmth: 0.5, moisture: 0.5, elevation: 0, continental: 0, snow: 0 };
}
