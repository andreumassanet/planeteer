/**
 * Neptune's deck at a walker's scale: the storms Voyager 2 photographed in
 * 1989, and the wind written into the cloud.
 *
 * The system file's landforms put the Great Dark Spot, Scooter and the
 * Wizard's Eye on the map at a twenty-fifth of their height, which from orbit
 * is a smudge and on foot is nothing at all. These are the same storms built
 * again in units, so that standing on the rim of the Dark Spot is standing on
 * the edge of something:
 *
 * - **The Great Dark Spot**, 22 S, an oval about 13,000 by 6,600 km — Earth's
 *   own width the long way — drawn as a basin with a flat, slowly swirling
 *   floor and a wall round it. Voyager saw it as a hole: a clear window down
 *   through the methane haze to a deeper, darker layer.
 * - **Its companions**, the bright clouds that sat on its southern edge the
 *   whole time Voyager watched: air forced up over the anticyclone, cooled,
 *   and frozen into methane cirrus, the way a lenticular cloud sits over a
 *   mountain. Here a lumpy white ridge along the south rim.
 * - **Scooter**, the small bright cloud at 42 S that lapped the Dark Spot
 *   every few days, as a raised lens of cloud.
 * - **The Wizard's Eye** (Dark Spot 2), 55 S: a smaller basin with the one
 *   bright core any of these storms had.
 * - **The streaks**: long, thin bands of cirrus along the parallels between
 *   about 20 and 55 degrees either side, fifty kilometres over the deck — the
 *   clouds Voyager caught casting their shadows on the blue below, near 29 N.
 * - **The comb**: everywhere else the deck is drawn out east to west, because
 *   nothing on this planet stays still long enough to be round.
 *
 * The deck's painter colours by latitude only, so none of this changes a
 * colour; the bands in the world file put the darkest blue at the Spot's own
 * latitude and white at its companions', and the toon ramp does the rest
 * where the relief turns.
 *
 * Every function here is a `Feature`: pure, cheap, units of height. The
 * storms return 0 from one dot product outside their reach, and the two
 * global ones are a pair of value-noise calls apiece.
 */

import type { Feature } from '../../contract.ts';
import { fbm, onSphere, ridged, smoothstep } from '../../../system/noise.ts';
import { surfaceRadiusOf } from '../../../system/contract.ts';

const DEG = Math.PI / 180;
/** Neptune's walkable radius, units: 24,622 km at 0.398 km a unit. */
const RADIUS = surfaceRadiusOf(24622);

/** A local frame at a coordinate: its centre, its east and its north, all unit vectors. */
interface Frame {
  c: readonly [number, number, number];
  e: readonly [number, number, number];
  n: readonly [number, number, number];
}

/**
 * East and north taken as differences of `onSphere` itself rather than
 * written out, so the frame is the project's frame and cannot be its mirror.
 */
function frameAt(lat: number, lon: number): Frame {
  const c = onSphere(lat, lon);
  const step = 0.01;
  const east = onSphere(lat, lon + step);
  const north = onSphere(lat + step, lon);
  const unit = (v: number[]): [number, number, number] => {
    const length = Math.hypot(v[0]!, v[1]!, v[2]!);
    return [v[0]! / length, v[1]! / length, v[2]! / length];
  };
  return {
    c,
    e: unit([east[0] - c[0], east[1] - c[1], east[2] - c[2]]),
    n: unit([north[0] - c[0], north[1] - c[1], north[2] - c[2]]),
  };
}

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const dot3 = (p: Point, v: readonly [number, number, number]): number => p.x * v[0] + p.y * v[1] + p.z * v[2];

// ---------------------------------------------------------------------------
// The Great Dark Spot and its companions
// ---------------------------------------------------------------------------

/** Where Voyager 2 found it in August 1989. Exported for the landmarks and towns that stand on its rim. */
export const DARK_SPOT = { lat: -22, lon: 15 } as const;
const SPOT = frameAt(DARK_SPOT.lat, DARK_SPOT.lon);
/** Half the long and the short axis as sines of the angle: 6,500 and 3,300 km. */
const SPOT_A = Math.sin(15.1 * DEG);
const SPOT_B = Math.sin(7.7 * DEG);
const SPOT_REACH = Math.cos(24 * DEG);
/** How far the floor lies under the deck round it, units. */
const SPOT_DEPTH = 240;
/** How high the companion clouds stand over the rim, units. */
const COMPANION_HEIGHT = 120;

const darkSpot: Feature = (p) => {
  if (dot3(p, SPOT.c) < SPOT_REACH) return 0;
  const u = dot3(p, SPOT.e) / SPOT_A;
  const v = dot3(p, SPOT.n) / SPOT_B;
  const d = Math.hypot(u, v);
  if (d > 1.5) return 0;
  // The basin: a floor, and a wall over the last tenth of the oval. The
  // floor is not flat — it turns, so the noise is sampled along the
  // anticyclone's own flow, the angle round the centre leading.
  const swirl = Math.atan2(v, u) + d * 2.6;
  const floor = fbm(Math.cos(swirl) * 3 + d * 5, Math.sin(swirl) * 3, d * 7, 2) * 18;
  let h = -SPOT_DEPTH * (1 - smoothstep(0.88, 1.0, d)) + floor * (1 - smoothstep(0.7, 1.0, d));
  // The companions: on the south side only, a ridge just outside the rim.
  // `v / d` is the sine of the bearing from the centre, negative to the south.
  const south = smoothstep(0.05, -0.55, v / Math.max(d, 1e-6));
  if (south > 0) {
    const ring = Math.exp(-(((d - 1.1) / 0.09) ** 2));
    if (ring > 0.01) {
      const k = RADIUS / 420;
      const lumps = 0.45 + 0.55 * ridged(p.x * k, p.y * k * 1.6, p.z * k, 2);
      h += COMPANION_HEIGHT * ring * south * lumps;
    }
  }
  return h;
};

// ---------------------------------------------------------------------------
// Scooter and the Wizard's Eye
// ---------------------------------------------------------------------------

const SCOOTER = frameAt(-42, -60);
const SCOOTER_REACH = Math.cos(6 * DEG);
const SCOOTER_R = Math.sin(2.6 * DEG);

/** A lens of bright cloud, longer east to west, its top torn into crests. */
const scooter: Feature = (p) => {
  if (dot3(p, SCOOTER.c) < SCOOTER_REACH) return 0;
  const u = dot3(p, SCOOTER.e) / (SCOOTER_R * 1.7);
  const v = dot3(p, SCOOTER.n) / SCOOTER_R;
  const d2 = u * u + v * v;
  if (d2 > 4) return 0;
  const k = RADIUS / 300;
  const lens = Math.exp(-d2 * 1.4);
  return lens * (90 + 30 * ridged(p.x * k, p.y * k * 2, p.z * k, 2));
};

const WIZARD = frameAt(-55, 120);
const WIZARD_REACH = Math.cos(9 * DEG);
const WIZARD_R = Math.sin(4.2 * DEG);

/** Dark Spot 2: a basin with a bright core standing up out of its middle. */
const wizardsEye: Feature = (p) => {
  if (dot3(p, WIZARD.c) < WIZARD_REACH) return 0;
  const u = dot3(p, WIZARD.e) / (WIZARD_R * 1.4);
  const v = dot3(p, WIZARD.n) / WIZARD_R;
  const d = Math.hypot(u, v);
  if (d > 1.6) return 0;
  const basin = -150 * (1 - smoothstep(0.82, 1.0, d));
  const core = 210 * Math.exp(-((d / 0.2) ** 2));
  return basin + core;
};

// ---------------------------------------------------------------------------
// The streaks and the comb
// ---------------------------------------------------------------------------

/** Units between streaks across the wind, and the length of one along it. */
const STREAK_ACROSS = RADIUS / 520;
const STREAK_ALONG = RADIUS / 4200;
const STREAK_HEIGHT = 26;

/**
 * Cirrus in long thin bands along the parallels: the noise is sampled far
 * finer across the wind (the `y` axis is the pole) than along it, so its
 * zero crossings run east to west, and a crest is laid only where it is near
 * zero — a line, not a hill. A second, coarser noise breaks the lines into
 * lengths, and a mask keeps them to the latitudes Voyager found them in.
 */
const streaks: Feature = (p, lat) => {
  const a = Math.abs(lat);
  if (a < 17 || a > 60) return 0;
  const band = smoothstep(17, 25, a) * (1 - smoothstep(50, 60, a));
  const patch = smoothstep(0.02, 0.32, fbm(p.x * STREAK_ALONG * 1.7 + 11, p.y * STREAK_ACROSS * 0.22, p.z * STREAK_ALONG * 1.7, 2));
  if (patch <= 0) return 0;
  const n = fbm(p.x * STREAK_ALONG, p.y * STREAK_ACROSS, p.z * STREAK_ALONG, 2);
  const crest = smoothstep(0.16, 0, Math.abs(n));
  return STREAK_HEIGHT * crest * patch * band;
};

const COMB_ACROSS = RADIUS / 90;
const COMB_ALONG = RADIUS / 900;

/**
 * Everywhere: ripples a few units high drawn out along the wind, so the deck
 * underfoot reads as moving east to west even where nothing else is. It is
 * a share of the relief and not the paint, because the deck's colour is
 * flat inside a band and only a turned normal steps the ramp.
 */
const comb: Feature = (p) => 3.2 * fbm(p.x * COMB_ALONG, p.y * COMB_ACROSS, p.z * COMB_ALONG, 2);

export const NEPTUNE_FEATURES: readonly Feature[] = [darkSpot, scooter, wizardsEye, streaks, comb];
