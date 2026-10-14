/** The kinds of outpost, and the pieces each is laid out from. */

import type * as THREE from 'three';
import type { WorldSpec } from '../contract.ts';
import { PIECES } from '../kit.ts';
import type { Rng } from '../../scenery/random.ts';

export type OutpostKind = 'homestead' | 'solar' | 'relay' | 'depot' | 'greenhouse' | 'dig' | 'buoy' | 'harvester';

/** One piece of an outpost, in its own frame: +Z its front, metres from its middle. */
export interface OutpostPiece {
  id: string;
  /** A building of the kit (`PIECES`) or a prop or plant (`SCATTER`). */
  from: 'piece' | 'scatter';
  x: number;
  z: number;
  yaw: number;
  /** On top of the piece's own drawn size. */
  scale: number;
  /** A wall's radius, or 0 for what a body walks through. */
  wall: number;
}

export interface OutpostPlan {
  kind: OutpostKind;
  /** Where it stands: a unit direction. */
  at: THREE.Vector3;
  yaw: number;
  /** Which of the world's `LIVERIES`. */
  livery: number;
  pieces: OutpostPiece[];
  /** How far from its middle its last piece stands. */
  reach: number;
}

/** The kinds a world may build and how often: what needs air needs air. */
export function kindsOf(spec: WorldSpec): { item: OutpostKind; weight: number }[] {
  const air = spec.sky.air > 0;
  const deck = spec.ground === 'cloud-deck';
  const all: { item: OutpostKind; weight: number }[] = [
    { item: 'homestead', weight: 4 },
    { item: 'solar', weight: deck ? 1 : 3 },
    { item: 'relay', weight: 2 },
    { item: 'depot', weight: 2 },
    { item: 'greenhouse', weight: air ? 2 : 1 },
    { item: 'dig', weight: deck ? 0 : 2 },
    // A giant's own: a weather buoy riding the deck, a gas harvester drawing on it.
    { item: 'buoy', weight: deck ? 4 : 0 },
    { item: 'harvester', weight: deck ? 3 : 0 },
  ];
  return all.filter((one) => one.weight > 0);
}

const piece = (id: string, x: number, z: number, yaw: number, scale = 1, wall = 0): OutpostPiece => ({ id, from: 'piece', x, z, yaw, scale, wall });
const prop = (id: string, x: number, z: number, yaw: number, scale = 1): OutpostPiece => ({ id, from: 'scatter', x, z, yaw, scale, wall: 0 });

/** A building's wall: a little inside half its wider side, as the towns' `circlesOf` keep it. */
function wallOf(id: string, scale: number): number {
  const info = PIECES[id];
  if (info === undefined) return 0;
  return Math.max(info.size[0], info.size[2]) * info.scale * scale * 0.46;
}

/** Barrels, a tank, a crate or two, dropped round `x, z`. */
function clutter(rng: Rng, out: OutpostPiece[], x: number, z: number, count: number): void {
  for (let k = 0; k < count; k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(1.5, 4);
    out.push(prop(rng.pick(['barrels', 'tank', 'crate', 'barrels', 'jar']), x + Math.cos(a) * d, z + Math.sin(a) * d, rng.range(0, Math.PI * 2), rng.range(0.8, 1.1)));
  }
}

export function layout(kind: OutpostKind, rng: Rng, flora: readonly string[]): OutpostPiece[] {
  const out: OutpostPiece[] = [];
  switch (kind) {
    case 'homestead': {
      const home = rng.pick(['house-cylinder', 'house-single', 'house-long', 'house-open']);
      out.push(piece(home, 0, 0, 0, 1, wallOf(home, 1)));
      if (PIECES[home]?.roofed === true && rng.chance(0.6)) out.push(piece(rng.pick(['roof-antenna', 'roof-radar']), 0, 0, 0, 1));
      const side = rng.sign();
      out.push(piece('solar-array', side * 13, -2, rng.range(-0.3, 0.3), 1, wallOf('solar-array', 1) * 0.6));
      for (let k = 0; k < 3; k++) out.push(piece('solar-ground', -side * (10 + k * 3.2), -6, Math.PI, 1));
      clutter(rng, out, side * 6, 9, rng.between(2, 4));
      if (rng.chance(0.5)) out.push(piece('generator', -side * 8, 6, rng.range(0, Math.PI * 2), 0.9, wallOf('generator', 0.9)));
      if (flora.length > 0) for (let k = 0; k < 3; k++) out.push(prop(rng.pick(flora), rng.range(-14, 14), rng.range(10, 16), rng.range(0, 6.3), rng.range(0.8, 1.2)));
      break;
    }
    case 'solar': {
      const rows = rng.between(3, 4);
      const cols = rng.between(4, 6);
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) out.push(piece('solar-ground', (j - (cols - 1) / 2) * 3.6, (i - (rows - 1) / 2) * 5.2, 0, 1));
      }
      out.push(piece('generator', ((cols + 1) / 2) * 3.6 + 2, 0, Math.PI / 2, 1, wallOf('generator', 1)));
      out.push(piece('beacon', -((cols + 1) / 2) * 3.6 - 1.5, ((rows - 1) / 2) * 5.2, 0, 0.8));
      if (rng.chance(0.5)) out.push(piece('solar-array', 0, ((rows + 1) / 2) * 5.2 + 4, 0, 1, wallOf('solar-array', 1) * 0.6));
      break;
    }
    case 'relay': {
      out.push(piece('scaffold', 0, 0, 0, 1.3));
      const dish = rng.pick(['dish-large', 'dish']);
      out.push(piece(dish, 0, 0, rng.range(0, Math.PI * 2), 1.7, wallOf(dish, 1.7) * 0.5));
      out.push(piece('beacon', 6, 4, 0, 1, wallOf('beacon', 1)));
      out.push(piece('house-single', -9, 3, Math.PI / 2, 0.8, wallOf('house-single', 0.8)));
      out.push(piece('roof-antenna', -9, 3, Math.PI / 2, 0.8));
      out.push(piece('solar-ground', 4, -7, Math.PI, 1));
      out.push(piece('solar-ground', 7, -7, Math.PI, 1));
      clutter(rng, out, -4, -6, 2);
      break;
    }
    case 'depot': {
      const hangar = rng.pick(['hangar-large', 'hangar-round', 'hangar-small']);
      out.push(piece(hangar, 0, 0, 0, 1, wallOf(hangar, 1)));
      const second = rng.pick(['hangar-small', 'hangar-round', 'building-l']);
      out.push(piece(second, rng.sign() * 16, -4, rng.pick([0, Math.PI / 2]), 0.9, wallOf(second, 0.9)));
      out.push(piece('generator', -9, 9, 0, 1, wallOf('generator', 1)));
      clutter(rng, out, 6, 10, rng.between(4, 6));
      clutter(rng, out, -4, -10, rng.between(2, 3));
      break;
    }
    case 'greenhouse': {
      out.push(piece('geodesic-dome', 0, 0, rng.range(0, Math.PI * 2), 1, wallOf('geodesic-dome', 1)));
      out.push(piece('hangar-glass', 14, 2, Math.PI / 2, 1, wallOf('hangar-glass', 1)));
      out.push(piece('solar-array', -14, 0, 0, 0.9, wallOf('solar-array', 0.9) * 0.6));
      clutter(rng, out, 4, 12, 2);
      if (flora.length > 0) for (let k = 0; k < 5; k++) out.push(prop(rng.pick(flora), rng.range(-16, 16), rng.range(11, 18), rng.range(0, 6.3), rng.range(0.8, 1.3)));
      break;
    }
    case 'buoy': {
      // A float of tanks under a mast, a dish and a beacon: what reads the
      // weather where nobody lives.
      out.push(piece('house-single-support', 0, 0, 0, 1.6));
      out.push(prop('tank', 0, 0, 0, 1.6));
      for (const a of [0, 2.1, 4.2]) out.push(prop('tank', Math.cos(a) * 3.2, Math.sin(a) * 3.2, a, 1.1));
      out.push(piece('scaffold', 0, 0, 0, 1.4));
      out.push(piece('dish', 0, 0, rng.range(0, Math.PI * 2), 1.2));
      out.push(piece('beacon', 3.5, -2, 0, 1, wallOf('beacon', 1)));
      out.push(piece('solar-ground', -4, 2.5, Math.PI / 2, 1));
      break;
    }
    case 'harvester': {
      // A hangar on a raft of frames, a generator and the drums it fills.
      const hall = rng.pick(['hangar-large', 'hangar-round']);
      out.push(piece(hall, 0, 0, 0, 1, wallOf(hall, 1)));
      for (let k = 0; k < 3; k++) out.push(piece('scaffold', -11, (k - 1) * 6, 0, 1.2));
      out.push(piece('generator', 11, 4, Math.PI / 2, 1, wallOf('generator', 1)));
      clutter(rng, out, 9, -8, rng.between(4, 6));
      out.push(piece('beacon', -11, 10, 0, 0.9));
      break;
    }
    case 'dig': {
      for (let k = 0; k < 3; k++) out.push(piece('scaffold', (k - 1) * 6, 0, 0, 1));
      out.push(prop('crater-large', 0, 0, 0, 1.1));
      out.push(prop(rng.pick(['rock-large-1', 'rock-large-2', 'rock-large-3']), rng.sign() * 12, 6, rng.range(0, 6.3), 0.9));
      out.push(piece('generator', 8, -8, 0, 0.9, wallOf('generator', 0.9)));
      out.push(piece('house-open', -10, -8, Math.PI, 0.8, wallOf('house-open', 0.8)));
      clutter(rng, out, 2, -10, 4);
      out.push(prop('crystals-large-a', -3, 7, rng.range(0, 6.3), 1));
      break;
    }
  }
  return out;
}
