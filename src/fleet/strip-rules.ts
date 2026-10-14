/** The shape of an airstrip's search and of the discs it keeps clear. */
import * as THREE from 'three';
import { STRIP_APPROACH, STRIP_BACK, STRIP_HALF, STRIP_LENGTH, stripPoint } from '../craft/airstrip.ts';
import { FIELD_BEARINGS, FIELD_CLEAR, FIELD_STEP, PLANE_FIELD, PLANE_RINGS } from './site-rules.ts';
import type { FieldKeepout, FleetSite } from './site-types.ts';

/** How much further than `STRIP_HALF` a town's disc or a road's edge is kept from the centre line. */
export const STRIP_CLEAR = 2;
/** How far apart the strip is walked for water near a coast, once it has passed everything else. */
export const STRIP_WATER_STEP = 5;
/** How far apart the strip is sampled for the search, and the discs the wood keeps off. */
export const STRIP_STEP = 20;
/**
 * The keepout discs along the strip: one every `STRIP_STEP` or a little less,
 * each wide enough that the union of two neighbours is `STRIP_HALF` wide where
 * they meet.
 */
export const STRIP_DISC = Math.hypot(STRIP_HALF, STRIP_STEP / 2);
/**
 * Headings tried from each stand: straight out of the town first, then either
 * side of it a ninth of a turn at a time. A strip aimed back at its own town crosses it.
 */
export const STRIP_HEADINGS = 9;

/**
 * The furthest a field's edge reaches from its town: the last ring a search
 * tries, the stand on it, and for a plane the strip run out from there. The
 * rockets' pads warm the strips this far past what they are asked for.
 */
export const FIELD_SPREAD =
  150 + PLANE_FIELD + FIELD_CLEAR + 4 + (PLANE_RINGS - 1) * FIELD_STEP + STRIP_LENGTH + STRIP_APPROACH + STRIP_DISC;

/** How far apart two strips' stands may be and their grounds still meet: each its drawn length and `STRIP_HALF` across. */
export const STRIP_MEET = 2 * Math.hypot(STRIP_LENGTH + STRIP_BACK + 8, STRIP_HALF);
/**
 * How far a strip's corners reach from its middle, with a unit to spare: its
 * drawn back end is the further, `STRIP_BACK` and four more behind the stand.
 */
export const STRIP_HALF_DIAGONAL = Math.hypot(STRIP_LENGTH / 2 + STRIP_BACK + 4, STRIP_HALF) + 1;

/** The discs a strip keeps: `STRIP_DISC` wide, every `STRIP_STEP` or a little less from its back end to `STRIP_APPROACH` past its far one. */
export function stripKeepouts(site: Pick<FleetSite, 'at' | 'forward'>): FieldKeepout[] {
  const out: FieldKeepout[] = [];
  const span = STRIP_BACK + STRIP_LENGTH + STRIP_APPROACH;
  const count = Math.ceil(span / STRIP_STEP);
  for (let i = 0; i <= count; i++) {
    const along = -STRIP_BACK + (span * i) / count;
    out.push({ at: stripPoint(site, along, 0, new THREE.Vector3()), radius: STRIP_DISC });
  }
  return out;
}

/**
 * The order a strip's samples are tested in: its far end, its near end, then
 * halving the gaps. A strip that fails fails mostly far out, so this finds it
 * in the first few samples rather than the last.
 */
const STRIP_ORDER: readonly number[] = (() => {
  const count = Math.ceil((STRIP_LENGTH + STRIP_BACK) / STRIP_STEP) + 1;
  const order = [count - 1, 0];
  const seen = new Set(order);
  for (let stride = 1 << Math.ceil(Math.log2(count)); stride >= 1; stride >>= 1) {
    for (let i = 0; i < count; i += stride) {
      if (seen.has(i)) continue;
      seen.add(i);
      order.push(i);
    }
  }
  return order;
})();
export const STRIP_SAMPLES = STRIP_ORDER.length;
/** Every candidate a plane's search can try: a stand on each ring and bearing, and each heading from it. */
export const PLANE_CANDIDATES = PLANE_RINGS * FIELD_BEARINGS * STRIP_HEADINGS;
/** How far down the strip each sample is, in `STRIP_ORDER`. */
export const STRIP_ALONG: readonly number[] = STRIP_ORDER.map((i) => -STRIP_BACK + ((STRIP_LENGTH + STRIP_BACK) * i) / (STRIP_SAMPLES - 1));
