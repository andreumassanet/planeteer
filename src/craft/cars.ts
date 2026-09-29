/**
 * The road craft off the traffic kit's baked models: Kenney's
 * `hatchback-sports`, `van`, `suv` (the jeep), `truck` (the pickup) and
 * `tractor` (Car Kit, CC0) and Quaternius's `Bus` (Public Transport, CC0), the
 * same models the traffic parks and drives, drawn at the size of the person
 * who takes them.
 *
 * **The traffic's cars are the wrong size for this, and by design.** The kit
 * fits them to a lane (`PLACED_SECTION` in `traffic/contract.ts`): a hatchback
 * is 3.00 across and 2.57 tall, so its roof is at the hero's chest, which is
 * right for a car nobody gets into and cannot hold a seated body whose crown is
 * 2.01 over its hip. These are fitted by the one thing a car you sit in has to
 * do, which is **clear the head of the person in it**: the roof is the seated
 * hip, plus the crown over it, plus a little. The hip is the sole's depth over a
 * floor a twenty-fifth of a body up. That scale comes out at 3.07 of the pack's
 * units against the traffic's 2.30, and the result is a car in the proportion a
 * real one has to a 1.75 m person — 4.0 wide and 3.38 tall against a 3.77
 * body, where life gives 1.75 m and 1.5 m against 1.75 m — which is what a
 * toy-proportioned pack car turns out to be once it is sized by its roof. It is
 * a third larger than the same car in the traffic, and two of them are wider
 * than a 7.2 road; it stands at a road's end, it does not pass anyone.
 *
 * **The seats are shown false**: the glass is opaque slate like every window in
 * this world, so nobody inside is ever seen and a body drawn there would only
 * put its head through the roof at some angle. They are still placed where a
 * body fits, off the model's own roof line — the front hip a tenth of a body
 * behind where the roof meets the windscreen, so the head is under it; the rear
 * one a pack, a seat back and a knee behind that — so that the day a car gets
 * glass you can see through, the people are already in the right place.
 *
 * **Left-hand drive.** Facing +Z with +Y up, +X is the driver's left, so seat 0
 * is at +X: most of the world drives on the right and sits on the left.
 *
 * **The wheels are split out of the bake**, where they are merged into the body:
 * the triangles on the pack's `Tyre` and `Hub` slots, gathered into one wheel
 * each (`wheelsOf`), re-centred on its own axle and handed over as a `'wheel'`
 * that turns about +X. **Only a road wheel turns**: one standing on the road
 * with its axle across the car. The `suv`'s spare, on its tailgate, is on the
 * same slots — high off the road, its axle along the car — and when the wheels
 * were sorted by the corner they were in, its halves went to the two rear
 * wheels, which then spun about a point between the axle and the tailgate and
 * swung the spare through the body. It stays in the body now.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { bodyPaint, isGlass, paintColors } from '../models.ts';
import type { Model } from '../models.ts';
import { PALETTE } from '../theme.ts';
import { PLACED_SECTION } from '../traffic/contract.ts';
import type { CraftModel, Seat } from './contract.ts';
import { ABREAST, HERO } from './body.ts';
import { assemble, finish } from './build.ts';
import type { Soup, Turning } from './build.ts';

const H = AVATAR_HEIGHT;

/** The seated hip over the road: the sole under it and a floor a twenty-fifth of a body up. */
const CAR_HIP = HERO.sole + 0.04 * H;
/** The roof: the hip, the crown over it, and the same again of headroom. */
const CAR_ROOF = CAR_HIP + HERO.crown + 0.04 * H;
/** The van's floor is higher, over its own taller wheels and box. */
const VAN_HIP = CAR_HIP + 0.06 * H;

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
 * How near the road a wheel's bottom is to count as on it, as a share of the
 * model's height: the pack's road wheels are at 0.000, and the `suv`'s spare,
 * the one wheel that is not, is 0.40 of a 1.30 model up.
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
 * The model painted and fitted, as a body soup and its road wheels. Every point is
 * `(p - centre) * k` with the base on y = 0, a uniform positive scale, so the
 * normals carry over as they are.
 */
function carSoups(model: Model, k: number, body: number, slots?: RegExp): { still: Soup; wheels: Turning[] } {
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

  // The body's triangles, and the road wheels' (`wheelsOf`); a spare is body.
  const wheelSlot = model.slots.map((slot) => WHEEL_SLOTS.test(slot));
  const found = wheelsOf(model, (t) => wheelSlot[model.slot[vertexOf(t * 3)]!]!);
  const onWheel = new Uint8Array(triangleCount);
  for (const wheel of found.road) for (const t of wheel.triangles) onWheel[t] = 1;
  const still: number[] = [];
  for (let t = 0; t < triangleCount; t++) if (onWheel[t] === 0) still.push(t);

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
  return { still: soupFrom(still, new THREE.Vector3()), wheels };
}

/**
 * How far back from the model's nose a lamp may be, as a share of its length:
 * the pack's headlamps are in its front tenth, and a tail-lamp, or the
 * tractor's amber beacon on its cab, is well behind this.
 */
const LAMP_BAND = 0.2;

/**
 * Whether a slot is a lamp's glass: named so (Quaternius's bus has a
 * `Lights` slot), or the Kenney pack's lamp yellow — a saturated, bright
 * yellow-to-amber that nothing else on its cars is painted in.
 */
function isLampSlot(slot: string, color: THREE.Color): boolean {
  if (/light|lamp/i.test(slot)) return true;
  const hsl = { h: 0, s: 0, l: 0 };
  color.clone().convertLinearToSRGB().getHSL(hsl);
  return hsl.h > 0.07 && hsl.h < 0.18 && hsl.s > 0.75 && hsl.l > 0.45;
}

/**
 * The headlamps as the model has them, in the craft's frame (`carSoups`'s
 * `(p - centre) * k`, the base on y = 0): the lamp-coloured vertices in the
 * front `LAMP_BAND` of the model, split at the centreline, each side's
 * middle across and up at the front of its glass. One lamp where they are
 * all on one side of it. Throws where the model has none, so a pack that
 * changes its colours fails the check rather than lighting the road from
 * nowhere.
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

interface CarSpec {
  id: string;
  kind: CraftModel['kind'];
  model: string;
  /**
   * The seated hip over the road, or `'roof'` to hang it under the model's own
   * roof — a tractor's cab and a bus's floor stand higher than a car's, and
   * whatever the floor, the head has to clear the roof.
   */
  hip: number | 'roof';
  /** Seated rows behind the front one. */
  rows: number;
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
    hip: CAR_HIP,
    rows: 1,
    paints: [PALETTE.red, PALETTE.skyBlue, PALETTE.gold, PALETTE.green, PALETTE.white, PALETTE.violet],
  },
  {
    id: 'van',
    kind: 'van',
    model: 'van',
    hip: VAN_HIP,
    rows: 2,
    paints: [PALETTE.white, PALETTE.skyBlue, PALETTE.gold, PALETTE.red, PALETTE.green],
  },
  // Kenney's `suv`, with its spare wheel on the tailgate, is the jeep: the
  // same pack at the same scale as the hatchback, a little taller.
  {
    id: 'jeep',
    kind: 'jeep',
    model: 'suv',
    hip: VAN_HIP,
    rows: 1,
    paints: [PALETTE.darkOlive, PALETTE.sand, PALETTE.white, PALETTE.red, PALETTE.tan],
  },
  // Kenney's `truck`, a cab and an open bed, and the same off-road handling.
  {
    id: 'pickup',
    kind: 'jeep',
    model: 'truck',
    hip: VAN_HIP,
    rows: 0,
    paints: [PALETTE.red, PALETTE.white, PALETTE.skyBlue, PALETTE.gold, PALETTE.brown],
  },
  // Kenney's `tractor`: one seat, high in its glazed cab.
  {
    id: 'tractor',
    kind: 'tractor',
    model: 'tractor',
    hip: 'roof',
    rows: 0,
    paints: [PALETTE.red, PALETTE.green, PALETTE.gold, PALETTE.skyBlue],
  },
  // Quaternius's `Bus` at the traffic's own width, four rows of two: the
  // driver and seven more, which is every seat the relay keeps.
  {
    id: 'bus',
    kind: 'bus',
    model: 'bus',
    hip: 'roof',
    rows: 3,
    paints: [PALETTE.gold, PALETTE.red, PALETTE.skyBlue, PALETTE.white, PALETTE.green],
    scale: (model) => BUS_WIDTH / (model.box.max.x - model.box.min.x),
  },
];

/** The bus's width: the traffic's own, 3.3 at `PLACED_SECTION`, so the one a town parks is the one taken. */
const BUS_WIDTH = 3.3 * PLACED_SECTION;
/** The slots of the bus's bodywork, the ones the paint names: the pack's bus is grey and white. */
const BUS_BODY = /^(Top|Bottom|Material)$/;

/**
 * How far one row of seats is behind the one ahead: the pack behind the hip, a
 * seat back, a knee ahead of the next hip, and a little air.
 */
const ROW_PITCH = HERO.back + HERO.knee + 0.08 * H;

function carModel(spec: CarSpec, models: ReadonlyMap<string, Model>, carK: number): CraftModel {
  const model = models.get(spec.model);
  if (model === undefined) throw new Error(`craft: the traffic kit has no '${spec.model}'`);
  const k = spec.scale?.(model) ?? carK;
  const cz = (model.box.min.z + model.box.max.z) / 2;
  const [, roofFore] = roofOf(model);
  // Under the roof where it meets the windscreen, a tenth of a body back.
  const front = (roofFore - cz) * k - 0.1 * H;
  // Under the roof, a crown and a twentieth of a body of air under it.
  const underRoof = (model.box.max.y - model.box.min.y) * k - HERO.crown - 0.05 * H;
  const hip = spec.hip === 'roof' ? underRoof : Math.min(spec.hip, underRoof);
  const seats: Seat[] = [];
  for (let row = 0; row <= spec.rows; row++) {
    const z = front - row * ROW_PITCH;
    // Driver on the left, +X; then the right; each row after, left then right.
    for (const side of [1, -1]) seats.push({ x: (side * ABREAST) / 2, y: hip, z, yaw: 0, pose: 'sit', shown: false });
  }
  // A tractor's cab holds one.
  if (spec.kind === 'tractor') seats.length = 1;

  const slots = spec.model === 'bus' ? BUS_BODY : undefined;
  const build = (variant: number, body?: number): THREE.Group => {
    const paint = body ?? spec.paints[((variant % spec.paints.length) + spec.paints.length) % spec.paints.length]!;
    const { still, wheels } = carSoups(model, k, paint, slots);
    return assemble(spec.id, [still], wheels);
  };
  return finish({ id: spec.id, kind: spec.kind, medium: 'road', seats, draft: 0, variants: spec.paints.length, lamps: lampsOf(model, k), build });
}

/** The road craft built off the traffic kit's own models, by name. */
export function buildCars(models: ReadonlyMap<string, Model>): CraftModel[] {
  const k = carScale(models);
  return SPECS.map((spec) => carModel(spec, models, k));
}
