/**
 * The scratch state the field and fence meshers share: the growing vertex
 * arrays of one tile's own geometry (world space until the end), reusable
 * corner vectors, and the ground a vertex lies on.
 */
import * as THREE from 'three';
import type { World } from '../geo.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { reliefAt } from '../terrain.ts';
import type { Slope } from '../terrain.ts';
import type { LandProbe } from '../land-probe.ts';
import type { CropField } from '../countryside.ts';
import { FAR_FIELD_LIFT, FIELD_LIFTS } from './types.ts';

/** A field's ground under a point: the drawn land's height and face normal where the probe answers, else the relief and the field's own tilt. */
export interface Ground {
  radius: number;
  nx: number;
  ny: number;
  nz: number;
  drawn: boolean;
}

export interface Surface {
  world: World;
  /** The growing arrays of one tile's own geometry (fields, rows, fences). */
  out: { position: number[]; normal: number[]; color: number[]; outline: number[] };
  ground: Ground;
  /** The lift of the tile being built (`FIELD_LIFTS`). */
  fieldLift: number;
  slope: Slope;
  // Corners and their normals for the quad being emitted.
  va: THREE.Vector3;
  vb: THREE.Vector3;
  vc: THREE.Vector3;
  vd: THREE.Vector3;
  na: THREE.Vector3;
  nb: THREE.Vector3;
  nc: THREE.Vector3;
  nd: THREE.Vector3;
  colour: THREE.Color;
  faceNormal: THREE.Vector3;
  noInk: THREE.Vector3;
  e1: THREE.Vector3;
  e2: THREE.Vector3;
  faceUp: THREE.Vector3;
  /** The current field's frame, set by `orientField`. */
  fieldNorth: THREE.Vector3;
  fieldEast: THREE.Vector3;
}

export function createSurface(world: World): Surface {
  return {
    world,
    out: { position: [], normal: [], color: [], outline: [] },
    ground: { radius: 0, nx: 0, ny: 1, nz: 0, drawn: false },
    fieldLift: FIELD_LIFTS[0]!,
    slope: { grade: 0, across: 0, north: 0, lowest: 0, highest: 0 },
    va: new THREE.Vector3(),
    vb: new THREE.Vector3(),
    vc: new THREE.Vector3(),
    vd: new THREE.Vector3(),
    na: new THREE.Vector3(),
    nb: new THREE.Vector3(),
    nc: new THREE.Vector3(),
    nd: new THREE.Vector3(),
    colour: new THREE.Color(),
    faceNormal: new THREE.Vector3(),
    noInk: new THREE.Vector3(),
    e1: new THREE.Vector3(),
    e2: new THREE.Vector3(),
    faceUp: new THREE.Vector3(),
    fieldNorth: new THREE.Vector3(),
    fieldEast: new THREE.Vector3(),
  };
}

/** Empties the arrays for a new tile. */
export function resetSurface(s: Surface): void {
  s.out.position.length = 0;
  s.out.normal.length = 0;
  s.out.color.length = 0;
  s.out.outline.length = 0;
}

export function pushVertex(s: Surface, p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color, ink: THREE.Vector3): void {
  s.out.position.push(p.x, p.y, p.z);
  s.out.normal.push(n.x, n.y, n.z);
  s.out.color.push(c.r, c.g, c.b);
  s.out.outline.push(ink.x, ink.y, ink.z);
}

/** One quad, a b c d anticlockwise seen from its front, with a normal per corner. */
export function quad(s: Surface, ink: boolean): void {
  const { va, vb, vc, vd, na, nb, nc, nd, colour } = s;
  // The face's own normal decides the ink; the corners' decide the light.
  s.e1.subVectors(vb, va);
  s.e2.subVectors(vd, va);
  s.faceNormal.crossVectors(s.e1, s.e2).normalize();
  const hull = ink ? s.faceNormal : s.noInk.copy(va).normalize().negate();
  pushVertex(s, va, na, colour, hull);
  pushVertex(s, vb, nb, colour, hull);
  pushVertex(s, vc, nc, colour, hull);
  pushVertex(s, va, na, colour, hull);
  pushVertex(s, vc, nc, colour, hull);
  pushVertex(s, vd, nd, colour, hull);
}

/** The ground under a direction: the drawn land where the probe answers, else the relief with a lift. */
export function groundAt(s: Surface, direction: THREE.Vector3, shelf: number, fallbackUp: THREE.Vector3, land: LandProbe | undefined, landReady: boolean): Ground {
  const { ground } = s;
  if (land !== undefined && landReady) {
    const drawn = land.radiusAt(direction, s.faceUp);
    if (drawn !== null) {
      ground.radius = drawn + s.fieldLift;
      ground.nx = s.faceUp.x;
      ground.ny = s.faceUp.y;
      ground.nz = s.faceUp.z;
      ground.drawn = true;
      return ground;
    }
  }
  ground.radius = PLANET_RADIUS + shelf + reliefAt(direction.x, direction.y, direction.z) + FAR_FIELD_LIFT;
  ground.nx = fallbackUp.x;
  ground.ny = fallbackUp.y;
  ground.nz = fallbackUp.z;
  ground.drawn = false;
  return ground;
}

/** Sets the field frame `fieldPoint` reads. */
export function orientField(s: Surface, field: CropField): void {
  s.fieldNorth.set(0, 1, 0).projectOnPlane(field.at).normalize();
  s.fieldEast.crossVectors(field.at, s.fieldNorth).normalize();
}

/** A direction at a field-local point: across the rows (x) and along them (z). */
export function fieldPoint(s: Surface, field: CropField, x: number, z: number, into: THREE.Vector3): THREE.Vector3 {
  const c = Math.cos(field.yaw);
  const sn = Math.sin(field.yaw);
  const ex = x * c + z * sn;
  const nz = -x * sn + z * c;
  return into.copy(field.at).addScaledVector(s.fieldEast, ex / PLANET_RADIUS).addScaledVector(s.fieldNorth, nz / PLANET_RADIUS).normalize();
}
