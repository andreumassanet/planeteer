/**
 * Joins the built towns into a road network and writes `public/data/roads.bin`.
 *
 *   node scripts/build-roads.ts        # write public/data/roads.bin
 *   node scripts/build-roads.ts --dry  # report the graph and write nothing
 *
 * The graph is a pure function of `places.bin` and the outlines, baked
 * because it costs hundreds of thousands of point-in-polygon queries and
 * `pnpm check` can verify a data file. It is a graph over the built towns
 * only (`builtGraph`), so every endpoint is a town you can walk into.
 *
 * 1. Candidate pairs: the Gabriel graph over the built towns (see `GRAPH`).
 * 2. Gates: each road runs from a gate on one town's kerb to a gate on the
 *    other's; `candidateGates` gives the first pair, the search tries others.
 * 3. Ground: a road may not cross water (but for one short bridge), scree, a
 *    town (its own two included) or a landmark, and must be able to climb to
 *    both gates. Every test walks the course that will be drawn, and a road
 *    can pass by bowing or by taking another gate (`trial.ts`).
 * 4. Orphans: a built town the proximity graph left alone gets one road to its
 *    nearest reachable neighbour (`rescue.ts`).
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadLakes, loadWorld } from '../src/geo.ts';
import { decodePlaces, decodeRoads, encodeRoads, inflate, packedBend } from '../src/pack.ts';
import { PLANET_RADIUS, UNITS_PER_DEGREE } from '../src/globe.ts';
import { terrainSiteOf } from '../src/places.ts';
import type { Place } from '../src/places.ts';
import { setDetailSites, setFlattenSites } from '../src/terrain.ts';
import type { FlattenSite } from '../src/terrain.ts';
import { setLandmarks } from '../src/landmark-ground.ts';
import type { LandmarkSite } from '../src/landmark-ground.ts';
import { classOf } from '../src/roads/classes.ts';
import { candidateGates } from '../src/roads/gates.ts';
import { MAX_ROAD_LENGTH, bendFor, builtGraph } from '../src/roads/graph.ts';
import type { GraphEdge, ProximityGraph } from '../src/roads/graph.ts';
import { layersOf } from '../src/roads/overlap.ts';
import type { Road } from '../src/roads/types.ts';
import { createBakeContext } from './build-roads/context.ts';
import type { Row } from './build-roads/context.ts';
import { degreesOf } from './build-roads/graph-stats.ts';
import { assertConnectivity, measure, reportGates, reportGround } from './build-roads/report.ts';
import { rescueOrphans } from './build-roads/rescue.ts';
import { createRoadTrials } from './build-roads/trial.ts';
import type { Refusal } from './build-roads/trial.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outlines = readFileSync(resolve(here, '../public/data/countries.bin'));
const lakes = readFileSync(resolve(here, '../public/data/lakes.bin'));
// The world loader fetches two files; answer each with its own bytes.
globalThis.fetch = (async (url: string) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => (String(url).includes('lakes') ? lakes : outlines),
})) as unknown as typeof fetch;

const dry = process.argv.includes('--dry');
/** Also report the relative neighbourhood graph's candidates. */
const alternatives = process.argv.includes('--alternatives');

const places: Place[] = decodePlaces(
  await inflate(readFileSync(resolve(here, '../public/data/places.bin'))),
);

// The relief must be the game's before a road is asked to avoid a mountain:
// flattened under landmarks and detailed under towns, installed in the order
// `main.ts` installs them. The landmarks also shut gates and keep roads off
// (`gateUnderLandmark`, `landmarkAt`); `pnpm check` registers the same file.
const landmarks = (JSON.parse(readFileSync(resolve(here, '../public/data/monuments.json'), 'utf8')) as {
  monuments: (FlattenSite & LandmarkSite & { id: string })[];
}).monuments;
setFlattenSites(landmarks);
setLandmarks(landmarks, PLANET_RADIUS);
setDetailSites(places.map(terrainSiteOf));

const world = await loadWorld(UNITS_PER_DEGREE, await loadLakes());
const ctx = createBakeContext(places, world);

/**
 * How the candidate pairs are chosen. Over the built towns Gabriel is a
 * median degree of 4, which reads as a road map; the relative neighbourhood
 * graph is a median of 2, a network of chains. `pnpm check` still uses the
 * subgraph relation between them to account for what the file leaves out.
 */
const GRAPH: ProximityGraph = 'gabriel';

// ---------------------------------------------------------------------------
// The candidates
// ---------------------------------------------------------------------------

console.log(`places: ${places.length.toLocaleString()}, built ${ctx.built.length.toLocaleString()}`);
const began = Date.now();
const kinds: ProximityGraph[] = alternatives ? ['rng', 'gabriel'] : [GRAPH];
const graphs = new Map<ProximityGraph, GraphEdge[]>();
for (const kind of kinds) {
  const edges = builtGraph(places, kind, MAX_ROAD_LENGTH);
  graphs.set(kind, edges);
  const stats = degreesOf(ctx, edges);
  console.log(
    `  ${kind.padEnd(8)} ${edges.length.toLocaleString().padStart(7)} candidates  ` +
      `mean ${stats.mean}  median ${stats.median}  p90 ${stats.p90}  max ${stats.max}  ` +
      `isolated ${stats.isolated}`,
  );
}
const candidates = graphs.get(GRAPH)!;
console.log(`  graph built in ${Date.now() - began} ms, keeping '${GRAPH}'\n`);

// ---------------------------------------------------------------------------
// Every candidate, through its gates
// ---------------------------------------------------------------------------

const trials = createRoadTrials(ctx);
const kept: Row[] = [];
const refused: Record<Refusal | 'shut', number> = { shut: 0, ramp: 0, fold: 0, wet: 0, own: 0, through: 0, landmark: 0, steep: 0 };
const saved: Record<Refusal, number> = { ramp: 0, fold: 0, wet: 0, own: 0, through: 0, landmark: 0, steep: 0 };
let savedByGate = 0;
const testBegan = Date.now();
// The gates each candidate is given first: two roads leaving a town the same
// way get two gates, and share one only when the town has too few open.
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
        `${trials.trials.toLocaleString()} trials, ${((Date.now() - testBegan) / 1000).toFixed(0)} s`,
    );
  }
  const gateA = given[i * 2]!;
  const gateB = given[i * 2 + 1]!;
  // A town with no open gate is a town no road can reach.
  if (gateA < 0 || gateB < 0) {
    refused.shut++;
    return;
  }
  const cls = classOf(places[edge.a]!, places[edge.b]!);
  // Rounded to what the wire carries before it is tested; see `packedBend`.
  const natural = packedBend(bendFor(places[edge.a]!, places[edge.b]!));
  const road: Road = { a: edge.a, b: edge.b, cls, bend: natural, gateA, gateB, layer: 0, bridgeFrom: 0, bridgeTo: 0 };
  // Why the given gates and seeded bow failed, so the report can say what the search rescued.
  const first = trials.trial({ ...road }).refusal;
  const found = trials.settle(road, edge.length, natural);
  if (found === null) {
    refused[first ?? 'steep']++;
    return;
  }
  if (found.moved) savedByGate++;
  else if (first !== null) saved[first]++;
  kept.push({ ...road, bend: Number(found.bend.toFixed(4)) });
});
const testMs = Date.now() - testBegan;

console.log(`  candidates done: ${trials.trials.toLocaleString()} trials in ${((Date.now() - testBegan) / 1000).toFixed(0)} s`);
const rescueBegan = Date.now();
const rescue = rescueOrphans(ctx, trials, kept);
console.log(`  rescue done in ${((Date.now() - rescueBegan) / 1000).toFixed(0)} s`);
const joinedBeforeGates = [...kept, ...rescue.put].sort((x, y) => x.a - y.a || x.b - y.b);

// ---------------------------------------------------------------------------
// The gates again, over the network that was kept
// ---------------------------------------------------------------------------

// A refused candidate still took a gate in the first assignment, so the kept
// network is assigned again; a road whose gates moved keeps its old pair when
// the new one fails, so this cannot lose a road and runs only once.
const regate = candidateGates(places, joinedBeforeGates, world);
let moved = 0;
let stayed = 0;
const network: Row[] = joinedBeforeGates.map((row, i) => {
  const gateA = regate[i * 2]!;
  const gateB = regate[i * 2 + 1]!;
  if (gateA < 0 || gateB < 0 || (gateA === row.gateA && gateB === row.gateB)) return row;
  const road: Road = { ...row, gateA, gateB };
  const bend = trials.bendThatWorks(road, ctx.chord(row.a, row.b), row.bend);
  if (bend === null) {
    stayed++;
    return row;
  }
  moved++;
  return { ...road, bend: Number(bend.toFixed(4)) };
});

// The depth layers last: a function of the whole network's geometry (`layersOf`).
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

reportGround({
  trials: trials.trials,
  probes: trials.probes,
  testMs,
  candidates: candidates.length,
  refused,
  saved,
  savedByGate,
  searchesCut: trials.searchesCut,
  rescuesCut: rescue.cut,
});
console.log('\njoined:');
console.log(measure(ctx, kept));
console.log(
  `\nrescued: ${rescue.tried.toLocaleString()} built towns had nothing, ` +
    `${rescue.joined.toLocaleString()} were given one road to their nearest reachable neighbour`,
);
console.log(measure(ctx, network));
assertConnectivity(ctx, kept, network);
reportGates(ctx, network, moved, stayed, layersMs);

if (dry) {
  console.log('\n--dry: nothing written');
} else {
  // Columnar and gzipped (`src/pack.ts`). Decoded back and compared before the
  // file lands: the bow and the gates decide whether a road crossed water, so
  // the path tested must be the path drawn.
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
