// The decor's shapes: coral, kelp, grass, rocks and starfish as loose triangles
// in their own frame, built once and copied into a tile per item.

import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import type { DecorKind } from '../sea-floor.ts';
import { hash3 } from '../weather.ts';

/**
 * One piece of decor as loose triangles in its own frame (+Y up, on `y = 0`),
 * with, per vertex, which of its two colours it wears and how far it sways at
 * the tip, in units. Built once, copied into a tile per item.
 */
export interface Shape {
  position: number[];
  part: number[];
  sway: number[];
  /** Its highest point, in its own units: what an item is shrunk by to stay under the surface. */
  top: number;
}

const newShape = (): Shape => ({ position: [], part: [], sway: [], top: 0 });

function tri(shape: Shape, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, part: number, sway: (y: number) => number): void {
  for (const v of [a, b, c]) {
    shape.position.push(v.x, v.y, v.z);
    shape.part.push(part);
    shape.sway.push(sway(v.y));
  }
}

const still = (): number => 0;

/** A faceted tube from `from` to `to`, `sides` round, tapering; closed at the top. */
function tube(shape: Shape, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, sides: number, part: number, sway: (y: number) => number = still): void {
  const axis = new THREE.Vector3().subVectors(to, from);
  const length = axis.length();
  axis.normalize();
  const side = new THREE.Vector3(1, 0, 0);
  if (Math.abs(axis.x) > 0.9) side.set(0, 0, 1);
  const u = new THREE.Vector3().crossVectors(axis, side).normalize();
  const w = new THREE.Vector3().crossVectors(axis, u).normalize();
  const ring = (centre: THREE.Vector3, r: number, k: number): THREE.Vector3 => {
    const a = (k / sides) * Math.PI * 2;
    return centre.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r);
  };
  const top = from.clone().addScaledVector(axis, length);
  for (let k = 0; k < sides; k++) {
    const a0 = ring(from, r0, k), a1 = ring(from, r0, k + 1);
    const b0 = ring(top, r1, k), b1 = ring(top, r1, k + 1);
    tri(shape, a0, b1, a1, part, sway);
    tri(shape, a0, b0, b1, part, sway);
    tri(shape, b0, top.clone().addScaledVector(axis, r1 * 0.4), b1, part === 0 ? 1 : part, sway);
  }
}

/** A faceted dome: `bands` rings of `sides`, squashed to `height` over a base of `radius`. */
function dome(shape: Shape, radius: number, height: number, sides: number, bands: number, part: number, lumpy = 0, seed = 0): void {
  const point = (band: number, k: number): THREE.Vector3 => {
    const phi = (band / bands) * (Math.PI / 2);
    const theta = (k / sides) * Math.PI * 2;
    const bump = 1 + lumpy * (hash3(seed, band, k % sides) - 0.5);
    const r = Math.cos(phi) * radius * bump;
    return new THREE.Vector3(Math.cos(theta) * r, Math.sin(phi) * height * bump, Math.sin(theta) * r);
  };
  for (let band = 0; band < bands; band++) {
    for (let k = 0; k < sides; k++) {
      const a0 = point(band, k), a1 = point(band, k + 1);
      const b0 = point(band + 1, k), b1 = point(band + 1, k + 1);
      tri(shape, a0, b1, a1, part, still);
      if (band + 1 < bands) tri(shape, a0, b0, b1, part, still);
    }
  }
}

/** A flat blade, double-sided by the material, from the ground to `tip`, `width` at its foot. */
function blade(shape: Shape, root: THREE.Vector3, tip: THREE.Vector3, width: number, across: THREE.Vector3, part: number, sway: (y: number) => number): void {
  const a = root.clone().addScaledVector(across, -width / 2);
  const b = root.clone().addScaledVector(across, width / 2);
  tri(shape, a, b, tip, part, sway);
}

const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

/** Every shape, each in a few builds so a reef is not one coral copied. */
export function buildShapes(): Record<DecorKind, Shape[]> {
  const shapes = {} as Record<DecorKind, Shape[]>;

  shapes.branch = [0, 1, 2].map((seed) => {
    const s = newShape();
    // A trunk and forks, the tips in the lighter colour: staghorn, cartoon-thick.
    const trunk = V(0, 0.7, 0);
    tube(s, V(0, 0, 0), trunk, 0.22, 0.17, 5, 0);
    const forks = 4 + seed;
    for (let k = 0; k < forks; k++) {
      const a = (k / forks) * Math.PI * 2 + seed;
      const lean = 0.5 + 0.25 * hash3(seed, k, 1);
      const tip = V(Math.cos(a) * lean, 1.35 + 0.4 * hash3(seed, k, 2), Math.sin(a) * lean);
      tube(s, trunk, tip, 0.14, 0.09, 4, k % 2);
    }
    return s;
  });

  shapes.brain = [0, 1].map((seed) => {
    const s = newShape();
    dome(s, 0.75, 0.62, 7, 3, 0, 0.25, seed);
    return s;
  });

  shapes.fan = [0, 1].map((seed) => {
    const s = newShape();
    // A sea fan: a stalk and a flat fan across the current, swaying a little.
    const sway = (y: number): number => y * 0.06;
    tube(s, V(0, 0, 0), V(0, 0.35, 0), 0.08, 0.06, 4, 1);
    const spokes = 6;
    const centre = V(0, 0.35, 0);
    for (let k = 0; k < spokes; k++) {
      const a0 = Math.PI * (0.08 + (0.84 * k) / spokes);
      const a1 = Math.PI * (0.08 + (0.84 * (k + 1)) / spokes);
      const r = 1.2 + 0.2 * seed;
      tri(s, centre, V(Math.cos(a0) * r, 0.35 + Math.sin(a0) * r, 0), V(Math.cos(a1) * r, 0.35 + Math.sin(a1) * r, 0), k % 3 === 0 ? 1 : 0, sway);
    }
    return s;
  });

  shapes.tubes = [0, 1].map((seed) => {
    const s = newShape();
    const count = 4 + seed;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + 0.4 * seed;
      const d = k === 0 ? 0 : 0.3 + 0.15 * hash3(seed, k, 3);
      const h = 0.6 + 0.7 * hash3(seed, k, 4);
      tube(s, V(Math.cos(a) * d, 0, Math.sin(a) * d), V(Math.cos(a) * d * 1.3, h, Math.sin(a) * d * 1.3), 0.15, 0.19, 5, 0);
    }
    return s;
  });

  shapes.kelp = [0, 1, 2].map((seed) => {
    const s = newShape();
    // Stalks as ribbons that zig-zag up, a leaf off each joint; the sway is
    // the square of the height, so the holdfast stays put. Built one unit
    // tall and stretched to the water it stands in (`kelpHeight`).
    const sway = (y: number): number => y * y * 1.6;
    const stalks = 3 + (seed % 2);
    for (let k = 0; k < stalks; k++) {
      const a = (k / stalks) * Math.PI * 2 + seed;
      const base = V(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
      const across = V(-Math.sin(a), 0, Math.cos(a));
      let below = base;
      const joints = 5;
      for (let j = 1; j <= joints; j++) {
        const t = j / joints;
        const drift = 0.12 * Math.sin(j * 1.7 + k + seed);
        const at = V(base.x + drift, t * (0.85 + 0.15 * hash3(seed, k, 5)), base.z - drift);
        blade(s, below, at, 0.08, across, 0, sway);
        blade(s, at, below, 0.08, across, 0, sway);
        // A leaf, off to one side.
        const leafTip = at.clone().addScaledVector(across, (j % 2 === 0 ? 1 : -1) * 0.28).add(V(0, 0.05, 0));
        blade(s, at.clone().add(V(0, -0.1, 0)), leafTip, 0.1, V(0, 1, 0), 1, sway);
        below = at;
      }
    }
    return s;
  });

  shapes.grass = [0, 1].map((seed) => {
    const s = newShape();
    const sway = (y: number): number => y * 0.25;
    const blades = 7;
    for (let k = 0; k < blades; k++) {
      const a = (k / blades) * Math.PI * 2 + seed;
      const d = 0.15 + 0.3 * hash3(seed, k, 6);
      const root = V(Math.cos(a) * d, 0, Math.sin(a) * d);
      const tip = V(Math.cos(a) * (d + 0.15), 0.55 + 0.4 * hash3(seed, k, 7), Math.sin(a) * (d + 0.15));
      blade(s, root, tip, 0.12, V(-Math.sin(a), 0, Math.cos(a)), k % 3 === 0 ? 1 : 0, sway);
    }
    return s;
  });

  shapes.rock = [0, 1, 2].map((seed) => {
    const s = newShape();
    dome(s, 1, 0.7, 6, 2, seed % 2, 0.45, seed + 11);
    return s;
  });

  shapes.star = [0].map(() => {
    const s = newShape();
    // A five-armed star lying on the sand, a bump in the middle.
    const centre = V(0, 0.08, 0);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const b0 = (a - 0.45);
      const b1 = (a + 0.45);
      const tip = V(Math.cos(a) * 0.5, 0.02, Math.sin(a) * 0.5);
      const l = V(Math.cos(b0) * 0.14, 0.03, Math.sin(b0) * 0.14);
      const r = V(Math.cos(b1) * 0.14, 0.03, Math.sin(b1) * 0.14);
      tri(s, centre, r, tip, 0, still);
      tri(s, centre, tip, l, 0, still);
    }
    return s;
  });

  shapes.urchin = [0].map(() => {
    const s = newShape();
    dome(s, 0.28, 0.24, 6, 2, 0);
    // Spines: thin spikes out of the dome.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const root = V(Math.cos(a) * 0.15, 0.12, Math.sin(a) * 0.15);
      const tip = V(Math.cos(a) * 0.5, 0.2 + 0.2 * (k % 2), Math.sin(a) * 0.5);
      blade(s, root, tip, 0.06, V(0, 1, 0), 1, still);
    }
    const top = V(0, 0.24, 0);
    blade(s, top, V(0.05, 0.6, 0.02), 0.06, V(1, 0, 0), 1, still);
    return s;
  });

  for (const variants of Object.values(shapes)) {
    for (const shape of variants) {
      for (let k = 1; k < shape.position.length; k += 3) shape.top = Math.max(shape.top, shape.position[k]!);
    }
  }
  return shapes;
}

/** How far under the surface the top of any piece stays, units. */
export const HEADROOM = 0.45;

/** Each kind's two colours, by tone: the first is the body, the second the tips. */
export const COLOURS: Readonly<Record<DecorKind, readonly (readonly [number, number])[]>> = {
  branch: [[PALETTE.pink, PALETTE.cream], [PALETTE.violet, PALETTE.pink], [PALETTE.apricot, PALETTE.gold], [PALETTE.salmon, PALETTE.cream], [PALETTE.crimson, PALETTE.pink]],
  brain: [[PALETTE.gold, PALETTE.apricot], [PALETTE.olive, PALETTE.gold], [PALETTE.salmon, PALETTE.blush], [PALETTE.green, PALETTE.olive], [PALETTE.apricot, PALETTE.gold]],
  fan: [[PALETTE.violet, PALETTE.pink], [PALETTE.crimson, PALETTE.salmon], [PALETTE.pink, PALETTE.cream], [PALETTE.orange, PALETTE.apricot]],
  tubes: [[0x3fb4a8, PALETTE.skyBlue], [PALETTE.violet, PALETTE.cream], [PALETTE.orange, PALETTE.gold], [PALETTE.pink, PALETTE.cream], [0x5cc6c0, PALETTE.green]],
  kelp: [[0x8a7a2e, 0xa89a3c], [0x6f6a2c, 0x9a8c34], [0x7d6a30, 0xb09a40]],
  grass: [[PALETTE.green, PALETTE.olive], [0x6f9a5c, PALETTE.green]],
  rock: [[0x8a8680, PALETTE.slate], [PALETTE.slate, 0x6e6a78], [0x7d7266, PALETTE.bone]],
  star: [[PALETTE.orange, PALETTE.orange], [PALETTE.red, PALETTE.red], [PALETTE.apricot, PALETTE.apricot], [PALETTE.violet, PALETTE.violet]],
  urchin: [[0x3a1f3f, 0x241028], [0x2c2233, 0x1e0603]],
};

/** How big each kind stands, units, before an item's own scale. */
export const SIZE: Readonly<Record<DecorKind, number>> = {
  branch: 1.5, brain: 1.3, fan: 1.3, tubes: 1.3, kelp: 1, grass: 1.3, rock: 1.4, star: 1.1, urchin: 1.1,
};

/** A kelp's height, units: most of the water it stands in, and never longer than a tall tree. */
export const kelpHeight = (depth: number): number => Math.min(14, Math.max(2.5, depth * 0.85));
