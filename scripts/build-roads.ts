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
 * Three decisions, and all three are visible from the air the moment they are
 * wrong:
 *
 * 1. **Which pairs are candidates.** See `GRAPH`; the alternatives were measured
 *    rather than argued about, and nothing is thinned — Gabriel over the built
 *    towns is a median degree of 4 at a 260-unit spacing, where Gabriel over the
 *    gazetteer was 4.14 at 106 and was a lattice.
 * 2. **Whether the road can be built.** A road may cross a border — that is most
 *    of what makes a network read as one — but it may not cross **water** and it
 *    may not cross **scree**: *solo conexiones entre ciudades, si en ningún
 *    momento se pasa por una montaña.* Both are a walk along the road, and both
 *    can be answered by bending it; see `bendThatWorks`.
 * 3. **What a town does when nothing wants to join it.** See `rescueOrphans`:
 *    one road to the nearest built town by a dry, gentle path, for a place the
 *    proximity test left alone but the ground did not refuse.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { decodePlaces, decodeRoads, encodeRoads, inflate } from '../src/pack.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { detailRadiusFor, isShown, radiusFor } from '../src/places.ts';
import type { Place } from '../src/places.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import {
  MAX_ROAD_LENGTH,
  ROAD_CLASSES,
  bendFor,
  builtGraph,
  classOf,
  crossesScree,
  pairKey,
  placeDirection,
  roadPoint,
  roadPole,
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
 * which is what makes the relief answer at all.
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
 * How often the water test asks what is underneath, in world units.
 *
 * The strait it has to be able to see is the narrowest one a road must *not*
 * cross: Gibraltar is 14 km, which is 35 units. Sampling every 18 means two
 * samples land in any channel that wide, and one is enough. It is also the cost
 * of this script — 40 samples on a median road at 2.6 microseconds each.
 */
const PROBE_STEP = 18;

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
 * carried through the water and slope tests (2026-09-08):
 *
 * ```
 *              candidates   roads    wet   steep   towns with none   degree
 *   gabriel        20,022  17,196  1,236   1,590     733   7.5%   median 4, max 8
 *   rng            12,595  10,918    731     946     806   8.3%   median 2, max 5
 * ```
 *
 * The relative neighbourhood graph is still built, because `pnpm check` uses the
 * subgraph relation to ask the file to account for what it does not carry, and
 * `--alternatives` prints the row above. A median of 2 is a network of chains
 * and a map with no junctions in it is not a map, which is the same finding this
 * file has recorded since the 7,320-place version.
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
// The water test
// ---------------------------------------------------------------------------

const a = new Vector3();
const b = new Vector3();
const pole = new Vector3();
const point = new Vector3();

/**
 * Walks the road and asks what is underneath.
 *
 * The *bent* path, not the straight one, because the bow is baked and it is what
 * gets drawn: testing a great circle and then drawing a curve is how a road ends
 * up in a bay nobody tested. Both ends are known to be on land — `pnpm check`
 * asserts every place is — so the walk starts and finishes inside the interval.
 */
let probes = 0;
function isDry(edge: Candidate, bend: number): boolean {
  placeDirection(places[edge.a]!, a);
  placeDirection(places[edge.b]!, b);
  roadPole(a, b, pole);
  const steps = Math.max(2, Math.ceil(edge.length / PROBE_STEP));
  probes += steps - 1;
  for (let step = 1; step < steps; step++) {
    roadPoint(a, b, bend, step / steps, point, pole);
    const lat = Math.asin(Math.min(1, Math.max(-1, point.y))) / DEG;
    const lon = Math.atan2(-point.z, point.x) / DEG;
    if (world.countryAt(lat, lon) === 0) return false;
  }
  return true;
}

/**
 * Whether a bend keeps the road off ground steeper than anything is built on.
 *
 * `crossesScree` is `src/roads.ts`'s and it asks `terrain.ts`'s `MAX_SLOPE`
 * through `gradeAt` — one definition, the same one the wood, the herd and the
 * town's own cells ask, so a slope that refuses a tree cannot admit a
 * carriageway. **It moved from a load-time pass into the bake in this round**:
 * it used to run over the shipped file every time the world started, for 350 ms
 * of `reliefAt`, and a road that is refused for good is a road that should not
 * be in the file.
 *
 * It wants a `Road` and there is not one yet, so it gets the four fields a
 * candidate would have: the class matters because `gradeAt` measures over the
 * road's own half-width and a trunk is twice a lane.
 */
const probe: Road = { a: 0, b: 0, cls: 0, bend: 0 };
let slopeProbes = 0;
function isGentle(edge: Candidate, bend: number, cls: number): boolean {
  probe.a = edge.a;
  probe.b = edge.b;
  probe.cls = cls;
  probe.bend = bend;
  slopeProbes++;
  return !crossesScree(probe, places);
}

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
const townGrid: number[][] = Array.from({ length: TOWN_COLS * TOWN_ROWS }, () => []);
for (const i of built) {
  const place = places[i]!;
  const row = Math.min(TOWN_ROWS - 1, Math.max(0, Math.floor((90 - place.lat) / TOWN_CELL)));
  const col = ((Math.floor((place.lon + 180) / TOWN_CELL) % TOWN_COLS) + TOWN_COLS) % TOWN_COLS;
  townGrid[row * TOWN_COLS + col]!.push(i);
}
const townAt = new Vector3();

/**
 * Whether a bend keeps the road out of every town it does not end at.
 *
 * **A road down somebody's high street was a residue this project bounded for
 * three rounds and it is an invariant now** (2026-09-08). `roadClip` stops a
 * ribbon at the two towns it *ends* at, and the argument for the rest was that
 * a Gabriel edge cannot pass close to a third place — a place near the middle of
 * one is inside the circle that would have deleted the edge. That argument has
 * two holes, and the second one opened this round: Gabriel tests the **chord**
 * and the ribbon draws the **bow**, and `rescueOrphans` emits roads that were
 * never Gabriel candidates at all. Wollongong is ringed by mountains, so the
 * rescue joined it to Tamworth — straight through the middle of Sydney, 118
 * units inside a town of radius 150.
 *
 * So it is tested rather than argued: the drawn curve, at `PROBE_STEP`, against
 * every *built* place that is not one of its own two ends. A pair with no bend
 * that clears the towns between them is not joined, which is the right answer —
 * the road that would exist there runs through the town and joins it instead.
 */
function passesTown(edge: Candidate, bend: number): boolean {
  placeDirection(places[edge.a]!, a);
  placeDirection(places[edge.b]!, b);
  roadPole(a, b, pole);
  const steps = Math.max(2, Math.ceil(edge.length / PROBE_STEP));
  for (let step = 1; step < steps; step++) {
    roadPoint(a, b, bend, step / steps, point, pole);
    const lat = Math.asin(Math.min(1, Math.max(-1, point.y))) / DEG;
    const lon = Math.atan2(-point.z, point.x) / DEG;
    const row = Math.min(TOWN_ROWS - 1, Math.max(0, Math.floor((90 - lat) / TOWN_CELL)));
    const span = Math.ceil(1 / Math.max(0.02, Math.cos(lat * DEG)));
    const col = Math.floor((lon + 180) / TOWN_CELL);
    for (let r = Math.max(0, row - 1); r <= Math.min(TOWN_ROWS - 1, row + 1); r++) {
      for (let c = col - span; c <= col + span; c++) {
        for (const j of townGrid[r * TOWN_COLS + (((c % TOWN_COLS) + TOWN_COLS) % TOWN_COLS)]!) {
          if (j === edge.a || j === edge.b) continue;
          townAt.set(unit[j * 3]!, unit[j * 3 + 1]!, unit[j * 3 + 2]!);
          if (point.angleTo(townAt) * PLANET_RADIUS < radiusFor(places[j]!.pop)) return false;
        }
      }
    }
  }
  return true;
}

/**
 * A bow that keeps the road out of the water *and* off the mountain, or null if
 * there is none.
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
 *
 * **The mountain is the same problem and it now gets the same answer**
 * (2026-09-08). *Solo conexiones entre ciudades, si en ningún momento se pasa
 * por una montaña* — and a straight line between two towns in a valley crosses
 * the spur between them exactly the way a straight line between two towns on a
 * bay crosses the water. A real road goes round the spur. So a candidate is
 * accepted at the first bend that is **both dry and gentle**, and a pair with no
 * such bend is simply not joined.
 *
 * What that buys, measured on the shipped `places.bin` (2026-09-08): of the
 * 20,022 candidates, **3,619 are refused on their own seeded bow** — 1,691 wet
 * and a further 1,928 dry but steep — and the search recovers **793** of them,
 * 455 round water and **338 round a mountain**. What is left is 1,236 wet and
 * 1,590 steep, which is a pair with water or a mountain across *every* bend
 * inside the limit: a road that would have to be a bridge or a tunnel.
 *
 * **And the slope refusal is emphatic rather than knife-edge**, which is the
 * measurement that says the rule is doing what it claims. Over a seventh of the
 * candidates, the worst grade along a road the slope test refused: **p10 0.64,
 * median 0.97, p90 1.51, worst 2.74** against a `MAX_SLOPE` of 0.577, and only
 * 24 of 241 fall within a tenth of the threshold. These are not roads that
 * happened to graze the limit; they are roads up a mountainside.
 *
 * What it does *not* do is invent a bridge or a pass. San Francisco to Oakland
 * is 28 units straight across the bay and no bow gets round it, so the two are
 * not joined and San Francisco reaches the world down the peninsula instead; the
 * same is true of a town on the far side of a ridge. A road drawn over open
 * water with no deck under it, or up a scree face, is worse than a road that
 * goes the long way or than no road at all.
 */
const BEND_STEP = 0.045;
const BEND_TRIES = 11;
function bendThatWorks(edge: Candidate, cls: number): number | null {
  const natural = bendFor(places[edge.a]!, places[edge.b]!);
  // Cheapest test first: one `countryAt` a probe, then a grid lookup a probe,
  // then four `reliefAt` a probe.
  const works = (bend: number): boolean =>
    isDry(edge, bend) && passesTown(edge, bend) && isGentle(edge, bend, cls);
  if (works(natural)) return natural;
  // A short road may bow a third of its own length and still look like a road
  // round a headland; a long one may not, so the fraction is also capped in
  // units.
  //
  // **The ceiling came down from 0.5 to 0.3 and the reason is a mover, not a
  // road.** The bow is applied as `bend * span * sin(pi t)`, so walking `t` at a
  // constant rate runs `sqrt(1 + (bend * pi * cos(pi t))^2)` times the nominal
  // speed — 1.86 at the ends of a 0.5-bow road against 1.37 at 0.3 — and
  // `life.ts` corrects only the *mean* of that, which is why CLAUDE.md carries
  // the ripple as known and unfixed. It surfaced as a walker crossing Palma's
  // coast at **101.5 units a second against a walking speed of 45**, and the
  // honest fix is an arc-length reparameterisation of `roadPoint`, which is not
  // built. This bounds the artefact at its source instead, and what it costs is
  // measured rather than assumed: see the bake's own report.
  const limit = Math.min(0.3, Math.max(0.15, 110 / edge.length));
  for (let k = 1; k <= BEND_TRIES; k++) {
    for (const sign of [1, -1]) {
      const bend = sign * k * BEND_STEP;
      if (Math.abs(bend) > limit) continue;
      if (works(bend)) return bend;
    }
  }
  return null;
}

interface Row {
  a: number;
  b: number;
  cls: number;
  bend: number;
}

const kept: Row[] = [];
let refusedWet = 0;
let refusedThrough = 0;
let refusedSteep = 0;
let bowedRoundWater = 0;
let bowedRoundTown = 0;
let bowedRoundMountain = 0;
const testBegan = Date.now();
for (const edge of candidates) {
  const cls = classOf(places[edge.a]!.pop, places[edge.b]!.pop);
  const natural = bendFor(places[edge.a]!, places[edge.b]!);
  // Why the seeded bow failed, before the search runs, so the report can say
  // what the search rescued from each of the two.
  const naturallyWet = !isDry(edge, natural);
  const naturallyThrough = !naturallyWet && !passesTown(edge, natural);
  const naturallySteep = !naturallyWet && !naturallyThrough && !isGentle(edge, natural, cls);
  const bend = bendThatWorks(edge, cls);
  if (bend === null) {
    // Which of the three it could not get round. A pair that fails more than
    // one is counted against the test that refused it first, which is the order
    // the tests run in.
    if (naturallyWet) refusedWet++;
    else if (naturallyThrough) refusedThrough++;
    else refusedSteep++;
    continue;
  }
  if (naturallyWet) bowedRoundWater++;
  if (naturallyThrough) bowedRoundTown++;
  if (naturallySteep) bowedRoundMountain++;
  kept.push({ a: edge.a, b: edge.b, cls, bend: Number(bend.toFixed(4)) });
}
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
 * So a place with no road after the two tests gets **one**, to the nearest built
 * town it can reach by a path that is dry and gentle — the proximity test
 * ignored, `MAX_ROAD_LENGTH` and both ground tests still binding, at most one
 * road per orphan and never a second. It is the same shape as the floor of two
 * this file used to apply to the thinning, and it has one number in it, which is
 * the one.
 *
 * **What it fixes and what it deliberately does not**, audited over the shipped
 * `places.bin` (2026-09-08): of the 733 towns Gabriel and the ground left with
 * nothing, this joins 419 and leaves 314. The ones it leaves are the ones the
 * user already accepted — *si una ciudad no se puede conectar con ninguna
 * porque está encima de una montaña no pasa nada* — plus the islands, which
 * this cannot help and should not: every nearest neighbour is across water, and
 * a road over open water with no deck under it is the thing the water test
 * exists to refuse.
 */
function rescueOrphans(rows: readonly Row[]): { put: Row[]; joined: number; tried: number } {
  const degree = new Int32Array(places.length);
  for (const row of rows) {
    degree[row.a]!++;
    degree[row.b]!++;
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
    // Every built town inside the longest road this world will build, nearest
    // first: the first one with a bow that clears both tests wins.
    const near = built
      .filter((i) => i !== orphan && chord(orphan, i) <= MAX_LENGTH)
      .sort((x, y) => chord(orphan, x) - chord(orphan, y) || (identity(x) < identity(y) ? -1 : 1));
    for (const target of near) {
      const edge: Candidate = { a: Math.min(orphan, target), b: Math.max(orphan, target), length: chord(orphan, target) };
      const cls = classOf(places[edge.a]!.pop, places[edge.b]!.pop);
      const bend = bendThatWorks(edge, cls);
      if (bend === null) continue;
      put.push({ a: edge.a, b: edge.b, cls, bend: Number(bend.toFixed(4)) });
      degree[edge.a]!++;
      degree[edge.b]!++;
      joined++;
      break;
    }
  }
  return { put, joined, tried: orphans.length };
}

const rescue = rescueOrphans(kept);
const network = [...kept, ...rescue.put].sort((x, y) => x.a - y.a || x.b - y.b);

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
  `the ground: ${probes.toLocaleString()} water probes and ${slopeProbes.toLocaleString()} slope walks in ${testMs} ms`,
);
console.log(
  `  of ${candidates.length.toLocaleString()} candidates, ${refusedWet.toLocaleString()} went to sea, ` +
    `${refusedThrough.toLocaleString()} through a third town and ${refusedSteep.toLocaleString()} over a mountain`,
);
console.log(
  `  the bow saved ${bowedRoundWater.toLocaleString()} round water, ` +
    `${bowedRoundTown.toLocaleString()} round a town and ${bowedRoundMountain.toLocaleString()} round a mountain`,
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

if (dry) {
  console.log('\n--dry: nothing written');
} else {
  /**
   * Four columns, and as JSON they were 337 KB gzipped for what is a pair of
   * indices, two bits and a bow: `{"a":0,"b":48,"cls":2,"bend":-0.0007}` is
   * thirty-eight characters carrying about thirty-five bits. `src/pack.ts`
   * stores each column on its own — `a` is non-decreasing so it is delta-coded
   * to nothing, `b` is genuine entropy and pays for itself, the class is a byte
   * and the bow two — and gzips the result.
   *
   * The bake decodes what it just wrote and compares before the file lands. The
   * bow is the reason that assertion matters more here than elsewhere: it is
   * what decides whether the road crossed a bay, and the path tested for water
   * has to be the path that gets drawn.
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
