/** The few nearest candidates of a kind, kept sorted in fixed arrays so a frame allocates nothing. */
export interface Nearest {
  rows: (Float32Array | null)[];
  at: Int32Array;
  distance: Float64Array;
  count: number;
  /** Empties the list for a new frame. */
  clear(): void;
  /** Keeps a candidate (a row of `rows` at `offset`, `d` squared away) if it is among the `cap` nearest so far. */
  offer(rows: Float32Array, offset: number, d: number): void;
}

export function createNearest(cap: number): Nearest {
  const nearest: Nearest = {
    rows: new Array(cap).fill(null),
    at: new Int32Array(cap),
    distance: new Float64Array(cap),
    count: 0,
    clear() {
      nearest.count = 0;
    },
    offer(rows, offset, d) {
      const { count, distance, at, rows: list } = nearest;
      if (count === cap && d >= distance[cap - 1]!) return;
      let i = count < cap ? count : cap - 1;
      while (i > 0 && distance[i - 1]! > d) {
        list[i] = list[i - 1]!;
        at[i] = at[i - 1]!;
        distance[i] = distance[i - 1]!;
        i--;
      }
      list[i] = rows;
      at[i] = offset;
      distance[i] = d;
      nearest.count = count < cap ? count + 1 : count;
    },
  };
  return nearest;
}
