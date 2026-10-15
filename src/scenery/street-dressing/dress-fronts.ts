import { AVATAR_HEIGHT } from '../../stature.ts';
import { STOREY } from '../contract.ts';
import { rngFrom } from '../random.ts';
import type { Rng } from '../random.ts';
import { M } from './config.ts';
import type { Dresser } from './dresser.ts';
import { facadeOf } from './facade.ts';
import type { Facade } from './facade.ts';
import { aircon, awning, blade, fascia, flowerBox, shutters } from './fronts.ts';
import type { DressFront } from './types.ts';

/**
 * The façade phase: awnings, signs and blades on a shop's ground floor, then
 * flower boxes, shutters and air conditioners under the windows above.
 * Fronts are taken nearest the middle first, a step a front; returns how
 * many were dressed.
 */
export function* dressFrontsSteps(d: Dresser): Generator<void, number, void> {
  const { input, sink, style } = d;
  const half = d.grid.half;
  let dressed = 0;
  const fronts = [...input.fronts]
    .map((front, index) => ({ front, index, d: Math.hypot(front.solid.x, front.solid.z) }))
    .sort((a, b) => a.d - b.d || a.index - b.index);
  for (const { front, index, d: dist } of fronts) {
    yield;
    // The least a front comes to is a shutter's pair; past that, nothing more fits.
    if (sink.triangles + 12 > d.cap) break;
    if (front.kind === 'civic') continue;
    const facade = facadeOf(front.flat);
    const rng = rngFrom(input.seed, 'facade', index);
    const central = Math.max(0, 1 - dist / Math.max(1, half));
    const height = front.flat.height;
    sink.place(front.matrix);
    const mark = sink.mark();
    /** What this front got, counted only if it is kept. */
    const got: string[] = [];
    // A block's ground floor is a shop more often than not; a house's is in a
    // town's middle, and more in a city than in a village.
    const shop =
      height >= 1.8 * STOREY &&
      (front.kind === 'block'
        ? rng.chance(style.shops * (0.55 + 0.45 * central))
        : rng.chance(style.houseShops * (0.3 + 0.7 * central) * (0.5 + 0.5 * input.urbanity)));
    if (shop) dressShop(d, front, facade, rng, got);
    let wrote = got.length > 0;
    if (dressWindows(d, front, facade, rng, shop, got)) wrote = true;
    if (!wrote) continue;
    if (sink.triangles > d.cap) {
      sink.rollback(mark);
      d.dropped++;
      continue;
    }
    dressed++;
    for (const kind of got) d.count(kind);
  }
  return dressed;
}

/** A shop's ground floor: an awning over each opening, else a sign board, else a blade sign. */
function dressShop(d: Dresser, front: DressFront, facade: Facade, rng: Rng, got: string[]): void {
  const { sink, style } = d;
  const height = front.flat.height;
  // The awning's lowest edge clears a head (`AVATAR_HEIGHT`), and its top
  // stays under the first floor's windows over it.
  const drop = 0.18 * M;
  const valance = 0.12 * M;
  const headroom = AVATAR_HEIGHT * 1.03;
  const openings = facade.ground.filter((w) => w.x1 - w.x0 > 0.6);
  const spans = openings.length > 0
    ? openings.slice(0, 3).map((w) => [w.x0 - 0.2, w.x1 + 0.2] as const)
    : [[facade.minX + (facade.maxX - facade.minX) * 0.18, facade.maxX - (facade.maxX - facade.minX) * 0.18] as const];
  const fabric = rng.pick(style.fabrics);
  const reach = Math.min(0.75 * M, 1.6);
  let awned = false;
  for (const [a0, a1] of front.kind === 'block' || style.houseAwnings ? spans : []) {
    const x0 = Math.max(facade.minX + 0.1, a0);
    const x1 = Math.min(facade.maxX - 0.1, a1);
    if (x1 - x0 < 0.8) continue;
    const ceiling = Math.min(
      height - 0.4,
      ...facade.upper.filter((w) => w.x1 > x0 && w.x0 < x1).map((w) => w.y0 - 0.15),
    );
    const top = Math.max(headroom + drop + valance, facade.groundTop + 0.2);
    // The roller box stands 0.16 over the awning's top: it too stays under the windows.
    if (top + 0.2 > ceiling) continue;
    awning(sink, x0, x1, facade.wall, top, reach, drop, valance, fabric);
    awned = true;
    got.push('awning');
  }
  // A board over the shop where the wall has room between its window heads
  // and the floor above; a blade where it has not.
  const boardLow = Math.max(facade.groundTop + 0.12, awned ? headroom + drop + valance + 0.1 : facade.groundTop + 0.12);
  const boardHigh = Math.min(
    height - 0.3,
    ...facade.upper.map((w) => w.y0 - 0.12),
  );
  if (boardHigh - boardLow >= 0.45 && !awned) {
    const x0 = facade.minX + (facade.maxX - facade.minX) * 0.15;
    const x1 = facade.maxX - (facade.maxX - facade.minX) * 0.15;
    fascia(sink, rng, style, x0, x1, boardLow, Math.min(boardHigh, boardLow + 0.4 * M), facade.wall);
    got.push('sign');
  } else if (style.blade !== 'none' && rng.chance(style.blade === 'tall' ? 0.85 : 0.5)) {
    const tall = style.blade === 'tall';
    const reachOut = (tall ? 0.45 : 0.5) * M;
    const signHeight = tall ? Math.min(height - headroom - 0.6, rng.range(1.2, 2.2) * M) : 0.5 * M;
    const x = rng.chance(0.5) ? facade.minX + 0.35 : facade.maxX - 0.35;
    const clearOfWindows = !facade.upper.some((w) => x > w.x0 - 0.3 && x < w.x1 + 0.3);
    if (signHeight > 0.8 && clearOfWindows) {
      blade(sink, rng, style, x, facade.wall, headroom + 0.25, signHeight, reachOut);
      got.push('blade');
    }
  }
}

/**
 * The windows upstairs: a box of flowers under some, shutters beside a baked
 * building's, an air conditioner under others; never two on one. Returns
 * whether anything was written.
 */
function dressWindows(d: Dresser, front: DressFront, facade: Facade, rng: Rng, shop: boolean, got: string[]): boolean {
  const { sink, style } = d;
  let wrote = false;
  let boxes = 0;
  let conditioned = 0;
  const shuttered = front.baked && style.shutters > 0 && rng.chance(style.shutters);
  const shutterColor = rng.pick(style.shutterColors);
  const flowerShare = style.flowers * (front.kind === 'dwelling' ? 1.2 : 0.8);
  for (const w of facade.upper) {
    const width = w.x1 - w.x0;
    if (shuttered && width < 2.4) {
      const room = width / 2 + 0.1;
      const clear = !facade.windows.some((o) => o !== w && o.y1 > w.y0 && o.y0 < w.y1 && o.x1 > w.x0 - room && o.x0 < w.x1 + room);
      if (clear && w.x0 - room > front.flat.box.minX && w.x1 + room < front.flat.box.maxX) {
        shutters(sink, w, shutterColor);
        got.push('shutters');
        wrote = true;
      }
    }
    const below = facade.windows.some((o) => o !== w && o.y1 > w.y0 - 0.5 * M && o.y1 < w.y0 && o.x1 > w.x0 && o.x0 < w.x1);
    if (boxes < 8 && flowerShare > 0 && !below && rng.chance(flowerShare)) {
      flowerBox(sink, rng, w.x0 - 0.08, w.x1 + 0.08, w.y0 - 0.03, w.wall);
      got.push('flowers');
      boxes++;
      wrote = true;
    } else if (conditioned < 4 && style.aircon > 0 && rng.chance(style.aircon)) {
      const x = rng.chance(0.5) ? w.x0 + 0.4 * M : w.x1 - 0.4 * M;
      const top = w.y0 - 0.12;
      const clear = !facade.windows.some((o) => o !== w && o.y1 > top - 0.6 * M && o.y0 < top && o.x1 > x - 0.45 * M && o.x0 < x + 0.45 * M);
      if (clear && top - 0.55 * M > (shop ? AVATAR_HEIGHT * 1.3 : 1)) {
        aircon(sink, x, top, w.wall);
        got.push('aircon');
        conditioned++;
        wrote = true;
      }
    }
  }
  return wrote;
}
