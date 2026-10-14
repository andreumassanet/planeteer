import * as THREE from 'three';
import { bedtimeByte } from '../../lights.ts';
import { PALETTE } from '../../theme.ts';
import type { Rng } from '../random.ts';
import { HANG, M, P } from './config.ts';
import { Out, card, colourOf, face, hungAt, line, quadCard, quadOut, shadeOf, tube } from './geometry.ts';

export const CORD = shadeOf(PALETTE.bone, PALETTE.steel, 0.3);
export const CORD_RADIUS = 0.035;

export const pa = new THREE.Vector3();
export const pb = new THREE.Vector3();
export const pc = new THREE.Vector3();
export const pd = new THREE.Vector3();
export const pm = new THREE.Vector3();

/** Cut shapes along a line: `shape` draws one between `t0` and `t1` of the line. */
export function along(a: THREE.Vector3, b: THREE.Vector3, spacing: number, width: number, each: (t0: number, t1: number, n: number) => void): void {
  const length = a.distanceTo(b);
  const count = Math.floor((length - 0.8) / spacing);
  if (count < 1) return;
  const start = (length - count * spacing) / 2 + spacing / 2;
  for (let n = 0; n < count; n++) {
    const s = start + n * spacing;
    each((s - width / 2) / length, (s + width / 2) / length, n);
  }
}

export function pennants(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, colours: readonly number[], rng: Rng): void {
  line(out, a, b, sag, CORD_RADIUS, CORD, 8);
  const first = rng.int(colours.length);
  const width = 0.5 * M;
  along(a, b, 0.68 * M, width, (t0, t1, n) => {
    hungAt(a, b, sag, t0, pa);
    hungAt(a, b, sag, t1, pb);
    hungAt(a, b, sag, (t0 + t1) / 2, pc);
    pc.y -= HANG.pennants.drop;
    card(out, pa, pb, pc, colourOf(colours[(first + n) % colours.length]!));
  });
}

export function picado(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, colours: readonly number[], rng: Rng): void {
  line(out, a, b, sag, CORD_RADIUS, CORD, 8);
  const first = rng.int(colours.length);
  const width = 0.55 * M;
  along(a, b, 0.62 * M, width, (t0, t1, n) => {
    hungAt(a, b, sag, t0, pa);
    hungAt(a, b, sag, t1, pb);
    const drop = HANG.picado.drop;
    pc.copy(pb).setY(pb.y - drop);
    pd.copy(pa).setY(pa.y - drop);
    quadCard(out, pa, pb, pc, pd, colourOf(colours[(first + n * 3) % colours.length]!));
  });
}

export const LAUNDRY = [P.white, P.cream, P.skyBlue, P.blush, P.white, P.gold, P.pink, P.bone];

export function laundry(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, rng: Rng): void {
  line(out, a, b, sag, CORD_RADIUS, CORD, 8);
  const length = a.distanceTo(b);
  let s = rng.range(0.8, 2);
  while (s < length - 1) {
    // A towel, a shirt, a tablecloth: the width and the drop together.
    const kind = rng.int(3);
    const width = (kind === 2 ? rng.range(1.0, 1.3) : rng.range(0.5, 0.75)) * M;
    const drop = Math.min(HANG.laundry.drop, (kind === 0 ? rng.range(0.55, 0.8) : kind === 1 ? rng.range(0.7, 0.8) : rng.range(0.6, 0.8)) * M);
    if (s + width > length - 0.8) break;
    hungAt(a, b, sag, s / length, pa);
    hungAt(a, b, sag, (s + width) / length, pb);
    pc.copy(pb).setY(pb.y - drop);
    pd.copy(pa).setY(pa.y - drop);
    quadCard(out, pa, pb, pc, pd, colourOf(rng.pick(LAUNDRY)));
    s += width + (rng.chance(0.25) ? rng.range(1.2, 2.5) : rng.range(0.12, 0.35));
  }
}

export function marigolds(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, rng: Rng): void {
  const orange = colourOf(P.orange);
  const gold = colourOf(P.gold);
  const pieces = Math.max(8, Math.round(a.distanceTo(b) / 0.55));
  // Two swags, the second hung deeper: a garland is a heavy rope of flowers.
  line(out, a, b, sag * 0.6, 0.11, orange, pieces, gold);
  line(out, a, b, sag, 0.09, gold, pieces, orange);
  // And the strands that fall from it.
  along(a, b, 1.1, 0, (t0, _t1, n) => {
    hungAt(a, b, sag, t0, pa);
    const drop = HANG.marigolds.drop * (n % 2 === 0 ? 1 : 0.7) - sag * 0.4;
    pb.copy(pa).setY(pa.y - Math.max(0.3, drop));
    tube(out, pa, pb, 0.08, n % 2 === 0 ? orange : gold);
  });
  void rng;
}

export function lanterns(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, colours: readonly number[], rng: Rng): void {
  line(out, a, b, sag, CORD_RADIUS, shadeOf(P.bark, P.ink, 0.2), 8);
  const body = 0.5 * M;
  const radius = 0.2 * M;
  const thread = HANG.lanterns.drop - body;
  const bed = bedtimeByte(rng.unit(), rng.chance(0.5));
  along(a, b, 1.8 * M, 0, (t0, _t1, n) => {
    hungAt(a, b, sag, t0, pa);
    const colour = colourOf(colours[n % 2 === 0 || colours.length < 2 ? 0 : 1]!);
    const cap = shadeOf(P.bark, P.ink, 0.1);
    const top = pa.y - thread;
    pb.copy(pa).setY(top);
    tube(out, pa, pb, 0.025, cap);
    lantern(out, pa.x, top, pa.z, radius, body, colour, cap, 200, bed);
  });
}

export const lanternRings = [0, 1, 2].map(() => Array.from({ length: 6 }, () => new THREE.Vector3()));
export const lanternN = new THREE.Vector3();
export const lanternC = new THREE.Vector3();

/** A paper lantern: a six-sided barrel, `radius` at its waist and `height` tall, its top at `top`, lit after dark. */
export function lantern(out: Out, x: number, top: number, z: number, radius: number, height: number, colour: THREE.Color, cap: THREE.Color, glow: number, bed: number): void {
  const levels = [top, top - height / 2, top - height];
  const radii = [radius * 0.55, radius, radius * 0.55];
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 6; k++) {
      const angle = (k * Math.PI) / 3;
      lanternRings[r]![k]!.set(x + Math.cos(angle) * radii[r]!, levels[r]!, z + Math.sin(angle) * radii[r]!);
    }
  }
  for (let band = 0; band < 2; band++) {
    for (let k = 0; k < 6; k++) {
      const j = (k + 1) % 6;
      const angle = ((k + 0.5) * Math.PI) / 3;
      lanternN.set(Math.cos(angle), band === 0 ? 0.45 : -0.45, Math.sin(angle)).normalize();
      quadOut(out, lanternRings[band]![k]!, lanternRings[band]![j]!, lanternRings[band + 1]![j]!, lanternRings[band + 1]![k]!, lanternN, colour, glow, bed);
    }
  }
  // The caps, dark and unlit.
  for (const [ring, y, sign] of [[0, top, 1], [2, top - height, -1]] as const) {
    lanternC.set(x, y, z);
    lanternN.set(0, sign, 0);
    for (let k = 0; k < 6; k++) face(out, lanternC, lanternRings[ring]![k]!, lanternRings[ring]![(k + 1) % 6]!, cap, lanternN);
  }
}

export const bulbN = new THREE.Vector3();
export const bulbTips = Array.from({ length: 6 }, () => new THREE.Vector3());

export function bulbs(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, rng: Rng): void {
  line(out, a, b, sag, CORD_RADIUS, shadeOf(P.bark, P.ink, 0.2), 8);
  const colour = colourOf(P.cream);
  const r = 0.09 * M;
  const bed = bedtimeByte(rng.unit(), rng.chance(0.6));
  along(a, b, 0.95 * M, 0, (t0) => {
    hungAt(a, b, sag, t0, pm);
    pm.y -= HANG.bulbs.drop - r;
    // An octahedron: up, down, and four round the waist.
    bulbTips[0]!.set(pm.x, pm.y + r, pm.z);
    bulbTips[1]!.set(pm.x, pm.y - r, pm.z);
    bulbTips[2]!.set(pm.x + r, pm.y, pm.z);
    bulbTips[3]!.set(pm.x, pm.y, pm.z + r);
    bulbTips[4]!.set(pm.x - r, pm.y, pm.z);
    bulbTips[5]!.set(pm.x, pm.y, pm.z - r);
    for (let k = 0; k < 4; k++) {
      const p = bulbTips[2 + k]!;
      const q = bulbTips[2 + ((k + 1) % 4)]!;
      for (const tip of [bulbTips[0]!, bulbTips[1]!]) {
        bulbN.set(p.x + q.x + tip.x - 3 * pm.x, p.y + q.y + tip.y - 3 * pm.y, p.z + q.z + tip.z - 3 * pm.z).normalize();
        face(out, tip, p, q, colour, bulbN, 230, bed);
      }
    }
  });
}

export const sailL = new THREE.Vector3();
export const sailR = new THREE.Vector3();
export const sailL2 = new THREE.Vector3();
export const sailR2 = new THREE.Vector3();

/** A shade sail: cloth from the pair of anchors `a0 a1` on one side to `b0 b1` on the other, in bands of two colours. */
export function sail(out: Out, a0: THREE.Vector3, a1: THREE.Vector3, b0: THREE.Vector3, b1: THREE.Vector3, sag: number, colours: readonly number[], rng: Rng): void {
  const first = colourOf(colours[rng.int(colours.length)]!);
  const second = colourOf(P.cream);
  const pieces = 6;
  for (let i = 0; i < pieces; i++) {
    hungAt(a0, b0, sag, i / pieces, sailL);
    hungAt(a1, b1, sag, i / pieces, sailR);
    hungAt(a0, b0, sag, (i + 1) / pieces, sailL2);
    hungAt(a1, b1, sag, (i + 1) / pieces, sailR2);
    quadCard(out, sailL, sailR, sailR2, sailL2, i % 2 === 0 ? first : second);
  }
}

export function banner(out: Out, a: THREE.Vector3, b: THREE.Vector3, sag: number, colours: readonly number[], rng: Rng): void {
  line(out, a, b, sag, CORD_RADIUS * 1.2, shadeOf(P.steel, P.ink, 0.2), 8);
  const main = colourOf(colours[rng.int(colours.length)]!);
  let band = colourOf(colours[rng.int(colours.length)]!);
  if (band === main) band = colourOf(P.white);
  const length = a.distanceTo(b);
  const width = Math.min(length * 0.55, 7.5 * M);
  const t0 = 0.5 - width / length / 2;
  const t1 = 0.5 + width / length / 2;
  const drop = HANG.banner.drop;
  const pieces = 3;
  for (let i = 0; i < pieces; i++) {
    hungAt(a, b, sag, t0 + ((t1 - t0) * i) / pieces, pa);
    hungAt(a, b, sag, t0 + ((t1 - t0) * (i + 1)) / pieces, pb);
    // A band at the top in the second colour, then the cloth.
    pc.copy(pb).setY(pb.y - drop * 0.22);
    pd.copy(pa).setY(pa.y - drop * 0.22);
    quadCard(out, pa, pb, pc, pd, band);
    pa.y -= drop * 0.22;
    pb.y -= drop * 0.22;
    pc.copy(pb).setY(pb.y - drop * 0.78);
    pd.copy(pa).setY(pa.y - drop * 0.78);
    quadCard(out, pa, pb, pc, pd, main);
  }
}
