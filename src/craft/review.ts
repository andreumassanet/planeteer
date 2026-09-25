/**
 * One built craft measured against its own declaration and against the body
 * that rides it: what `pnpm craft` asserts and what `/sheets/craft.html` prints
 * under each cell, from one function, so the page and the check cannot tell
 * two stories about the same seat.
 *
 * Importable in Node: three and the craft's own files, nothing that draws.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import type { CraftModel, Seat } from './contract.ts';
import { AVATAR_HIP, HERO, envelopeOf } from './body.ts';
import { RIDE_LEAN } from '../cast.ts';

const H = AVATAR_HEIGHT;

/**
 * How much of the model's surface a body may share before it is a fault: a
 * seat back brushing a pack is not one, a gunwale through a thigh is.
 */
export const INTRUSION = 0.02 * H * H;

export interface SeatReview {
  index: number;
  seat: Seat;
  /**
   * The first surface under the hip (seated) or the soles (standing), less
   * where it should be: 0 is a hip on its pan or soles on their floor. Null in a
   * closed cab, which is a shell seen from inside and gives a ray nothing.
   */
  under: number | null;
  /** The roof over the crown, or null when nothing is over the head. */
  headroom: number | null;
  /** Surface of the model inside each part of the body's envelope. */
  inside: Record<string, number>;
  problems: string[];
}

export interface CraftReview {
  id: string;
  variant: number;
  declared: readonly [number, number, number];
  built: [number, number, number];
  base: number;
  triangles: number;
  meshes: number;
  turning: string[];
  seats: SeatReview[];
  problems: string[];
}

/** Every triangle of a built craft in its own frame. */
function soupsOf(group: THREE.Object3D): Float32Array[] {
  group.updateMatrixWorld(true);
  const out: Float32Array[] = [];
  const v = new THREE.Vector3();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const p = mesh.geometry.getAttribute('position');
    // A skinned body — the horse — is indexed; everything else is a soup already.
    const index = mesh.geometry.index;
    const corners = index === null ? p.count : index.count;
    const soup = new Float32Array(corners * 3);
    for (let i = 0; i < corners; i++) {
      v.fromBufferAttribute(p, index === null ? i : index.getX(i)).applyMatrix4(mesh.matrixWorld);
      soup[i * 3] = v.x;
      soup[i * 3 + 1] = v.y;
      soup[i * 3 + 2] = v.z;
    }
    out.push(soup);
  });
  return out;
}

/**
 * The area of every triangle with its centroid or a corner inside a box: crude,
 * and deliberately generous about what counts.
 */
function areaInside(soups: readonly Float32Array[], min: readonly number[], max: readonly number[]): number {
  const inside = (x: number, y: number, z: number) =>
    x > min[0]! && x < max[0]! && y > min[1]! && y < max[1]! && z > min[2]! && z < max[2]!;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let area = 0;
  for (const soup of soups) {
    for (let i = 0; i < soup.length; i += 9) {
      a.fromArray(soup, i);
      b.fromArray(soup, i + 3);
      c.fromArray(soup, i + 6);
      const hit =
        inside((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3) ||
        inside(a.x, a.y, a.z) ||
        inside(b.x, b.y, b.z) ||
        inside(c.x, c.y, c.z);
      if (hit) area += b.sub(a).cross(c.sub(a)).length() / 2;
    }
  }
  return area;
}

/** The first surface straight down from a point, or Infinity. */
function dropFrom(group: THREE.Object3D, x: number, y: number, z: number): number {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObject(group, true);
  return hits.length > 0 ? hits[0]!.distance : Infinity;
}

const f = (value: number): string => value.toFixed(2);

export function reviewCraft(model: CraftModel, variant = 0, group: THREE.Group = model.build(variant)): CraftReview {
  group.updateMatrixWorld(true);
  const problems: string[] = [];
  const box = new THREE.Box3().setFromObject(group);
  const built: [number, number, number] = [box.max.z - box.min.z, box.max.x - box.min.x, box.max.y - box.min.y];
  ['length', 'width', 'height'].forEach((name, i) => {
    const off = Math.abs(built[i]! - model.size[i]!) / model.size[i]!;
    if (off > 0.02) problems.push(`${name} built ${f(built[i]!)} against a declared ${f(model.size[i]!)}`);
  });
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  if (Math.abs(cx) > 0.02 * model.size[1] || Math.abs(cz) > 0.02 * model.size[0]) {
    problems.push(`not centred: the box's middle is at x ${f(cx)} z ${f(cz)}`);
  }
  const base = model.medium === 'water' ? -model.draft : 0;
  if (Math.abs(box.min.y - base) > 0.01 * H) problems.push(`the base is at y ${f(box.min.y)} and should be at ${f(base)}`);

  let triangles = 0;
  let meshes = 0;
  const turning: string[] = [];
  group.traverse((object) => {
    const det = object.matrixWorld.determinant();
    if (!(det > 0)) problems.push(`'${object.name}' has a matrix of determinant ${det.toFixed(3)}`);
    if (object !== group && ['prop', 'rotor', 'wheel'].includes(object.name)) turning.push(object.name);
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const g = mesh.geometry;
    const count = g.getAttribute('position').count;
    for (const name of ['normal', 'color', 'outlineNormal']) {
      const attribute = g.getAttribute(name);
      if (attribute === undefined) problems.push(`'${mesh.name}' has no ${name}`);
      else if (attribute.count !== count) problems.push(`'${mesh.name}' ${name} has ${attribute.count} of ${count}`);
    }
    triangles += (g.index === null ? count : g.index.count) / 3;
  });

  const soups = soupsOf(group);
  const seats = model.seats.map((seat, index): SeatReview => {
    const own: string[] = [];
    if (Math.abs(seat.x) > model.size[1] / 2 || Math.abs(seat.z) > model.size[0] / 2 || seat.y < box.min.y || seat.y > box.max.y) {
      own.push(`at ${f(seat.x)}, ${f(seat.y)}, ${f(seat.z)}: outside the craft`);
    }
    // Headroom: the first surface down from high over the seat is under the
    // crown, or not over the body at all.
    const crown = seat.y + (seat.pose === 'stand' ? HERO.standing - AVATAR_HIP : HERO.crown);
    const roof = box.max.y + H - dropFrom(group, seat.x, box.max.y + H, seat.z);
    const covered = roof > crown - 0.3 * H;
    if (covered && roof < crown + 0.01 * H) own.push(`the roof is at ${f(roof)} and the crown at ${f(crown)}`);
    // A seated hip on its pan, standing soles on their floor.
    let under: number | null = null;
    if (seat.shown) {
      const standing = seat.pose === 'stand';
      const want = standing ? AVATAR_HIP + 0.005 * H : 0.005 * H;
      under = dropFrom(group, seat.x, seat.y + 0.005 * H, seat.z) - want;
      if (Math.abs(under) > 0.05 * H) own.push(`the first surface under the ${standing ? 'soles' : 'hip'} is ${f(under)} off`);
      if (seat.pose === 'sit') {
        const feet = dropFrom(group, seat.x, seat.y - HERO.sole + 0.02 * H, seat.z + HERO.toe * 0.8);
        if (feet > 0.12 * H) own.push(`nothing under the feet for ${f(feet)}`);
      }
      if (seat.pose === 'ride') {
        // Astride, the hands reach the grip and the feet their rest: no
        // further from the hip than an arm and a leg go.
        if (seat.grip === undefined || seat.feet === undefined) own.push('astride with no grip or no footrest');
        else {
          // The rider leans forward from the hips as far as `RIDE_LEAN` to reach it.
          const grip = seat.grip;
          let reach = Infinity;
          for (let lean = 0; lean <= RIDE_LEAN + 1e-9; lean += 0.05) {
            reach = Math.min(reach, Math.hypot(grip[1] - HERO.shoulder * Math.cos(lean), grip[2] - HERO.shoulder * Math.sin(lean)));
          }
          if (reach > HERO.arm) own.push(`the grip is ${f(reach)} from the shoulders, out of an arm's ${f(HERO.arm)} leaning as far as a rider does`);
          const leg = Math.hypot(seat.feet[0], seat.feet[1], seat.feet[2]) + (seat.crank ?? 0);
          if (leg > HERO.legs) own.push(`the footrest is ${f(leg)} from the hip, past the leg's ${f(HERO.legs)}`);
        }
      }
    }
    const inside: Record<string, number> = {};
    let total = 0;
    for (const envelope of envelopeOf(seat)) {
      inside[envelope.name] = areaInside(soups, envelope.min, envelope.max);
      total += inside[envelope.name]!;
    }
    if (seat.shown && total > INTRUSION) {
      own.push(`the body shares ${total.toFixed(3)} of surface with the model`);
    }
    for (const problem of own) problems.push(`seat ${index}: ${problem}`);
    return { index, seat, under, headroom: covered ? roof - crown : null, inside, problems: own };
  });

  return { id: model.id, variant, declared: model.size, built, base: box.min.y, triangles, meshes, turning, seats, problems };
}
