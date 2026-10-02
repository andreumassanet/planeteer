/**
 * Mercury's named ground at walking scale: the features the system's table is
 * too coarse to hold and a traveller would walk to.
 *
 * `system/bodies/mercury.ts` draws Caloris, Rembrandt and the Rupes as swells a
 * few hundred kilometres wide, which is right from orbit and invisible on foot.
 * These are the same planet one scale down, each at its real coordinates:
 *
 * - **craters with names** — Hokusai's central peak, Kuiper, Tyagaraja's floor
 *   of hollows, the ice traps of Prokofiev and Chao Meng-Fu, Apollodorus at
 *   the hub of the Spider;
 * - **Rachmaninoff**, a basin with a second ring of peaks standing inside its
 *   rim, which is the skyline a walker will remember;
 * - **Pantheon Fossae**, the Spider: troughs radiating from the middle of
 *   Caloris like cracks in a windscreen, a hundred kilometres long, that you
 *   can walk down into;
 * - **the lobate scarps** — Enterprise, the longest cliff on the planet, and
 *   Discovery — drawn the way a thrust fault is shaped: a steep face on the
 *   side the crust rode over, a crest, and a long gentle back.
 *
 * Every function here is a `Feature`: a pure function of the direction, run
 * per ground vertex, so each begins with one dot product and returns 0 when
 * the point is out of reach. The depths are exaggerated over the real ones by
 * four or five — Hokusai's 34 units are 13.5 km, where a fresh crater its size
 * is about 3 deep — because a world unit is 0.4 km and a true-scale Mercury,
 * walked, is a plain with the craters too shallow to see. The widths are true.
 * A feature's own slope is held to about one and a half in one, and with the
 * planet's relief under it the steepest ground measured was 2.2 (2026-10-01),
 * where the crater field alone reaches 1.8: on a scarp's face, a 55-degree wall.
 */

import { surfaceRadiusOf } from '../../../system/contract.ts';
import { fbm, onSphere } from '../../../system/noise.ts';
import type { Feature } from '../../contract.ts';
import { MERCURY } from '../../../system/bodies/mercury.ts';

const R = surfaceRadiusOf(2439.7);
/** Kilometres on Mercury to world units. */
const KM = R / 2439.7;

/** The system's relief, which the world draws at a scale of one (`planetScale`). */
const PLANET_RELIEF = MERCURY.ground!.relief;

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

interface CraterShape {
  name: string;
  lat: number;
  lon: number;
  /** Rim radius, units. */
  rim: number;
  /** Floor below the surroundings, and the rim above them, units. */
  depth: number;
  lip: number;
  /** A central peak's height, units; 0 for none. */
  peak: number;
  /**
   * Out to this share of the rim radius the floor is flooded flat: the
   * planet's own relief under it is cancelled to its value at the centre, as
   * lava or impact melt fills a basin to a level. Faded out across the wall.
   * Only a basin wide enough for its wall to absorb the fade has one: on a
   * crater a hundred units across the fade and the wall together are a
   * cliff, and a young crater's floor is kept clear of later craters instead
   * (`youngFloor` in `bodies/mercury.ts`).
   */
  flood?: number;
  /** A ring of peaks inside the rim, for a peak-ring basin: its radius as a share of the rim's, and its height. */
  ring?: { share: number; height: number };
}

/**
 * The profile of a complex crater against the distance from its centre, as a
 * share of the rim radius: a flat floor, a wall rising to the rim from 0.62 of
 * the way out, and the ejecta's apron falling as the inverse cube outside, the
 * way it really does, gone by two and a half radii.
 */
function profile(c: CraterShape, s: number): number {
  if (s >= 2.6) return 0;
  if (s <= 1) {
    const wall = smooth(0.62, 1, s);
    return -c.depth + (c.depth + c.lip) * wall;
  }
  return c.lip * Math.pow(s, -3) * (1 - smooth(1.6, 2.6, s));
}

/** Noise frequencies on the unit sphere: a central peak's knobs about 45 units apart, a peak ring's massifs about 120. */
const PEAK_GRAIN = R / 45;
const MASSIF_GRAIN = R / 120;

function crater(c: CraterShape): Feature {
  const [cx, cy, cz] = onSphere(c.lat, c.lon);
  const level = PLANET_RELIEF(c.lat, c.lon);
  const flood = c.flood ?? 0;
  // The sine of the reach as an angle, against which `1 - dot^2` is compared
  // so nothing past the apron pays for a square root.
  const reach = (c.rim * 2.6) / R;
  const reachCos = Math.cos(reach);
  return (d, lat, lon) => {
    const dot = d.x * cx + d.y * cy + d.z * cz;
    if (dot <= reachCos) return 0;
    // The distance along the ground, as the chord's sine: within a few
    // degrees of the centre the two agree to a part in a thousand, and the
    // field stays smooth through the centre, which `acos` would not be.
    const r = R * Math.sqrt(Math.max(0, 1 - dot * dot));
    const s = r / c.rim;
    let h = profile(c, s);
    if (flood > 0 && s < flood + 0.3) h += (level - PLANET_RELIEF(lat, lon)) * (1 - smooth(flood, flood + 0.3, s));
    if (c.peak > 0) h += c.peak * (1 - smooth(0, 0.25, s)) * (0.8 + 0.6 * fbm(d.x * PEAK_GRAIN, d.y * PEAK_GRAIN, d.z * PEAK_GRAIN, 2));
    if (c.ring !== undefined) {
      // A ring of separate peaks, not a wall: the noise breaks it into
      // massifs a few dozen units across with saddles between.
      const band = 1 - smooth(0, 0.16, Math.abs(s - c.ring.share));
      if (band > 0) {
        const massif = 0.5 + fbm(d.x * MASSIF_GRAIN, d.y * MASSIF_GRAIN, d.z * MASSIF_GRAIN, 2);
        h += c.ring.height * band * Math.min(1, Math.max(0, massif));
      }
    }
    return h;
  };
}

/**
 * The radial troughs of Pantheon Fossae, round Apollodorus.
 *
 * Graben — strips of crust dropped between two faults — about ten units wide
 * and a few deep, radiating from one point near the middle of Caloris for up
 * to two hundred kilometres. There are more than two hundred of them; forty
 * read as the Spider at a walk and keep their spacing wider than a trough.
 */
function fossae(lat: number, lon: number): Feature {
  const [cx, cy, cz] = onSphere(lat, lon);
  // The centre's tangent frame, for a bearing round it.
  let nx = -cx * cy;
  let ny = 1 - cy * cy;
  let nz = -cz * cy;
  const n = Math.hypot(nx, ny, nz);
  nx /= n;
  ny /= n;
  nz /= n;
  const ax = cy * nz - cz * ny;
  const ay = cz * nx - cx * nz;
  const az = cx * ny - cy * nx;
  const COUNT = 40;
  const LONGEST = 200 * KM;
  const HALF = 5;
  const DEPTH = 5;
  const reachCos = Math.cos(LONGEST / R);
  return (d) => {
    const dot = d.x * cx + d.y * cy + d.z * cz;
    if (dot <= reachCos) return 0;
    const r = R * Math.sqrt(Math.max(0, 1 - dot * dot));
    if (r < 60) return 0;
    const theta = Math.atan2(d.x * ax + d.y * ay + d.z * az, d.x * nx + d.y * ny + d.z * nz);
    const f = (theta / (Math.PI * 2)) * COUNT;
    const k = Math.round(f);
    // Each trough its own length and a little wobble in its bearing, from
    // its index: wrapped, so the one on the seam at +-180 degrees is one.
    const index = ((k % COUNT) + COUNT) % COUNT;
    const hash = Math.sin(index * 12.9898 + 4.1) * 43758.5453;
    const unit = hash - Math.floor(hash);
    const length = LONGEST * (0.45 + 0.55 * unit);
    if (r > length) return 0;
    const off = Math.abs(f - k) * ((Math.PI * 2 * r) / COUNT);
    if (off > HALF * 2) return 0;
    const along = smooth(60, 110, r) * (1 - smooth(length * 0.75, length, r));
    return -DEPTH * (1 - smooth(HALF * 0.6, HALF * 2, off)) * along;
  };
}

interface ScarpShape {
  name: string;
  from: readonly [number, number];
  to: readonly [number, number];
  /** Crest height over the low side, units. */
  height: number;
  /** Width of the steep face and of the gentle back, units. */
  face: number;
  back: number;
  /** Which side of the trace the face is on, +1 or -1 against the trace's pole. */
  side: 1 | -1;
}

/**
 * A lobate scarp along a great-circle arc: the signed distance from the trace,
 * bowed into lobes, mapped through a thrust fault's section.
 *
 * The section is the asymmetric one MESSENGER's altimetry shows on every
 * scarp it crossed: from the low ground a face that rises the whole height in
 * a few kilometres, a crest, and a back that falls away over ten times that.
 * The ends taper over the last quarter of the length, because a fault dies out
 * into the plain rather than stopping at a wall.
 */
function scarp(s: ScarpShape): Feature {
  const a = onSphere(s.from[0], s.from[1]);
  const b = onSphere(s.to[0], s.to[1]);
  // The pole of the trace's great circle, its midpoint, and the direction
  // along it at the midpoint.
  let px = a[1] * b[2] - a[2] * b[1];
  let py = a[2] * b[0] - a[0] * b[2];
  let pz = a[0] * b[1] - a[1] * b[0];
  const pl = Math.hypot(px, py, pz);
  px /= pl;
  py /= pl;
  pz /= pl;
  let mx = a[0] + b[0];
  let my = a[1] + b[1];
  let mz = a[2] + b[2];
  const ml = Math.hypot(mx, my, mz);
  mx /= ml;
  my /= ml;
  mz /= ml;
  const tx = py * mz - pz * my;
  const ty = pz * mx - px * mz;
  const tz = px * my - py * mx;
  const half = R * Math.sin(Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) / 2);
  const LOBE = 26;
  const WAVE = 420;
  const across = (s.face + s.back + LOBE) / R;
  return (d) => {
    const signed = (d.x * px + d.y * py + d.z * pz) * s.side;
    if (signed > across || signed < -across) return 0;
    if (d.x * mx + d.y * my + d.z * mz <= 0) return 0;
    const along = (d.x * tx + d.y * ty + d.z * tz) * R;
    if (along > half || along < -half) return 0;
    // The lobes: the trace bows out and back every few hundred units.
    const u = signed * R - LOBE * Math.sin((along / WAVE) * Math.PI * 2 + 1.3);
    const rise = smooth(-s.face, 0, u);
    const fall = 1 - smooth(0, s.back, u);
    const ends = 1 - smooth(half * 0.72, half, Math.abs(along));
    return s.height * rise * fall * ends;
  };
}

/** The craters, at their published centres and true diameters. */
export const NAMED_CRATERS: readonly CraterShape[] = [
  // 114 km, the youngest big crater in the north and the hub of its rays.
  { name: 'Hokusai', lat: 57.8, lon: 16.8, rim: 57 * KM, depth: 34, lip: 12, peak: 26 },
  // 62 km: the bright one Mariner 10 photographed first.
  { name: 'Kuiper', lat: -11.3, lon: -31.4, rim: 31 * KM, depth: 18, lip: 7, peak: 12 },
  // 97 km, hollows on its floor.
  { name: 'Tyagaraja', lat: 3.7, lon: -148.9, rim: 48.5 * KM, depth: 26, lip: 9, peak: 10 },
  // 112 km, the biggest of the north polar cold traps; a flat floor of ice.
  { name: 'Prokofiev', lat: 85.7, lon: -62.7, rim: 56 * KM, depth: 36, lip: 10, peak: 0 },
  // 167 km, the south's.
  { name: 'Chao Meng-Fu', lat: -87.4, lon: -132.4, rim: 83.5 * KM, depth: 46, lip: 14, peak: 0 },
  // 41 km, dark-haloed, at the hub of the Spider.
  { name: 'Apollodorus', lat: 30.6, lon: 163.0, rim: 20.5 * KM, depth: 12, lip: 4, peak: 0 },
  // 290 km, with a ring of peaks 130 km across inside it.
  { name: 'Rachmaninoff', lat: 27.6, lon: 57.6, rim: 145 * KM, depth: 55, lip: 22, peak: 0, flood: 0.62, ring: { share: 0.45, height: 55 } },
];

export const SCARPS: readonly ScarpShape[] = [
  // About 1,000 km and 3 km high, through its published centre (37.6 S,
  // 75.4 E) and on across Rembrandt's floor, which it cuts. The run of the
  // trace is approximate; the centre is not.
  { name: 'Enterprise Rupes', from: [-44.5, 66.5], to: [-28.5, 86.5], height: 60, face: 70, back: 620, side: 1 },
  // About 650 km and 1.5 km high, in the old southern highlands.
  { name: 'Discovery Rupes', from: [-58, -45], to: [-48.5, -32], height: 38, face: 48, back: 400, side: -1 },
];

export const FEATURES: readonly Feature[] = [
  ...NAMED_CRATERS.map(crater),
  fossae(30.6, 163.0),
  ...SCARPS.map(scarp),
];

export { R as MERCURY_RADIUS, KM as MERCURY_KM };
