/**
 * A bench, and sitting on one: how high its seat is, how deep, where the
 * sitter's feet go, and the one model every bench in the world is built from
 * — the countryside's by a road or a lighthouse (`countryside-kit.ts`) and a
 * town's on its pavements (`scenery/parts/street-bench.ts`). A station's
 * bench under its canopy is its own model, sat on by the same numbers
 * (`railway.ts`, `benchesNear`).
 *
 * **The seat is the clip's, not the other way round.** Sitting is the cast's
 * `Sit` clip (`retarget-clips.ts`), which the library authored on a chair, so
 * its thighs rest on thin air at the height of one. Measured off the skinned
 * mesh of both bodies at the clip's first frame (2026-09-25, in the pack's own
 * metres on a body of 1.87): the underside of the thighs lies at 0.49 over the
 * root from the back of the seat to just short of the knee, the back of the
 * hips 0.33 behind the root, and the knees bend 0.1 in front of it. As a share
 * of the body those are `SIT_SEAT`, `SIT_BACK` below, and every number here is
 * derived from them and `AVATAR_HEIGHT`, so a bench is sat on by whatever size
 * a person is.
 *
 * **Nothing here knows about a town or a field.** A bench is a base on the
 * ground and a yaw; `sitSpot` turns that into where a body's root goes and the
 * way it faces, which is what `Player.sitOn` takes.
 */
import * as THREE from 'three';
import type { SceneryContext } from './scenery/contract.ts';
import { AVATAR_HEIGHT } from './stature.ts';

/** The `Sit` clip's thigh underside over the root, as a share of the body's height: 0.49 of 1.87. */
const SIT_SEAT = 0.262;
/** And the back of its hips behind the root: 0.33 of 1.87. */
const SIT_BACK = 0.1765;

/**
 * The eyes of a body in the `Sit` clip over its root, as a share of its
 * height: the standing eye (0.93, `camera.ts`) less how far the head comes
 * down. Measured off the skinned cast at `AVATAR_HEIGHT` (2026-09-25): the head
 * bone 0.18 of the body lower than in the idle on the man, 0.24 on the woman,
 * 0.21 between them. What first person on a bench looks from.
 */
export const SIT_EYE = 0.72;

/** The top of a bench's seat over the ground it stands on: where the sitting clip's thighs rest. */
export const BENCH_SEAT = AVATAR_HEIGHT * SIT_SEAT;
/** Front to back, deep enough to carry the thighs to just short of the knee. */
export const BENCH_DEPTH = AVATAR_HEIGHT * 0.24;
/** The plank's thickness, its top at `BENCH_SEAT`. */
const PLANK = 0.12;
/** The back posts and the back rail, front to back. */
const POST = 0.12;
const RAIL = 0.1;
/** How far the back rail's front stands behind the bench's middle. */
export const BENCH_BACK = BENCH_DEPTH / 2 - POST - RAIL;
/**
 * How far in front of a seat's middle a sitter's root stands, for a seat
 * whose back's front is `back` behind that middle: the back of the hips
 * meets it. The one rule a bench and a café chair (`scenery/street-dressing.ts`)
 * are both sat on by; a seat's top is at `BENCH_SEAT` for either.
 */
export function sitAhead(back: number): number {
  return -back + AVATAR_HEIGHT * SIT_BACK;
}
/** A bench's: the rail's front plus the hips behind the root. */
export const BENCH_SIT_AHEAD = sitAhead(BENCH_BACK);
/**
 * The longest a town's bench is (`street-bench.ts`), which the people
 * strolling past one keep clear of by half and their own width.
 */
export const BENCH_LONGEST = AVATAR_HEIGHT * 0.84;
/** How near a sitter's spot has to be for `E` to offer the bench. */
export const BENCH_REACH = AVATAR_HEIGHT * 0.7;

/**
 * A bench facing +Z — its back rail at -Z — standing on y = 0, `length`
 * long with a back `back` tall over the seat: two iron frames, a plank and a
 * rail. Six boxes, three colours; each face keeps to its own plane or its
 * own colour, which is what a merged town needs of it.
 */
export function buildBench(ctx: SceneryContext, wood: number, iron: number, length: number, back: number): THREE.Group {
  const { THREE: three, box, tone } = ctx;
  const group = new three.Group();
  const place = (mesh: THREE.Mesh, x: number, y: number, z: number): void => {
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  const frameX = length / 2 - 0.25;
  const legs = BENCH_SEAT - PLANK;
  for (const x of [-frameX, frameX]) {
    // The frame under the plank, a little shallower than it, so no face of
    // one is in a plane of the other.
    place(box(0.14, legs, BENCH_DEPTH - 0.12, iron), x, 0, 0);
    place(box(0.14, back, POST, iron), x, BENCH_SEAT, -BENCH_DEPTH / 2 + POST / 2 + 0.02);
  }
  place(box(length, PLANK, BENCH_DEPTH, wood), 0, legs, 0);
  place(box(length - 0.2, back * 0.5, RAIL, tone(wood, 1.1)), 0, BENCH_SEAT + back * 0.42, -BENCH_BACK - RAIL / 2);
  return group;
}

/** Where a sitter goes: the root's point on the ground, the way they face, and how far under the ground the bench is bedded. */
export interface Bench {
  /** The root's spot, in world space, on the ground or paving the bench stands on. */
  position: THREE.Vector3;
  /** Unit, along the ground: the way the bench faces. */
  facing: THREE.Vector3;
  /** Units the bench's base is under the ground at the spot, which the sitter sinks with it. */
  sink: number;
  /** A stable name for the bench, for telling one from the next. */
  key: string;
}

/**
 * A bench whose base is at `base` (world space) with its +Z along `facing`
 * (unit, tangent to the ground there): the sitter's spot, written into `out`.
 */
export function sitSpot(base: THREE.Vector3, facing: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(base).addScaledVector(facing, BENCH_SIT_AHEAD);
}
