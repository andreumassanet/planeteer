/**
 * The Explorers' Guild's hall, drawn into a `Sink` (the street dressing's
 * writer): a stone ground storey with a deep porch on four columns, a
 * half-timbered upper storey under a crimson hip roof, a gold-and-crimson
 * banner with the guild's compass on its front, lanterns by its door and a
 * cupola carrying an armillary globe and a weather vane. Nothing else in the
 * kit is built like it, so it reads as the guild from across the city.
 *
 * Its frame: the middle of its front wall's foot at the origin, `+z` out of
 * its door, the body behind (`-depth` to 0), the porch before (0 to `porch`),
 * standing on `y = 0`. Every trim stands `PROUD` off the face it is laid on.
 * Two runs, so the town's Ultra surfaces can draw stone below and plaster
 * above: `stone` the ground storey and porch, `upper` the rest.
 */
import * as THREE from 'three';
import { tone } from '../monuments/contract.ts';
import { GLASS_TONE, PROUD } from '../scenery/contract/tones.ts';
import { Sink } from '../scenery/street-dressing/sink.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import { COLUMN_RADIUS, PORCH_HEIGHT } from './square.ts';

const P = PALETTE;
const M = AVATAR_HEIGHT / 1.75;

/** The two storeys and how far the roof reaches past the walls. */
export const GROUND_STOREY = 3.1 * M;
const UPPER_STOREY = 2.5 * M;
const EAVES = 0.7;
/** How the roof rises over its half-depth. */
const ROOF_PITCH = 0.78;
/** The door's opening: a grand one, over the cast by more than any house's. */
const DOOR_HIGH = 2.25 * M;
const DOOR_WIDE = 1.15 * M;
/** How bright the hall's windows burn after dark, and its lanterns. */
const WINDOW_GLOW = 0.62;
const LANTERN_GLOW = 1;

/** The colours the hall is painted in: one look, the guild's own, wherever it stands. */
export const HALL_COLOURS = {
  stone: tone(P.sand, 0.9),
  stoneDark: tone(P.sand, 0.7),
  stoneLight: tone(P.sand, 1.06),
  plaster: P.cream,
  eave: tone(P.cream, 0.74),
  timber: tone(P.brown, 0.62),
  column: P.white,
  roof: tone(P.crimson, 0.82),
  ridge: tone(P.crimson, 0.6),
  door: tone(P.brown, 0.82),
  gold: P.gold,
  goldDark: tone(P.gold, 0.78),
  banner: P.crimson,
  glass: tone(P.slate, GLASS_TONE),
  lantern: P.apricot,
  globe: P.skyBlue,
} as const;
const C = HALL_COLOURS;

export interface HallSize {
  width: number;
  depth: number;
  porch: number;
}

/** The hall's two runs and how tall it stands. */
export interface HallRuns {
  stone: Sink;
  upper: Sink;
  height: number;
}

/** Draws the hall in its own frame, placed in the run's frame by `matrix`. */
export function drawHall(size: HallSize, matrix: THREE.Matrix4): HallRuns {
  const stone = new Sink();
  const upper = new Sink();
  stone.place(matrix);
  upper.place(matrix);
  groundStorey(stone, matrix, size);
  porch(stone, size);
  upperStorey(upper, matrix, size);
  const ridge = roof(upper, size);
  const height = cupola(upper, matrix, size, ridge);
  return { stone, upper, height };
}

/** A window: a frame plate on the wall at `z = 0` facing +z, its glass `PROUD` in front, and a cross of glazing bars. */
function window(sink: Sink, x: number, y0: number, w: number, h: number, frame: number): void {
  const t = 0.16;
  sink.paint(frame);
  sink.box(x - w / 2 - t, x + w / 2 + t, y0 - t, y0 + h + t, 0, 0.1, 'b');
  sink.paint(C.glass, WINDOW_GLOW);
  sink.quad([x - w / 2, y0, 0.1 + PROUD, x + w / 2, y0, 0.1 + PROUD, x + w / 2, y0 + h, 0.1 + PROUD, x - w / 2, y0 + h, 0.1 + PROUD], 0, 0, 1);
  sink.paint(frame);
  sink.box(x - 0.05, x + 0.05, y0, y0 + h, 0.1, 0.1 + 2 * PROUD, 'b');
  sink.box(x - w / 2, x + w / 2, y0 + h * 0.62 - 0.05, y0 + h * 0.62 + 0.05, 0.1, 0.1 + 2 * PROUD, 'b');
}

/**
 * Runs `draw` on each of the four walls of a `width` by `depth` body whose
 * front is at z = 0, with the wall's own frame (its face at z = 0, +z out)
 * and how long it is.
 */
function eachWall(sink: Sink, base: THREE.Matrix4, width: number, depth: number, draw: (wall: number, length: number) => void): void {
  const turn = new THREE.Matrix4();
  const walls: [number, number, number, number][] = [
    // x, z of the wall's middle, its yaw, its length
    [0, 0, 0, width],
    [width / 2, -depth / 2, Math.PI / 2, depth],
    [0, -depth, Math.PI, width],
    [-width / 2, -depth / 2, -Math.PI / 2, depth],
  ];
  walls.forEach(([x, z, yaw, length], wall) => {
    turn.makeRotationY(yaw).setPosition(x, 0, z);
    sink.place(new THREE.Matrix4().multiplyMatrices(base, turn));
    draw(wall, length);
  });
  sink.place(base);
}

/** The stone storey: a plinth, the walls, a string course, tall windows, the door and its lanterns. */
function groundStorey(sink: Sink, base: THREE.Matrix4, { width, depth }: HallSize): void {
  const course = 0.35 * M;
  sink.paint(C.stoneDark);
  sink.box(-width / 2 - 0.12, width / 2 + 0.12, 0, course, -depth - 0.12, 0.12, 'd');
  sink.paint(C.stone);
  sink.box(-width / 2, width / 2, course - 0.01, GROUND_STOREY, -depth, 0, 'du');
  sink.paint(C.stoneLight);
  sink.box(-width / 2 - 0.1, width / 2 + 0.1, GROUND_STOREY - 0.2, GROUND_STOREY + 0.25, -depth - 0.1, 0.1, '');
  // Quoins: lighter stones up each corner, proud of both faces.
  for (const [x, z] of [[-width / 2, 0], [width / 2, 0], [-width / 2, -depth], [width / 2, -depth]] as const) {
    for (let k = 0; k < 4; k++) {
      const y0 = course + 0.2 + k * 1.35;
      const long = k % 2 === 0;
      const sx = Math.sign(x) || 1;
      const sz = z === 0 ? 1 : -1;
      sink.box(
        Math.min(x - sx * (long ? 0.9 : 0.5), x + sx * PROUD), Math.max(x - sx * (long ? 0.9 : 0.5), x + sx * PROUD),
        y0, y0 + 0.95,
        Math.min(z - sz * (long ? 0.5 : 0.9), z + sz * PROUD), Math.max(z - sz * (long ? 0.5 : 0.9), z + sz * PROUD), 'd',
      );
    }
  }
  eachWall(sink, base, width, depth, (wall, length) => {
    const sill = 0.75 * M;
    const high = 1.15 * M;
    if (wall === 0) {
      door(sink);
      lanterns(sink);
      // Tall windows either side of the door, two a side where the front is wide enough.
      for (const sign of [-1, 1]) {
        for (const at of length >= 16 ? [0.26, 0.4] : [0.37]) window(sink, sign * length * at, sill, 0.6 * M, high, C.column);
      }
      return;
    }
    const count = wall === 2 ? 3 : 2;
    for (let k = 0; k < count; k++) window(sink, (k - (count - 1) / 2) * (length / (count + 0.4)), sill, 0.55 * M, high, C.column);
  });
}

/** The front door: an architrave of light stone standing out on three sides, a pair of leaves far behind it, brass handles. */
function door(sink: Sink): void {
  const jamb = 0.28;
  const out = 0.32;
  sink.paint(C.stoneLight);
  sink.box(-DOOR_WIDE / 2 - jamb, -DOOR_WIDE / 2, 0, DOOR_HIGH, 0, out, 'bd');
  sink.box(DOOR_WIDE / 2, DOOR_WIDE / 2 + jamb, 0, DOOR_HIGH, 0, out, 'bd');
  sink.box(-DOOR_WIDE / 2 - jamb - 0.12, DOOR_WIDE / 2 + jamb + 0.12, DOOR_HIGH, DOOR_HIGH + 0.42, 0, out + 0.06, 'b');
  // The keystone, gold, over the middle of the head.
  sink.paint(C.gold);
  sink.box(-0.22, 0.22, DOOR_HIGH + 0.05, DOOR_HIGH + 0.55, out + 0.06, out + 0.06 + PROUD, 'b');
  sink.paint(C.door);
  sink.quad([-DOOR_WIDE / 2, 0, PROUD, DOOR_WIDE / 2, 0, PROUD, DOOR_WIDE / 2, DOOR_HIGH, PROUD, -DOOR_WIDE / 2, DOOR_HIGH, PROUD], 0, 0, 1);
  sink.paint(tone(P.brown, 0.62));
  sink.box(-0.04, 0.04, 0, DOOR_HIGH, PROUD, 2 * PROUD, 'bd');
  for (const sign of [-1, 1]) {
    // Two panels a leaf, proud of it.
    sink.box(sign * 0.12, sign * (DOOR_WIDE / 2 - 0.14), 0.35, DOOR_HIGH * 0.45, PROUD, 2 * PROUD, 'bd');
    sink.box(sign * 0.12, sign * (DOOR_WIDE / 2 - 0.14), DOOR_HIGH * 0.52, DOOR_HIGH - 0.3, PROUD, 2 * PROUD, 'bd');
  }
  sink.paint(C.gold);
  for (const sign of [-1, 1]) sink.box(sign * 0.12 - 0.05, sign * 0.12 + 0.05, DOOR_HIGH * 0.46, DOOR_HIGH * 0.5, 2 * PROUD, 3 * PROUD, 'b');
}

/** A lantern either side of the door on an iron bracket, lit all night. */
function lanterns(sink: Sink): void {
  const y = DOOR_HIGH * 0.72;
  for (const sign of [-1, 1]) {
    const x = sign * (DOOR_WIDE / 2 + 0.95);
    sink.paint(tone(P.bark, 0.8));
    sink.bar(x, y + 0.75, 0.02, x, y + 0.75, 0.55, 0.08);
    sink.paint(C.goldDark);
    sink.box(x - 0.24, x + 0.24, y + 0.1, y + 0.18, 0.4, 0.88, '');
    sink.box(x - 0.18, x + 0.18, y + 0.82, y + 0.92, 0.46, 0.82, '');
    sink.paint(C.lantern, LANTERN_GLOW);
    sink.box(x - 0.18, x + 0.18, y + 0.18, y + 0.82, 0.46, 0.82, 'ud');
  }
}

/** The porch: four white columns at its front under a stone roof with a gold frieze, and a lighter floor of slabs. */
function porch(sink: Sink, { width, porch: deep }: HallSize): void {
  const span = width - 1.2;
  const at = deep - COLUMN_RADIUS - 0.25;
  const r = COLUMN_RADIUS;
  for (let k = 0; k < 4; k++) {
    const x = -span / 2 + (k * span) / 3;
    sink.paint(C.stoneLight);
    sink.box(x - r * 1.35, x + r * 1.35, 0, 0.32, at - r * 1.35, at + r * 1.35, 'd');
    sink.paint(C.column);
    sink.lathe(x, at, [[r * 1.1, 0.32], [r, 0.5], [r * 0.9, PORCH_HEIGHT - 0.55], [r * 1.25, PORCH_HEIGHT - 0.3]], 8);
    sink.paint(C.stoneLight);
    sink.box(x - r * 1.45, x + r * 1.45, PORCH_HEIGHT - 0.3, PORCH_HEIGHT, at - r * 1.45, at + r * 1.45, 'd');
  }
  const front = deep + 0.15;
  sink.paint(C.stone);
  sink.box(-width / 2, width / 2, PORCH_HEIGHT, PORCH_HEIGHT + 0.5, 0, front, 'b');
  sink.paint(C.gold);
  sink.box(-width / 2 + 0.2, width / 2 - 0.2, PORCH_HEIGHT + 0.12, PORCH_HEIGHT + 0.38, front, front + PROUD, 'b');
  // A low parapet along the porch's roof, its top a lighter coping.
  sink.paint(C.stoneLight);
  sink.box(-width / 2, width / 2, PORCH_HEIGHT + 0.5, PORCH_HEIGHT + 0.85, front - 0.3, front, 'd');
}

/** The upper storey: plaster between dark timbers, its windows, the eave band and the banner. */
function upperStorey(sink: Sink, base: THREE.Matrix4, { width, depth }: HallSize): void {
  const y0 = GROUND_STOREY + 0.25;
  const top = GROUND_STOREY + UPPER_STOREY;
  sink.paint(C.plaster);
  sink.box(-width / 2, width / 2, y0 - 0.01, top, -depth, 0, 'du');
  sink.paint(C.eave);
  sink.box(-width / 2 - PROUD, width / 2 + PROUD, top - 0.45, top, -depth - PROUD, PROUD, 'du');
  eachWall(sink, base, width, depth, (wall, length) => {
    const bays = Math.max(2, Math.round(length / 3.2));
    const pitch = length / bays;
    sink.paint(C.timber);
    // A sill beam along the foot and a post at every bay, the corners' included.
    sink.box(-length / 2 - 0.18, length / 2 + 0.18, y0, y0 + 0.28, 0, 0.18, 'b');
    for (let k = 0; k <= bays; k++) {
      const x = -length / 2 + k * pitch;
      const inset = k === 0 ? 0.11 : k === bays ? -0.11 : 0;
      sink.box(x + inset - 0.11, x + inset + 0.11, y0 + 0.28, top - 0.45, 0, 0.18, 'b');
    }
    for (let k = 0; k < bays; k++) {
      const x = -length / 2 + (k + 0.5) * pitch;
      // The front's middle bay carries the banner.
      if (wall === 0 && Math.abs(x) < pitch * 0.6) continue;
      const corner = k === 0 || k === bays - 1;
      if (corner && wall !== 0) {
        // A brace across the end bays instead of a window.
        sink.paint(C.timber);
        const xa = x - pitch / 2 + 0.2;
        const xb = x + pitch / 2 - 0.2;
        sink.bar(k === 0 ? xa : xb, y0 + 0.4, 0.09, k === 0 ? xb : xa, top - 0.6, 0.09, 0.16);
        continue;
      }
      window(sink, x, y0 + 0.7, Math.min(pitch * 0.5, 0.65 * M), 1.0 * M, C.column);
    }
    if (wall === 0) banner(sink, top);
  });
}

/** The guild's banner over the porch: a gold-edged crimson cloth with a swallowtail and the compass in gold. */
function banner(sink: Sink, top: number): void {
  const w = 1.1 * M;
  const yTop = top - 0.55;
  const yLow = GROUND_STOREY + 0.75;
  const z = 0.3;
  sink.paint(tone(P.bark, 0.8));
  sink.bar(-w - 0.25, yTop + 0.12, z + 0.06, w + 0.25, yTop + 0.12, z + 0.06, 0.12);
  sink.paint(C.gold);
  sink.quad([-w, yLow, z, w, yLow, z, w, yTop, z, -w, yTop, z], 0, 0, 1);
  sink.tri(-w, yLow, z, 0, yLow + 0.6, z, -w, yLow - 0.9, z, 0, 0, 1);
  sink.tri(w, yLow, z, w, yLow - 0.9, z, 0, yLow + 0.6, z, 0, 0, 1);
  const zc = z + PROUD;
  const b = 0.2;
  sink.paint(C.banner);
  sink.quad([-w + b, yLow, zc, w - b, yLow, zc, w - b, yTop - b, zc, -w + b, yTop - b, zc], 0, 0, 1);
  sink.tri(-w + b, yLow, zc, 0, yLow + 0.6 + b * 0.5, zc, -w + b, yLow - 0.62, zc, 0, 0, 1);
  sink.tri(w - b, yLow, zc, w - b, yLow - 0.62, zc, 0, yLow + 0.6 + b * 0.5, zc, 0, 0, 1);
  compass(sink, 0, (yLow + yTop) / 2 + 0.3, zc + PROUD, Math.min(w - b, (yTop - yLow) / 2) * 0.82);
}

/**
 * The guild's emblem: an eight-pointed compass star facing +z at `(x, y, z)`,
 * the four long points gold in two tones, the four short ones cream, round a
 * crimson boss. No two of its faces overlap.
 */
export function compass(sink: Sink, x: number, y: number, z: number, r: number, facing: 1 | -1 = 1): void {
  const boss = r * 0.2;
  const point = (angle: number, length: number, spread: number, light: number, dark: number): void => {
    const tipX = x + Math.cos(angle) * length;
    const tipY = y + Math.sin(angle) * length;
    const mx = x + Math.cos(angle) * boss;
    const my = y + Math.sin(angle) * boss;
    const ax = x + Math.cos(angle + spread) * boss;
    const ay = y + Math.sin(angle + spread) * boss;
    const bx = x + Math.cos(angle - spread) * boss;
    const by = y + Math.sin(angle - spread) * boss;
    sink.paint(light);
    sink.tri(mx, my, z, tipX, tipY, z, ax, ay, z, 0, 0, facing);
    sink.paint(dark);
    sink.tri(mx, my, z, bx, by, z, tipX, tipY, z, 0, 0, facing);
  };
  for (let k = 0; k < 4; k++) point((k * Math.PI) / 2 + Math.PI / 2, r, 0.36, C.gold, C.goldDark);
  for (let k = 0; k < 4; k++) point((k * Math.PI) / 2 + Math.PI / 4 + Math.PI / 2, r * 0.58, 0.36, P.cream, tone(P.cream, 0.8));
  sink.paint(tone(P.crimson, 0.7));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const c = ((k + 1) / 8) * Math.PI * 2;
    sink.tri(x, y, z, x + Math.cos(a) * boss, y + Math.sin(a) * boss, z, x + Math.cos(c) * boss, y + Math.sin(c) * boss, z, 0, 0, facing);
  }
}

/** The hip roof over the body, its ridge cap and the soffit under its eaves; returns the ridge's height. */
function roof(sink: Sink, { width, depth }: HallSize): number {
  const top = GROUND_STOREY + UPPER_STOREY;
  const x0 = -width / 2 - EAVES;
  const x1 = width / 2 + EAVES;
  const z0 = -depth - EAVES;
  const z1 = EAVES;
  const halfDepth = (z1 - z0) / 2;
  const rise = halfDepth * ROOF_PITCH;
  const ridgeY = top + rise;
  const zm = (z0 + z1) / 2;
  const rx0 = x0 + halfDepth;
  const rx1 = x1 - halfDepth;
  sink.paint(C.roof);
  sink.quad([x0, top, z1, x1, top, z1, rx1, ridgeY, zm, rx0, ridgeY, zm], 0, 1, 1);
  sink.quad([x1, top, z0, x0, top, z0, rx0, ridgeY, zm, rx1, ridgeY, zm], 0, 1, -1);
  sink.tri(x1, top, z1, x1, top, z0, rx1, ridgeY, zm, 1, 1, 0);
  sink.tri(x0, top, z0, x0, top, z1, rx0, ridgeY, zm, -1, 1, 0);
  sink.paint(C.ridge);
  sink.bar(rx0 - 0.1, ridgeY + 0.04, zm, rx1 + 0.1, ridgeY + 0.04, zm, 0.3);
  sink.paint(C.eave);
  sink.quad([x0, top, z0, x1, top, z0, x1, top, z1, x0, top, z1], 0, -1, 0);
  return ridgeY;
}

/** A white cupola astride the ridge with a crimson cap, an armillary globe over it and a gold vane; returns the top. */
function cupola(sink: Sink, base: THREE.Matrix4, { depth }: HallSize, ridgeY: number): number {
  const zc = -depth / 2;
  const half = 1.05;
  const y0 = ridgeY - 1.3;
  const y1 = ridgeY + 1.5;
  sink.paint(C.column);
  sink.box(-half, half, y0, y1, zc - half, zc + half, 'd');
  // An opening on each face: a dark arch of the glass's tone, lit like a window.
  sink.paint(tone(P.bark, 0.9));
  for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
    const fx = nx * (half + PROUD);
    const fz = zc + nz * (half + PROUD);
    const ux = nz === 0 ? 0 : 1;
    const uz = nz === 0 ? 1 : 0;
    const w = 0.42;
    sink.quad([
      fx - ux * w, ridgeY + 0.1, fz - uz * w,
      fx + ux * w, ridgeY + 0.1, fz + uz * w,
      fx + ux * w, y1 - 0.45, fz + uz * w,
      fx - ux * w, y1 - 0.45, fz - uz * w,
    ], nx, 0, nz);
  }
  sink.paint(C.gold);
  sink.box(-half - 0.1, half + 0.1, y1, y1 + 0.2, zc - half - 0.1, zc + half + 0.1, '');
  const capTop = y1 + 0.2 + 1.3;
  sink.paint(C.roof);
  const c = half + 0.18;
  for (const [ax, az, bx, bz] of [[-c, c, c, c], [c, c, c, -c], [c, -c, -c, -c], [-c, -c, -c, c]] as const) {
    sink.tri(ax, y1 + 0.2, zc + az, bx, y1 + 0.2, zc + bz, 0, capTop, zc, (ax + bx) / 2, 0.8, (az + bz) / 2);
  }
  // The globe on a gold stem, ringed by its meridian and its equator.
  sink.paint(C.gold);
  sink.box(-0.07, 0.07, capTop - 0.1, capTop + 0.35, zc - 0.07, zc + 0.07, 'd');
  const gy = capTop + 0.35;
  const gr = 0.62;
  sink.paint(C.globe);
  sink.lump(0, gy, zc, gr, gr * 2, 8);
  sink.paint(tone(P.green, 0.9));
  sink.lump(0.18, gy + gr * 0.95, zc + 0.2, gr * 0.5, gr * 0.62, 5);
  sink.paint(C.gold);
  const turn = new THREE.Matrix4();
  sink.place(new THREE.Matrix4().multiplyMatrices(base, turn.makeTranslation(0, gy + gr, zc)));
  sink.wheel(0, 0, 0, gr + 0.16, gr + 0.06, 12);
  sink.place(new THREE.Matrix4().multiplyMatrices(base, turn.makeTranslation(0, gy + gr, zc).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))));
  sink.wheel(0, 0, 0, gr + 0.16, gr + 0.06, 12);
  sink.place(base);
  // The vane: a gold rod, and an arrow on it.
  const vane = gy + gr * 2 + 0.1;
  sink.bar(0, gy + gr * 2 - 0.05, zc, 0, vane + 1.1, zc, 0.07);
  sink.sheet([-0.9, vane + 0.8, zc - 0.02, 0.5, vane + 0.8, zc - 0.02, 0.5, vane + 0.95, zc - 0.02, -0.9, vane + 0.95, zc - 0.02], 0, 0, 1);
  sink.tri(0.5, vane + 0.6, zc - 0.02, 1.0, vane + 0.875, zc - 0.02, 0.5, vane + 1.15, zc - 0.02, 0, 0, 1);
  sink.tri(0.5, vane + 0.6, zc - 0.02, 0.5, vane + 1.15, zc - 0.02, 1.0, vane + 0.875, zc - 0.02, 0, 0, -1);
  return vane + 1.15;
}
