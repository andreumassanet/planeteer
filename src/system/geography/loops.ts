import { H_EDGES, NX, NY, VX, hEdge, latAt, lonAt, vEdge, vertex } from './lattice.ts';

export interface Directed {
  /** From and to vertices. */
  from: Int32Array;
  to: Int32Array;
  /** East 0, north 1, west 2, south 3; a right turn is `(d + 3) % 4`. */
  dir: Int8Array;
  /** The undirected edge it runs along, and whether it runs that edge's way. */
  edge: Int32Array;
  region: Int32Array;
  count: number;
}

/**
 * The region of every cell: its nation, its hemisphere and which strip of
 * longitude it falls in between the hemisphere's cuts. Two cells of one
 * nation in different regions are different rings.
 */
export function regionsOf(labels: Int16Array, cuts: readonly number[][]): Int32Array {
  const region = new Int32Array(NX * NY);
  const stripOf = cuts.map((list) => {
    const strip = new Int32Array(NX);
    let s = 0;
    let c = 0;
    const sorted = [...list].sort((p, q) => p - q);
    for (let i = 0; i < NX; i++) {
      while (c < sorted.length && sorted[c]! <= i) {
        if (sorted[c]! > 0) s++;
        c++;
      }
      strip[i] = s;
    }
    return strip;
  });
  for (let j = 0; j < NY; j++) {
    const h = j < NY / 2 ? 0 : 1;
    const strip = stripOf[h]!;
    for (let i = 0; i < NX; i++) region[j * NX + i] = (labels[j * NX + i]! * 2 + h) * NX + strip[i]!;
  }
  return region;
}

/** Every directed edge with a region on its right and something else on its left. */
export function directedEdges(region: Int32Array): Directed {
  const capacity = 2 * (H_EDGES + VX * NY);
  const out: Directed = {
    from: new Int32Array(capacity),
    to: new Int32Array(capacity),
    dir: new Int8Array(capacity),
    edge: new Int32Array(capacity),
    region: new Int32Array(capacity),
    count: 0,
  };
  const push = (from: number, to: number, dir: number, edge: number, r: number): void => {
    const k = out.count++;
    out.from[k] = from;
    out.to[k] = to;
    out.dir[k] = dir;
    out.edge[k] = edge;
    out.region[k] = r;
  };
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const r = region[j * NX + i]!;
      // Clockwise round the cell, so the cell is on the right of each edge.
      if (j + 1 === NY || region[(j + 1) * NX + i] !== r) push(vertex(i, j + 1), vertex(i + 1, j + 1), 0, hEdge(i, j + 1), r);
      if (i + 1 === NX || region[j * NX + i + 1] !== r) push(vertex(i + 1, j + 1), vertex(i + 1, j), 3, vEdge(i + 1, j), r);
      if (j === 0 || region[(j - 1) * NX + i] !== r) push(vertex(i + 1, j), vertex(i, j), 2, hEdge(i, j), r);
      if (i === 0 || region[j * NX + i - 1] !== r) push(vertex(i, j), vertex(i, j + 1), 1, vEdge(i, j), r);
    }
  }
  return out;
}

/**
 * The directed edges chained into closed loops, region by region.
 *
 * At a vertex where a region touches itself only corner to corner, there are
 * two ways on, and the walk takes the sharper right turn: with the region on
 * the right, that keeps the two cells' rings apart rather than pinching them
 * into one ring that crosses itself.
 */
export function loopsOf(edges: Directed): number[][] {
  const outStart = new Int32Array(VX * (NY + 1) + 1);
  for (let k = 0; k < edges.count; k++) outStart[edges.from[k]! + 1]!++;
  for (let v = 0; v < VX * (NY + 1); v++) outStart[v + 1]! += outStart[v]!;
  const outList = new Int32Array(edges.count);
  const cursor = outStart.slice(0, VX * (NY + 1));
  for (let k = 0; k < edges.count; k++) outList[cursor[edges.from[k]!]!++] = k;

  const used = new Uint8Array(edges.count);
  const loops: number[][] = [];
  for (let start = 0; start < edges.count; start++) {
    if (used[start]) continue;
    const loop: number[] = [];
    let k = start;
    while (!used[k]) {
      used[k] = 1;
      loop.push(k);
      const v = edges.to[k]!;
      const r = edges.region[k]!;
      const d = edges.dir[k]!;
      let next = -1;
      let rank = 9;
      for (let s = outStart[v]!; s < outStart[v + 1]!; s++) {
        const e = outList[s]!;
        if (edges.region[e] !== r) continue;
        const turn = (edges.dir[e]! - d + 4) % 4;
        // Right (3) before straight (0) before left (1).
        const order = turn === 3 ? 0 : turn === 0 ? 1 : 2;
        if (order < rank) {
          rank = order;
          next = e;
        }
      }
      if (next < 0) throw new Error(`geography: a ring broke open at vertex ${v}`);
      k = next;
    }
    loops.push(loop);
  }
  return loops;
}

/** Twice the signed area of a loop in lon/lat: negative is clockwise, an outer ring. */
export function loopArea(edges: Directed, loop: readonly number[]): number {
  let sum = 0;
  for (const k of loop) {
    const a = edges.from[k]!;
    const b = edges.to[k]!;
    sum += lonAt(a) * latAt(b) - lonAt(b) * latAt(a);
  }
  return sum;
}
