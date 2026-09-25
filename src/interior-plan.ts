import { tone } from './monuments/contract.ts';
import { BODY_RADIUS } from './player.ts';
import { REGIONS } from './scenery/regions.ts';
import type { RegionId } from './scenery/regions.ts';
import { rngFrom } from './scenery/random.ts';
import { disc, yawed } from './scenery/solids.ts';
import type { Solid } from './scenery/solids.ts';
import type { Rng } from './scenery/random.ts';
import { AVATAR_HEIGHT, PERSON_METRES } from './stature.ts';
import { PALETTE } from './theme.ts';

/**
 * What is behind a door: a room worked out from the building's identity and
 * nothing else, so the same door opens on the same room on every load and on
 * every machine, with nothing stored and nothing sent.
 *
 * **An interior is not the inside of the building it belongs to.** A house
 * eight units across outside is a sitting room, a kitchen and a bed inside,
 * which is the size a room has to be for a body 3.77 units tall to turn round
 * in; `E` at the door fades to black and the player stands in a room built on
 * its own, somewhere nobody can see from the street (`interiors.ts`). That is
 * the whole of the trick and it is what makes a whole planet of doors
 * affordable: nothing inside exists until somebody opens one.
 *
 * **Everything here is pure** — a plan is numbers, colours and names, built
 * from `rngFrom(key, ...)` streams — so `scripts/check-interiors.ts` replays
 * thousands of doors headless and holds each plan to the rules a room has to
 * keep: nothing overlaps, the player arrives clear, and no free floor is cut
 * off from the door. `interior-kit.ts` turns a plan into one merged mesh.
 *
 * **The room's frame**: `x` across, `z` into the room from the door, `y` up;
 * the door is the middle of the front wall at `(0, 0)` and the room spans
 * `[-width / 2, width / 2]` by `[0, depth]`. A round room is centred on
 * `(0, depth / 2)` with the door at the bottom of its circle. Every piece
 * faces +Z in its own frame and is turned by quarter turns, `q`.
 */

/** A metre, at the size living things are drawn: `AVATAR_HEIGHT` is 1.75 of them. */
export const ROOM_METRE = AVATAR_HEIGHT / PERSON_METRES;
const M = ROOM_METRE;

export type RoomType =
  | 'home'
  | 'flat'
  | 'cabin'
  | 'tatami'
  | 'riad'
  | 'hut'
  | 'yurt'
  | 'bakery'
  | 'grocery'
  | 'cafe'
  | 'bar'
  | 'bookshop'
  | 'clothes'
  | 'pharmacy'
  | 'restaurant'
  | 'office'
  | 'lobby'
  | 'church'
  | 'chapel'
  | 'mosque'
  | 'temple'
  | 'barn'
  | 'mill'
  | 'lighthouse'
  | 'museum';

export const ROOM_TYPES: readonly RoomType[] = [
  'home', 'flat', 'cabin', 'tatami', 'riad', 'hut', 'yurt',
  'bakery', 'grocery', 'cafe', 'bar', 'bookshop', 'clothes', 'pharmacy', 'restaurant',
  'office', 'lobby', 'church', 'chapel', 'mosque', 'temple', 'barn', 'mill', 'lighthouse', 'museum',
];

/** Every piece the kit (`interior-kit.ts`) knows how to build. */
export type ItemKind =
  | 'table' | 'round-table' | 'low-table' | 'chair' | 'stool' | 'sofa' | 'armchair' | 'bed' | 'mat-bed'
  | 'wardrobe' | 'chest' | 'bookshelf' | 'bookcase' | 'counter' | 'kitchen' | 'fridge' | 'stove' | 'oven'
  | 'shelves' | 'bread-rack' | 'crates' | 'display' | 'coffee' | 'rack' | 'mannequin' | 'booth'
  | 'desk' | 'monitor' | 'plant' | 'tree' | 'rug' | 'lamp' | 'hanging-lamp' | 'chandelier' | 'lantern'
  | 'painting' | 'mirror' | 'cross' | 'sign' | 'tv' | 'pew' | 'altar' | 'candles' | 'lectern' | 'organ'
  | 'mihrab' | 'minbar' | 'rehal' | 'column' | 'buddha' | 'incense' | 'cushion' | 'gong' | 'tokonoma'
  | 'hay' | 'stall' | 'cow' | 'horse' | 'cart' | 'tools' | 'trough' | 'sacks' | 'millstone' | 'gear'
  | 'lens' | 'plinth' | 'model' | 'vitrine' | 'bench' | 'placard' | 'fountain' | 'majlis'
  | 'hearth' | 'pots' | 'barrel' | 'bottles' | 'elevator' | 'reception' | 'cooler' | 'printer' | 'drum';

export interface Item {
  kind: ItemKind;
  /** Centre of its footprint, in the room's frame. */
  x: number;
  z: number;
  /** Its base over the floor: a picture on a wall, a lamp hung from the ceiling. */
  y: number;
  /** Quarter turns about +Y: 0 faces +Z (into the room), 2 faces the door. */
  q: number;
  /** Across and back to front in its own frame, and how tall. */
  w: number;
  d: number;
  h: number;
  /** A wall a body walks round; rugs, pictures and lamps overhead are not. */
  solid: boolean;
  /** Its colours, palette entries or tones of them, in the order its builder reads them. */
  colors: number[];
  /** A small integer its builder varies the shape by. */
  n: number;
}

export type Role = 'keeper' | 'visitor' | 'family' | 'worshipper' | 'staff';

export interface Figure {
  /** The person: the same key is the same face, clothes and voice (`folk.ts`, `talk.ts`). */
  key: string;
  x: number;
  z: number;
  /** Radians about +Y, Three's convention: 0 faces +Z. */
  yaw: number;
  role: Role;
}

export type Wall = 'front' | 'back' | 'left' | 'right';

/** A window: which wall, where along it (a coordinate on that wall's axis), how high its sill, how big. */
export interface Opening {
  wall: Wall;
  /** Along the wall: `x` on the front and back, `z` on the sides; for a round room, the angle. */
  at: number;
  y: number;
  w: number;
  h: number;
  /** Stained glass, a colour a pane; or null for clear glass that shows the hour outside. */
  stained: number[] | null;
  /** Paper screens rather than glass: a shoji's lattice. */
  paper: boolean;
}

export type Sound = 'home' | 'shop' | 'church' | 'mosque' | 'temple' | 'barn' | 'sea' | 'office' | 'museum';

export type FloorPattern = 'boards' | 'tiles' | 'tatami' | 'stone' | 'carpet' | 'straw' | 'plain';

export interface InteriorPlan {
  key: string;
  type: RoomType;
  /** What the prompt at the door calls it: *the bakery*, *the Eiffel Tower museum*. */
  title: string;
  /** The words on the prompt going in and coming out. */
  enter: string;
  leave: string;
  shape: 'box' | 'round';
  /** Sides of a round room's wall. */
  sides: number;
  width: number;
  depth: number;
  height: number;
  colors: { floor: number; floorAlt: number; wall: number; dado: number; ceiling: number; trim: number };
  floor: FloorPattern;
  /** Beams under the ceiling: a cabin, a barn, a machiya. */
  beams: boolean;
  /** Open to the sky in the middle: a riad's courtyard. */
  courtyard: boolean;
  door: { w: number; h: number };
  openings: Opening[];
  items: Item[];
  people: Figure[];
  /** Where the player arrives: just inside the door, facing in. */
  spawn: { x: number; z: number };
  sound: Sound;
  /** A bell over the door. */
  bell: boolean;
  /** A monument's id, for its miniature; and the sentence its card carries. */
  monument: string | null;
  note: string | null;
}

/** What a door says about the building behind it: all a plan is a function of. */
export interface DoorIdentity {
  /** Unique and stable: a town's seed and plot, a country piece's cell, a monument's id. */
  key: string;
  /** The part standing there, a country piece's id, or `'monument'`. */
  building: string;
  kind: 'dwelling' | 'block' | 'civic' | 'country' | 'monument';
  region: string;
  /** Of the town it stands in; 0 in the country. */
  population: number;
  /** 1 at the town's centre, 0 at its edge. */
  central: number;
  /** The building's own height, in world units. */
  height: number;
  /** A monument's id and name, and its card's sentence. */
  monument?: string;
  name?: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Which room
// ---------------------------------------------------------------------------

const P = PALETTE;

/** The shops a town keeps, by weight; a bigger town keeps more kinds. */
const SHOPS: readonly { item: RoomType; weight: number; from: number }[] = [
  { item: 'bakery', weight: 4, from: 0 },
  { item: 'grocery', weight: 4, from: 0 },
  { item: 'cafe', weight: 4, from: 0 },
  { item: 'bar', weight: 2, from: 2000 },
  { item: 'restaurant', weight: 3, from: 5000 },
  { item: 'bookshop', weight: 2, from: 10000 },
  { item: 'clothes', weight: 2, from: 10000 },
  { item: 'pharmacy', weight: 2, from: 5000 },
];

function shopFor(rng: Rng, population: number): RoomType {
  return rng.weighted(SHOPS.filter((shop) => population >= shop.from));
}

/**
 * The room behind a door: by the building's part, its region and how big and
 * how central in its town it stands. Blocks keep shops on the high street and
 * flats further out; a house near the middle of a town of any size is now and
 * then a shop; a tower's door is its lobby or a floor of offices.
 */
export function roomTypeOf(id: DoorIdentity): RoomType {
  const rng = rngFrom(id.key, 'room');
  const region = id.region;
  switch (id.building) {
    case 'monument':
      return 'museum';
    case 'lighthouse':
      return 'lighthouse';
    case 'barn':
      return 'barn';
    case 'windmill':
      return 'mill';
    case 'chapel':
      return 'chapel';
    case 'ger':
    case 'nomad-tent':
      return 'yurt';
    case 'fishing-hut':
      return 'hut';
    case 'steeple-church':
    case 'clapboard-church':
      return 'church';
    case 'minaret-mosque':
      return 'mosque';
    case 'pagoda':
      return 'temple';
    case 'skyscraper':
      return rng.chance(0.55) ? 'lobby' : 'office';
    case 'round-hut':
    case 'stilt-house':
      return 'hut';
  }
  const busy = id.population >= 800 && id.central > 0.35;
  if (id.kind === 'block') {
    if (id.building === 'tower-block' && rng.chance(0.35)) return 'office';
    if (rng.chance(busy ? 0.75 : 0.3)) return shopFor(rng, id.population);
    return 'flat';
  }
  if (id.kind === 'civic') return region === 'maghreb' || region === 'middle-east' ? 'mosque' : 'church';
  if (busy && rng.chance(0.3 + id.central * 0.3)) return shopFor(rng, id.population);
  if (id.building === 'machiya') return 'tatami';
  if (region === 'east-asia' && rng.chance(0.4)) return 'tatami';
  if ((region === 'maghreb' || region === 'middle-east') && (id.building === 'flat-roof-house' || rng.chance(0.5))) return 'riad';
  if (region === 'nordic' || region === 'polar') return 'cabin';
  if (region === 'sub-saharan' && rng.chance(0.5)) return 'hut';
  return 'home';
}

const TITLES: Record<RoomType, string> = {
  home: 'the house',
  flat: 'the flat',
  cabin: 'the cabin',
  tatami: 'the machiya',
  riad: 'the riad',
  hut: 'the hut',
  yurt: 'the yurt',
  bakery: 'the bakery',
  grocery: 'the grocer’s',
  cafe: 'the café',
  bar: 'the bar',
  bookshop: 'the bookshop',
  clothes: 'the clothes shop',
  pharmacy: 'the pharmacy',
  restaurant: 'the restaurant',
  office: 'the offices',
  lobby: 'the tower',
  church: 'the church',
  chapel: 'the chapel',
  mosque: 'the mosque',
  temple: 'the temple',
  barn: 'the barn',
  mill: 'the mill',
  lighthouse: 'the lighthouse',
  museum: 'the museum',
};

/** What the prompt at a door says, without planning the room: the type's choice is a few draws. */
export function enterLabel(id: DoorIdentity): string {
  const type = roomTypeOf(id);
  if (type === 'lighthouse') return 'Climb the lighthouse';
  return `Enter ${type === 'museum' && id.name !== undefined ? `the ${id.name} museum` : TITLES[type]}`;
}

// ---------------------------------------------------------------------------
// The layout
// ---------------------------------------------------------------------------

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** A piece's footprint in the room: its own `w` by `d`, turned by `q` quarter turns. */
export function footprintOf(item: Pick<Item, 'x' | 'z' | 'q' | 'w' | 'd'>): Rect {
  const turned = (item.q & 1) === 1;
  const hw = (turned ? item.d : item.w) / 2;
  const hd = (turned ? item.w : item.d) / 2;
  return { x0: item.x - hw, x1: item.x + hw, z0: item.z - hd, z1: item.z + hd };
}

const overlapsRect = (a: Rect, b: Rect, gap: number): boolean =>
  a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.z0 < b.z1 + gap && b.z0 < a.z1 + gap;

/** How far a body keeps from anything it cannot walk through. */
export const BODY = BODY_RADIUS;
/** The walkway the plans leave between solid pieces, and from them to a wall: a body and a bit. */
const AISLE = BODY * 2 + 0.3;

/**
 * The room as it is being furnished: what stands, what is kept clear, and the
 * two questions every rule asks, *does this fit* and *put it there*.
 */
class Layout {
  readonly items: Item[] = [];
  readonly people: Figure[] = [];
  /** Clear floor: the way in from the door, an aisle, the space behind a counter. */
  readonly kept: Rect[] = [];
  /** How many of `items` are the room's point — a counter, an altar — and never taken out to open a pocket. */
  essential = 0;

  readonly key: string;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly round: boolean;

  constructor(key: string, width: number, depth: number, height: number, round: boolean) {
    this.key = key;
    this.width = width;
    this.depth = depth;
    this.height = height;
    this.round = round;
    // The way in: nothing stands within reach of the door.
    this.keep(-1.6 * M, 1.6 * M, 0, Math.min(2.6 * M, depth * 0.3));
  }

  keep(x0: number, x1: number, z0: number, z1: number): void {
    this.kept.push({ x0, x1, z0, z1 });
  }

  /** Whether a footprint is inside the walls — the circle, for a round room — by `margin`. */
  inside(r: Rect, margin = 0): boolean {
    if (this.round) {
      const radius = this.width / 2 - margin;
      const cz = this.depth / 2;
      for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]] as const) {
        if (Math.hypot(x, z - cz) > radius) return false;
      }
      return true;
    }
    const hw = this.width / 2 - margin;
    return r.x0 >= -hw && r.x1 <= hw && r.z0 >= margin && r.z1 <= this.depth - margin;
  }

  /** Whether `item` may stand: inside, off every kept rectangle, and `gap` clear of every solid piece. */
  fits(item: Item, gap = 0.12 * M): boolean {
    const r = footprintOf(item);
    if (!this.inside(r, 0.02)) return false;
    if (!item.solid) return true;
    for (const k of this.kept) if (overlapsRect(r, k, -1e-6)) return false;
    for (const other of this.items) {
      if (!other.solid) continue;
      if (overlapsRect(r, footprintOf(other), gap)) return false;
    }
    for (const person of this.people) {
      if (overlapsRect(r, { x0: person.x, x1: person.x, z0: person.z, z1: person.z }, BODY + 0.05)) return false;
    }
    return true;
  }

  put(item: Item, gap?: number): Item | null {
    if (!this.fits(item, gap)) return null;
    this.items.push(item);
    return item;
  }

  /** Puts it, and marks it as the point of the room: never taken out to open a pocket. */
  must(item: Item, gap?: number): Item | null {
    return this.mark(this.put(item, gap));
  }

  /** Marks a piece already placed as the point of the room. */
  mark(placed: Item | null): Item | null {
    if (placed !== null) {
      // Kept in front of the rest: `settle` takes pieces out from the back.
      this.items.splice(this.items.indexOf(placed), 1);
      this.items.splice(this.essential, 0, placed);
      this.essential++;
    }
    return placed;
  }

  /**
   * A piece with its back to a wall, facing into the room, its middle at `along`
   * on that wall's axis (`x` on the back and front walls, `z` on the sides).
   */
  against(wall: Wall, along: number, spec: Spec, rng: Rng, gap?: number): Item | null {
    const item = make(spec, rng);
    const inset = 0.03 * M + item.d / 2;
    if (wall === 'back') Object.assign(item, { x: along, z: this.depth - inset, q: 2 });
    else if (wall === 'front') Object.assign(item, { x: along, z: inset, q: 0 });
    else if (wall === 'left') Object.assign(item, { x: -this.width / 2 + inset, z: along, q: 1 });
    else Object.assign(item, { x: this.width / 2 - inset, z: along, q: 3 });
    return this.put(item, gap);
  }

  /** The same for a flat thing hung on a wall at `y`: a picture, a cross, a sign. It stands on nothing. */
  hang(wall: Wall, along: number, y: number, spec: Spec, rng: Rng): Item {
    const item = make({ ...spec, solid: false }, rng);
    item.y = y;
    const inset = 0.01 * M + item.d / 2;
    if (wall === 'back') Object.assign(item, { x: along, z: this.depth - inset, q: 2 });
    else if (wall === 'front') Object.assign(item, { x: along, z: inset, q: 0 });
    else if (wall === 'left') Object.assign(item, { x: -this.width / 2 + inset, z: along, q: 1 });
    else Object.assign(item, { x: this.width / 2 - inset, z: along, q: 3 });
    this.items.push(item);
    return item;
  }

  /** Something that is not a wall to anybody: a rug, a lamp overhead. Placed as given. */
  lay(item: Item): Item {
    item.solid = false;
    this.items.push(item);
    return item;
  }

  /** A person standing at `(x, z)` if a body fits there, facing `yaw`. */
  stand(role: Role, x: number, z: number, yaw: number): boolean {
    const r: Rect = { x0: x - BODY, x1: x + BODY, z0: z - BODY, z1: z + BODY };
    if (!this.inside(r, 0.05)) return false;
    for (const other of this.items) if (other.solid && overlapsRect(r, footprintOf(other), 0.05)) return false;
    for (const p of this.people) if (Math.hypot(p.x - x, p.z - z) < BODY * 2 + 0.3) return false;
    // Nobody stands in the doorway.
    if (Math.hypot(x, z) < 2.4 * M) return false;
    this.people.push({ key: `${this.key}:${this.people.length}`, x, z, yaw, role });
    return true;
  }

  /** Somebody somewhere free, facing somewhere: up to `tries` random spots. */
  wander(role: Role, rng: Rng, tries = 24): boolean {
    for (let i = 0; i < tries; i++) {
      const x = rng.range(-this.width / 2 + BODY, this.width / 2 - BODY);
      const z = rng.range(BODY, this.depth - BODY);
      if (this.stand(role, x, z, rng.range(-Math.PI, Math.PI))) return true;
    }
    return false;
  }
}

/** What a rule asks for: the kind, its size in metres, and its colours. */
interface Spec {
  kind: ItemKind;
  w: number;
  d: number;
  h: number;
  colors: number[];
  solid?: boolean;
  n?: number;
}

function make(spec: Spec, rng: Rng): Item {
  return {
    kind: spec.kind,
    x: 0,
    z: 0,
    y: 0,
    q: 0,
    w: spec.w * M,
    d: spec.d * M,
    h: spec.h * M,
    solid: spec.solid ?? true,
    colors: spec.colors,
    n: spec.n ?? rng.int(4),
  };
}

/** A piece free-standing at `(x, z)` turned `q`. */
function at(spec: Spec, x: number, z: number, q: number, rng: Rng): Item {
  const item = make(spec, rng);
  item.x = x;
  item.z = z;
  item.q = q;
  return item;
}

// ---------------------------------------------------------------------------
// Pockets: every free floor reachable from the door
// ---------------------------------------------------------------------------

/** The grid `reachable` floods, in units. */
const POCKET_CELL = 0.5;

export interface Reach {
  /** Cells a body fits in. */
  free: number;
  /** Of those, how many the door reaches. */
  reached: number;
  /** A body at the spawn overlaps nothing. */
  spawnClear: boolean;
}

/**
 * Floods the floor a body of `BODY` fits in from the spawn: every cell whose
 * centre a body can stand on, the walls, the solid pieces and the people all
 * taken off. A room is sound when everything free is reached — no corner
 * sealed off by a counter — and `settle` below takes pieces out until it is.
 * `skipItem` and `skipPerson` leave one out, for `settle`'s question of
 * which removal would open the most.
 */
export function reachable(
  plan: Pick<InteriorPlan, 'width' | 'depth' | 'shape' | 'items' | 'people' | 'spawn'>,
  skipItem = -1,
  skipPerson = -1,
): Reach {
  const cols = Math.ceil(plan.width / POCKET_CELL);
  const rows = Math.ceil(plan.depth / POCKET_CELL);
  const open = new Uint8Array(cols * rows);
  const x0 = -plan.width / 2;
  const cx = (c: number): number => x0 + (c + 0.5) * POCKET_CELL;
  const cz = (r: number): number => (r + 0.5) * POCKET_CELL;
  const round = plan.shape === 'round';
  const radius = plan.width / 2;
  // The walls first: a cell is open when a body on it is inside them.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = cx(c);
      const z = cz(r);
      const inside = round
        ? Math.hypot(x, z - plan.depth / 2) <= radius - BODY
        : x >= x0 + BODY && x <= -x0 - BODY && z >= BODY && z <= plan.depth - BODY;
      if (inside) open[r * cols + c] = 1;
    }
  }
  // Then every solid piece and every person, stamped over the cells they reach.
  const stamp = (bx0: number, bx1: number, bz0: number, bz1: number, grow: number, hit: (x: number, z: number) => boolean): void => {
    const c0 = Math.max(0, Math.floor((bx0 - grow - x0) / POCKET_CELL));
    const c1 = Math.min(cols - 1, Math.floor((bx1 + grow - x0) / POCKET_CELL));
    const r0 = Math.max(0, Math.floor((bz0 - grow) / POCKET_CELL));
    const r1 = Math.min(rows - 1, Math.floor((bz1 + grow) / POCKET_CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (hit(cx(c), cz(r))) open[r * cols + c] = 0;
  };
  plan.items.forEach((item, i) => {
    if (!item.solid || i === skipItem) return;
    const f = footprintOf(item);
    stamp(f.x0, f.x1, f.z0, f.z1, BODY, (x, z) => {
      const dx = Math.max(f.x0 - x, 0, x - f.x1);
      const dz = Math.max(f.z0 - z, 0, z - f.z1);
      return dx * dx + dz * dz < BODY * BODY;
    });
  });
  plan.people.forEach((p, i) => {
    if (i === skipPerson) return;
    stamp(p.x, p.x, p.z, p.z, BODY * 2, (x, z) => Math.hypot(p.x - x, p.z - z) < BODY * 2);
  });
  let free = 0;
  for (let i = 0; i < open.length; i++) free += open[i]!;
  const sc = Math.floor((plan.spawn.x - x0) / POCKET_CELL);
  const sr = Math.floor(plan.spawn.z / POCKET_CELL);
  const start = sr * cols + sc;
  const spawnClear = sc >= 0 && sc < cols && sr >= 0 && sr < rows && open[start] === 1;
  let reached = 0;
  if (spawnClear) {
    const stack = [start];
    open[start] = 2;
    while (stack.length > 0) {
      const cell = stack.pop()!;
      reached++;
      const c = cell % cols;
      const r = (cell - c) / cols;
      if (c > 0 && open[cell - 1] === 1) { open[cell - 1] = 2; stack.push(cell - 1); }
      if (c < cols - 1 && open[cell + 1] === 1) { open[cell + 1] = 2; stack.push(cell + 1); }
      if (r > 0 && open[cell - cols] === 1) { open[cell - cols] = 2; stack.push(cell - cols); }
      if (r < rows - 1 && open[cell + cols] === 1) { open[cell + cols] = 2; stack.push(cell + cols); }
    }
  }
  return { free, reached, spawnClear };
}

/** How far a reach is from sound: sealed cells, and a spawn that is not clear counts as a room's worth. */
const unsound = (reach: Reach): number => reach.free - reach.reached + (reach.spawnClear ? 0 : 1e6);

/**
 * Takes out whatever seals floor off from the door, one piece or one person at
 * a time — whichever single removal opens the most, the latest placed on a
 * tie — until nothing is sealed and the spawn is clear. The essential pieces,
 * what the room is for, are never taken.
 */
function settle(layout: Layout, frame: Pick<InteriorPlan, 'width' | 'depth' | 'shape' | 'spawn'>): void {
  const plan = { ...frame, items: layout.items, people: layout.people };
  for (let guard = 0; guard < 64; guard++) {
    const now = unsound(reachable(plan));
    if (now === 0) return;
    // A piece first, then somebody passing through, and the keeper last: on a
    // tie the earlier kind goes.
    let best = now;
    let item = -1;
    let person = -1;
    for (let i = layout.items.length - 1; i >= layout.essential; i--) {
      if (!layout.items[i]!.solid) continue;
      const score = unsound(reachable(plan, i));
      if (score < best) [best, item, person] = [score, i, -1];
    }
    for (const keepers of [false, true]) {
      for (let i = layout.people.length - 1; i >= 0; i--) {
        if ((layout.people[i]!.role === 'keeper') !== keepers) continue;
        const score = unsound(reachable(plan, -1, i));
        if (score < best) [best, item, person] = [score, -1, i];
      }
    }
    if (person >= 0) layout.people.splice(person, 1);
    else if (item >= 0) layout.items.splice(item, 1);
    else {
      // No one removal helps: two pieces seal the pocket between them. Take
      // the latest solid piece out and ask again.
      let last = -1;
      for (let i = layout.items.length - 1; i >= layout.essential && last < 0; i--) if (layout.items[i]!.solid) last = i;
      if (last < 0) return;
      layout.items.splice(last, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const WOODS = [P.bark, P.brown, P.clay, P.tan, P.darkOlive] as const;
const FABRICS = [P.crimson, P.red, P.salmon, P.skyBlue, P.slate, P.olive, P.green, P.gold, P.pink, P.violet, P.apricot, P.tan] as const;
const BRIGHTS = [P.red, P.orange, P.gold, P.olive, P.green, P.skyBlue, P.violet, P.pink, P.apricot, P.salmon, P.crimson] as const;

/**
 * Each tone this file has made, and the palette colour and factor it came
 * from: `tone` takes only a palette colour, and a room darkens its own
 * already-toned wall for a dado. Module-level, so a plan and the kit agree.
 */
const TONES = new Map<number, readonly [number, number]>();

/** `color` darker or lighter by `factor`, whether it is a palette colour or a tone of one. */
export function retone(color: number, factor: number): number {
  const [base, was] = TONES.get(color) ?? [color, 1];
  const f = Math.min(1.5, Math.max(0.5, was * factor));
  const made = tone(base, f);
  if (made !== base && !TONES.has(made)) TONES.set(made, [base, f]);
  return made;
}

const shade = (rng: Rng, color: number, spread = 0.12): number => retone(color, 1 + rng.jitter() * spread);

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/** Room sizes in metres by type: width and depth ranges, the ceiling. */
const SIZES: Record<RoomType, { w: [number, number]; d: [number, number]; h: number; round?: number }> = {
  home: { w: [8, 10], d: [7.5, 9.5], h: 2.9 },
  flat: { w: [7.5, 9.5], d: [7, 9], h: 2.8 },
  cabin: { w: [7, 8.5], d: [7, 8.5], h: 2.8 },
  tatami: { w: [6.5, 8], d: [6.5, 8.5], h: 2.7 },
  riad: { w: [11, 13], d: [11, 13], h: 3.8 },
  hut: { w: [6.5, 7.5], d: [6.5, 7.5], h: 3, round: 10 },
  yurt: { w: [7, 8], d: [7, 8], h: 3.2, round: 12 },
  bakery: { w: [7, 9], d: [8, 10], h: 3 },
  grocery: { w: [9, 11], d: [9, 11], h: 3.1 },
  cafe: { w: [8, 10], d: [8, 10], h: 3 },
  bar: { w: [8, 10], d: [9, 11], h: 3 },
  bookshop: { w: [8, 10], d: [9, 11], h: 3 },
  clothes: { w: [8, 10], d: [9, 11], h: 3.1 },
  pharmacy: { w: [7, 9], d: [8, 9.5], h: 3 },
  restaurant: { w: [10, 12], d: [10, 12.5], h: 3.1 },
  office: { w: [12, 15], d: [10, 13], h: 3 },
  lobby: { w: [12, 15], d: [10, 12], h: 4.5 },
  church: { w: [11, 13], d: [18, 23], h: 7 },
  chapel: { w: [7, 8], d: [10, 12], h: 5 },
  mosque: { w: [14, 17], d: [13, 16], h: 7 },
  temple: { w: [10, 12], d: [10, 12.5], h: 5 },
  barn: { w: [10, 12], d: [13, 16], h: 6 },
  mill: { w: [6.5, 7.5], d: [6.5, 7.5], h: 3.4, round: 10 },
  lighthouse: { w: [6, 6.8], d: [6, 6.8], h: 3.2, round: 12 },
  museum: { w: [12, 14], d: [13, 16], h: 4.5 },
};

export function planInterior(id: DoorIdentity): InteriorPlan {
  const type = roomTypeOf(id);
  const rng = rngFrom(id.key, 'interior', type);
  const size = SIZES[type];
  const round = size.round !== undefined;
  const width = rng.range(size.w[0], size.w[1]) * M;
  const depth = round ? width : rng.range(size.d[0], size.d[1]) * M;
  const height = size.h * M;
  const style = REGIONS[(id.region in REGIONS ? id.region : 'atlantic-europe') as RegionId];
  const layout = new Layout(id.key, width, depth, height, round);

  const wall = shade(rng, rng.pick(style.walls), 0.06);
  const trim = shade(rng, rng.pick([P.bark, P.brown, P.darkOlive, ...style.trim]), 0.08);
  const plan: InteriorPlan = {
    key: id.key,
    type,
    title: type === 'museum' && id.name !== undefined ? `the ${id.name} museum` : TITLES[type],
    enter: '',
    leave: 'Leave',
    shape: round ? 'round' : 'box',
    sides: size.round ?? 4,
    width,
    depth,
    height,
    colors: {
      floor: shade(rng, rng.pick(WOODS)),
      floorAlt: 0,
      wall,
      dado: retone(wall, 0.82),
      ceiling: retone(P.white, 0.95),
      trim,
      },
    floor: 'boards',
    beams: false,
    courtyard: false,
    door: { w: 1.2 * M, h: 2.2 * M },
    openings: [],
    items: layout.items,
    people: layout.people,
    spawn: { x: 0, z: 1.3 * M },
    sound: 'home',
    bell: false,
    monument: id.monument ?? null,
    note: id.note ?? null,
  };
  plan.colors.floorAlt = retone(plan.colors.floor, 0.86);

  const furnish = FURNISH[type];
  furnish(layout, plan, rng, style.foliage);
  settle(layout, plan);
  plan.enter = enterLabel(id);
  if (type === 'lighthouse') plan.leave = 'Go down';
  return plan;
}

type Furnisher = (layout: Layout, plan: InteriorPlan, rng: Rng, foliage: readonly number[]) => void;

// ---------------------------------------------------------------------------
// Pieces every room reaches for
// ---------------------------------------------------------------------------

const wood = (rng: Rng): number => shade(rng, rng.pick(WOODS));
const fabric = (rng: Rng): number => shade(rng, rng.pick(FABRICS));

/** Windows along the side walls and the back, evenly, `count` a wall at most. */
function windows(plan: InteriorPlan, rng: Rng, walls: readonly Wall[], count: number, w: number, h: number, sill: number, stained = false, paper = false): void {
  for (const side of walls) {
    const span = side === 'back' || side === 'front' ? plan.width : plan.depth;
    const n = Math.max(1, Math.min(count, Math.floor(span / ((w + 1.2) * M))));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const at = side === 'back' || side === 'front' ? (t - 0.5) * plan.width : t * plan.depth;
      if (side === 'front' && Math.abs(at) < 2 * M) continue;
      plan.openings.push({
        wall: side,
        at,
        y: sill * M,
        w: w * M,
        h: h * M,
        stained: stained ? Array.from({ length: 6 }, () => rng.pick(BRIGHTS)) : null,
        paper,
      });
    }
  }
}

/** Windows round a round room, `count` of them, each on a side of its wall and none on the door's. */
function ringWindows(plan: InteriorPlan, count: number, w: number, h: number, sill: number): void {
  const taken = new Set<number>([0]);
  for (let i = 0; i < count; i++) {
    const side = Math.round(((i + 0.5) * plan.sides) / count) % plan.sides;
    if (taken.has(side)) continue;
    taken.add(side);
    plan.openings.push({ wall: 'front', at: (side * Math.PI * 2) / plan.sides, y: sill * M, w: w * M, h: h * M, stained: null, paper: false });
  }
}

function plantIn(layout: Layout, rng: Rng, foliage: readonly number[], x: number, z: number): void {
  layout.put(at({ kind: 'plant', w: 0.5, d: 0.5, h: rng.range(0.8, 1.6), colors: [shade(rng, rng.pick([P.clay, P.bone, P.white, P.steel])), shade(rng, rng.pick(foliage))] }, x, z, 0, rng));
}

/** Pictures along a wall, on its free stretches. */
function pictures(layout: Layout, rng: Rng, wall: Wall, count: number, y = 1.4): void {
  const span = wall === 'back' || wall === 'front' ? layout.width : layout.depth;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const along = wall === 'back' || wall === 'front' ? (t - 0.5) * layout.width * 0.8 : 0.15 * span + t * span * 0.7;
    layout.hang(wall, along, y * M, { kind: rng.chance(0.15) ? 'mirror' : 'painting', w: rng.range(0.5, 1.1), d: 0.06, h: rng.range(0.4, 0.8), colors: [shade(rng, rng.pick([P.gold, P.bark, P.brown, P.white])), rng.pick(BRIGHTS), rng.pick(BRIGHTS), rng.pick(BRIGHTS)] }, rng);
  }
}

/** A ceiling lamp over `(x, z)`. */
function overhead(layout: Layout, rng: Rng, x: number, z: number, kind: ItemKind = 'hanging-lamp', color: number = P.gold): void {
  const drop = kind === 'chandelier' ? 1.2 * M : 0.7 * M;
  layout.lay({ ...make({ kind, w: kind === 'chandelier' ? 1.4 : 0.5, d: kind === 'chandelier' ? 1.4 : 0.5, h: drop / M, colors: [color, P.white] }, rng), x, z, y: layout.height - drop });
}

/** A few people wandering, `min` to `max`. */
function crowd(layout: Layout, rng: Rng, role: Role, min: number, max: number): void {
  const n = rng.between(min, max);
  for (let i = 0; i < n; i++) layout.wander(role, rng);
}

/**
 * A counter with a keeper behind it, across the room at `z`, from `x0` to `x1`.
 * The space behind is kept clear and open at one end, so the keeper's side of
 * the counter is never a sealed pocket.
 */
function counterAt(layout: Layout, rng: Rng, x0: number, x1: number, z: number, colors: number[], n = 0): Item | null {
  const w = (x1 - x0) / M;
  const counter = layout.must(at({ kind: 'counter', w, d: 0.7, h: 1.0, colors, n }, (x0 + x1) / 2, z, 2, rng));
  if (counter === null) return null;
  // At the end that meets a wall, if one does: a keeper in the middle of a
  // passage closed at one end would seal its far half off.
  const left = x0 + layout.width / 2;
  const right = layout.width / 2 - x1;
  const x = Math.min(left, right) < AISLE
    ? left < right ? -layout.width / 2 + BODY + 0.1 : layout.width / 2 - BODY - 0.1
    : (x0 + x1) / 2 + rng.jitter() * (x1 - x0) * 0.25;
  layout.stand('keeper', x, z + 0.35 * M + BODY + 0.3 * M, Math.PI);
  return counter;
}

// ---------------------------------------------------------------------------
// The rooms
// ---------------------------------------------------------------------------

/** A house: a sitting room at the front, a kitchen and a table on one side, a bed at the back. */
const home: Furnisher = (layout, plan, rng, foliage) => {
  const cabin = plan.type === 'cabin';
  const flat = plan.type === 'flat';
  if (cabin) {
    plan.colors.wall = shade(rng, rng.pick([P.tan, P.brown, P.sand]), 0.06);
    plan.colors.dado = retone(plan.colors.wall, 0.8);
    plan.colors.floor = shade(rng, P.brown);
    plan.colors.floorAlt = retone(plan.colors.floor, 0.86);
    plan.beams = true;
  } else if (flat && rng.chance(0.5)) {
    plan.floor = 'tiles';
    plan.colors.floor = shade(rng, rng.pick([P.bone, P.sand, P.white, P.tan]));
    plan.colors.floorAlt = retone(plan.colors.floor, 0.85);
  }
  windows(plan, rng, ['left', 'right', 'back'], 2, 1.1, 1.3, 0.9);
  const W = layout.width;
  const D = layout.depth;
  const flip = rng.sign();
  const woodA = wood(rng);
  const sofaColor = fabric(rng);

  // The bed at the back, on the flip side.
  layout.mark(layout.against('back', flip * (W / 2 - 1.4 * M), { kind: 'bed', w: 1.6, d: 2.1, h: 0.55, colors: [woodA, P.white, fabric(rng)] }, rng));
  layout.against(flip > 0 ? 'right' : 'left', D - 3.6 * M, { kind: 'wardrobe', w: 1.3, d: 0.6, h: 2.0, colors: [wood(rng), P.gold] }, rng);
  layout.against('back', flip * (W / 2 - 3 * M), { kind: 'chest', w: 0.5, d: 0.45, h: 0.55, colors: [woodA, P.gold] }, rng);

  // The kitchen along the other side wall at the back.
  const kitchenSide: Wall = flip > 0 ? 'left' : 'right';
  layout.mark(layout.against(kitchenSide, D - 1.6 * M, { kind: 'kitchen', w: 2.4, d: 0.65, h: 0.92, colors: [shade(rng, rng.pick([P.white, P.cream, P.skyBlue, P.olive, P.sand])), shade(rng, P.bone), P.steel] }, rng));
  layout.against(kitchenSide, D - 3.4 * M, { kind: cabin ? 'stove' : 'fridge', w: 0.75, d: 0.7, h: cabin ? 1.1 : 1.9, colors: [cabin ? P.steel : P.white, P.bark] }, rng);
  // The table and chairs in the middle of that side.
  const tx = -flip * (W / 2 - 2.4 * M);
  const tz = D * 0.52;
  const round = rng.chance(0.4);
  if (layout.put(at({ kind: round ? 'round-table' : 'table', w: 1.4, d: 0.9, h: 0.75, colors: [woodA, P.white] }, tx, tz, 0, rng))) {
    const chairColor = [wood(rng), fabric(rng)];
    for (const [dx, dz, q] of [[0, -0.8, 0], [0, 0.8, 2], [-1.05, 0, 1], [1.05, 0, 3]] as const) {
      if (rng.chance(0.2)) continue;
      layout.put(at({ kind: 'chair', w: 0.45, d: 0.45, h: 0.9, colors: chairColor }, tx + dx * M, tz + dz * M, q, rng), 0.05 * M);
    }
  }
  overhead(layout, rng, tx, tz);

  // The sitting room at the front, on the flip side.
  const sideWall: Wall = flip > 0 ? 'right' : 'left';
  const sofa = layout.against(sideWall, D * 0.36, { kind: 'sofa', w: 2.1, d: 0.9, h: 0.85, colors: [sofaColor, retone(sofaColor, 0.8)] }, rng);
  if (sofa !== null) {
    const cx = sofa.x - flip * 1.6 * M;
    layout.lay(at({ kind: 'rug', w: 2.6, d: 2.0, h: 0.02, colors: [fabric(rng), fabric(rng)] }, cx + flip * 0.2 * M, sofa.z, 1, rng));
    layout.put(at({ kind: 'low-table', w: 1.0, d: 0.55, h: 0.42, colors: [woodA] }, cx, sofa.z, 1, rng));
    layout.put(at({ kind: 'armchair', w: 0.9, d: 0.85, h: 0.85, colors: [fabric(rng), sofaColor] }, cx - flip * 1.3 * M, sofa.z + 1.2 * M, flip > 0 ? 1 : 3, rng));
  }
  layout.against(sideWall, D * 0.36 - 2.2 * M, { kind: 'lamp', w: 0.4, d: 0.4, h: 1.6, colors: [P.bark, P.cream] }, rng);
  layout.against('front', flip * (W / 2 - 1.3 * M), cabin
    ? { kind: 'stove', w: 0.9, d: 0.7, h: 1.2, colors: [P.steel, P.orange], n: 1 }
    : rng.chance(0.5)
      ? { kind: 'tv', w: 1.3, d: 0.45, h: 1.25, colors: [woodA, P.ink] }
      : { kind: 'bookshelf', w: 1.2, d: 0.35, h: 2.0, colors: [woodA, ...Array.from({ length: 4 }, () => rng.pick(BRIGHTS))] }, rng);
  layout.against('front', -flip * (W / 2 - 1.0 * M), { kind: 'bookshelf', w: 1.0, d: 0.35, h: 1.9, colors: [wood(rng), ...Array.from({ length: 4 }, () => rng.pick(BRIGHTS))] }, rng);
  plantIn(layout, rng, foliage, -flip * (W / 2 - 0.5 * M), D * 0.34);
  pictures(layout, rng, sideWall, 2);
  overhead(layout, rng, 0, D * 0.4);
  crowd(layout, rng, 'family', 1, 3);
};

/** A machiya's room: tatami, a low table, cushions round it, the alcove and the paper screens. */
const tatami: Furnisher = (layout, plan, rng) => {
  plan.floor = 'tatami';
  plan.colors.floor = shade(rng, P.sand, 0.05);
  plan.colors.floorAlt = shade(rng, P.olive, 0.05);
  plan.colors.wall = shade(rng, rng.pick([P.cream, P.sand, P.white]), 0.04);
  plan.colors.dado = shade(rng, P.bark);
  plan.colors.trim = shade(rng, P.bark);
  plan.beams = true;
  windows(plan, rng, ['left', 'right'], 2, 1.5, 1.6, 0.5, false, true);
  const W = layout.width;
  const D = layout.depth;
  const cz = D * 0.55;
  layout.must(at({ kind: 'low-table', w: 1.4, d: 0.9, h: 0.35, colors: [shade(rng, P.bark)] }, 0, cz, 0, rng));
  for (const [dx, dz] of [[0, -0.95], [0, 0.95], [-1.15, 0], [1.15, 0]] as const) {
    layout.lay(at({ kind: 'cushion', w: 0.6, d: 0.6, h: 0.1, colors: [shade(rng, rng.pick([P.crimson, P.skyBlue, P.violet, P.olive]))] }, dx * M, cz + dz * M, 0, rng));
  }
  layout.mark(layout.against('back', -W * 0.2, { kind: 'tokonoma', w: 1.8, d: 0.7, h: 2.2, colors: [shade(rng, P.bark), shade(rng, P.cream), rng.pick([P.olive, P.green]), P.ink] }, rng));
  layout.against('back', W * 0.28, { kind: 'chest', w: 1.0, d: 0.45, h: 1.1, colors: [shade(rng, P.bark), P.steel], n: 2 }, rng);
  layout.against(rng.chance(0.5) ? 'left' : 'right', D * 0.3, { kind: 'mat-bed', w: 1.0, d: 2.0, h: 0.15, colors: [P.white, shade(rng, P.skyBlue)], solid: false }, rng);
  layout.against('front', W * 0.3, { kind: 'lantern', w: 0.35, d: 0.35, h: 0.8, colors: [P.bark, P.cream] }, rng);
  overhead(layout, rng, 0, cz, 'lantern', P.cream);
  crowd(layout, rng, 'family', 1, 2);
};

/** A riad: the courtyard open to the sky, a fountain, trees in pots, cushions round the arcade. */
const riad: Furnisher = (layout, plan, rng, foliage) => {
  plan.floor = 'tiles';
  plan.courtyard = true;
  plan.colors.floor = shade(rng, rng.pick([P.white, P.cream, P.sand]), 0.04);
  plan.colors.floorAlt = shade(rng, rng.pick([P.skyBlue, P.olive, P.clay, P.green]), 0.06);
  plan.colors.wall = shade(rng, rng.pick([P.blush, P.salmon, P.sand, P.apricot]), 0.05);
  plan.colors.dado = shade(rng, rng.pick([P.skyBlue, P.olive, P.green]), 0.05);
  const W = layout.width;
  const D = layout.depth;
  const cz = D / 2;
  layout.must(at({ kind: 'fountain', w: 2.2, d: 2.2, h: 0.7, colors: [plan.colors.floorAlt, P.skyBlue, plan.colors.floor] }, 0, cz, 0, rng));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    layout.put(at({ kind: 'tree', w: 0.8, d: 0.8, h: 2.6, colors: [shade(rng, P.clay), shade(rng, rng.pick(foliage)), P.orange] }, sx * 2.4 * M, cz + sz * 2.4 * M, 0, rng));
  }
  // The arcade: columns a pace in from each wall.
  const inset = 1.6 * M;
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    for (const x of [-W / 2 + inset, W / 2 - inset]) {
      layout.put(at({ kind: 'column', w: 0.4, d: 0.4, h: plan.height / M, colors: [plan.colors.wall, plan.colors.dado] }, x, 1.6 * M + t * (D - 3.2 * M), 0, rng), 0.05 * M);
    }
  }
  const cushion = shade(rng, rng.pick([P.crimson, P.red, P.gold, P.violet]));
  for (const side of ['left', 'right'] as const) {
    layout.against(side, cz, { kind: 'majlis', w: 3.2, d: 0.8, h: 0.45, colors: [cushion, retone(cushion, 0.8), P.gold] }, rng);
  }
  layout.against('back', 0, { kind: 'majlis', w: 3.6, d: 0.8, h: 0.45, colors: [cushion, retone(cushion, 0.8), P.gold] }, rng);
  layout.put(at({ kind: 'low-table', w: 0.8, d: 0.8, h: 0.4, colors: [shade(rng, P.gold), P.white], n: 3 }, -W / 2 + 1.9 * M, cz + 2.2 * M, 1, rng));
  for (const x of [-W * 0.3, W * 0.3]) overhead(layout, rng, x, D * 0.8, 'lantern', P.gold);
  crowd(layout, rng, 'family', 1, 3);
};

/** A round hut, or a yurt: the hearth in the middle, mats, pots, a bed along the wall. */
const hut: Furnisher = (layout, plan, rng) => {
  const yurt = plan.type === 'yurt';
  plan.floor = yurt ? 'carpet' : 'straw';
  plan.colors.floor = yurt ? shade(rng, rng.pick([P.crimson, P.red, P.clay])) : shade(rng, P.tan);
  plan.colors.floorAlt = yurt ? shade(rng, P.gold) : retone(plan.colors.floor, 0.85);
  plan.colors.wall = yurt ? shade(rng, rng.pick([P.cream, P.white, P.sand])) : shade(rng, rng.pick([P.clay, P.tan, P.brown]));
  plan.colors.dado = yurt ? shade(rng, rng.pick([P.crimson, P.orange, P.skyBlue])) : retone(plan.colors.wall, 0.8);
  plan.colors.ceiling = yurt ? shade(rng, P.orange) : shade(rng, P.gold, 0.1);
  plan.beams = true;
  ringWindows(plan, yurt ? 0 : 3, 0.7, 0.6, 1.1);
  const D = layout.depth;
  const cz = D / 2;
  layout.must(at({ kind: 'hearth', w: 1.2, d: 1.2, h: 0.35, colors: [P.steel, P.orange, P.gold] }, 0, cz, 0, rng));
  const R = layout.width / 2;
  const ringAt = (angle: number, inset: number): [number, number] => [Math.sin(angle) * (R - inset), cz - Math.cos(angle) * (R - inset)];
  const bedAngle = Math.PI * rng.range(0.7, 1.3);
  const [bx, bz] = ringAt(bedAngle, 0.75 * M);
  layout.put(at({ kind: 'mat-bed', w: 2.0, d: 0.9, h: 0.3, colors: [shade(rng, rng.pick([P.crimson, P.gold, P.olive])), P.cream] }, bx, bz, 1, rng));
  for (let i = 0; i < 4; i++) {
    const [x, z] = ringAt(Math.PI * (0.45 + i * 0.35) * rng.sign(), 0.5 * M);
    layout.put(at({ kind: yurt ? 'chest' : 'pots', w: 0.6, d: 0.5, h: 0.6, colors: [shade(rng, yurt ? P.orange : P.clay), P.gold] }, x, z, 0, rng));
  }
  layout.lay(at({ kind: 'rug', w: 1.4, d: 1.0, h: 0.02, colors: [shade(rng, rng.pick([P.olive, P.clay, P.crimson])), P.gold] }, 0, cz - 1.5 * M, 0, rng));
  if (yurt) {
    for (const dx of [-0.9, 0.9]) layout.put(at({ kind: 'column', w: 0.18, d: 0.18, h: plan.height / M, colors: [P.orange, P.crimson] }, dx * M, cz + 1.2 * M, 0, rng));
  } else layout.put(at({ kind: 'drum', w: 0.5, d: 0.5, h: 0.6, colors: [P.brown, P.sand] }, ringAt(Math.PI * 0.55, 0.9 * M)[0], ringAt(Math.PI * 0.55, 0.9 * M)[1], 0, rng));
  crowd(layout, rng, 'family', 1, 3);
};

/** A shop's walls: `kind` along both sides, as many as fit, from the back to `from`. */
function sideRuns(layout: Layout, rng: Rng, spec: () => Spec, from: number, walls: readonly Wall[] = ['left', 'right']): void {
  for (const side of walls) {
    const first = spec();
    for (let z = layout.depth - (first.w / 2 + 0.2) * M; z > from; z -= (first.w + 0.1) * M) {
      layout.against(side, z, spec(), rng);
    }
  }
}

const goods = (rng: Rng, set: readonly number[] = BRIGHTS): number[] => Array.from({ length: 5 }, () => rng.pick(set));

const bakery: Furnisher = (layout, plan, rng) => {
  plan.sound = 'shop';
  plan.bell = true;
  plan.floor = 'tiles';
  plan.colors.floor = shade(rng, rng.pick([P.white, P.cream, P.bone]));
  plan.colors.floorAlt = shade(rng, rng.pick([P.clay, P.tan, P.steel]));
  windows(plan, rng, ['left', 'right'], 1, 1.4, 1.4, 0.9);
  const W = layout.width;
  const D = layout.depth;
  const cz = D * 0.62;
  layout.mark(layout.against('back', -W * 0.18, { kind: 'oven', w: 1.8, d: 1.0, h: 2.0, colors: [shade(rng, P.clay), P.ink, P.orange] }, rng));
  const counter = counterAt(layout, rng, -W / 2 + 0.2 * M, W / 2 - 1.8 * M, cz, [shade(rng, rng.pick([P.white, P.cream, P.skyBlue, P.pink])), shade(rng, P.bone), P.gold, P.brown], 1);
  if (counter !== null) layout.keep(-W / 2, W / 2, cz + 0.36 * M, cz + 0.36 * M + AISLE);
  layout.against('back', W * 0.22, { kind: 'bread-rack', w: 1.6, d: 0.45, h: 1.9, colors: [shade(rng, P.bark), P.apricot, P.gold, P.brown] }, rng);
  for (const side of ['left', 'right'] as const) layout.against(side, cz - 2.1 * M, { kind: 'bread-rack', w: 1.4, d: 0.45, h: 1.6, colors: [shade(rng, P.bark), P.apricot, P.gold, P.clay] }, rng);
  layout.put(at({ kind: 'round-table', w: 0.8, d: 0.8, h: 0.75, colors: [P.white, P.steel] }, W / 2 - 1.4 * M, 2.2 * M, 0, rng));
  layout.put(at({ kind: 'chair', w: 0.45, d: 0.45, h: 0.9, colors: [P.steel, P.red] }, W / 2 - 0.7 * M, 2.2 * M, 3, rng), 0.05 * M);
  layout.hang('back', 0, 2.2 * M, { kind: 'sign', w: 1.6, d: 0.08, h: 0.5, colors: [shade(rng, P.bark), P.cream, P.gold] }, rng);
  overhead(layout, rng, -W * 0.2, cz - 1.2 * M);
  overhead(layout, rng, W * 0.2, cz - 1.2 * M);
  crowd(layout, rng, 'visitor', 1, 2);
};

const grocery: Furnisher = (layout, plan, rng) => {
  plan.sound = 'shop';
  plan.bell = true;
  plan.floor = 'tiles';
  plan.colors.floor = shade(rng, rng.pick([P.bone, P.white, P.sand]));
  plan.colors.floorAlt = shade(rng, rng.pick([P.green, P.steel, P.tan]));
  windows(plan, rng, ['left'], 1, 1.4, 1.2, 1.0);
  const W = layout.width;
  const D = layout.depth;
  const flip = rng.sign();
  counterAt(layout, rng, flip > 0 ? W / 2 - 2.6 * M : -W / 2 + 0.3 * M, flip > 0 ? W / 2 - 0.3 * M : -W / 2 + 2.6 * M, 3.1 * M, [shade(rng, rng.pick([P.green, P.red, P.skyBlue])), P.bone, P.steel, P.gold], 2);
  layout.keep(-W / 2, W / 2, 3.1 * M + 0.36 * M, 3.1 * M + 0.36 * M + AISLE);
  // Two or three double-sided runs of shelves down the middle.
  const runs = W > 10.5 * M ? 3 : 2;
  const length = D - 7.2 * M;
  for (let i = 0; i < runs; i++) {
    const x = (i - (runs - 1) / 2) * 2.6 * M;
    if (length > 1.5 * M) layout.put(at({ kind: 'shelves', w: length / M, d: 0.9, h: 1.6, colors: [P.bone, ...goods(rng)], n: 1 }, x, 5.3 * M + length / 2, 1, rng));
  }
  layout.against('back', 0, { kind: 'fridge', w: Math.min(4, W / M - 2), d: 0.8, h: 2.0, colors: [P.white, P.skyBlue], n: 1 }, rng);
  sideRuns(layout, rng, () => ({ kind: 'crates', w: 1.2, d: 0.7, h: 0.8, colors: [shade(rng, P.tan), ...goods(rng, [P.red, P.orange, P.gold, P.green, P.olive])] }), 4.2 * M);
  crowd(layout, rng, 'visitor', 1, 3);
};

const cafe: Furnisher = (layout, plan, rng, foliage) => {
  const bar = plan.type === 'bar';
  plan.sound = 'shop';
  plan.bell = !bar;
  plan.floor = rng.chance(0.5) ? 'boards' : 'tiles';
  if (plan.floor === 'tiles') {
    plan.colors.floor = shade(rng, rng.pick([P.white, P.cream]));
    plan.colors.floorAlt = shade(rng, rng.pick([P.ink, P.bark, P.steel]));
  }
  if (bar) {
    plan.colors.wall = shade(rng, rng.pick([P.crimson, P.darkOlive, P.bark, P.clay]), 0.06);
    plan.colors.dado = retone(plan.colors.wall, 0.75);
  }
  windows(plan, rng, ['left', 'right'], 2, 1.3, 1.4, 0.9);
  const W = layout.width;
  const D = layout.depth;
  const counterColors = [shade(rng, bar ? P.bark : rng.pick([P.bark, P.white, P.skyBlue])), shade(rng, bar ? P.brown : P.bone), P.steel, P.gold];
  const cz = D - 2.2 * M;
  layout.mark(layout.against('back', W * 0.02, bar
    ? { kind: 'bottles', w: 3.2, d: 0.4, h: 2.0, colors: [shade(rng, P.bark), P.green, P.gold, P.crimson, P.skyBlue] }
    : { kind: 'coffee', w: 1.6, d: 0.6, h: 1.0, colors: [shade(rng, P.bark), P.steel, P.ink] }, rng));
  counterAt(layout, rng, -W / 2 + 1.4 * M, W / 2 - 0.2 * M, cz, counterColors, bar ? 3 : 0);
  layout.keep(-W / 2, W / 2, cz + 0.36 * M, cz + 0.36 * M + AISLE);
  if (bar) {
    for (let x = -W / 2 + 2.2 * M; x < W / 2 - 1 * M; x += 1.1 * M) {
      layout.put(at({ kind: 'stool', w: 0.4, d: 0.4, h: 0.8, colors: [P.steel, P.crimson] }, x, cz - 0.95 * M, 2, rng), 0.05 * M);
    }
    layout.against('left', D * 0.35, { kind: 'barrel', w: 0.8, d: 0.8, h: 1.1, colors: [shade(rng, P.brown), P.steel] }, rng);
  }
  const tableColor = [shade(rng, rng.pick([P.white, P.bark, P.steel])), P.steel];
  const chairColor = [shade(rng, rng.pick([P.bark, P.steel, P.red])), fabric(rng)];
  const rows = Math.floor((cz - 1.8 * M - 3.2 * M) / (2.3 * M)) + 1;
  for (let r = 0; r < rows; r++) {
    for (const sx of [-1, 1]) {
      const x = sx * W * 0.26;
      const z = 3.4 * M + r * 2.3 * M;
      if (!layout.put(at({ kind: 'round-table', w: 0.8, d: 0.8, h: 0.75, colors: tableColor }, x, z, 0, rng))) continue;
      layout.put(at({ kind: 'chair', w: 0.45, d: 0.45, h: 0.9, colors: chairColor }, x - 0.75 * M, z, 1, rng), 0.05 * M);
      layout.put(at({ kind: 'chair', w: 0.45, d: 0.45, h: 0.9, colors: chairColor }, x + 0.75 * M, z, 3, rng), 0.05 * M);
    }
  }
  plantIn(layout, rng, foliage, -W / 2 + 0.5 * M, 2.9 * M);
  pictures(layout, rng, 'left', 2, 1.6);
  pictures(layout, rng, 'right', 2, 1.6);
  for (let i = 0; i < 3; i++) overhead(layout, rng, (i - 1) * W * 0.3, D * 0.45);
  crowd(layout, rng, 'visitor', 1, 3);
};

const bookshop: Furnisher = (layout, plan, rng) => {
  plan.sound = 'shop';
  plan.bell = true;
  windows(plan, rng, ['right'], 1, 1.2, 1.3, 1.0);
  const W = layout.width;
  const D = layout.depth;
  const books = (): Spec => ({ kind: 'bookshelf', w: 1.2, d: 0.4, h: 2.2, colors: [shade(rng, rng.pick([P.bark, P.brown, P.darkOlive])), ...goods(rng)] });
  sideRuns(layout, rng, books, 2.6 * M, ['left']);
  for (let x = -W / 2 + 0.8 * M; x < W / 2 - 0.6 * M; x += 1.3 * M) layout.against('back', x, books(), rng);
  counterAt(layout, rng, W / 2 - 2.6 * M, W / 2 - 0.3 * M, 3.4 * M, [shade(rng, P.bark), shade(rng, P.brown), P.steel, P.gold], 2);
  layout.keep(W / 2 - 2.8 * M, W / 2, 3.4 * M + 0.36 * M, 3.4 * M + 0.36 * M + AISLE);
  for (let i = 0; i < 2; i++) {
    layout.put(at({ kind: 'bookcase', w: 2.4, d: 0.8, h: 1.5, colors: [shade(rng, P.bark), ...goods(rng)] }, -W * 0.08, D * (0.45 + i * 0.22), 1, rng));
  }
  layout.put(at({ kind: 'table', w: 1.4, d: 0.8, h: 0.8, colors: [shade(rng, P.brown), ...goods(rng)], n: 1 }, W * 0.22, D * 0.6, 1, rng));
  layout.put(at({ kind: 'armchair', w: 0.9, d: 0.85, h: 0.9, colors: [fabric(rng), P.bark] }, W / 2 - 0.9 * M, D * 0.82, 3, rng));
  overhead(layout, rng, 0, D * 0.5);
  crowd(layout, rng, 'visitor', 1, 2);
};

const clothes: Furnisher = (layout, plan, rng, foliage) => {
  plan.sound = 'shop';
  plan.bell = true;
  plan.floor = rng.chance(0.5) ? 'boards' : 'plain';
  plan.colors.wall = shade(rng, rng.pick([P.white, P.cream, P.blush]), 0.04);
  windows(plan, rng, ['left'], 1, 1.4, 1.6, 0.6);
  const W = layout.width;
  const D = layout.depth;
  const garments = (): number[] => [P.steel, ...goods(rng, FABRICS)];
  for (let r = 0; r < 2; r++) {
    for (const sx of [-1, 1]) {
      layout.put(at({ kind: 'rack', w: 1.8, d: 0.6, h: 1.6, colors: garments() }, sx * W * 0.22, 3.6 * M + r * 2.6 * M, 0, rng));
    }
  }
  layout.against('right', D - 1.3 * M, { kind: 'booth', w: 1.6, d: 1.3, h: 2.2, colors: [shade(rng, rng.pick([P.crimson, P.violet, P.darkOlive])), P.steel] }, rng);
  counterAt(layout, rng, -W / 2 + 0.3 * M, -W / 2 + 2.6 * M, D - 2.0 * M, [P.white, P.bone, P.steel, P.gold], 2);
  layout.keep(-W / 2, -W / 2 + 2.9 * M, D - 2.0 * M + 0.36 * M, D);
  for (const x of [-W / 2 + 0.8 * M, W / 2 - 0.8 * M]) {
    layout.put(at({ kind: 'mannequin', w: 0.5, d: 0.4, h: 1.8, colors: [P.bone, fabric(rng), fabric(rng)] }, x, 2.9 * M, x < 0 ? 1 : 3, rng));
  }
  layout.hang('back', W * 0.18, 0.4 * M, { kind: 'mirror', w: 1.0, d: 0.06, h: 1.8, colors: [P.gold, P.skyBlue] }, rng);
  plantIn(layout, rng, foliage, W / 2 - 0.5 * M, D * 0.5);
  crowd(layout, rng, 'visitor', 1, 2);
};

const pharmacy: Furnisher = (layout, plan, rng) => {
  plan.sound = 'shop';
  plan.bell = true;
  plan.floor = 'tiles';
  plan.colors.floor = P.white;
  plan.colors.floorAlt = shade(rng, rng.pick([P.green, P.skyBlue]));
  plan.colors.wall = shade(rng, rng.pick([P.white, P.cream]), 0.03);
  plan.colors.dado = shade(rng, P.green, 0.05);
  windows(plan, rng, ['left'], 1, 1.3, 1.3, 1.0);
  const W = layout.width;
  const D = layout.depth;
  const medicine = (): Spec => ({ kind: 'shelves', w: 1.3, d: 0.4, h: 2.1, colors: [P.white, ...goods(rng, [P.white, P.green, P.skyBlue, P.red, P.bone])] });
  const cz = D - 2.3 * M;
  counterAt(layout, rng, -W / 2 + 0.3 * M, W / 2 - 1.8 * M, cz, [P.white, shade(rng, P.green), P.steel, P.gold], 2);
  layout.keep(-W / 2, W / 2, cz + 0.36 * M, cz + 0.36 * M + AISLE);
  for (let x = -W / 2 + 0.8 * M; x < W / 2 - 0.6 * M; x += 1.4 * M) layout.against('back', x, medicine(), rng);
  sideRuns(layout, rng, medicine, 3 * M, ['right']);
  layout.hang('left', D * 0.6, 1.6 * M, { kind: 'cross', w: 0.9, d: 0.1, h: 0.9, colors: [P.green, P.white], n: 1 }, rng);
  layout.against('left', 3.4 * M, { kind: 'bench', w: 1.6, d: 0.5, h: 0.45, colors: [P.steel, P.skyBlue] }, rng);
  crowd(layout, rng, 'visitor', 1, 2);
};

const restaurant: Furnisher = (layout, plan, rng, foliage) => {
  plan.sound = 'shop';
  windows(plan, rng, ['left', 'right'], 3, 1.2, 1.5, 0.8);
  const W = layout.width;
  const D = layout.depth;
  const cz = D - 2.6 * M;
  counterAt(layout, rng, -W / 2 + 1.6 * M, W / 2 - 1.6 * M, cz, [shade(rng, P.bark), shade(rng, P.steel), P.steel, P.gold], 1);
  layout.keep(-W / 2, W / 2, cz + 0.36 * M, cz + 0.36 * M + AISLE);
  layout.against('back', -W * 0.2, { kind: 'kitchen', w: 3.0, d: 0.7, h: 0.92, colors: [P.steel, P.bone, P.ink], n: 1 }, rng);
  layout.against('back', W * 0.25, { kind: 'oven', w: 1.4, d: 0.9, h: 1.8, colors: [P.steel, P.ink, P.orange], n: 1 }, rng);
  const cloth = shade(rng, rng.pick([P.white, P.cream, P.crimson, P.skyBlue]));
  const chairColor = [wood(rng), fabric(rng)];
  const cols = W > 11 * M ? 3 : 2;
  const rows = Math.max(1, Math.floor((cz - 1.2 * M - 3.4 * M) / (2.6 * M)) + 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * (W / cols);
      const z = 3.6 * M + r * 2.6 * M;
      if (!layout.put(at({ kind: 'table', w: 1.2, d: 0.8, h: 0.76, colors: [cloth, P.white], n: 2 }, x, z, 0, rng))) continue;
      for (const [dx, dz, q] of [[-0.35, -0.7, 0], [0.35, -0.7, 0], [-0.35, 0.7, 2], [0.35, 0.7, 2]] as const) {
        layout.put(at({ kind: 'chair', w: 0.45, d: 0.45, h: 0.95, colors: chairColor }, x + dx * M, z + dz * M, q, rng), 0.02 * M);
      }
      overhead(layout, rng, x, z);
    }
  }
  plantIn(layout, rng, foliage, -W / 2 + 0.5 * M, 2.6 * M);
  plantIn(layout, rng, foliage, W / 2 - 0.5 * M, 2.6 * M);
  pictures(layout, rng, 'left', 2);
  pictures(layout, rng, 'right', 2);
  crowd(layout, rng, 'visitor', 2, 3);
};

const office: Furnisher = (layout, plan, rng, foliage) => {
  plan.sound = 'office';
  plan.floor = 'carpet';
  plan.colors.floor = shade(rng, rng.pick([P.slate, P.steel, P.tan, P.darkOlive]));
  plan.colors.floorAlt = retone(plan.colors.floor, 0.9);
  plan.colors.wall = shade(rng, rng.pick([P.white, P.bone, P.cream]), 0.03);
  plan.colors.dado = plan.colors.wall;
  // The view: glass nearly floor to ceiling on three walls.
  windows(plan, rng, ['left', 'right', 'back'], 4, 1.8, (plan.height / M) - 0.8, 0.4);
  const W = layout.width;
  const D = layout.depth;
  const desk = [shade(rng, rng.pick([P.white, P.bone, P.tan])), P.steel, P.ink];
  const chair = [P.ink, shade(rng, rng.pick([P.slate, P.steel, P.crimson, P.skyBlue]))];
  const cols = Math.floor((W - 2 * M) / (3.4 * M));
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 3; r++) {
      const x = -W / 2 + 1.8 * M + (c + 0.5) * ((W - 3.6 * M) / cols);
      const z = 4.0 * M + r * 2.4 * M;
      if (z > D - 2.6 * M) continue;
      if (!layout.put(at({ kind: 'desk', w: 1.5, d: 0.75, h: 0.75, colors: desk }, x, z, 0, rng))) continue;
      layout.put(at({ kind: 'chair', w: 0.55, d: 0.55, h: 1.0, colors: chair, n: 3 }, x, z - 0.75 * M, 0, rng), 0.02 * M);
    }
  }
  layout.put(at({ kind: 'table', w: 2.6, d: 1.2, h: 0.75, colors: [desk[0]!, P.steel] }, 0, D - 1.6 * M, 0, rng));
  layout.against('left', 3.2 * M, { kind: 'cooler', w: 0.45, d: 0.45, h: 1.3, colors: [P.white, P.skyBlue] }, rng);
  layout.against('right', 3.2 * M, { kind: 'printer', w: 0.9, d: 0.6, h: 1.0, colors: [P.bone, P.ink] }, rng);
  plantIn(layout, rng, foliage, -W / 2 + 0.5 * M, D - 0.6 * M);
  plantIn(layout, rng, foliage, W / 2 - 0.5 * M, D - 0.6 * M);
  for (let i = 0; i < 3; i++) overhead(layout, rng, (i - 1) * W * 0.3, D * 0.5, 'hanging-lamp', P.white);
  crowd(layout, rng, 'staff', 2, 4);
};

const lobby: Furnisher = (layout, plan, rng, foliage) => {
  plan.sound = 'office';
  plan.floor = 'stone';
  plan.colors.floor = shade(rng, rng.pick([P.bone, P.white, P.sand]));
  plan.colors.floorAlt = shade(rng, rng.pick([P.steel, P.slate, P.bark]));
  plan.colors.wall = shade(rng, rng.pick([P.white, P.bone, P.tan]), 0.04);
  plan.colors.dado = shade(rng, rng.pick([P.bark, P.steel, P.slate]));
  windows(plan, rng, ['left', 'right'], 3, 1.6, 3.2, 0.3);
  const W = layout.width;
  const D = layout.depth;
  const lifts = W > 13 * M ? 4 : 3;
  for (let i = 0; i < lifts; i++) {
    layout.hang('back', (i - (lifts - 1) / 2) * 2.2 * M, 0, { kind: 'elevator', w: 1.5, d: 0.1, h: 2.5, colors: [P.steel, shade(rng, P.bone), P.gold] }, rng);
  }
  layout.keep(-W / 2, W / 2, D - 2.4 * M, D);
  const desk = layout.must(at({ kind: 'reception', w: 3.2, d: 0.9, h: 1.1, colors: [shade(rng, rng.pick([P.bark, P.white, P.steel])), P.gold, P.ink] }, W * 0.18, D * 0.52, 2, rng));
  if (desk !== null) layout.stand('keeper', desk.x, desk.z + 0.45 * M + BODY + 0.35 * M, Math.PI);
  const sofa = shade(rng, rng.pick([P.ink, P.bark, P.slate, P.crimson]));
  layout.against('left', D * 0.42, { kind: 'sofa', w: 2.4, d: 0.95, h: 0.8, colors: [sofa, retone(sofa, 0.8)] }, rng);
  layout.put(at({ kind: 'low-table', w: 1.2, d: 0.7, h: 0.4, colors: [P.steel, P.white], n: 1 }, -W / 2 + 2.2 * M, D * 0.42, 1, rng));
  layout.put(at({ kind: 'armchair', w: 0.9, d: 0.9, h: 0.8, colors: [sofa, P.steel] }, -W / 2 + 3.6 * M, D * 0.42, 3, rng));
  for (const [x, z] of [[-W / 2 + 0.6 * M, 3.2 * M], [W / 2 - 0.6 * M, 3.2 * M], [-W / 2 + 0.6 * M, D - 3 * M], [W / 2 - 0.6 * M, D - 3 * M]] as const) {
    plantIn(layout, rng, foliage, x, z);
  }
  overhead(layout, rng, 0, D * 0.45, 'chandelier', P.white);
  crowd(layout, rng, 'staff', 1, 3);
};

/** A church or a chapel: the aisle, the pews either side of it, the altar at the far end, stained glass. */
const church: Furnisher = (layout, plan, rng) => {
  const chapel = plan.type === 'chapel';
  plan.sound = 'church';
  plan.floor = 'stone';
  plan.colors.floor = shade(rng, rng.pick([P.bone, P.sand, P.tan]));
  plan.colors.floorAlt = shade(rng, rng.pick([P.clay, P.steel, P.brown]));
  plan.colors.wall = shade(rng, rng.pick([P.white, P.cream, P.sand, P.bone]), 0.04);
  plan.colors.dado = shade(rng, rng.pick([P.tan, P.bone, P.brown]));
  plan.beams = true;
  windows(plan, rng, ['left', 'right'], chapel ? 2 : 4, 1.1, chapel ? 2.0 : 3.2, chapel ? 1.6 : 2.2, true);
  plan.openings.push({ wall: 'back', at: 0, y: (plan.height / M - 3.4) * M, w: 1.6 * M, h: 2.6 * M, stained: Array.from({ length: 6 }, () => rng.pick(BRIGHTS)), paper: false });
  const W = layout.width;
  const D = layout.depth;
  const aisle = 1.8 * M;
  layout.keep(-aisle / 2, aisle / 2, 0, D - 3.4 * M);
  layout.lay(at({ kind: 'rug', w: aisle / M - 0.6, d: (D - 4.2 * M) / M, h: 0.02, colors: [shade(rng, rng.pick([P.crimson, P.red])), P.gold] }, 0, (D - 3.4 * M) / 2 + 0.5 * M, 0, rng));
  const altarZ = D - 1.6 * M;
  layout.must(at({ kind: 'altar', w: 2.2, d: 1.0, h: 1.0, colors: [shade(rng, rng.pick([P.bone, P.white, P.bark])), P.white, P.gold] }, 0, altarZ, 2, rng));
  layout.hang('back', 0, 2.2 * M, { kind: 'cross', w: 1.1, d: 0.12, h: 1.8, colors: [shade(rng, rng.pick([P.gold, P.bark]))] }, rng);
  for (const sx of [-1, 1]) layout.put(at({ kind: 'candles', w: 0.4, d: 0.4, h: 1.3, colors: [P.gold, P.cream, P.orange] }, sx * 1.8 * M, altarZ + 0.2 * M, 2, rng));
  layout.put(at({ kind: 'lectern', w: 0.6, d: 0.5, h: 1.2, colors: [shade(rng, P.bark), P.crimson] }, -2.6 * M, altarZ - 1.4 * M, 2, rng));
  if (!chapel) layout.against('back', W / 2 - 1.3 * M, { kind: 'organ', w: 1.8, d: 0.8, h: 3.2, colors: [shade(rng, P.bark), P.gold, P.bone] }, rng);
  // The pews: the aisle down the middle, a side aisle along each wall.
  const pewW = (W - aisle) / 2 - AISLE - 0.15 * M;
  const pew = [shade(rng, rng.pick([P.bark, P.brown, P.clay]))];
  for (let z = 3.4 * M; z < altarZ - 2.6 * M; z += 1.1 * M) {
    for (const sx of [-1, 1]) {
      layout.put(at({ kind: 'pew', w: pewW / M, d: 0.6, h: 0.95, colors: pew }, sx * (aisle / 2 + 0.03 * M + pewW / 2), z, 0, rng), 0.02 * M);
    }
  }
  const lamps = chapel ? 1 : 3;
  for (let i = 0; i < lamps; i++) overhead(layout, rng, 0, D * (0.25 + i * 0.25), 'chandelier', P.gold);
  // The congregation stands along the side aisles and at the front.
  const n = rng.between(1, chapel ? 2 : 4);
  for (let i = 0; i < n; i++) {
    const side = rng.sign();
    const x = side * (W / 2 - AISLE / 2 - 0.05 * M);
    for (let t = 0; t < 8; t++) if (layout.stand('worshipper', x, rng.range(3 * M, altarZ - 2 * M), 0)) break;
  }
};

const mosque: Furnisher = (layout, plan, rng) => {
  plan.sound = 'mosque';
  plan.floor = 'carpet';
  plan.colors.floor = shade(rng, rng.pick([P.crimson, P.red, P.clay, P.olive, P.darkOlive]), 0.05);
  plan.colors.floorAlt = shade(rng, rng.pick([P.gold, P.apricot, P.cream]), 0.05);
  plan.colors.wall = shade(rng, rng.pick([P.white, P.cream, P.sand]), 0.03);
  plan.colors.dado = shade(rng, rng.pick([P.skyBlue, P.olive, P.green]), 0.05);
  windows(plan, rng, ['left', 'right'], 3, 1.2, 2.4, 2.6, true);
  const W = layout.width;
  const D = layout.depth;
  layout.hang('back', 0, 0, { kind: 'mihrab', w: 2.0, d: 0.5, h: 3.4, colors: [plan.colors.dado, P.gold, plan.colors.wall, P.skyBlue] }, rng);
  layout.keep(-1.2 * M, 1.2 * M, D - 1.6 * M, D);
  layout.must(at({ kind: 'minbar', w: 1.0, d: 2.6, h: 3.0, colors: [shade(rng, P.bark), P.gold] }, 2.2 * M, D - 1.5 * M, 2, rng));
  // Columns in a grid, the prayer rows between them.
  for (const sx of [-1, 1]) {
    for (const t of [0.35, 0.65]) {
      layout.put(at({ kind: 'column', w: 0.6, d: 0.6, h: plan.height / M, colors: [plan.colors.wall, plan.colors.dado] }, sx * W * 0.25, D * t, 0, rng));
    }
  }
  for (let z = 3.2 * M; z < D - 2.4 * M; z += 1.4 * M) {
    layout.lay(at({ kind: 'rug', w: W / M - 1.2, d: 1.0, h: 0.015, colors: [plan.colors.floorAlt, plan.colors.floor], n: 1 }, 0, z, 0, rng));
  }
  for (const side of ['left', 'right'] as const) layout.against(side, D * 0.82, { kind: 'bookshelf', w: 1.6, d: 0.4, h: 1.2, colors: [shade(rng, P.bark), P.crimson, P.olive, P.darkOlive, P.gold] }, rng);
  layout.put(at({ kind: 'rehal', w: 0.5, d: 0.4, h: 0.3, colors: [shade(rng, P.bark), P.crimson] }, -2 * M, D - 3 * M, 2, rng));
  for (const [x, z] of [[-W * 0.25, D * 0.5], [W * 0.25, D * 0.5], [0, D * 0.3], [0, D * 0.7]] as const) overhead(layout, rng, x, z, 'chandelier', P.gold);
  crowd(layout, rng, 'worshipper', 1, 4);
};

const temple: Furnisher = (layout, plan, rng) => {
  plan.sound = 'temple';
  plan.floor = 'boards';
  plan.colors.floor = shade(rng, rng.pick([P.brown, P.bark, P.clay]));
  plan.colors.wall = shade(rng, rng.pick([P.cream, P.sand, P.white]), 0.04);
  plan.colors.dado = shade(rng, rng.pick([P.crimson, P.red]), 0.05);
  plan.colors.trim = shade(rng, P.crimson);
  plan.beams = true;
  windows(plan, rng, ['left', 'right'], 2, 1.4, 1.6, 1.0, false, true);
  const W = layout.width;
  const D = layout.depth;
  layout.must(at({ kind: 'buddha', w: 2.2, d: 1.8, h: 3.2, colors: [shade(rng, rng.pick([P.gold, P.apricot])), shade(rng, P.crimson), P.gold] }, 0, D - 1.2 * M, 2, rng));
  layout.must(at({ kind: 'altar', w: 2.0, d: 0.7, h: 0.9, colors: [shade(rng, P.crimson), P.gold, P.orange], n: 1 }, 0, D - 3.0 * M, 2, rng));
  layout.put(at({ kind: 'incense', w: 0.6, d: 0.6, h: 0.9, colors: [P.steel, P.gold, P.bone] }, 0, D - 4.2 * M, 0, rng));
  for (const sx of [-1, 1]) {
    layout.put(at({ kind: 'column', w: 0.45, d: 0.45, h: plan.height / M, colors: [P.crimson, P.gold] }, sx * W * 0.3, D * 0.4, 0, rng));
    layout.put(at({ kind: 'column', w: 0.45, d: 0.45, h: plan.height / M, colors: [P.crimson, P.gold] }, sx * W * 0.3, D * 0.7, 0, rng));
  }
  layout.against('left', D * 0.55, { kind: 'gong', w: 1.2, d: 0.6, h: 1.8, colors: [P.crimson, P.gold] }, rng);
  layout.against('right', D * 0.55, { kind: 'drum', w: 1.0, d: 1.0, h: 1.2, colors: [P.crimson, P.cream], n: 1 }, rng);
  for (let r = 0; r < 3; r++) {
    for (let c = -1; c <= 1; c++) {
      layout.lay(at({ kind: 'cushion', w: 0.6, d: 0.6, h: 0.1, colors: [shade(rng, rng.pick([P.gold, P.orange, P.crimson]))] }, c * 1.2 * M, D - 5.4 * M - r * 1.2 * M, 0, rng));
    }
  }
  for (const [x, z] of [[-W * 0.3, D * 0.25], [W * 0.3, D * 0.25], [-W * 0.3, D * 0.85], [W * 0.3, D * 0.85]] as const) overhead(layout, rng, x, z, 'lantern', P.red);
  crowd(layout, rng, 'worshipper', 1, 3);
};

const barn: Furnisher = (layout, plan, rng) => {
  plan.sound = 'barn';
  plan.floor = 'straw';
  plan.colors.floor = shade(rng, P.tan);
  plan.colors.floorAlt = shade(rng, P.gold, 0.08);
  plan.colors.wall = shade(rng, rng.pick([P.red, P.crimson, P.brown, P.clay]), 0.06);
  plan.colors.dado = retone(plan.colors.wall, 0.75);
  plan.colors.ceiling = shade(rng, P.brown);
  plan.beams = true;
  windows(plan, rng, ['left', 'right'], 2, 0.9, 0.8, 2.0);
  const W = layout.width;
  const D = layout.depth;
  const stallSide = rng.sign();
  // Stalls along one wall, each with an animal in it.
  const stall = [shade(rng, P.brown)];
  let n = 0;
  for (let z = 3.2 * M; z < D - 2.2 * M; z += 3.0 * M) {
    const x = stallSide * (W / 2 - 1.5 * M);
    if (!layout.put(at({ kind: 'stall', w: 2.8, d: 2.9, h: 1.3, colors: stall }, x, z, stallSide > 0 ? 3 : 1, rng))) continue;
    const beast = rng.chance(0.6) ? 'cow' : 'horse';
    layout.lay(at({ kind: beast, w: 0.9, d: 2.1, h: 1.5, colors: beast === 'cow' ? [P.white, P.ink, P.pink] : [shade(rng, rng.pick([P.brown, P.bark, P.clay])), P.ink, P.bark] }, x + stallSide * 0.1 * M, z, 1 + (n++ % 2) * 2, rng));
  }
  // Hay stacked on the other side, a cart, tools on the back wall.
  for (let i = 0; i < 4; i++) {
    layout.put(at({ kind: 'hay', w: 1.1, d: 0.7, h: 0.6 * rng.between(1, 3), colors: [shade(rng, P.gold, 0.1), P.olive] }, -stallSide * (W / 2 - 0.9 * M), D - 1.2 * M - i * 1.4 * M, 0, rng), 0.05 * M);
  }
  layout.put(at({ kind: 'cart', w: 1.5, d: 2.4, h: 1.2, colors: [shade(rng, P.brown), P.steel] }, -stallSide * W * 0.12, D * 0.45, 0, rng));
  layout.hang('back', 0, 1.0 * M, { kind: 'tools', w: 2.0, d: 0.1, h: 1.4, colors: [P.bark, P.steel] }, rng);
  layout.against('front', -stallSide * (W / 2 - 1.2 * M), { kind: 'trough', w: 1.6, d: 0.6, h: 0.5, colors: [shade(rng, P.brown), P.skyBlue] }, rng);
  for (let i = 0; i < 2; i++) overhead(layout, rng, 0, D * (0.3 + i * 0.4), 'lantern', P.gold);
  crowd(layout, rng, 'family', 1, 1);
};

const mill: Furnisher = (layout, plan, rng) => {
  plan.sound = 'barn';
  plan.floor = 'boards';
  plan.colors.wall = shade(rng, rng.pick([P.white, P.cream, P.sand]), 0.04);
  plan.colors.dado = shade(rng, P.bark);
  plan.beams = true;
  ringWindows(plan, 3, 0.6, 0.8, 1.3);
  const D = layout.depth;
  const cz = D / 2;
  layout.must(at({ kind: 'millstone', w: 1.8, d: 1.8, h: plan.height / M, colors: [P.bone, P.bark, P.steel] }, 0, cz + 0.4 * M, 0, rng));
  const R = layout.width / 2;
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI * (0.55 + i * 0.3);
    layout.put(at({ kind: 'sacks', w: 0.9, d: 0.7, h: 0.8, colors: [shade(rng, P.sand), P.cream] }, Math.sin(angle) * (R - 0.8 * M), cz - Math.cos(angle) * (R - 0.8 * M), 0, rng));
  }
  layout.lay({ ...make({ kind: 'gear', w: 1.6, d: 0.2, h: 1.6, colors: [P.brown, P.bark] }, rng), x: 0, z: cz + 0.4 * M, y: plan.height - 1.7 * M });
  crowd(layout, rng, 'keeper', 1, 1);
};

const lighthouse: Furnisher = (layout, plan, rng) => {
  plan.sound = 'sea';
  plan.floor = 'plain';
  plan.colors.floor = shade(rng, rng.pick([P.steel, P.slate]));
  plan.colors.floorAlt = retone(plan.colors.floor, 0.85);
  plan.colors.wall = shade(rng, rng.pick([P.white, P.red]), 0.04);
  plan.colors.dado = shade(rng, P.red);
  plan.colors.ceiling = shade(rng, P.steel);
  plan.door = { w: 1.0 * M, h: 2.0 * M };
  // The lamp room is glass all round.
  ringWindows(plan, 12, 1.4, 1.7, 0.9);
  const cz = layout.depth / 2;
  layout.must(at({ kind: 'lens', w: 1.5, d: 1.5, h: 2.1, colors: [P.steel, P.gold, P.cream] }, 0, cz + 0.3 * M, 0, rng));
  crowd(layout, rng, 'keeper', 0, 1);
};

const museum: Furnisher = (layout, plan, rng, foliage) => {
  plan.sound = 'museum';
  plan.floor = 'boards';
  plan.colors.floor = shade(rng, rng.pick([P.brown, P.tan, P.bark]));
  plan.colors.wall = shade(rng, rng.pick([P.white, P.cream, P.bone]), 0.03);
  plan.colors.dado = shade(rng, rng.pick([P.slate, P.darkOlive, P.crimson, P.steel]));
  const W = layout.width;
  const D = layout.depth;
  const cz = D * 0.55;
  // The landmark itself, small, under glass in the middle of the room.
  layout.must(at({ kind: 'plinth', w: 2.4, d: 2.4, h: 0.9, colors: [P.white, P.bone] }, 0, cz, 0, rng));
  layout.lay({ ...make({ kind: 'model', w: 2.0, d: 2.0, h: 2.0, colors: [] }, rng), x: 0, z: cz, y: 0.9 * M });
  layout.lay({ ...make({ kind: 'vitrine', w: 2.4, d: 2.4, h: 2.3, colors: [P.skyBlue, P.steel] }, rng), x: 0, z: cz, y: 0.9 * M });
  layout.must(at({ kind: 'placard', w: 0.8, d: 0.5, h: 1.1, colors: [P.bark, P.cream] }, 0, cz - 2.2 * M, 2, rng));
  for (const sx of [-1, 1]) {
    for (const t of [0.3, 0.75]) {
      layout.put(at({ kind: 'plinth', w: 0.9, d: 0.9, h: 1.1, colors: [P.white, rng.pick(BRIGHTS)], n: 1 }, sx * W * 0.32, D * t, 0, rng));
    }
    layout.put(at({ kind: 'bench', w: 1.8, d: 0.55, h: 0.45, colors: [shade(rng, P.bark), P.steel] }, sx * W * 0.2, cz, 1, rng));
  }
  for (const side of ['left', 'right', 'back'] as const) pictures(layout, rng, side, side === 'back' ? 3 : 4, 1.5);
  plantIn(layout, rng, foliage, -W / 2 + 0.5 * M, 3 * M);
  for (let i = 0; i < 3; i++) overhead(layout, rng, (i - 1) * W * 0.3, cz, 'hanging-lamp', P.white);
  layout.stand('staff', W / 2 - 1.2 * M, 3 * M, -Math.PI / 2);
  crowd(layout, rng, 'visitor', 1, 3);
};

const FURNISH: Record<RoomType, Furnisher> = {
  home,
  flat: home,
  cabin: home,
  tatami,
  riad,
  hut,
  yurt: hut,
  bakery,
  grocery,
  cafe,
  bar: cafe,
  bookshop,
  clothes,
  pharmacy,
  restaurant,
  office,
  lobby,
  church,
  chapel: church,
  mosque,
  temple,
  barn,
  mill,
  lighthouse,
  museum,
};

/** How thick the walls are to a body: far thicker than drawn, so nothing tunnels through one. */
const WALL_SOLID = 2;

/**
 * The room as walls a body cannot walk through (`scenery/solids.ts`), in the
 * room's frame: the four walls or the round wall's sides — the doorway closed,
 * because a door is left by `E` — every solid piece's footprint as tall as it
 * stands, and a disc for every person. `top` is a height over the floor, the
 * camera's question.
 */
export function roomSolids(plan: InteriorPlan): Solid[] {
  const out: Solid[] = [];
  const W = plan.width;
  const D = plan.depth;
  const top = plan.height + 1;
  const T = WALL_SOLID;
  if (plan.shape === 'round') {
    const R = W / 2;
    const step = (Math.PI * 2) / plan.sides;
    for (let i = 0; i < plan.sides; i++) {
      const a = i * step;
      out.push(yawed(Math.sin(a) * (R + T / 2), D / 2 - Math.cos(a) * (R + T / 2), -a, R * Math.tan(step / 2) + T, T / 2, top));
    }
  } else {
    out.push(yawed(-W / 2 - T / 2, D / 2, 0, T / 2, D / 2 + T, top));
    out.push(yawed(W / 2 + T / 2, D / 2, 0, T / 2, D / 2 + T, top));
    out.push(yawed(0, D + T / 2, 0, W / 2 + T, T / 2, top));
    out.push(yawed(0, -T / 2, 0, W / 2 + T, T / 2, top));
  }
  for (const item of plan.items) {
    if (!item.solid) continue;
    const f = footprintOf(item);
    out.push(yawed((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2, 0, (f.x1 - f.x0) / 2, (f.z1 - f.z0) / 2, item.y + item.h));
  }
  for (const person of plan.people) out.push(disc(person.x, person.z, BODY, AVATAR_HEIGHT));
  return out;
}

/** Which buildings in a region's kit and which country pieces have a door at all. */
export const COUNTRY_DOORS: ReadonlySet<string> = new Set(['barn', 'lighthouse', 'windmill', 'chapel', 'fishing-hut', 'ger', 'nomad-tent']);
