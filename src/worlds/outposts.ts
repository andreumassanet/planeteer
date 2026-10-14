/**
 * What stands between a world's towns, as Earth's countryside stands between
 * its own (`countryside.ts`): a homestead with its solar array and tanks, a
 * field of ground panels round a generator, a relay mast with its dish, a depot
 * of hangars and barrels, a greenhouse dome, a dig under scaffolding.
 *
 * A pure function of a tile (`planOf`), as the countryside's plans are of a
 * cell: the finest tile's key seeds whether it holds one, which kind, where and
 * turned which way, so a tile built twice holds the same outpost and every
 * client agrees with nothing sent. At most one a tile, on `OUTPOST_CHANCE` of
 * them, and never where the world keeps bare (`Terrain.bareAt`: a town's square,
 * a road and its banks, a pad) nor on ground steeper than `STEEPEST`, sampled
 * over the whole footprint.
 *
 * Built from the town's own kit (`kit.ts`): the same modules, panels, hangars
 * and dishes in the civilisation's liveries (`buildingPaint`), merged into its
 * tile's mesh with the rocks (`decor.ts`). Each piece is bedded on the lowest
 * ground under it, as Earth's are (`PLANT_SEATING`).
 *
 * And a wall, as a farmhouse is (`vegetation.collide`): the buildings' circles
 * are kept for the tiles that have been built round the traveller (`collide`),
 * so a body walks round a homestead and not through it. Panels, barrels and the
 * dig's frames are walked through, as fences are on Earth. The layouts are in
 * `outposts/layout.ts`.
 */

import * as THREE from 'three';
import type { WorldSpec } from './contract.ts';
import type { Terrain } from './terrain.ts';
import type { TileKey } from './cube.ts';
import { faceDir, keyOf, tileSpan } from './cube.ts';
import { DEFAULT_ARCHITECTURE } from './contract.ts';
import { PIECES, liveryOf } from './kit.ts';
import type { Livery } from './kit.ts';
import { rngFrom } from '../scenery/random.ts';
import type { Merged } from '../merge.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { kindsOf, layout } from './outposts/layout.ts';
import type { OutpostKind, OutpostPiece, OutpostPlan } from './outposts/layout.ts';
import { createShapes } from './outposts/shapes.ts';
import { createStanding } from './outposts/standing.ts';
import type { Wall } from './outposts/standing.ts';

export type { OutpostKind, OutpostPiece, OutpostPlan } from './outposts/layout.ts';

/** How many of the finest tiles hold an outpost. One in fourteen is one every three hundred units or so. */
const OUTPOST_CHANCE = 0.07;
/**
 * And on a cloud deck, whose finest tiles are four times as wide
 * (`FINEST_DECK`): about the same outposts a square kilometre.
 */
const DECK_CHANCE = 0.55;
/** How many liveries a world's outposts are painted in: each is a set of shapes built once. */
const LIVERIES = 4;
/** Steepest ground an outpost is built on, as rise over run between two of its footprint's points. */
const STEEPEST = 0.35;
/** A door's lamp: how high over the ground, and how far out from the wall. */
const DOOR_LIGHT = AVATAR_HEIGHT * 0.8;
const DOOR_OUT = 1.2;

const scratchUp = new THREE.Vector3();
const scratchForward = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchPoint = new THREE.Vector3();

/** The tangent frame at `up`, turned `yaw`: right and forward. Right-handed: right x up = forward. */
function frameAt(up: THREE.Vector3, yaw: number, right: THREE.Vector3, forward: THREE.Vector3): void {
  forward.set(up.y, -up.x, 0);
  if (forward.lengthSq() < 1e-8) forward.set(1, 0, 0);
  forward.addScaledVector(up, -forward.dot(up)).normalize().applyAxisAngle(up, yaw);
  right.crossVectors(up, forward).normalize();
}

/** A point of a plan's frame as a unit direction. */
function directionOf(plan: OutpostPlan, x: number, z: number, R: number, out: THREE.Vector3): THREE.Vector3 {
  frameAt(plan.at, plan.yaw, scratchRight, scratchForward);
  return out.copy(plan.at).multiplyScalar(R).addScaledVector(scratchRight, x).addScaledVector(scratchForward, z).normalize();
}

export interface Outposts {
  /** The plan a finest tile holds, or null: pure, and cached. */
  planOf(key: TileKey): OutpostPlan | null;
  /** Its geometry's pieces as merged arrays and their matrices, relative to `centre`, for `decor.ts`. */
  build(key: TileKey, plan: OutpostPlan, centre: THREE.Vector3, out: { variant: Merged; matrix: THREE.Matrix4 }[]): void;
  /** Whether a direction is inside the outpost a tile holds: its yard, which the rocks keep off. */
  covers(key: TileKey, direction: { x: number; y: number; z: number }): boolean;
  /** The nearest outpost built so far to a point, of a kind if given, for the console: `atlasWorld.outposts.nearest(p)`. */
  nearest(point: THREE.Vector3, kind?: OutpostKind): OutpostPlan | null;
  /**
   * The lamps over the outposts' doors near a point, appended to `out` from
   * slot `from` as `settlements.lampsNear` writes them (x, y, z, distance):
   * how many in all.
   */
  lampsNear(point: THREE.Vector3, out: Float32Array, from: number, max: number): number;
  /** A tile let go of by the ground: its outpost's walls and lamps go with it. */
  retire(key: TileKey): void;
  /** Pushes a body out of the outposts built round it; true if it moved. */
  collide(position: THREE.Vector3, radius: number): boolean;
  readonly stats: { planned: number; built: number; walls: number };
}

export function createOutposts(spec: WorldSpec, terrain: Terrain): Outposts {
  const R = terrain.radius;
  const plans = new Map<string, OutpostPlan | null>();
  const kinds = kindsOf(spec);
  const deck = spec.ground === 'cloud-deck';
  const style = spec.civilisation?.architecture ?? DEFAULT_ARCHITECTURE;
  const liveries: Livery[] = [];
  for (let k = 0; k < LIVERIES; k++) liveries.push(liveryOf(style, rngFrom('worlds', spec.id, 'outpost-livery', k)));
  const flora = spec.scatter?.flora.map((one) => one.item) ?? [];
  const standing = createStanding(R);
  const shapeOf = createShapes(liveries);
  const stats = standing.stats;
  /** Plans asked of tiles, most of them empty: forgotten past this many, as they are pure. */
  const PLANS_KEPT = 40000;
  const dir = { x: 0, y: 0, z: 0 };

  function planOf(key: TileKey): OutpostPlan | null {
    if (key.level !== terrain.levels) return null;
    const id = keyOf(key);
    if (plans.has(id)) return plans.get(id)!;
    if (plans.size > PLANS_KEPT) plans.clear();
    let plan: OutpostPlan | null = null;
    const rng = rngFrom('worlds', spec.id, 'outpost', id);
    if (rng.chance(deck ? DECK_CHANCE : OUTPOST_CHANCE)) {
      const [u0, v0, size] = tileSpan(key);
      // In the tile's middle half, so its pieces mostly stay on its own tile.
      faceDir(key.face, u0 + size * rng.range(0.3, 0.7), v0 + size * rng.range(0.3, 0.7), dir);
      const kind = rng.weighted(kinds);
      const candidate: OutpostPlan = {
        kind,
        at: new THREE.Vector3(dir.x, dir.y, dir.z),
        yaw: rng.range(0, Math.PI * 2),
        livery: rng.int(LIVERIES),
        pieces: layout(kind, rng.fork('layout'), flora),
        reach: 0,
      };
      for (const one of candidate.pieces) candidate.reach = Math.max(candidate.reach, Math.hypot(one.x, one.z) + 4);
      if (fits(candidate)) plan = candidate;
    }
    plans.set(id, plan);
    if (plan !== null) stats.planned++;
    return plan;
  }

  /** Clear of everything kept bare and not too steep, over a ring round it and at each piece. */
  function fits(plan: OutpostPlan): boolean {
    const p = scratchPoint;
    const heights: number[] = [];
    const probes: [number, number][] = [[0, 0]];
    for (let k = 0; k < 8; k++) probes.push([Math.cos((k / 8) * Math.PI * 2) * plan.reach, Math.sin((k / 8) * Math.PI * 2) * plan.reach]);
    for (const one of plan.pieces) probes.push([one.x, one.z]);
    for (const [x, z] of probes) {
      directionOf(plan, x, z, R, p);
      if (terrain.bareAt(p.x, p.y, p.z)) return false;
      heights.push(terrain.groundAt(p.x, p.y, p.z));
    }
    // The ring against the middle: a rough grade over the reach.
    const middle = heights[0]!;
    for (let k = 1; k <= 8; k++) if (Math.abs(heights[k]! - middle) / plan.reach > STEEPEST) return false;
    return true;
  }

  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3();
  const right = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const seatPoint = new THREE.Vector3();


    /** The lowest ground under a piece's footprint, so no side of it stands on air. */
  function seat(plan: OutpostPlan, one: OutpostPiece, r: number): number {
    let low = Infinity;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
      directionOf(plan, one.x + dx, one.z + dz, R, seatPoint);
      low = Math.min(low, terrain.groundAt(seatPoint.x, seatPoint.y, seatPoint.z));
    }
    return low;
  }

  return {
    planOf,
    stats,
    covers(key, direction) {
      // The tile's own outpost and its neighbours' on the same face: a yard
      // reaches over its tile's edge.
      const last = (1 << key.level) - 1;
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const i = key.i + di;
          const j = key.j + dj;
          if (i < 0 || j < 0 || i > last || j > last) continue;
          const plan = planOf({ face: key.face, level: key.level, i, j });
          if (plan === null) continue;
          const cos = plan.at.x * direction.x + plan.at.y * direction.y + plan.at.z * direction.z;
          if (Math.acos(Math.min(1, cos)) * R < plan.reach) return true;
        }
      }
      return false;
    },
    build(key, plan, centre, out) {
      const tile: Wall[] = [];
      const door: number[] = [];
      for (const one of plan.pieces) {
        const shape = shapeOf(one, plan.livery);
        if (shape === null) continue;
        const info = one.from === 'piece' ? PIECES[one.id] : undefined;
        const half = info === undefined ? 1 : Math.max(info.size[0], info.size[2]) * info.scale * one.scale * 0.4;
        directionOf(plan, one.x, one.z, R, up);
        // A roof sits on its module: the module's own seat, which is the plan's first piece at the same spot.
        const host = PIECES[one.id]?.role === 'roof' ? plan.pieces.find((p) => p.x === one.x && p.z === one.z && p !== one) : undefined;
        const ground = seat(plan, host ?? one, host === undefined ? half : Math.max(half, 2));
        frameAt(up, plan.yaw + one.yaw, right, forward);
        const lift = R + ground - 0.15;
        scratchUp.copy(up).multiplyScalar(lift);
        scale.setScalar(one.scale);
        matrix.makeBasis(right, up, forward).scale(scale).setPosition(scratchUp.x - centre.x, scratchUp.y - centre.y, scratchUp.z - centre.z);
        if (matrix.determinant() <= 0) continue;
        out.push({ variant: shape, matrix: matrix.clone() });
        if (one.wall > 0) {
          tile.push({ x: scratchUp.x, y: scratchUp.y, z: scratchUp.z, r: one.wall });
          if (one.from === 'piece' && PIECES[one.id]?.role !== 'power') {
            door.push(
              scratchUp.x + forward.x * (one.wall + DOOR_OUT) + up.x * DOOR_LIGHT,
              scratchUp.y + forward.y * (one.wall + DOOR_OUT) + up.y * DOOR_LIGHT,
              scratchUp.z + forward.z * (one.wall + DOOR_OUT) + up.z * DOOR_LIGHT,
            );
          }
        }
      }
      standing.add(key, plan, tile, door);
    },
    retire: standing.retire,
    lampsNear: standing.lampsNear,
    nearest: standing.nearest,
    collide: standing.collide,
  };
}
