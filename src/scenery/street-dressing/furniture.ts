import { BENCH_SEAT, sitAhead } from '../../bench.ts';
import { tone } from '../../monuments/contract.ts';
import { PROUD } from '../contract.ts';
import type { Rng } from '../random.ts';
import { M } from './config.ts';
import { H, RACK_SLOTS, type Piece } from './footprints.ts';
import { greenest, lightness, type PropModels } from './models.ts';
import { Sink, arched, rounded } from './sink.ts';
import { drawClock, drawKiosk, postbox } from './street-boxes.ts';
import { FLOWERS, P, PRODUCE, type DressStyle } from './styles.ts';

/**
 * A bistro chair facing +x (`facing` 1) or -x (-1): a round-cornered seat,
 * four splayed legs, two uprights and two rails. It is sat on as a bench
 * is: its seat's top is `BENCH_SEAT`, where the sitting clip's thighs rest,
 * and its sitter's spot is `sitAhead` of its back's front (`bench.ts`), written
 * as a `'seat'` anchor that `settlements.ts` hands `benchesNear` with the
 * town's benches.
 */
export function chair(sink: Sink, x: number, z: number, facing: number, color: number): void {
  const seat = BENCH_SEAT;
  const s = 0.2 * M;
  const t = 0.04 * M;
  const leg = 0.03 * M;
  sink.paint(tone(color, 0.84));
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    sink.bar(x + dx * s * 0.8, seat - t, z + dz * s * 0.8, x + dx * s * 1.05, 0, z + dz * s * 1.05, leg);
  }
  sink.paint(color);
  sink.prism(rounded(x - s, x + s, z - s, z + s, s * 0.35, 1), seat - t, seat);
  const back = x - facing * s * 0.95;
  const top = seat + 0.42 * M;
  for (const dz of [-1, 1]) sink.bar(back, seat, z + dz * s * 0.85, back - facing * 0.04 * M, top, z + dz * s * 0.85, leg);
  sink.bar(back - facing * 0.04 * M, top, z - s * 0.9, back - facing * 0.04 * M, top, z + s * 0.9, 0.05 * M);
  sink.bar(back - facing * 0.02 * M, top - 0.14 * M, z - s * 0.85, back - facing * 0.02 * M, top - 0.14 * M, z + s * 0.85, 0.03 * M);
  // The uprights' front, behind the seat's middle: where the back of the hips goes.
  sink.anchor('seat', x + facing * sitAhead(s * 0.95 - leg / 2), z, facing, 0);
}

export function drawCafe(sink: Sink, rng: Rng, style: DressStyle): void {
  // A round table on a pedestal, two bistro chairs facing across it, and
  // where the region sits out under one, a parasol on the table's pole.
  const top = 0.74 * M;
  const table = rng.pick([P.white, P.bark, P.darkOlive, P.steel]);
  sink.paint(tone(table, 0.84));
  sink.lathe(0, 0, [[0, 0], [0.22 * M, 0], [0.22 * M, 0.02 * M], [0.05 * M, 0.06 * M], [0.035 * M, top - 0.05 * M], [0, top - 0.05 * M]], 6);
  sink.paint(table);
  sink.lathe(0, 0, [[0, top - 0.05 * M], [0.34 * M, top - 0.05 * M], [0.38 * M, top - 0.02 * M], [0.38 * M, top], [0, top]], 10);
  const seat = rng.pick([P.white, P.bark, P.crimson, P.darkOlive, P.skyBlue]);
  chair(sink, -0.72 * M, 0, 1, seat);
  chair(sink, 0.72 * M, 0, -1, seat);
  if (style.parasol) {
    const fabric = rng.pick(style.fabrics);
    const height = 2.25 * M;
    const radius = 1.05 * M;
    const ribs = 8;
    sink.paint(P.white);
    sink.lathe(0, 0, [[0.025 * M, top], [0.025 * M, height + 0.3 * M], [0.05 * M, height + 0.32 * M], [0, height + 0.4 * M]], 6);
    for (let i = 0; i < ribs; i++) {
      const a = (i / ribs) * Math.PI * 2 + Math.PI / ribs;
      const b = ((i + 1) / ribs) * Math.PI * 2 + Math.PI / ribs;
      sink.paint(fabric[i % 2]!);
      const ax = Math.cos(a) * radius, az = Math.sin(a) * radius;
      const bx = Math.cos(b) * radius, bz = Math.sin(b) * radius;
      const apex = height + 0.3 * M;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      sink.tri(0, apex, 0, ax, height, az, bx, height, bz, mx * 0.3, radius, mz * 0.3);
      sink.tri(0, apex, 0, ax, height, az, bx, height, bz, -mx * 0.3, -radius, -mz * 0.3);
      // A scallop under each panel's edge.
      const drop = height - 0.12 * M;
      sink.tri(ax, height, az, bx, height, bz, mx * 0.97, drop, mz * 0.97, mx, 0, mz);
      sink.tri(ax, height, az, bx, height, bz, mx * 0.97, drop, mz * 0.97, -mx, 0, -mz);
    }
  }
  return;
}

export function drawRack(sink: Sink): void {
  // A rack of two hoops set in a base rail, and three slots a bicycle
  // stands in: between the hoops and either side, its front nosed in
  // away from the street. The bicycles are the fleet's (`fleet.ts`):
  // takeable ones stand in these slots, so nothing merged stands there.
  sink.paint(P.steel);
  const hoop = 0.78 * M;
  const legs = 0.33 * M;
  for (const x of [-0.45 * M, 0.45 * M]) {
    const arc = 5;
    let pz = -legs;
    let py = 0;
    const points: [number, number][] = [[-legs, 0], [-legs, hoop - legs]];
    for (let s = 1; s < arc; s++) {
      const a = Math.PI - (s / arc) * Math.PI;
      points.push([Math.cos(a) * legs, hoop - legs + Math.sin(a) * legs]);
    }
    points.push([legs, hoop - legs], [legs, 0]);
    for (const [z, y] of points.slice(1)) {
      sink.bar(x, py, pz, x, y, z, 0.05 * M);
      pz = z;
      py = y;
    }
    // A foot plate under each leg.
    sink.paint(tone(P.steel, 0.7));
    for (const z of [-legs, legs]) sink.post(x, z, 0.12 * M, 0.12 * M, 0, 0.02 * M);
    sink.paint(P.steel);
  }
  for (const x of RACK_SLOTS) sink.anchor('bike', x, 0, 0, -1);
  return;
}

export function drawVending(sink: Sink, rng: Rng): void {
  // A cabinet a head over the body, its top arched, on a dark plinth: the
  // lit window of what it sells in rows, a column of buttons, the coin
  // panel with its slot, and the flap it drops a can through.
  const body = rng.pick([P.crimson, P.white, P.skyBlue, P.gold, P.red]);
  const w = 0.24 * H;
  const d = 0.19 * H;
  const h = 1.13 * H;
  const plinth = 0.04 * H;
  sink.paint(tone(P.steel, 0.7));
  sink.prism(rounded(-w + 0.03, w - 0.03, -d + 0.03, d - 0.03, 0.04, 1), 0, plinth, 'd');
  sink.paint(body);
  sink.prism(rounded(-w, w, -d, d, 0.07, 1), plinth, h - 0.06 * H, 'd');
  sink.paint(tone(body, 0.84));
  sink.slab(arched(-w, w, h - 0.06 * H, h - 0.06 * H, 0.06 * H, 4), -d, d);
  const front = d + PROUD / 2;
  // The window: a frame, the lit display, three shelves of cans on it.
  sink.paint(tone(body, 0.76));
  sink.quad([-w * 0.88, h * 0.46, front, w * 0.42, h * 0.46, front, w * 0.42, h * 0.9, front, -w * 0.88, h * 0.9, front], 0, 0, 1);
  sink.paint(P.cream, 0.9);
  sink.quad([-w * 0.8, h * 0.48, front + PROUD / 4, w * 0.34, h * 0.48, front + PROUD / 4, w * 0.34, h * 0.88, front + PROUD / 4, -w * 0.8, h * 0.88, front + PROUD / 4], 0, 0, 1);
  for (let row = 0; row < 3; row++) {
    const y = h * (0.52 + row * 0.12);
    for (let k = 0; k < 4; k++) {
      const x = -w * 0.72 + k * w * 0.27;
      sink.paint(rng.pick(PRODUCE), 0.5);
      sink.quad([x, y, front + PROUD / 2, x + w * 0.16, y, front + PROUD / 2, x + w * 0.16, y + h * 0.08, front + PROUD / 2, x, y + h * 0.08, front + PROUD / 2], 0, 0, 1);
    }
    sink.paint(tone(P.steel, 0.9));
    sink.quad([-w * 0.8, y - h * 0.012, front + PROUD / 2, w * 0.34, y - h * 0.012, front + PROUD / 2, w * 0.34, y, front + PROUD / 2, -w * 0.8, y, front + PROUD / 2], 0, 0, 1);
  }
  // The buttons, a coin panel and its slot, beside the window.
  sink.paint(tone(P.steel, 0.9));
  sink.box(w * 0.5, w * 0.86, h * 0.34, h * 0.9, d - 0.02, d + 0.05, 'b');
  for (let k = 0; k < 6; k++) {
    const y = h * (0.86 - k * 0.07);
    sink.paint(k % 2 === 0 ? P.white : P.red, 0.4);
    sink.quad([w * 0.6, y - h * 0.03, d + 0.07, w * 0.76, y - h * 0.03, d + 0.07, w * 0.76, y, d + 0.07, w * 0.6, y, d + 0.07], 0, 0, 1);
  }
  sink.paint(tone(P.bark, 0.6));
  sink.quad([w * 0.64, h * 0.38, d + 0.07, w * 0.72, h * 0.38, d + 0.07, w * 0.72, h * 0.44, d + 0.07, w * 0.64, h * 0.44, d + 0.07], 0, 0, 1);
  // The drop: a dark mouth in a frame, and its flap.
  sink.paint(tone(body, 0.76));
  sink.box(-w * 0.7, w * 0.3, h * 0.08, h * 0.22, d - 0.02, d + 0.06, 'b');
  sink.paint(tone(P.bark, 0.6));
  sink.quad([-w * 0.62, h * 0.1, d + 0.08, w * 0.22, h * 0.1, d + 0.08, w * 0.22, h * 0.2, d + 0.08, -w * 0.62, h * 0.2, d + 0.08], 0, 0, 1);
  sink.paint(tone(P.steel, 0.9));
  sink.quad([-w * 0.62, h * 0.155, d + 0.1, w * 0.22, h * 0.155, d + 0.1, w * 0.22, h * 0.2, d + 0.1, -w * 0.62, h * 0.2, d + 0.1], 0, 0, 1);
  return;
}

export function drawBin(sink: Sink, rng: Rng, style: DressStyle): void {
  // A street bin to the hip: a plinth, a tapered barrel in two tones with
  // a band, a domed lid with a dark mouth round it, and a post it hangs on.
  const color = rng.pick(style.bins);
  const r = 0.13 * H;
  const h = 0.5 * H;
  sink.paint(tone(color, 0.76));
  sink.lathe(0, 0, [[0, 0], [r * 0.95, 0], [r * 0.95, 0.04 * H], [0, 0.04 * H]], 10);
  sink.paint(color);
  sink.lathe(0, 0, [[r * 0.9, 0.04 * H], [r, h * 0.62], [0, h * 0.62]], 10);
  sink.paint(tone(color, 0.84));
  sink.lathe(0, 0, [[r * 1.04, h * 0.62], [r * 1.06, h * 0.72], [0, h * 0.72]], 10);
  sink.paint(color);
  sink.lathe(0, 0, [[r * 1.02, h * 0.72], [r * 1.04, h * 0.8], [0, h * 0.8]], 10);
  sink.paint(tone(P.bark, 0.6));
  sink.lathe(0, 0, [[r * 0.98, h * 0.8], [r * 0.98, h * 0.86], [0, h * 0.86]], 10);
  sink.paint(tone(color, 0.84));
  sink.lathe(0, 0, [[0, h * 0.86], [r * 1.08, h * 0.86], [r * 1.08, h * 0.9], [r * 0.7, h * 0.97], [0, h]], 10);
  return;
}

export function drawPlanter(sink: Sink, rng: Rng, models: PropModels | null): void {
  // Kenney's planter (City Kit Suburban, CC0): a trough and three bushes.
  const stone = rng.pick([P.bone, P.tan, P.clay, P.sand]);
  const leaf = rng.chance(0.5) ? P.green : P.darkOlive;
  const model = models?.get(
    'prop-planter',
    { width: 1.25 * M },
    (_slot, original) => (greenest(original) ? leaf : lightness(original) > 0.5 ? tone(P.bark, 0.8) : stone),
    `${stone}/${leaf}`,
  );
  if (model !== null && model !== undefined) {
    sink.model(model);
    // Flowers in among the bushes.
    const flower = rng.pick(FLOWERS);
    for (let i = 0; i < 4; i++) {
      sink.paint(flower);
      sink.lump((-0.45 + i * 0.3) * M, 0.36 * M + rng.range(0, 0.1) * M, rng.jitter() * 0.12 * M, 0.06 * M, 0.08 * M, 4);
    }
    return;
  }
  const w = 0.62 * M;
  const d = 0.26 * M;
  const h = 0.45 * M;
  sink.paint(tone(stone, 0.84));
  sink.prism(rounded(-w, w, -d, d, 0.05 * M, 1), 0, 0.06 * M, 'd');
  sink.paint(stone);
  sink.prism(rounded(-w + 0.02 * M, w - 0.02 * M, -d + 0.02 * M, d - 0.02 * M, 0.04 * M, 1), 0.06 * M, h, 'd');
  for (let i = 0; i < 3; i++) {
    sink.paint(i === 1 ? tone(leaf, 0.84) : leaf);
    sink.lump((-0.4 + i * 0.4) * M, h - 0.05 * M, 0, 0.22 * M, 0.34 * M, 6);
  }
  return;
}

export function drawPots(sink: Sink, rng: Rng): void {
  // Two or three pots of a size on the doorstep, each with a rim and a
  // foot, a bush of lumps in it and some in flower.
  const count = rng.between(2, 3);
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 0.36 * M;
    const r = rng.range(0.12, 0.16) * M;
    const h = rng.range(0.25, 0.38) * M;
    const clay = rng.pick([P.clay, P.salmon, P.bone, P.skyBlue, P.white]);
    sink.paint(clay);
    sink.lathe(x, 0, [[0, 0], [r * 0.7, 0], [r, h * 0.85], [r * 1.12, h * 0.86], [r * 1.12, h], [0, h * 0.92]], 6);
    const leaf = rng.pick([P.green, P.darkOlive, P.olive]);
    for (let k = 0; k < 2; k++) {
      sink.paint(k === 0 ? leaf : tone(leaf, 0.84));
      const a = k * Math.PI + rng.unit();
      const lr = r * rng.range(0.7, 0.95);
      sink.lump(x + Math.cos(a) * r * 0.35, h * 0.85, Math.sin(a) * r * 0.35, lr, lr * rng.range(1.6, 2.4), 5);
    }
    if (rng.chance(0.55)) {
      const flower = rng.pick(FLOWERS);
      sink.paint(flower);
      for (let k = 0; k < 2; k++) {
        const a = k * Math.PI + rng.unit();
        sink.lump(x + Math.cos(a) * r * 0.55, h + r * rng.range(0.9, 1.4), Math.sin(a) * r * 0.55, r * 0.3, r * 0.4, 4);
      }
    }
  }
  return;
}

export function drawStall(sink: Sink, rng: Rng, style: DressStyle): void {
  // A market stall: a counter with a cloth hung down its front, crates of
  // produce heaped on it, four posts and a striped canopy sloping to the
  // street with a scalloped edge.
  const w = 1.0 * M;
  const d = 0.55 * M;
  const counter = 0.85 * M;
  const wood = rng.pick([P.brown, P.bark, P.tan]);
  const fabric = rng.pick(style.fabrics);
  sink.paint(tone(wood, 0.84));
  sink.box(-w + 0.04 * M, w - 0.04 * M, 0, counter - 0.06 * M, -d + 0.04 * M, d - 0.04 * M, 'd');
  sink.paint(wood);
  sink.box(-w - 0.03 * M, w + 0.03 * M, counter - 0.06 * M, counter, -d - 0.03 * M, d + 0.03 * M, '');
  sink.paint(fabric[1]!);
  sink.quad([-w + 0.06 * M, 0.08 * M, d - 0.04 * M + PROUD / 2, w - 0.06 * M, 0.08 * M, d - 0.04 * M + PROUD / 2, w - 0.06 * M, counter - 0.1 * M, d - 0.04 * M + PROUD / 2, -w + 0.06 * M, counter - 0.1 * M, d - 0.04 * M + PROUD / 2], 0, 0, 1);
  const crates = rng.between(3, 4);
  for (let i = 0; i < crates; i++) {
    const cw = (2 * w) / crates;
    const x0 = -w + i * cw + 0.04 * M;
    const x1 = x0 + cw - 0.08 * M;
    const cz = -d * 0.8;
    const ch = 0.14 * M;
    sink.paint(tone(P.tan, 0.9));
    sink.box(x0, x1, counter, counter + ch, cz, d * 0.8, 'd');
    // The slats: two darker bands across its front, stepped proud.
    sink.paint(tone(P.tan, 0.76));
    for (const y of [counter + ch * 0.2, counter + ch * 0.62]) {
      sink.quad([x0 + 0.02, y, d * 0.8 + PROUD / 4, x1 - 0.02, y, d * 0.8 + PROUD / 4, x1 - 0.02, y + ch * 0.22, d * 0.8 + PROUD / 4, x0 + 0.02, y + ch * 0.22, d * 0.8 + PROUD / 4], 0, 0, 1);
    }
    // The heap: three or four fruit-sized lumps in one colour and its shade.
    const fruit = rng.pick(PRODUCE);
    const heaps = rng.between(2, 3);
    for (let k = 0; k < heaps; k++) {
      sink.paint(k % 2 === 0 ? fruit : tone(fruit, 0.84));
      const fx = x0 + ((k + 0.5) / heaps) * (x1 - x0);
      const fz = cz * 0.5 + rng.jitter() * d * 0.3;
      const fr = Math.min((x1 - x0) / heaps, 0.18 * M) * 0.6;
      sink.lump(fx, counter + ch - fr * 0.3, fz, fr, fr * 1.3, 4);
    }
  }
  // The posts and the canopy, sloping down to the street.
  const top = 2.25 * M;
  const low = 2.0 * M;
  sink.paint(tone(wood, 0.76));
  for (const [x, z, h] of [[-w, -d, top], [w, -d, top], [-w, d, low], [w, d, low]] as const) {
    sink.prism(rounded(x - 0.035 * M, x + 0.035 * M, z - 0.035 * M, z + 0.035 * M, 0.012 * M, 1), 0, h, 'd');
  }
  const stripes = 4;
  const edge = d + 0.25 * M;
  for (let i = 0; i < stripes; i++) {
    sink.paint(fabric[i % 2]!);
    const a = -w - 0.1 * M + ((2 * w + 0.2 * M) * i) / stripes;
    const b = a + (2 * w + 0.2 * M) / stripes;
    sink.sheet([a, top + 0.02, -d - 0.1 * M, b, top + 0.02, -d - 0.1 * M, b, low + 0.02, edge, a, low + 0.02, edge], 0, 1, 0.1);
    const m = (a + b) / 2;
    sink.sheet([a, low + 0.02, edge, b, low + 0.02, edge, b, low - 0.08 * M, edge, a, low - 0.08 * M, edge], 0, 0, 1);
    sink.tri(a, low - 0.08 * M, edge, b, low - 0.08 * M, edge, m, low - 0.16 * M, edge, 0, 0, 1);
    sink.tri(a, low - 0.08 * M, edge, b, low - 0.08 * M, edge, m, low - 0.16 * M, edge, 0, 0, -1);
  }
  return;
}

export function drawNewsbox(sink: Sink, rng: Rng): void {
  // Two newspaper boxes on pedestals, each its own colour: a window onto
  // the day's front page, a coin box on top, a handle under the window.
  for (const x of [-0.25 * M, 0.25 * M]) {
    const color = rng.pick([P.skyBlue, P.crimson, P.gold, P.white, P.darkOlive]);
    const w = 0.21 * M;
    const d = 0.19 * M;
    sink.paint(tone(P.steel, 0.8));
    sink.prism(rounded(x - 0.06 * M, x + 0.06 * M, -0.06 * M, 0.06 * M, 0.02 * M, 1), 0, 0.35 * M, 'd');
    sink.post(x, 0, 0.3 * M, 0.26 * M, 0, 0.03 * M);
    sink.paint(color);
    sink.prism(rounded(x - w, x + w, -d, d, 0.03 * M, 1), 0.35 * M, 0.95 * M);
    sink.paint(tone(color, 0.76));
    sink.box(x - w * 0.85, x + w * 0.85, 0.58 * M, 0.9 * M, d - 0.02, d + 0.03, 'b');
    sink.paint(P.cream);
    sink.quad([x - w * 0.7, 0.61 * M, d + 0.05, x + w * 0.7, 0.61 * M, d + 0.05, x + w * 0.7, 0.87 * M, d + 0.05, x - w * 0.7, 0.87 * M, d + 0.05], 0, 0, 1);
    sink.paint(tone(P.bark, 0.8));
    for (const y of [0.8 * M, 0.72 * M]) sink.quad([x - w * 0.55, y, d + 0.07, x + w * 0.4, y, d + 0.07, x + w * 0.4, y + 0.03 * M, d + 0.07, x - w * 0.55, y + 0.03 * M, d + 0.07], 0, 0, 1);
    sink.paint(tone(P.steel, 0.9));
    sink.bar(x - w * 0.5, 0.53 * M, d + 0.06, x + w * 0.5, 0.53 * M, d + 0.06, 0.03 * M);
    sink.box(x - w * 0.5, x + w * 0.1, 0.95 * M, 1.02 * M, -d * 0.6, d * 0.6, 'd');
  }
  return;
}

export function drawHydrant(sink: Sink, rng: Rng, iso: string, models: PropModels | null): void {
  // KayKit's fire hydrant (City Builder Bits, CC0), in the country's colour.
  const color = iso === 'USA' || iso === 'CAN' ? rng.pick([P.red, P.gold, P.red]) : P.red;
  const model = models?.get('prop-hydrant', { height: 0.72 * M }, (_slot, original) => {
    // Its 33 swatches are one red at 33 lightnesses: kept as tones of this one.
    const k = Math.max(0.6, Math.min(1.3, lightness(original) / 0.75));
    return tone(color, Math.round(k * 20) / 20);
  }, `${color}`);
  if (model !== null && model !== undefined) {
    sink.model(model);
    return;
  }
  sink.paint(color);
  sink.lathe(0, 0, [[0, 0], [0.12 * M, 0], [0.12 * M, 0.06 * M], [0.08 * M, 0.08 * M], [0.08 * M, 0.55 * M], [0.1 * M, 0.58 * M], [0.06 * M, 0.7 * M], [0, 0.72 * M]], 8);
  return;
}

export function drawBollard(sink: Sink, rng: Rng): void {
  // A bollard: a foot, a shaft with a light band near its top, a domed cap.
  const r = 0.07 * M;
  const h = 0.85 * M;
  const post = rng.pick([P.steel, P.bark, P.darkOlive]);
  sink.paint(tone(post, 0.76));
  sink.lathe(0, 0, [[r * 1.3, 0], [r * 1.3, 0.05 * M], [r, 0.08 * M], [0, 0.08 * M]], 8);
  sink.paint(post);
  sink.lathe(0, 0, [[r, 0.08 * M], [r, h * 0.72], [0, h * 0.72]], 8);
  sink.paint(post === P.steel ? P.white : P.gold);
  sink.lathe(0, 0, [[r * 1.02, h * 0.72], [r * 1.02, h * 0.8], [0, h * 0.8]], 8);
  sink.paint(post);
  sink.lathe(0, 0, [[r, h * 0.8], [r, h * 0.92], [r * 0.7, h * 0.98], [0, h]], 8);
  return;
}

/** Draws one piece of building-line furniture in its own space, +Z to the street, standing on y = 0. */
export function drawPiece(sink: Sink, rng: Rng, piece: Piece, style: DressStyle, iso: string, models: PropModels | null): void {
  switch (piece) {
    case 'cafe':
      drawCafe(sink, rng, style);
      return;
    case 'rack':
      drawRack(sink);
      return;
    case 'vending':
      drawVending(sink, rng);
      return;
    case 'bin':
      drawBin(sink, rng, style);
      return;
    case 'planter':
      drawPlanter(sink, rng, models);
      return;
    case 'pots':
      drawPots(sink, rng);
      return;
    case 'stall':
      drawStall(sink, rng, style);
      return;
    case 'newsbox':
      drawNewsbox(sink, rng);
      return;
    case 'hydrant':
      drawHydrant(sink, rng, iso, models);
      return;
    case 'postbox':
      postbox(sink, iso);
      return;
    case 'kiosk':
      drawKiosk(sink, rng);
      return;
    case 'clock':
      drawClock(sink, rng);
      return;
    case 'bollard':
      drawBollard(sink, rng);
      return;
  }
}
