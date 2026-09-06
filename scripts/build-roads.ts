/**
 * Turns the 23,866 populated places into a road network.
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
 * The three decisions it makes, and all three are visible from the air the
 * moment they are wrong:
 *
 * 1. **Which pairs get a road.** See `GRAPH` below; the alternatives were
 *    measured rather than argued about.
 * 2. **Whether the road can be built.** A road may cross a border — that is most
 *    of what makes a network read as one — but it may not cross water, and
 *    finding out costs a walk along the road asking `countryAt`. That is the
 *    expensive half of this script and it is what makes Mallorca's towns join
 *    each other and nothing else.
 * 3. **Which of the roads it could build are worth building.** See `thin`
 *    below. Gabriel over a gazetteer is a lattice — every field bounded by
 *    carriageway on three sides — and the pass that answers it drops a third of
 *    the network without moving a single connectivity number.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Vector3 } from 'three';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { decodePlaces, decodeRoads, encodeRoads, inflate } from '../src/pack.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import type { Place } from '../src/places.ts';
import { seedOf } from '../src/scenery/random.ts';
import {
  MAX_ROAD_LENGTH,
  bendFor,
  classOf,
  pairKey,
  placeDirection,
  proximityGraph,
  roadPoint,
  roadPole,
} from '../src/roads.ts';
import type { GraphEdge, ProximityGraph } from '../src/roads.ts';

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
/**
 * Write the network the water test produced, with `thin` switched off.
 *
 * It is here because the thinning was decided by a *look* and a look needs two
 * files: the same frame with the lattice and without it. Never ship the output
 * — it is 49,179 roads against 35,753 and `pnpm check`'s degree band is the
 * only thing that would notice.
 */
const unthinned = process.argv.includes('--no-thin');

const places: Place[] = decodePlaces(
  await inflate(readFileSync(resolve(here, '../public/data/places.bin'))),
);

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
 * Gabriel is what ships as the *candidate* rule and the relative neighbourhood
 * graph is not thrown away with it: `thin` below uses the subgraph relation, so
 * the edges Gabriel has that RNG does not are exactly the ones it may consider
 * dropping. See `docs/traps.md` for the degree distributions that decided this;
 * the short version is that RNG alone came out at mean degree 2.64 with 38% of
 * places on exactly two roads, which is a network of chains, and Gabriel's 4.25
 * is where the junctions are — and where the lattice is too.
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

function degreesOf(edges: readonly { a: number; b: number }[]): {
  mean: number;
  max: number;
  isolated: number;
  share: string;
} {
  const count = new Int32Array(places.length);
  for (const edge of edges) {
    count[edge.a]!++;
    count[edge.b]!++;
  }
  const histogram = new Int32Array(24);
  let total = 0;
  let max = 0;
  for (const value of count) {
    total += value;
    if (value > max) max = value;
    histogram[Math.min(23, value)]!++;
  }
  const share = [...histogram]
    .map((n, degree) => [degree, n] as const)
    .filter(([, n]) => n > 0)
    .slice(0, 9)
    .map(([degree, n]) => `${degree}:${((n / places.length) * 100).toFixed(0)}%`)
    .join(' ');
  return {
    mean: Number((total / places.length).toFixed(2)),
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
  for (let i = 0; i < places.length; i++) {
    const root = find(i);
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  const sorted = [...sizes.values()].sort((x, y) => y - x);
  return { count: sorted.length, largest: sorted[0]!, singles: sorted.filter((n) => n === 1).length };
}

console.log(`places: ${places.length.toLocaleString()}`);
const began = Date.now();
// Both graphs are built and both are kept: Gabriel is the candidate set and the
// relative neighbourhood graph is the subgraph `thin` measures it against, so
// the second one is no longer only a line in the report.
const graphs = new Map<Graph, Candidate[]>();
for (const kind of ['rng', 'gabriel'] as Graph[]) {
  const edges = proximityGraph(places, kind, MAX_LENGTH);
  graphs.set(kind, edges);
  const stats = degreesOf(edges);
  console.log(
    `  ${kind.padEnd(8)} ${edges.length.toLocaleString().padStart(7)} edges  ` +
      `mean degree ${stats.mean}  max ${stats.max}  isolated ${stats.isolated}  ${stats.share}`,
  );
}
const candidates = graphs.get(GRAPH)!;
const rngPairs = new Set<number>();
for (const edge of graphs.get('rng')!) rngPairs.add(pairKey(places.length, edge.a, edge.b));
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
 * A bow that keeps the road out of the water, or null if there is none.
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
 * What it does *not* do is invent a bridge. San Francisco to Oakland is 28 units
 * straight across the bay and no bow gets round it, so the two are not joined
 * and San Francisco reaches the world down the peninsula instead. A road drawn
 * over open water with no deck under it is worse than a road that goes the long
 * way, and the long way is what is actually there.
 */
const BEND_STEP = 0.045;
const BEND_TRIES = 11;
function bendThatWorks(edge: Candidate): number | null {
  const natural = bendFor(places[edge.a]!, places[edge.b]!);
  if (isDry(edge, natural)) return natural;
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
      if (isDry(edge, bend)) return bend;
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
let wet = 0;
let bowed = 0;
const wetBegan = Date.now();
for (const edge of candidates) {
  const bend = bendThatWorks(edge);
  if (bend === null) {
    wet++;
    continue;
  }
  if (bend !== bendFor(places[edge.a]!, places[edge.b]!)) bowed++;
  kept.push({
    a: edge.a,
    b: edge.b,
    cls: classOf(places[edge.a]!.pop, places[edge.b]!.pop),
    bend: Number(bend.toFixed(4)),
  });
}
const wetMs = Date.now() - wetBegan;

// ---------------------------------------------------------------------------
// The thinning
// ---------------------------------------------------------------------------

/**
 * Which of Gabriel's extra edges are worth having.
 *
 * **The lattice was written down as a fact about the graph and it is a fact
 * about the graph and the pen together, so this pass is half the answer and it
 * says which half.** Standing in a street in Ulm the ground inside the lane's
 * own reach came out **25.1% carriageway**, against 1 to 2% in a real country —
 * a web of roads across every field, three or four to a field, with the
 * settlements' own paving switched off. Gabriel over a gazetteer is a mean
 * degree of 4.25 at a 106-unit spacing and that is what that looks like.
 *
 * The rule has one number in it — `MIN_ROADS`, and it is a two — and every
 * clause is a measurement:
 *
 * - **A relative-neighbourhood edge stays.** RNG is a *subgraph* of Gabriel, so
 *   the edges Gabriel has and RNG does not are exactly the candidates — the
 *   diagonals of the triangulation, the third side of every field. Nothing has
 *   to be invented to find them.
 * - **A `road` or a `trunk` stays whatever the graph says.** 36,611 of the
 *   49,179 are lanes and 178 are trunks, so thinning uniformly would spend most
 *   of its cut on the 12,568 lines that carry the map from the air while
 *   leaving three quarters of the lattice on the ground. `classOf` is already
 *   the one measure of how important a road is, and a redundant link between
 *   two market towns is a road that exists; a redundant link between two
 *   hamlets is not.
 * - **A redundant lane goes** — unless it is the second road of a town that had
 *   one. RNG can leave a place joined only to its nearest neighbour however many
 *   neighbours it has, and the rule without this clause took **477 towns from
 *   more than one road to exactly one**: Wolsztyn 7 to 1, Buenaventura 5 to 1. A village on a
 *   through-road has two ends and a village on one road is a dead end, so a
 *   floor of two puts back the *shortest* dropped lane at each — the road a
 *   village would actually have — and it is close to free: **+459 roads, +0.05
 *   points of carriageway share, and the places on a single road go 842 back to
 *   365**, which is exactly what the untinned network had. Only lanes are
 *   restored, so the map from the air still does not move.
 * - **Except when dropping it would split the network**, which is the guard
 *   below and is not decoration: RNG contains the minimum spanning tree of the
 *   *places*, but the water test has already deleted 808 RNG edges that ran
 *   into the sea, so the surviving RNG is not spanning any more. Measured with
 *   the guard switched off: **438 components against 413, largest 14,641
 *   against 14,657, and 280 places with no road at all against 267.** It
 *   rescues **25 lanes of the 13,451** it considers, and with them every
 *   connectivity number in this report is bit-for-bit what the untinned network
 *   had.
 *
 * The guard is exact rather than approximate, and the reason is worth keeping:
 * the kept set only ever *grows*, so an edge that is redundant when it is
 * considered is redundant for ever. That makes the components of the thinned
 * network identical to the components of the network the water test produced —
 * not similar, identical — and `pnpm check` re-derives it rather than trusting
 * it.
 *
 * What it does not fix is written down in `docs/traps.md` with the arithmetic:
 * the floor this lever can reach at Ulm is 13.3% — a spanning forest of lanes,
 * 30% of places on a dead end — and the rest of the 25 is the width of the pen,
 * which belongs to the vehicles.
 */
const MIN_ROADS = 2;
function thin(rows: readonly Row[]): {
  kept: Row[];
  rescued: number;
  floored: number;
  considered: number;
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
  const union = (x: number, y: number): boolean => {
    const rx = find(x);
    const ry = find(y);
    if (rx === ry) return false;
    parent[rx] = ry;
    return true;
  };

  const out: Row[] = [];
  const droppable: Row[] = [];
  for (const row of rows) {
    if (row.cls !== 0 || rngPairs.has(pairKey(places.length, row.a, row.b))) {
      out.push(row);
      union(row.a, row.b);
    } else {
      droppable.push(row);
    }
  }
  // The guard walks them in a *seeded* order rather than in index order, for
  // the reason `bendFor` is seeded from the two names: which roads survive must
  // not change because a village was inserted at the head of `places.bin`. It
  // makes no difference to the count — there is no lottery left to run, so the
  // only thing this order decides is which 25 of 13,451 the guard reaches
  // first.
  droppable.sort((x, y) => dropDraw(y) - dropDraw(x));
  let rescued = 0;
  const dropped: Row[] = [];
  for (const row of droppable) {
    if (union(row.a, row.b)) {
      out.push(row);
      rescued++;
    } else {
      dropped.push(row);
    }
  }

  // The floor: a place that had more than one road keeps at least two. Shortest
  // first, because that is the road a village would actually have, and the
  // seeded draw only ever breaks a tie between two roads of the same length.
  const had = new Int32Array(places.length);
  for (const row of rows) {
    had[row.a]!++;
    had[row.b]!++;
  }
  const has = new Int32Array(places.length);
  for (const row of out) {
    has[row.a]!++;
    has[row.b]!++;
  }
  dropped.sort(
    (x, y) =>
      chord(x.a, x.b) - chord(y.a, y.b) || dropDraw(y) - dropDraw(x),
  );
  let floored = 0;
  for (const row of dropped) {
    const needsA = has[row.a]! < MIN_ROADS && had[row.a]! >= MIN_ROADS;
    const needsB = has[row.b]! < MIN_ROADS && had[row.b]! >= MIN_ROADS;
    if (!needsA && !needsB) continue;
    out.push(row);
    has[row.a]!++;
    has[row.b]!++;
    floored++;
  }

  // `pack.ts` delta-codes the `a` column, so the file wants them in order.
  out.sort((x, y) => x.a - y.a || x.b - y.b);
  return { kept: out, rescued, floored, considered: droppable.length };
}

/** A stable draw per road, from the two identities. Same law as `bendFor`. */
function dropDraw(row: Row): number {
  const pa = places[row.a]!;
  const pb = places[row.b]!;
  const first = pa.name < pb.name ? pa : pb;
  const second = pa.name < pb.name ? pb : pa;
  const seed = seedOf(
    'road-thin',
    `${first.name}@${first.lat},${first.lon}`,
    `${second.name}@${second.lat},${second.lon}`,
  );
  return (seed >>> 0) / 4294967296;
}

const tested = kept;
const thinned = unthinned
  ? { kept: tested.slice(), rescued: 0, floored: 0, considered: 0 }
  : thin(tested);
const network = thinned.kept;

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
    `lane ${byClass[0]!.toLocaleString()} · road ${byClass[1]!.toLocaleString()} · trunk ${byClass[2]!.toLocaleString()}\n` +
    `  mean degree ${degrees.mean}  max ${degrees.max}  ${degrees.share}\n` +
    `  ${islands.count.toLocaleString()} components, largest ${islands.largest.toLocaleString()} places, ` +
    `${degrees.isolated.toLocaleString()} with no road`
  );
}

console.log(`water test: ${probes.toLocaleString()} probes in ${wetMs} ms`);
console.log(
  `  ${wet.toLocaleString()} of ${candidates.length.toLocaleString()} edges went to sea ` +
    `(${((wet / candidates.length) * 100).toFixed(1)}%), ${bowed.toLocaleString()} more were bowed round it`,
);

console.log('\ntested:');
console.log(measure(tested));

console.log(
  `\nthinned: ${thinned.considered.toLocaleString()} redundant lanes considered, ` +
    `${thinned.rescued} rescued by the connectivity guard, ` +
    `${thinned.floored} put back by the floor of ${MIN_ROADS}, ` +
    `${(tested.length - network.length).toLocaleString()} dropped`,
);
console.log(measure(network));

// The three connectivity numbers are the ones that must not move, and this is
// the bake saying so out loud rather than a comment claiming it. `pnpm check`
// re-derives the same thing from the shipped file and the outlines.
{
  const before = componentsOf(tested);
  const after = componentsOf(network);
  const strandedBefore = degreesOf(tested).isolated;
  const strandedAfter = degreesOf(network).isolated;
  const same =
    before.count === after.count &&
    before.largest === after.largest &&
    strandedBefore === strandedAfter;
  console.log(
    `  connectivity ${same ? 'unmoved' : 'MOVED'}: ` +
      `components ${before.count} -> ${after.count}, ` +
      `largest ${before.largest.toLocaleString()} -> ${after.largest.toLocaleString()}, ` +
      `no road ${strandedBefore} -> ${strandedAfter}`,
  );
  if (!same) throw new Error('the thinning changed the shape of the network; see `thin`');
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
