/**
 * The landforms of Venus a person walks over, as `Feature`s: the walking
 * scale the system's map is too coarse to hold.
 *
 * Every centre is a real one, from the Magellan radar maps. What is *not*
 * real is the vertical scale: the whole planet is drawn about thirty times
 * taller than it is (`reliefBudget` in `system/ground.ts`), and a pancake dome
 * that is truly 750 metres high on a 25-kilometre base would be two units on
 * a sixty-unit plate here — a stain, not a landform. So each one says what it
 * really is and what it is drawn as.
 *
 * Each is a dot product and an early return first, because a feature runs
 * once per ground vertex; the trigonometry only happens inside its reach.
 * And each keeps its steepest slope under about 60 degrees, which is the
 * check's tear test (a rise of 0.1 over 0.05 units) with a margin.
 */

import { surfaceRadiusOf } from '../../../system/contract.ts';
import { onSphere } from '../../../system/noise.ts';
import type { Feature } from '../../contract.ts';

/** 15,198 units: Venus's walkable radius. */
const R = surfaceRadiusOf(6051.8);

const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

type Vec = { readonly x: number; readonly y: number; readonly z: number };

/** A unit vector as a plain tuple, and the cosine of an angle given in units of arc. */
const at = (lat: number, lon: number): [number, number, number] => onSphere(lat, lon);
const cosOf = (units: number): number => Math.cos(units / R);
const dotOf = (d: Vec, c: readonly number[]): number => d.x * c[0]! + d.y * c[1]! + d.z * c[2]!;
/** Units along the ground from a cosine: the chord, which is the arc to a part in a million here. */
const unitsOf = (dot: number): number => R * Math.sqrt(Math.max(0, 2 - 2 * dot));

// ---------------------------------------------------------------------------
// Seoritsu Farra: the pancake domes
// ---------------------------------------------------------------------------

/**
 * The seven pancake domes on the eastern edge of Alpha Regio, the most
 * photographed landform on Venus after Maxwell: lava so thick and sticky it
 * did not run but slumped, and cooled into flat-topped cakes about 25 km
 * across and 750 m high, cracked across the top and pitted in the middle.
 *
 * Drawn 45 to 90 units across the top and 11 to 16 high, with a flank as
 * steep as the tear test allows — the steepness is the whole look, and it is
 * what `palette.steep` paints. Two carry towns (Seoritsu and Farra, in
 * `system/bodies/venus.ts`) and one carries the Bell; those three have no
 * central pit, because a town's pad would only fill it in again.
 */
const DOMES = [
  { lat: -30.0, lon: 11.8, r: 90, h: 16, pit: false }, // Seoritsu
  { lat: -30.55, lon: 12.5, r: 70, h: 14, pit: false }, // Farra
  { lat: -29.45, lon: 11.2, r: 55, h: 13, pit: false }, // the Bell
  { lat: -29.9, lon: 12.75, r: 60, h: 13, pit: true },
  { lat: -30.7, lon: 11.3, r: 65, h: 14, pit: true },
  { lat: -31.2, lon: 12.2, r: 50, h: 12, pit: true },
  { lat: -28.9, lon: 12.1, r: 75, h: 15, pit: true },
].map((one) => ({ ...one, c: at(one.lat, one.lon), cos: cosOf(one.r * 1.06) }));

/** The whole field's reach, so a vertex half a planet away pays one dot product. */
const FARRA = { c: at(-30.0, 12.0), cos: cosOf(420) };

const pancakes: Feature = (d) => {
  if (dotOf(d, FARRA.c) < FARRA.cos) return 0;
  let h = 0;
  for (const dome of DOMES) {
    const dot = dotOf(d, dome.c);
    if (dot < dome.cos) continue;
    const t = unitsOf(dot) / dome.r;
    // A faintly convex top, a slumped edge, and the pit where the last lava
    // drained back down the vent.
    let lift = dome.h * (1 - 0.06 * t * t) * (1 - smooth(0.72, 1.02, t));
    if (dome.pit) lift -= dome.h * 0.35 * (1 - smooth(0, 0.14, t));
    h += lift;
  }
  return h;
};

// ---------------------------------------------------------------------------
// Aine Corona
// ---------------------------------------------------------------------------

/**
 * Aine Corona, 59 S 164 E: a crown of ridges about 200 km across, the mark
 * of a plume of hot mantle that pushed the crust up into a dome and let it
 * sag back, leaving a raised rim, a moat outside it and fractures running out
 * from the middle like the spokes of a wheel. Coronae are found nowhere but
 * Venus, and there are hundreds of them.
 *
 * Drawn 500 units across with a 24-unit rim, a 9-unit moat, a low swell in
 * the middle (where Aine stands) and twenty-four radial grooves.
 */
const AINE = { c: at(-59, 164), ring: 250 };
const AINE_REACH = cosOf(AINE.ring + 210);
// A local east and north at the centre, for the grooves' bearing.
const AINE_EAST = (() => {
  const [x, , z] = AINE.c;
  const len = Math.hypot(x, z);
  return [-z / len, 0, x / len];
})();
const AINE_NORTH = [
  AINE.c[1] * AINE_EAST[2]! - AINE.c[2] * AINE_EAST[1]!,
  AINE.c[2] * AINE_EAST[0]! - AINE.c[0] * AINE_EAST[2]!,
  AINE.c[0] * AINE_EAST[1]! - AINE.c[1] * AINE_EAST[0]!,
];

const corona: Feature = (d) => {
  const dot = dotOf(d, AINE.c);
  if (dot < AINE_REACH) return 0;
  const u = unitsOf(dot);
  const ring = (u - AINE.ring) / 40;
  const moat = (u - AINE.ring - 95) / 45;
  let h = 24 * Math.exp(-ring * ring) - 9 * Math.exp(-moat * moat) + 7 * (1 - smooth(0, AINE.ring * 0.8, u));
  if (u < AINE.ring * 0.9) {
    const bearing = Math.atan2(dotOf(d, AINE_NORTH), dotOf(d, AINE_EAST));
    // Cubed rather than sharper: a crease's slope is its power times its
    // spoke count over the distance out, and near the middle that is steep.
    const fold = 1 - Math.abs(Math.sin(bearing * 12));
    h -= 2.5 * fold * fold * fold * smooth(70, 130, u) * (1 - smooth(AINE.ring * 0.7, AINE.ring * 0.9, u));
  }
  return h;
};

// ---------------------------------------------------------------------------
// Cleopatra
// ---------------------------------------------------------------------------

/**
 * Cleopatra, 65.8 N 7.1 E, on the eastern flank of Maxwell Montes: a
 * 105-kilometre double-ring crater two and a half kilometres deep, and so
 * clean that for years it was argued to be a volcano. Drawn 132 units to the
 * rim with a floor 42 down, a peak ring inside it and a low apron of ejecta
 * outside. The Lantern stands on its northern rim.
 */
const CLEOPATRA = { c: at(65.8, 7.1), r: 132 };
const CLEOPATRA_REACH = cosOf(CLEOPATRA.r * 2.3);

const cleopatra: Feature = (d) => {
  const dot = dotOf(d, CLEOPATRA.c);
  if (dot < CLEOPATRA_REACH) return 0;
  const t = unitsOf(dot) / CLEOPATRA.r;
  const rim = (t - 1) / 0.16;
  const peak = (t - 0.4) / 0.08;
  return -42 * (1 - smooth(0.55, 1, t)) + 16 * Math.exp(-rim * rim) + 9 * Math.exp(-peak * peak) + 4 * (t > 1 ? 1 - smooth(1, 2.2, t) : 1);
};

// ---------------------------------------------------------------------------
// Maat Mons
// ---------------------------------------------------------------------------

/**
 * Maat Mons, 0.5 N 194.6 E: the tallest volcano on Venus, eight kilometres
 * over the mean radius, and young enough that its flows show no craters at
 * all. Drawn as a shield 380 units in radius and 110 tall over Atla Regio's
 * rise, with a summit caldera; Maat stands on its northern flank.
 */
const MAAT = { c: at(0.5, -165.4), r: 380, h: 110, caldera: 45 };
const MAAT_REACH = cosOf(MAAT.r);

const maat: Feature = (d) => {
  const dot = dotOf(d, MAAT.c);
  if (dot < MAAT_REACH) return 0;
  const u = unitsOf(dot);
  const t = u / MAAT.r;
  const lip = (u - MAAT.caldera * 1.1) / 10;
  return MAAT.h * Math.pow(Math.max(0, 1 - t), 1.6) - 28 * (1 - smooth(0.5, 1.1, u / MAAT.caldera)) + 5 * Math.exp(-lip * lip);
};

// ---------------------------------------------------------------------------
// Baltis Vallis
// ---------------------------------------------------------------------------

/**
 * Baltis Vallis: a channel one to three kilometres wide and **6,800 km
 * long**, longer than the Nile, cut by a lava so fluid it ran like water —
 * the longest channel known anywhere in the solar system. Its whole course
 * would circle a fifth of this world; what is drawn is the 2,500-km stretch
 * through Atalanta Planitia, between 25 N 152 E and 46 N 170 E, 18 units wide
 * and 5 deep between low levees, meandering. Baltis stands on its bank.
 */
const BALTIS = (() => {
  const a = at(25, 152);
  const b = at(46, 170);
  const mid = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const ml = Math.hypot(mid[0]!, mid[1]!, mid[2]!);
  for (let k = 0; k < 3; k++) mid[k]! /= ml;
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nl = Math.hypot(n[0]!, n[1]!, n[2]!);
  for (let k = 0; k < 3; k++) n[k]! /= nl;
  const along = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const al = Math.hypot(along[0]!, along[1]!, along[2]!);
  for (let k = 0; k < 3; k++) along[k]! /= al;
  const half = Math.acos(a[0] * mid[0]! + a[1] * mid[1]! + a[2] * mid[2]!) * R;
  return { mid, n, along, half, cos: Math.cos(half / R + 0.01) };
})();
const BALTIS_HALF_WIDTH = 9;

const baltis: Feature = (d) => {
  if (dotOf(d, BALTIS.mid) < BALTIS.cos) return 0;
  const off = R * dotOf(d, BALTIS.n);
  if (off > 120 || off < -120) return 0;
  const s = R * dotOf(d, BALTIS.along);
  const meander = 60 * Math.sin((s * Math.PI * 2) / 620) + 12 * Math.sin((s * Math.PI * 2) / 170 + 1);
  const q = Math.abs(off - meander);
  if (q > BALTIS_HALF_WIDTH * 3) return 0;
  const fade = 1 - smooth(BALTIS.half - 300, BALTIS.half, Math.abs(s));
  const levee = (q - BALTIS_HALF_WIDTH * 1.25) / 4;
  let h = 1.4 * Math.exp(-levee * levee);
  if (q < BALTIS_HALF_WIDTH) h -= 5 * (1 - (q / BALTIS_HALF_WIDTH) ** 2);
  return h * fade;
};

// ---------------------------------------------------------------------------
// Tessera
// ---------------------------------------------------------------------------

/**
 * Tessera: Venus's oldest ground, a highland folded and then cracked across
 * the folds, so that from orbit it looks like a tiled floor (*tessera* is
 * Greek for a tile). Alpha Regio is the type locality, Ovda Regio the
 * largest, Fortuna Tessera the one beside Maxwell. Drawn as two crossing sets
 * of creased ridges, 34 and 21 units apart — creases, because a four-band
 * ramp only steps where a normal turns.
 */
const TESSERAE = [
  { c: at(-25.5, 4.5), extent: 8.5 },
  { c: at(-3, 85.6), extent: 9 },
  { c: at(69, 45), extent: 8 },
].map((one) => ({ c: one.c, outer: Math.cos((one.extent * Math.PI) / 180), inner: Math.cos((one.extent * 0.55 * Math.PI) / 180) }));
const FOLD = (() => {
  const v = [0.94, 0.28, 0.19];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return v.map((one) => one / l);
})();
const CRACK = (() => {
  const v = [0.21, 0.38, -0.9];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return v.map((one) => one / l);
})();

const tessera: Feature = (d) => {
  let w = 0;
  for (const one of TESSERAE) {
    const dot = dotOf(d, one.c);
    if (dot > one.outer) w = Math.max(w, smooth(one.outer, one.inner, dot));
  }
  if (w === 0) return 0;
  const fold = 1 - Math.abs(Math.sin((Math.PI * R * dotOf(d, FOLD)) / 34));
  const crack = 1 - Math.abs(Math.sin((Math.PI * R * dotOf(d, CRACK)) / 21));
  return w * (3.5 * fold * fold * fold + 2 * crack * crack * crack);
};

export const FEATURES: readonly Feature[] = [pancakes, corona, cleopatra, maat, baltis, tessera];
