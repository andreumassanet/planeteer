/** A field's plate: strips of its two tones across the rows, every vertex on the ground. */
import * as THREE from 'three';
import { gradeAt, reliefAt } from '../terrain.ts';
import type { LandProbe } from '../land-probe.ts';
import type { CropField } from '../countryside.ts';
import type { Look } from './looks.ts';
import { FAR_SKIRT, SEGMENT } from './types.ts';
import { fieldPoint, groundAt, orientField, quad } from './surface.ts';
import type { Surface } from './surface.ts';

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]] as const;
const probeAt = new THREE.Vector3();

/** The grid of the plate's corners, each asked of the ground once: a corner is shared by four quads. Returns whether any stood on the relief. */
function fillGrid(
  s: Surface, field: CropField, grid: Float64Array, strips: number, segments: number,
  shelf: number, tilt: THREE.Vector3, land: LandProbe | undefined, onLand: boolean,
): boolean {
  const columns = strips + 1;
  let fallback = false;
  for (let i = 0; i <= strips; i++) {
    const x = -field.halfX + (i * 2 * field.halfX) / strips;
    // A round field is its rectangle pulled in to the ellipse, strip by strip.
    const room = field.round ? Math.sqrt(Math.max(0, 1 - (x / field.halfX) ** 2)) : 1;
    for (let j = 0; j <= segments; j++) {
      const z = (-field.halfZ + (j * 2 * field.halfZ) / segments) * room;
      fieldPoint(s, field, x, z, probeAt);
      const g = groundAt(s, probeAt, shelf, tilt, land, onLand);
      if (!g.drawn) fallback = true;
      const o = (j * columns + i) * 6;
      grid[o] = probeAt.x * g.radius;
      grid[o + 1] = probeAt.y * g.radius;
      grid[o + 2] = probeAt.z * g.radius;
      grid[o + 3] = g.nx;
      grid[o + 4] = g.ny;
      grid[o + 5] = g.nz;
    }
  }
  return fallback;
}

/** The skirt, where the field stands on the relief: its edge carried down into the ground, a quad under every edge of the plate. */
function skirt(
  s: Surface, look: Look, strips: number, segments: number,
  at: (i: number, j: number, into: THREE.Vector3, normal: THREE.Vector3) => void,
): void {
  const { va, vb, vc, vd, na, nb, nc, nd } = s;
  s.colour.set(look.plate[0]!).multiplyScalar(0.8);
  const edge = (ai: number, aj: number, bi: number, bj: number): void => {
    at(ai, aj, va, na);
    at(bi, bj, vb, nb);
    vc.copy(vb).setLength(vb.length() - FAR_SKIRT);
    vd.copy(va).setLength(va.length() - FAR_SKIRT);
    // Lit as the wall it is, not as the field above it.
    s.e1.subVectors(vb, va);
    s.e2.subVectors(vd, va);
    na.crossVectors(s.e1, s.e2).normalize();
    nb.copy(na);
    nc.copy(na);
    nd.copy(na);
    quad(s, false);
  };
  // Clockwise round the field seen from above, so each face looks out.
  for (let j = segments; j > 0; j--) edge(0, j, 0, j - 1);
  for (let i = 0; i < strips; i++) edge(i, 0, i + 1, 0);
  for (let j = 0; j < segments; j++) edge(strips, j, strips, j + 1);
  for (let i = strips; i > 0; i--) edge(i, segments, i - 1, segments);
}

/**
 * Strips of the field's two tones across the rows, each a run of quads along
 * them no longer than `SEGMENT`. Returns whether it had to stand on the relief.
 */
export function plate(s: Surface, look: Look, field: CropField, level: number, land: LandProbe | undefined, landReady: boolean): boolean {
  const { va, vb, vc, vd, na, nb, nc, nd } = s;
  orientField(s, field);
  const shelf = s.world.elevationAt(field.at) - reliefAt(field.at.x, field.at.y, field.at.z);
  gradeAt(field.at, s.fieldEast, s.fieldNorth, Math.min(field.halfX, field.halfZ) * 0.7, s.slope);
  const tilt = new THREE.Vector3().copy(field.at).addScaledVector(s.fieldEast, -s.slope.across).addScaledVector(s.fieldNorth, -s.slope.north).normalize();
  // Strips double in width a level up, so a far field is a few bands and not a
  // moire; at the finest level a ridged field's plate is the furrows' bottoms,
  // one tone under its ridges.
  const furrowed = level === 0 && look.furrows !== undefined;
  const stripe = look.stripe > 0 && !furrowed ? look.stripe * 2 ** level : 0;
  const strips = stripe > 0 ? Math.max(1, Math.round((2 * field.halfX) / stripe)) : Math.max(1, Math.ceil((2 * field.halfX) / SEGMENT[level]!));
  const segments = Math.max(1, Math.ceil((2 * field.halfZ) / SEGMENT[level]!));
  // All of a field on the drawn land or all of it on the relief: a field at the
  // edge of what the probe has gathered is not half of each.
  let onLand = land !== undefined && landReady;
  for (const [u, v] of CORNERS) {
    if (!onLand) break;
    if (land!.radiusAt(fieldPoint(s, field, u * field.halfX, v * field.halfZ, probeAt)) === null) onLand = false;
  }
  const columns = strips + 1;
  const grid = new Float64Array(columns * (segments + 1) * 6);
  const fallback = fillGrid(s, field, grid, strips, segments, shelf, tilt, land, onLand);
  const at = (i: number, j: number, into: THREE.Vector3, normal: THREE.Vector3): void => {
    const o = (j * columns + i) * 6;
    into.set(grid[o]!, grid[o + 1]!, grid[o + 2]!);
    normal.set(grid[o + 3]!, grid[o + 4]!, grid[o + 5]!);
  };
  for (let i = 0; i < strips; i++) {
    s.colour.set(look.plate[furrowed ? 1 : i % 2]!);
    for (let j = 0; j < segments; j++) {
      // Anticlockwise seen from above, with x east and z north: up the western
      // side and back down the eastern one.
      at(i, j, va, na);
      at(i, j + 1, vb, nb);
      at(i + 1, j + 1, vc, nc);
      at(i + 1, j, vd, nd);
      quad(s, false);
    }
  }
  if (fallback && !field.round) skirt(s, look, strips, segments, at);
  return fallback;
}
