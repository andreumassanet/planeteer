import { tone } from '../../monuments/contract.ts';
import { GLASS_TONE, PROUD } from '../contract.ts';
import type { Rng } from '../random.ts';
import { M } from './config.ts';
import { H } from './footprints.ts';
import { Sink, arched, rounded } from './sink.ts';
import { P, POST_COLOURS, POST_SHAPES } from './styles.ts';

/**
 * A post box in the shape the country's is: a pillar with a domed cap where
 * the pillar box is the thing (Britain and what took it from Britain, Japan's
 * old ones), a collection box on legs with its hood where the United States'
 * blue box is, a square box with a rounded top on a pedestal for Japan's and
 * Korea's and China's, and a box on a post everywhere else — Spain's, France's
 * and Germany's yellow. About waist to chest on the body.
 */
export function postbox(sink: Sink, iso: string): void {
  const color = POST_COLOURS[iso] ?? P.red;
  const shape = POST_SHAPES[iso] ?? 'post';
  const slot = tone(P.bark, 0.6);
  if (shape === 'pillar') {
    const r = 0.14 * H;
    const h = 0.66 * H;
    sink.paint(tone(color, 0.76));
    sink.lathe(0, 0, [[0, 0], [r * 1.15, 0], [r * 1.15, 0.05 * H], [r, 0.07 * H], [0, 0.07 * H]], 12);
    sink.paint(color);
    sink.lathe(0, 0, [[r, 0.07 * H], [r, h * 0.8], [0, h * 0.8]], 12);
    sink.paint(tone(color, 0.84));
    sink.lathe(0, 0, [[0, h * 0.8], [r * 1.12, h * 0.8], [r * 1.12, h * 0.85], [r * 0.95, h * 0.88], [r * 0.7, h * 0.95], [r * 0.3, h * 0.99], [0, h]], 12);
    // The slot under the cap, its hood, and the plate with the collection times.
    const face = r * Math.cos(Math.PI / 12) + PROUD / 4;
    sink.paint(tone(color, 0.84));
    sink.box(-r * 0.42, r * 0.42, h * 0.68, h * 0.72, face - 0.04, face + 0.06, 'b');
    sink.paint(slot);
    sink.quad([-r * 0.36, h * 0.64, face, r * 0.36, h * 0.64, face, r * 0.36, h * 0.675, face, -r * 0.36, h * 0.675, face], 0, 0, 1);
    sink.paint(P.white);
    sink.quad([-r * 0.28, h * 0.44, face, r * 0.28, h * 0.44, face, r * 0.28, h * 0.58, face, -r * 0.28, h * 0.58, face], 0, 0, 1);
    sink.paint(P.gold);
    sink.quad([-r * 0.12, h * 0.73, face + PROUD / 4, r * 0.12, h * 0.73, face + PROUD / 4, r * 0.12, h * 0.78, face + PROUD / 4, -r * 0.12, h * 0.78, face + PROUD / 4], 0, 0, 1);
    return;
  }
  if (shape === 'collection') {
    // The United States' blue box: four legs, a body, a hood arched over the
    // pull-down handle, and a white label.
    const w = 0.16 * H;
    const d = 0.15 * H;
    const foot = 0.12 * H;
    const h = 0.62 * H;
    sink.paint(tone(color, 0.76));
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      sink.prism(rounded(x * w * 0.8 - 0.05, x * w * 0.8 + 0.05, z * d * 0.8 - 0.05, z * d * 0.8 + 0.05, 0.02, 1), 0, foot + 0.02, 'd');
    }
    sink.paint(color);
    sink.slab(arched(-w, w, foot, h - w * 0.5, w * 0.5, 6), -d, d);
    // The hood: a darker arch standing proud over the handle.
    sink.paint(tone(color, 0.76));
    sink.slab(arched(-w * 0.8, w * 0.8, h * 0.66, h * 0.72, w * 0.25, 5), d, d + 0.07, 'b');
    sink.paint(tone(P.steel, 0.9));
    sink.bar(-w * 0.45, h * 0.64, d + 0.06, w * 0.45, h * 0.64, d + 0.06, 0.04);
    sink.paint(P.white);
    sink.quad([-w * 0.55, h * 0.36, d + PROUD / 4, w * 0.55, h * 0.36, d + PROUD / 4, w * 0.55, h * 0.5, d + PROUD / 4, -w * 0.55, h * 0.5, d + PROUD / 4], 0, 0, 1);
    return;
  }
  if (shape === 'cabinet') {
    // East Asia's: a square box with a rounded top on a short pedestal, two
    // slots under their hoods, a white plate.
    const w = 0.15 * H;
    const d = 0.13 * H;
    const h = 0.64 * H;
    sink.paint(tone(color, 0.76));
    sink.prism(rounded(-w * 0.6, w * 0.6, -d * 0.6, d * 0.6, 0.03, 1), 0, 0.14 * H, 'd');
    sink.paint(color);
    sink.prism(rounded(-w, w, -d, d, 0.05, 2), 0.14 * H, h - w * 0.3, 'u');
    sink.slab(arched(-w, w, h - w * 0.3, h - w * 0.3, w * 0.3, 5), -d, d);
    for (const x of [-w * 0.45, w * 0.45]) {
      sink.paint(tone(color, 0.84));
      sink.box(x - w * 0.36, x + w * 0.36, h * 0.72, h * 0.77, d - 0.02, d + 0.06, 'b');
      sink.paint(slot);
      sink.quad([x - w * 0.3, h * 0.68, d + PROUD / 4, x + w * 0.3, h * 0.68, d + PROUD / 4, x + w * 0.3, h * 0.715, d + PROUD / 4, x - w * 0.3, h * 0.715, d + PROUD / 4], 0, 0, 1);
    }
    sink.paint(P.white);
    sink.quad([-w * 0.6, h * 0.42, d + PROUD / 4, w * 0.6, h * 0.42, d + PROUD / 4, w * 0.6, h * 0.56, d + PROUD / 4, -w * 0.6, h * 0.56, d + PROUD / 4], 0, 0, 1);
    return;
  }
  // A box on a post: an octagonal post in grey, a box with a rounded top,
  // the slot under its lip and the country's horn in the dark tone on its face.
  const w = 0.14 * H;
  const d = 0.1 * H;
  const bottom = 0.34 * H;
  const h = 0.66 * H;
  sink.paint(tone(P.steel, 0.9));
  sink.lathe(0, 0, [[0.05 * H, 0], [0.05 * H, 0.02 * H], [0.025 * H, 0.03 * H], [0.025 * H, bottom], [0, bottom]], 8);
  sink.paint(color);
  sink.slab(arched(-w, w, bottom, h - w * 0.35, w * 0.35, 5), -d, d);
  sink.paint(tone(color, 0.84));
  sink.box(-w * 0.8, w * 0.8, h * 0.78, h * 0.82, d - 0.02, d + 0.07, 'b');
  sink.paint(slot);
  sink.quad([-w * 0.66, h * 0.74, d + PROUD / 4, w * 0.66, h * 0.74, d + PROUD / 4, w * 0.66, h * 0.775, d + PROUD / 4, -w * 0.66, h * 0.775, d + PROUD / 4], 0, 0, 1);
  // The horn: a disc and its bell, simply.
  const cy = h * 0.6;
  const horn: [number, number][] = Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2) * w * 0.32, cy + Math.sin((i / 8) * Math.PI * 2) * w * 0.32]);
  sink.slab(horn, d, d + 0.03, 'b');
  sink.paint(color);
  sink.slab(horn.map(([x, y]) => [x * 0.55, cy + (y - cy) * 0.55] as [number, number]), d + 0.03, d + 0.05, 'b');
}

export function drawKiosk(sink: Sink, rng: Rng): void {
  // An eight-sided kiosk: a stone plinth, a body in the town's green or
  // brown with its service window lit and a counter under it, a band of
  // the name round the top, an overhanging roof and a finial.
  const r = 0.92 * M;
  const h = 2.35 * M;
  const body = rng.pick([P.darkOlive, P.green, P.bark, P.skyBlue]);
  const sides = 8;
  const ring = (radius: number): [number, number][] =>
    Array.from({ length: sides }, (_, i) => {
      const a = Math.PI / 2 - Math.PI / sides + (i / sides) * Math.PI * 2;
      return [Math.cos(a) * radius, Math.sin(a) * radius];
    });
  sink.paint(P.bone);
  sink.prism(ring(r * 1.05), 0, 0.12 * M, 'd');
  sink.paint(body);
  sink.prism(ring(r), 0.12 * M, h, 'du');
  // The service window on the front face, its frame, and a shelf under it.
  const face = r * Math.cos(Math.PI / sides);
  const half = r * Math.sin(Math.PI / sides) * 0.8;
  sink.paint(tone(body, 0.76));
  sink.quad([-half, 1.0 * M, face + PROUD / 4, half, 1.0 * M, face + PROUD / 4, half, 1.9 * M, face + PROUD / 4, -half, 1.9 * M, face + PROUD / 4], 0, 0, 1);
  sink.paint(tone(P.slate, GLASS_TONE), 0.6);
  sink.quad([-half * 0.85, 1.06 * M, face + PROUD / 2, half * 0.85, 1.06 * M, face + PROUD / 2, half * 0.85, 1.84 * M, face + PROUD / 2, -half * 0.85, 1.84 * M, face + PROUD / 2], 0, 0, 1);
  sink.paint(tone(body, 0.84));
  sink.box(-half * 1.1, half * 1.1, 0.95 * M, 1.0 * M, face - 0.05, face + 0.25 * M, '');
  // Posters on two of the other faces.
  for (const k of [2, 6]) {
    const a = Math.PI / 2 + (k / sides) * Math.PI * 2;
    const cx = Math.cos(a) * (face + PROUD / 4);
    const cz = Math.sin(a) * (face + PROUD / 4);
    const tx = -Math.sin(a) * half * 0.8;
    const tz = Math.cos(a) * half * 0.8;
    sink.paint(rng.pick([P.cream, P.gold, P.salmon, P.white]));
    sink.quad([cx - tx, 0.7 * M, cz - tz, cx + tx, 0.7 * M, cz + tz, cx + tx, 1.8 * M, cz + tz, cx - tx, 1.8 * M, cz - tz], Math.cos(a), 0, Math.sin(a));
  }
  sink.paint(rng.pick([P.gold, P.cream, P.crimson]));
  sink.prism(ring(r * 1.03), h - 0.3 * M, h, 'd');
  sink.paint(tone(body, 0.76));
  sink.prism(ring(r * 1.25), h, h + 0.08 * M);
  sink.lathe(0, 0, [[0, h + 0.08 * M], [r * 1.1, h + 0.08 * M], [r * 0.3, h + 0.5 * M], [0.06 * M, h + 0.56 * M], [0.1 * M, h + 0.62 * M], [0, h + 0.7 * M]], sides);
  return;
}

export function drawClock(sink: Sink, rng: Rng): void {
  // A street clock: a plinth, a fluted column, a capital, and a drum of
  // two white faces with their hands, capped by a finial.
  const post = rng.pick([P.darkOlive, P.bark, P.steel]);
  const h = 2.9 * M;
  sink.paint(tone(post, 0.84));
  sink.lathe(0, 0, [[0, 0], [0.18 * M, 0], [0.18 * M, 0.08 * M], [0.12 * M, 0.14 * M], [0.12 * M, 0.3 * M], [0, 0.3 * M]], 8);
  sink.paint(post);
  sink.lathe(0, 0, [[0.07 * M, 0.3 * M], [0.055 * M, h - 0.1 * M], [0, h - 0.1 * M]], 8);
  sink.paint(tone(post, 0.84));
  sink.lathe(0, 0, [[0, h - 0.12 * M], [0.08 * M, h - 0.12 * M], [0.13 * M, h], [0, h]], 8);
  const r = 0.28 * M;
  const cy = h + r - 0.02 * M;
  const circle = (radius: number): [number, number][] =>
    Array.from({ length: 12 }, (_, i) => [Math.cos((i / 12) * Math.PI * 2) * radius, cy + Math.sin((i / 12) * Math.PI * 2) * radius]);
  sink.paint(post);
  sink.slab(circle(r), -0.09 * M, 0.09 * M);
  for (const side of [1, -1]) {
    const z = side * (0.09 * M + PROUD / 4);
    sink.paint(P.white, 0.5);
    const face = circle(r * 0.84);
    for (let i = 0; i < face.length; i++) {
      const [ax, ay] = face[i]!;
      const [bx, by] = face[(i + 1) % face.length]!;
      sink.tri(0, cy, z, ax, ay, z, bx, by, z, 0, 0, side);
    }
    sink.paint(P.bark);
    const zz = z + side * (PROUD / 4);
    sink.quad([-0.02 * M, cy, zz, 0.02 * M, cy, zz, 0.02 * M, cy + 0.19 * M, zz, -0.02 * M, cy + 0.19 * M, zz], 0, 0, side);
    sink.quad([0, cy - 0.02 * M, zz, 0.14 * M, cy - 0.02 * M, zz, 0.14 * M, cy + 0.02 * M, zz, 0, cy + 0.02 * M, zz], 0, 0, side);
  }
  sink.paint(tone(post, 0.84));
  sink.lathe(0, 0, [[0, cy + r - 0.02], [0.06 * M, cy + r], [0.03 * M, cy + r + 0.14 * M], [0, cy + r + 0.2 * M]], 6);
  return;
}
