import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../../stature.ts';
import { rngFrom } from '../random.ts';
import { DECAL_LIFT, M } from './config.ts';
import type { Window } from './facade.ts';
import { FOOTPRINTS, type Footprint, type Piece } from './footprints.ts';
import { aircon, awning, blade, fascia, flowerBox, shutters } from './fronts.ts';
import { drawPiece } from './furniture.ts';
import type { PropModels } from './models.ts';
import { gully, manhole, shade, type Put } from './paint.ts';
import { Sink } from './sink.ts';
import { BASE, P, STYLES } from './styles.ts';
import type { Dressed } from './types.ts';

export interface SamplePiece {
  name: string;
  triangles: number;
}

/**
 * Every piece this file draws for one region, in a row on y = 0, and every
 * façade piece on a wall standing at z = 0 facing +Z — built by the same
 * functions a town is dressed with, so `pnpm scenery` can hold them to the
 * kit's rules (no two colours in one plane, normals that agree with their
 * winding, the same buffer twice) without raising a town.
 */
export function sampleDressing(region: string, iso: string, variant: number, models: PropModels | null = null): { dressed: Dressed; pieces: SamplePiece[] } {
  const style = STYLES[region] ?? BASE;
  const sink = new Sink();
  const pieces: SamplePiece[] = [];
  const matrix = new THREE.Matrix4();
  const rng = rngFrom('sample', region, variant);
  const record = (name: string, write: () => void): void => {
    const before = sink.triangles;
    write();
    pieces.push({ name, triangles: sink.triangles - before });
  };
  let x = 0;
  for (const piece of Object.keys(FOOTPRINTS) as Piece[]) {
    matrix.makeRotationY(variant * 0.7).setPosition(x, 0, 6 * M);
    sink.place(matrix);
    record(piece, () => drawPiece(sink, rng, piece, style, iso, models));
    x += FOOTPRINTS[piece].width + 2;
  }
  matrix.identity();
  sink.place(matrix);
  const wall = 0;
  const w: Window = { x0: -0.6, x1: 0.6, y0: 6, y1: 7.6, z: wall + 0.16, wall };
  record('awning', () => awning(sink, -3, 3, wall, AVATAR_HEIGHT * 1.03 + 0.3 * M, 0.75 * M, 0.18 * M, 0.12 * M, rng.pick(style.fabrics)));
  record('fascia', () => fascia(sink, rng, style, 4, 9, 4, 4 + 0.4 * M, wall));
  record('blade', () => blade(sink, rng, { ...style, blade: 'tall' }, 11, wall, AVATAR_HEIGHT, 2 * M, 0.45 * M));
  record('blade-square', () => blade(sink, rng, { ...style, blade: 'square' }, 13, wall, AVATAR_HEIGHT, 0.5 * M, 0.5 * M));
  record('flower-box', () => flowerBox(sink, rng, w.x0 - 0.08, w.x1 + 0.08, w.y0 - 0.03, wall));
  record('shutters', () => shutters(sink, { ...w, x0: 16, x1: 17.2 }, rng.pick(style.shutterColors)));
  record('aircon', () => aircon(sink, 21, 7, wall));
  // The ironwork, laid flush on a plane at y = 0 in the road's colour.
  const put: Put = (px, pz) => [px, DECAL_LIFT, pz + 12];
  const road = (factor: number): number => shade(P.slate, factor);
  record('manhole', () => manhole(sink, put, 2, 0, 0.3 * M, false, road));
  record('manhole-radial', () => manhole(sink, put, 5, 0, 0.3 * M, true, road));
  record('gully', () => gully(sink, put, { x0: 8, x1: 8 + 0.22 * M, z0: -0.5, z1: -0.5 + 0.45 * M }, true, road));
  record('gully-across', () => gully(sink, put, { x0: 11, x1: 11 + 0.45 * M, z0: -0.5, z1: -0.5 + 0.22 * M }, false, road));
  const triangles = sink.triangles;
  return {
    dressed: {
      position: new Float32Array(sink.position),
      normal: new Float32Array(sink.normal),
      color: new Float32Array(sink.color),
      glow: new Uint8Array(sink.glow),
      triangles,
      emits: sink.glow.some((value, i) => i % 2 === 0 && value > 0),
      solids: [],
      seats: [],
      pieces: [],
      anchors: sink.anchors,
      counts: {},
    },
    pieces,
  };
}

/** The most a piece on the building line comes to, by name, for the check; undefined for a façade's. */
export function pieceCost(name: string): number | undefined {
  return (FOOTPRINTS as Record<string, Footprint | undefined>)[name]?.cost;
}

/** The regions this file has a style for, for the check. */
export const DRESSING_REGIONS = Object.keys(STYLES);
