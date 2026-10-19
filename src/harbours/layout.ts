/**
 * Everything of a harbour but its main run, laid out round it once the run
 * stands: the waterfront quay along the town's own coast, the breakwater
 * that walls a basin off, the other wooden piers, the slipway, a stilt hut in
 * the tropics, and the boats nobody takes. A pure function of the site, which
 * answers where the water is and what must be kept clear of; every piece is a
 * rectangle of the harbour's frame (see `types.ts`).
 */
import type { Rng, Weighted } from '../scenery/random.ts';
import type { RegionId } from '../scenery/regions.ts';
import { SCENERY_SCALE } from '../stature.ts';
import type { BoatKind, Breakwater, Deck, HarbourSize, Mooring, Pier, Slip, Waterfront } from './types.ts';

export interface LayoutSite {
  size: HarbourSize;
  region: RegionId;
  kind: 'pier' | 'quay';
  length: number;
  width: number;
  deck: number;
  landing: number;
  /** The fleet's berths in the frame: kept clear by `BERTH_KEEP`. */
  berths: readonly { x: number; z: number }[];
  wetAt(x: number, z: number): boolean;
  /** The land's height over the sea's radius. */
  groundAt(x: number, z: number): number;
  /** Clear of what else floats there, every landmark and every other town's square. */
  clearAt(x: number, z: number): boolean;
  /** Inside the harbour's own town's square, whose floor already meets the water. */
  ownSquare(x: number, z: number): boolean;
  rng: Rng;
}

export interface Layout {
  runFrom: number;
  waterfront: Waterfront | null;
  piers: Pier[];
  breakwater: Breakwater | null;
  slip: Slip | null;
  stilt: { x0: number; x1: number; z0: number; z1: number } | null;
  moorings: Mooring[];
  /** Channel buoys either side of the basin's mouth. */
  marks: { x: number; z: number; port: boolean }[];
  decks: Deck[];
  ladders: { x: number; z: number }[];
}

const METRE = SCENERY_SCALE;
/** How far round a fleet berth nothing else is moored or built. */
export const BERTH_KEEP = 6.5;
/** A waterfront strip's width across, and how far it may reach either way. */
const STRIP = 3;
const WATERFRONT_HALF: Readonly<Record<HarbourSize, number>> = { village: 0, town: 21, port: 33 };
/** How far out from the furthest coast the quay's face stands, and the most it may stand off the nearest. */
const APRON: Readonly<Record<HarbourSize, number>> = { village: 0, town: 3.5, port: 5 };
const APRON_SLACK = 8;
/** How far a coast may wander off the root's line and still carry one straight quay. */
const COAST_WANDER = 6;
/** The other piers' width, and the breakwater's. */
const SIDE_PIER = 2.6;
const MOLE: Readonly<Record<HarbourSize, number>> = { village: 0, town: 4.5, port: 6 };
/** The basin's width between the main run and the breakwater, and its mouth. */
const BASIN: Readonly<Record<HarbourSize, number>> = { village: 0, town: 24, port: 34 };
const MOUTH = 16;
/** The slipway's width and run, and how deep its foot goes. */
const SLIP_WIDTH = 3.6;
const SLIP_RUN = 13;
const SLIP_FOOT = -1.4;
/** How many boats a harbour keeps besides the fleet's, by size. */
const BOATS: Readonly<Record<HarbourSize, readonly [number, number]>> = { village: [2, 3], town: [5, 8], port: [9, 14] };

/** A boat's length and beam, units. */
export const BOAT_SIZE: Readonly<Record<BoatKind, readonly [number, number]>> = {
  rowboat: [2.6 * METRE, 1.1 * METRE],
  fishing: [7.5 * METRE, 2.4 * METRE],
  sailboat: [6.5 * METRE, 2.1 * METRE],
  yacht: [11 * METRE, 3.1 * METRE],
  sampan: [5 * METRE, 1.5 * METRE],
  outrigger: [5.5 * METRE, 2.6 * METRE],
};

const MED: readonly RegionId[] = ['mediterranean', 'maghreb', 'middle-east'];
const NORTH: readonly RegionId[] = ['nordic', 'polar', 'atlantic-europe', 'east-europe', 'north-america'];
const RICH: readonly RegionId[] = ['mediterranean', 'atlantic-europe', 'nordic', 'north-america', 'oceania', 'middle-east'];
export const TROPIC: readonly RegionId[] = ['southeast-asia', 'oceania', 'south-asia', 'sub-saharan', 'latin-america'];

function fleetOf(region: RegionId, size: HarbourSize): Weighted<BoatKind>[] {
  const yacht = RICH.includes(region) ? (size === 'port' ? 2 : size === 'town' ? 1 : 0) : 0;
  if (region === 'east-asia') return [{ item: 'fishing', weight: 4 }, { item: 'sampan', weight: 4 }, { item: 'rowboat', weight: 1 }, { item: 'yacht', weight: yacht }];
  if (TROPIC.includes(region)) {
    const outrigger = region === 'southeast-asia' || region === 'oceania' ? 4 : 0;
    return [{ item: 'outrigger', weight: outrigger }, { item: 'fishing', weight: 3 }, { item: 'rowboat', weight: 3 }, { item: 'sailboat', weight: 1 }, { item: 'yacht', weight: yacht }];
  }
  if (MED.includes(region)) return [{ item: 'fishing', weight: 4 }, { item: 'rowboat', weight: 3 }, { item: 'sailboat', weight: 2 }, { item: 'yacht', weight: yacht }];
  if (NORTH.includes(region)) return [{ item: 'fishing', weight: 4 }, { item: 'sailboat', weight: 3 }, { item: 'rowboat', weight: 2 }, { item: 'yacht', weight: yacht }];
  return [{ item: 'fishing', weight: 3 }, { item: 'rowboat', weight: 3 }];
}

/** The height of a deck at `z`, along its run. */
export function deckHeight(deck: Deck, z: number): number {
  if (deck.h0 === deck.h1 || deck.z1 === deck.z0) return deck.h0;
  const t = Math.min(1, Math.max(0, (z - deck.z0) / (deck.z1 - deck.z0)));
  return deck.h0 + (deck.h1 - deck.h0) * t;
}

const inRect = (deck: Deck, x: number, z: number, pad: number): boolean =>
  x >= deck.x0 - pad && x <= deck.x1 + pad && z >= deck.z0 - pad && z <= deck.z1 + pad;

/** A point of a boat's outline: `u` along its length, `v` across, both -1..1, in the frame. */
function boatPoint(m: Mooring, u: number, v: number): [number, number] {
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);
  const a = (u * m.length) / 2;
  const b = (v * m.beam) / 2;
  return [m.x + a * s + b * c, m.z + a * c - b * s];
}

const OUTLINE: readonly (readonly [number, number])[] = [[0, 0], [1.35, 0], [1, 0], [-1, 0], [0.7, 1], [0.7, -1], [-0.7, 1], [-0.7, -1], [0, 1.2], [0, -1.2]];

export function layoutHarbour(site: LayoutSite): Layout {
  const { size, rng, width, length, deck, landing } = site;
  const half = width / 2;
  const decks: Deck[] = [];
  const ladders: { x: number; z: number }[] = [];

  const nearBerth = (x: number, z: number, keep: number): boolean =>
    site.berths.some((berth) => Math.hypot(berth.x - x, berth.z - z) < keep);
  const onDeck = (x: number, z: number, pad: number): boolean => decks.some((d) => inRect(d, x, z, pad));

  /** The coastline's `z` on the line `x`, or null where it is not within reach. */
  function coastAt(x: number): number | null {
    let dry = -14;
    if (site.wetAt(x, dry)) return null;
    for (let z = dry + 1.5; z <= 24; z += 1.5) {
      if (!site.wetAt(x, z)) {
        dry = z;
        continue;
      }
      let lo = dry;
      let hi = z;
      for (let i = 0; i < 5; i++) {
        const mid = (lo + hi) / 2;
        if (site.wetAt(x, mid)) hi = mid;
        else lo = mid;
      }
      return lo;
    }
    return null;
  }

  /**
   * Open water over a rectangle and `room` either side of it and past its far
   * end, clear of what is kept clear of, of every deck and of the berths. Its
   * near end is where it leaves the shore or a deck, so it is not looked behind.
   */
  function waterRect(x0: number, x1: number, z0: number, z1: number, room: number, keepBerths = true): boolean {
    const xs = Math.max(1, Math.ceil((x1 - x0 + 2 * room) / 2));
    const zs = Math.max(1, Math.ceil((z1 + room - z0) / 2));
    for (let i = 0; i <= zs; i++) {
      const z = z0 + 0.6 + ((z1 + room - z0 - 0.6) * i) / zs;
      for (let j = 0; j <= xs; j++) {
        const x = x0 - room + ((x1 - x0 + 2 * room) * j) / xs;
        if (!site.wetAt(x, z)) return false;
        if ((i + j) % 2 === 0 && !site.clearAt(x, z)) return false;
        if (onDeck(x, z, 0)) return false;
        if (keepBerths && nearBerth(x, z, BERTH_KEEP)) return false;
      }
    }
    return true;
  }

  /**
   * Where a piece leaves the shore at `x`: its first `z` and its height there.
   * On the waterfront it starts at the face; in the town's own square, at the
   * coast (the town's floor is the quay behind it); past the square, back on
   * the land, where the land is low enough to stand under the deck.
   */
  function startAt(x: number, front: Waterfront | null, hw: number): { z: number; coast: number } | null {
    if (front !== null && front.strips.some((strip) => x - hw >= strip.x0 - 1e-6 && x - hw <= strip.x1) && front.strips.some((strip) => x + hw >= strip.x0 && x + hw <= strip.x1 + 1e-6)) {
      return { z: front.face, coast: front.face };
    }
    const coast = coastAt(x);
    if (coast === null || Math.abs(coast) > COAST_WANDER * 2) return null;
    const under = (z: number): boolean => [x - hw, x, x + hw].every((sx) => site.wetAt(sx, z) || site.groundAt(sx, z) <= deck - 0.1);
    const backs = site.ownSquare(x, coast - 0.5) ? [-0.05, -0.8, -1.6, -2.4] : [landing, 0.5, -0.5, -1.5];
    for (const back of backs) if (under(coast - back)) return { z: coast - back, coast };
    return null;
  }

  // The waterfront: strips along the coast either side of the root, out to one straight face.
  let waterfront: Waterfront | null = null;
  if (size !== 'village') {
    const reach = Math.floor(WATERFRONT_HALF[size] / STRIP);
    const found: { x0: number; low: number; high: number }[] = [];
    for (const way of [1, -1]) {
      for (let k = 0; k < reach; k++) {
        const x0 = way === 1 ? k * STRIP : -(k + 1) * STRIP;
        const coasts = [x0, x0 + STRIP / 2, x0 + STRIP].map(coastAt);
        if (coasts.some((c) => c === null || Math.abs(c) > COAST_WANDER)) break;
        const values = coasts as number[];
        found.push({ x0, low: Math.min(...values), high: Math.max(...values) });
      }
    }
    found.sort((a, b) => a.x0 - b.x0);
    const face = Math.max(0, ...found.map((strip) => strip.high)) + APRON[size];
    const strips: { x0: number; x1: number; back: number }[] = [];
    // Kept contiguous through the root: a strip that fails ends its side.
    for (const way of [1, -1]) {
      const side = found.filter((strip) => (way === 1 ? strip.x0 >= 0 : strip.x0 < 0)).sort((a, b) => way * (a.x0 - b.x0));
      for (const strip of side) {
        const xc = strip.x0 + STRIP / 2;
        if (face - strip.low > APRON[size] + APRON_SLACK) break;
        if (!site.wetAt(xc, face + 2) || !site.wetAt(xc, face + 9) || !site.clearAt(xc, face + 3) || nearBerth(xc, face, BERTH_KEEP)) break;
        let back: number | null = null;
        const keeps = site.ownSquare(xc, strip.low - 0.5) ? [-0.05, -0.8, -1.6] : [landing, 0.5, -0.5];
        for (const keep of keeps) {
          const z = strip.low - keep;
          if ([strip.x0, xc, strip.x0 + STRIP].every((x) => site.wetAt(x, z) || site.groundAt(x, z) <= deck - 0.1)) {
            back = z;
            break;
          }
        }
        if (back === null) break;
        strips.push({ x0: strip.x0, x1: strip.x0 + STRIP, back });
      }
    }
    strips.sort((a, b) => a.x0 - b.x0);
    const span = strips.length * STRIP;
    if (strips.length >= 4 && strips.some((s) => s.x1 > half + 3 || s.x0 < -half - 3) && span >= 12) {
      waterfront = { strips, face };
      for (const strip of strips) decks.push({ x0: strip.x0, x1: strip.x1, z0: strip.back, z1: face, h0: deck, h1: deck, kind: 'stone' });
    }
  }

  // The main run, from the waterfront's face where there is one.
  const runFrom = waterfront !== null && waterfront.strips.some((s) => s.x0 <= -half && s.x1 >= -half) && waterfront.strips.some((s) => s.x0 <= half && s.x1 >= half)
    ? waterfront.face
    : -landing;
  decks.push({ x0: -half, x1: half, z0: runFrom, z1: length, h0: deck, h1: deck, kind: site.kind === 'quay' ? 'stone' : 'wood' });
  if (site.kind === 'pier') ladders.push({ x: 0, z: length });

  // The breakwater, on whichever side has the water for it.
  let breakwater: Breakwater | null = null;
  const wantsMole = size === 'port' || (size === 'town' && rng.chance(0.5));
  const firstSide = rng.sign();
  if (wantsMole) {
    const mole = MOLE[size];
    for (const side of [firstSide, -firstSide]) {
      const x = side * (half + BASIN[size] + mole / 2);
      const start = startAt(x, waterfront, mole / 2);
      if (start === null) continue;
      const z1 = Math.max(length * (size === 'port' ? 0.95 : 0.8), start.z + 26);
      if (!waterRect(x - mole / 2, x + mole / 2, Math.max(start.z, start.coast + 2), z1, 2.5)) continue;
      // The head turned back across the basin, leaving its mouth open.
      let head = Math.min(size === 'port' ? 14 : 10, BASIN[size] - MOUTH);
      const inner = x - side * (mole / 2);
      if (head >= 4 && !waterRect(Math.min(inner, inner - side * head), Math.max(inner, inner - side * head), z1 - mole, z1, 2)) head = 0;
      breakwater = { x, z0: start.z, z1, width: mole, head: head >= 4 ? head : 0 };
      decks.push({ x0: x - mole / 2, x1: x + mole / 2, z0: start.z, z1, h0: deck, h1: deck, kind: 'stone' });
      if (breakwater.head > 0) {
        const a = inner;
        const b = inner - side * breakwater.head;
        decks.push({ x0: Math.min(a, b), x1: Math.max(a, b), z0: z1 - mole, z1, h0: deck, h1: deck, kind: 'stone' });
      }
      break;
    }
  }

  // The other piers: one in the basin, the rest along the other side.
  const piers: Pier[] = [];
  const pierCount = size === 'port' ? 2 : size === 'town' && rng.chance(0.7) ? 1 : 0;
  const moleSide = breakwater === null ? firstSide : Math.sign(breakwater.x);
  const pierSlots = breakwater === null
    ? [half + 16, -(half + 16), half + 31, -(half + 31)]
    : [moleSide * (half + BASIN[size] / 2), -moleSide * (half + 16), -moleSide * (half + 31)];
  for (const x of pierSlots) {
    if (piers.length >= pierCount) break;
    const start = startAt(x, waterfront, SIDE_PIER / 2);
    if (start === null) continue;
    const run = Math.round(rng.range(size === 'port' ? 16 : 12, size === 'port' ? 24 : 18));
    const z1 = start.z + run;
    if (breakwater !== null && Math.sign(x) === moleSide && z1 > breakwater.z1 - MOLE[size] - 8) continue;
    if (!waterRect(x - SIDE_PIER / 2, x + SIDE_PIER / 2, Math.max(start.z, start.coast + 2), z1, 4)) continue;
    piers.push({ x, z0: start.z, z1, width: SIDE_PIER });
    decks.push({ x0: x - SIDE_PIER / 2, x1: x + SIDE_PIER / 2, z0: start.z, z1, h0: deck, h1: deck, kind: 'wood' });
    ladders.push({ x, z: z1 });
  }

  // The slipway, beside the main run where the shore takes one.
  let slip: Slip | null = null;
  for (const x of [-moleSide * (half + 6.5), moleSide * (half + 6.5), -moleSide * (half + 10), moleSide * (half + 10)]) {
    const start = startAt(x, waterfront, SLIP_WIDTH / 2);
    if (start === null) continue;
    let z0 = start.z;
    let top = deck;
    // Off the land rather than a deck: down from the shore's lip, never under the ground it leaves.
    if (start.z < start.coast && waterfront === null) {
      z0 = start.coast - 1.5;
      top = Math.max(site.groundAt(x - SLIP_WIDTH / 2, z0), site.groundAt(x + SLIP_WIDTH / 2, z0)) + 0.15;
      if (top > deck) continue;
    }
    const z1 = z0 + SLIP_RUN;
    const ramp: Deck = { x0: x - SLIP_WIDTH / 2, x1: x + SLIP_WIDTH / 2, z0, z1, h0: top, h1: SLIP_FOOT, kind: 'slip' };
    let buried = false;
    for (let z = z0; z <= start.coast + 0.5 && !buried; z += 0.5) {
      for (const sx of [ramp.x0, x, ramp.x1]) if (!site.wetAt(sx, z) && site.groundAt(sx, z) > deckHeight(ramp, z) + 0.05) buried = true;
    }
    if (buried || !waterRect(ramp.x0, ramp.x1, Math.max(z0, start.coast + 2), z1, 2)) continue;
    slip = { x, z0, z1, width: SLIP_WIDTH, top, foot: SLIP_FOOT };
    decks.push(ramp);
    break;
  }

  // The tropics' hut on its own platform over the water, by the main run.
  let stilt: Layout['stilt'] = null;
  if (TROPIC.includes(site.region) && site.kind === 'pier') {
    search: for (const side of [-moleSide, moleSide]) {
      const x0 = side > 0 ? half : -half - 7;
      const x1 = x0 + 7;
      for (let z0 = Math.max(runFrom + landing + 6, 8); z0 + 7 <= length - 4; z0 += 2) {
        // Open water past its outer edge; its inner edge is the run's.
        if (!waterRect(side > 0 ? x0 + 0.6 : x0 - 1.5, side > 0 ? x1 + 1.5 : x1 - 0.6, z0, z0 + 7, 0)) continue;
        stilt = { x0, x1, z0, z1: z0 + 7 };
        decks.push({ x0, x1, z0, z1: z0 + 7, h0: deck, h1: deck, kind: 'wood' });
        break search;
      }
    }
  }

  // The boats: candidates along every edge and in the basin, taken in a rolled order while they fit.
  const fleet = fleetOf(site.region, size);
  const candidates: { x: number; z: number; yaw: number; buoy: boolean; along: 'x' | 'z' }[] = [];
  const alongside = (x: number, z0: number, z1: number, pierHalf: number): void => {
    for (let z = z0 + 5; z <= z1 - 3; z += 4) {
      for (const side of [1, -1]) candidates.push({ x: x + side * pierHalf, z, yaw: rng.chance(0.5) ? 0 : Math.PI, buoy: false, along: 'z' });
    }
  };
  alongside(0, Math.max(runFrom, 0), length, half);
  for (const pier of piers) alongside(pier.x, pier.z0, pier.z1, pier.width / 2);
  if (waterfront !== null) {
    for (const strip of waterfront.strips) candidates.push({ x: (strip.x0 + strip.x1) / 2, z: waterfront.face, yaw: Math.PI / 2, buoy: false, along: 'x' });
  }
  if (breakwater !== null) {
    const inner = breakwater.x - moleSide * (breakwater.width / 2);
    for (let z = breakwater.z0 + 6; z < breakwater.z1 - breakwater.width - 4; z += 5) candidates.push({ x: inner, z, yaw: 0, buoy: false, along: 'z' });
    for (let k = 0; k < 8; k++) {
      const x = moleSide * rng.range(half + 5, half + BASIN[size] - 4);
      const z = rng.range((waterfront?.face ?? 0) + 8, breakwater.z1 - breakwater.width - 6);
      candidates.push({ x, z, yaw: rng.range(-0.6, 0.6), buoy: true, along: 'z' });
    }
  } else if (size !== 'village') {
    for (let k = 0; k < 4; k++) candidates.push({ x: rng.sign() * rng.range(half + 8, half + 26), z: rng.range(12, length), yaw: rng.range(-0.8, 0.8), buoy: true, along: 'z' });
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  const [fewest, most] = BOATS[size];
  const wanted = rng.between(fewest, most);
  const moorings: Mooring[] = [];
  const clash = (m: Mooring, other: Mooring): boolean => {
    for (const [u, v] of OUTLINE) {
      const [x, z] = boatPoint(m, u, v);
      const c = Math.cos(other.yaw);
      const s = Math.sin(other.yaw);
      const dx = x - other.x;
      const dz = z - other.z;
      if (Math.abs(dx * s + dz * c) < other.length / 2 + 0.6 && Math.abs(dx * c - dz * s) < other.beam / 2 + 0.6) return true;
    }
    return false;
  };
  for (const candidate of candidates) {
    if (moorings.length >= wanted) break;
    const kind = rng.weighted(fleet);
    const [boatLength, beam] = BOAT_SIZE[kind];
    const off = candidate.buoy ? 0 : beam / 2 + 0.45;
    const m: Mooring = {
      kind, length: boatLength, beam, buoy: candidate.buoy, yaw: candidate.yaw,
      x: candidate.along === 'z' ? candidate.x + (candidate.buoy ? 0 : sideOf(candidate.x, decks) * off) : candidate.x,
      z: candidate.along === 'x' ? candidate.z + off : candidate.z,
    };
    let fits = true;
    for (const [u, v] of OUTLINE) {
      const [x, z] = boatPoint(m, u, v);
      if (!site.wetAt(x, z) || onDeck(x, z, 0.25) || nearBerth(x, z, BERTH_KEEP) || ((u === 0 && v === 0) && !site.clearAt(x, z))) {
        fits = false;
        break;
      }
    }
    if (fits && moorings.some((other) => clash(m, other) || clash(other, m))) fits = false;
    if (fits) moorings.push(m);
  }
  // A boat drawn up on the slipway, clear of the water.
  if (slip !== null) {
    const kind: BoatKind = TROPIC.includes(site.region) && fleet.some((f) => f.item === 'outrigger' && f.weight > 0) ? 'outrigger' : 'rowboat';
    const [boatLength, beam] = BOAT_SIZE[kind];
    const z = slip.z0 + boatLength / 2 + 0.6;
    const ramp = decks.find((d) => d.kind === 'slip')!;
    if (deckHeight(ramp, z + boatLength / 2) > 0.4) moorings.push({ kind, x: slip.x, z, yaw: Math.PI, length: boatLength, beam, buoy: false, hauled: deckHeight(ramp, z) });
  }

  // The channel's buoys, red to port and green to starboard coming in, either side of the mouth.
  const marks: Layout['marks'] = [];
  if (breakwater !== null && breakwater.head > 0) {
    const side = Math.sign(breakwater.x);
    const tip = breakwater.x - side * (breakwater.width / 2 + breakwater.head);
    const z = breakwater.z1 + 3;
    for (const x of [side * half + side * 3, tip - side * 3]) {
      if (site.wetAt(x, z) && site.wetAt(x, z + 2) && !nearBerth(x, z, 4) && !onDeck(x, z, 1)) marks.push({ x, z, port: x === side * half + side * 3 });
    }
  }

  return { runFrom, waterfront, piers, breakwater, slip, stilt, moorings, marks, decks, ladders };
}

/** Which way off a run's edge a boat lies: away from the run whose edge `x` is. */
function sideOf(x: number, decks: readonly Deck[]): number {
  for (const deck of decks) {
    if (deck.kind === 'slip') continue;
    if (Math.abs(x - deck.x1) < 1e-6) return 1;
    if (Math.abs(x - deck.x0) < 1e-6) return -1;
  }
  return Math.sign(x) || 1;
}
