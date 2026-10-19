import { POLE_HEIGHT, POLE_WIDTH } from '../../roadside.ts';
import { rngFrom } from '../random.ts';
import type { Rng } from '../random.ts';
import { cellCentre, streetSide } from '../grid.ts';
import type { TownGrid } from '../grid.ts';
import { pavementOf } from '../ground.ts';
import { anyToward, clearOfHosts, spanA, spanA1, spanB, spanB1, wallAnchor } from './anchors.ts';
import type { Street } from './anchors.ts';
import {
  ANCHOR_RANGE, ANCHOR_STEP, HANG, MAST_EVERY, MAST_WIDTH, MASTED, OVERHEAD_CLEAR, POLE_INSET, SHIFTS, SIDE_CLEAR,
  SPAN_CAP, STRING_DENSITY, TOWN_CAP,
} from './config.ts';
import type { Hang } from './config.ts';
import { box, colourOf, shadeOf } from './geometry.ts';
import type { Hanger, PoleSpot } from './hanger.ts';
import { PALETTE } from '../../theme.ts';

type Spec = (typeof HANG)[Hang];
type MastPair = { a: PoleSpot; b: PoleSpot; at: number };

const P = PALETTE;

/** The last pair of masts put up on a street, which the next pair strings along to. */
interface MastState {
  last: MastPair | null;
  /** The cell the last masts went up in; the next pair keeps `MAST_EVERY` cells from it. */
  cell: number;
}

/** Strings bunting, lanterns, sails and the like across the streets, between walls or on masts; a step a street. */
export function* stringStreetsSteps(h: Hanger): Generator<void, void, void> {
  const { site, grid, out } = h;
  for (const street of h.streets) {
    yield;
    const rng = rngFrom(site.seed, 'overhead', street.axis, street.index);
    const kind = rng.weighted(street.main ? h.profile.mainHangs ?? h.profile.hangs : h.profile.hangs);
    const chance = (street.main ? h.profile.main : h.profile.side) * h.urban * STRING_DENSITY;
    if (chance <= 0) continue;
    const spec = HANG[kind];
    const masts: MastState = { last: null, cell: -Infinity };
    for (let k = 0; k < grid.cells; k++) {
      if (out.triangles > SPAN_CAP) break;
      if (grid.avenue[k] === 1 || !streetOpenAt(grid, street, k)) continue;
      if (!stringSlot(h, street, k, kind, spec, chance, masts)) break;
    }
  }
}

/** Whether a street runs past cell `k` along it: an avenue always, a band unless that stretch is closed. */
function streetOpenAt(grid: TownGrid, street: Street, k: number): boolean {
  if (Number.isInteger(street.index)) return true;
  const b = Math.floor(street.index);
  return street.axis === 0 ? streetSide(grid, b, k, 0) : streetSide(grid, k, b, 1);
}

/** One cell's slot along a street. Returns false when the town's cap for this kind is spent. */
function stringSlot(h: Hanger, street: Street, k: number, kind: Hang, spec: Spec, chance: number, masts: MastState): boolean {
  const { site, grid } = h;
  const slot = rngFrom(site.seed, 'overhead-slot', street.axis, street.index, k);
  const at = cellCentre(grid, k) + slot.jitter() * 0.2 * grid.pitch;
  if (h.floorUnder(street, cellCentre(grid, k), cellCentre(grid, k)) !== null) {
    if (street.main) h.cells.main++;
    else h.cells.side++;
  }
  const before = h.spans;
  const centre = Math.hypot(street.line, at) / Math.max(1, grid.half);
  if (!slot.chance(chance * (1 - 0.25 * Math.min(1, centre)))) return true;
  const cap = TOWN_CAP[kind];
  if (cap !== undefined && (h.counts.get(kind) ?? 0) >= cap) return false;
  const found = stringBetweenWalls(h, street, kind, spec, slot, at);
  if (!found && street.main && MASTED.has(kind) && k - masts.cell >= MAST_EVERY) {
    raiseMasts(h, street, k, kind, spec, slot, at, masts);
  }
  if (h.spans > before) {
    if (street.main) h.cells.mainHung++;
    else h.cells.sideHung++;
  }
  return true;
}

/**
 * Tries to tie a span between the walls on either side of `street` near `at`,
 * a little either way along it where the slot's own spot has no wall (a yard
 * is a gap in a row, not the end of it). Returns whether one was hung.
 */
function stringBetweenWalls(h: Hanger, street: Street, kind: Hang, spec: Spec, slot: Rng, at: number): boolean {
  const { grid, hosts } = h;
  const skew = slot.chance(spec.diagonal) ? slot.jitter() * 0.3 * grid.pitch : 0;
  const width = kind === 'sail' ? Math.min(grid.pitch * 0.55, 6) : 0;
  let found = false;
  for (const shift of SHIFTS) {
    if (found) break;
    const at0 = at + shift * grid.pitch - skew / 2;
    const at1 = at + shift * grid.pitch + skew / 2;
    const floor = h.floorUnder(street, at0 - width / 2, at1 + width / 2);
    if (floor === null) continue;
    // The lowest the ends may be: the clearance, the drop and the sag of a
    // line as wide as the street and its setbacks.
    const reachSpan = street.half * 2 + 1.5;
    const low = floor + (street.main ? OVERHEAD_CLEAR : SIDE_CLEAR) + spec.drop + spec.sag * reachSpan;
    if (!anyToward(hosts, street, at0, -1, low, low + ANCHOR_RANGE) || !anyToward(hosts, street, at1, 1, low, low + ANCHOR_RANGE)) continue;
    for (let y = low; y <= low + ANCHOR_RANGE && !found; y += ANCHOR_STEP) {
      if (kind === 'sail') {
        if (!wallAnchor(hosts, street, at0 - width / 2, y, -1, spanA)) continue;
        if (!wallAnchor(hosts, street, at0 + width / 2, y, -1, spanA1)) continue;
        if (!wallAnchor(hosts, street, at1 - width / 2, y, 1, spanB)) continue;
        if (!wallAnchor(hosts, street, at1 + width / 2, y, 1, spanB1)) continue;
      } else {
        if (!wallAnchor(hosts, street, at0, y, -1, spanA)) continue;
        if (!wallAnchor(hosts, street, at1, y + (kind === 'laundry' ? slot.range(-0.3, 0.3) : 0), 1, spanB)) {
          if (!wallAnchor(hosts, street, at1, y, 1, spanB)) continue;
        }
      }
      const sag = spec.sag * spanA.distanceTo(spanB);
      // Where it actually hangs lowest, against the clearance.
      if (Math.min(spanA.y, spanB.y) - sag - spec.drop < floor + h.clearUnder(street, spanA, spanB)) continue;
      if (!clearOfHosts(hosts, spanA, spanB, sag, spec.drop, street)) continue;
      if (kind === 'sail' && !clearOfHosts(hosts, spanA1, spanB1, sag, 0, street)) continue;
      h.hang(kind, spanA, spanB, sag, slot.fork('draw'), spanA1, spanB1);
      found = true;
    }
  }
  return found;
}

/**
 * A main street of houses is too low to string over a bus from its walls, so
 * the festival puts up a pair of masts, one either side, `POLE_HEIGHT` tall,
 * slender and dark: no more than a pair in `MAST_EVERY` cells, and only where
 * no wall would take the string.
 */
function raiseMasts(h: Hanger, street: Street, k: number, kind: Hang, spec: Spec, slot: Rng, at: number, masts: MastState): void {
  const { grid, hosts, out, profile } = h;
  // Painted iron, dark: a green in most places, a steel where the poles are concrete.
  const mastColour = profile.concrete === true ? shadeOf(P.steel, P.ink, 0.25) : shadeOf(P.darkOlive, P.ink, 0.2);
  for (const shift of SHIFTS) {
    const mastAt = at + shift * grid.pitch;
    const floor = h.floorUnder(street, mastAt, mastAt);
    if (floor === null) continue;
    // Somewhere across the pavement: at its back where no eaves or
    // balcony is over it, in its middle, or at the kerb where nobody strolls.
    const walk = pavementOf(street.half);
    const offsets = [street.half - POLE_INSET, street.half - walk * 0.5, street.half - walk + POLE_INSET];
    let a: PoleSpot | null = null;
    let b: PoleSpot | null = null;
    for (const across of offsets) if (a === null) a = h.standPole(street, -across, mastAt, 0, 0);
    for (const across of offsets) if (a !== null && b === null) b = h.standPole(street, across, mastAt, 0, 0);
    if (a === null || b === null) continue;
    spanA.set(a.x, a.y + POLE_HEIGHT - 0.25, a.z);
    spanB.set(b.x, b.y + POLE_HEIGHT - 0.25, b.z);
    const sag = spec.sag * spanA.distanceTo(spanB);
    if (Math.min(spanA.y, spanB.y) - sag - spec.drop < floor + h.clearUnder(street, spanA, spanB)) continue;
    if (!clearOfHosts(hosts, spanA, spanB, sag, spec.drop)) continue;
    for (const mast of [a, b]) {
      const shaft = POLE_WIDTH * MAST_WIDTH * 0.5;
      box(out, mast.x, mast.z, 1, 0, shaft, shaft, mast.y - 0.4, mast.y + POLE_HEIGHT, mastColour);
      // A knob on top in the string's first colour.
      box(out, mast.x, mast.z, 1, 0, shaft * 1.8, shaft * 1.8, mast.y + POLE_HEIGHT, mast.y + POLE_HEIGHT + 0.18, colourOf(profile.colours[0]!));
      h.taken.push([mast.x, mast.z]);
      h.masts++;
    }
    h.hang(kind, spanA, spanB, sag, slot.fork('draw'));
    // And along the street from the last pair of masts, on each side, where the
    // two pairs are near enough: the festival's canopy is a zigzag of strings.
    const last = masts.last;
    if (last !== null && Math.abs(mastAt - last.at) <= (MAST_EVERY + 0.5) * grid.pitch) {
      for (const [p, q] of [[last.a, a], [last.b, b]] as const) {
        spanA.set(p.x, p.y + POLE_HEIGHT - 0.6, p.z);
        spanB.set(q.x, q.y + POLE_HEIGHT - 0.6, q.z);
        const along = spec.sag * spanA.distanceTo(spanB);
        if (Math.min(spanA.y, spanB.y) - along - spec.drop < Math.max(p.y, q.y) + SIDE_CLEAR) continue;
        if (!clearOfHosts(hosts, spanA, spanB, along, spec.drop)) continue;
        h.hang(kind, spanA, spanB, along, slot.fork(`along${p === a ? 0 : 1}`));
      }
    }
    masts.last = { a, b, at: mastAt };
    masts.cell = k;
    break;
  }
}
