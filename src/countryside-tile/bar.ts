/** Prisms along the ground: a paddy's bunds, a fence's posts and rails, a dry-stone wall. */
import * as THREE from 'three';
import { PLANET_RADIUS } from '../globe.ts';
import { reliefAt } from '../terrain.ts';
import type { LandProbe } from '../land-probe.ts';
import { PALETTE } from '../theme.ts';
import type { RegionStyle, SceneryContext } from '../scenery/contract.ts';
import type { CountryLine } from '../countryside.ts';
import { FAR_FIELD_LIFT, SEGMENT } from './types.ts';
import { groundAt, quad } from './surface.ts';
import type { Surface } from './surface.ts';

const barFrom = new THREE.Vector3();
const barTo = new THREE.Vector3();
const side = new THREE.Vector3();
const along = new THREE.Vector3();
const pa = new THREE.Vector3();
const pb = new THREE.Vector3();
const postA = new THREE.Vector3();
const postB = new THREE.Vector3();

/** Sets the corner normals of the quad in `s` to the face's own, then emits it. */
function flatQuad(s: Surface, ink: boolean): void {
  s.e1.subVectors(s.vb, s.va);
  s.e2.subVectors(s.vd, s.va);
  s.na.crossVectors(s.e1, s.e2).normalize();
  s.nb.copy(s.na);
  s.nc.copy(s.na);
  s.nd.copy(s.na);
  quad(s, ink);
}

/**
 * A prism along the ground from a to b (unit vectors): `width` at its foot,
 * `top` at its crown, `height` over the ground and `bury` into it, at `lift`
 * over the ground. Split every `SEGMENT[0]` units so it follows the ground.
 */
export function bar(
  s: Surface, a: THREE.Vector3, b: THREE.Vector3, width: number, top: number, height: number, bury: number, lift: number,
  color: number, ink: boolean, land: LandProbe | undefined, landReady: boolean,
): void {
  const { va, vb, vc, vd } = s;
  const length = a.distanceTo(b) * PLANET_RADIUS;
  const pieces = Math.max(1, Math.ceil(length / SEGMENT[0]!));
  s.colour.set(color);
  for (let k = 0; k < pieces; k++) {
    barFrom.copy(a).lerp(b, k / pieces).normalize();
    barTo.copy(a).lerp(b, (k + 1) / pieces).normalize();
    const shelfA = s.world.elevationAt(barFrom) - reliefAt(barFrom.x, barFrom.y, barFrom.z);
    const g0 = groundAt(s, barFrom, shelfA, barFrom, land, landReady).radius - (s.ground.drawn ? s.fieldLift : FAR_FIELD_LIFT);
    const g1 = groundAt(s, barTo, shelfA, barTo, land, landReady).radius - (s.ground.drawn ? s.fieldLift : FAR_FIELD_LIFT);
    pa.copy(barFrom).multiplyScalar(g0);
    pb.copy(barTo).multiplyScalar(g1);
    along.subVectors(pb, pa).normalize();
    side.crossVectors(along, barFrom).normalize();
    const upA = barFrom;
    const upB = barTo;
    // Cross-section: foot left, foot right, crown right, crown left.
    const foot = (p: THREE.Vector3, u: THREE.Vector3, sign: number, into: THREE.Vector3): THREE.Vector3 =>
      into.copy(p).addScaledVector(side, sign * width / 2).addScaledVector(u, lift - bury);
    const crown = (p: THREE.Vector3, u: THREE.Vector3, sign: number, into: THREE.Vector3): THREE.Vector3 =>
      into.copy(p).addScaledVector(side, sign * top / 2).addScaledVector(u, lift + height);
    const sideFace = (sign: number): void => {
      // The face on side `sign`, anticlockwise seen from outside it.
      if (sign > 0) {
        foot(pa, upA, 1, va); foot(pb, upB, 1, vb); crown(pb, upB, 1, vc); crown(pa, upA, 1, vd);
      } else {
        foot(pb, upB, -1, va); foot(pa, upA, -1, vb); crown(pa, upA, -1, vc); crown(pb, upB, -1, vd);
      }
      flatQuad(s, ink);
    };
    sideFace(1);
    sideFace(-1);
    // The crown.
    crown(pa, upA, 1, va); crown(pb, upB, 1, vb); crown(pb, upB, -1, vc); crown(pa, upA, -1, vd);
    flatQuad(s, ink);
    // The two ends, only at the ends of the whole bar.
    if (k === 0 || k === pieces - 1) {
      const end = (p: THREE.Vector3, u: THREE.Vector3, outward: number): void => {
        // `side` is `along x up`, so the start's face runs from the -side foot.
        if (outward < 0) {
          foot(p, u, -1, va); foot(p, u, 1, vb); crown(p, u, 1, vc); crown(p, u, -1, vd);
        } else {
          foot(p, u, 1, va); foot(p, u, -1, vb); crown(p, u, -1, vc); crown(p, u, 1, vd);
        }
        flatQuad(s, ink);
      };
      if (k === 0) end(pa, upA, -1);
      if (k === pieces - 1) end(pb, upB, 1);
    }
  }
}

/** A fence (posts and two rails) or a dry-stone wall, along the ground. */
export function fenceAlong(s: Surface, ctx: SceneryContext, line: CountryLine, style: RegionStyle, land: LandProbe | undefined, landReady: boolean): void {
  if (line.kind === 'wall') {
    const stone = style.stone[0] ?? PALETTE.slate;
    bar(s, line.from, line.to, 0.95, 0.7, 1.15, 0.4, 0, stone, true, land, landReady);
    return;
  }
  const wood = style.id === 'north-america' ? PALETTE.white : PALETTE.brown;
  const length = line.from.distanceTo(line.to) * PLANET_RADIUS;
  const posts = Math.max(1, Math.round(length / 4));
  // A post is a bar as long as it is wide, along the fence.
  const half = 0.12 / Math.max(length, 1e-3);
  for (let i = 0; i <= posts; i++) {
    const t = i / posts;
    postA.copy(line.from).lerp(line.to, Math.max(0, t - half)).normalize();
    postB.copy(line.from).lerp(line.to, Math.min(1, t + half)).normalize();
    bar(s, postA, postB, 0.24, 0.24, 1.45, 0.3, 0, ctx.tone(wood, 0.85), true, land, landReady);
  }
  bar(s, line.from, line.to, 0.12, 0.12, 0.16, 0, 0.62, wood, true, land, landReady);
  bar(s, line.from, line.to, 0.12, 0.12, 0.16, 0, 1.12, wood, true, land, landReady);
}
