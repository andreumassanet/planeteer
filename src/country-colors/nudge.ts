/** The ladder of near-by colours a country may take to be told apart from its neighbours. */
import { MAX_LIGHT, MIN_LIGHT, choices } from './palette.ts';
import { chroma, distance, fromOklab, toOklab } from './oklab.ts';
import type { Oklab, RGB } from './oklab.ts';

/**
 * How far apart two touching countries have to look, in OKLab: well over a
 * just-noticeable difference, so two fills read as two fills across a dashed
 * frontier. Larger values box in countries whose neighbours are all placed.
 */
export const APART = 0.16;

/**
 * How far a country's colour may travel from the flag's own. The hue is capped
 * hard (`HUE_LIMIT` degrees, measured on the bytes that ship, since the gamut
 * clamp does not preserve hue) so a red stays recognisably red; `NUDGE_MAX`
 * is the total leash and binds on lightness.
 */
const HUE_LIMIT = 14;
const NUDGE_MAX = 0.3;

/**
 * The ladder a nudge is searched over: hue in `HUE_STEP` degree steps to
 * `HUE_LIMIT`, lightness in `LIGHT_STEP` steps to `LIGHT_REACH`, chroma at
 * each of `CHROMA_SCALES`. Every candidate inside `NUDGE_MAX` is priced and sorted.
 */
const HUE_STEP = 3.5;
const LIGHT_STEP = 0.05;
const LIGHT_REACH = 0.3;
const CHROMA_SCALES = [1.2, 1.1, 1, 0.9, 0.78, 0.625];

/**
 * What losing chroma costs over and above the distance it moves. Desaturating
 * is the cheapest escape in OKLab but turns a red brown, so it is taxed to rank
 * behind a darker shade.
 */
const CHROMA_TAX = 1.5;

/** One offer in the ladder: the bytes that would ship and what they cost. */
export interface Candidate {
  rgb: RGB;
  lab: Oklab;
  /** How far it is from the colour it is a version of, on the bytes that ship. */
  drift: number;
  /** `drift` plus the chroma tax. */
  cost: number;
}

/**
 * Every version of one colour of one flag that a country could wear, cheapest
 * first. Candidates are built in OKLab, rounded to the bytes they ship as and
 * measured again from those bytes, so a candidate whose gamut clamp pushed it
 * past the hue leash is dropped. Built per rank and lazily: few countries ever
 * need a second colour's ladder.
 */
export function candidates(key: string, rank: number): Candidate[] {
  const id = `${key}/${rank}`;
  const held = offers.get(id);
  if (held !== undefined) return held;
  const colour = choices(key)[rank];
  const out: Candidate[] = [];
  if (colour !== undefined) {
    const seen = new Set<number>();
    const home = toOklab(colour);
    const c = chroma(home);
    const hue = Math.atan2(home.b, home.a);
    for (let hs = 0; hs <= Math.round(HUE_LIMIT / HUE_STEP); hs++) {
      for (const dh of hs === 0 ? [0] : [hs * HUE_STEP, -hs * HUE_STEP]) {
        const angle = hue + (dh * Math.PI) / 180;
        const ca = Math.cos(angle) * c;
        const cb = Math.sin(angle) * c;
        for (let ls = 0; ls <= Math.round(LIGHT_REACH / LIGHT_STEP); ls++) {
          for (const dL of ls === 0 ? [0] : [ls * LIGHT_STEP, -ls * LIGHT_STEP]) {
            const light = Math.min(MAX_LIGHT, Math.max(MIN_LIGHT, home.L + dL));
            for (const scale of CHROMA_SCALES) {
              const rgb = fromOklab({ L: light, a: ca * scale, b: cb * scale });
              const key32 = (rgb[0]! << 16) | (rgb[1]! << 8) | rgb[2]!;
              if (seen.has(key32)) continue;
              seen.add(key32);
              const lab = toOklab(rgb);
              // The leash, on the bytes rather than on the request.
              const turned = Math.abs(
                ((((Math.atan2(lab.b, lab.a) - hue) * 180) / Math.PI + 540) % 360) - 180,
              );
              if (turned > HUE_LIMIT + 1e-9) continue;
              const drift = distance(lab, home);
              const cost = drift + CHROMA_TAX * Math.max(0, c - chroma(lab));
              if (cost > NUDGE_MAX) continue;
              out.push({ rgb, lab, drift, cost });
            }
          }
        }
      }
    }
    out.sort(
      (one, two) =>
        one.cost - two.cost ||
        one.rgb[0]! - two.rgb[0]! ||
        one.rgb[1]! - two.rgb[1]! ||
        one.rgb[2]! - two.rgb[2]!,
    );
  }
  offers.set(id, out);
  return out;
}

const offers = new Map<string, Candidate[]>();
