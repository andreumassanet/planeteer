import { Vector3 } from 'three';
import { BIGGEST_SETTLEMENT, SMALLEST_SETTLEMENT, isShown, prominenceVersion, radiusOf, rankOf } from '../places.ts';
import { sortByDepth, thinMarks, toUnit } from '../cartography.ts';
import { MAX_PAD_MARKS, MAX_PLACE_MARKS, PAD_SPACING, PAD_VIEW } from './constants.ts';
import type { MinimapState } from './state.ts';
import type { MinimapPad } from './types.ts';

const padFound: MinimapPad[] = [];
const padAt = new Vector3();

/** Orders the built places largest-first, once per prominence setting. */
export function refreshTowns(m: MinimapState): void {
  const { gazetteer, townUnit, townRow, townDot, townSlot } = m;
  if (m.townFor === prominenceVersion()) return;
  m.townFor = prominenceVersion();
  const rows: number[] = [];
  for (let i = 0; i < gazetteer.length; i++) if (isShown(gazetteer[i]!)) rows.push(i);
  rows.sort((a, b) => rankOf(gazetteer[b]!) - rankOf(gazetteer[a]!));
  m.townCount = rows.length;
  townSlot.clear();
  const spread = BIGGEST_SETTLEMENT - SMALLEST_SETTLEMENT;
  for (let k = 0; k < m.townCount; k++) {
    const i = rows[k]!;
    const place = gazetteer[i]!;
    toUnit(place.lat, place.lon, townUnit, k * 3);
    townRow[k] = i;
    // A dot that says how big the town is, off the one size law rather than a
    // second set of population bands: 1.7 px at the floor of `radiusFor` and
    // 4.2 at its ceiling, which is a village against a capital — and as
    // built (`radiusOf`), so a fitted city is the dot its square is.
    townDot[k] = 1.7 + ((radiusOf(place) - SMALLEST_SETTLEMENT) / spread) * 2.5;
    townSlot.set(i, k);
  }
}

/**
 * Projects the built towns, thins them and returns how many survived. The
 * disc itself is the cull: at the widest framing it is inside the hemisphere
 * where the orthographic projection is single-valued.
 */
export function layOutTowns(m: MinimapState): number {
  const { centre, townUnit, townSlot, townX, townY, townOrder, townKept, townKeptX, townKeptY, placeSpacing, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale, view } = m;
  refreshTowns(m);
  if (m.townCount === 0) return 0;
  const inside = Math.cos(Math.min(Math.PI / 2, view * 1.02));
  let count = 0;
  for (let k = 0; k < m.townCount; k++) {
    const at = k * 3;
    const mx = townUnit[at]!;
    const my = townUnit[at + 1]!;
    const mz = townUnit[at + 2]!;
    if (mx * ux + my * uy + mz * uz < inside) continue;
    townX[k] = centre + (mx * rx + my * ry + mz * rz) * scale;
    townY[k] = centre - (mx * fx + my * fy + mz * fz) * scale;
    townOrder[count++] = k;
  }
  if (count === 0) return 0;
  // Seeded with the town the chip is naming, which is the whole point of
  // drawing them: `hud.ts` says *near Palma* and this is where Palma is.
  const seed = m.nearby === null ? -1 : townSlot.get(m.nearby.index) ?? -1;
  return thinMarks(
    townOrder, count, townX, townY, placeSpacing,
    townKept, townKeptX, townKeptY, seed, MAX_PLACE_MARKS,
  );
}

/**
 * Projects the monuments, thins them, and returns how many survived. Pins
 * on the hidden half are culled (they would project back mirrored), and pins
 * outside the disc are dropped.
 */
export function layOutPins(m: MinimapState): number {
  const { centre, discRadius, pinCount, pinPoint, pinScreenX, pinScreenY, pinDepth, pinOrder, keptX, keptY, keptPin, pinRise, pinSpacing, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale } = m;
  if (pinCount === 0) return 0;
  const reach = discRadius + pinRise;
  let visible = 0;
  for (let i = 0; i < pinCount; i++) {
    const k = i * 3;
    const mx = pinPoint[k]!;
    const my = pinPoint[k + 1]!;
    const mz = pinPoint[k + 2]!;
    const height = mx * ux + my * uy + mz * uz;
    if (height <= 0) continue;
    const x = centre + (mx * rx + my * ry + mz * rz) * scale;
    const y = centre - (mx * fx + my * fy + mz * fz) * scale;
    if ((x - centre) ** 2 + (y - centre) ** 2 > reach * reach) continue;
    pinScreenX[i] = x;
    pinScreenY[i] = y;
    pinDepth[i] = height;
    pinOrder[visible++] = i;
  }
  if (visible === 0) return 0;
  // Closest first, then thinned closest-first. Both live in `cartography.ts`:
  // the map behind `M` thins the same pins by the same rule and two copies of
  // that rule would disagree about which one you see.
  sortByDepth(pinOrder, pinDepth, visible);
  return thinMarks(
    pinOrder, visible, pinScreenX, pinScreenY, pinSpacing, keptPin, keptX, keptY, -1,
  );
}

/**
 * Asks for the pads on the disc, projects them like the towns and thins
 * them; two that meet on the disc are one mark. Returns how many stand.
 */
export function layOutPads(m: MinimapState): number {
  const { settings, RADIUS, centre, discRadius, uiScale, padKeptX, padKeptY, ux, uy, uz, fx, fy, fz, rx, ry, rz, scale, view } = m;
  m.padsWaiting = false;
  if (settings.pads === undefined || view * RADIUS > PAD_VIEW) return 0;
  padFound.length = 0;
  m.padsWaiting = !settings.pads(padAt.set(ux, uy, uz), view * RADIUS, padFound);
  const spacing = PAD_SPACING * uiScale;
  let count = 0;
  for (const pad of padFound) {
    const { x: mx, y: my, z: mz } = pad.at;
    if (mx * ux + my * uy + mz * uz <= 0) continue;
    const x = centre + (mx * rx + my * ry + mz * rz) * scale;
    const y = centre - (mx * fx + my * fy + mz * fz) * scale;
    if ((x - centre) ** 2 + (y - centre) ** 2 > discRadius * discRadius) continue;
    let crowded = false;
    for (let n = 0; n < count && !crowded; n++) crowded = Math.abs(padKeptX[n]! - x) < spacing && Math.abs(padKeptY[n]! - y) < spacing;
    if (crowded) continue;
    padKeptX[count] = x;
    padKeptY[count] = y;
    if (++count === MAX_PAD_MARKS) break;
  }
  return count;
}
