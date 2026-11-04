/**
 * The Explorers' Guild's square laid out on its parcel (`sites.ts`): where
 * the hall, the fountain, the stalls, the boards, the flags, the lamps, the
 * benches, the planters, the signpost and the map table stand, where each of
 * the guild's people waits, and the walls a body meets. Pure numbers in the
 * town's plane (`townFrame`: `+x` is `across`, `+z` north, world units from
 * the town's centre), so the town that builds it, the map that draws it and
 * the checks that hold it read one layout.
 *
 * The square is laid in its own two axes: `front`, from the hall's back wall
 * out to the main street it looks onto, and `side`, from the open side (the
 * other main street) to the stall row backing onto the next block. The
 * corner of the crossing is the open side's front corner.
 */
import type * as THREE from 'three';
import { BENCH_DEPTH, BENCH_LONGEST } from '../bench.ts';
import { PLANET_RADIUS } from '../globe.ts';
import type { Place } from '../places.ts';
import { cellCentre, streetSide } from '../scenery/grid.ts';
import type { TownGrid } from '../scenery/grid.ts';
import { GROUND_LIFT } from '../scenery/ground.ts';
import { disc, yawed } from '../scenery/solids.ts';
import type { Solid } from '../scenery/solids.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import type { GuildRole } from './roles.ts';
import type { GuildParcel } from './sites.ts';

/** A body-metre: the cast's 1.75 m drawn at `AVATAR_HEIGHT`. */
const M = AVATAR_HEIGHT / 1.75;

/** What the paving keeps clear inside the street band round the parcel, so nothing stands on a kerb. */
const EDGE_IN = 0.6;
/** How far apart, at least, two pieces' footprints keep: a body walks between them. */
const GAP = 0.8 * M;
/** How far a person's spot keeps from any wall: the player's body and a little more. */
export const SPOT_CLEAR = 0.5 * M;

/** How many columns carry the hall's porch, and their radius. */
const COLUMNS = 4;
export const COLUMN_RADIUS = 0.2 * M;

/** A tree bed's radius: a ring of stone round one of the town's trees. */
export const PLANTER_RADIUS = 0.6 * M;
/** How tall the poles at the front stand. */
export const POLE_HEIGHT = 4.6 * M;

/** The stall the street dressing draws (`drawStall`): its counter's half-width and half-depth. */
export const STALL_HALF = 1.0 * M;
export const STALL_DEPTH = 0.55 * M;
/** And the room a stall takes along the row, counter and canopy. */
const STALL_PITCH = 2.6 * M;

/** The noticeboard and the Hall of Fame board: the face each carries. */
export const NOTICE_FACE = { width: 1.5 * M, height: 0.95 * M, lift: 0.78 * M };
export const FAME_FACE = { width: 1.25 * M, height: 1.55 * M, lift: 1.05 * M };
/** How deep a board's frame stands, front to back. */
export const BOARD_DEPTH = 0.16 * M;

/** A thing standing in the square: where, and the way its front faces (a Three yaw). */
export interface Spot {
  x: number;
  z: number;
  yaw: number;
}

/** Where one of the guild's people waits, and which way they face. */
export interface RoleSpot extends Spot {
  role: GuildRole;
}

/** A board: where its foot stands, the way its face looks, and the face itself. */
export interface BoardSpot extends Spot {
  kind: 'jobs' | 'fame';
  width: number;
  height: number;
  /** The face's middle over the paving. */
  lift: number;
}

export interface GuildLayout {
  parcel: GuildParcel;
  /** The paving the square furnishes, in the town's plane: the parcel less the street bands round it. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Its middle, the axes, and its size along them. */
  cx: number;
  cz: number;
  front: readonly [number, number];
  side: readonly [number, number];
  width: number;
  depth: number;
  /** The hall: the middle of its front wall's foot, facing out of its door; its size and its porch's depth. */
  hall: Spot & { width: number; depth: number; porch: number };
  /** The fountain's middle, its basin's radius, and the compass rose round it. */
  fountain: { x: number; z: number; radius: number; rose: number };
  stalls: Spot[];
  boards: BoardSpot[];
  /** The two poles at the front: the country's flag, then the guild's banner. */
  flags: Spot[];
  lamps: Spot[];
  benches: Spot[];
  /** Round stone beds, each with one of the town's trees in it. */
  planters: Spot[];
  signpost: Spot | null;
  table: Spot | null;
  spots: RoleSpot[];
  /** Where a few of the town's people stroll, as `[x0, z0, x1, z1]`. */
  strolls: [number, number, number, number][];
}

/** A Three yaw that turns a front (+Z) to look along `(dx, dz)` of the town's plane. */
export const yawToward = (dx: number, dz: number): number => Math.atan2(dx, dz);

/**
 * The square's layout on `parcel`. `paved(col, row)` says which of the
 * town's cells are paved, for which of the parcel's sides carry a band of the
 * street round it; `band` is that band's half-width (`streetBand`).
 */
export function guildLayout(grid: TownGrid, band: number, parcel: GuildParcel, paved: (col: number, row: number) => boolean): GuildLayout {
  const { c0, c1, r0, r1 } = parcel;
  const half = grid.pitch * 0.5;
  /** How far in a side keeps: the band it paves where the town goes on past it, and the kerb's margin. */
  const inset = (side: number): number => {
    let banded = false;
    const count = side % 2 === 0 ? r1 - r0 + 1 : c1 - c0 + 1;
    for (let k = 0; k < count && !banded; k++) {
      const col = side === 0 ? c1 : side === 2 ? c0 : c0 + k;
      const row = side === 1 ? r1 : side === 3 ? r0 : r0 + k;
      const [dc, dr] = side === 0 ? [1, 0] : side === 1 ? [0, 1] : side === 2 ? [-1, 0] : [0, -1];
      banded = streetSide(grid, col, row, side) && paved(col + dc, row + dr);
    }
    return (banded ? band : 0) + EDGE_IN;
  };
  const x0 = cellCentre(grid, c0) - half + inset(2);
  const x1 = cellCentre(grid, c1) + half - inset(0);
  const z0 = cellCentre(grid, r0) - half + inset(3);
  const z1 = cellCentre(grid, r1) + half - inset(1);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const h = parcel.hallSide;
  // The hall's back is on side `h`; the square's front looks the other way.
  const front: [number, number] = h === 0 ? [-1, 0] : h === 1 ? [0, -1] : h === 2 ? [1, 0] : [0, 1];
  const side: [number, number] = h % 2 === 0 ? [0, parcel.sz] : [parcel.sx, 0];
  const depth = h % 2 === 0 ? x1 - x0 : z1 - z0;
  const width = h % 2 === 0 ? z1 - z0 : x1 - x0;
  const plan = new Planner(cx, cz, front, side);
  const pieces = laid(plan, width, depth);
  const partial: GuildLayout = { parcel, x0, x1, z0, z1, cx, cz, front, side, width, depth, ...pieces, spots: [], strolls: [] };
  // The people and the strolls go where the walls the square draws leave room, the benches' included.
  const walls = [...guildSolids(partial, { hall: 0 }).map((entry) => entry.solid), ...pieces.benches.map((bench) => yawed(bench.x, bench.z, bench.yaw, BENCH_HALF.along, BENCH_HALF.across, 0))];
  const room = (x: number, z: number, margin: number): boolean =>
    x >= x0 + margin && x <= x1 - margin && z >= z0 + margin && z <= z1 - margin;
  const spots = settled(roleSpots(plan, pieces.anchors), walls, room);
  const strolls = pieces.strolls.flatMap((line) => clearRun(line, walls, spots, room));
  return { ...partial, spots, strolls };
}

/** How far a body of no size at `(x, z)` stands from the nearest of `walls`: negative inside one. */
export function wallGap(walls: readonly Solid[], x: number, z: number): number {
  let least = Infinity;
  for (const s of walls) {
    const dx = x - s.x;
    const dz = z - s.z;
    if (s.round) {
      least = Math.min(least, Math.hypot(dx, dz) - s.hx);
      continue;
    }
    const a = Math.abs(dx * s.cos + dz * s.sin) - s.hx;
    const b = Math.abs(-dx * s.sin + dz * s.cos) - s.hz;
    least = Math.min(least, a > 0 || b > 0 ? Math.hypot(Math.max(a, 0), Math.max(b, 0)) : Math.max(a, b));
  }
  return least;
}

/** How far apart two of the guild's people keep. */
export const SPOT_APART = 1.1 * M;
/** How far a stroll keeps from a wall and from the guild's people. */
export const STROLL_CLEAR = 0.45 * M;

/**
 * Each spot where its trade puts it, or the nearest place round it that is in
 * the square, `SPOT_CLEAR` from every wall and `SPOT_APART` from the people
 * placed before it, still looking at the fountain.
 */
function settled(wanted: readonly (RoleSpot & { fx: number; fz: number })[], walls: readonly Solid[], room: (x: number, z: number, margin: number) => boolean): RoleSpot[] {
  const out: RoleSpot[] = [];
  for (const spot of wanted) {
    const fits = (x: number, z: number): boolean =>
      room(x, z, SPOT_CLEAR) && wallGap(walls, x, z) >= SPOT_CLEAR + 0.05 && out.every((other) => Math.hypot(other.x - x, other.z - z) >= SPOT_APART);
    let at: [number, number] = [spot.x, spot.z];
    search: for (let r = 0; r <= 4.01; r += 0.4) {
      const ring = r === 0 ? 1 : 12;
      for (let k = 0; k < ring; k++) {
        const angle = (k / ring) * Math.PI * 2;
        const x = spot.x + Math.cos(angle) * r;
        const z = spot.z + Math.sin(angle) * r;
        if (!fits(x, z)) continue;
        at = [x, z];
        break search;
      }
    }
    const [x, z] = at;
    const yaw = Math.hypot(spot.fx - x, spot.fz - z) < 1e-6 ? spot.yaw : yawToward(spot.fx - x, spot.fz - z);
    out.push({ role: spot.role, x, z, yaw });
  }
  return out;
}

/** The longest stretch of a stroll clear of the walls and the people, if it is long enough to walk; else nothing. */
function clearRun(
  [x0, z0, x1, z1]: readonly [number, number, number, number], walls: readonly Solid[], spots: readonly RoleSpot[],
  room: (x: number, z: number, margin: number) => boolean,
): [number, number, number, number][] {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(2, Math.ceil(length / 0.4));
  const clear = (t: number): boolean => {
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    return room(x, z, STROLL_CLEAR) && wallGap(walls, x, z) >= STROLL_CLEAR && spots.every((spot) => Math.hypot(spot.x - x, spot.z - z) >= SPOT_APART);
  };
  let best: [number, number] | null = null;
  let from = -1;
  for (let k = 0; k <= steps; k++) {
    const ok = clear(k / steps);
    if (ok && from < 0) from = k;
    if ((!ok || k === steps) && from >= 0) {
      const to = ok ? k : k - 1;
      if (best === null || to - from > best[1] - best[0]) best = [from, to];
      from = -1;
    }
  }
  if (best === null || ((best[1] - best[0]) / steps) * length < STROLL_LEAST) return [];
  const [a, b] = [best[0] / steps, best[1] / steps];
  return [[x0 + (x1 - x0) * a, z0 + (z1 - z0) * a, x0 + (x1 - x0) * b, z0 + (z1 - z0) * b]];
}

/** The shortest stroll worth walking. */
const STROLL_LEAST = 3 * M;

/** Where `(a, b)` of the square's axes falls in the town's plane, and the footprints taken so far. */
class Planner {
  readonly taken: { a: number; b: number; ha: number; hb: number }[] = [];
  readonly cx: number;
  readonly cz: number;
  readonly front: readonly [number, number];
  readonly side: readonly [number, number];

  constructor(cx: number, cz: number, front: readonly [number, number], side: readonly [number, number]) {
    this.cx = cx;
    this.cz = cz;
    this.front = front;
    this.side = side;
  }

  /** A point of the square's axes in the town's plane: `a` along the side axis, `b` along the front. */
  at(a: number, b: number): [number, number] {
    return [this.cx + a * this.side[0] + b * this.front[0], this.cz + a * this.side[1] + b * this.front[1]];
  }

  /** A spot at `(a, b)` whose front looks along `(da, db)` of the square's axes. */
  spot(a: number, b: number, da: number, db: number): Spot {
    const [x, z] = this.at(a, b);
    return { x, z, yaw: yawToward(da * this.side[0] + db * this.front[0], da * this.side[1] + db * this.front[1]) };
  }

  /** Half the square along its side axis and its front axis: what a piece must stand inside. */
  W = Infinity;
  D = Infinity;

  /** Whether a box of half-sizes `(ha, hb)` at `(a, b)` is inside the square and keeps `GAP` from everything taken; and takes it if so. */
  take(a: number, b: number, ha: number, hb: number, gap = GAP): boolean {
    if (Math.abs(a) + ha > this.W + 1e-6 || Math.abs(b) + hb > this.D + 1e-6) return false;
    for (const t of this.taken) {
      if (Math.abs(a - t.a) < ha + t.ha + gap && Math.abs(b - t.b) < hb + t.hb + gap) return false;
    }
    this.taken.push({ a, b, ha, hb });
    return true;
  }
}

/** Where the people's trades are: what `roleSpots` places them by. */
interface Anchors {
  ah: number;
  porchFront: number;
  bf: number;
  rose: number;
  boards: BoardSpot[];
  flags: Spot[];
  stalls: Spot[];
  table: Spot | null;
  signpost: Spot | null;
}

type Laid = Pick<GuildLayout, 'hall' | 'fountain' | 'stalls' | 'boards' | 'flags' | 'lamps' | 'benches' | 'planters' | 'signpost' | 'table' | 'strolls'> & { anchors: Anchors };

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/**
 * Everything in the square's own axes, `a` across from the open side
 * (`-width / 2`) to the stall row (`+width / 2`), `b` from the hall's back
 * (`-depth / 2`) to the front (`+depth / 2`).
 */
function laid(plan: Planner, width: number, depth: number): Laid {
  const W = width / 2;
  const D = depth / 2;
  plan.W = W;
  plan.D = D;
  const roomy = width >= 30;
  // The hall, a little off the middle towards the open side when a stall row takes the other.
  const hallWidth = clamp(width * 0.46, 11, 20);
  const body = clamp(depth * 0.22, 7, 10);
  const porch = clamp(depth * 0.1, 3.2, 4.6);
  const ah = roomy ? -STALL_PITCH * 0.45 : 0;
  const back = -D + 0.4;
  const porchFront = back + body + porch;
  plan.take(ah, back + (body + porch) / 2, hallWidth / 2, (body + porch) / 2, 0.3);
  const hall = { ...plan.spot(ah, back + body, 0, 1), width: hallWidth, depth: body, porch };

  // The fountain on the hall's axis, halfway between its porch and the front.
  const radius = clamp(Math.min(width, depth) * 0.085, 2.4, 3.8);
  const bf = (porchFront + D) / 2 + 0.6;
  const rose = Math.max(radius + 2, Math.min(radius + 5.5, bf - porchFront - 1.4, D - bf - 1.6, ah + W - 2));
  plan.take(ah, bf, radius, radius, 0.4);
  const fountain = { ...pointOf(plan, ah, bf), radius, rose };

  const benches = benchesRound(plan, ah, bf, radius);
  const boards = boardsBeside(plan, ah, hallWidth, porchFront, W);
  const flags = flagsAtFront(plan, ah, rose, D, W);
  const { stalls, table } = stallRow(plan, roomy, porchFront, D, W);
  const lamps = lampsAt(plan, W, D, back, ah, bf, rose);
  const planters = plantersAlong(plan, W, D, bf, porchFront);
  const signpost = plan.take(-W + 2.6, D - 3.2, 0.4, 0.4) ? plan.spot(-W + 2.6, D - 3.2, 1, -1) : null;
  const anchors = { ah, porchFront, bf, rose, boards, flags, stalls, table, signpost };
  const strolls = strollsIn(plan, W, D, porchFront, stalls);
  return { hall, fountain, stalls, boards, flags, lamps, benches, planters, signpost, table, strolls, anchors };
}

function pointOf(plan: Planner, a: number, b: number): { x: number; z: number } {
  const [x, z] = plan.at(a, b);
  return { x, z };
}

/** Four benches round the fountain on its diagonals, each looking at the water. */
function benchesRound(plan: Planner, af: number, bf: number, radius: number): Spot[] {
  const out: Spot[] = [];
  // On a diagonal, far enough that the bench's box clears the fountain's square one.
  const ring = (radius + BENCH_LONGEST / 2 + 0.6) * Math.SQRT2;
  for (let k = 0; k < 4; k++) {
    const angle = Math.PI / 4 + (k * Math.PI) / 2;
    const a = af + Math.cos(angle) * ring;
    const b = bf + Math.sin(angle) * ring;
    if (!plan.take(a, b, BENCH_LONGEST / 2, BENCH_LONGEST / 2, 0.4)) continue;
    out.push(plan.spot(a, b, af - a, bf - b));
  }
  return out;
}

/** The noticeboard on the open side of the porch, the Hall of Fame on the other, both looking into the square. */
function boardsBeside(plan: Planner, ah: number, hallWidth: number, porchFront: number, W: number): BoardSpot[] {
  const out: BoardSpot[] = [];
  const b = porchFront - 0.6 * M;
  for (const [kind, face, sign] of [['jobs', NOTICE_FACE, -1], ['fame', FAME_FACE, 1]] as const) {
    const halfWidth = face.width / 2 + 0.2 * M;
    let a = ah + sign * (hallWidth / 2 + halfWidth + 0.9 * M);
    // Kept inside the square, nearer the hall if it must.
    a = clamp(a, -W + halfWidth + 0.5, W - halfWidth - 0.5);
    if (!plan.take(a, b, halfWidth, BOARD_DEPTH + 0.2, 0.6)) continue;
    out.push({ ...plan.spot(a, b, 0, 1), kind, width: face.width, height: face.height, lift: face.lift });
  }
  return out;
}

/** Two poles at the front, either side of the view from the street to the hall. */
function flagsAtFront(plan: Planner, af: number, rose: number, D: number, W: number): Spot[] {
  const out: Spot[] = [];
  const b = D - 1.2;
  for (const sign of [-1, 1]) {
    const a = clamp(af + sign * (rose + 2.4), -W + 1.4, W - 1.4);
    if (!plan.take(a, b, 0.3, 0.3, 0.6)) continue;
    out.push(plan.spot(a, b, 0, -1));
  }
  return out;
}

/** The stalls along the row at the far side, looking into the square, the map table the nearest the hall. */
function stallRow(plan: Planner, roomy: boolean, porchFront: number, D: number, W: number): { stalls: Spot[]; table: Spot | null } {
  const stalls: Spot[] = [];
  let table: Spot | null = null;
  const a = W - STALL_DEPTH - 0.4;
  const first = porchFront + STALL_HALF + 0.5;
  const last = D - STALL_HALF - 1.2;
  const count = roomy ? Math.min(5, Math.floor((last - first) / STALL_PITCH) + 1) : 0;
  for (let k = 0; k < count; k++) {
    const b = first + k * STALL_PITCH;
    if (b > last + 1e-6) break;
    if (!plan.take(a, b, STALL_DEPTH + 0.3, STALL_HALF + 0.3, 0.2)) continue;
    // Sideways on: a stall's counter runs along the row and its front looks into the square.
    if (table === null) table = plan.spot(a, b, -1, 0);
    else stalls.push(plan.spot(a, b, -1, 0));
  }
  if (stalls.length === 0 && table !== null) {
    stalls.push(table);
    table = null;
  }
  return { stalls, table };
}

/**
 * A lamp at each corner of the square and either side of the fountain,
 * wherever nothing stands, its arm (the model's -Z) reaching in over the
 * square.
 */
function lampsAt(plan: Planner, W: number, D: number, back: number, af: number, bf: number, rose: number): Spot[] {
  const out: Spot[] = [];
  const spots = [[-W + 0.9, D - 0.9], [W - 0.9, D - 0.9], [-W + 0.9, back + 0.6], [W - 0.9, back + 0.6], [af - rose - 1.2, bf], [af + rose + 1.2, bf]] as const;
  for (const [a, b] of spots) {
    if (a < -W + 0.5 || a > W - 0.5 || !plan.take(a, b, 0.3, 0.3, 0.6)) continue;
    out.push(plan.spot(a, b, a - af, b - bf));
  }
  return out;
}

/** Tree beds down the open side, by the fountain and beside the hall, wherever there is room. */
function plantersAlong(plan: Planner, W: number, D: number, bf: number, porchFront: number): Spot[] {
  const out: Spot[] = [];
  const a = -W + PLANTER_RADIUS + 0.1;
  for (const b of [bf - 6, bf + 3, porchFront - 3]) {
    if (b < -D + 2 || b > D - 4.5) continue;
    if (!plan.take(a, b, PLANTER_RADIUS, PLANTER_RADIUS, 0.8)) continue;
    out.push(plan.spot(a, b, 1, 0));
  }
  return out;
}

/** The six people's spots as their trades put them, each looking at the fountain (`fx`, `fz`). */
function roleSpots(plan: Planner, at: Anchors): (RoleSpot & { fx: number; fz: number })[] {
  const out: (RoleSpot & { fx: number; fz: number })[] = [];
  const toward = (a: number, b: number, role: GuildRole): void => {
    const [x, z] = plan.at(a, b);
    const [fx, fz] = plan.at(at.ah, at.bf);
    out.push({ role, x, z, fx, fz, yaw: Math.hypot(fx - x, fz - z) < 1e-6 ? yawToward(plan.front[0], plan.front[1]) : yawToward(fx - x, fz - z) });
  };
  /** A spot's own square axes back from the plane. */
  const axes = (spot: Spot): [number, number] => {
    const dx = spot.x - plan.cx;
    const dz = spot.z - plan.cz;
    return [dx * plan.side[0] + dz * plan.side[1], dx * plan.front[0] + dz * plan.front[1]];
  };
  toward(at.ah, at.porchFront + 0.6 * M, 'guide');
  const notice = at.boards.find((board) => board.kind === 'jobs');
  const fame = at.boards.find((board) => board.kind === 'fame');
  if (notice !== undefined) {
    const [a, b] = axes(notice);
    toward(a + notice.width * 0.5 + 0.2 * M, b + 0.9 * M, 'dispatcher');
  } else toward(at.ah - 3 * M, at.porchFront + 1.2 * M, 'dispatcher');
  const pole = at.flags[0] ?? at.signpost;
  if (pole !== null && pole !== undefined) {
    const [a, b] = axes(pole);
    toward(a + (a < at.ah ? 1 : -1) * 0.7 * M, b - 0.8 * M, 'marshal');
  } else toward(at.ah - at.rose - 1.2 * M, at.bf + at.rose * 0.5, 'marshal');
  const stall = at.stalls[0];
  if (stall !== undefined) {
    const [a, b] = axes(stall);
    toward(a - STALL_DEPTH - 0.75 * M, b, 'outfitter');
  } else toward(at.ah + at.rose + 1.2 * M, at.bf, 'outfitter');
  if (fame !== undefined) {
    const [a, b] = axes(fame);
    toward(a - fame.width * 0.5 - 0.2 * M, b + 0.9 * M, 'archivist');
  } else toward(at.ah + 3 * M, at.porchFront + 1.2 * M, 'archivist');
  if (at.table !== null) {
    const [a, b] = axes(at.table);
    toward(a - STALL_DEPTH - 0.6 * M, b + 0.6 * M, 'cartographer');
  } else toward(at.ah + at.rose * 0.7, at.bf - at.rose - 0.5 * M, 'cartographer');
  return out;
}

/** A few lines for the town's people to stroll: down the open side, and along the stalls' fronts. */
function strollsIn(plan: Planner, W: number, D: number, porchFront: number, stalls: readonly Spot[]): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const a = -W + 0.1 + 2 * PLANTER_RADIUS + 1.1 * M;
  out.push([...plan.at(a, porchFront + 1.5), ...plan.at(a, D - 2.4)] as [number, number, number, number]);
  if (stalls.length >= 2) {
    const shoppers = W - 2 * STALL_DEPTH - 0.4 - 1.9 * M;
    out.push([...plan.at(shoppers, porchFront + 2), ...plan.at(shoppers, D - 2.4)] as [number, number, number, number]);
  }
  return out;
}

/** What the square's walls are, by kind, so a check can name the one a body met. */
export type GuildSolidKind = 'hall' | 'column' | 'fountain' | 'stall' | 'board' | 'pole' | 'planter' | 'table' | 'signpost';

/** The square's height, on its terrace, as a radius from the planet's centre. */
const floorRadius = (layout: GuildLayout): number => PLANET_RADIUS + layout.parcel.level + GROUND_LIFT;

/**
 * Every wall of the square in the town's plane, with its kind: the hall's
 * body and its columns, the fountain's basin, the stalls, the boards, the
 * poles, the planters, the map table and the signpost. The benches and the
 * lamps are the town's own and carry their own.
 */
export function guildSolids(layout: GuildLayout, heights: { hall: number }): { solid: Solid; kind: GuildSolidKind }[] {
  const out: { solid: Solid; kind: GuildSolidKind }[] = [];
  const floor = floorRadius(layout);
  const { hall } = layout;
  const fx = Math.sin(hall.yaw);
  const fz = Math.cos(hall.yaw);
  // The body behind the front wall's foot.
  out.push({ solid: yawed(hall.x - fx * hall.depth / 2, hall.z - fz * hall.depth / 2, hall.yaw, hall.width / 2, hall.depth / 2, floor + heights.hall), kind: 'hall' });
  for (const [x, z] of columnsOf(layout)) out.push({ solid: disc(x, z, COLUMN_RADIUS + 0.05, floor + PORCH_HEIGHT), kind: 'column' });
  out.push({ solid: disc(layout.fountain.x, layout.fountain.z, layout.fountain.radius, floor + 1.2 * M), kind: 'fountain' });
  for (const stall of layout.stalls) out.push({ solid: yawed(stall.x, stall.z, stall.yaw, STALL_HALF, STALL_DEPTH, floor + 2.3 * M), kind: 'stall' });
  if (layout.table !== null) out.push({ solid: yawed(layout.table.x, layout.table.z, layout.table.yaw, STALL_HALF * 0.75, STALL_DEPTH * 0.8, floor + 0.5 * M), kind: 'table' });
  for (const board of layout.boards) out.push({ solid: yawed(board.x, board.z, board.yaw, board.width / 2 + 0.2 * M, BOARD_DEPTH / 2 + 0.06, floor + board.lift + board.height), kind: 'board' });
  for (const pole of layout.flags) out.push({ solid: disc(pole.x, pole.z, 0.18 * M, floor + POLE_HEIGHT), kind: 'pole' });
  for (const planter of layout.planters) out.push({ solid: disc(planter.x, planter.z, PLANTER_RADIUS + 0.05, floor + 0.5 * M), kind: 'planter' });
  if (layout.signpost !== null) out.push({ solid: disc(layout.signpost.x, layout.signpost.z, 0.14 * M, floor + 1.4 * M), kind: 'signpost' });
  return out;
}

/** The porch's columns, at its front, in the town's plane. */
export function columnsOf(layout: GuildLayout): [number, number][] {
  const { hall } = layout;
  const fx = Math.sin(hall.yaw);
  const fz = Math.cos(hall.yaw);
  // Along the front: the hall's own +x, turned by its yaw.
  const ax = Math.cos(hall.yaw);
  const az = -Math.sin(hall.yaw);
  const out: [number, number][] = [];
  const span = hall.width - 1.2;
  const out0 = hall.porch - COLUMN_RADIUS - 0.25;
  for (let k = 0; k < COLUMNS; k++) {
    const u = -span / 2 + (k * span) / (COLUMNS - 1);
    out.push([hall.x + ax * u + fx * out0, hall.z + az * u + fz * out0]);
  }
  return out;
}

/** How high the porch's roof stands over the paving. */
export const PORCH_HEIGHT = 2.6 * M;

/** The bench's footprint, which a stroll keeps clear of: half its length and its depth. */
export const BENCH_HALF = { along: BENCH_LONGEST / 2, across: BENCH_DEPTH / 2 };

/**
 * A guild's square as it stands near, in the world: its middle and up, where
 * each of its people waits, its two boards' faces, and the hall's door.
 * `at` is on the floor a foot finds (`madeHeightAt`); a board's `at` is the
 * middle of its face, `normal` out of it and `up` along it.
 */
export interface GuildSquare {
  place: Place;
  /** The town's index in `places`. */
  index: number;
  centre: THREE.Vector3;
  up: THREE.Vector3;
  spots: { role: GuildRole; at: THREE.Vector3; facing: THREE.Vector3 }[];
  boards: { kind: 'jobs' | 'fame'; at: THREE.Vector3; normal: THREE.Vector3; up: THREE.Vector3; width: number; height: number }[];
  hall: { at: THREE.Vector3; facing: THREE.Vector3 };
}
