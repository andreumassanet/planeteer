/** The bridge room's still pieces, placed from the plan in a fixed order. */
import * as THREE from 'three';
import { toned } from '../models.ts';
import type { SpacePiece } from '../space-kit.ts';
import { PALETTE } from '../theme.ts';
import type { Placer } from './placer.ts';
import {
  BAY, CEIL, CHAIR_PAINT, CRATE_PAINT, FLOOR_PAINT, H, HEAD, HOLO, INDICATOR, KIT, LIGHT_COLOURS, MULLION, PIPE_PAINT, PLAN,
  ROOM, SCREEN, SCREEN_COLOURS, SILL, WALL_HALF, WINDOWED,
} from './plan.ts';

/** One bay of the window: its middle on the glass, and the way into the room. */
export interface BridgeBay {
  centre: THREE.Vector3;
  inward: THREE.Vector3;
}

/** Floor and ceiling tiles inside the plan, and a plate under each to close the wedges at the walls. */
export function floorAndCeiling(b: Placer): void {
  const tileTop = 0.3 * ROOM;
  const inside = (x: number, z: number): boolean => {
    // Inside is to the left of every edge of the convex plan.
    for (let i = 0; i < PLAN.length; i++) {
      const [ax, az] = PLAN[i]!;
      const [bx, bz] = PLAN[(i + 1) % PLAN.length]!;
      if ((bx - ax) * (z / H - az) - (bz - az) * (x / H - ax) < 0) return false;
    }
    return true;
  };
  for (let i = -6; i <= 4; i++) {
    for (let j = -2; j <= 10; j++) {
      const x = i * ROOM;
      const z = j * ROOM;
      const half = ROOM / 2;
      if (![[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([dx, dz]) => inside(x + dx! * half, z + dz! * half))) continue;
      // Panels down the middle, plain plate round them, and the odd hatch.
      const middle = Math.abs(i) <= 1 && j <= 1;
      const id = middle ? 'floor-panel' : b.roll() < 0.12 ? 'floor-detail' : 'floor';
      b.place(id, { at: new THREE.Vector3(x, -tileTop, z), unit: ROOM, paint: FLOOR_PAINT, yaw: middle ? 0 : Math.floor(b.roll() * 4) * (Math.PI / 2) });
      b.place('floor', { at: new THREE.Vector3(x, CEIL * H + tileTop, z), unit: ROOM, paint: FLOOR_PAINT, flip: true });
    }
  }
  b.plate(-0.02, true, toned(PALETTE.slate, 0.7));
  b.plate(CEIL * H + 0.02, false, toned(PALETTE.slate, 0.7));
}

/** A plan edge laid out for placing: a point at `s` along it, its yaw facing into the room, and its length. */
interface Edge {
  point: (s: number, y: number) => THREE.Vector3;
  yaw: number;
  inward: THREE.Vector3;
  length: number;
}

const CENTROID = new THREE.Vector2(-1.4 * H, 4 * H);

function edgeOf(e: number): Edge {
  const [ax, az] = PLAN[e]!;
  const [bx, bz] = PLAN[e + 1]!;
  const from = new THREE.Vector2(ax * H, az * H);
  const to = new THREE.Vector2(bx * H, bz * H);
  const along = to.clone().sub(from);
  const length = along.length();
  along.normalize();
  // Local +z is (sin yaw, cos yaw); the kit's walls face both ways, its consoles +z.
  let yaw = Math.atan2(-along.y, along.x);
  const middle = from.clone().add(to).multiplyScalar(0.5);
  if (Math.sin(yaw) * (CENTROID.x - middle.x) + Math.cos(yaw) * (CENTROID.y - middle.y) < 0) yaw += Math.PI;
  const inward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const point = (s: number, y: number): THREE.Vector3 => new THREE.Vector3(from.x + along.x * s, y, from.y + along.y * s);
  return { point, yaw, inward, length };
}

function mullionAt(b: Placer, x: number, z: number, yaw: number): void {
  b.place('wall', { at: new THREE.Vector3(x, SILL * H, z), yaw, unit: ROOM, scale: [(MULLION * H) / ROOM, ((HEAD - SILL) * H) / ROOM, 1.3] });
  // A light on its inside face, over the dashboard.
  b.place('wall-switch', {
    at: new THREE.Vector3(x + Math.sin(yaw) * WALL_HALF * 1.32, (SILL + 0.3) * H, z + Math.cos(yaw) * WALL_HALF * 1.32),
    yaw,
    unit: KIT,
    scale: [0.9, 0.9, 1],
    glow: { slots: ['colormap#9ea5c6'], colour: LIGHT_COLOURS[Math.floor(b.roll() * LIGHT_COLOURS.length)]!, kind: INDICATOR },
  });
}

/** A window edge: wall under the sill and over the header, mullions, and a dashboard of consoles. */
function windowEdge(b: Placer, pieces: ReadonlyMap<string, SpacePiece>, e: number, bays: BridgeBay[]): void {
  const { point, yaw, inward, length } = edgeOf(e);
  const count = Math.max(1, Math.round(length / (BAY * H)));
  const bay = length / count;
  for (let k = 0; k < count; k++) {
    const s = (k + 0.5) * bay;
    b.place('wall', { at: point(s, 0), yaw, unit: ROOM, scale: [bay / ROOM, (SILL * H) / ROOM, 1] });
    b.place('wall', { at: point(s, HEAD * H), yaw, unit: ROOM, scale: [bay / ROOM, ((CEIL - HEAD) * H) / ROOM, 1] });
    mullionAt(b, point(k * bay, 0).x, point(k * bay, 0).z, yaw);
    bays.push({ centre: point(s, ((SILL + HEAD) / 2) * H), inward });
  }
  if (WINDOWED[e + 1] !== true) mullionAt(b, point(length, 0).x, point(length, 0).z, yaw);

  // Low consoles under the glass, a tall one at each end of the long wall.
  const reach = length - 0.8 * H;
  const consoles = Math.max(1, Math.floor(reach / (0.84 * KIT)));
  for (let k = 0; k < consoles; k++) {
    const s = 0.4 * H + (k + 0.5) * (reach / consoles);
    const end = e === 2 && (k === 0 || k === consoles - 1);
    const id = end ? 'computer-screen' : k % 4 === 2 ? 'computer-system' : 'computer-wide';
    const depth = (pieces.get(id)?.model.box.max.z ?? 0.3) - (pieces.get(id)?.model.box.min.z ?? -0.3);
    const at = point(s, 0).addScaledVector(inward, WALL_HALF + (depth * KIT) / 2 + 0.08);
    b.place(id, {
      at,
      yaw,
      unit: KIT,
      glow: { slots: ['colormap#ffb449'], colour: SCREEN_COLOURS[Math.floor(b.roll() * SCREEN_COLOURS.length)]!, kind: SCREEN },
    });
  }
}

/** A solid side wall: a door on the left wall, a banner on the right, and screens beside the window. */
function sideWall(b: Placer, e: number): void {
  const { point, yaw, inward, length } = edgeOf(e);
  const count = Math.max(1, Math.round(length / ROOM));
  const bay = length / count;
  const upper = (CEIL * H - ROOM) / ROOM;
  for (let k = 0; k < count; k++) {
    const s = (k + 0.5) * bay;
    const at = point(s, 0);
    const door = e === 0 && k === count - 3;
    b.place(door ? 'wall-door' : e === 4 && k === 2 ? 'wall-banner' : 'wall', { at, yaw, unit: ROOM, scale: [bay / ROOM, 1, 1] });
    if (door) b.place('door-double', { at, yaw, unit: ROOM, scale: [bay / ROOM, 1, 1.4] });
    b.place('wall', { at: point(s, ROOM), yaw, unit: ROOM, scale: [bay / ROOM, upper, 1] });
    if (k === count - 1 && e === 0) {
      b.place('display-wall-wide', {
        at: at.clone().addScaledVector(inward, WALL_HALF).setY(0.75 * H),
        yaw,
        unit: KIT,
        glow: { slots: ['colormap#ffb449'], colour: PALETTE.skyBlue, kind: SCREEN },
      });
    }
  }
}

/** Every wall round the plan, in order. Returns the window's bays. */
export function walls(b: Placer, pieces: ReadonlyMap<string, SpacePiece>): BridgeBay[] {
  const bays: BridgeBay[] = [];
  for (let e = 0; e < PLAN.length - 1; e++) {
    if (WINDOWED[e] === true) windowEdge(b, pieces, e, bays);
    else sideWall(b, e);
  }
  return bays;
}

/** A pipe run along the long wall's header, with coloured collars. */
export function pipes(b: Placer, pieces: ReadonlyMap<string, SpacePiece>): void {
  const [ax] = PLAN[2]!;
  const [bx] = PLAN[3]!;
  const z = PLAN[2]![1] * H + WALL_HALF + 0.35;
  const y = (HEAD + 0.13) * H;
  const length = (bx - ax) * H;
  const pipe = pieces.get('pipe')!.model.box;
  b.place('pipe', { at: new THREE.Vector3(((ax + bx) / 2) * H, y, z), roll: Math.PI / 2, middle: true, unit: KIT, scale: [1, length / ((pipe.max.y - pipe.min.y) * KIT), 1], paint: PIPE_PAINT });
  for (let x = ax + 0.9; x < bx - 0.5; x += 1.8) {
    b.place('pipe-ring-colored', { at: new THREE.Vector3(x * H, y, z), roll: Math.PI / 2, middle: true, unit: KIT, scale: [1, 0.35, 1], paint: PIPE_PAINT });
  }
}

/** Chairs, the holo table, crates and a computer. Returns the table's position and its pad's height. */
export function furniture(b: Placer, pieces: ReadonlyMap<string, SpacePiece>): { table: THREE.Vector3; padTop: number } {
  // The captain's chair, turned out to the room.
  b.place('chair-armrest-headrest', { at: new THREE.Vector3(-0.95 * H, 0, -0.7 * H), yaw: 0.55, unit: KIT * 1.12, paint: CHAIR_PAINT });
  // The crew's seats at the dashboard, backs to the room.
  b.place('chair-headrest', { at: new THREE.Vector3(-2.3 * H, 0, -1.45 * H), yaw: Math.PI + 0.15, unit: KIT, paint: CHAIR_PAINT });
  b.place('chair-headrest', { at: new THREE.Vector3(1.55 * H, 0, -1.5 * H), yaw: Math.PI - 0.2, unit: KIT, paint: CHAIR_PAINT });
  // The holo table at the hero's right, its pad lit.
  const table = new THREE.Vector3(0.98 * H, 0, -0.95 * H);
  const tableScale = 0.8;
  b.place('table-display', {
    at: table,
    yaw: -0.25,
    unit: KIT * tableScale,
    glow: { slots: ['colormap#98bbeb'], colour: PALETTE.skyBlue, kind: HOLO },
  });
  const tableBox = pieces.get('table-display')!.model.box;
  const padTop = (tableBox.max.y - tableBox.min.y) * KIT * tableScale;
  // Crates in the corners, one on another.
  b.place('container-tall', { at: new THREE.Vector3(2.6 * H, 0, -0.75 * H), yaw: 0.3, unit: KIT, paint: CRATE_PAINT });
  b.place('container', { at: new THREE.Vector3(2.15 * H, 0, -0.35 * H), yaw: -0.2, unit: KIT, paint: CRATE_PAINT });
  b.place('container-wide', { at: new THREE.Vector3(-3.4 * H, 0, -1.25 * H), yaw: 0.5, unit: KIT, paint: CRATE_PAINT });
  b.place('container', { at: new THREE.Vector3(-3.4 * H, 0.7 * KIT, -1.25 * H), yaw: 0.9, unit: KIT * 0.9, paint: CRATE_PAINT });
  b.place('computer', { at: new THREE.Vector3(-4.4 * H, 0, -0.2 * H), yaw: Math.PI / 2 + 0.5, unit: KIT, glow: { slots: ['colormap#ffb449'], colour: PALETTE.green, kind: SCREEN } });
  return { table, padTop };
}
