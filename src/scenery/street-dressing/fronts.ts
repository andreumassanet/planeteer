import { tone } from '../../monuments/contract.ts';
import { PROUD } from '../contract.ts';
import type { Rng } from '../random.ts';
import { M } from './config.ts';
import type { Window } from './facade.ts';
import { Sink, rounded } from './sink.ts';
import { FLOWERS, P, type DressStyle } from './styles.ts';

/**
 * An awning: a striped sheet from the wall at `top` down to `top - drop` at
 * `reach` out, a scalloped valance off its front edge, the roller it winds on
 * along the wall and two folding arms under it. Two stripes a body-metre,
 * each a sheet over and under, and no sides — it is fabric.
 */
export function awning(sink: Sink, x0: number, x1: number, wall: number, top: number, reach: number, drop: number, valance: number, fabric: readonly [number, number]): void {
  const stripes = Math.max(2, Math.round((x1 - x0) / (0.5 * M)));
  const step = (x1 - x0) / stripes;
  const back = wall + 0.1;
  const out = wall + reach;
  const low = top - drop;
  for (let i = 0; i < stripes; i++) {
    sink.paint(fabric[i % 2]!);
    const a = x0 + i * step;
    const b = a + step;
    // The slope's normal leans out and up.
    sink.sheet([a, top, back, b, top, back, b, low, out, a, low, out], 0, reach, drop);
    // The valance: a straight band and a point hanging from its middle.
    const m = (a + b) / 2;
    sink.sheet([a, low, out, b, low, out, b, low - valance * 0.6, out, a, low - valance * 0.6, out], 0, 0, 1);
    sink.tri(a, low - valance * 0.6, out, b, low - valance * 0.6, out, m, low - valance, out, 0, 0, 1);
    sink.tri(a, low - valance * 0.6, out, b, low - valance * 0.6, out, m, low - valance, out, 0, 0, -1);
  }
  // The roller box on the wall, and the arms.
  sink.paint(tone(P.steel, 0.9));
  sink.box(x0 - 0.05, x1 + 0.05, top - 0.02, top + 0.16, wall + 0.02, back + 0.04, 'b');
  sink.paint(tone(P.steel, 0.7));
  for (const x of [x0 + 0.15, x1 - 0.15]) sink.bar(x, top - drop * 2.2, wall + 0.05, x, low + 0.03, out - 0.05, 0.05);
}

/** Abstract lettering on a sign's face: two or three bars in a tone off its board, stepped proud of it. */
export function glyphs(sink: Sink, rng: Rng, x0: number, x1: number, y0: number, y1: number, z: number, color: number, vertical: boolean): void {
  sink.paint(color);
  const count = rng.between(2, 3);
  if (vertical) {
    const h = (y1 - y0) / (count * 1.6);
    for (let i = 0; i < count; i++) {
      const top = y1 - h * 0.3 - i * h * 1.6;
      const inset = (x1 - x0) * rng.range(0.18, 0.3);
      sink.quad([x0 + inset, top - h, z, x1 - inset, top - h, z, x1 - inset, top, z, x0 + inset, top, z], 0, 0, 1);
    }
    return;
  }
  const height = (y1 - y0) * 0.42;
  const mid = (y0 + y1) / 2;
  let x = x0 + (x1 - x0) * rng.range(0.12, 0.2);
  const end = x1 - (x1 - x0) * rng.range(0.12, 0.2);
  for (let i = 0; i < count && x < end - 0.1; i++) {
    const w = Math.min(end - x, (end - x0) * rng.range(0.18, 0.34));
    sink.quad([x, mid - height / 2, z, x + w, mid - height / 2, z, x + w, mid + height / 2, z, x, mid + height / 2, z], 0, 0, 1);
    x += w + (x1 - x0) * 0.06;
  }
}

/** A board on the wall in a frame of its own darker tone, and its lettering. */
export function fascia(sink: Sink, rng: Rng, style: DressStyle, x0: number, x1: number, y0: number, y1: number, wall: number): void {
  const board = rng.pick(style.signs);
  const depth = 0.12;
  const rim = 0.07;
  sink.paint(tone(board, 0.76));
  sink.box(x0, x1, y0, y1, wall + 0.02, wall + 0.02 + depth, 'b');
  sink.paint(board, style.signGlow);
  const face = wall + 0.02 + depth + PROUD / 4;
  sink.quad([x0 + rim, y0 + rim, face, x1 - rim, y0 + rim, face, x1 - rim, y1 - rim, face, x0 + rim, y1 - rim, face], 0, 0, 1);
  glyphs(sink, rng, x0 + rim, x1 - rim, y0 + rim, y1 - rim, face + PROUD / 4, letterOn(board), false);
}

/** A colour that reads on a board of this one. */
export function letterOn(board: number): number {
  const light = board === P.white || board === P.cream || board === P.gold || board === P.sand || board === P.skyBlue;
  return light ? P.bark : P.white;
}

/**
 * A blade: a sign standing out from the wall on a bracket, its face along the
 * street, framed and lettered on both sides. Tall and narrow in east and
 * south Asia, where a street is read by its vertical boards; a small square
 * hung from a scroll of bracket elsewhere.
 */
export function blade(sink: Sink, rng: Rng, style: DressStyle, x: number, wall: number, y0: number, height: number, reach: number): void {
  const board = rng.pick(style.signs);
  const t = 0.14;
  const out0 = wall + 0.25;
  const out1 = wall + 0.25 + reach;
  const tall = style.blade === 'tall';
  sink.paint(tone(P.bark, 0.9));
  // The bracket: a rail over the board and a stay under it to the wall.
  sink.bar(x, y0 + height + 0.12, wall + 0.02, x, y0 + height + 0.12, out1 + 0.05, 0.08);
  sink.bar(x, y0 + height * (tall ? 0.1 : -0.25), wall + 0.02, x, y0 + height + 0.1, out1 * 0.5 + out0 * 0.5, 0.06);
  sink.post(x, wall + 0.08, 0.14, 0.12, y0 - 0.05, height + 0.3, 'd');
  if (!tall) {
    // Two chains the square hangs from.
    for (const z of [out0 + 0.08, out1 - 0.08]) sink.bar(x, y0 + height + 0.12, z, x, y0 + height, z, 0.04);
  }
  sink.paint(tone(board, 0.76));
  sink.box(x - t / 2, x + t / 2, y0, y0 + height, out0, out1);
  const letter = letterOn(board);
  const rim = Math.min(0.08, reach * 0.12);
  for (const side of [1, -1]) {
    const face = x + side * (t / 2 + PROUD / 4);
    sink.paint(board, style.signGlow);
    sink.quad([face, y0 + rim, out0 + rim, face, y0 + rim, out1 - rim, face, y0 + height - rim, out1 - rim, face, y0 + height - rim, out0 + rim], side, 0, 0);
    sink.paint(letter);
    const count = tall ? rng.between(2, 4) : 2;
    const span = ((height - 2 * rim) * 0.9) / count;
    const lift = face + side * (PROUD / 4);
    for (let i = 0; i < count; i++) {
      const top = y0 + height - rim - span * 0.15 - i * span;
      const inset = reach * (tall ? 0.26 : 0.22);
      sink.quad([lift, top - span * 0.6, out0 + inset, lift, top - span * 0.6, out1 - inset, lift, top, out1 - inset, lift, top, out0 + inset], side, 0, 0);
    }
  }
}

/** A flower box under a window: a trough with a lip, brackets under it, leaves in lumps and flowers among them. */
export function flowerBox(sink: Sink, rng: Rng, x0: number, x1: number, top: number, wall: number): void {
  const h = 0.16 * M;
  const d = 0.2 * M;
  const back = wall + 0.02;
  const trough = rng.chance(0.6) ? P.clay : P.bone;
  sink.paint(trough);
  sink.box(x0 + 0.03, x1 - 0.03, top - h, top - 0.05, back, back + d - 0.03, 'bu');
  sink.paint(tone(trough, 0.84));
  sink.box(x0, x1, top - 0.05, top, back, back + d, 'b');
  sink.paint(tone(P.bark, 0.8));
  for (const x of [x0 + 0.2, x1 - 0.2]) sink.bar(x, top - h - 0.25, back + 0.02, x, top - h + 0.02, back + d * 0.8, 0.05);
  const leaf = rng.chance(0.5) ? P.green : P.darkOlive;
  const lumps = Math.max(2, Math.round((x1 - x0) / (0.22 * M)));
  const flower = rng.pick(FLOWERS);
  for (let i = 0; i < lumps; i++) {
    const x = x0 + ((i + 0.5) / lumps) * (x1 - x0);
    const r = rng.range(0.08, 0.11) * M;
    sink.paint(i % 2 === 0 ? leaf : tone(leaf, 0.84));
    sink.lump(x, top - 0.02, back + d / 2 + rng.jitter() * 0.05, r, r * rng.range(1.4, 2), 4);
    if (rng.chance(0.75)) {
      sink.paint(rng.chance(0.85) ? flower : rng.pick(FLOWERS));
      const s = 0.05 * M;
      sink.lump(x + rng.jitter() * r * 0.5, top + r * 1.1, back + d * 0.62, s, s * 1.3, 3);
    }
  }
}

/** A pair of louvred shutters folded back beside a window, each in a frame of its own. */
export function shutters(sink: Sink, w: Window, color: number): void {
  const width = (w.x1 - w.x0) / 2;
  const back = w.wall + 0.02;
  const depth = 0.07;
  const slats = Math.max(4, Math.round((w.y1 - w.y0) / 0.28));
  for (const [a, b] of [[w.x0 - width - 0.04, w.x0 - 0.04], [w.x1 + 0.04, w.x1 + width + 0.04]] as const) {
    sink.paint(color);
    sink.box(a, b, w.y0, w.y1, back, back + depth, 'b');
    // The louvres: bars across in the shutter's shade, stepped proud of it.
    sink.paint(tone(color, 0.76));
    const face = back + depth + PROUD / 4;
    const inset = Math.min(0.08, width * 0.15);
    const span = (w.y1 - w.y0 - 2 * inset) / slats;
    for (let i = 0; i < slats; i++) {
      const y = w.y0 + inset + (i + 0.3) * span;
      sink.quad([a + inset, y, face, b - inset, y, face, b - inset, y + span * 0.4, face, a + inset, y + span * 0.4, face], 0, 0, 1);
    }
  }
}

/** An air conditioner's outdoor unit on two brackets: a cabinet with a round grille, its fan's hub, and a pipe down the wall. */
export function aircon(sink: Sink, x: number, top: number, wall: number): void {
  const w = 0.8 * M;
  const h = 0.55 * M;
  const d = 0.28 * M;
  const back = wall + 0.1;
  sink.paint(tone(P.steel, 0.8));
  for (const bx of [x - w * 0.35, x + w * 0.35]) sink.bar(bx, top - h - 0.02, wall + 0.02, bx, top - h - 0.02, back + d, 0.06);
  sink.paint(P.bone);
  sink.prism(rounded(x - w / 2, x + w / 2, back, back + d, 0.05, 1).map(([px, pz]) => [px, pz] as [number, number]), top - h, top);
  // The grille, the ring round it and the hub, each stepped off the last.
  const cx = x - w * 0.14;
  const cy = top - h / 2;
  const r = h * 0.38;
  const face = back + d + PROUD / 4;
  sink.paint(tone(P.bone, 0.84));
  sink.slab(Array.from({ length: 10 }, (_, i) => [cx + Math.cos((i / 10) * Math.PI * 2) * r * 1.12, cy + Math.sin((i / 10) * Math.PI * 2) * r * 1.12] as [number, number]), face - 0.02, face, 'b');
  sink.paint(tone(P.steel, 0.9));
  sink.slab(Array.from({ length: 10 }, (_, i) => [cx + Math.cos((i / 10) * Math.PI * 2) * r, cy + Math.sin((i / 10) * Math.PI * 2) * r] as [number, number]), face, face + 0.02, 'b');
  sink.paint(P.bone);
  sink.post(cx, face + 0.05, r * 0.4, 0.06, cy - r * 0.2, r * 0.4, 'b');
  // A service panel beside it, and the pipe that runs down the wall.
  sink.paint(tone(P.bone, 0.84));
  sink.quad([x + w * 0.2, top - h * 0.8, face, x + w * 0.42, top - h * 0.8, face, x + w * 0.42, top - h * 0.3, face, x + w * 0.2, top - h * 0.3, face], 0, 0, 1);
  sink.paint(P.white);
  sink.bar(x + w * 0.44, top - h * 0.5, back - 0.04, x + w * 0.44, top - h - 0.5 * M, wall + 0.06, 0.06);
}
