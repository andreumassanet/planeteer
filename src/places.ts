import * as THREE from 'three';
import { DATA_URL, decodePlaces, inflate } from './pack.ts';
import { toUnit, unitAt } from './sphere.ts';

/**
 * The populated places, and the one question worth asking of them: what is the
 * nearest, and are you in it?
 *
 * The data is `public/data/places.bin`, baked by `scripts/build-places.mjs` from
 * GeoNames `cities5000` (CC BY 4.0), every row checked to sit on land and to
 * agree with `countryAt`. The bake thins it against `radiusFor`, since a
 * gazetteer lists one row per municipality; a city the thinning would delete is
 * kept smaller where it can be and carries its own radius (`radiusOf`).
 *
 * This module is not the settlement builder: it answers where you are, and what
 * gets built at a place is `settlements.ts`, which reads the same array.
 */
export interface Place {
  name: string;
  /** ADM0_A3, the same key the flags and the outlines use. */
  iso: string;
  lat: number;
  lon: number;
  /** GeoNames' own figure (the municipality, not the metro area), to three significant figures. */
  pop: number;
  capital?: boolean;
  /**
   * The built radius, in world units, only where the bake built this place
   * smaller than `radiusFor(pop)`: a city fitted between neighbours, or a host
   * that gave up ground to one. A whole unit; only `radiusOf` reads it.
   */
  radius?: number;
  /** The names of the places the bake folded into this one, biggest first, so searching for Kobe finds Osaka. See `Places.aliases`. */
  aliases?: readonly string[];
  /** How far the bake had to move it to get it onto land, in real km. */
  snappedKm?: number;
  /**
   * How far, in world units, to the nearest place of at least `PROMINENCE_RATIO`
   * times this one's rank, floored to a whole unit and capped at
   * `PROMINENCE_CAP`; a capital is stored at the cap. Baked by `prominenceField`;
   * only `isShown` reads it.
   */
  prominence: number;
  /** GeoNames' IANA time zone for the row (`America/Edmonton`), read by `clockAt` in `timezone.ts`. Empty on another world. */
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
  /** Where its buildings reach; see `radiusOf`. */
  radius: number;
  /** And where its name still reaches; see `labelRadiusOf`. */
  labelRadius: number;
  /** Inside the buildings. "Palma". */
  inside: boolean;
  /** Inside the name's reach, buildings or not. "near Palma". */
  near: boolean;
}

export interface Places {
  all: readonly Place[];
  /**
   * Every name in the file's `aliases` to the index in `all` of the built town it
   * stands for: the place it was folded into, or, where that place is hidden
   * (`isShown`), the built town nearest it in the same country; no entry where
   * the country has none built. Built on each call against the current
   * prominence radius; the menu asks once.
   */
  aliases(): Map<string, number>;
  /**
   * The closest built place to a point, by angle on the sphere, so altitude does
   * not enter into it. Never null; `near` says whether naming it would be a lie.
   */
  nearest(point: THREE.Vector3): Nearby;
}

const EARTH_KM = 6371;

/** The largest a settlement may be drawn, world units; the bake's thinning searches out to this plus its own radius. */
export const BIGGEST_SETTLEMENT = 150;
/** The smallest a settlement may be drawn, world units. */
export const SMALLEST_SETTLEMENT = 12;

/** The law's two constants; `populationFor` runs it backwards. */
const LAW_SCALE = 0.465;
const LAW_EXPONENT = 0.36;

/**
 * The built radius law: a settlement's radius in world units from its
 * population, `LAW_SCALE * pop ^ LAW_EXPONENT` clamped to the two bounds below.
 *
 * A city cannot be drawn at its own size: a single house is 12 units across, so
 * Tokyo's real 125-unit disc would hold about a hundred buildings. The law keeps
 * the ordering and gives up the ratio. The exponent is the hierarchy: a flat law
 * makes a place of five thousand and a place of half a million the same mark.
 *
 * - The floor (12) is the smallest thing that reads as a settlement: the plot
 *   lattice's pitch is 11 to 13 units, so 12 units is about three cells.
 * - The cap (150) is what one settlement may cost the streamer: no single town
 *   should take more than a fifth of the triangle budget.
 *
 * ```
 *   population      radius
 *        5,000        12.0     the floor of `cities5000`
 *       19,800        16.4     the median place in the file
 *      500,000        52.4
 *    2,000,000        86.3
 *    9,200,000       150.0     where the cap starts
 * ```
 *
 * The bake's thinning is a function of this law, so widening it silently makes
 * towns interpenetrate (the tightest pair clears by less than a unit). A cap
 * above about 132 puts Tianjin inside Beijing; they stand because the thinning
 * fits a big city between the neighbours it collides with (`FIT_POPULATION` in
 * `build-places.mjs`). Four other files read it: `build-places.mjs` thins
 * against it, `roads.ts` reads a road's class off it, `terrain.ts` refines the
 * land mesh under it, and `lights.ts` sizes a city's mark from it.
 */
export function radiusFor(pop: number): number {
  return Math.min(BIGGEST_SETTLEMENT, Math.max(SMALLEST_SETTLEMENT, LAW_SCALE * pop ** LAW_EXPONENT));
}

/** The law run backwards, unclamped: the population a place built at `radius` would have. Only `shadeOf` asks. */
export function populationFor(radius: number): number {
  return (radius / LAW_SCALE) ** (1 / LAW_EXPONENT);
}

/**
 * How big a place is built, and the one answer to it: its stored radius where
 * the bake fitted it smaller (`Place.radius`), the law's answer everywhere else.
 * Every consumer of a place's size asks this and not `radiusFor(place.pop)`,
 * because a fitted Kyoto is 43 units and a disc of the law's 77 would stand in
 * Osaka.
 */
export function radiusOf(place: { pop: number; radius?: number }): number {
  return place.radius ?? radiusFor(place.pop);
}

/**
 * How far out the land mesh has to stay fine under a settlement, as opposed to
 * how far its houses reach. `setDetailSites` tightens the triangulation's error
 * budget inside a disc of `radius * DETAIL_MARGIN` so the paving, laid from the
 * exact relief, meets the mesh you can see. The finest edge the mesh can build
 * is 7.33 units, so a 12-unit village (24 across) has nowhere to put a vertex;
 * this floor keeps the disc wide enough for the refinement to work in.
 */
const DETAIL_FLOOR = 20;

export function detailRadiusOf(place: { pop: number; radius?: number }): number {
  return Math.max(DETAIL_FLOOR, radiusOf(place));
}

/**
 * What the relief has to be told about a place before it is asked anything
 * (`setDetailSites` in `terrain.ts`): how far out the mesh stays fine and, for a
 * built town, the radius it stands in, which a town on steep ground opens a
 * valley to. The game, the road bake and every check that builds the land must
 * hand the relief the same list.
 */
export function terrainSiteOf(place: Place): { lat: number; lon: number; radius: number; valley: number } {
  return { lat: place.lat, lon: place.lon, radius: detailRadiusOf(place), valley: isShown(place) ? radiusOf(place) : 0 };
}

/**
 * How far out a place's name still applies beyond its last house. Inside
 * `radiusOf` the chip says *Palma*; in the band outside it says *near Palma*.
 * With the built radius alone the chip would name a place on 1.5% of the land
 * you can stand on; 220 names 40%, a country in the countryside and a city
 * where there is one.
 */
const APPROACH = 220;

export function labelRadiusOf(place: { pop: number; radius?: number }): number {
  return radiusOf(place) + APPROACH;
}

// Prominence: which places are built towns.

/**
 * A national capital ranks as a place of at least this many people: the one
 * departure from population order, which stops Valletta losing Malta to a
 * suburb. The bake's thinning and `prominenceField` both rank places, so the
 * number lives here.
 */
export const CAPITAL_RANK = 100_000;

export function rankOf(place: { pop: number; capital?: boolean }): number {
  return place.capital ? Math.max(place.pop, CAPITAL_RANK) : place.pop;
}

/**
 * The rank a place hides its neighbours with: its rank unless the bake built it
 * smaller than its population, then no more than the population its built
 * radius stands for (`populationFor`). A place is hidden by its fame and hides
 * by its size: a fitted Yangzhou with a prefecture figure of 4.56 M, built at 31
 * units, must not hide a city of 80 units. A fitted Kyoto is still hidden by what
 * is twice its population, because what it is called is why it was kept. Only
 * `prominenceField` and the bake's thinning ask this.
 */
export function shadeOf(place: { pop: number; capital?: boolean; radius?: number }): number {
  const rank = rankOf(place);
  return place.radius === undefined ? rank : Math.min(rank, populationFor(place.radius));
}

/**
 * A place is hidden when a place at least this many times its rank stands within
 * `PROMINENCE_RADIUS` of it. Baked into the field, so changing it is a re-bake.
 */
export const PROMINENCE_RATIO = 2;
/** The field's ceiling, in world units: a place with nothing bigger inside it is stored at the cap. */
export const PROMINENCE_CAP = 4000;

/**
 * How near a much bigger place has to be before this one is not built at all,
 * in world units. The footprint thinning stops towns interpenetrating but is not
 * a hierarchy: Mallorca would carry nine towns on an island 235 units across.
 * The rule is relative, hidden iff a place within R has at least k times your
 * rank, so peer cities stand (Amsterdam and Rotterdam are 145 units apart at a
 * rank ratio of 1.17) while real hierarchy is hidden (Palma-Manacor at 10.3).
 * R=150 with k=2 keeps about a third of the places and most of the built area;
 * a capital is never hidden. The named cost: Tel Aviv hides behind Jerusalem,
 * Leicester behind Birmingham, Bergamo behind Milan.
 *
 * It is a runtime knob because the baked field is the distance to the nearest
 * place at `PROMINENCE_RATIO` times the rank, so any radius up to
 * `PROMINENCE_CAP` is one comparison per place. `atlas.prominence(r)` moves it
 * live. It does not scale with `atlas.detail()`: how far the world is built is a
 * budget, and which towns exist is not.
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
 * Whether anything is built at a place. The one definition: the settlements, the
 * vegetation's keepouts, the herds, the menu's pins and the chip all ask this.
 * The capital clause keeps the promise independent of a bake having been run.
 */
export function isShown(place: Place): boolean {
  return place.capital === true || place.prominence >= radius;
}

/**
 * The prominence field, computed by the bake and again by `pnpm check`.
 *
 * For every place, the great-circle distance to the nearest place whose rank is
 * at least `PROMINENCE_RATIO` times its own, searched on a half-degree grid in
 * doubling squares: everything inside X units lies inside the square scanned for
 * X, so the first square that finds anything holds the true nearest. A hider is
 * compared by `shadeOf` and the hidden by `rankOf`. Floored, so that
 * `prominence < R` is exactly "a hider is nearer than R" at whole-unit radii, and
 * capped at `PROMINENCE_CAP`; a capital is stored at the cap without searching.
 * Shared between the writer and the check so there is one definition of what
 * "prominent" means.
 */
export function prominenceField(
  places: readonly { lat: number; lon: number; pop: number; capital?: boolean; radius?: number }[],
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
  const shade = new Float64Array(n);
  const buckets: (number[] | undefined)[] = new Array(ROWS * COLS);
  const u = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < n; i++) {
    const place = places[i]!;
    unitAt(place.lat, place.lon, u);
    ux[i] = u.x;
    uy[i] = u.y;
    uz[i] = u.z;
    rank[i] = rankOf(place);
    shade[i] = shadeOf(place);
    const row = Math.min(ROWS - 1, Math.floor((place.lat + 90) / CELL));
    const col = (((Math.floor((place.lon + 180) / CELL) % COLS) + COLS) % COLS);
    (buckets[row * COLS + col] ??= []).push(i);
  }
  // The radius is a parameter because this module does not import `globe.ts`.
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
      // The span is taken at the poleward edge of the square so a wide search at
      // high latitude does not under-cover its top rows.
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
            if (j === i || shade[j]! < want) continue;
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
 * Builds the index, separate from the fetch so `check-world.ts` can hand it an
 * array off disk.
 *
 * There is no spatial grid: the built rows are one flat `Float64Array` of unit
 * vectors and the nearest is the largest dot product, about 29,000 multiply-adds
 * for a question the HUD asks once. A grid would be a second structure to keep in
 * step with the array.
 *
 * `radius` is the body's sea level in units and `radiusKm` its real radius, which
 * `Nearby.km` is measured on; Earth's when omitted. Another world's gazetteer is
 * indexed by the same function (`planet.ts`).
 */
export function indexPlaces(all: readonly Place[], radius: number, radiusKm = EARTH_KM): Places {
  const unit = new Float64Array(all.length * 3);
  const claim = new Float64Array(all.length);
  const label = new Float64Array(all.length);
  for (let i = 0; i < all.length; i++) {
    const place = all[i]!;
    toUnit(place.lat, place.lon, unit, i * 3);
    claim[i] = radiusOf(place);
    label[i] = labelRadiusOf(place);
  }

  // The built rows, packed, rebuilt when the radius moves. A hidden place is
  // never the nearest: nothing is built there, so a chip saying *Manacor* over an
  // empty field would be wrong, and *near Palma* is true. The rows stay in `all`
  // because `roads.bin` indexes them; the scan runs over this packed copy so
  // that hiding two thirds of the file makes the query faster.
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
  let best = -2;
  let found = 0;
  // The built row nearest a unit direction, into `found`, and its dot product
  // into `best`: among one country's rows only when `iso` is given, and `found`
  // is -1 where that country has none built.
  const scan = (x: number, y: number, z: number, iso?: string): void => {
    best = -2;
    found = iso === undefined ? 0 : -1;
    for (let k = 0; k < builtCount; k++) {
      const dot = x * builtUnit[k * 3]! + y * builtUnit[k * 3 + 1]! + z * builtUnit[k * 3 + 2]!;
      if (dot > best && (iso === undefined || all[builtIndex[k]!]!.iso === iso)) {
        best = dot;
        found = builtIndex[k]!;
      }
    }
  };

  return {
    all,
    aliases() {
      refresh();
      const out = new Map<string, number>();
      for (let i = 0; i < all.length; i++) {
        const names = all[i]!.aliases;
        if (names === undefined) continue;
        let town = i;
        if (!isShown(all[i]!)) {
          scan(unit[i * 3]!, unit[i * 3 + 1]!, unit[i * 3 + 2]!, all[i]!.iso);
          if (found < 0) continue;
          town = found;
        }
        // The rows are in rank order, so the first town to claim a name is the biggest.
        for (const name of names) if (!out.has(name)) out.set(name, town);
      }
      return out;
    },
    nearest(point) {
      refresh();
      direction.copy(point).normalize();
      scan(direction.x, direction.y, direction.z);
      // Along the surface, not through the planet: far apart the chord and the
      // arc differ by a fifth, and the HUD prints this number.
      const angle = Math.acos(Math.min(1, Math.max(-1, best)));
      const units = angle * radius;
      return {
        place: all[found]!,
        index: found,
        units,
        km: angle * radiusKm,
        radius: claim[found]!,
        labelRadius: label[found]!,
        inside: units <= claim[found]!,
        near: units <= label[found]!,
      };
    },
  };
}
