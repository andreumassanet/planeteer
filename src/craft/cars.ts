/**
 * The road craft built off the traffic kit's baked models: Kenney's
 * `hatchback-sports`, `van`, `suv` (the jeep), `truck` (the pickup) and
 * `tractor` (Car Kit, CC0) and Quaternius's `Bus` (Public Transport, CC0).
 *
 * The traffic fits these models to a lane (`PLACED_SECTION` in
 * `traffic/contract.ts`), which is too small to hold a seated body. Here they
 * are fitted so the roof clears the head of the person in it: the seated hip,
 * plus the crown over it, plus headroom. The car comes out a third larger than
 * the traffic's, and two of them are wider than a 7.2 road; it stands at a
 * road's end and does not pass anyone.
 *
 * Window triangles are taken out of the shell and drawn as glass (`windowsOf`,
 * `glassMaterial`), the shell is lined inside (`liner` in `cabin.ts`) and the
 * cabin is furnished to its own measure (`roadCabin`), so a driver and
 * passengers are seen from outside. Seats are placed off the model's own roof
 * line and floor (`seatsOf`, `seatHip`), folding the legs as a driver does
 * (`legs: 'drive'`).
 *
 * Left-hand drive: facing +Z with +Y up, +X is the driver's left, so seat 0 is
 * at +X.
 *
 * The wheels are split out of the baked body: the triangles on the pack's
 * `Tyre` and `Hub` slots are gathered into one wheel each (`wheelsOf`),
 * re-centred on their axle and handed over as a `'wheel'` that turns about +X.
 * Only a road wheel (standing on the road, axle across the car) turns; the
 * `suv`'s spare on its tailgate stays in the body.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { bodyPaint, isGlass, paintColors } from '../models.ts';
import type { Model } from '../models.ts';
import { PALETTE } from '../theme.ts';
import { tone } from '../monuments/contract.ts';
import { PLACED_SECTION, RIDER_HEIGHT } from '../traffic/contract.ts';
import type { CraftModel, Seat } from './contract.ts';
import type { WheelGrip } from '../cast.ts';
import { ABREAST, HERO } from './body.ts';
import { assemble, craftMaterial, finish, geometryOf, glassMaterial } from './build.ts';
import type { Soup, Turning } from './build.ts';
import { GLASS_TINT, WHEELS, joinSoups, liner, painted, probeOf, roadCabin } from './cabin.ts';
import type { CabinBox, RoadCabin, ShellProbe, WheelArch, WheelKind } from './cabin.ts';

const H = AVATAR_HEIGHT;

/**
 * The scale the pack's cars are drawn at: a hip a sole over a floor a
 * twenty-fifth of a body up, the crown over it and the same again of headroom.
 */
const CAR_HIP = HERO.sole + 0.04 * H;
/** The roof: the hip, the crown over it, and the same again of headroom. */
const CAR_ROOF = CAR_HIP + HERO.crown + 0.04 * H;

/** What the pack model is fitted to: the hatchback's roof, and the van at the same scale. */
const FIT_MODEL = 'hatchback-sports';

/** How many units of the world one of the pack's is, so the roof clears a seated head. */
function carScale(models: ReadonlyMap<string, Model>): number {
  const hatch = models.get(FIT_MODEL);
  if (hatch === undefined) throw new Error(`craft: the traffic kit has no '${FIT_MODEL}'`);
  return CAR_ROOF / (hatch.box.max.y - hatch.box.min.y);
}

/** Where a model's roof runs along its length, in the pack's units: z of every vertex in its top twentieth. */
function roofOf(model: Model): [number, number] {
  const p = model.geometry.getAttribute('position');
  const top = model.box.max.y;
  const band = (model.box.max.y - model.box.min.y) * 0.05;
  let aft = Infinity;
  let fore = -Infinity;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < top - band) continue;
    aft = Math.min(aft, p.getZ(i));
    fore = Math.max(fore, p.getZ(i));
  }
  return [aft, fore];
}

const WHEEL_SLOTS = /^(Tyre|Hub)$/;

/**
 * How near the road a wheel's bottom must be to count as on it, as a share of
 * the model's height.
 */
const ON_ROAD = 0.03;

/** One wheel as the pack draws it: its triangles and its box, in the pack's own units. */
export interface PackWheel {
  triangles: number[];
  box: THREE.Box3;
}

/**
 * A model's wheels, found by their triangles: the tyre's and the hub's
 * triangles joined where they share a corner, and pieces whose boxes meet
 * joined again (a hub is its own cylinder inside its tyre), so each is one
 * wheel whatever corner of the car it is at, and however many there are.
 * `road` are those standing on the road — the bottom within `ON_ROAD` of the
 * model's lowest point — with the axle across the car, the box narrowest in
 * X; `other` is the rest, a spare on a tailgate, which does not turn.
 */
export function wheelsOf(model: Model, isWheel: (triangle: number) => boolean): { road: PackWheel[]; other: PackWheel[] } {
  const position = model.geometry.getAttribute('position');
  const index = model.geometry.index;
  const vertexOf = (corner: number): number => (index !== null ? index.getX(corner) : corner);
  const triangleCount = (index !== null ? index.count : position.count) / 3;
  // Union-find over the wheel triangles, by the corners they share (to 1e-4).
  const parent = new Map<number, number>();
  const find = (t: number): number => {
    let r = t;
    while (parent.get(r)! !== r) r = parent.get(r)!;
    while (parent.get(t)! !== r) {
      const next = parent.get(t)!;
      parent.set(t, r);
      t = next;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb));
  };
  const byCorner = new Map<string, number>();
  const q = (v: number): number => Math.round(v * 1e4);
  for (let t = 0; t < triangleCount; t++) {
    if (!isWheel(t)) continue;
    parent.set(t, t);
    for (let c = 0; c < 3; c++) {
      const v = vertexOf(t * 3 + c);
      const key = `${q(position.getX(v))},${q(position.getY(v))},${q(position.getZ(v))}`;
      const seen = byCorner.get(key);
      if (seen === undefined) byCorner.set(key, t);
      else union(seen, t);
    }
  }
  const pieces = new Map<number, PackWheel>();
  const point = new THREE.Vector3();
  for (const t of parent.keys()) {
    const root = find(t);
    let piece = pieces.get(root);
    if (piece === undefined) pieces.set(root, (piece = { triangles: [], box: new THREE.Box3() }));
    piece.triangles.push(t);
    for (let c = 0; c < 3; c++) piece.box.expandByPoint(point.fromBufferAttribute(position, vertexOf(t * 3 + c)));
  }
  // Pieces whose boxes meet are one wheel: the hub inside its tyre.
  const wheels = [...pieces.values()].sort((a, b) => a.triangles[0]! - b.triangles[0]!);
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < wheels.length && !merged; i++) {
      for (let j = i + 1; j < wheels.length; j++) {
        if (!wheels[i]!.box.intersectsBox(wheels[j]!.box)) continue;
        wheels[i]!.triangles.push(...wheels[j]!.triangles);
        wheels[i]!.box.union(wheels[j]!.box);
        wheels.splice(j, 1);
        merged = true;
        break;
      }
    }
  }
  for (const wheel of wheels) wheel.triangles.sort((a, b) => a - b);
  const tolerance = ON_ROAD * (model.box.max.y - model.box.min.y);
  const size = new THREE.Vector3();
  const road: PackWheel[] = [];
  const other: PackWheel[] = [];
  for (const wheel of wheels) {
    wheel.box.getSize(size);
    const grounded = wheel.box.min.y - model.box.min.y <= tolerance;
    const across = size.x < Math.min(size.y, size.z);
    (grounded && across ? road : other).push(wheel);
  }
  return { road, other };
}

/**
 * Smallest run of glass that is a window, as a share of the model's height
 * squared; smaller runs (lamp lenses) stay painted on the body.
 */
const WINDOW_AREA = 0.03;

/**
 * Which of a model's triangles are its windows: the glass triangles (`isGlass`),
 * joined where they share a corner, keeping each run large enough to be a
 * window (`WINDOW_AREA`). The shells are closed with their glass in them, so
 * the same triangles drawn as glass fill the hole exactly. `isPane` says which
 * slots are glass where a pack does not name them (the space kit's cabs).
 */
export function windowsOf(model: Model, isPane: (slot: string, colour: THREE.Color) => boolean = isGlass, area = WINDOW_AREA): Uint8Array {
  const position = model.geometry.getAttribute('position');
  const index = model.geometry.index;
  const vertexOf = (corner: number): number => (index !== null ? index.getX(corner) : corner);
  const triangleCount = (index !== null ? index.count : position.count) / 3;
  const glassSlot = model.slots.map((slot, s) => isPane(slot, model.defaults[s]!));
  const height = model.box.max.y - model.box.min.y;
  const q = (v: number): number => Math.round((v / height) * 1e4);
  const parent = new Map<number, number>();
  const find = (t: number): number => {
    while (parent.get(t)! !== t) t = parent.get(t)!;
    return t;
  };
  const byCorner = new Map<string, number>();
  for (let t = 0; t < triangleCount; t++) {
    if (!glassSlot[model.slot[vertexOf(t * 3)]!]) continue;
    parent.set(t, t);
    for (let c = 0; c < 3; c++) {
      const v = vertexOf(t * 3 + c);
      const key = `${q(position.getX(v))},${q(position.getY(v))},${q(position.getZ(v))}`;
      const seen = byCorner.get(key);
      if (seen === undefined) byCorner.set(key, t);
      else {
        const a = find(seen);
        const b = find(t);
        if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
      }
    }
  }
  const areas = new Map<number, number>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const t of parent.keys()) {
    a.fromBufferAttribute(position, vertexOf(t * 3));
    b.fromBufferAttribute(position, vertexOf(t * 3 + 1)).sub(a);
    c.fromBufferAttribute(position, vertexOf(t * 3 + 2)).sub(a);
    const root = find(t);
    areas.set(root, (areas.get(root) ?? 0) + b.cross(c).length() / 2);
  }
  const mask = new Uint8Array(triangleCount);
  for (const t of parent.keys()) if ((areas.get(find(t)) ?? 0) >= area * height * height) mask[t] = 1;
  return mask;
}

/**
 * The model painted and fitted, as a body soup, its windows as a soup of
 * glass, and its road wheels. Every point is `(p - centre) * k` with the base
 * on y = 0, a uniform positive scale, so the normals carry over. With
 * `windows` absent the glass stays in the body, painted slate (`parkedArrays`).
 */
function carSoups(model: Model, k: number, body: number, slots?: RegExp, windows?: Uint8Array): { still: Soup; glass: Soup; wheels: Turning[] } {
  const colours = paintColors(model, bodyPaint(model, body, isGlass, slots));
  const position = model.geometry.getAttribute('position');
  const normal = model.geometry.getAttribute('normal');
  const outline = model.geometry.getAttribute('outlineNormal');
  if (outline === undefined) throw new Error(`craft: '${model.name}' has no outlineNormal`);
  // The loader may hand the bake's triangle list back indexed; either way a
  // corner of triangle t is vertex `at(t * 3 + c)`.
  const index = model.geometry.index;
  const vertexOf = (corner: number): number => (index !== null ? index.getX(corner) : corner);
  const triangleCount = (index !== null ? index.count : position.count) / 3;
  const cx = (model.box.min.x + model.box.max.x) / 2;
  const cz = (model.box.min.z + model.box.max.z) / 2;
  const base = model.box.min.y;

  // The body's triangles, the windows', and the road wheels' (`wheelsOf`); a spare is body.
  const wheelSlot = model.slots.map((slot) => WHEEL_SLOTS.test(slot));
  const found = wheelsOf(model, (t) => wheelSlot[model.slot[vertexOf(t * 3)]!]!);
  const onWheel = new Uint8Array(triangleCount);
  for (const wheel of found.road) for (const t of wheel.triangles) onWheel[t] = 1;
  const still: number[] = [];
  const panes: number[] = [];
  for (let t = 0; t < triangleCount; t++) {
    if (onWheel[t] !== 0) continue;
    if (windows !== undefined && windows[t] !== 0) panes.push(t);
    else still.push(t);
  }

  const soupFrom = (triangles: readonly number[], centre: THREE.Vector3): Soup => {
    const n = triangles.length * 9;
    const soup: Soup = {
      position: new Float32Array(n),
      normal: new Float32Array(n),
      color: new Float32Array(n),
      outline: new Float32Array(n),
    };
    let o = 0;
    for (const t of triangles) {
      for (let c = 0; c < 3; c++) {
        const v = vertexOf(t * 3 + c);
        soup.position[o] = (position.getX(v) - cx) * k - centre.x;
        soup.position[o + 1] = (position.getY(v) - base) * k - centre.y;
        soup.position[o + 2] = (position.getZ(v) - cz) * k - centre.z;
        soup.normal[o] = normal.getX(v);
        soup.normal[o + 1] = normal.getY(v);
        soup.normal[o + 2] = normal.getZ(v);
        soup.outline[o] = outline.getX(v);
        soup.outline[o + 1] = outline.getY(v);
        soup.outline[o + 2] = outline.getZ(v);
        soup.color[o] = colours[v * 3]!;
        soup.color[o + 1] = colours[v * 3 + 1]!;
        soup.color[o + 2] = colours[v * 3 + 2]!;
        o += 3;
      }
    }
    return soup;
  };

  const wheels: Turning[] = [];
  for (const { triangles } of found.road) {
    // The axle is the middle of the wheel's own box.
    const box = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const t of triangles) {
      for (let c = 0; c < 3; c++) {
        const v = vertexOf(t * 3 + c);
        box.expandByPoint(point.set((position.getX(v) - cx) * k, (position.getY(v) - base) * k, (position.getZ(v) - cz) * k));
      }
    }
    const at = box.getCenter(new THREE.Vector3());
    wheels.push({ name: 'wheel', at, soup: soupFrom(triangles, at) });
  }
  const origin = new THREE.Vector3();
  return { still: soupFrom(still, origin), glass: painted(soupFrom(panes, origin), GLASS_TINT), wheels };
}

/** How far back from the model's nose a lamp may be, as a share of its length. */
const LAMP_BAND = 0.2;

/**
 * Whether a slot is a lamp's glass: named so (the bus has a `Lights` slot), or
 * the Kenney pack's lamp yellow.
 */
function isLampSlot(slot: string, color: THREE.Color): boolean {
  if (/light|lamp/i.test(slot)) return true;
  const hsl = { h: 0, s: 0, l: 0 };
  color.clone().convertLinearToSRGB().getHSL(hsl);
  return hsl.h > 0.07 && hsl.h < 0.18 && hsl.s > 0.75 && hsl.l > 0.45;
}

/**
 * The headlamps as the model has them, in the craft's frame: the
 * lamp-coloured vertices in the front `LAMP_BAND` of the model, split at the
 * centreline, each side's middle across and up at the front of its glass. One
 * lamp where they are all on one side. Throws where the model has none.
 */
export function lampsOf(model: Model, k: number): [number, number, number][] {
  const position = model.geometry.getAttribute('position');
  const lamp = model.slots.map((slot, s) => isLampSlot(slot, model.defaults[s]!));
  const cx = (model.box.min.x + model.box.max.x) / 2;
  const cz = (model.box.min.z + model.box.max.z) / 2;
  const front = model.box.max.z - LAMP_BAND * (model.box.max.z - model.box.min.z);
  // Per side: the sum of x and y, how many, and the foremost z.
  const sides = [
    { x: 0, y: 0, n: 0, z: -Infinity },
    { x: 0, y: 0, n: 0, z: -Infinity },
  ];
  for (let v = 0; v < position.count; v++) {
    if (!lamp[model.slot[v]!]) continue;
    const z = position.getZ(v);
    if (z < front) continue;
    const x = position.getX(v) - cx;
    const side = sides[x < 0 ? 0 : 1]!;
    side.x += x;
    side.y += position.getY(v) - model.box.min.y;
    side.n++;
    side.z = Math.max(side.z, z);
  }
  const found = sides.filter((side) => side.n > 0);
  if (found.length === 0) throw new Error(`craft: '${model.name}' has no headlamps in its front ${LAMP_BAND * 100}%`);
  return found.map((side) => [(side.x / side.n) * k, (side.y / side.n) * k, (side.z - cz) * k]);
}

export interface CarSpec {
  id: string;
  kind: CraftModel['kind'];
  model: string;
  /**
   * How the bodies in it sit: a car's, a van's and a jeep's `drive`, the legs
   * forward to the pedals; a bus's and a tractor's `chair`, upright, the
   * shins hanging, as their drivers do sit. Either way the hip is laid off the
   * shell's own floor and the head has to clear its roof (`seatsOf`).
   */
  legs: 'drive' | 'chair';
  /** The floor's top over the shell's bottom, if not `FLOOR_OVER`; and the air over a crown, if not `HEAD_ROOM`. */
  floorOver?: number;
  headRoom?: number;
  /** What the driver holds (`WHEELS` in `cabin.ts`). */
  wheel: WheelKind;
  /** Seated rows behind the front one. */
  rows: number;
  /** One seat, on the axis: a tractor's cab. */
  single?: boolean;
  /**
   * The driver on the right, -X, for a country that keeps left (`keepsLeft`
   * in `traffic/regions.ts`): the traffic's drivers there (`trafficInside`).
   * The rows are mirrored by their order, never by a reflected matrix.
   */
  rightHand?: boolean;
  /** Which slots are glass, if not the pack's own naming (`windowsOf`), and how large a run of it is a window, if not `WINDOW_AREA`. */
  isPane?: (slot: string, colour: THREE.Color) => boolean;
  paneArea?: number;
  /**
   * Where the front row's hips go along the craft, in its fitted frame, if
   * not a tenth of a body behind where the roof meets the windscreen: a
   * model whose top is a mast or a dish and not its roof says it here.
   */
  front?: number;
  paints: readonly number[];
  /**
   * World units a unit of the pack's, if not the hatchback's own (`carScale`):
   * the bus is Quaternius's and not Kenney's, and is drawn at the traffic's own
   * size, whose roof already clears a seated head by a body's height.
   */
  scale?: (model: Model) => number;
}

const SPECS: readonly CarSpec[] = [
  {
    id: 'hatchback',
    kind: 'car',
    model: 'hatchback-sports',
    legs: 'drive',
    wheel: 'car',
    rows: 1,
    paints: [PALETTE.red, PALETTE.skyBlue, PALETTE.gold, PALETTE.green, PALETTE.white, PALETTE.violet],
  },
  {
    id: 'van',
    kind: 'van',
    model: 'van',
    legs: 'drive',
    wheel: 'car',
    rows: 2,
    paints: [PALETTE.white, PALETTE.skyBlue, PALETTE.gold, PALETTE.red, PALETTE.green],
  },
  // Kenney's `suv`, with its spare wheel on the tailgate, is the jeep: the
  // same pack at the same scale as the hatchback, a little taller.
  {
    id: 'jeep',
    kind: 'jeep',
    model: 'suv',
    legs: 'drive',
    wheel: 'car',
    rows: 1,
    paints: [PALETTE.darkOlive, PALETTE.sand, PALETTE.white, PALETTE.red, PALETTE.tan],
  },
  // Kenney's `truck`, a cab and an open bed, and the same off-road handling.
  {
    id: 'pickup',
    kind: 'jeep',
    model: 'truck',
    legs: 'drive',
    wheel: 'car',
    rows: 0,
    paints: [PALETTE.red, PALETTE.white, PALETTE.skyBlue, PALETTE.gold, PALETTE.brown],
  },
  // Kenney's `tractor`: one seat, high in its glazed cab.
  {
    id: 'tractor',
    kind: 'tractor',
    model: 'tractor',
    legs: 'chair',
    // Its cab is a box of its own, closed at the front, too short for the
    // legs to go forward to pedals under a bonnet as a car's do; upright on a
    // seat laid on the cab's floor plate, the crown clears the lining by a
    // hand's breadth.
    floorOver: 0.005 * H,
    headRoom: 0.01 * H,
    wheel: 'tractor',
    rows: 0,
    single: true,
    paints: [PALETTE.red, PALETTE.green, PALETTE.gold, PALETTE.skyBlue],
  },
  // Quaternius's `Bus` at the traffic's own width, four rows of two: the
  // driver and seven more, which is every seat the relay keeps.
  {
    id: 'bus',
    kind: 'bus',
    model: 'bus',
    legs: 'chair',
    wheel: 'bus',
    rows: 3,
    paints: [PALETTE.gold, PALETTE.red, PALETTE.skyBlue, PALETTE.white, PALETTE.green],
    scale: (model) => BUS_WIDTH / (model.box.max.x - model.box.min.x),
  },
];

/** The bus's width: the traffic's own, 3.3 at `PLACED_SECTION`, so the one a town parks is the one taken. */
const BUS_WIDTH = 3.3 * PLACED_SECTION;
/** The slots of the bus's bodywork, the ones the paint names: the pack's bus is grey and white. */
const BUS_BODY = /^(Top|Bottom|Material)$/;

/** Distance between rows of seats: the pack behind the hip, a seat back, a knee, and a little air. */
const ROW_PITCH = HERO.back + HERO.knee + 0.08 * H;

/** The colours of a cabin: the seats, the dashboard, the door cards under the window line and the lining over it. */
const TRIM = {
  seat: PALETTE.clay,
  dash: PALETTE.brown,
  door: tone(PALETTE.brown, 0.9),
  pillar: tone(PALETTE.tan, 1.05),
  lining: PALETTE.sand,
};

/** The floor's top over the shell's own bottom, under the soles. */
const FLOOR_OVER = 0.03 * H;
/** The least air between a seated crown and the roof's lining over it. */
const HEAD_ROOM = 0.03 * H;

/** A fitted model's windscreen, from its forward-facing glass: its bottom edge and its top, on the axis. */
export interface Screen {
  bottom: { y: number; z: number };
  header: { y: number; z: number };
}

export function screenOf(glass: Soup): Screen | null {
  const p = glass.position;
  let low = Infinity;
  let lowZ = 0;
  let high = -Infinity;
  let highZ = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i);
    b.fromArray(p, i + 3).sub(a);
    c.fromArray(p, i + 6).sub(a);
    const n = b.cross(c).normalize();
    // Facing ahead, and more ahead than to the side: a windscreen, raked or upright.
    if (!(n.z > 0.35 && Math.abs(n.x) < 0.5)) continue;
    for (let k = 0; k < 3; k++) {
      const y = p[i + k * 3 + 1]!;
      const z = p[i + k * 3 + 2]!;
      if (y < low - 1e-6 || (Math.abs(y - low) < 1e-6 && z > lowZ)) {
        low = y;
        lowZ = z;
      }
      if (y > high + 1e-6 || (Math.abs(y - high) < 1e-6 && z < highZ)) {
        high = y;
        highZ = z;
      }
    }
  }
  return Number.isFinite(low) ? { bottom: { y: low, z: lowZ }, header: { y: high, z: highZ } } : null;
}

/** A road vehicle's inside, built once a model: its seats, its glass, and its lining and cabin as one soup with the wheel and the needle. */
export interface CarInside {
  seats: Seat[];
  glass: Soup;
  furnished: Soup;
  turning: Turning[];
  windows: Uint8Array;
  arches: CabinBox[];
}

/**
 * The seats of a fitted model, laid off its own shell: the front row a tenth
 * of a body behind where the roof meets the windscreen (further back if the
 * toes would go through the front); the hip a sole over the floor; and no
 * higher than lets the crown clear the roof by `HEAD_ROOM`. Throws where no
 * seat fits.
 */
function seatsOf(spec: CarSpec, probe: ShellProbe, screen: Screen, roofFore: number): { seats: Seat[]; floor: number } {
  const sole = spec.legs === 'drive' ? HERO.drive.sole : HERO.sole;
  const toe = spec.legs === 'drive' ? HERO.drive.toe : HERO.toe;
  // A height surely inside the cabin, from which the floor and the roof are both found.
  const inside = (screen.bottom.y + screen.header.y) / 2;
  const xs = spec.single === true ? [0] : spec.rightHand === true ? [-ABREAST / 2, ABREAST / 2] : [ABREAST / 2, -ABREAST / 2];
  const floorUnder = (z: number): number => Math.max(...xs.map((x) => probe.floor(x, inside, z)));
  let front = roofFore - 0.1 * H;
  // The toes clear of the front of the shell at the floor.
  const ahead = probe.cast(0, floorUnder(front) + FLOOR_OVER + 0.05 * H, front, 0, 0, 1);
  if (Number.isFinite(ahead)) front = Math.min(front, front + ahead - toe - 0.03 * H);
  const rows = Array.from({ length: spec.rows + 1 }, (_, row) => front - row * ROW_PITCH);
  const floor = Math.max(...rows.map(floorUnder)) + (spec.floorOver ?? FLOOR_OVER);
  if (!Number.isFinite(floor)) throw new Error(`craft ${spec.id}: no floor under its seats`);
  const roof = Math.min(...rows.flatMap((z) => xs.map((x) => probe.ceiling(x, inside, z))));
  const hip = floor + sole;
  if (hip + HERO.crown + (spec.headRoom ?? HEAD_ROOM) > roof) {
    throw new Error(`craft ${spec.id}: a seated crown at ${(hip + HERO.crown).toFixed(2)} is through the roof at ${roof.toFixed(2)}`);
  }
  const seats: Seat[] = [];
  for (const z of rows) {
    // Driver on the left, +X (on the right where the country keeps left);
    // then the other side; each row after, the same way round.
    for (const x of xs) seats.push({ x, y: hip, z, yaw: 0, pose: 'sit', shown: true, legs: spec.legs });
  }
  seats[0] = { ...seats[0]!, wheel: WHEELS[spec.wheel] };
  return { seats, floor };
}

/**
 * The inside of a road vehicle, from its fitted model. The other worlds'
 * pressurised rovers are furnished by it too (`worlds/cockpit.ts`), with their
 * own glass (`CarSpec.isPane`) and front row (`CarSpec.front`).
 */
export function insideOf(spec: CarSpec, model: Model, k: number, full = true): CarInside {
  const windows = windowsOf(model, spec.isPane, spec.paneArea);
  const slots = spec.model === 'bus' ? BUS_BODY : undefined;
  // The shell's shape is the same in every paint; the probe and the lining are laid off it once.
  const { still: shell, glass, wheels } = carSoups(model, k, PALETTE.white, slots, windows);
  const screen = screenOf(glass);
  if (screen === null) throw new Error(`craft ${spec.id}: '${spec.model}' has no windscreen`);
  const probe = probeOf([shell, glass]);
  const cz = (model.box.min.z + model.box.max.z) / 2;
  const [, roofFore] = roofOf(model);
  const { seats, floor } = seatsOf(spec, probe, screen, spec.front !== undefined ? spec.front + 0.1 * H : (roofFore - cz) * k);
  const last = seats[seats.length - 1]!;
  const rear = last.z - HERO.back - 0.12 * H;
  const cabin: RoadCabin = roadCabin({
    seats,
    probe,
    screen: screen.bottom,
    header: screen.header,
    floor,
    rear,
    wheel: spec.wheel,
    trim: TRIM.seat,
    dash: TRIM.dash,
    full,
    wheels: wheels.map(archOf),
  });
  // Lined: every face of the shell over the floor and behind the firewall
  // whose back looks into the cabin, from its middle.
  const middle = new THREE.Vector3(0, (floor + screen.header.y) / 2, (seats[0]!.z + last.z) / 2);
  const lining = liner(shell, {
    keep: (cx, cy, cz2, nx, ny, nz) =>
      cy > floor - 0.02 * H && cz2 < cabin.firewall && nx * (cx - middle.x) + ny * (cy - middle.y) + nz * (cz2 - middle.z) > 0,
    // Door cards under the window line, the pillars and the door tops over
    // it, and the headliner on whatever of the shell rises — the roof.
    colour: (cy, ny) => (cy < screen.bottom.y ? TRIM.door : ny > 0.6 ? TRIM.lining : TRIM.pillar),
  });
  return { seats, glass, furnished: joinSoups([lining, cabin.still]), turning: cabin.turning, windows, arches: cabin.arches };
}

/** A road wheel as the cabin keeps clear of it, from its soup about its axle. */
function archOf(wheel: Turning): WheelArch {
  const p = wheel.soup.position;
  let halfX = 0;
  let radius = 0;
  for (let i = 0; i < p.length; i += 3) {
    halfX = Math.max(halfX, Math.abs(p[i]!));
    radius = Math.max(radius, Math.abs(p[i + 1]!), Math.abs(p[i + 2]!));
  }
  return { side: wheel.at.x >= 0 ? 1 : -1, inner: Math.abs(wheel.at.x) - halfX, y: wheel.at.y, z: wheel.at.z, radius };
}

function carModel(spec: CarSpec, models: ReadonlyMap<string, Model>, carK: number): CraftModel {
  const model = models.get(spec.model);
  if (model === undefined) throw new Error(`craft: the traffic kit has no '${spec.model}'`);
  const k = spec.scale?.(model) ?? carK;
  const inside = insideOf(spec, model, k);
  const slots = spec.model === 'bus' ? BUS_BODY : undefined;
  const build = (variant: number, body?: number): THREE.Group => {
    const paint = body ?? spec.paints[((variant % spec.paints.length) + spec.paints.length) % spec.paints.length]!;
    const { still, wheels } = carSoups(model, k, paint, slots, inside.windows);
    return assemble(spec.id, [still], [...wheels, ...inside.turning], { glass: [inside.glass], cabin: [inside.furnished] });
  };
  return finish({
    id: spec.id,
    kind: spec.kind,
    medium: 'road',
    seats: inside.seats,
    draft: 0,
    variants: spec.paints.length,
    lamps: lampsOf(model, k),
    arches: inside.arches,
    build,
  });
}

/** The road craft built off the traffic kit's own models, by name. */
export function buildCars(models: ReadonlyMap<string, Model>): CraftModel[] {
  const k = carScale(models);
  return SPECS.map((spec) => carModel(spec, models, k));
}

/** `buildCars` a craft a step, for a caller building over frames. */
export function* buildCarsSteps(models: ReadonlyMap<string, Model>): Generator<void, CraftModel[], void> {
  const k = carScale(models);
  const built: CraftModel[] = [];
  for (const spec of SPECS) {
    yield;
    built.push(carModel(spec, models, k));
  }
  return built;
}

// ---------------------------------------------------------------------------
// The traffic's drivers
// ---------------------------------------------------------------------------

/**
 * A traffic vehicle's inside, built once per kit model in the frame a craft of
 * that model is laid in (`carSoups`). The traffic draws its vehicles smaller,
 * so the whole inside is carried into the traffic's frame by one uniform scale.
 */
export interface TrafficInside {
  windows: Uint8Array;
  glass: Soup;
  /** The lining, the front row, the dashboard and the wheel, as one soup. */
  cabin: Soup;
  driver: Seat;
  k: number;
  /** The model's centre and base, in its own units: what the craft's frame is laid off. */
  centre: THREE.Vector3;
}

/**
 * How tall the traffic's drivers are, as shares of the traffic's rider
 * (`RIDER_HEIGHT`): the first that fits the vehicle's cabin.
 */
const DRIVER_SIZES = [1, 0.95, 0.9, 0.85, 0.8, 0.75];

/** The front row's inside of a kit model at a fit, as its craft has it or as a car's; null where no seated body fits it. */
const traffic = new Map<string, TrafficInside | null>();

/**
 * A kit model's inside for the traffic, which draws it `fit` of its own units
 * to one of the part's: laid out at the scale at which the hero is the size of
 * the driver that fits (`DRIVER_SIZES`). Cached per model, fit and side;
 * `rightHand` seats the driver on the right.
 */
export function trafficInside(model: Model, fit: number, rightHand = false): TrafficInside | null {
  const key = `${model.name}@${fit.toFixed(5)}${rightHand ? 'R' : 'L'}`;
  const known = traffic.get(key);
  if (known !== undefined) return known;
  const craft = SPECS.find((entry) => entry.model === model.name);
  const spec: CarSpec = { ...(craft ?? { id: model.name, kind: 'car', model: model.name, legs: 'drive', wheel: 'car', paints: [PALETTE.white] }), rows: 0, rightHand };
  let value: TrafficInside | null = null;
  for (const size of DRIVER_SIZES) {
    const k = (AVATAR_HEIGHT * fit) / (RIDER_HEIGHT * size);
    try {
      const inside = insideOf(spec, model, k, false);
      // Nothing turns in a merged mover: the wheel is laid in where it stands.
      const wheel = inside.turning.map(bake);
      value = {
        windows: inside.windows,
        glass: inside.glass,
        cabin: joinSoups([inside.furnished, ...wheel]),
        driver: inside.seats[0]!,
        k,
        centre: new THREE.Vector3((model.box.min.x + model.box.max.x) / 2, model.box.min.y, (model.box.min.z + model.box.max.z) / 2),
      };
      break;
    } catch {
      // A body that does not fit at this size: a smaller one, or, past the
      // last, the vehicle keeps its opaque glass and nobody in it.
    }
  }
  traffic.set(key, value);
  return value;
}

/** A turning part laid where it stands: its soup turned by its tilt and moved to its axle. */
function bake(part: Turning): Soup {
  const out = joinSoups([part.soup]);
  const turn = new THREE.Matrix4().makeRotationX(part.tilt ?? 0).setPosition(part.at);
  const normals = new THREE.Matrix3().getNormalMatrix(turn);
  const v = new THREE.Vector3();
  for (let i = 0; i < out.position.length; i += 3) {
    v.fromArray(out.position, i).applyMatrix4(turn).toArray(out.position, i);
    v.fromArray(out.normal, i).applyMatrix3(normals).normalize().toArray(out.normal, i);
    v.fromArray(out.outline, i).applyMatrix3(normals).normalize().toArray(out.outline, i);
  }
  return out;
}

/**
 * Who drives a traffic vehicle, in the part's own frame: the hip, the wheel
 * the hands are put to (`holdWheel` in `cast.ts`) — the craft's own wheel,
 * about the hip, carried to the driver's size — and the body's height there.
 */
export interface TrafficDriver {
  hip: THREE.Vector3;
  wheel: WheelGrip;
  height: number;
}

/**
 * A traffic vehicle as built by its part, glazed: every mesh of it that is a
 * kit model with windows (`windowsOf`) loses its window triangles, and gets
 * its inside — lining, front row, dashboard, wheel — as a child in the craft
 * material, and its windows as a child named `'glass'` in the glass's
 * (`glassMaterial`), both carried into the part's frame from the craft's
 * (`TrafficInside`). Returns where each driver goes, for the caller to seat
 * a body there; an empty list where nothing was glazed.
 */
export function glazeTraffic(built: THREE.Object3D, modelOf: (name: string) => Model | null, rightHand = false): TrafficDriver[] {
  built.updateMatrixWorld(true);
  const found: THREE.Mesh[] = [];
  built.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && modelOf(object.name) !== null) found.push(object as THREE.Mesh);
  });
  const drivers: TrafficDriver[] = [];
  const toLocal = new THREE.Matrix4().copy(built.matrixWorld).invert();
  for (const mesh of found) {
    const model = modelOf(mesh.name)!;
    const placed = new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
    const inside = trafficInside(model, new THREE.Vector3().setFromMatrixColumn(placed, 0).length(), rightHand);
    if (inside === null) continue;
    // The shell without its windows: the same attributes, a new index.
    const source = mesh.geometry;
    const index = source.index;
    const corners: number[] = [];
    const triangles = (index !== null ? index.count : source.getAttribute('position').count) / 3;
    for (let t = 0; t < triangles; t++) {
      if (inside.windows[t] !== 0) continue;
      for (let c = 0; c < 3; c++) corners.push(index !== null ? index.getX(t * 3 + c) : t * 3 + c);
    }
    const shell = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) shell.setAttribute(name, attribute);
    shell.setIndex(corners);
    shell.boundingBox = source.boundingBox?.clone() ?? null;
    shell.boundingSphere = source.boundingSphere?.clone() ?? null;
    mesh.geometry = shell;
    // The craft's frame into the part's: the mesh's own placing, after the
    // craft's centring and scale are undone.
    const k = inside.k;
    const place = placed
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(inside.centre.x, inside.centre.y, inside.centre.z))
      .multiply(new THREE.Matrix4().makeScale(1 / k, 1 / k, 1 / k));
    if (!(place.determinant() > 0)) throw new Error(`traffic '${mesh.name}': its inside would be placed reflected`);
    const cabin = new THREE.Mesh(geometryOf([inside.cabin]), craftMaterial());
    cabin.name = 'cabin';
    const glass = new THREE.Mesh(geometryOf([inside.glass]), glassMaterial());
    glass.name = 'glass';
    for (const part of [cabin, glass]) {
      part.matrixAutoUpdate = false;
      part.matrix.copy(place);
      built.add(part);
    }
    const seat = inside.driver;
    const hip = new THREE.Vector3(seat.x, seat.y, seat.z).applyMatrix4(place);
    // The craft's wheel, carried by the same uniform scale as the cabin it
    // stands in: its middle taken through the placing as a point, so it is
    // where the cabin's wheel was laid; its radius scaled with the body that
    // holds it; its tilt an angle, which a uniform scale leaves alone.
    const scale = new THREE.Vector3().setFromMatrixColumn(place, 0).length();
    const own = seat.wheel ?? WHEELS.car;
    const middle = new THREE.Vector3(seat.x + own.centre[0], seat.y + own.centre[1], seat.z + own.centre[2]).applyMatrix4(place).sub(hip);
    const wheel: WheelGrip = {
      centre: [middle.x, middle.y, middle.z],
      tilt: own.tilt,
      radius: own.radius * scale,
      spread: own.spread,
    };
    drivers.push({ hip, wheel, height: AVATAR_HEIGHT * scale });
  }
  built.updateMatrixWorld(true);
  return drivers;
}
