/**
 * The inside of the other worlds' closed craft — the space kit's pressurised
 * rovers and its lander — built by **Earth's own cabin code**, not a copy of
 * it: the same see-through glass, the same lining, the same seats, dashboard,
 * wheel and instruments (`craft/cabin.ts`), laid off the kit model's own shell
 * as Earth's cars are laid off theirs (`craft/cars.ts`).
 *
 * **Why the driver was hidden, and what changed.** Until 2026-10-04 a closed
 * kit craft hid its pilot (`KitCraft.closed`): its windows were the pack's
 * near-black, painted slate, and a body sat in its hull poked out through
 * the roof, because the craft were fitted by length and not by the head of
 * the person in them. Now each is fitted the way an Earth car is — by
 * whether a seated crown clears its roof — and glazed: the window triangles
 * come out of the shell and are drawn in `glassMaterial` (blended, both
 * sides, writing no depth, no ink), and what hides the far wall's ink hull
 * through a window is the lining (`liner`), never the glass. So the driver
 * is seen from outside, and `V` in the seat looks out through the glass.
 *
 * Two shapes of inside:
 *
 * - **A cab** (the rovers): Quaternius's rovers are a car's shape, a cab with
 *   a windscreen and side windows, and `insideOf` furnishes them as it does a
 *   hatchback — the front row laid under the roof, the dashboard to the
 *   windscreen, the wheel on its column. Their glass is the pack's darkest
 *   slot (`isPane`, the near-black `craftPaint` read as a window), and their
 *   side windows are a little smaller, as a share of a model whose height is
 *   its mast, than `WINDOW_AREA` admits (`CAB_PANE_AREA`). The front row goes
 *   as far forward as the roof lets a seated head (`frontRow`): the cab's
 *   roof is raised only over its front.
 * - **A canopy** (the lander): Quaternius's Rae the Red Panda is a sealed
 *   fuselage with a glass bubble on its back, the bubble a fifth of a body
 *   deep over the fuselage's top. So the hull under the bubble is **cut
 *   away** — every triangle of the shell that has the glass straight over it
 *   and stands higher than the glass's own lowest edge — and the pilot sits
 *   in the fuselage with the head up in the bubble, at the yoke, a panel of
 *   instruments ahead (`roadCabin` with one seat on the axis), the cockpit
 *   closed behind the seat by a bulkhead so the eye does not look down the
 *   unlined fuselage.
 *
 * Built once a model and a length (`cockpitOf`), in the craft's fitted frame
 * — the model centred over its box, standing on `y = 0`, facing +Z, scaled by
 * `k` — which is `kitModel`'s (`craft.ts`) before its legs lift it; and
 * **throws** where no seated body fits, so a length that cannot hold the
 * person fails `scripts/check-worlds.ts` rather than seating them in the roof.
 */

import * as THREE from 'three';
import type { Model } from '../models.ts';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import { HERO, SEAT_EYE } from '../craft/body.ts';
import type { Seat } from '../craft/contract.ts';
import { insideOf, screenOf, windowsOf } from '../craft/cars.ts';
import type { CarSpec } from '../craft/cars.ts';
import { GLASS_TINT, LINER_INSET, WHEELS, emptySoup, joinSoups, liner, painted, probeOf, roadCabin } from '../craft/cabin.ts';
import type { ShellProbe } from '../craft/cabin.ts';
import { craftContext, loft, soupOf } from '../craft/build.ts';
import type { Soup, Station, Turning } from '../craft/build.ts';
import { lightnessOf } from './kit.ts';

const H = AVATAR_HEIGHT;

/** A closed craft's inside, in its fitted frame: see the head of this file. */
export interface Cockpit {
  /** Which of the model's triangles, in its own order, are taken out of the shell: the windows, and a canopy's cut. */
  drop: Uint8Array;
  /**
   * What is kept of a dropped triangle the canopy's rim crosses: pieces of
   * model triangle `t`, each three corners as weights of its own three
   * (nine numbers), so its paint, normals and ink normals carry over.
   */
  pieces: { t: number; weights: number[] }[];
  /** The see-through panes, tinted. */
  glass: Soup;
  /** The lining, the floor, the seats, the dashboard and the instruments, as one soup. */
  cabin: Soup;
  /** The wheel (`'steer'`) and the speedometer's needle (`'needle'`), each about its own axle. */
  turning: Turning[];
  /** Every seat, `seats[0]` the driver's, hips as `Seat`s; the driver's carries `legs` and `wheel`. */
  seats: Seat[];
  /** The driver's seated eye: `SEAT_EYE` over the hip, as on Earth (`Player.seatEye`). */
  eye: THREE.Vector3;
  /** The shell left after the cut, and the glass: what the checks measure a crown and an eye against. */
  probe: ShellProbe;
  /** The floor's top under the soles. */
  floor: number;
}

/** What shape of inside a closed kit craft has; see the head of this file. */
export type CockpitShape = 'cab' | 'canopy';

/** The space kit's glass: its darkest slot, the near-black `craftPaint` already reads as a window (`kit.ts`). */
const isPane = (_slot: string, colour: THREE.Color): boolean => lightnessOf(colour) < 0.16;

/**
 * How large a run of the kit's glass is to be a window, as a share of the
 * model's height squared: the rover's side windows are 0.029 of it (its
 * height is its mast's, 1.7 times its cab's), its windscreen 0.10, and the
 * two roof lenses beside it 0.003, which stay painted. Earth's
 * `WINDOW_AREA` is 0.03.
 */
const CAB_PANE_AREA = 0.02;
/** The same for a canopy: the lander's bubble is 0.46 of its height squared, its two cheek lenses 0.013. */
const CANOPY_PANE_AREA = 0.02;

/** How far one try of the front row is behind the last, while the roof is too low for a head (`frontRow`). */
const ROW_STEP = 0.05 * H;
/** The floor's top over the shell's bottom, and the least air over a crown: Earth's cars' (`FLOOR_OVER`, `HEAD_ROOM`). */
const FLOOR_OVER = 0.03 * H;
const HEAD_ROOM = 0.03 * H;

/**
 * How far inside a cut-open hull its lining stands: a quarter of
 * `LINER_INSET`. The cut leaves open edges all round the cockpit, and along
 * one the welded normal the lining is set in by leans across the edge, so
 * at the full inset the lining stood off the rim it lines and the seated eye
 * saw a sliver of the hull's back, and its ink, round the bubble (8% of what
 * it saw of the hull, measured on the lander); at a quarter, under a
 * percent. The lining's fill is still nearer the eye than the hull's ink,
 * which is pushed out from the hull and away from anyone inside it.
 */
const CUT_INSET = LINER_INSET / 4;

const TRIM = { seat: PALETTE.bark, dash: PALETTE.steel, lining: PALETTE.bone, wall: craftContext().tone(PALETTE.steel, 1.25) };

const known = new Map<string, Cockpit>();

/**
 * The inside of the space kit's `model` at scale `k` (world units a pack
 * unit), as a `shape`; one a model, a shape and a scale, kept. Throws where a
 * seated body does not fit it.
 */
export function cockpitOf(model: Model, shape: CockpitShape, k: number): Cockpit {
  const key = `${model.name}:${shape}@${k.toFixed(5)}`;
  const kept = known.get(key);
  if (kept !== undefined) return kept;
  const made = shape === 'cab' ? cab(model, k) : canopy(model, k);
  known.set(key, made);
  return made;
}

/** The driver's eye in the fitted frame: `SEAT_EYE` over and ahead of the hip, turned by the seat's yaw. */
function eyeOf(seat: Seat): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(seat.yaw) * SEAT_EYE.ahead, SEAT_EYE.up, Math.cos(seat.yaw) * SEAT_EYE.ahead).add(new THREE.Vector3(seat.x, seat.y, seat.z));
}

/**
 * The model's own triangles in the fitted frame, as two soups — the shell
 * (all but `glass` and `cut`) and the glass — with their normals and ink
 * normals carried over (a uniform positive scale leaves them as they are);
 * the colour is the lining's business, not the shell's.
 */
function fitted(model: Model, k: number, glass: Uint8Array, cut?: Uint8Array): { shell: Soup; panes: Soup } {
  const position = model.geometry.getAttribute('position');
  const normal = model.geometry.getAttribute('normal');
  const outline = model.geometry.getAttribute('outlineNormal') ?? normal;
  const index = model.geometry.index;
  const vertexOf = (corner: number): number => (index !== null ? index.getX(corner) : corner);
  const count = (index !== null ? index.count : position.count) / 3;
  const cx = (model.box.min.x + model.box.max.x) / 2;
  const cz = (model.box.min.z + model.box.max.z) / 2;
  const base = model.box.min.y;
  let shells = 0;
  let paneCount = 0;
  for (let t = 0; t < count; t++) {
    if (glass[t] !== 0) paneCount++;
    else if (cut === undefined || cut[t] === 0) shells++;
  }
  const shell = emptySoup(shells);
  const panes = emptySoup(paneCount);
  let s = 0;
  let p = 0;
  for (let t = 0; t < count; t++) {
    const into = glass[t] !== 0 ? panes : cut === undefined || cut[t] === 0 ? shell : null;
    if (into === null) continue;
    let o = into === panes ? p : s;
    for (let c = 0; c < 3; c++) {
      const v = vertexOf(t * 3 + c);
      into.position[o] = (position.getX(v) - cx) * k;
      into.position[o + 1] = (position.getY(v) - base) * k;
      into.position[o + 2] = (position.getZ(v) - cz) * k;
      into.normal[o] = normal.getX(v);
      into.normal[o + 1] = normal.getY(v);
      into.normal[o + 2] = normal.getZ(v);
      into.outline[o] = outline.getX(v);
      into.outline[o + 1] = outline.getY(v);
      into.outline[o + 2] = outline.getZ(v);
      o += 3;
    }
    if (into === panes) p = o;
    else s = o;
  }
  return { shell, panes: painted(panes, GLASS_TINT) };
}

// ---------------------------------------------------------------------------
// A cab
// ---------------------------------------------------------------------------

/**
 * A rover's cab, furnished as Earth furnishes a car (`insideOf`): two seats
 * abreast, the driver's on the left (+X) as the worlds drive on the right
 * (`traffic.ts`), a full dashboard and the car's wheel. The front row is the
 * frontmost that clears a seated crown (`frontRow`), from where the
 * windscreen meets the roof back.
 */
function cab(model: Model, k: number): Cockpit {
  const spec: CarSpec = { id: model.name, kind: 'car', model: model.name, legs: 'drive', wheel: 'car', rows: 0, paints: [PALETTE.white], isPane, paneArea: CAB_PANE_AREA };
  const windows = windowsOf(model, isPane, CAB_PANE_AREA);
  const { shell, panes } = fitted(model, k, windows);
  const screen = screenOf(panes);
  if (screen === null) throw new Error(`cockpit ${model.name}: no windscreen among its panes`);
  // From the windscreen's top edge back, a step at a time, the first row a head fits under.
  let failure = '';
  const tail = -((model.box.max.z - model.box.min.z) * k) / 2 + HERO.back;
  for (let front = screen.header.z; front > tail; front -= ROW_STEP) {
    try {
      const inside = insideOf({ ...spec, front }, model, k);
      return {
        drop: inside.windows,
        pieces: [],
        glass: inside.glass,
        cabin: inside.furnished,
        turning: inside.turning,
        seats: inside.seats,
        eye: eyeOf(inside.seats[0]!),
        probe: probeOf([shell, panes]),
        floor: inside.seats[0]!.y - HERO.drive.sole,
      };
    } catch (error) {
      failure = (error as Error).message;
    }
  }
  throw new Error(`cockpit ${model.name}: no row fits a seated body at ${k.toFixed(3)} (${failure})`);
}

// ---------------------------------------------------------------------------
// A canopy
// ---------------------------------------------------------------------------

/**
 * A ship's cockpit under its bubble: see the head of this file. The seat is
 * on the axis where the bubble is tallest, the soles on the fuselage's floor,
 * the legs to the pedals (`HERO.drive`); the dashboard and the yoke are
 * `roadCabin`'s, its top held under the bubble's front edge; the lining is
 * every face of the hull from the bulkhead behind the seat to the firewall
 * whose back looks into the cockpit.
 */
function canopy(model: Model, k: number): Cockpit {
  const windows = windowsOf(model, isPane, CANOPY_PANE_AREA);
  const whole = fitted(model, k, windows);
  const bubble = probeOf([whole.panes]);
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let i = 0; i < whole.panes.position.length; i += 3) box.expandByPoint(point.fromArray(whole.panes.position, i));
  if (box.isEmpty()) throw new Error(`cockpit ${model.name}: no canopy among its panes`);

  // The cut: the hull under the bubble, clipped to the bubble's own outline
  // seen from above (`footprintOf`) — every face of the hull that has the
  // glass straight over its middle, higher than the glass's lowest edge,
  // loses what of it is inside that outline and keeps the rest, so the
  // cockpit opens under the whole bubble and nowhere past its rim. The pack's
  // faces are large (a hull of 1,600 triangles) and most cross the rim, so a
  // face is cut whole only where all of it is inside. In the model's own
  // triangle order; what a crossed face keeps is `pieces`.
  const footprint = footprintOf(whole.panes);
  const position = model.geometry.getAttribute('position');
  const index = model.geometry.index;
  const vertexOf = (corner: number): number => (index !== null ? index.getX(corner) : corner);
  const count = (index !== null ? index.count : position.count) / 3;
  const cx = (model.box.min.x + model.box.max.x) / 2;
  const cz = (model.box.min.z + model.box.max.z) / 2;
  const base = model.box.min.y;
  const cut = new Uint8Array(count);
  const pieces: { t: number; weights: number[] }[] = [];
  const below = box.min.y - 0.01 * H;
  const corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const middle = new THREE.Vector3();
  for (let t = 0; t < count; t++) {
    if (windows[t] !== 0) continue;
    middle.set(0, 0, 0);
    for (let c = 0; c < 3; c++) {
      const v = vertexOf(t * 3 + c);
      corner[c]!.set((position.getX(v) - cx) * k, (position.getY(v) - base) * k, (position.getZ(v) - cz) * k);
      middle.addScaledVector(corner[c]!, 1 / 3);
    }
    if (middle.y <= below || !Number.isFinite(bubble.cast(middle.x, middle.y, middle.z, 0, 1, 0))) continue;
    const kept = outside(corner, footprint);
    if (kept === null) continue;
    cut[t] = 1;
    for (const weights of kept) pieces.push({ t, weights });
  }
  const { shell: rest } = fitted(model, k, windows, cut);
  const shell = joinSoups([rest, piecesSoup(model, k, pieces)]);
  const probe = probeOf([shell, whole.panes]);
  const hull = probeOf([shell]);

  // The seat: on the axis under the bubble's highest point, the soles on the floor.
  let best = -Infinity;
  let at = (box.min.z + box.max.z) / 2;
  for (let z = box.min.z + 0.05 * H; z <= box.max.z - 0.05 * H; z += 0.02 * H) {
    const top = box.min.y - 0.5 * H + bubble.cast(0, box.min.y - 0.5 * H, z, 0, 1, 0);
    if (top > best + 1e-6) [best, at] = [top, z];
  }
  if (!Number.isFinite(best)) throw new Error(`cockpit ${model.name}: no bubble over its axis`);
  // The head is a little ahead of the hip (`SEAT_EYE.ahead`): the hip a little behind the top.
  const hipZ = at - SEAT_EYE.ahead;
  // Asked a hair either side of the axis as well: a ray down a seam between
  // two of the hull's triangles can slip through it.
  const shellFloor = Math.max(...[0, 0.01 * H, -0.01 * H].map((x) => probe.floor(x, best - 0.1 * H, hipZ)));
  if (!Number.isFinite(shellFloor)) throw new Error(`cockpit ${model.name}: no floor under its seat`);
  const floor = shellFloor + FLOOR_OVER;
  const hip = floor + HERO.drive.sole;
  const roof = probe.ceiling(0, hip, hipZ);
  if (hip + HERO.crown + HEAD_ROOM > roof) {
    throw new Error(`cockpit ${model.name}: a seated crown at ${(hip + HERO.crown).toFixed(2)} is through the canopy at ${roof.toFixed(2)}`);
  }
  const seat: Seat = { x: 0, y: hip, z: hipZ, yaw: 0, pose: 'sit', shown: true, legs: 'drive', wheel: WHEELS.car };
  const screen = screenOf(whole.panes);
  if (screen === null) throw new Error(`cockpit ${model.name}: its canopy has no forward face`);
  const rear = hipZ - HERO.back - 0.12 * H;
  const cabin = roadCabin({
    seats: [seat],
    probe,
    // The dashboard's top under the bubble's front edge, which is the hull's
    // top there; the mirror under the bubble's top.
    screen: screen.bottom,
    header: screen.header,
    floor,
    rear,
    wheel: 'car',
    trim: TRIM.seat,
    dash: TRIM.dash,
    full: true,
    wheels: [],
  });

  // Two bulkheads close the cockpit: one behind the seat, and one a little
  // past the bubble's front edge, where the hull and not the glass is over
  // it. Each is the fuselage's whole section there, from the floor to what is
  // over it, so the eye sees the cockpit's walls and not down the length of
  // an unlined hull, aft or over the dashboard towards the nose.
  const thick = 0.03 * H;
  const fore = Math.max(cabin.firewall, box.max.z + 0.05 * H);
  const bulkhead = (from: number): Soup => {
    const stations: Station[] = [];
    // Its edge follows the hull's section at seven heights, as wide as the
    // hull lets it be at each: one width for the whole height left a gap
    // beside it where the fuselage bellies out.
    const steps = 6;
    let top = 0;
    for (const z of [from, from + thick]) top = Math.max(top, probe.ceiling(0, floor + 0.05 * H, z) - 0.01 * H);
    for (const z of [from, from + thick]) {
      const side: [number, number][] = [];
      let last = 0.05 * H;
      for (let i = 0; i <= steps; i++) {
        const y = floor - 0.02 * H + ((top - floor + 0.02 * H) * i) / steps;
        const at = Math.min(Math.max(y, floor + 0.01 * H), top - 0.01 * H);
        // The hull's own sides, not the glass: the bubble's skirt comes down
        // inside the hull's cheeks, and a width taken to it left a gap.
        const half = Math.min(hull.wall(at, z, 1), hull.wall(at, z, -1)) - 0.01 * H;
        if (Number.isFinite(half) && half > 0.05 * H) last = half;
        side.push([last, y]);
      }
      stations.push({ z, ring: [...side, ...side.reverse().map(([x, y]): [number, number] => [-x, y])] });
    }
    return soupOf(loft(stations, TRIM.wall));
  };
  const walls = [bulkhead(rear - thick), bulkhead(fore)];

  // Lined between the bulkheads, over the floor: every face the seated eye
  // would see from behind. The eye and not the cockpit's middle is what the
  // faces are turned against, because the cockpit is a bubble over a deep
  // tub and the eye is high in it: a face low on the tub's side can face its
  // middle and still turn its back on the eye.
  const eye = eyeOf(seat);
  const lining = liner(shell, {
    keep: (x, y, z, nx, ny, nz) => y > floor - 0.02 * H && z > rear - thick && z < fore + thick && nx * (x - eye.x) + ny * (y - eye.y) + nz * (z - eye.z) > 0,
    colour: (y) => (y < screen.bottom.y ? TRIM.wall : TRIM.lining),
  }, CUT_INSET);
  const drop = new Uint8Array(count);
  for (let t = 0; t < count; t++) drop[t] = windows[t]! | cut[t]!;
  return {
    drop,
    pieces,
    glass: whole.panes,
    cabin: joinSoups([lining, cabin.still, ...walls]),
    turning: cabin.turning,
    seats: [seat],
    eye,
    probe,
    floor,
  };
}

/** The bubble's outline seen from above: the convex hull of its panes' corners in (x, z), counter-clockwise. */
function footprintOf(glass: Soup): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < glass.position.length; i += 3) points.push([glass.position[i]!, glass.position[i + 2]!]);
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** A polygon's area in (x, z), signed counter-clockwise. */
function areaOf(ring: readonly [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** The part of a polygon on the left of the line a to b (or the right, `left` false): Sutherland–Hodgman's one step. */
function clipSide(ring: readonly [number, number][], a: [number, number], b: [number, number], left: boolean): [number, number][] {
  const side = (p: readonly [number, number]): number => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) * (left ? 1 : -1);
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) out.push([p[0], p[1]]);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/**
 * What of a hull face stands outside the bubble's outline, as triangles of
 * weights of its own corners: `null` when none of it is inside (it is kept
 * whole), an empty list when all of it is (it is cut whole). A face standing
 * on its edge, seen from above, is cut only if its middle is inside, for it
 * has no area there to clip.
 */
function outside(corner: readonly THREE.Vector3[], footprint: readonly [number, number][]): number[][] | null {
  const [a, b, c] = corner as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  const tri: [number, number][] = [[a.x, a.z], [b.x, b.z], [c.x, c.z]];
  const whole = areaOf(tri);
  const n = footprint.length;
  if (Math.abs(whole) < 1e-6 * H * H) {
    const mx = (a.x + b.x + c.x) / 3;
    const mz = (a.z + b.z + c.z) / 3;
    for (let i = 0; i < n; i++) if (clipSide([[mx, mz]], footprint[i]!, footprint[(i + 1) % n]!, true).length === 0) return null;
    return [];
  }
  // Peel the face along each of the outline's edges: what is on its outer
  // side is outside, and what is on its inner side goes on to the next edge.
  const pieces: [number, number][][] = [];
  let rest: [number, number][] = tri;
  for (let i = 0; i < n && rest.length >= 3; i++) {
    const p = footprint[i]!;
    const q = footprint[(i + 1) % n]!;
    const out = clipSide(rest, p, q, false);
    if (out.length >= 3 && Math.abs(areaOf(out)) > 1e-5 * Math.abs(whole)) pieces.push(out);
    rest = clipSide(rest, p, q, true);
  }
  const inside = rest.length >= 3 ? Math.abs(areaOf(rest)) : 0;
  if (inside < 1e-4 * Math.abs(whole)) return null;
  // Weights of the face's corners at a point of it, from (x, z).
  const weightsAt = (p: readonly [number, number]): [number, number, number] => {
    const d = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
    const wb = ((p[0] - a.x) * (c.z - a.z) - (c.x - a.x) * (p[1] - a.z)) / d;
    const wc = ((b.x - a.x) * (p[1] - a.z) - (p[0] - a.x) * (b.z - a.z)) / d;
    return [1 - wb - wc, wb, wc];
  };
  const out: number[][] = [];
  for (const ring of pieces) {
    // A fan: the clip keeps the face's own winding round each piece, and the
    // fan keeps the piece's, so every piece faces the way the face did.
    for (let i = 1; i + 1 < ring.length; i++) out.push([ring[0]!, ring[i]!, ring[i + 1]!].flatMap((p) => weightsAt(p)));
  }
  return out;
}

/** The kept pieces of crossed faces in the fitted frame, as a soup: what the lining and the probe are laid off with the rest of the shell. */
function piecesSoup(model: Model, k: number, pieces: readonly { t: number; weights: number[] }[]): Soup {
  const position = model.geometry.getAttribute('position');
  const normal = model.geometry.getAttribute('normal');
  const outline = model.geometry.getAttribute('outlineNormal') ?? normal;
  const index = model.geometry.index;
  const vertexOf = (corner: number): number => (index !== null ? index.getX(corner) : corner);
  const cx = (model.box.min.x + model.box.max.x) / 2;
  const cz = (model.box.min.z + model.box.max.z) / 2;
  const base = model.box.min.y;
  const soup = emptySoup(pieces.length);
  const n = new THREE.Vector3();
  const o = new THREE.Vector3();
  let at = 0;
  for (const { t, weights } of pieces) {
    const v = [vertexOf(t * 3), vertexOf(t * 3 + 1), vertexOf(t * 3 + 2)];
    for (let c = 0; c < 3; c++) {
      let x = 0;
      let y = 0;
      let z = 0;
      n.set(0, 0, 0);
      o.set(0, 0, 0);
      for (let j = 0; j < 3; j++) {
        const w = weights[c * 3 + j]!;
        x += w * (position.getX(v[j]!) - cx) * k;
        y += w * (position.getY(v[j]!) - base) * k;
        z += w * (position.getZ(v[j]!) - cz) * k;
        n.x += w * normal.getX(v[j]!);
        n.y += w * normal.getY(v[j]!);
        n.z += w * normal.getZ(v[j]!);
        o.x += w * outline.getX(v[j]!);
        o.y += w * outline.getY(v[j]!);
        o.z += w * outline.getZ(v[j]!);
      }
      n.normalize();
      o.normalize();
      soup.position.set([x, y, z], at);
      soup.normal.set([n.x, n.y, n.z], at);
      soup.outline.set([o.x, o.y, o.z], at);
      at += 3;
    }
  }
  return soup;
}
