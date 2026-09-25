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
 * the triangles on the pack's `Tyre` and `Hub` slots, sorted into four by the
 * side and the end they are on, each re-centred on its own axle and handed over
 * as a `'wheel'` that turns about +X.
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
 * The model painted and fitted, as a body soup and four wheels. Every point is
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

  // Triangles into five bins: the body, and a wheel at each corner.
  const bins: number[][] = [[], [], [], [], []];
  const wheelSlot = model.slots.map((slot) => WHEEL_SLOTS.test(slot));
  for (let t = 0; t < triangleCount; t++) {
    const [a, b, c] = [vertexOf(t * 3), vertexOf(t * 3 + 1), vertexOf(t * 3 + 2)];
    if (!wheelSlot[model.slot[a]!]) {
      bins[0]!.push(t);
      continue;
    }
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3 - cx;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3 - cz;
    bins[1 + (x > 0 ? 1 : 0) + (z > 0 ? 2 : 0)]!.push(t);
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
  for (let w = 1; w < 5; w++) {
    const triangles = bins[w]!;
    if (triangles.length === 0) continue;
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
  return { still: soupFrom(bins[0]!, new THREE.Vector3()), wheels };
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

  const body = spec.model === 'bus' ? BUS_BODY : undefined;
  const build = (variant: number): THREE.Group => {
    const paint = spec.paints[((variant % spec.paints.length) + spec.paints.length) % spec.paints.length]!;
    const { still, wheels } = carSoups(model, k, paint, body);
    return assemble(spec.id, [still], wheels);
  };
  return finish({ id: spec.id, kind: spec.kind, medium: 'road', seats, draft: 0, variants: spec.paints.length, build });
}

/** The road craft built off the traffic kit's own models, by name. */
export function buildCars(models: ReadonlyMap<string, Model>): CraftModel[] {
  const k = carScale(models);
  return SPECS.map((spec) => carModel(spec, models, k));
}
