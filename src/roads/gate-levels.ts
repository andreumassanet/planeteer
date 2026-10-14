import * as THREE from 'three';
import type { World } from '../geo.ts';
import { isShown, prominenceVersion } from '../places.ts';
import type { Place } from '../places.ts';
import { GROUND_LIFT, RAMP_GRADE, cellKey } from '../scenery/ground.ts';
import { gateUsable, groundOf, offsetDirection, townTerraces } from '../scenery/grid.ts';
import type { TownGround } from '../scenery/grid.ts';
import { courseOf, emptyCourse } from './course.ts';
import { RIBBON_LIFT, rampReach } from './crown.ts';
import { coursePath } from './path.ts';
import { townOf } from './town.ts';
import type { Road } from './types.ts';

/**
 * The level each town cuts its gates to, and the gates it may raise only so
 * far for its roads' sake. `settlements.ts` and the roads both ask here, so
 * the paving and the ramp that climbs to it agree.
 */

const gateProbe = new THREE.Vector3();

/** Per place and gate, the level `gateHeight` found; reset whenever the held gates change. */
let gateHeights = new WeakMap<Place, Map<number, number | null>>();

/**
 * The level a town cuts one of its gates to, above sea level, or null where
 * it cannot cut one: `gateLevel` asked the question `settlements.ts` asks of
 * the same cells. The paving a road climbs to is this plus `GROUND_LIFT`.
 */
export function gateHeight(place: Place, gate: number, world: World): number | null {
  const held = heldGates(place);
  let known = gateHeights.get(place);
  if (known === undefined) {
    known = new Map();
    gateHeights.set(place, known);
  }
  const cached = known.get(gate);
  if (cached !== undefined) return cached;
  const level = levelAt(place, gate, world, held);
  known.set(gate, level);
  return level;
}

/** The whole town's terraces for `levelAt`, kept per place for the held map they were worked out with. */
const terraceCache = new WeakMap<Place, { world: World; held: ReadonlyMap<number, number> | undefined; ground: TownGround; levels: Map<number, number | null> }>();

function levelAt(place: Place, gate: number, world: World, held?: ReadonlyMap<number, number>): number | null {
  const town = townOf(place);
  const which = town.gates[gate];
  if (which === undefined) return null;
  let known = terraceCache.get(place);
  if (known === undefined || known.world !== world || known.held !== held) {
    const base = Math.max(0, world.elevationAt(town.up));
    const ground = groundOf(
      town.grid,
      (x, z) => world.elevationAt(offsetDirection(town.up, town.across, town.north, x, z, gateProbe)),
      base,
    );
    known = { world, held, ground, levels: townTerraces(town.grid, ground, held) };
    if (held === undefined || held.size === 0 || [...held.values()].every(Number.isFinite)) terraceCache.set(place, known);
  }
  return gateUsable(known.ground, which) ? known.levels.get(cellKey(which.cells[0]![0], which.cells[0]![1])) ?? null : null;
}

/**
 * The gates a town may raise only so far, as the highest level for each of
 * their cells by `cellKey`.
 *
 * Making a town's streets climbable raises cells (`climbable` in
 * `scenery/grid.ts`), and a raised gate is a longer climb for its road.
 * `roads.bin` was baked against the gates as the hill cut them, so a road
 * whose two ramps would meet with both towns raised has its gates held: each
 * at most at the level the bake knew plus its share of the road's spare
 * length (`gateCaps`). Empty until a network is registered (`holdGates`);
 * the bake and the grid's own checks raise every gate.
 */
interface HeldNetwork {
  roads: readonly Road[];
  places: readonly Place[];
  world: World;
  version: number;
  index: Map<Place, number>;
  ends: Map<number, number[]>;
  caps: Map<number, readonly [number, number]>;
  held: WeakMap<Place, Map<number, number>>;
}
let network: HeldNetwork | null = null;

/** Registers the network the gates are held against; idempotent for the same one. */
export function holdGates(roads: readonly Road[], places: readonly Place[], world: World): void {
  if (network !== null && network.roads === roads && network.places === places && network.world === world) return;
  const index = new Map<Place, number>();
  places.forEach((place, i) => index.set(place, i));
  const ends = new Map<number, number[]>();
  roads.forEach((road, r) => {
    for (const end of [road.a, road.b]) {
      const list = ends.get(end) ?? [];
      list.push(r);
      ends.set(end, list);
    }
  });
  network = {
    roads, places, world, version: prominenceVersion(), index, ends,
    caps: new Map(), held: new WeakMap(),
  };
  gateHeights = new WeakMap();
}

const heldCourse = emptyCourse();

/** A gate's level with its own cells held where the hill cut them: the level the bake knew. */
function bakedLevel(place: Place, gate: number, world: World): number | null {
  const cells = townOf(place).gates[gate]?.cells ?? [];
  return levelAt(place, gate, world, new Map(cells.map(([col, row]) => [cellKey(col, row), -Infinity])));
}

/**
 * How high each end's gate of a road may be raised, as a level (Infinity for
 * no limit), so that its two ramps do not meet: no limit where they would not
 * with both towns raised; otherwise each end gets the level the bake knew and
 * half of what the road's length has to spare, plus the other end's unused
 * half.
 */
function gateCaps(net: HeldNetwork, r: number): readonly [number, number] {
  const known = net.caps.get(r);
  if (known !== undefined) return known;
  const road = net.roads[r]!;
  courseOf(road, net.places, heldCourse);
  const length = coursePath(heldCourse).length;
  const raw: (number | null)[] = [null, null];
  const baked: (number | null)[] = [null, null];
  const ground = [0, 0];
  let reach = 0;
  for (const end of [0, 1] as const) {
    const place = net.places[end === 0 ? road.a : road.b]!;
    const gate = end === 0 ? road.gateA : road.gateB;
    if (!isShown(place)) continue;
    ground[end] = net.world.elevationAt(end === 0 ? heldCourse.gateA : heldCourse.gateB) + RIBBON_LIFT - GROUND_LIFT;
    raw[end] = levelAt(place, gate, net.world);
    if (raw[end] !== null) reach += rampReach(raw[end]! - ground[end]!);
  }
  let caps: readonly [number, number] = [Infinity, Infinity];
  if (reach > length) {
    // A hair short of the whole length, so the two ramps do not meet at the middle by rounding.
    let spare = (length - 0.5) * RAMP_GRADE;
    for (const end of [0, 1] as const) {
      const place = net.places[end === 0 ? road.a : road.b]!;
      baked[end] = isShown(place) ? bakedLevel(place, end === 0 ? road.gateA : road.gateB, net.world) : null;
      if (baked[end] !== null) spare -= Math.abs(baked[end]! - ground[end]!);
    }
    spare = Math.max(0, spare);
    const want = [0, 1].map((end) => (raw[end] !== null && baked[end] !== null ? Math.max(0, raw[end]! - baked[end]!) : 0));
    const give = [0, 1].map((end) => Math.min(want[end]!, spare * 0.5 + Math.max(0, spare * 0.5 - want[1 - end]!)));
    caps = [
      baked[0] === null ? Infinity : baked[0]! + give[0]!,
      baked[1] === null ? Infinity : baked[1]! + give[1]!,
    ];
  }
  net.caps.set(r, caps);
  return caps;
}

/** The highest each held gate cell of `place` may be raised to, by `cellKey`, or undefined where none is held or no network is registered. */
export function heldGates(place: Place): ReadonlyMap<number, number> | undefined {
  const net = network;
  if (net === null) return undefined;
  if (net.version !== prominenceVersion()) {
    net.version = prominenceVersion();
    net.caps.clear();
    net.held = new WeakMap();
    gateHeights = new WeakMap();
  }
  const known = net.held.get(place);
  if (known !== undefined) return known.size > 0 ? known : undefined;
  const held = new Map<number, number>();
  const i = net.index.get(place);
  if (i !== undefined) {
    const town = townOf(place);
    for (const r of net.ends.get(i) ?? []) {
      const caps = gateCaps(net, r);
      const road = net.roads[r]!;
      for (const [end, gate, cap] of [[road.a, road.gateA, caps[0]], [road.b, road.gateB, caps[1]]] as const) {
        if (end !== i || cap === Infinity) continue;
        for (const [col, row] of town.gates[gate]?.cells ?? []) {
          const key = cellKey(col, row);
          held.set(key, Math.min(held.get(key) ?? Infinity, cap));
        }
      }
    }
  }
  net.held.set(place, held);
  return held.size > 0 ? held : undefined;
}
