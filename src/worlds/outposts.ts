/**
 * What stands between a world's towns, as Earth's countryside stands between
 * its own (`countryside.ts`): a homestead with its solar array and tanks, a
 * field of ground panels round a generator, a relay mast with its dish, a
 * depot of hangars and barrels, a greenhouse dome, a dig under scaffolding.
 * Without them the land between two towns was rock and nothing else for
 * kilometres, and a ship crossing it saw a desert nobody had ever walked.
 *
 * **A pure function of a tile** (`planOf`), as the countryside's plans are of
 * a cell: the finest tile's key seeds whether it holds one, which kind, where
 * and turned which way, so a tile built twice holds the same outpost and
 * every client agrees with nothing sent. At most one a tile, on
 * `OUTPOST_CHANCE` of them, and never where the world keeps bare
 * (`Terrain.bareAt`: a town's square, a road and its banks, a pad) nor on
 * ground steeper than `STEEPEST`, sampled over the whole footprint.
 *
 * **Built from the town's own kit** (`kit.ts`): the same modules, panels,
 * hangars and dishes in the civilisation's liveries (`buildingPaint`), so an
 * outpost is plainly the towns' people's, merged into its tile's mesh with
 * the rocks (`decor.ts`). Each piece is bedded on the lowest ground under it,
 * as Earth's are (`PLANT_SEATING`).
 *
 * **And a wall**, as a farmhouse is (`vegetation.collide`): the buildings'
 * circles are kept for the tiles that have been built round the traveller
 * (`collide`), so a body walks round a homestead and not through it. Panels,
 * barrels and the dig's frames are walked through, as fences are on Earth.
 */

import * as THREE from 'three';
import type { WorldSpec } from './contract.ts';
import type { Terrain } from './terrain.ts';
import type { TileKey } from './cube.ts';
import { faceDir, keyOf, tileSpan } from './cube.ts';
import { DEFAULT_ARCHITECTURE } from './contract.ts';
import { PIECES, SCATTER, buildingPaint, craftPaint, liveryOf, worldKit } from './kit.ts';
import type { Livery } from './kit.ts';
import { coarsened, paintColors } from '../models.ts';
import type { Model, Paint } from '../models.ts';
import { rngFrom } from '../scenery/random.ts';
import type { Rng } from '../scenery/random.ts';
import type { Merged } from '../merge.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { LAMP_FIELD } from '../lights.ts';

/** How many of the finest tiles hold an outpost. One in fourteen is one every three hundred units or so. */
const OUTPOST_CHANCE = 0.07;
/**
 * And on a cloud deck, whose finest tiles are four times as wide
 * (`FINEST_DECK`): about the same outposts a square kilometre, or the land
 * between a giant's towns was open cloud for kilometres.
 */
const DECK_CHANCE = 0.55;
/** How many liveries a world's outposts are painted in: each is a set of shapes built once. */
const LIVERIES = 4;
/** Steepest ground an outpost is built on, as rise over run between two of its footprint's points. */
const STEEPEST = 0.35;
/** A door's lamp: how high over the ground, and how far out from the wall. */
const DOOR_LIGHT = AVATAR_HEIGHT * 0.8;
const DOOR_OUT = 1.2;
/** Most triangles a building keeps out here: far enough from a street that its finest detail is never seen close. */
const BUILDING_TRIANGLES = 1600;
/** And a prop or a plant. */
const PROP_TRIANGLES = 420;

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
function kindsOf(spec: WorldSpec): { item: OutpostKind; weight: number }[] {
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

function layout(kind: OutpostKind, rng: Rng, flora: readonly string[]): OutpostPiece[] {
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
  /**
   * The outposts standing, by their tile's key: the plan, its walls (world
   * positions and radii) and its door lamps (flat x, y, z). An entry comes
   * with its tile's decoration and goes when the ground lets the tile go
   * (`retire`), so the lists are the outposts drawn and no more.
   */
  const standing = new Map<string, { plan: OutpostPlan; walls: { x: number; y: number; z: number; r: number }[]; lamps: number[] }>();
  const stats = { planned: 0, built: 0, walls: 0 };
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

  /** A kit piece's arrays at its drawn size, feet on y = 0 and centred; one per livery. */
  const shapes = new Map<string, Merged | null>();
  function shapeOf(one: OutpostPiece, livery: number): Merged | null {
    const cacheKey = `${one.from}:${one.id}:${one.from === 'piece' ? livery : 0}`;
    if (shapes.has(cacheKey)) return shapes.get(cacheKey)!;
    const kit = worldKit();
    const made = kit?.pieces.get(one.id);
    const size = one.from === 'piece' ? PIECES[one.id]?.scale : SCATTER[one.id]?.scale;
    if (made === undefined || size === undefined) {
      shapes.set(cacheKey, null);
      return null;
    }
    const most = one.from === 'piece' ? BUILDING_TRIANGLES : PROP_TRIANGLES;
    let model: Pick<Model, 'geometry' | 'slot' | 'slots' | 'defaults'> = made.model;
    if (made.model.triangles > most) {
      const coarse = coarsened(made.model.geometry, made.model.slot, most);
      model = { geometry: coarse.geometry, slot: coarse.slot, slots: made.model.slots, defaults: made.model.defaults };
    }
    const paint: Paint = one.from === 'piece' ? buildingPaint(one.id, liveries[livery]!) : craftPaint(liveries[livery]!);
    const colors = paintColors(model as Model, paint);
    const geometry = model.geometry.index === null ? model.geometry : model.geometry.toNonIndexed();
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = model.geometry.index;
    const box = made.model.box;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    // A roof piece stands where the pack put it, over its module's floor.
    const floor = PIECES[one.id]?.role === 'roof' ? 0 : box.min.y;
    const out: Merged = {
      position: new Float32Array(position.count * 3),
      normal: new Float32Array(position.count * 3),
      color: new Float32Array(position.count * 3),
      outline: new Float32Array(position.count * 3),
      triangles: position.count / 3,
    };
    for (let v = 0; v < position.count; v++) {
      out.position[v * 3] = (position.getX(v) - (PIECES[one.id]?.role === 'roof' ? 0 : cx)) * size;
      out.position[v * 3 + 1] = (position.getY(v) - floor) * size;
      out.position[v * 3 + 2] = (position.getZ(v) - (PIECES[one.id]?.role === 'roof' ? 0 : cz)) * size;
      out.normal[v * 3] = normal.getX(v);
      out.normal[v * 3 + 1] = normal.getY(v);
      out.normal[v * 3 + 2] = normal.getZ(v);
      const source = index === null ? v : index.getX(v);
      out.color[v * 3] = colors[source * 3]!;
      out.color[v * 3 + 1] = colors[source * 3 + 1]!;
      out.color[v * 3 + 2] = colors[source * 3 + 2]!;
    }
    shapes.set(cacheKey, out);
    return out;
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
      const tile: { x: number; y: number; z: number; r: number }[] = [];
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
      const id = keyOf(key);
      if (!standing.has(id)) {
        stats.built++;
        stats.walls += tile.length;
      }
      standing.set(id, { plan, walls: tile, lamps: door });
    },
    retire(key) {
      const id = keyOf(key);
      const gone = standing.get(id);
      if (gone === undefined) return;
      stats.walls -= gone.walls.length;
      standing.delete(id);
    },
    lampsNear(point, out, from, max) {
      let n = from;
      const length = point.length();
      for (const { plan, lamps } of standing.values()) {
        // Only the outposts whose lamps can reach the point at all.
        if (plan.at.dot(point) / length < 1 - 0.5 * ((plan.reach + LAMP_FIELD) / R) ** 2) continue;
        for (let k = 0; k < lamps.length && n < max; k += 3) {
          const d = Math.hypot(lamps[k]! - point.x, lamps[k + 1]! - point.y, lamps[k + 2]! - point.z);
          if (d >= LAMP_FIELD) continue;
          out[n * 4] = lamps[k]!;
          out[n * 4 + 1] = lamps[k + 1]!;
          out[n * 4 + 2] = lamps[k + 2]!;
          out[n * 4 + 3] = d;
          n++;
        }
      }
      return n;
    },
    nearest(point, kind) {
      let best: OutpostPlan | null = null;
      let most = -2;
      const length = point.length();
      for (const { plan } of standing.values()) {
        if (kind !== undefined && plan.kind !== kind) continue;
        const cos = plan.at.dot(point) / length;
        if (cos > most) [best, most] = [plan, cos];
      }
      return best;
    },
    collide(position, radius) {
      let moved = false;
      for (const { plan, walls } of standing.values()) {
        // Only the outposts within reach.
        const cos = plan.at.dot(position) / position.length();
        if (cos < 1 - 0.5 * ((plan.reach + radius + 4) / R) ** 2) continue;
        for (const wall of walls) {
          // Across the ground only: the wall's foot and the body's differ in height.
          const keep = position.length();
          scratchUp.copy(position).divideScalar(keep);
          scratchPoint.set(position.x - wall.x, position.y - wall.y, position.z - wall.z);
          scratchPoint.addScaledVector(scratchUp, -scratchPoint.dot(scratchUp));
          const min = wall.r + radius;
          const d2 = scratchPoint.lengthSq();
          if (d2 >= min * min) continue;
          if (d2 < 1e-8) scratchPoint.set(scratchUp.y, -scratchUp.x, 0.3).addScaledVector(scratchUp, -scratchUp.dot(scratchPoint));
          position.addScaledVector(scratchPoint.normalize(), min - Math.sqrt(d2)).setLength(keep);
          moved = true;
        }
      }
      return moved;
    },
  };
}
