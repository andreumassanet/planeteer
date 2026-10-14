import type { Frontier } from './types.ts';
import { H_EDGES, NX, NY, VX, hEdge, vEdge, vertex } from './lattice.ts';
import { type Directed, directedEdges, loopArea, loopsOf, regionsOf } from './loops.ts';
import { CHAIKIN, SIMPLIFY, chaikin, corners, midpoints, simplify, smoothClosed } from './smoothing.ts';

interface Polyline {
  /** Lattice vertices, first to last; a closed one does not repeat its first. */
  vertices: number[];
  closed: boolean;
  /** Nations either side (0-based, -1 outside), when this is a frontier. */
  frontier: [number, number] | null;
  points: number[][];
}

/** The rings of every nation and the lines between two nations. */
export interface Outlines {
  rings: number[][][][];
  frontiers: Frontier[];
}

/** The undirected boundary between regions, and the vertices where its polylines meet. */
interface Boundary {
  isBoundary: Uint8Array;
  degree: Uint8Array;
  incident: (v: number) => number[];
  endsOf: (e: number) => [number, number];
  sidesOf: (e: number) => [number, number];
}

interface Traced {
  polylines: Polyline[];
  polyOf: Int32Array;
  indexIn: Int32Array;
}

/** Cuts the sphere into tiles until none holds a hole, and returns the directed edges and the loops of the result. */
function cutTiles(labels: Int16Array): { edges: Directed; loops: number[][] } {
  const cuts: number[][] = [
    [NX / 4, NX / 2, (3 * NX) / 4],
    [NX / 4, NX / 2, (3 * NX) / 4],
  ];
  let region = regionsOf(labels, cuts);
  let edges = directedEdges(region);
  let loops = loopsOf(edges);
  for (let pass = 0; pass < 64; pass++) {
    let holes = 0;
    for (const loop of loops) {
      if (loopArea(edges, loop) <= 0) continue;
      // A hole. The cell on the left of its first edge is inside it, and a
      // meridian along that cell's west side splits the tile through the
      // hole, so neither half holds it.
      const k = loop[0]!;
      const from = edges.from[k]!;
      const d = edges.dir[k]!;
      // Left of a directed edge is a quarter turn anticlockwise from its heading.
      const li = (from % VX) + (d === 0 ? 0 : d === 1 ? -1 : d === 2 ? -1 : 0);
      const lj = Math.floor(from / VX) + (d === 0 ? 0 : d === 1 ? 0 : d === 2 ? -1 : -1);
      const ci = Math.min(NX - 1, Math.max(0, li));
      const cj = Math.min(NY - 1, Math.max(0, lj));
      const h = cj < NY / 2 ? 0 : 1;
      const column = ci === 0 ? 1 : ci;
      if (!cuts[h]!.includes(column)) {
        cuts[h]!.push(column);
        holes++;
      }
    }
    if (holes === 0) break;
    region = regionsOf(labels, cuts);
    edges = directedEdges(region);
    loops = loopsOf(edges);
  }
  return { edges, loops };
}

/** The undirected boundary, and the vertices where three or more edges of it meet: the junctions every polyline runs between. */
function boundaryOf(edges: Directed, labels: Int16Array): Boundary {
  // The undirected boundary, and the vertices where three or more edges of it
  // meet: the junctions every polyline runs between.
  const isBoundary = new Uint8Array(H_EDGES + VX * NY);
  for (let k = 0; k < edges.count; k++) isBoundary[edges.edge[k]!] = 1;
  const degree = new Uint8Array(VX * (NY + 1));
  const incident = (v: number): number[] => {
    const i = v % VX;
    const j = Math.floor(v / VX);
    const list: number[] = [];
    if (i > 0 && isBoundary[hEdge(i - 1, j)]) list.push(hEdge(i - 1, j));
    if (i < NX && isBoundary[hEdge(i, j)]) list.push(hEdge(i, j));
    if (j > 0 && isBoundary[vEdge(i, j - 1)]) list.push(vEdge(i, j - 1));
    if (j < NY && isBoundary[vEdge(i, j)]) list.push(vEdge(i, j));
    return list;
  };
  const endsOf = (e: number): [number, number] => {
    if (e < H_EDGES) {
      const i = e % NX;
      const j = Math.floor(e / NX);
      return [vertex(i, j), vertex(i + 1, j)];
    }
    const f = e - H_EDGES;
    const i = f % VX;
    const j = Math.floor(f / VX);
    return [vertex(i, j), vertex(i, j + 1)];
  };
  for (let e = 0; e < isBoundary.length; e++) {
    if (!isBoundary[e]) continue;
    const [a, b] = endsOf(e);
    degree[a]!++;
    degree[b]!++;
  }
  /** The nations either side of an undirected edge, -1 outside the lattice. */
  const sidesOf = (e: number): [number, number] => {
    if (e < H_EDGES) {
      const i = e % NX;
      const j = Math.floor(e / NX);
      return [j > 0 ? labels[(j - 1) * NX + i]! : -1, j < NY ? labels[j * NX + i]! : -1];
    }
    const f = e - H_EDGES;
    const i = f % VX;
    const j = Math.floor(f / VX);
    return [i > 0 ? labels[j * NX + i - 1]! : -1, i < NX ? labels[j * NX + i]! : -1];
  };
  return { isBoundary, degree, incident, endsOf, sidesOf };
}

/** Polylines, each undirected boundary edge in exactly one, smoothed. */
function tracePolylines({ isBoundary, degree, incident, endsOf, sidesOf }: Boundary): Traced {
  // Polylines, each undirected boundary edge in exactly one.
  const polyOf = new Int32Array(isBoundary.length).fill(-1);
  const indexIn = new Int32Array(isBoundary.length);
  const polylines: Polyline[] = [];
  const trace = (start: number, first: number): void => {
    const id = polylines.length;
    const vertices = [start];
    let v = start;
    let e = first;
    let closed = false;
    for (;;) {
      polyOf[e] = id;
      indexIn[e] = vertices.length - 1;
      const [a, b] = endsOf(e);
      v = a === v ? b : a;
      // Back where it began with no junction on the way: a loop, an enclave's
      // whole frontier, which does not repeat its first vertex.
      if (v === start && degree[v] === 2) {
        closed = true;
        break;
      }
      vertices.push(v);
      if (degree[v] !== 2) break;
      e = incident(v).find((f) => f !== e)!;
    }
    const [s0, s1] = sidesOf(first);
    const frontier = s0 >= 0 && s1 >= 0 && s0 !== s1 ? ([s0, s1] as [number, number]) : null;
    polylines.push({ vertices, closed, frontier, points: [] });
  };
  for (let v = 0; v < degree.length; v++) {
    if (degree[v] === 0 || degree[v] === 2) continue;
    for (const e of incident(v)) if (polyOf[e]! < 0) trace(v, e);
  }
  for (let e = 0; e < isBoundary.length; e++) {
    if (!isBoundary[e] || polyOf[e]! >= 0) continue;
    trace(endsOf(e)[0], e);
  }
  for (const line of polylines) {
    if (line.frontier === null) {
      line.points = corners(line.vertices, line.closed);
    } else if (line.closed) {
      line.points = smoothClosed(midpoints(line.vertices, true));
    } else {
      let points = simplify(midpoints(line.vertices, false), SIMPLIFY);
      for (let round = 0; round < CHAIKIN; round++) points = chaikin(points, false);
      line.points = points;
    }
  }
  return { polylines, polyOf, indexIn };
}

/** Each loop as points: the polylines it runs along, forwards or back. */
function ringsOf(edges: Directed, loops: number[][], { degree }: Boundary, { polylines, polyOf, indexIn }: Traced, nations: number): number[][][][] {
  // Each loop as points: the polylines it runs along, forwards or back.
  const rings: number[][][][] = Array.from({ length: nations }, () => []);
  for (const loop of loops) {
    const n = loop.length;
    let at = -1;
    for (let s = 0; s < n; s++) {
      if (degree[edges.from[loop[s]!]!] !== 2) {
        at = s;
        break;
      }
    }
    const nation = Math.floor(edges.region[loop[0]!]! / NX / 2);
    const points: number[][] = [];
    if (at < 0) {
      const line = polylines[polyOf[edges.edge[loop[0]!]!]!]!;
      const forward = line.vertices[indexIn[edges.edge[loop[0]!]!]!] === edges.from[loop[0]!];
      const run = forward ? line.points : [...line.points].reverse();
      points.push(...run.map((p) => [p[0]!, p[1]!]));
    } else {
      let s = 0;
      while (s < n) {
        const k = loop[(at + s) % n]!;
        const e = edges.edge[k]!;
        const line = polylines[polyOf[e]!]!;
        const count = line.closed ? line.vertices.length : line.vertices.length - 1;
        const forward = line.vertices[indexIn[e]!] === edges.from[k];
        const run = forward ? line.points : [...line.points].reverse();
        for (let p = 0; p < run.length - 1; p++) points.push([run[p]![0]!, run[p]![1]!]);
        s += count;
      }
    }
    rings[nation]!.push(points);
  }
  return rings;
}

function frontiersOf(polylines: Polyline[]): Frontier[] {
  const frontiers: Frontier[] = [];
  for (const line of polylines) {
    if (line.frontier === null) continue;
    const points = line.closed ? [...line.points, line.points[0]!] : line.points;
    frontiers.push({ points, left: line.frontier[0] + 1, right: line.frontier[1] + 1 });
  }
  return frontiers;
}

/**
 * The rings of every nation from a labelled lattice, cutting tiles until none
 * holds a hole.
 */
export function outlinesOf(labels: Int16Array, nations: number): Outlines {
  const { edges, loops } = cutTiles(labels);
  const boundary = boundaryOf(edges, labels);
  const traced = tracePolylines(boundary);
  return {
    rings: ringsOf(edges, loops, boundary, traced, nations),
    frontiers: frontiersOf(traced.polylines),
  };
}
