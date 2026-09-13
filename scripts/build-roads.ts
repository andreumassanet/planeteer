/**
 * Joins the built towns into a road network.
 *
 * The graph is a pure function of `places.bin` and the outlines, so it is
 * *baked* for the same three reasons `monuments.json` is: it costs a few hundred
 * thousand point-in-polygon queries to work out, the answer is identical on
 * every load, and a data file can be checked by `pnpm check` and read by a human
 * where a runtime computation can be neither.
 *
 *   node scripts/build-roads.ts        # write public/data/roads.bin
 *   node scripts/build-roads.ts --dry  # report the graph and write nothing
 *
 * **It is a graph over the 9,734 places that are *built*, not over the 29,545
 * rows of the gazetteer, and that is the whole shape of this file** (2026-09-08).
 * `builtGraph` in `src/roads.ts` carries the argument and the measurements; the
 * consequence here is that every endpoint is a town you can walk into, so the
 * network needs no prune for dead ends at unbuilt villages, no chaining through
 * hidden junctions and no floor putting a road back at an orphaned city. All of
 * that was machinery for reconstructing city-to-city connections out of a graph
 * that never held them, and it is deleted. *Solo conexiones entre ciudades.*
 *
 * Four decisions, and all four are visible from the air or from the kerb the
 * moment they are wrong:
 *
 * 1. **Which pairs are candidates.** See `GRAPH`; the alternatives were measured
 *    rather than argued about, and nothing is thinned — Gabriel over the built
 *    towns is a median degree of 4 at a 260-unit spacing, where Gabriel over the
 *    gazetteer was 4.14 at 106 and was a lattice.
 * 2. **Which gate of each town a road comes in by** (2026-09-13). A town is a
 *    square now and a road runs from a gate on one kerb to a gate on another
 *    (`courseOf`); see `candidateGates`, `gatesToward` and the second pass.
 * 3. **Whether the road can be built.** A road may cross a border — that is most
 *    of what makes a network read as one — but it may not cross **water**, it
 *    may not cross **scree**, it may not run **through a town**, its own two
 *    included, and it has to be able to **climb to both gates** at
 *    `RAMP_GRADE`: *solo conexiones entre ciudades, si en ningún momento se pasa
 *    por una montaña.* All of it is a walk along the course that will be drawn,
 *    and all of it can be answered by bending the road or by taking another
 *    gate; see `trial`.
 * 4. **What a town does when nothing wants to join it.** See `rescueOrphans`:
 *    one road to the nearest built town by a dry, gentle path, for a place the
 *    proximity test left alone but the ground did not refuse.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { decodePlaces, decodeRoads, encodeRoads, inflate, packedBend } from '../src/pack.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { detailRadiusFor, isShown, radiusFor } from '../src/places.ts';
import type { Place } from '../src/places.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import {
  APPROACH,
  MAX_ROAD_LENGTH,
  ROAD_CLASSES,
  bendFor,
  builtGraph,
  candidateGates,
  classOf,
  courseOf,
  coursePath,
  coursePoint,
  emptyCourse,
  emptyRamp,
  gateOpen,
  layersOf,
  placeDirection,
  rampOf,
  rampReach,
  roadClearance,
  screeAt,
  tightestTurn,
  townOf,
  townOffset,
  waterProbeSteps,
} from '../src/roads.ts';
import type { GraphEdge, ProximityGraph, Road } from '../src/roads.ts';

const here = dirname(fileURLToPath(import.meta.url));
const countriesPath = resolve(here, '../public/data/countries.bin');
const outlines = readFileSync(countriesPath);
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
// The lakes are a second file and the stub has to know which one is being
// asked for. It used to answer every URL with the outlines, which was fine
// while there was one; handing `decodeLakes` the outlines throws on the magic
// rather than misreading them, which is the whole reason the format carries it.
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;

const DEG = Math.PI / 180;
const dry = process.argv.includes('--dry');
/** Report the graph the relative neighbourhood rule would give, and ship nothing. */
const alternatives = process.argv.includes('--alternatives');

const places: Place[] = decodePlaces(
  await inflate(readFileSync(resolve(here, '../public/data/places.bin'))),
);

/**
 * The relief has to be the world's relief before a road can be asked to avoid a
 * mountain.
 *
 * `crossesScree` asks `gradeAt`, `gradeAt` asks `reliefAt`, and `reliefAt` is
 * flat under a monument's pad and finely sampled under a town — so the sites go
 * in first, in the order `main.ts` installs them, or the bake would refuse a
 * road across ground the game has levelled. `loadWorld` runs `prepareTerrain`,
 * which is what makes the relief answer at all. The gate levels read the same
 * relief through `elevationAt`, which is what `settlements.ts` cuts the gates
 * to.
 */
setFlattenSites(
  (JSON.parse(readFileSync(resolve(here, '../public/data/monuments.json'), 'utf8')) as {
    monuments: { id: string; iso: string; lat: number; lon: number }[];
  }).monuments,
);
setDetailSites(places.map((place) => ({ lat: place.lat, lon: place.lon, radius: detailRadiusFor(place.pop) })));

const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());

// ---------------------------------------------------------------------------
// The parameters, and what each of them is defending against
// ---------------------------------------------------------------------------

/** Longest road the network will build. `src/roads.ts` owns it; see there. */
const MAX_LENGTH = MAX_ROAD_LENGTH;

/**
 * How the candidate pairs are chosen.
 *
 * **Measured, on the real 7,320 places, before committing** — the numbers are in
 * CLAUDE.md and the summary is that the shape of the graph is the whole
 * difference between a road map and a hairball:
 *
 * - **k-nearest** is not a graph, it is a mess: it is not symmetric, a town in a
 *   cluster reaches only inside its cluster, and one in open country reaches
 *   hundreds of units for its fifth neighbour.
 * - **A minimum spanning tree** is a tree. Every road is a bridge, there is
 *   exactly one route between any two towns and no loops anywhere, and a map
 *   with no loops in it does not look like a map.
 * - **The Gabriel graph** keeps an edge when no third place lies inside the
 *   circle that has the edge as its diameter.
 * - **The relative neighbourhood graph** is stricter — it keeps an edge only
 *   when no third place is closer to *both* ends than they are to each other —
 *   and it is a subgraph of Gabriel that still contains the minimum spanning
 *   tree, so it is connected wherever Gabriel is.
 *
 * **Gabriel ships, whole, and the thinning pass that used to sit under it is
 * gone with the point set that needed it.** Over the *gazetteer* Gabriel was a
 * lattice — mean degree 4.14 at a 106-unit spacing, a quarter of the ground
 * inside a lane's own reach covered in carriageway — so half of it was dropped
 * again by a rule built on the RNG subgraph relation. Over the **built towns**
 * the same rule is a road map: 20,022 candidates, a median degree of 4 and a
 * spacing of 260 units, which is *no hace falta que conectes una ciudad con 20*
 * and nothing to thin. Measured on the shipped `places.bin`, both graphs
 * carried through the water and slope tests (2026-09-08, before roads ran gate
 * to gate):
 *
 * ```
 *              candidates   roads    wet   steep   towns with none   degree
 *   gabriel        20,022  17,196  1,236   1,590     733   7.5%   median 4, max 8
 *   rng            12,595  10,918    731     946     806   8.3%   median 2, max 5
 * ```
 *
 * The relative neighbourhood graph is still built, because `pnpm check` uses the
 * subgraph relation to ask the file to account for what it does not carry, and
 * `--alternatives` prints its candidate count. A median of 2 is a network of
 * chains and a map with no junctions in it is not a map, which is the same
 * finding this file has recorded since the 7,320-place version.
 */
type Graph = ProximityGraph;
const GRAPH: Graph = 'gabriel';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const unit = new Float64Array(places.length * 3);
const scratch = new Vector3();
places.forEach((place, i) => {
  placeDirection(place, scratch);
  unit[i * 3] = scratch.x;
  unit[i * 3 + 1] = scratch.y;
  unit[i * 3 + 2] = scratch.z;
});

/** Chord distance between two places, in world units. Monotonic in the arc. */
function chord(i: number, j: number): number {
  const dx = unit[i * 3]! - unit[j * 3]!;
  const dy = unit[i * 3 + 1]! - unit[j * 3 + 1]!;
  const dz = unit[i * 3 + 2]! - unit[j * 3 + 2]!;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) * PLANET_RADIUS;
}

// ---------------------------------------------------------------------------
// The graph
// ---------------------------------------------------------------------------

type Candidate = GraphEdge;

/**
 * Every place that is built, which is the only vertex set this file has.
 *
 * A degree averaged over the 29,545 rows of `places.bin` would be a statement
 * about the gazetteer and not about the map: 19,811 of them are not built and
 * cannot be an endpoint, so they would drag every number here to a third of
 * itself. Counted over `built`, the shape is the shape you can see.
 */
const built: number[] = [];
for (let i = 0; i < places.length; i++) if (isShown(places[i]!)) built.push(i);

function degreesOf(edges: readonly { a: number; b: number }[]): {
  mean: number;
  median: number;
  p90: number;
  max: number;
  isolated: number;
  share: string;
} {
  const count = new Int32Array(places.length);
  for (const edge of edges) {
    count[edge.a]!++;
    count[edge.b]!++;
  }
  const mine = built.map((i) => count[i]!).sort((x, y) => x - y);
  const histogram = new Int32Array(24);
  let total = 0;
  let max = 0;
  for (const value of mine) {
    total += value;
    if (value > max) max = value;
    histogram[Math.min(23, value)]!++;
  }
  const share = [...histogram]
    .map((n, degree) => [degree, n] as const)
    .filter(([, n]) => n > 0)
    .slice(0, 10)
    .map(([degree, n]) => `${degree}:${((n / mine.length) * 100).toFixed(0)}%`)
    .join(' ');
  return {
    mean: Number((total / mine.length).toFixed(2)),
    median: mine[mine.length >> 1]!,
    p90: mine[Math.floor(mine.length * 0.9)]!,
    max,
    isolated: histogram[0]!,
    share,
  };
}

/** The islands a set of edges falls into. `pnpm check` re-derives all three. */
function componentsOf(edges: readonly { a: number; b: number }[]): {
  count: number;
  largest: number;
  singles: number;
} {
  const parent = new Int32Array(places.length).map((_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[x] !== root) {
      const next = parent[x]!;
      parent[x] = root;
      x = next;
    }
    return root;
  };
  for (const edge of edges) {
    const ra = find(edge.a);
    const rb = find(edge.b);
    if (ra !== rb) parent[ra] = rb;
  }
  const sizes = new Map<number, number>();
  for (const i of built) {
    const root = find(i);
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  const sorted = [...sizes.values()].sort((x, y) => y - x);
  return { count: sorted.length, largest: sorted[0]!, singles: sorted.filter((n) => n === 1).length };
}

console.log(`places: ${places.length.toLocaleString()}, built ${built.length.toLocaleString()}`);
const began = Date.now();
// Over the built towns and nothing else; `builtGraph` in `src/roads.ts` carries
// the argument, and `pnpm check` calls the same function to re-derive this.
const kinds: Graph[] = alternatives ? ['rng', 'gabriel'] : [GRAPH];
const graphs = new Map<Graph, Candidate[]>();
for (const kind of kinds) {
  const edges = builtGraph(places, kind, MAX_LENGTH);
  graphs.set(kind, edges);
  const stats = degreesOf(edges);
  console.log(
    `  ${kind.padEnd(8)} ${edges.length.toLocaleString().padStart(7)} candidates  ` +
      `mean ${stats.mean}  median ${stats.median}  p90 ${stats.p90}  max ${stats.max}  ` +
      `isolated ${stats.isolated}`,
  );
}
const candidates = graphs.get(GRAPH)!;
console.log(`  graph built in ${Date.now() - began} ms, keeping '${GRAPH}'\n`);

// ---------------------------------------------------------------------------
// The gates
// ---------------------------------------------------------------------------

/**
 * Which of a town's gates a road may use at all, per place: `gateOpen`, the
 * same question `candidateGates` and `pnpm check` ask — the town can cut it,
 * and the approach out of it is dry and gentle.
 */
const openCache = new Map<number, boolean[]>();
function openGates(place: number): boolean[] {
  let found = openCache.get(place);
  if (found === undefined) {
    const row = places[place]!;
    found = townOf(row).gates.map((_, gate) => gateOpen(row, gate, world));
    openCache.set(place, found);
  }
  return found;
}

/**
 * A town's open gates, the gentlest turn toward `other` first: the order a road
 * tries them in when the gate it was given will not do.
 *
 * **The cost is the turn a road makes out of the gate, not `assignGates`'
 * bearing from the town's centre**, and the two only agree for a town with one
 * gate a side. For a city 212 units across, a gate near a corner sits 37
 * degrees off its own side's normal as seen from the centre, and a
 * neighbour close to the city seen from that gate can be ninety degrees round
 * — which is where the first gated bake's hairpins were: 1,788 courses on
 * their given gates turned tighter than their own ribbon, and the worst of them
 * were short roads out of Beijing, Chengdu, Guangzhou and Chongqing. So this is
 * the angle between the side's outward normal and the far town as seen from
 * the gate itself, in the town's own frame.
 */
const toward = { x: 0, z: 0 };
function gatesToward(place: number, other: number): number[] {
  const town = townOf(places[place]!);
  placeDirection(places[other]!, scratch);
  townOffset(town, scratch, toward);
  const open = openGates(place);
  return town.gates
    .map((gate, index) => {
      const dx = toward.x - gate.x;
      const dz = toward.z - gate.z;
      const delta = Math.acos(Math.max(-1, Math.min(1, (dx * gate.outX + dz * gate.outZ) / (Math.hypot(dx, dz) || 1))));
      return { index, delta };
    })
    .filter(({ index }) => open[index])
    .sort((x, y) => x.delta - y.delta || x.index - y.index)
    .map(({ index }) => index);
}

// ---------------------------------------------------------------------------
// The ground tests, on the course that will be drawn
// ---------------------------------------------------------------------------

/**
 * A grid of the built towns, so a road can be asked what it runs *through*.
 *
 * Two degrees is 558 units at the equator and the largest built radius is 150,
 * so the 3x3 block always covers the reach; the longitude span opens with the
 * cosine for the same reason `proximityGraph`'s does.
 */
const TOWN_CELL = 2;
const TOWN_COLS = Math.round(360 / TOWN_CELL);
const TOWN_ROWS = Math.round(180 / TOWN_CELL);
const builtCells: number[][] = Array.from({ length: TOWN_COLS * TOWN_ROWS }, () => []);
for (const i of built) {
  const place = places[i]!;
  const row = Math.min(TOWN_ROWS - 1, Math.max(0, Math.floor((90 - place.lat) / TOWN_CELL)));
  const col = ((Math.floor((place.lon + 180) / TOWN_CELL) % TOWN_COLS) + TOWN_COLS) % TOWN_COLS;
  builtCells[row * TOWN_COLS + col]!.push(i);
}

type Refusal = 'ramp' | 'fold' | 'wet' | 'own' | 'through' | 'steep';

interface Verdict {
  refusal: Refusal | null;
  /** How far from the nearer of its two gates the road was refused, in world units. */
  near: number;
}

const trialCourse = emptyCourse();
const trialRamp = emptyRamp();
const point = new Vector3();
const townAt = new Vector3();
const offset = { x: 0, z: 0 };
let probes = 0;
let trials = 0;

/**
 * Every test a road has to pass, on the course that will be drawn: the bow it
 * names *and* the two gates it names. The cheapest first, and the first that
 * fails is the answer.
 *
 * - **The ramps fit.** A gate is cut to a terrace and the crown has to climb
 *   from the relief to it at `RAMP_GRADE`; two gates far enough apart in height
 *   on a road short enough between them cannot both be reached, and the ribbon
 *   would stop being the law either side of the middle. No walk: two
 *   `gateLevel`s through `rampOf`, which is what the ribbon reads.
 * - **It can be drawn**: nowhere does the course turn tighter than its own
 *   ribbon is wide (`tightestTurn` against `roadClearance`), or the inner
 *   shoulder folds over itself. Two gates that face the wrong ways for a short
 *   road between them are a hairpin no handle makes gentle, and the search
 *   goes to the next gate round.
 * - **It stays dry**, at `waterProbeSteps`' stride over the whole course, both
 *   gates included — the first version of this test deleted the coast by
 *   testing a straight line, and the reason the bow is baked is that the path
 *   tested for water is the path drawn. See `bendThatWorks`.
 * - **It stays out of its own two towns** beyond its approaches: a road through
 *   a gate that faces away from where it is going swings round the square, and
 *   a swing that cuts a corner of it is a carriageway across the plots. The
 *   margin is the whole drawn half-width, `roadClearance`, or the approach
 *   where two squares nearly touch and the approach is shorter than that. It
 *   was the crown's half-width for one bake, and 156 shoulder vertices came
 *   out inside a square, 4.6 units deep at the worst (2026-09-13): a shoulder
 *   is buried in open country and is not buried against a kerb.
 * - **It stays out of every other built town**, whose whole disc it may not
 *   enter. Wollongong is ringed by mountains, so the orphan rescue once joined
 *   it to Tamworth straight down the middle of Sydney; a pair with no bend that
 *   clears the towns between them is not joined, because the road that would
 *   exist there runs through the town and joins it instead.
 * - **It crosses no scree**: `crossesScree`, through `screeAt`, which says
 *   where.
 */
function trial(road: Road): Verdict {
  trials++;
  const course = courseOf(road, places, trialCourse);
  const ramp = rampOf(road, course, places, world, trialRamp);
  if (rampReach(ramp.riseA) + rampReach(ramp.riseB) > course.length) return { refusal: 'ramp', near: 0 };
  if (tightestTurn(coursePath(course)) < roadClearance(road.cls)) return { refusal: 'fold', near: 0 };
  const townA = townOf(places[road.a]!);
  const townB = townOf(places[road.b]!);
  const margin = Math.min(roadClearance(road.cls), course.approach);
  const reachA = townA.grid.half + margin;
  const reachB = townB.grid.half + margin;
  const steps = waterProbeSteps(course);
  probes += steps + 1;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const near = Math.min(t, 1 - t) * course.length;
    coursePoint(course, t, point);
    const lat = Math.asin(Math.min(1, Math.max(-1, point.y))) / DEG;
    const lon = Math.atan2(-point.z, point.x) / DEG;
    if (world.countryAt(lat, lon) === 0) return { refusal: 'wet', near };
    if (t > course.share && t < 1 - course.share) {
      townOffset(townA, point, offset);
      if (Math.abs(offset.x) < reachA && Math.abs(offset.z) < reachA) return { refusal: 'own', near: 0 };
      townOffset(townB, point, offset);
      if (Math.abs(offset.x) < reachB && Math.abs(offset.z) < reachB) return { refusal: 'own', near: 0 };
    }
    const row = Math.min(TOWN_ROWS - 1, Math.max(0, Math.floor((90 - lat) / TOWN_CELL)));
    const span = Math.ceil(1 / Math.max(0.02, Math.cos(lat * DEG)));
    const col = Math.floor((lon + 180) / TOWN_CELL);
    for (let r = Math.max(0, row - 1); r <= Math.min(TOWN_ROWS - 1, row + 1); r++) {
      for (let c = col - span; c <= col + span; c++) {
        for (const j of builtCells[r * TOWN_COLS + (((c % TOWN_COLS) + TOWN_COLS) % TOWN_COLS)]!) {
          if (j === road.a || j === road.b) continue;
          townAt.set(unit[j * 3]!, unit[j * 3 + 1]!, unit[j * 3 + 2]!);
          if (point.angleTo(townAt) * PLANET_RADIUS < radiusFor(places[j]!.pop)) return { refusal: 'through', near };
        }
      }
    }
  }
  const steep = screeAt(road, places);
  if (steep >= 0) return { refusal: 'steep', near: Math.min(steep, 1 - steep) * course.length };
  return { refusal: null, near: Infinity };
}

/**
 * A bow that gets the road through, on the gates it already has, or null.
 *
 * **The first version tested one path and threw the road away if it was wet, and
 * that deleted the coast.** Mumbai, Hong Kong, Singapore, Barcelona, San
 * Francisco, Lisbon and Abu Dhabi came out of the bake with *no roads at all* —
 * 356 places unreachable — and the reason is not the test, it is the shape being
 * tested. Two coastal towns are joined by a great circle, and a great circle
 * between two points on a curved coast goes to sea: Barcelona to Mataro is 71
 * units along a shore and its straight line is wet for half of them.
 *
 * A road does not do that. It follows the coast. So instead of forgiving the
 * water the bake **searches for a bow that avoids it** — outward from the
 * seeded bend, alternating sign so the road stays as straight as it can, and
 * capped so that a long road cannot wander a hundred units into the interior to
 * save itself. The path that is finally drawn is the path that was tested, which
 * is the whole reason the bow lives in the data rather than in the renderer.
 * **The mountain is the same problem and gets the same answer** (2026-09-08),
 * and so does a town in the way.
 *
 * What it does *not* do is invent a bridge or a pass. San Francisco to Oakland
 * is 28 units straight across the bay and no bow gets round it, so the two are
 * not joined and San Francisco reaches the world down the peninsula instead; the
 * same is true of a town on the far side of a ridge.
 *
 * **The bow is `sin^2` over the course's middle now** (2026-09-13), flat at both
 * ends so the road still arrives square to its kerb, so the same `bend` puts
 * the apex where the old half-sine did and leaves the two approaches alone: a
 * bay beside a town is gone round by the gate, and a bay in the middle by the
 * bow.
 */
const BEND_STEP = 0.045;
const BEND_TRIES = 11;
function bendThatWorks(road: Road, length: number, natural: number): number | null {
  road.bend = natural;
  if (trial(road).refusal === null) return natural;
  // A short road may bow a third of its own length and still look like a road
  // round a headland; a long one may not, so the fraction is also capped in
  // units.
  //
  // **The ceiling came down from 0.5 to 0.3 and the reason was a mover, not a
  // road.** The old half-sine bow ran a walker at a constant `t` up to 1.86
  // times too fast at a road's ends, which surfaced as a walker crossing
  // Palma's coast at 101.5 units a second against a walking speed of 45. The
  // movers read a measured path now (`coursePath`), so the reason for this
  // ceiling is gone; raising it back toward 0.5 to recover the roads it cost
  // is a re-bake this round did not also take on, not a rejection.
  const limit = Math.min(0.3, Math.max(0.15, 110 / length));
  for (let k = 1; k <= BEND_TRIES; k++) {
    for (const sign of [1, -1]) {
      const bend = packedBend(sign * k * BEND_STEP);
      if (Math.abs(bend) > limit) continue;
      road.bend = bend;
      if (trial(road).refusal === null) return bend;
    }
  }
  return null;
}

/**
 * How far from a gate a refusal has to be for another gate to be worth trying.
 *
 * A different gate changes the road's first `APPROACH` units and bends the
 * middle's two ends; past a few approaches out it is the same road through the
 * same country, and trying every gate pair on a road refused in the middle of
 * a bay is a few hundred walks for nothing. So a road refused within this of a
 * gate — or refused because it re-entered its own square or could not climb to
 * its gates, which are always the gates' fault — tries the next gates round.
 */
const GATE_REACH = APPROACH * 5;
/** And how many gates of each town it tries, the given one first. */
const GATE_TRIES = 3;
/**
 * And how many trials the search past the given gates may spend on one road:
 * three pairs of gates' worth of bows.
 *
 * **Bounded because it stopped finishing.** The first gated bake spent 92 s on
 * every trial it ran; once the centre rule opened the coastal and steep gates
 * (2026-09-13) the same unbounded search ran past ten minutes without
 * finishing, because a town with several open gates and a road that cannot
 * leave it dry tries every pair of them with every bow, and a trial that stays
 * dry is a full-length walk at about a millisecond. The gate that works, when
 * one does, is nearly always among the first pairs by turn; `searchesCut` says
 * how often the budget ran out instead.
 */
const SEARCH_BUDGET = 3 * (2 * BEND_TRIES + 1);
let searchesCut = 0;

/**
 * A working bow and pair of gates for a road, trying the gates it was given
 * first and the next ones round when the ground near a gate refused it; null
 * when nothing works. Writes the answer into `road`.
 */
function settle(road: Road, length: number, natural: number): { bend: number; moved: boolean } | null {
  const givenA = road.gateA;
  const givenB = road.gateB;
  const first = trial({ ...road, bend: natural });
  const bend = bendThatWorks(road, length, natural);
  if (bend !== null) return { bend, moved: false };
  if (first.near > GATE_REACH) return null;
  const optionsA = [givenA, ...gatesToward(road.a, road.b).filter((g) => g !== givenA)].slice(0, GATE_TRIES);
  const optionsB = [givenB, ...gatesToward(road.b, road.a).filter((g) => g !== givenB)].slice(0, GATE_TRIES);
  const pairs: [number, number, number][] = [];
  optionsA.forEach((ga, i) => optionsB.forEach((gb, j) => {
    if (i + j > 0) pairs.push([ga, gb, i + j]);
  }));
  pairs.sort((x, y) => x[2] - y[2]);
  const started = trials;
  for (const [ga, gb] of pairs) {
    if (trials - started >= SEARCH_BUDGET) {
      searchesCut++;
      break;
    }
    road.gateA = ga;
    road.gateB = gb;
    const found = bendThatWorks(road, length, natural);
    if (found !== null) return { bend: found, moved: true };
  }
  road.gateA = givenA;
  road.gateB = givenB;
  return null;
}

// ---------------------------------------------------------------------------
// Every candidate, through its gates
// ---------------------------------------------------------------------------

interface Row {
  a: number;
  b: number;
  cls: number;
  bend: number;
  gateA: number;
  gateB: number;
  layer: number;
}

const kept: Row[] = [];
const refused: Record<Refusal | 'shut', number> = { shut: 0, ramp: 0, fold: 0, wet: 0, own: 0, through: 0, steep: 0 };
const saved: Record<Refusal, number> = { ramp: 0, fold: 0, wet: 0, own: 0, through: 0, steep: 0 };
let savedByGate = 0;
const testBegan = Date.now();
/**
 * The gates each candidate is given first: `assignTownGates` at every town
 * over every candidate that ends there. Two roads leaving a town the same way
 * get two gates rather than one, and a road only shares a gate when a town has
 * more candidates than open gates.
 */
const given = candidateGates(places, candidates, world);
{
  let shut = 0;
  for (let i = 0; i < given.length; i++) if (given[i]! < 0) shut++;
  console.log(
    `gates: ${(candidates.length * 2).toLocaleString()} candidate ends given a gate in ${Date.now() - testBegan} ms, ` +
      `${shut.toLocaleString()} at a town with none open`,
  );
}
candidates.forEach((edge, i) => {
  if (i > 0 && i % 2000 === 0) {
    console.log(
      `  ... ${i.toLocaleString()} of ${candidates.length.toLocaleString()} candidates, ` +
        `${trials.toLocaleString()} trials, ${((Date.now() - testBegan) / 1000).toFixed(0)} s`,
    );
  }
  const gateA = given[i * 2]!;
  const gateB = given[i * 2 + 1]!;
  // A town with no open gate — every one of its gates in the sea or on ground
  // too steep to cut — is a town no road can reach, and says so here.
  if (gateA < 0 || gateB < 0) {
    refused.shut++;
    return;
  }
  const cls = classOf(places[edge.a]!.pop, places[edge.b]!.pop);
  // Rounded to what the wire will carry before it is tested; see `packedBend`.
  const natural = packedBend(bendFor(places[edge.a]!, places[edge.b]!));
  const road: Road = { a: edge.a, b: edge.b, cls, bend: natural, gateA, gateB, layer: 0 };
  // Why the given gates and the seeded bow failed, before the search runs, so
  // the report can say what the search rescued from each.
  const first = trial({ ...road }).refusal;
  const found = settle(road, edge.length, natural);
  if (found === null) {
    refused[first ?? 'steep']++;
    return;
  }
  if (found.moved) savedByGate++;
  else if (first !== null) saved[first]++;
  kept.push({ ...road, bend: Number(found.bend.toFixed(4)) });
});
const testMs = Date.now() - testBegan;

// ---------------------------------------------------------------------------
// The towns nothing wanted to join
// ---------------------------------------------------------------------------

/**
 * One road for a built town the proximity test left alone.
 *
 * **A Gabriel graph can leave a town isolated and the ground has nothing to do
 * with it.** The rule is geometric — an edge survives only if no third place
 * sits in the circle on it as a diameter — so a town with a larger neighbour
 * between it and everywhere else has *every* candidate deleted before the water
 * or the slope ever sees one. That is a fact about the point set and not about
 * the terrain, and it reads as a city sitting alone in a field with roads
 * passing it on both sides.
 *
 * So a place with no road after the tests gets **one**, to the nearest built
 * town it can reach by a path that passes them all — the proximity test
 * ignored, `MAX_ROAD_LENGTH` and every ground test still binding, at most one
 * road per orphan and never a second. The orphan's gate is the one nearest the
 * bearing; the far town's is the one nearest the bearing that none of its own
 * roads already uses, so a rescue does not pile onto a gate when there is a free
 * one beside it.
 *
 * **What it fixes and what it deliberately does not**, audited over the shipped
 * `places.bin` (2026-09-08, before gates): of the 733 towns Gabriel and the
 * ground left with nothing, this joined 419 and left 314. The ones it leaves
 * are the ones the user already accepted — *si una ciudad no se puede conectar
 * con ninguna porque está encima de una montaña no pasa nada* — plus the
 * islands, which this cannot help and should not.
 */
/**
 * How many trials one orphan's rescue may spend over all the towns it tries:
 * four towns' worth, each through the orphan's two best gates and the far
 * town's best free one, with every bow.
 *
 * Bounded for the gate search's reason and more so. The centre rule opened a
 * gate at hundreds of towns that are still alone for the old reasons — every
 * neighbour across water or over a mountain — and a rescue that tries every
 * built town inside `MAX_ROAD_LENGTH` spends thousands of walks proving it,
 * most of them dry to the foot of the mountain and full length. A rescue that
 * succeeds does so at one of the nearest towns; `rescuesCut` says how many ran
 * out first.
 */
const RESCUE_BUDGET = 4 * 2 * (2 * BEND_TRIES + 1);
let rescuesCut = 0;

function rescueOrphans(rows: readonly Row[]): { put: Row[]; joined: number; tried: number } {
  const degree = new Int32Array(places.length);
  const used = new Map<number, Set<number>>();
  const use = (place: number, gate: number): void => {
    let set = used.get(place);
    if (set === undefined) used.set(place, (set = new Set()));
    set.add(gate);
  };
  for (const row of rows) {
    degree[row.a]!++;
    degree[row.b]!++;
    use(row.a, row.gateA);
    use(row.b, row.gateB);
  }
  const orphans = built.filter((i) => degree[i] === 0);
  // Largest first, so a rescue that also joins a smaller town is one the smaller
  // town does not have to make again — and so the order is a function of the
  // data rather than of `places.bin`'s own row order.
  const identity = (i: number): string => `${places[i]!.name}@${places[i]!.lat},${places[i]!.lon}`;
  orphans.sort((x, y) => places[y]!.pop - places[x]!.pop || (identity(x) < identity(y) ? -1 : 1));

  const put: Row[] = [];
  let joined = 0;
  for (const orphan of orphans) {
    if (degree[orphan]! > 0) continue;
    if (!openGates(orphan).some(Boolean)) continue;
    // Every built town inside the longest road this world will build, nearest
    // first: the first one with gates and a bow that clear every test wins.
    const near = built
      .filter((i) => i !== orphan && chord(orphan, i) <= MAX_LENGTH)
      .sort((x, y) => chord(orphan, x) - chord(orphan, y) || (identity(x) < identity(y) ? -1 : 1));
    const began = trials;
    search: for (const target of near) {
      if (trials - began >= RESCUE_BUDGET) {
        rescuesCut++;
        break;
      }
      const a = Math.min(orphan, target);
      const b = Math.max(orphan, target);
      const mine = gatesToward(orphan, target).slice(0, 2);
      const taken = used.get(target) ?? new Set<number>();
      const toward = gatesToward(target, orphan);
      const theirs = [...toward.filter((g) => !taken.has(g)), ...toward.filter((g) => taken.has(g))].slice(0, 1);
      const cls = classOf(places[a]!.pop, places[b]!.pop);
      const natural = packedBend(bendFor(places[a]!, places[b]!));
      for (const gm of mine) {
        for (const gt of theirs) {
          const road: Road = {
            a, b, cls, bend: natural,
            gateA: a === orphan ? gm : gt,
            gateB: a === orphan ? gt : gm,
            layer: 0,
          };
          const bend = bendThatWorks(road, chord(a, b), natural);
          if (bend === null) continue;
          put.push({ ...road, bend: Number(bend.toFixed(4)) });
          degree[a]!++;
          degree[b]!++;
          use(a, road.gateA);
          use(b, road.gateB);
          joined++;
          break search;
        }
      }
    }
  }
  return { put, joined, tried: orphans.length };
}

console.log(`  candidates done: ${trials.toLocaleString()} trials in ${((Date.now() - testBegan) / 1000).toFixed(0)} s`);
const rescueBegan = Date.now();
const rescue = rescueOrphans(kept);
console.log(`  rescue done in ${((Date.now() - rescueBegan) / 1000).toFixed(0)} s`);
const joinedBeforeGates = [...kept, ...rescue.put].sort((x, y) => x.a - y.a || x.b - y.b);

// ---------------------------------------------------------------------------
// The gates again, over the network that was kept
// ---------------------------------------------------------------------------

/**
 * The first assignment was over every candidate, and a candidate the ground
 * refused still took a gate from the roads beside it. So the kept network is
 * assigned again with the same function, and each road whose gates moved is
 * tried on its new pair — its own bow first, then the search — and keeps the
 * pair it already had when the new one does not pass. That cannot lose a road,
 * because the old pair is known to work, and it cannot loop, because nothing
 * is assigned a third time. What it can leave is a road on a gate another road
 * also took, which the report counts.
 */
const regate = candidateGates(places, joinedBeforeGates, world);
let moved = 0;
let stayed = 0;
const network: Row[] = joinedBeforeGates.map((row, i) => {
  const gateA = regate[i * 2]!;
  const gateB = regate[i * 2 + 1]!;
  if (gateA < 0 || gateB < 0 || (gateA === row.gateA && gateB === row.gateB)) return row;
  const road: Road = { ...row, gateA, gateB };
  const bend = bendThatWorks(road, chord(row.a, row.b), row.bend);
  if (bend === null) {
    stayed++;
    return row;
  }
  moved++;
  return { ...road, bend: Number(bend.toFixed(4)) };
});

/**
 * Which depth layer each road is drawn on; see `layersOf` in `src/roads.ts`.
 * Last, because it is a function of the whole network's geometry: every road
 * one layer behind the deepest road it overlaps that outranks it, so two roads
 * into one gate, or out of two adjacent ones, never draw one surface twice.
 */
const layersBegan = Date.now();
{
  const layers = layersOf(network, places);
  network.forEach((row, i) => {
    row.layer = layers[i]!;
  });
}
const layersMs = Date.now() - layersBegan;

// ---------------------------------------------------------------------------
// Report and write
// ---------------------------------------------------------------------------

const EARTH_KM = 6371;
function measure(rows: readonly Row[]): string {
  const degrees = degreesOf(rows);
  const islands = componentsOf(rows);
  const byClass = [0, 0, 0];
  let km = 0;
  for (const row of rows) {
    byClass[row.cls]!++;
    km += (chord(row.a, row.b) / PLANET_RADIUS) * EARTH_KM;
  }
  return (
    `  ${rows.length.toLocaleString()} roads, ${Math.round(km).toLocaleString()} km · ` +
    `${ROAD_CLASSES.map((c, k) => `${c.name} ${byClass[k]!.toLocaleString()}`).join(' · ')}\n` +
    `  degree: mean ${degrees.mean}  median ${degrees.median}  p90 ${degrees.p90}  max ${degrees.max}  ` +
    `${degrees.share}\n` +
    `  ${islands.count.toLocaleString()} components, largest ${islands.largest.toLocaleString()} towns, ` +
    `${degrees.isolated.toLocaleString()} with no road ` +
    `(${((degrees.isolated / built.length) * 100).toFixed(1)}%)`
  );
}

console.log(
  `the ground: ${trials.toLocaleString()} trials, ${probes.toLocaleString()} probes along the courses in ${testMs} ms`,
);
console.log(
  `  of ${candidates.length.toLocaleString()} candidates, ${refused.shut.toLocaleString()} end at a town with no open gate, ` +
    `${refused.ramp.toLocaleString()} cannot climb to both gates, ${refused.fold.toLocaleString()} would fold their ribbon, ` +
    `${refused.wet.toLocaleString()} went to sea, ` +
    `${refused.own.toLocaleString()} back through their own town, ${refused.through.toLocaleString()} through a third town ` +
    `and ${refused.steep.toLocaleString()} over a mountain`,
);
console.log(
  `  the bow saved ${saved.wet.toLocaleString()} round water, ${saved.through.toLocaleString()} round a town, ` +
    `${saved.steep.toLocaleString()} round a mountain, ${saved.own.toLocaleString()} round its own square and ` +
    `${saved.fold.toLocaleString()} out of a hairpin; ` +
    `another gate saved ${savedByGate.toLocaleString()}; the gate search ran out on ` +
    `${searchesCut.toLocaleString()} roads and the rescue on ${rescuesCut.toLocaleString()} towns`,
);

console.log('\njoined:');
console.log(measure(kept));

console.log(
  `\nrescued: ${rescue.tried.toLocaleString()} built towns had nothing, ` +
    `${rescue.joined.toLocaleString()} were given one road to their nearest reachable neighbour`,
);
console.log(measure(network));

// The one thing the rescue may not do is make the map worse, and this is the
// bake saying so out loud rather than a comment claiming it: it only ever adds
// an edge between two places that had no other, so nothing can be split and
// nothing can be stranded that was not.
{
  const before = componentsOf(kept);
  const after = componentsOf(network);
  const strandedBefore = degreesOf(kept).isolated;
  const strandedAfter = degreesOf(network).isolated;
  const better =
    after.count <= before.count &&
    after.largest >= before.largest &&
    strandedAfter <= strandedBefore;
  console.log(
    `  connectivity: components ${before.count} -> ${after.count}, ` +
      `largest ${before.largest.toLocaleString()} -> ${after.largest.toLocaleString()}, ` +
      `no road ${strandedBefore} -> ${strandedAfter}`,
  );
  if (!better) throw new Error('the rescue took connectivity away; see `rescueOrphans`');
}

// The gates, as they ship: how often two roads came in by one gate, and how far
// the ramps into them climb.
{
  const ends = new Map<string, number>();
  for (const row of network) {
    for (const key of [`${row.a}:${row.gateA}`, `${row.b}:${row.gateB}`]) ends.set(key, (ends.get(key) ?? 0) + 1);
  }
  let shared = 0;
  for (const count of ends.values()) if (count > 1) shared += count;
  const course = emptyCourse();
  const ramp = emptyRamp();
  const rises: number[] = [];
  for (const row of network) {
    rampOf(row, courseOf(row, places, course), places, world, ramp);
    rises.push(Math.abs(ramp.riseA), Math.abs(ramp.riseB));
  }
  rises.sort((x, y) => x - y);
  const at = (q: number): string => rises[Math.min(rises.length - 1, Math.floor(rises.length * q))]!.toFixed(2);
  console.log(
    `\ngates: ${moved.toLocaleString()} roads moved to a better gate once the network was known, ` +
      `${stayed.toLocaleString()} kept the one they had; ${shared.toLocaleString()} of ` +
      `${(network.length * 2).toLocaleString()} road ends share a gate`,
  );
  console.log(
    `  rise to the gate: median ${at(0.5)}, p90 ${at(0.9)}, p99 ${at(0.99)}, worst ${rises.at(-1)!.toFixed(2)} units ` +
      `(a ramp of ${rampReach(rises.at(-1)!).toFixed(0)} units at the worst)`,
  );
  let layered = 0;
  let deepest = 0;
  for (const row of network) {
    if (row.layer > 0) layered++;
    if (row.layer > deepest) deepest = row.layer;
  }
  console.log(
    `  depth layers: ${layered.toLocaleString()} roads drawn behind a road they overlap, ` +
      `the deepest on layer ${deepest}, in ${layersMs} ms`,
  );
}

if (dry) {
  console.log('\n--dry: nothing written');
} else {
  /**
   * Six columns, and as JSON they were 337 KB gzipped for what is a pair of
   * indices, two bits and a bow: `{"a":0,"b":48,"cls":2,"bend":-0.0007}` is
   * thirty-eight characters carrying about thirty-five bits. `src/pack.ts`
   * stores each column on its own — `a` is non-decreasing so it is delta-coded
   * to nothing, `b` is genuine entropy and pays for itself, the class is a byte,
   * the bow two, and each gate a byte — and gzips the result.
   *
   * The bake decodes what it just wrote and compares before the file lands. The
   * bow and the gates are the reason that assertion matters more here than
   * elsewhere: they decide whether the road crossed a bay, and the path tested
   * for water has to be the path that gets drawn.
   */
  const path = resolve(here, '../public/data/roads.bin');
  const packed = gzipSync(encodeRoads(places.length, GRAPH, network), { level: 9 });
  const back = decodeRoads(await inflate(packed));
  if (back.places !== places.length || back.graph !== GRAPH || JSON.stringify(back.roads) !== JSON.stringify(network)) {
    throw new Error('roads.bin does not decode back to what was baked');
  }
  writeFileSync(path, packed);
  rmSync(resolve(here, '../public/data/roads.json'), { force: true });
  console.log(`\nwrote ${path} (${(readFileSync(path).length / 1024).toFixed(0)} KB gzipped)`);
}
