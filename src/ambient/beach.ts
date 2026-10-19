/**
 * What lies on a beach near the player: shells, now and then a sandcastle, and
 * on a warm one crabs that scuttle to and fro and off from a body coming near.
 *
 * Each is a spot `cells.ts` worked out once on dry, low, sandy ground at the
 * water's edge; here it is written into the shared body triangles a frame,
 * like the butterflies, so it costs no draw call of its own. A crab's run is a
 * pure function of the clock and its seed, and of where the player is.
 */
import * as THREE from 'three';
import { PALETTE } from '../theme.ts';
import {
  BEACH_STRIDE, CASTLE_SIZE, CRAB_PERIOD, CRAB_RUN, CRAB_SHY, CRAB_SIZE, MAX_CASTLES, MAX_CRABS, MAX_SHELLS, SHELL_SIZE,
} from './constants.ts';
import { fract } from './grid.ts';
import type { AmbientContext, Cell } from './types.ts';

const SHELLS: readonly number[] = [PALETTE.cream, PALETTE.blush, PALETTE.white, PALETTE.apricot, PALETTE.bone];
const SAND_LIGHT = new THREE.Color(PALETTE.sand).lerp(new THREE.Color(PALETTE.cream), 0.25);
const SAND_DARK = new THREE.Color(PALETTE.sand).multiplyScalar(0.82);
const CRAB = new THREE.Color(PALETTE.red).lerp(new THREE.Color(PALETTE.orange), 0.35);
const CRAB_DARK = CRAB.clone().multiplyScalar(0.7);
const FLAG = new THREE.Color(PALETTE.red);

export interface Beach {
  /** Writes what lies on a beach cell; `lively` gates the crabs (weather, the hour). */
  draw(cell: Cell, player: THREE.Vector3, lively: number): void;
}

export function createBeach(ctx: AmbientContext): Beach {
  const { options, stats, state, writer } = ctx;
  const { triangle } = writer;
  const up = new THREE.Vector3();
  const across = new THREE.Vector3();
  const along = new THREE.Vector3();
  const base = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const d = new THREE.Vector3();
  const e = new THREE.Vector3();
  const f = new THREE.Vector3();
  const g = new THREE.Vector3();
  const h = new THREE.Vector3();
  const colour = new THREE.Color();
  const away = new THREE.Vector3();

  /** The frame at a spot, turned by `yaw`: `up`, `across` and `along` on the ground there. */
  function frameAt(x: number, y: number, z: number, yaw: number): void {
    up.set(x, y, z);
    along.set(0, 1, 0).projectOnPlane(up);
    if (along.lengthSq() < 1e-8) along.set(1, 0, 0).projectOnPlane(up);
    along.normalize();
    across.crossVectors(up, along).normalize();
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    a.copy(along).multiplyScalar(cos).addScaledVector(across, sin);
    across.multiplyScalar(cos).addScaledVector(along, -sin);
    along.copy(a);
  }

  /** A point in the frame: `x` across, `y` up, `z` along, from `base`. */
  function at(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(base).addScaledVector(across, x).addScaledVector(up, y).addScaledVector(along, z);
  }

  /** A block standing on `y0`, its four sides and its top. */
  function block(cx: number, cz: number, half: number, y0: number, height: number, side: THREE.Color, top: THREE.Color): void {
    at(cx - half, y0, cz - half, a);
    at(cx + half, y0, cz - half, b);
    at(cx + half, y0, cz + half, c);
    at(cx - half, y0, cz + half, d);
    at(cx - half, y0 + height, cz - half, e);
    at(cx + half, y0 + height, cz - half, f);
    at(cx + half, y0 + height, cz + half, g);
    at(cx - half, y0 + height, cz + half, h);
    triangle(a, b, f, side);
    triangle(a, f, e, side);
    triangle(b, c, g, side);
    triangle(b, g, f, side);
    triangle(c, d, h, side);
    triangle(c, h, g, side);
    triangle(d, a, e, side);
    triangle(d, e, h, side);
    triangle(e, f, g, top);
    triangle(e, g, h, top);
  }

  function shell(seed: number, size: number): void {
    colour.setHex(SHELLS[Math.floor(seed * 97) % SHELLS.length]!);
    // A scallop: a fan of three lying flat, its hinge at the base.
    at(0, 0.03, -size * 0.5, a);
    for (let k = 0; k < 3; k++) {
      const from = -0.9 + (k * 1.8) / 3;
      const to = from + 1.8 / 3;
      at(Math.sin(from) * size, 0.03 + 0.02 * (k === 1 ? 1 : 0), -size * 0.5 + Math.cos(from) * size, b);
      at(Math.sin(to) * size, 0.03 + 0.02 * (k === 1 ? 1 : 0), -size * 0.5 + Math.cos(to) * size, c);
      triangle(a, b, c, colour);
    }
  }

  function castle(size: number): void {
    // A keep on a square base, a turret at each corner and a flag on the keep.
    const wall = size * 0.42;
    block(0, 0, size, -0.05, wall + 0.05, SAND_DARK, SAND_LIGHT);
    const corner = size * 0.78;
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) block(x * corner, z * corner, size * 0.24, wall, size * 0.22, SAND_DARK, SAND_LIGHT);
    block(0, 0, size * 0.4, wall, size * 0.55, SAND_DARK, SAND_LIGHT);
    const top = wall + size * 0.55;
    at(0, top, 0, a);
    at(0, top + size * 0.6, 0, b);
    at(size * 0.32, top + size * 0.48, 0, c);
    triangle(a, b, c, FLAG);
  }

  function crab(seed: number, cell: Cell, player: THREE.Vector3, lively: number): void {
    // To and fro across its own heading, with a rest at each end; and off
    // sideways, quick, from a body that comes near.
    const phase = fract(state.clock / (CRAB_PERIOD * (0.8 + 0.4 * seed)) + seed * 7.3);
    const run = (t: number): number => t * t * (3 - 2 * t);
    let x = phase < 0.35 ? -1 + 2 * run(phase / 0.35) : phase < 0.5 ? 1 : phase < 0.85 ? 1 - 2 * run((phase - 0.5) / 0.35) : -1;
    let moving = (phase < 0.35 || (phase >= 0.5 && phase < 0.85)) ? 1 : 0;
    away.copy(player).sub(base);
    const near = away.length();
    if (near < CRAB_SHY) {
      const side = away.dot(across) > 0 ? -1 : 1;
      x = side * (1 + 1.2 * (1 - near / CRAB_SHY));
      moving = 1;
    }
    base.addScaledVector(across, x * CRAB_RUN);
    // Seated on the drawn ground where it has got to.
    base.setLength(Math.max(options.groundAt(base), base.length() - 0.3));
    const s = CRAB_SIZE * (0.8 + 0.4 * fract(seed * 13.7)) * cell.fade;
    const step = moving * lively * Math.sin(state.clock * 22 + seed * 40);
    // The shell: a low diamond, ridged.
    const lift = s * 0.55;
    at(-s, lift * 0.6, 0, a);
    at(0, lift, s * 0.7, b);
    at(s, lift * 0.6, 0, c);
    at(0, lift, -s * 0.7, d);
    at(0, lift * 1.3, 0, e);
    triangle(a, b, e, CRAB);
    triangle(b, c, e, CRAB);
    triangle(c, d, e, CRAB_DARK);
    triangle(d, a, e, CRAB_DARK);
    // The underside, so it is not a lid seen from low down.
    at(0, lift * 0.25, 0, f);
    triangle(a, f, b, CRAB_DARK);
    triangle(b, f, c, CRAB_DARK);
    triangle(c, f, d, CRAB_DARK);
    triangle(d, f, a, CRAB_DARK);
    // Three legs a side, stepping.
    for (const sideOf of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const z = (k - 1) * s * 0.45;
        const swing = step * (k % 2 === 0 ? 1 : -1) * sideOf * s * 0.25;
        at(sideOf * s * 0.7, lift * 0.6, z - s * 0.08, a);
        at(sideOf * s * 0.7, lift * 0.6, z + s * 0.08, b);
        at(sideOf * s * 1.5, 0.02, z + swing, c);
        triangle(a, b, c, CRAB_DARK);
      }
    }
    // The claws, up in front.
    for (const sideOf of [-1, 1]) {
      at(sideOf * s * 0.35, lift * 0.8, s * 0.6, a);
      at(sideOf * s * 0.75, lift * 0.8, s * 0.7, b);
      at(sideOf * s * 0.5, lift * 1.4, s * 1.15, c);
      triangle(a, b, c, CRAB);
    }
  }

  function draw(cell: Cell, player: THREE.Vector3, lively: number): void {
    const spots = cell.beach;
    if (spots === null || cell.fade <= 0.01) return;
    for (let o = 0; o + BEACH_STRIDE <= spots.length; o += BEACH_STRIDE) {
      const kind = spots[o]!;
      const radius = spots[o + 4]!;
      const seed = spots[o + 5]!;
      frameAt(spots[o + 1]!, spots[o + 2]!, spots[o + 3]!, seed * Math.PI * 2);
      base.copy(up).multiplyScalar(radius);
      if (kind === 0 && stats.shells < MAX_SHELLS) {
        shell(seed, SHELL_SIZE * (0.7 + 0.6 * fract(seed * 31.1)) * cell.fade);
        stats.shells++;
      } else if (kind === 1 && stats.castles < MAX_CASTLES) {
        castle(CASTLE_SIZE * (0.8 + 0.4 * fract(seed * 17.3)) * cell.fade);
        stats.castles++;
      } else if (kind === 2 && stats.crabs < MAX_CRABS && lively > 0.05) {
        crab(seed, cell, player, lively);
        stats.crabs++;
      }
    }
  }

  return { draw };
}
