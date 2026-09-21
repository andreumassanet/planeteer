/**
 * The shape every body's ground model has, so that seven of them are a table
 * and one of them is a file.
 *
 * `bodies/mars.ts` writes its own `GroundModel` by hand, because Mars was built
 * first and end to end and its second axis — dust over basalt — is a real
 * observable with real coordinates behind it. Everything after Mars gets this
 * instead, and the split is the honest one: **Mars has a map and the others
 * have a description.** Nobody can check the position of a bright patch on
 * Uranus, so inventing one to five decimal places would be precision theatre.
 *
 * What is shared is exactly the structure `terrain.ts` and `biome.ts` settled
 * on for Earth and nothing else:
 *
 * - **relief is a table of named features plus noise**, because a purely
 *   procedural planet has no Alps and reads as one texture everywhere;
 * - **the noise is ridged for the fine octaves**, because a four-band cel ramp
 *   only steps where the normal turns, and over Earth ridged measured 0.082 of
 *   median gradient against `fbm`'s 0.040 for 12% fewer triangles;
 * - **the classifier fills a target rather than allocating**, because the land
 *   mesh calls it once per triangle and that was 770,000 times in one build;
 * - **the mean of any new relief term is subtracted before it is added.**
 *   Relief is temperature — `warmth` gives up `elevation / maxRelief * lapse` —
 *   so a term with a non-zero mean is a *uniform cooling of the whole planet*,
 *   and on Earth adding the downs uncentred cost four of the 25 named places
 *   and sent Scotland boreal. That is why `centre` exists below.
 */

import type { GroundModel, GroundSample, BodyBiome } from './contract.ts';
import { alignment, clamp, fbm, onSphere, ridged, smoothstep } from './noise.ts';

/** A named high or low, in the units the body's own relief is measured in. */
export interface Landform {
  name: string;
  lat: number;
  lon: number;
  /** Signed, in the same units as `maxRelief`. */
  height: number;
  /** Angular radius, degrees. */
  extent: number;
  /** 1 is a cone, 2 a shield, 0.5 a plateau. */
  shape: number;
}

/** A pole of the body's second axis: a place it runs high or low. */
export interface Province {
  name: string;
  lat: number;
  lon: number;
  weight: number;
  extent: number;
}

export interface GroundSpec {
  /** What the second axis is. `dust`, `ice`, `sulphur`, `methane` — a word. */
  secondAxis: string;
  maxRelief: number;
  /** Where the datum sits in the 0..maxRelief band. */
  datum: number;
  landforms: readonly Landform[];
  /** Amplitude of the ridged term, in relief units. */
  roughness: number;
  /** Amplitude of the broad swell. */
  swell: number;
  /** Base value of the second axis before any province moves it. */
  secondBase: number;
  provinces: readonly Province[];
  /** How much noise the second axis carries. Small: see `biome.ts`. */
  secondNoise: number;
  /** Degrees of latitude over which the first axis falls from 1 to 0. */
  warmthPerDegree: number;
  /** How much of the warmth range the full relief spends. */
  lapse: number;
  biomes: Record<string, BodyBiome>;
  /** The order the body decides in. Returns a key of `biomes`. */
  classify(warmth: number, second: number, elevation: number, maxRelief: number): string;
}

/**
 * Builds a `GroundModel` out of a spec.
 *
 * The one thing it does that a caller would forget: **it measures the mean of
 * its own noise over the sphere at construction and subtracts it.** 512 points
 * on a Fibonacci spiral, once, at module load — a fifth of a millisecond — and
 * it is the difference between a body whose relief is centred on its datum and
 * one that is uniformly a few hundred units higher than it says it is, which on
 * a planet where warmth reads elevation is a uniformly colder planet.
 */
export function makeGround(spec: GroundSpec): GroundModel {
  const raw = (lat: number, lon: number): number => {
    const [x, y, z] = onSphere(lat, lon);
    let h = 0;
    for (const f of spec.landforms) {
      const cos = alignment(lat, lon, f.lat, f.lon);
      const edge = Math.cos((f.extent * Math.PI) / 180);
      if (cos <= edge) continue;
      h += f.height * Math.pow((cos - edge) / (1 - edge), f.shape);
    }
    h += ridged(x * 6.1, y * 6.1, z * 6.1, 4) * spec.roughness;
    h += fbm(x * 2.3, y * 2.3, z * 2.3, 3) * spec.swell;
    return h;
  };

  // The mean of the noise, measured rather than assumed. A Fibonacci spiral
  // rather than a lat/lon grid, because a grid over-samples the poles by the
  // secant of the latitude and would report the mean of the Arctic.
  let sum = 0;
  const SAMPLES = 512;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < SAMPLES; i++) {
    const lat = (Math.asin(1 - (2 * (i + 0.5)) / SAMPLES) * 180) / Math.PI;
    const lon = (((i * golden) % (2 * Math.PI)) * 180) / Math.PI - 180;
    sum += raw(lat, lon);
  }
  const centre = sum / SAMPLES;

  const relief = (lat: number, lon: number): number =>
    clamp(spec.datum + raw(lat, lon) - centre, 0, spec.maxRelief);

  const second = (lat: number, lon: number): number => {
    const [x, y, z] = onSphere(lat, lon);
    let value = spec.secondBase;
    for (const p of spec.provinces) {
      const cos = alignment(lat, lon, p.lat, p.lon);
      const edge = Math.cos((p.extent * Math.PI) / 180);
      if (cos <= edge) continue;
      value += p.weight * smoothstep(0, 1, (cos - edge) / (1 - edge));
    }
    value += fbm(x * 4.3, y * 4.3, z * 4.3, 3) * spec.secondNoise;
    return clamp(value, 0, 1);
  };

  return {
    secondAxis: spec.secondAxis,
    biomes: spec.biomes,
    relief,
    at(lat, lon, elevation, target: GroundSample): GroundSample {
      const warmth = clamp(
        1 - Math.abs(lat) * spec.warmthPerDegree - (elevation / spec.maxRelief) * spec.lapse,
        0,
        1,
      );
      const s = second(lat, lon);
      target.warmth = warmth;
      target.second = s;
      target.elevation = elevation;
      target.id = spec.classify(warmth, s, elevation, spec.maxRelief);
      return target;
    },
  };
}

/**
 * The relief ceiling, and it is the one rule every body obeys.
 *
 * *Keep the true ratio to Earth's relief, up to 12% of the body's own radius.*
 * Earth is `MAX_RELIEF` 680 on a 16,000-unit radius — 4.25% — and reads smooth
 * from the plane's ceiling; 12% is three times that and is a number to falsify
 * rather than a measurement, because nothing stands on another world yet to
 * measure it against. What it is aimed at is the failure the cloud deck found
 * from orbit: *the outer edge of the limb is the tallest top on a chord
 * crossing dozens of cells, and the wobble is the crust.*
 */
export const RELIEF_CEILING = 0.12;

/** Earth's own numbers, so the ratio above has something to be a ratio of. */
const EARTH_MAX_RELIEF = 680;
const EARTH_LAND_RANGE_KM = 8.8;

/** What a body is allowed, given its real relief range and its drawn radius. */
export function reliefBudget(realRangeKm: number, surfaceRadius: number): number {
  const wanted = EARTH_MAX_RELIEF * (realRangeKm / EARTH_LAND_RANGE_KM);
  return Math.min(wanted, surfaceRadius * RELIEF_CEILING);
}
