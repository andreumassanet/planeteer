import type { BakeContext } from './context.ts';

/** How a set of edges spreads over the built towns. Counted over the built towns only, not the whole gazetteer. */
export function degreesOf(ctx: BakeContext, edges: readonly { a: number; b: number }[]): {
  mean: number;
  median: number;
  p90: number;
  max: number;
  isolated: number;
  share: string;
} {
  const count = new Int32Array(ctx.places.length);
  for (const edge of edges) {
    count[edge.a]!++;
    count[edge.b]!++;
  }
  const mine = ctx.built.map((i) => count[i]!).sort((x, y) => x - y);
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

/** The islands a set of edges falls into. `pnpm check` re-derives all three numbers. */
export function componentsOf(ctx: BakeContext, edges: readonly { a: number; b: number }[]): {
  count: number;
  largest: number;
  singles: number;
} {
  const parent = new Int32Array(ctx.places.length).map((_, i) => i);
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
  for (const i of ctx.built) {
    const root = find(i);
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  const sorted = [...sizes.values()].sort((x, y) => y - x);
  return { count: sorted.length, largest: sorted[0]!, singles: sorted.filter((n) => n === 1).length };
}
