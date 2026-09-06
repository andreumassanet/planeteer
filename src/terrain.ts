import type { LandRing } from './geo.ts';

/**
 * The shape of the land, as one pure function of a point on the unit sphere.
 *
 * That is the whole design of this file, and the reason it exists at all.
 * `globe.ts` displaces every land vertex by `reliefAt`; `geo.ts`'s
 * `elevationAt` — which is where the player's feet go — adds the same number to
 * the same ring shelf. There is exactly one definition of "how high is the
 * ground here", so the mesh and the collision cannot drift apart. Two
 * definitions would mean sinking into hills or walking on air, and the two are
 * far enough apart in the code that the disagreement would never be obvious.
 *
 * Everything below is arithmetic: no heightmap, no elevation raster, nothing
 * fetched. The seed is fixed, so it is the same planet on every load — a world
 * that reshuffles on refresh is worse than a flat one.
 */

const DEG = Math.PI / 180;

/**
 * Ceiling on the relief, in world units above the ring's shelf.
 *
 * Worth stating in numbers, because "how tall is a mountain" has no natural
 * answer on a 16,000-unit planet: the avatar is 6.8 units and the coastal cliff
 * is 20, so 680 is a hundred avatars, and the Himalaya reads as a range from
 * orbit while still being ten seconds of running up a 30-degree slope. Real
 * relief is nothing like this — Everest against Earth's radius is 0.14%, which
 * here would be 22 units, i.e. invisible. This is a caricature, deliberately.
 *
 * It is also a hard clamp, so `PLANET_RADIUS + LAND_HEIGHT + MAX_RELIEF` is a
 * bound the mesh check can assert rather than a number someone measured once.
 * The floor at the other end is `SHORE_LIP`; see `reliefAt`.
 */
export const MAX_RELIEF = 680;

/** Rolling swell over every continental interior, before any mountains. */
const SWELL_HEIGHT = 46;
const SWELL_FREQUENCY = 2.4;

/**
 * The downs: the scale of relief between the swell and the ranges, and the one
 * this planet did not have.
 *
 * Measured before it existed, over 4,000 random land points, the gradient of the
 * ground over a 120-unit baseline was **0.027 at the median and 0.003 at the
 * first quartile** — a fifth of a degree, which is a table. Castile, the Sahara,
 * Kansas, the Amazon, the Beauce and Ukraine all sat between 0.003 and 0.006.
 * The world was bimodal: named ranges and a 46-unit continental swell whose
 * finest octave is three units over eight hundred, with nothing at the scale you
 * walk in. It is 0.083 at the median now.
 *
 * Three things about it are load-bearing and each was measured against the
 * alternative:
 *
 * - **Ridged, not `fbm`.** Smooth swells of the same amplitude and cost read as
 *   *flat*, because the light is a four-band `gradientMap` and a band only steps
 *   where the normal turns. `fbm` at 45 units rendered Castile as a featureless
 *   dome; ridged at the same height and 12% fewer triangles gave it hills you
 *   can see. In this style what reads as terrain is a crease, not a curve.
 * - **Zero-mean.** `DOWNS_MEAN` is the measured mean of `ridged` at this
 *   frequency and taking it off is not tidiness. `biome.ts` reads warmth as
 *   `1 - |lat|/86.7 - (elevation / MAX_RELIEF) * LAPSE`, so relief *is*
 *   temperature: lifting the whole land by 20 units moves every treeline and
 *   snowline on the planet. With the raw noise the 25 named places `pnpm check`
 *   asserts lost four at once — the Canadian Shield, Scotland, Kazakhstan and
 *   the Atacama, all of them colder. Centred, the median relief moves from 24
 *   units to 26 and all 25 still land where an atlas says they are.
 * - **Two octaves at 24.** The finest cell is `1/48` of the sphere, comfortably
 *   coarser than `RELIEF_DETAIL`, so `MAX_EDGE` does not move and the whole
 *   planet is not re-tessellated for it. It costs 96,660 triangles, +8.2%.
 */
const DOWNS_HEIGHT = 45;
const DOWNS_FREQUENCY = 24;
const DOWNS_OCTAVES = 2;
/** Measured mean of `ridged` at this frequency and octave count. */
const DOWNS_MEAN = 0.48;
/** The downs in flat country, as a fraction of their height in high country. */
const DOWNS_LOW = 0.55;

/**
 * How much of a range's height is the massif it stands on rather than its
 * ridges. See where it is used.
 */
const MASSIF_FLOOR = 0.38;

/** Height of the ranges the noise raises on its own, away from the named ones. */
const NOISE_RANGE_HEIGHT = 150;
const RIDGE_FREQUENCY = 7.5;
const RIDGE_OCTAVES = 5;

/**
 * Size of the finest cell this relief can build, in radians of arc.
 *
 * The mesh needs this number, which is why it is derived here rather than
 * guessed there: a triangle longer than a cell of the last octave can span a
 * whole ridge without any of its corners noticing, and an error test that only
 * ever looks at corners would then refine nothing. `globe.ts` caps its edge
 * length with it. Change the octaves or the frequency and the mesh follows.
 */
export const RELIEF_DETAIL = 1 / (RIDGE_FREQUENCY * 2 ** (RIDGE_OCTAVES - 1));

/**
 * How far inland the relief takes to reach full height, in degrees.
 *
 * This is what keeps the coast sane, and it does two jobs at once. It gives
 * every landmass a coastal plain instead of dropping a mountain into the sea —
 * a cliff is `LAND_HEIGHT` tall by design, and a 600-unit wall of it would
 * swamp that decision. And because it is measured from the water rather than
 * from a table, it scales itself: an island narrower than this is never far
 * enough from its own shore to earn any relief, so Formentera stays the flat
 * shelf it is today with no special case anywhere for small islands.
 *
 * The consequence, which is deliberate: the Mediterranean islands and most of
 * every coastline are flat. Shortening it does not change that — measured, the
 * Balearics stay flat at 0.7 degrees and it costs a hundred thousand triangles
 * — because what actually keeps them low is the noise, which puts no high
 * ground there. This only decides how far in the mountains that do exist start.
 */
const SHORE_SPAN = 1.1;

/**
 * Land kept above the water at the very edge of the shore, in world units.
 *
 * The coast used to be a `LAND_HEIGHT` cliff and nothing else: the ground ended
 * at 20 units and the sea began, with no transition anywhere on the planet. The
 * ramp below spends most of that drop over real ground, and this is what is
 * left standing at the waterline.
 *
 * It cannot go to zero, and the reason is not the look. Three separate numbers
 * are sitting under it and all three are about telling land from water:
 * `vehicles.ts`'s `SEA_LEVEL_EPSILON` (0.5) is what stops the boat and what
 * puts the player in it, `OCEAN_SAG` (1.5) is how far the inscribed ocean
 * sphere's faces dip below sea level, and the mesh's own `RELIEF_SAG` is how
 * far a triangle may sit from the ground it approximates. Four units clears the
 * first by eight times and the second by nearly three, so the lowest ground on
 * the planet is still unambiguously land — from the hull's point of view the
 * shore is exactly the wall it always was. It is also 0.6 of an avatar, which
 * is a step onto a beach rather than a cliff.
 */
export const SHORE_LIP = 4;

/**
 * The shelf every ring stands on, in world units. It is `LAND_HEIGHT` in
 * `geo.ts` and it is copied rather than imported because `geo.ts` imports this
 * file: the cycle would leave the constant in its temporal dead zone at
 * module-evaluation time, which is the same reason `unitsPerRadian` is handed
 * in. `pnpm check` asserts the two agree.
 */
const LAND_SHELF = 20;

/**
 * How much of the shelf the ramp gives back, and over what distance.
 *
 * `SHORE_RAMP` is the widest a shore ever gets and `SHORE_BLUFF` the narrowest.
 * Neither is a taste: the wide end is what the transition has to be to read as
 * one — 130 units is nineteen avatars and about a second of running — and the
 * narrow end is a floor rather than zero because a drop of `LAND_HEIGHT` in no
 * distance at all is the cliff this replaces, and the mesh cannot resolve it:
 * `MIN_EDGE` in `globe.ts` is 22 units, so a bluff thinner than that is drawn
 * as a sawtooth rather than as a bank.
 */
const SHORE_RAMP = 130;
const SHORE_BLUFF = 26;

/** Scale of the bays, in radians of the unit sphere. About 2,300 units. */
const SHORE_BAY_FREQUENCY = 7;

/** How far off a boundary segment the sea is asked about, in world units. */
const SHORE_PROBE = 8;

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** The seed. Fixed, so the planet is the same one on every load. */
const SEED = 0x5eed1a5;

/**
 * Hash of one lattice cell, in [0,1).
 *
 * The cell is folded into a single integer by the callers, so this only has to
 * scramble it. `Math.imul` rather than `*`: the products overflow 32 bits, and
 * plain multiplication would round them as doubles and lose exactly the low
 * bits this is trying to mix.
 */
function mix(n: number): number {
  let h = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Value noise on a 3D lattice, sampled in space rather than in lon/lat.
 *
 * Sampling the sphere in three dimensions is what makes the poles and the
 * antimeridian nothing special: there is no seam to hide because there are no
 * texture coordinates.
 */
function valueNoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);

  // The eight corners as offsets from one folded index. Building the planet
  // comes here about ten million times, so the three multiplies that locate a
  // cell happen once and the neighbours are additions.
  const base = (xi * 1619 + yi * 31337 + zi * 6971 + SEED) | 0;
  const c000 = mix(base);
  const c100 = mix(base + 1619);
  const c010 = mix(base + 31337);
  const c110 = mix(base + 32956);
  const c001 = mix(base + 6971);
  const c101 = mix(base + 8590);
  const c011 = mix(base + 38308);
  const c111 = mix(base + 39927);

  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

// A fixed rotation applied between octaves, and an offset with it. Stacking
// octaves on the same axes leaves the lattice visible as a grid of creases
// running along x, y and z; turning each octave off-axis costs nine multiplies
// and dissolves it.
const R00 = 0.802, R01 = 0.313, R02 = -0.508;
const R10 = -0.517, R11 = 0.772, R12 = -0.369;
const R20 = 0.297, R21 = 0.553, R22 = 0.778;

/** Fractal Brownian motion, in [0,1]. Rolling ground: hills, not ridges. */
export function fbm(x: number, y: number, z: number, octaves: number): number {
  let px = x;
  let py = y;
  let pz = z;
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amplitude * valueNoise(px, py, pz);
    total += amplitude;
    amplitude *= 0.5;
    const nx = (R00 * px + R01 * py + R02 * pz) * 2 + 17.3;
    const ny = (R10 * px + R11 * py + R12 * pz) * 2 - 9.1;
    const nz = (R20 * px + R21 * py + R22 * pz) * 2 + 41.7;
    px = nx;
    py = ny;
    pz = nz;
  }
  return sum / total;
}

/**
 * Ridged multifractal, in [0,1]. Folding the noise about its midpoint turns the
 * smooth maxima of `fbm` into creases, which is what a mountain range looks
 * like; the weight carries detail only where the previous octave was already
 * near a crest, so valleys stay smooth. That is not only for looks — it is also
 * what keeps the triangle count down, since `globe.ts` refines against the
 * curvature of this function and a smooth valley needs no triangles.
 */
function ridged(x: number, y: number, z: number, octaves: number): number {
  let px = x;
  let py = y;
  let pz = z;
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let weight = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(2 * valueNoise(px, py, pz) - 1);
    n *= n;
    n *= weight;
    // How fast the detail dies away from a crest. Above about two the fine
    // octaves survive across whole slopes, which costs a hundred thousand
    // triangles for roughness you only see with your nose against it.
    weight = clamp(n * 1.6, 0, 1);
    sum += amplitude * n;
    total += amplitude;
    amplitude *= 0.52;
    const nx = (R00 * px + R01 * py + R02 * pz) * 2 + 5.9;
    const ny = (R10 * px + R11 * py + R12 * pz) * 2 + 23.4;
    const nz = (R20 * px + R21 * py + R22 * pz) * 2 - 13.6;
    px = nx;
    py = ny;
    pz = nz;
  }
  return sum / total;
}

/**
 * The ranges that have to be where they are.
 *
 * Uniform noise makes a planet; it does not make *this* planet. A player who
 * lands in Nepal should be at the foot of something, and the Andes should be
 * the wall down the west of South America rather than wherever the hash felt
 * like putting a wall. So the crest lines are data — a polyline of lat/lon
 * along the ridge, a half-width in degrees and a peak in world units — while
 * the actual shape is still the ridged noise above. The table places the range;
 * it does not draw it, and none of these numbers touches the terrain outside
 * its own footprint.
 *
 * `peak` is the ceiling of the noise inside the range, not a summit height: the
 * ridges reach it only on their crests.
 */
const RANGES: { name: string; peak: number; width: number; path: [number, number][] }[] = [
  { name: 'Himalaya', peak: 620, width: 3.0,
    path: [[36, 74], [35, 77], [31, 79], [28, 84], [27.6, 90], [28, 95]] },
  { name: 'Tibet', peak: 300, width: 7.5, path: [[35, 80], [33, 89], [31, 97]] },
  { name: 'Tian Shan / Altai', peak: 330, width: 2.2,
    path: [[42, 75], [43, 82], [48, 89], [50, 96]] },
  { name: 'Andes', peak: 520, width: 2.1,
    path: [[10, -73], [4, -76], [-2, -78], [-10, -77], [-18, -69], [-27, -69], [-35, -70], [-45, -72], [-52, -73]] },
  { name: 'Rockies', peak: 380, width: 3.2,
    path: [[62, -138], [55, -125], [49, -116], [43, -110], [38, -107], [33, -108]] },
  { name: 'Sierra Nevada / Cascades', peak: 310, width: 1.4,
    path: [[48, -121], [43, -122], [38, -120], [36, -118]] },
  { name: 'Alaska Range', peak: 340, width: 1.8, path: [[68, -150], [63, -150], [61, -143]] },
  { name: 'Sierra Madre', peak: 260, width: 1.6, path: [[26, -107], [21, -103], [17, -96]] },
  { name: 'Appalachians', peak: 170, width: 1.6, path: [[47, -70], [41, -77], [35, -83]] },
  { name: 'Alps', peak: 340, width: 1.3,
    path: [[44.1, 7.0], [45.9, 7.4], [46.5, 10.3], [47, 13.2], [47, 15.5]] },
  { name: 'Pyrenees', peak: 240, width: 0.7, path: [[42.8, -1.5], [42.7, 1], [42.4, 2.4]] },
  { name: 'Scandes', peak: 220, width: 1.4, path: [[69, 21], [65, 14], [61, 8.5], [59, 7]] },
  { name: 'Caucasus', peak: 310, width: 1.0, path: [[43.5, 41], [42.6, 45], [41, 48]] },
  { name: 'Zagros', peak: 260, width: 1.8, path: [[37, 45], [33, 49], [29, 53], [27, 57]] },
  { name: 'Atlas', peak: 250, width: 1.2, path: [[31, -8], [32, -5], [34, 0], [36, 6]] },
  { name: 'Ethiopian highlands', peak: 280, width: 2.6, path: [[14, 38], [9, 38], [3, 37], [-3, 36]] },
  { name: 'Drakensberg', peak: 220, width: 1.4, path: [[-25, 30], [-29, 29], [-31, 28]] },
  { name: 'Great Dividing Range', peak: 200, width: 1.4,
    path: [[-17, 145], [-25, 148], [-33, 150], [-37, 147]] },
  { name: 'Southern Alps', peak: 270, width: 0.8, path: [[-42, 172], [-44, 169], [-45.5, 167]] },
  { name: 'Japanese Alps', peak: 240, width: 0.9, path: [[38, 140], [36, 138], [34.5, 136]] },
  // The two ice domes. Both are only recognisable from orbit, and both are
  // genuinely the shape of the land underneath a kilometre of ice.
  { name: 'Greenland dome', peak: 300, width: 5.0, path: [[77, -38], [72, -40], [66, -45]] },
  { name: 'East Antarctic dome', peak: 300, width: 12.0, path: [[-80, 90], [-82, 40], [-78, 130]] },
];

/** Path vertices as unit vectors, flattened, plus a bounding cone per range. */
const rangePoints: Float64Array[] = [];
const rangeCentre: Float64Array = new Float64Array(RANGES.length * 3);
/** Cosine of the cone half-angle, so the test below is one dot product. */
const rangeReach: Float64Array = new Float64Array(RANGES.length);

for (let r = 0; r < RANGES.length; r++) {
  const range = RANGES[r]!;
  const points = new Float64Array(range.path.length * 3);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  range.path.forEach(([lat, lon], i) => {
    const cos = Math.cos(lat * DEG);
    const x = cos * Math.cos(lon * DEG);
    const y = Math.sin(lat * DEG);
    const z = -cos * Math.sin(lon * DEG);
    points[i * 3] = x;
    points[i * 3 + 1] = y;
    points[i * 3 + 2] = z;
    cx += x;
    cy += y;
    cz += z;
  });
  const length = Math.hypot(cx, cy, cz) || 1;
  cx /= length;
  cy /= length;
  cz /= length;
  let reach = 0;
  for (let i = 0; i < points.length; i += 3) {
    const dot = clamp(cx * points[i]! + cy * points[i + 1]! + cz * points[i + 2]!, -1, 1);
    reach = Math.max(reach, Math.acos(dot));
  }
  rangePoints.push(points);
  rangeCentre[r * 3] = cx;
  rangeCentre[r * 3 + 1] = cy;
  rangeCentre[r * 3 + 2] = cz;
  // Plus the width, so the cone covers the range's whole footprint.
  rangeReach[r] = Math.cos(reach + range.width * DEG);
}

/**
 * Height the named ranges allow at this point: the largest of their falloffs.
 *
 * Largest rather than the sum, so two ranges crossing cannot stack into a peak
 * neither of them declares. That is what makes `MAX_RELIEF` provable instead of
 * hopeful. The crease where they meet is a ridge, which is what a mountain
 * looks like anyway.
 */
function rangeHeight(x: number, y: number, z: number): number {
  let best = 0;
  for (let r = 0; r < RANGES.length; r++) {
    const centre = r * 3;
    // One dot product rejects every range the point is nowhere near, which is
    // all of them for most of the planet.
    const dot = x * rangeCentre[centre]! + y * rangeCentre[centre + 1]! + z * rangeCentre[centre + 2]!;
    if (dot < rangeReach[r]!) continue;

    const range = RANGES[r]!;
    if (range.peak <= best) continue;
    const points = rangePoints[r]!;
    let nearest = Infinity;
    for (let i = 0; i + 5 < points.length; i += 3) {
      const ax = points[i]!, ay = points[i + 1]!, az = points[i + 2]!;
      const bx = points[i + 3]!, by = points[i + 4]!, bz = points[i + 5]!;
      const ex = bx - ax, ey = by - ay, ez = bz - az;
      const len = ex * ex + ey * ey + ez * ez;
      // Closest point on the chord rather than on the great-circle arc. Over a
      // segment of a few degrees the two differ by less than a thousandth of a
      // degree, and this is a mask, not a measurement.
      const t = len > 0 ? clamp(((x - ax) * ex + (y - ay) * ey + (z - az) * ez) / len, 0, 1) : 0;
      const dx = x - (ax + ex * t), dy = y - (ay + ey * t), dz = z - (az + ez * t);
      nearest = Math.min(nearest, dx * dx + dy * dy + dz * dz);
    }
    const distance = (2 * Math.asin(Math.min(1, Math.sqrt(nearest) / 2))) / DEG;
    const height = range.peak * smoothstep(range.width, range.width * 0.25, distance);
    if (height > best) best = height;
  }
  return best;
}

/**
 * Distance to the nearest shoreline, in degrees, on a half-degree grid.
 *
 * The relief needs to know how far inland it is — that is what fades the
 * mountains out at the coast and what keeps small islands flat — and "far from
 * the shore" is not something the noise can know by itself.
 *
 * This is a land/sea mask, *not* the country index, and the difference is the
 * one that cost this project a bug: the index was once painted into a canvas
 * whose `fill()` antialiased coastal pixels into blends of two country numbers,
 * and New York came back as China. Nothing here is painted or interpolated
 * between identities: each cell centre is tested with the same exact even-odd
 * rule as `countryAt`, evaluated a scan line at a time because a quarter of a
 * million separate queries would cost most of a second. A cell is land or not,
 * and being one cell wrong about a shoreline moves a hill, not a country.
 */
const COAST_CELL = 0.5;
const COAST_COLS = Math.round(360 / COAST_CELL);
const COAST_ROWS = Math.round(180 / COAST_CELL);

let coastDistance: Float32Array | null = null;
/**
 * The same field with the lakes left in the land, and it is a different
 * question rather than a cheaper one.
 *
 * `shoreDistance` answers *how far to the nearest water*, which is what the
 * shore ramp is gated on and what `vegetation.ts` asks before it takes the fast
 * path over a tile. `biome.ts` asks the other one — how far from the **ocean**,
 * which is continentality, which is most of why the middle of a landmass is dry
 * — and a lake is not an ocean for that purpose however wet it is.
 *
 * Sharing one field between the two is measured and it moves the climate of
 * whole continents. With the lakes cleared out of the coast field, `pnpm check`
 * came back **Iowa temperate rather than grassland and the Sahel temperate
 * rather than savanna**: Iowa is four degrees from Lake Michigan and the Sahel
 * is beside Lake Volta and Lake Chad, so the continentality term — which
 * saturates at `INTERIOR` degrees — read them both as coastal and gave them the
 * rainfall of a coast. Two fields, one megabyte, and the 25 named places land
 * where an atlas says they are again.
 */
let oceanField: Float32Array | null = null;
let preparedFor: LandRing[] | null = null;
/**
 * How many world units one radian of arc is worth.
 *
 * Everything else here is measured in degrees, because everything else here is
 * geography and geography scales with the planet. The flat pads below are the
 * exception: a monument's footprint is a human-scale thing, like `LAND_HEIGHT`,
 * and it must stay the same size in units whatever `PLANET_RADIUS` does. So the
 * scale is handed in rather than imported — `globe.ts` imports this file, and
 * importing it back would be a cycle that leaves `LAND_HEIGHT` in its temporal
 * dead zone at module-evaluation time.
 */
let unitsPerRadian = 0;

function buildCoastField(rings: LandRing[], lakesCount: boolean): Float32Array {
  const land = new Uint8Array(COAST_COLS * COAST_ROWS);

  // **Land first, then the lakes cleared out of it**, and the order is the
  // whole of it: a lake overlaps the country it sits in, so one even-odd pass
  // over both would cancel the two against each other and lose them both. It is
  // the reason this loop is per ring in the first place — Lesotho inside South
  // Africa needs the same separation for the same reason, one direction up.
  //
  // `lakesCount` is false for the ocean field above, which skips the second
  // half of that list rather than filtering it differently: a lake that is not
  // water here is land, which is exactly what continentality wants it to be.
  const dry = rings.filter((ring) => !ring.water);
  const ordered = lakesCount ? dry.concat(rings.filter((ring) => ring.water)) : dry;

  for (const ring of ordered) {
    const fill = ring.water ? 0 : 1;
    const points = ring.points;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const p of points) {
      if (p[1]! < minLat) minLat = p[1]!;
      if (p[1]! > maxLat) maxLat = p[1]!;
    }
    const row0 = Math.max(0, Math.floor((90 - maxLat) / COAST_CELL));
    const row1 = Math.min(COAST_ROWS - 1, Math.ceil((90 - minLat) / COAST_CELL));
    if (row1 < row0) continue;

    // Crossings of this ring with each scan line it spans. Per ring, because
    // rings overlap — the bake keeps only outer rings, so Lesotho sits inside
    // South Africa's polygon and a shared even-odd count would cancel it out
    // into a lake.
    const crossings: number[][] = [];
    for (let r = row0; r <= row1; r++) crossings.push([]);
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i]!;
      const b = points[j]!;
      const ya = a[1]!;
      const yb = b[1]!;
      const lo = Math.min(ya, yb);
      const hi = Math.max(ya, yb);
      let r = Math.max(row0, Math.floor((90 - hi) / COAST_CELL));
      const rEnd = Math.min(row1, Math.ceil((90 - lo) / COAST_CELL));
      for (; r <= rEnd; r++) {
        const y = 90 - (r + 0.5) * COAST_CELL;
        if (ya > y === yb > y) continue;
        crossings[r - row0]!.push(((b[0]! - a[0]!) * (y - ya)) / (yb - ya) + a[0]!);
      }
    }
    for (let r = row0; r <= row1; r++) {
      const xs = crossings[r - row0]!;
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k]! + 180) / COAST_CELL - 0.5));
        const c1 = Math.min(COAST_COLS - 1, Math.floor((xs[k + 1]! + 180) / COAST_CELL - 0.5));
        for (let c = c0; c <= c1; c++) land[r * COAST_COLS + c] = fill;
      }
    }

    // **A lake smaller than a cell has to clear one anyway, and that is not a
    // rounding choice — it is what gives it a shore at all.** The scan line
    // only fills a cell whose *centre* the ring contains, and a cell is 139
    // world units where the median lake here is 60 across: Lake Geneva, the
    // Bodensee and Tahoe would have contained no centre, `inland` would have
    // stayed at 1 on their banks, and the relief would have stood its full
    // height at the waterline — measured, a **149-unit wall** round Lake Geneva
    // where the ramp is meant to bring the land down to `SHORE_LIP`. So every
    // cell the outline itself passes through is cleared too. It over-reaches by
    // up to a cell, which is the same statement as "a lake commands a cell of
    // coastal plain whatever its size", and it is the conservative direction:
    // too much shore is a beach, too little is a cliff.
    if (ring.water) {
      for (const p of points) {
        const c = Math.floor((p[0]! + 180) / COAST_CELL);
        const r = Math.floor((90 - p[1]!) / COAST_CELL);
        if (r < 0 || r >= COAST_ROWS) continue;
        land[r * COAST_COLS + (((c % COAST_COLS) + COAST_COLS) % COAST_COLS)] = 0;
      }
    }
  }

  // Chamfer distance transform: land cells take the distance to the nearest sea
  // cell. The step costs are the real angular size of a cell, so a degree of
  // longitude counts for less near the poles, where it is worth less.
  const distance = new Float32Array(COAST_COLS * COAST_ROWS);
  for (let i = 0; i < distance.length; i++) distance[i] = land[i] ? Infinity : 0;

  const stepX = new Float64Array(COAST_ROWS);
  for (let r = 0; r < COAST_ROWS; r++) {
    stepX[r] = COAST_CELL * Math.cos((90 - (r + 0.5) * COAST_CELL) * DEG);
  }
  const relax = (r: number, c: number, from: number, cost: number): void => {
    const value = distance[from]! + cost;
    const at = r * COAST_COLS + c;
    if (value < distance[at]!) distance[at] = value;
  };
  // Two rounds rather than one: longitude wraps, so a single sweep cannot carry
  // a distance all the way round the planet.
  for (let round = 0; round < 2; round++) {
    for (let r = 0; r < COAST_ROWS; r++) {
      const dx = stepX[r]!;
      const diagonal = Math.hypot(dx, COAST_CELL);
      for (let c = 0; c < COAST_COLS; c++) {
        const west = (c + COAST_COLS - 1) % COAST_COLS;
        const east = (c + 1) % COAST_COLS;
        relax(r, c, r * COAST_COLS + west, dx);
        if (r > 0) {
          relax(r, c, (r - 1) * COAST_COLS + c, COAST_CELL);
          relax(r, c, (r - 1) * COAST_COLS + west, diagonal);
          relax(r, c, (r - 1) * COAST_COLS + east, diagonal);
        }
      }
    }
    for (let r = COAST_ROWS - 1; r >= 0; r--) {
      const dx = stepX[r]!;
      const diagonal = Math.hypot(dx, COAST_CELL);
      for (let c = COAST_COLS - 1; c >= 0; c--) {
        const west = (c + COAST_COLS - 1) % COAST_COLS;
        const east = (c + 1) % COAST_COLS;
        relax(r, c, r * COAST_COLS + east, dx);
        if (r < COAST_ROWS - 1) {
          relax(r, c, (r + 1) * COAST_COLS + c, COAST_CELL);
          relax(r, c, (r + 1) * COAST_COLS + east, diagonal);
          relax(r, c, (r + 1) * COAST_COLS + west, diagonal);
        }
      }
    }
  }
  return distance;
}

/**
 * Builds the coast field. Idempotent, and cheap to call again: `geo.ts` calls
 * it as the world loads and `globe.ts` calls it before building the mesh, so
 * whichever of the two runs first, both then read the same field.
 */
export function prepareTerrain(
  rings: LandRing[],
  unitsPerDegree: number,
  isLand: (lat: number, lon: number) => boolean,
): void {
  if (preparedFor === rings && coastDistance !== null) return;
  coastDistance = buildCoastField(rings, true);
  // On a planet with no inland water the two fields are the same array and not
  // two copies of it, so nothing pays for a distinction it does not have.
  oceanField = rings.some((ring) => ring.water) ? buildCoastField(rings, false) : coastDistance;
  unitsPerRadian = unitsPerDegree / DEG;
  buildShoreIndex(rings, isLand);
  preparedFor = rings;
}

/**
 * Bilinear sample of the coast field, in degrees to the nearest water of any
 * kind, the sea and the lakes alike.
 *
 * Exported because the relief is not the only thing that needs it:
 * `vegetation.ts` asks it whether a whole tile is far enough from water to skip
 * the point-in-polygon under every plot. Requires `prepareTerrain`, like
 * everything else here.
 */
export function shoreDistance(lat: number, lon: number): number {
  return sampleCoast(coastDistance, lat, lon);
}

/**
 * The same sample against the ocean alone, which is what continentality is.
 *
 * `biome.ts` is the only caller and it is a different question from the one
 * above; see `oceanField` for the two named places that moved when they shared
 * a field.
 */
export function oceanDistance(lat: number, lon: number): number {
  return sampleCoast(oceanField, lat, lon);
}

function sampleCoast(field: Float32Array | null, lat: number, lon: number): number {
  if (field === null) {
    throw new Error('terrain: prepareTerrain(rings) has to run before reliefAt');
  }
  const cf = (lon + 180) / COAST_CELL - 0.5;
  const rf = clamp((90 - lat) / COAST_CELL - 0.5, 0, COAST_ROWS - 1);
  const c0 = Math.floor(cf);
  const r0 = Math.floor(rf);
  const tx = cf - c0;
  const ty = rf - r0;
  const ca = ((c0 % COAST_COLS) + COAST_COLS) % COAST_COLS;
  const cb = (ca + 1) % COAST_COLS;
  const ra = clamp(r0, 0, COAST_ROWS - 1);
  const rb = clamp(r0 + 1, 0, COAST_ROWS - 1);
  const top = field[ra * COAST_COLS + ca]! + (field[ra * COAST_COLS + cb]! - field[ra * COAST_COLS + ca]!) * tx;
  const bottom = field[rb * COAST_COLS + ca]! + (field[rb * COAST_COLS + cb]! - field[rb * COAST_COLS + ca]!) * tx;
  return top + (bottom - top) * ty;
}

/**
 * The shoreline itself, at the resolution the outlines have.
 *
 * `shoreDistance` above is a half-degree grid, so its cell is 140 world units —
 * wider than the whole shore ramp, and quantised into a 140-unit staircase along
 * every coast. It is the right field for the question it was built for (how far
 * inland am I, to a degree) and it cannot answer this one at all.
 *
 * So the shore is indexed from the outlines directly: every boundary segment
 * with the sea on the far side of it, bucketed by lat/lon, and a query is the
 * exact great-circle distance to the nearest of them. The coarse field is still
 * what makes it affordable — it rejects everything more than a ramp and a couple
 * of cells from the water before the index is touched at all, which is nearly
 * the whole planet.
 *
 * **A ring boundary is not a coastline and this is the trap.** The rings are
 * *country* outlines, so France's ring runs along the Rhine as well as along the
 * Atlantic, and a distance to "my own ring" would cut a trench down every
 * international border. The sea is asked about explicitly instead: land is on
 * the right of `a -> b` — the bake winds it that way and the cliffs depend on
 * it — so `cross(up, b - a)` steps off the outward side, and a segment is a
 * shore only when that lands in the water. Which is one point-in-polygon query
 * per segment, and see `prepareTerrain` for what that costs.
 */
let shoreAx: Float64Array | null = null;
let shoreBx: Float64Array | null = null;
let shoreHead: Int32Array | null = null;
let shoreNext: Int32Array | null = null;
let shoreItem: Int32Array | null = null;
let shoreCols = 0;
let shoreRows = 0;
let shoreCell = 0;
/** Beyond this many degrees from the coarse shore, nothing can be on a ramp. */
let shoreGate = 0;

function buildShoreIndex(rings: LandRing[], isLand: (lat: number, lon: number) => boolean): void {
  const unitsPerDegree = unitsPerRadian * DEG;
  // One cell per ramp, so a query reads a 3x3 neighbourhood at the equator. The
  // column count is even so the rows divide it exactly and both cells are square
  // in degrees, which is what lets one number index both axes.
  shoreCols = Math.max(4, 2 * Math.round(180 / (SHORE_RAMP / unitsPerDegree)));
  shoreRows = shoreCols / 2;
  shoreCell = 360 / shoreCols;
  // The ramp, plus a coarse cell for the error the bilinear sample of a
  // half-degree distance transform carries. Past that nothing can be on a ramp,
  // and the index is never touched — which is nearly the whole planet.
  shoreGate = SHORE_RAMP / unitsPerDegree + COAST_CELL;

  const ax: number[] = [];
  const bx: number[] = [];
  for (const ring of rings) {
    const points = ring.points;
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      const alat = a[1]!;
      const blat = b[1]!;
      const mlat = (alat + blat) * 0.5;
      const cos = Math.max(0.02, Math.cos(mlat * DEG));
      let tx = (b[0]! - a[0]!) * cos;
      let ty = blat - alat;
      const length = Math.hypot(tx, ty);
      if (length === 0) continue;
      tx /= length;
      ty /= length;
      // `cross(up, b - a)` in an east/north frame is `(-north, +east)`, which is
      // the same sign `globe.ts` builds its cliffs with. Getting it backwards
      // indexes the borders and misses the coasts, and the two counts are three
      // to two, so it is not a difference a total would show.
      const step = SHORE_PROBE / unitsPerDegree;
      const olat = mlat + tx * step;
      const olon = (a[0]! + b[0]!) * 0.5 + (-ty * step) / cos;
      if (isLand(olat, olon)) continue;
      const acos = Math.cos(alat * DEG);
      const bcos = Math.cos(blat * DEG);
      ax.push(
        acos * Math.cos(a[0]! * DEG),
        Math.sin(alat * DEG),
        -acos * Math.sin(a[0]! * DEG),
      );
      bx.push(
        bcos * Math.cos(b[0]! * DEG),
        Math.sin(blat * DEG),
        -bcos * Math.sin(b[0]! * DEG),
      );
    }
  }

  shoreAx = Float64Array.from(ax);
  shoreBx = Float64Array.from(bx);

  const head = new Int32Array(shoreCols * shoreRows).fill(-1);
  const item: number[] = [];
  const next: number[] = [];
  const count = ax.length / 3;
  // A segment lands in every cell of its own bounding box. Segments are 20 units
  // long at the median against a 130-unit cell, so that is nearly always one.
  for (let sIndex = 0; sIndex < count; sIndex++) {
    const alat = Math.asin(clamp(shoreAx[sIndex * 3 + 1]!, -1, 1)) / DEG;
    const blat = Math.asin(clamp(shoreBx[sIndex * 3 + 1]!, -1, 1)) / DEG;
    const alon = Math.atan2(-shoreAx[sIndex * 3 + 2]!, shoreAx[sIndex * 3]!) / DEG;
    const blon = Math.atan2(-shoreBx[sIndex * 3 + 2]!, shoreBx[sIndex * 3]!) / DEG;
    const r0 = clamp(Math.floor((90 - Math.max(alat, blat)) / shoreCell), 0, shoreRows - 1);
    const r1 = clamp(Math.floor((90 - Math.min(alat, blat)) / shoreCell), 0, shoreRows - 1);
    const c0 = Math.floor((Math.min(alon, blon) + 180) / shoreCell);
    const c1 = Math.floor((Math.max(alon, blon) + 180) / shoreCell);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = r * shoreCols + (((c % shoreCols) + shoreCols) % shoreCols);
        item.push(sIndex);
        next.push(head[cell]!);
        head[cell] = item.length - 1;
      }
    }
  }
  shoreHead = head;
  shoreItem = Int32Array.from(item);
  shoreNext = Int32Array.from(next);
}

/**
 * Distance to the nearest shoreline, in world units, or `Infinity` past the
 * ramp.
 *
 * Closest point on the chord rather than on the arc, the same approximation
 * `rangeHeight` makes and for the same reason: over a segment tens of units long
 * the two differ in the eighth decimal, and this is a shape, not a survey.
 */
function nearestShore(x: number, y: number, z: number, lat: number, lon: number): number {
  const head = shoreHead;
  const a = shoreAx;
  const b = shoreBx;
  const item = shoreItem;
  const next = shoreNext;
  if (head === null || a === null || b === null || item === null || next === null) return Infinity;

  const reach = SHORE_RAMP / (unitsPerRadian * DEG);
  const row = clamp(Math.floor((90 - lat) / shoreCell), 0, shoreRows - 1);
  const rowSpan = Math.ceil(reach / shoreCell);
  // A degree of longitude is worth `cos(lat)` of one of latitude, so the same
  // reach is more columns the further north it is asked. At the poles that is
  // every column, and saying so outright is cheaper than clamping and wrong.
  const colReach = reach / Math.max(1e-3, Math.cos(lat * DEG));
  const colSpan = colReach >= 180 ? shoreCols : Math.ceil(colReach / shoreCell);
  const wide = colSpan * 2 + 1 >= shoreCols;

  const col = Math.floor((lon + 180) / shoreCell);
  /** Squared chord to the nearest segment in one cell, folded into `best`. */
  let best = Infinity;
  const scan = (r: number, c: number): void => {
    let entry = head[r * shoreCols + (((c % shoreCols) + shoreCols) % shoreCols)]!;
    while (entry >= 0) {
      const s = item[entry]! * 3;
      const px = a[s]!, py = a[s + 1]!, pz = a[s + 2]!;
      const ex = b[s]! - px, ey = b[s + 1]! - py, ez = b[s + 2]! - pz;
      const span = ex * ex + ey * ey + ez * ez;
      const t = span > 0 ? clamp(((x - px) * ex + (y - py) * ey + (z - pz) * ez) / span, 0, 1) : 0;
      const dx = x - (px + ex * t);
      const dy = y - (py + ey * t);
      const dz = z - (pz + ez * t);
      const chord = dx * dx + dy * dy + dz * dz;
      if (chord < best) best = chord;
      entry = next[entry]!;
    }
  };

  // The point's own cell first, and then the question of whether the rest of
  // the neighbourhood can possibly hold anything nearer: nothing outside this
  // cell is closer than the point's distance to the cell's own wall. On a coast
  // that answer is usually yes, which turns a nine-cell sweep into a one-cell
  // one — and this is the whole per-query cost, asked once per mesh vertex.
  scan(row, col);
  if (best < Infinity) {
    const north = 90 - row * shoreCell;
    const west = -180 + col * shoreCell;
    const margin = Math.min(
      north - lat,
      lat - (north - shoreCell),
      (lon - west) * Math.cos(lat * DEG),
      (west + shoreCell - lon) * Math.cos(lat * DEG),
    ) * DEG;
    if (margin > 0 && best <= 4 * Math.sin(margin * 0.5) * Math.sin(margin * 0.5)) {
      return 2 * Math.asin(Math.min(1, Math.sqrt(best) / 2)) * unitsPerRadian;
    }
  }

  const r0 = Math.max(0, row - rowSpan);
  const r1 = Math.min(shoreRows - 1, row + rowSpan);
  for (let r = r0; r <= r1; r++) {
    const c0 = wide ? 0 : col - colSpan;
    const c1 = wide ? shoreCols - 1 : col + colSpan;
    for (let c = c0; c <= c1; c++) {
      if (r === row && c === col) continue;
      scan(r, c);
    }
  }
  if (best === Infinity) return Infinity;
  return 2 * Math.asin(Math.min(1, Math.sqrt(best) / 2)) * unitsPerRadian;
}

/**
 * How wide the shore is here, in world units.
 *
 * **Not every coast is a beach, and a ramp of one width round every landmass
 * would be the same mistake as the one flat green the biome work replaced.**
 * Two things narrow it, and both are already on the planet:
 *
 * - **Mountains reach the sea.** `orogeny` is the same threshold on the same
 *   swell that decides where the ridged noise is allowed to build ranges, and
 *   `rangeHeight` is the named ones. Where either says this is high country the
 *   shore is a bluff, which is Norway, Chile, British Columbia and the Aegean.
 * - **Bays.** One slow noise, so the wide shores come in stretches of a couple
 *   of thousand units rather than a fringe of even width. It has to be a smooth
 *   field of the *point* and not a property of the nearest segment: the nearest
 *   segment changes discontinuously as you walk along a coast, and a width that
 *   jumped with it would be a step in the ground.
 */
let shoreRocky = 0;

function shoreWidthAt(x: number, y: number, z: number): number {
  // The hinterland: what the relief here would be if this were not a coast. It
  // is the same `swell + ridges` the rest of the file builds, with the shore
  // fade left off — and leaving the fade off is the whole point, because the
  // fade is precisely what makes every coast on the planet read as flat when
  // you ask it directly. Measured at real coasts: Almeria 15, Florida 21, the
  // Baltic 26, Mauritania 40, the Norwegian fjords 71, Chilean Patagonia 180.
  const swelling = fbm(x * SWELL_FREQUENCY, y * SWELL_FREQUENCY, z * SWELL_FREQUENCY, 4);
  const amplitude = Math.max(
    NOISE_RANGE_HEIGHT * smoothstep(0.55, 0.80, swelling),
    rangeHeight(x, y, z),
  );
  // `MASSIF_FLOOR` of the amplitude rather than the ridged noise on top of it:
  // the massif is the part that is there whatever the ridges do, and asking for
  // the ridges as well is five more octaves of noise for a threshold. Measured
  // at real coasts: Almeria 15, Florida 21, the Baltic 26, Mauritania 35, the
  // Norwegian fjords 48, Queensland 57, Chilean Patagonia 122.
  shoreRocky = smoothstep(25, 70, SWELL_HEIGHT * swelling + amplitude * MASSIF_FLOOR);

  const bays = smoothstep(
    0.30,
    0.70,
    fbm(x * SHORE_BAY_FREQUENCY, y * SHORE_BAY_FREQUENCY, z * SHORE_BAY_FREQUENCY, 2),
  );
  return SHORE_BLUFF + (SHORE_RAMP - SHORE_BLUFF) * (1 - shoreRocky) * bays;
}

/**
 * How far the shelf has fallen towards the water here: 0 inland, 1 at the
 * waterline.
 *
 * Exported because the ground is not the only thing that wants it — `biome.ts`
 * turns the same number into sand, so the colour of a beach and the shape of one
 * cannot come apart.
 */
export interface ShoreSample {
  /** How far the shelf has fallen towards the water: 0 inland, 1 at the edge. */
  fall: number;
  /**
   * How much of this shore is loose ground rather than rock, 0 to 1.
   *
   * It is the hinterland turned round — a shore under a massif is scree and a
   * shore under a plain is sediment — and it is here rather than in the caller
   * because it comes out of the same evaluation the ramp's own width does. One
   * query answers both, and a beach that was wide where it was not sandy would
   * be two laws disagreeing about the same coast.
   */
  sand: number;
}

export function shoreSample(): ShoreSample {
  return { fall: 0, sand: 0 };
}

/** Fills `target` with the shore at a point on the unit sphere. */
export function shoreAt(x: number, y: number, z: number, target: ShoreSample): ShoreSample {
  if (!queried) beginQueries();
  const lat = Math.asin(clamp(y, -1, 1)) / DEG;
  const lon = Math.atan2(-z, x) / DEG;
  shoreRocky = 0;
  target.fall = shoreFall(x, y, z, lat, lon, shoreDistance(lat, lon) - COAST_CELL * 0.5);
  target.sand = target.fall > 0 ? 1 - shoreRocky : 0;
  return target;
}

function shoreFall(
  x: number,
  y: number,
  z: number,
  lat: number,
  lon: number,
  coarse: number,
): number {
  if (shoreHead === null || coarse > shoreGate) return 0;
  const distance = nearestShore(x, y, z, lat, lon);
  if (!(distance < SHORE_RAMP)) return 0;
  const width = shoreWidthAt(x, y, z);
  if (distance >= width) return 0;
  // **Linear, and that is a triangle budget rather than a shape.** The ramp is
  // the same drop either way, but a smoothstep curves all the way across the
  // band and the mesh refines against curvature, so it pays over the whole
  // width; a straight ramp is two creases with a plane between them and only
  // the creases cost anything. Measured, same shore, 1,180,533 triangles
  // against 1,298,698 — 118,000 for a difference you cannot see at a gradient
  // of an eighth. The creases are not a cost either: `OutlineEffect` inks the
  // break of slope at the top of a beach, which is what a berm looks like.
  return 1 - distance / width;
}

/**
 * Widest footprint the monument contract allows, in world units.
 *
 * `contract.ts` caps `building` and `landmark` at 55, and that is what a site
 * gets when it does not declare its own. The number is copied rather than
 * imported on purpose: this file is the bottom of the stack — `geo.ts` and
 * `globe.ts` both sit on it — and the monument contract is the top of it, so
 * importing it back would invert the whole dependency and drag Vite's
 * `import.meta.glob` into Node with it.
 */
const MAX_FOOTPRINT = 55;

/**
 * Level ground kept outside the model's own edge, in world units.
 *
 * The pad is a level disc and the mesh is triangles, so the two disagree at the
 * rim: a triangle with one corner inside the disc and the rest out on the skirt
 * is a flat sheet cutting across the lip, and it dips under the pad *inside*
 * the rim by however far it reaches. The error test only bounds edges, never
 * triangle interiors, so the only defence is distance — this margin — and the
 * length of the edges near the rim, which `globe.ts` now shortens under a pad
 * the same way it already tightened the error budget there.
 *
 * Both were measured over all 65 footprints, ray-casting the built mesh: at
 * this margin the shortened edges take the worst gap under a model from 2.24
 * units to 1.68, a quarter of an avatar. It used to be 35 units of margin — one
 * and a half untightened `MIN_EDGE` — for 1.03, and that margin is where a
 * 90-unit pad under a 55-unit model came from.
 */
const PAD_MARGIN = 20;

/**
 * Radius of the level ground under a monument that declares no footprint.
 *
 * `placement.ts` asks for the ground once, at the centre, and stands the model
 * on it along the radius — not along the terrain's normal — so the ground under
 * the footprint has to be level, and level about *that* sample. That much is
 * forced. What is not forced is how much ground past the model also has to be
 * level, and the answer is: none of it beyond the margin above.
 *
 * It stays exported and it is still one number for a site that does not say,
 * but `FlattenSite.footprint` is read when it is there, and a fifth of the
 * models are nowhere near the cap: Big Ben declares 10 and the Space Needle
 * 11.3, so today they stand in the middle of 150 units of level ground for a
 * model 20 across. That is the shelf you can see from the air.
 */
export const FLATTEN_RADIUS = MAX_FOOTPRINT + PAD_MARGIN;

/**
 * How far the skirt takes to reach its full slope, in world units.
 *
 * The pad ends in a break of slope, not a fillet, because that is what a cut
 * bench actually ends in and because `OutlineEffect` inks every crease. But a
 * break from level to 60 degrees in one triangle is a step, so the skirt opens
 * quadratically over this distance and only then runs straight. Four times the
 * finest edge `globe.ts` will build under a pad, so the mesh can draw the
 * opening rather than average it away.
 */
const SKIRT_LIP = 30;

/**
 * Where the skirt is built to land, as a multiple of the pad's own radius.
 *
 * The only real lever there is. A level disc of radius `r` cut into a slope `s`
 * has to move `r*s` of ground, and that has to be given back somewhere: over a
 * short skirt as a steep bank, over a long one as a gentle ramp. On a uniform
 * slope, landing at four radii puts the ramp at about half as steep again as
 * the hill it is cut into: measured down the Himalayan front below Everest, the
 * skirt runs at 0.55 where the land runs at 0.37. Over the 65 sites the steepest
 * gradient any pad now adds is 1.46, against 2.24 for the fixed-width blend it
 * replaces — which is precisely why that one read as a mesa. Raising this buys
 * less and less: the ramp can never be gentler than the hill it lands on.
 */
const SKIRT_REACH = 4;

/**
 * Gentlest skirt ever built, as a gradient. About 14 degrees.
 *
 * Only a floor, and on a plain it is the whole story: there the pad has nothing
 * to give back, the skirt has no length, and the monument stands on ground that
 * was already flat. Giza is not supposed to be able to tell.
 */
const SKIRT_FLOOR = 0.25;

/** Bearings sampled around a site to work out how steep its skirt must be. */
const SKIRT_PROBES = 64;

/**
 * How much of the correction the skirt has given back `distance` units out.
 *
 * Quadratic at the rim, straight after it. The straight part is the point: a
 * correction reduced at a constant rate per unit of ground turns a level pad
 * into a ramp of exactly that gradient, whatever the hill under it is doing,
 * and the ramp simply stops where it meets the land. That is one facet with a
 * crease at each end instead of a swelling, and it is what makes a pad on a
 * ridge read as a shoulder.
 */
function spent(distance: number): number {
  return distance <= 0 ? 0 : (distance * distance) / (distance + SKIRT_LIP);
}

/**
 * `SHORE_LIP` above the sea, as a relief: the ceiling on a pad that stands over
 * water.
 *
 * **A pad may cut the land down; it may not build it back up at the water's
 * edge**, and until this constant existed every coastal pad did exactly that.
 * The level is the land at the site's own centre, so a monument whose centre
 * sits inland of the shore ramp holds the full `LAND_SHELF` right out to the
 * ring boundary — which puts back, under the model, the vertical coast the ramp
 * was written to delete. Measured on the seaward transect, last land point
 * before the water, pads off against pads on: Sydney's opera house **7.1 ->
 * 21.0**, the Parthenon 6.3 -> 14.2, St Peter's 4.4 -> 10.9. Those were exactly
 * the three of the thirteen overhanging monuments whose drop was more than an
 * avatar, and the cliff under them was this ceiling's absence and not the
 * coastline's shape.
 *
 * The ceiling is the lip and nothing softer, because the land the pad's rim has
 * to meet is the *last* land and the last land on this planet is the lip. What
 * it costs is a bench: the pad, plus a skirt four times its core, comes down to
 * the waterline. At Sydney that is a basin 500 units across at the head of the
 * harbour, at a gradient of 0.15 — which is what a harbour looks like, and is
 * the trade for a podium that no longer floats.
 */
const SHORE_CEILING = SHORE_LIP - LAND_SHELF;

/** Where a monument stands, and how much room its model needs to stand on. */
export interface FlattenSite {
  lat: number;
  lon: number;
  /** Radius of the model's own footprint. Defaults to the contract's widest. */
  footprint?: number;
  /**
   * How much same-shelf ground the bake found around it, capped at `footprint`.
   *
   * Short of the footprint means the model stands over water, and a pad that
   * does may not stand higher than the shore — see `SHORE_CEILING`.
   *
   * **It is read rather than measured here, and that is deliberate for the same
   * reason `footprint` is.** Whether a footprint reaches water is a question
   * about the *outlines*, `build-monuments.ts` already answers it — probe rings
   * of `SEAT_STEP` along `SEAT_BEARINGS`, which is also what decides whether a
   * monument gets nudged inland — and `pnpm check` measures it a third time and
   * fails if the bake is stale. A second sweep here would be a second
   * definition of one number, and it was written that way first: at four rings
   * and 32 bearings against the bake's fourteen and 24 it is *finer*, so it
   * found water under St Peter's and the Guggenheim that the bake had not, put
   * their pads at the waterline, and flattened the shore ramp along 30 km of
   * the Roman coast — which `pnpm check`'s own *the ground rises as you walk in
   * from the water* caught, at 9 of 10.
   */
  clearance?: number;
}

/** Unit vectors of the sites, set once, before anything asks about the ground. */
let siteDirection: Float64Array | null = null;
/** Radius of the level ground at each site, and where its skirt has to end. */
let siteCore: Float64Array | null = null;
let siteReach: Float64Array | null = null;
/** Highest each pad may stand, `SHORE_CEILING` where the model is over water. */
let siteCeiling: Float64Array | null = null;
/** Gradient of each site's skirt, worked out from the land it is cut into. */
let siteSlope: Float64Array | null = null;
/** Pad height per site, worked out on the first query; see `beginQueries`. */
let siteHeight: Float64Array | null = null;
/** Sites per cell of a coarse lat/lon grid, so most queries cost one lookup. */
let siteGrid: number[][] | null = null;
let queried = false;

const SITE_CELL = 4;
const SITE_COLS = Math.round(360 / SITE_CELL);
const SITE_ROWS = Math.round(180 / SITE_CELL);

/**
 * Declares the places the relief has to be flat, once, before it is asked
 * anything.
 *
 * The pads have to live in this function rather than in `placement.ts` for the
 * same reason the relief does: `globe.ts` builds the mesh from `reliefAt` and
 * `geo.ts` sends the player's feet to the same number, and a pad that only one
 * of them knew about is exactly the disagreement this file exists to prevent.
 * Flattening the mesh instead would put the monument on visible ground the
 * player falls through.
 *
 * It throws rather than allowing a second call or a late one, because both are
 * silent: the mesh is built once, and terrain that changed afterwards would
 * leave a planet whose ground no longer matches what you can see. `main.ts`
 * loads the placements before `loadWorld` for this reason.
 */
export function setFlattenSites(sites: readonly FlattenSite[]): void {
  if (queried) {
    throw new Error(
      'terrain: setFlattenSites after the relief was queried — the mesh and elevationAt would disagree',
    );
  }
  if (siteDirection !== null) throw new Error('terrain: setFlattenSites called twice');
  // Copied out now, so nothing the caller does to its list later can change the
  // shape of a planet that has already been built.
  const directions = new Float64Array(sites.length * 3);
  const cores = new Float64Array(sites.length);
  const ceilings = new Float64Array(sites.length);
  sites.forEach((site, i) => {
    const cos = Math.cos(site.lat * DEG);
    directions[i * 3] = cos * Math.cos(site.lon * DEG);
    directions[i * 3 + 1] = Math.sin(site.lat * DEG);
    // Negative, like every other conversion in the repo. With `+sin` this frame
    // is the mirror image of the world's, so each pad lands at longitude `-lon`
    // — and because the sites are only ever compared with each other, nothing
    // downstream can tell. See the assertion in `check-world.ts`.
    directions[i * 3 + 2] = -cos * Math.sin(site.lon * DEG);
    // A footprint the contract could not have issued is a bug upstream, and
    // clamping it is cheaper than a pad the size of a country.
    const footprint = site.footprint;
    const declared = footprint === undefined || !(footprint > 0) ? MAX_FOOTPRINT : footprint;
    cores[i] = Math.min(declared, MAX_FOOTPRINT) + PAD_MARGIN;
    // A site that does not say is a site that stands on land, which is what a
    // bake older than this field means and what a hand-written one means too.
    ceilings[i] = site.clearance !== undefined && site.clearance < declared
      ? SHORE_CEILING
      : Infinity;
  });
  siteDirection = directions;
  siteCore = cores;
  siteCeiling = ceilings;
}

/**
 * Places the mesh has to resolve finely, though the ground there stays as it is.
 *
 * **This is not a pad and it does not flatten anything.** It exists because of a
 * failure that is invisible in `pnpm check` and obvious on screen: a settlement
 * lays paving from `elevationAt`, which is the exact relief, while the land
 * around it is a triangulation of that relief carrying up to `RELIEF_SAG` of
 * error — and in flat country a whole town fits inside a single mesh triangle,
 * so the sign of the disagreement is constant across it and the triangle's own
 * edge draws a straight line through the paving. Measured over 529 settlements
 * before this existed: median -0.16, p99 +1.94, worst +5.11 units, and about one
 * town in twelve showed the seam.
 *
 * The answer is the one the monument pads already use — tighten the error
 * budget where it matters and nowhere else — with the flattening left out,
 * because a town is meant to sit on the hill rather than level it.
 */
let detailDirection: Float64Array | null = null;
let detailReach: Float64Array | null = null;
let detailGrid: number[][] | null = null;

/** How far past its own radius a settlement keeps the mesh fine. */
const DETAIL_MARGIN = 1.6;

export interface DetailSite {
  lat: number;
  lon: number;
  /** The settlement's built radius, in world units. `places.radiusFor(pop)`. */
  radius: number;
}

/**
 * Declares them, once, before anything asks about the ground — same contract as
 * `setFlattenSites` and for the same reason: the mesh is built once, and terrain
 * that changed afterwards would leave a planet whose ground no longer matches
 * what you can see.
 */
export function setDetailSites(sites: readonly DetailSite[]): void {
  if (queried) {
    throw new Error('terrain: setDetailSites after the relief was queried');
  }
  if (detailDirection !== null) throw new Error('terrain: setDetailSites called twice');
  const directions = new Float64Array(sites.length * 3);
  const reach = new Float64Array(sites.length);
  sites.forEach((site, i) => {
    const cos = Math.cos(site.lat * DEG);
    directions[i * 3] = cos * Math.cos(site.lon * DEG);
    directions[i * 3 + 1] = Math.sin(site.lat * DEG);
    directions[i * 3 + 2] = -cos * Math.sin(site.lon * DEG);
    reach[i] = Math.max(0, site.radius) * DETAIL_MARGIN;
  });
  detailDirection = directions;
  detailReach = reach;
}

/**
 * Buckets them, on the first query rather than in the setter.
 *
 * `setDetailSites` runs before `loadWorld` — it has to, the mesh is built from
 * the answer — and `unitsPerRadian` is not known until `prepareTerrain`. So the
 * setter cannot turn a radius in world units into a span in degrees, and the
 * first version of this divided by zero and indexed the grid with `NaN`.
 */
function buildDetailGrid(): number[][] {
  const directions = detailDirection!;
  const reach = detailReach!;
  const grid: number[][] = Array.from({ length: SITE_COLS * SITE_ROWS }, () => []);
  for (let i = 0; i < reach.length; i++) {
    const y = directions[i * 3 + 1]!;
    const lat = Math.asin(y < -1 ? -1 : y > 1 ? 1 : y) / DEG;
    const lon = Math.atan2(-directions[i * 3 + 2]!, directions[i * 3]!) / DEG;
    // Registered in every cell its disc touches, so a query only ever looks at
    // the one cell it is in. A reach of at most a few tenths of a degree
    // against four-degree cells means that is nearly always one cell.
    const span = reach[i]! / unitsPerRadian / DEG;
    const lonSpan = Math.min(180, span / Math.max(0.02, Math.cos(lat * DEG)));
    const c0 = Math.floor((lon - lonSpan + 180) / SITE_CELL);
    const c1 = Math.floor((lon + lonSpan + 180) / SITE_CELL);
    const r0 = Math.max(0, Math.floor((90 - lat - span) / SITE_CELL));
    const r1 = Math.min(SITE_ROWS - 1, Math.floor((90 - lat + span) / SITE_CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        grid[r * SITE_COLS + (((c % SITE_COLS) + SITE_COLS) % SITE_COLS)]!.push(i);
      }
    }
  }
  return grid;
}

/** 1 inside a settlement, tapering to 0 at its margin, 0 everywhere else. */
export function detailWeightAt(x: number, y: number, z: number): number {
  if (detailDirection === null) return 0;
  const grid = detailGrid ?? (detailGrid = buildDetailGrid());
  const lat = Math.asin(y < -1 ? -1 : y > 1 ? 1 : y) / DEG;
  const lon = Math.atan2(-z, x) / DEG;
  const cell =
    Math.min(SITE_ROWS - 1, Math.max(0, Math.floor((90 - lat) / SITE_CELL))) * SITE_COLS +
    (((Math.floor((lon + 180) / SITE_CELL) % SITE_COLS) + SITE_COLS) % SITE_COLS);
  const here = grid[cell]!;
  if (here.length === 0) return 0;
  const directions = detailDirection;
  const reach = detailReach!;
  let best = 0;
  for (const i of here) {
    const dot =
      x * directions[i * 3]! + y * directions[i * 3 + 1]! + z * directions[i * 3 + 2]!;
    const distance = Math.acos(dot < -1 ? -1 : dot > 1 ? 1 : dot) * unitsPerRadian;
    const r = reach[i]!;
    if (distance >= r) continue;
    const core = r / DETAIL_MARGIN;
    const t = 1 - Math.max(0, (distance - core) / (r - core));
    const eased = t * t * (3 - 2 * t);
    if (eased > best) best = eased;
    if (best >= 0.999) break;
  }
  return best;
}


/**
 * Freezes the terrain: the first question closes the door on `setFlattenSites`
 * and works out, per site, the level to hold and how steep a skirt it takes to
 * get back to the land.
 *
 * The level is the land under the monument's own centre — rather than the
 * average or the lowest point under the pad — so that a summit stays a summit
 * and, the reason it matters, so that the single sample `placement.ts` takes at
 * the centre is the right one by construction. The one thing allowed to lower
 * it is the shore: see `reachesWater`. The exception is monuments whose
 * pads overlap, and it is not really one: `build-monuments.ts` separates any
 * two whose *footprints* touch, so pads that still overlap are pads that
 * overlap only across their margins, and the two are standing in the same
 * place. They are given one level between them, because the alternative is not
 * two heights but a warped shared terrace: a point inside one pad would be
 * pulled part of the way towards the other's, by an amount that changes as you
 * cross it. Where a chain of them meets — the Sphinx and the pyramids — one
 * level makes one plaza.
 *
 * The gradient is measured rather than chosen. Walking out to where the skirt
 * should land, along `SKIRT_PROBES` bearings, gives the worst height it has to
 * give back, and dividing by the ground it has to do it in gives the gentlest
 * gradient that still lands there. A site on a plain gets `SKIRT_FLOOR` and a
 * skirt of no length; a site on the front of the Himalaya gets whatever the
 * Himalaya costs. Nothing here is tuned per site, and no site is named.
 */
function beginQueries(): void {
  queried = true;
  const directions = siteDirection;
  const cores = siteCore;
  if (directions === null || cores === null || directions.length === 0) return;

  const ceilings = siteCeiling;
  const count = directions.length / 3;
  const heights = new Float64Array(count);
  const slopes = new Float64Array(count);
  const reaches = new Float64Array(count);
  let furthest = 0;

  for (let i = 0; i < count; i++) {
    heights[i] = rawReliefAt(directions[i * 3]!, directions[i * 3 + 1]!, directions[i * 3 + 2]!);
    reaches[i] = cores[i]! * SKIRT_REACH;
    if (reaches[i]! > furthest) furthest = reaches[i]!;
  }

  // Pads that overlap take the mean of their levels. Union-find over the pairs
  // whose pads touch, so a chain of three settles on one plaza rather than on
  // three pairwise compromises that no two of them agree about.
  const parent = new Int32Array(count).map((_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (parent[r]! !== r) r = parent[r]!;
    while (parent[i]! !== i) {
      const next = parent[i]!;
      parent[i] = r;
      i = next;
    }
    return r;
  };
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const dot = directions[i * 3]! * directions[j * 3]! +
        directions[i * 3 + 1]! * directions[j * 3 + 1]! +
        directions[i * 3 + 2]! * directions[j * 3 + 2]!;
      if (Math.acos(clamp(dot, -1, 1)) * unitsPerRadian >= cores[i]! + cores[j]!) continue;
      const a = root(i);
      const b = root(j);
      if (a !== b) parent[a] = b;
    }
  }
  const clusterSum = new Float64Array(count);
  const clusterCount = new Int32Array(count);
  const clusterCeiling = new Float64Array(count).fill(Infinity);
  for (let i = 0; i < count; i++) {
    const r = root(i);
    clusterSum[r] = clusterSum[r]! + heights[i]!;
    clusterCount[r] = clusterCount[r]! + 1;
    const ceiling = ceilings?.[i] ?? Infinity;
    if (ceiling < clusterCeiling[r]!) clusterCeiling[r] = ceiling;
  }
  // The shore's ceiling is applied to the cluster and not to the member, and
  // that is the whole of why Sydney was the worst of the thirteen. The opera
  // house's own land is 8.8 units and the harbour bridge's, 109 units away
  // inland, is 33.2; their pads overlap across their margins, so the mean gave
  // the opera house **21.0** and stood a fifth of its podium that far over open
  // water. Capping the member and not the cluster only halves it — the mean
  // pulls it straight back up — and giving the two different levels is the
  // warped terrace this averaging exists to prevent. One level, and the lowest
  // ceiling in the cluster owns it: they are both on the same harbour.
  for (let i = 0; i < count; i++) {
    const r = root(i);
    const level = clusterCount[r]! > 1 ? clusterSum[r]! / clusterCount[r]! : heights[i]!;
    heights[i] = Math.min(level, clusterCeiling[r]!);
  }

  for (let i = 0; i < count; i++) {
    const x = directions[i * 3]!;
    const y = directions[i * 3 + 1]!;
    const z = directions[i * 3 + 2]!;

    // A tangent frame at the site, so the probes can walk out along a bearing.
    // North projected onto the tangent plane, and the other axis from the cross
    // product. Deliberately not named east or west: which one it is depends on
    // the handedness of the lat/lon-to-xyz mapping, and nothing here cares —
    // the loop below sweeps the whole circle, so the frame only decides which
    // probe index points where. At a pole north degenerates and the fallback is
    // any direction at all, for the same reason.
    let nx = -x * y;
    let ny = 1 - y * y;
    let nz = -z * y;
    let length = Math.hypot(nx, ny, nz);
    if (length < 1e-9) {
      nx = 1 - x * x;
      ny = -x * y;
      nz = -x * z;
      length = Math.hypot(nx, ny, nz) || 1;
    }
    nx /= length;
    ny /= length;
    nz /= length;
    const ax = ny * z - nz * y;
    const ay = nz * x - nx * z;
    const az = nx * y - ny * x;

    const level = heights[i]!;
    const angle = reaches[i]! / unitsPerRadian;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const budget = spent(reaches[i]! - cores[i]!);
    let steepest = SKIRT_FLOOR;
    for (let p = 0; p < SKIRT_PROBES; p++) {
      const bearing = (p / SKIRT_PROBES) * 2 * Math.PI;
      const cb = Math.cos(bearing);
      const sb = Math.sin(bearing);
      const px = x * cosine + (nx * cb + ax * sb) * sine;
      const py = y * cosine + (ny * cb + ay * sb) * sine;
      const pz = z * cosine + (nz * cb + az * sb) * sine;
      const drop = Math.abs(level - rawReliefAt(px, py, pz)) / budget;
      if (drop > steepest) steepest = drop;
    }
    slopes[i] = steepest;
  }
  siteHeight = heights;
  siteSlope = slopes;
  siteReach = reaches;

  // A cell keeps every site whose skirt can reach it. Tested against the cell's
  // centre in three dimensions and with the cell's own half-diagonal added, so
  // the poles and the antimeridian need no special case: a site at the South
  // Pole simply lands in every cell of the bottom row.
  const cosReach = Math.cos(furthest / unitsPerRadian + SITE_CELL * DEG);
  const grid: number[][] = Array.from({ length: SITE_COLS * SITE_ROWS }, () => []);
  for (let r = 0; r < SITE_ROWS; r++) {
    const lat = (90 - (r + 0.5) * SITE_CELL) * DEG;
    for (let c = 0; c < SITE_COLS; c++) {
      const lon = (-180 + (c + 0.5) * SITE_CELL) * DEG;
      const cx = Math.cos(lat) * Math.cos(lon);
      const cy = Math.sin(lat);
      const cz = -Math.cos(lat) * Math.sin(lon);
      const cell = grid[r * SITE_COLS + c]!;
      for (let i = 0; i < count; i++) {
        const dot = cx * directions[i * 3]! + cy * directions[i * 3 + 1]! + cz * directions[i * 3 + 2]!;
        if (dot > cosReach) cell.push(i);
      }
    }
  }
  siteGrid = grid;
}

/** Strength of the flattening at the point last looked up, and its height. */
let padWeight = 0;
let padLevel = 0;

/**
 * Reads the pads at a point into `padWeight` and `padLevel`, given the height
 * the noise alone would have put there.
 *
 * The correction a pad wants at a point is the whole difference between its
 * level and the land, and the only question this answers is how much of it
 * still applies out here. Inside the pad, all of it. Outside, the skirt gives it
 * back at its own fixed gradient and the correction is whatever survives — so
 * where the land is already at the pad's level there is nothing to give back
 * and the skirt has no length at all, and where the land falls away the skirt
 * runs on until it catches up. It is the same rule in both directions, which is
 * why a pad on a ridge stretches into a spur down the fall lines and stops dead
 * across the contour, and why one on a plain cannot be seen.
 *
 * Where several pads reach the same point the levels are mixed by the *odds* of
 * their weights, `w / (1 - w)`, and not by the weights themselves. That is not
 * a refinement, it is the flatness: a mean weighted by `w` lets a pad two
 * hundred units away drag the ground inside another one off level by its own
 * share, which is a bowl under a monument rather than a plane. Odds go to
 * infinity as a pad takes full hold, so inside a pad the answer is that pad's
 * level and nothing else, and outside it the mixture is still smooth.
 */
function lookUpPads(x: number, y: number, z: number, lat: number, lon: number, land: number): void {
  padWeight = 0;
  padLevel = 0;
  const grid = siteGrid;
  const directions = siteDirection;
  const heights = siteHeight;
  const cores = siteCore;
  const reaches = siteReach;
  const slopes = siteSlope;
  if (grid === null || directions === null || heights === null) return;
  if (cores === null || reaches === null || slopes === null) return;

  const row = clamp(Math.floor((90 - lat) / SITE_CELL), 0, SITE_ROWS - 1);
  const col = clamp(Math.floor((lon + 180) / SITE_CELL), 0, SITE_COLS - 1);
  const cell = grid[row * SITE_COLS + col]!;
  if (cell.length === 0) return;

  let held = 0;
  let heldSum = 0;
  let oddsSum = 0;
  let oddsLevel = 0;
  for (const i of cell) {
    const dot = x * directions[i * 3]! + y * directions[i * 3 + 1]! + z * directions[i * 3 + 2]!;
    const distance = Math.acos(clamp(dot, -1, 1)) * unitsPerRadian;
    const core = cores[i]!;
    const reach = reaches[i]!;
    if (distance >= reach) continue;
    const rise = Math.abs(heights[i]! - land);
    const budget = slopes[i]! * spent(distance - core);
    // Inside the pad the skirt has spent nothing, so the pad holds outright —
    // including where the land is already at its level, which is every contour
    // line the level crosses and the centre point itself. The ratio below is
    // 0/0 there, and the limit of it inside the pad is one, not zero. Getting
    // that backwards leaves a thread of wrong height across the middle of a
    // pad, and `placement.ts` samples the ground at exactly the point on it.
    if (budget > 0 && budget >= rise) continue;
    const left = budget > 0 ? 1 - budget / rise : 1;
    // The skirt says how much of the correction is left; the reach says the pad
    // has no say at all out here. The second is not belt-and-braces. The skirt
    // is a clamp on how far the land may sit from the pad's level, and a clamp
    // has no idea how far away it is: on its own it re-engages on any high
    // ground beyond where it was built to land, so the Taj Mahal's pad reached
    // out and took the top off a hill 400 units away, and the Golden Gate's left
    // a 72-unit step where it was finally cut off. Because the reach only begins
    // to bite where the skirt has already given most of the correction back, it
    // costs the shape of the skirt almost nothing.
    const weight = left * smoothstep(reach, core, distance);
    if (weight >= 1) {
      heldSum += heights[i]!;
      held++;
    } else {
      const odds = weight / (1 - weight);
      oddsSum += odds;
      oddsLevel += odds * heights[i]!;
    }
    if (weight > padWeight) padWeight = weight;
  }
  // Two pads can only hold the same point outright if their pads overlap, and
  // `beginQueries` has already given those one level between them, so this
  // average is over identical numbers and the switch between the two branches
  // is continuous rather than a step under the edge of a model.
  if (held > 0) padLevel = heldSum / held;
  else if (oddsSum > 0) padLevel = oddsLevel / oddsSum;
}

/** How many `SKIRT_LIP` of rim `padClaim` below refines against. See its note. */
const CLAIM_LIPS = 2;

/**
 * How strongly a monument's pad claims this point, from 0 to 1.
 *
 * `globe.ts` tightens the mesh against it, in two ways: the error budget, and
 * the shortest edge it is willing to build. Three units of slack is fine for a
 * hillside and not fine here — something with a footprint is standing on this
 * ground — and the edge floor is what decides how near the rim a vertex can
 * land, which is the whole of `PAD_MARGIN`. Both are graded rather than
 * switched, so the triangles go on the rim, where the error is, and none inside
 * the pad, which is flat and refines to nothing.
 *
 * It is deliberately the geometry of the pad and not the correction the pad is
 * actually making: this is asked once per candidate edge of the land mesh, and
 * the correction would cost a second evaluation of the noise for every one of
 * them. Claiming the rim in every direction, including the ones where the skirt
 * turned out to have no length, over-refines a little and can never under-
 * refine, which is the right way round.
 *
 * The band it claims outside the pad is two `SKIRT_LIP`, and that is measured
 * rather than chosen. It used to be one, back when every pad was the widest the
 * contract allows: at that width the rim was so far from the model that the
 * second lip changed nothing and cost 4,700 triangles. Real footprints arrived
 * with `monuments.json`, the pads shrank, and the rims came in with them —
 * Big Ben's from 75 units out to 30 — so the ink of the rim is now inside the
 * ground the model stands on and the second lip pays for itself.
 */
function padClaim(x: number, y: number, z: number, lat: number, lon: number): number {
  const grid = siteGrid;
  const directions = siteDirection;
  const cores = siteCore;
  if (grid === null || directions === null || cores === null) return 0;

  const row = clamp(Math.floor((90 - lat) / SITE_CELL), 0, SITE_ROWS - 1);
  const col = clamp(Math.floor((lon + 180) / SITE_CELL), 0, SITE_COLS - 1);
  const cell = grid[row * SITE_COLS + col]!;
  if (cell.length === 0) return 0;

  let best = 0;
  for (const i of cell) {
    const dot = x * directions[i * 3]! + y * directions[i * 3 + 1]! + z * directions[i * 3 + 2]!;
    const distance = Math.acos(clamp(dot, -1, 1)) * unitsPerRadian;
    const core = cores[i]!;
    const claim = smoothstep(core + CLAIM_LIPS * SKIRT_LIP, core, distance);
    if (claim > best) best = claim;
  }
  return best;
}

/** See `padClaim`. Kept as the name `globe.ts` has always asked for. */
export function flattenWeightAt(x: number, y: number, z: number): number {
  if (!queried) beginQueries();
  return padClaim(x, y, z, Math.asin(clamp(y, -1, 1)) / DEG, Math.atan2(-z, x) / DEG);
}

/**
 * Height of the land above its ring's shelf, at a point on the unit sphere.
 *
 * Bounded below by `SHORE_LIP - LAND_SHELF` and above by `MAX_RELIEF`, and both
 * bounds are by construction rather than by clamping the answer: the shore ramp
 * is the only negative term and it is a fraction of a fixed drop, everything
 * else is floored at zero, and the pads only ever mix two values that already
 * obey both. It used to be non-negative outright, which is what let the ocean
 * sphere be the one thing here that is not a heightfield — the ramp keeps that
 * promise a different way, by never coming down further than the lip.
 */
export function reliefAt(x: number, y: number, z: number): number {
  if (!queried) beginQueries();
  const lat = Math.asin(clamp(y, -1, 1)) / DEG;
  const lon = Math.atan2(-z, x) / DEG;
  const relief = rawRelief(x, y, z, lat, lon);
  if (siteGrid === null) return relief;
  lookUpPads(x, y, z, lat, lon, relief);
  return relief + (padLevel - relief) * padWeight;
}

/** `rawRelief` at a point on the unit sphere, for the probes in `beginQueries`. */
function rawReliefAt(x: number, y: number, z: number): number {
  return rawRelief(x, y, z, Math.asin(clamp(y, -1, 1)) / DEG, Math.atan2(-z, x) / DEG);
}

/** The land as the noise alone would have it, before any monument flattens it. */
function rawRelief(x: number, y: number, z: number, lat: number, lon: number): number {
  // The first land cell centre is one cell from the sea, and the shore runs
  // somewhere between the two, so a point on it samples about half a cell.
  // Subtracting that puts the zero of the fade on the water's edge.
  const coarse = shoreDistance(lat, lon) - COAST_CELL * 0.5;

  // The shore ramp, and it is the only term here that is ever negative: the
  // shelf gives back all but `SHORE_LIP` of its height as it reaches the water,
  // so the land slopes into the sea instead of ending in a wall. It is bounded
  // by construction — `shoreFall` is in [0,1] — which is what lets everything
  // downstream go on assuming the lowest ground on the planet is above the sea.
  const shore = -(LAND_SHELF - SHORE_LIP) * shoreFall(x, y, z, lat, lon, coarse);

  const inland = smoothstep(0, SHORE_SPAN, coarse);
  // The whole coastline returns here, and the coastline is most of the mesh:
  // 97,280 outline points and every wall vertex under them. The ramp is what it
  // returns now, and it is the only thing the coastline pays for.
  if (inland <= 0) return shore;

  // One field, read twice: how high the ground lies, and — above a threshold —
  // whether it lies high enough to have mountains on it. Two separate noises
  // would cost half as much again for a distinction nothing can see, and this
  // way the ranges sit on the high ground rather than crossing it at random.
  // Without the mask the ridged noise covers the planet in an even corduroy;
  // with it the ranges are events, and the plains between them are smooth and
  // therefore nearly free in triangles.
  const swelling = fbm(x * SWELL_FREQUENCY, y * SWELL_FREQUENCY, z * SWELL_FREQUENCY, 4);
  const swell = SWELL_HEIGHT * swelling;
  const orogeny = smoothstep(0.55, 0.80, swelling);
  const amplitude = Math.max(NOISE_RANGE_HEIGHT * orogeny, rangeHeight(x, y, z));
  // A range is a massif with peaks on it, not a field of peaks. The ridged
  // noise spends most of its range near zero — that is what makes it look like
  // ridges — so used raw it puts the ground in a valley almost everywhere and
  // the declared height of a range shows up only on the few crests that reach
  // it. Standing in the Alps you would be on a plain with a hill in the
  // distance. `MASSIF_FLOOR` lifts the whole footprint instead, and the noise
  // shapes the top third of it.
  const ridges = amplitude > 0.5
    ? amplitude * (MASSIF_FLOOR + (1 - MASSIF_FLOOR)
      * ridged(x * RIDGE_FREQUENCY, y * RIDGE_FREQUENCY, z * RIDGE_FREQUENCY, RIDGE_OCTAVES))
    : 0;

  // Modulated by the same swell that gates the ranges, so the Sahara and the
  // Amazon keep their plains and the cost lands where the hills are.
  const downs = DOWNS_HEIGHT
    * (DOWNS_LOW + (1 - DOWNS_LOW) * smoothstep(0.30, 0.65, swelling))
    * (ridged(x * DOWNS_FREQUENCY, y * DOWNS_FREQUENCY, z * DOWNS_FREQUENCY, DOWNS_OCTAVES)
      - DOWNS_MEAN);

  // The downs are the one term that can be negative above the shelf, so the
  // floor is here rather than in the caller: it puts the trough of a hollow on
  // the plain the world already has everywhere, which is invisible, instead of
  // cutting it down to the shore lip, which would be a dry lake bed inland.
  // Measured, it binds on 0.8% of the land.
  return shore + Math.min(MAX_RELIEF, Math.max(0, inland * (swell + ridges + downs)));
}
