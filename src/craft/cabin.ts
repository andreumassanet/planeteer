/**
 * The inside of a closed vehicle: glass you can see through, a lining for the
 * shell, and a cabin to sit in — floor, seats, dashboard, steering wheel,
 * instruments, a mirror — built in code on the world's ramp and inked, as the
 * monuments are, because no CC0 pack has an interior that fits the outside of
 * the Kenney and Quaternius vehicles it would have to go into.
 *
 * **Why every window was opaque, and what changed.** A closed shell seen
 * through a hole is its own far wall from behind: single-sided, that face is
 * not drawn, and the ink hull — the shell's back faces pushed out — is all
 * that is. So a window cut in a car showed a black blob where its far side
 * was, which is why glass in this world was `slate` and nothing inside was
 * ever seen. What fixes it is not the glass but a **lining**: every face of
 * the shell that looks into the cabin is copied, turned to face in and set
 * `LINER_INSET` inside it (`liner`). From within, and from outside through a
 * window, what is seen of the far wall is the lining's front, which writes
 * depth a little nearer than the shell's hull and so hides it; and the
 * lining's own hull falls only on its silhouettes — the pillars, the door
 * tops, the edge of the roof — which is where a comic draws the lines of a
 * car's inside. The first-person eye, inside the shell, is inside the
 * lining too, and the same holds: no screen of ink, and the ink kept.
 *
 * **The glass is then free to be glass** (`glassMaterial`): the window's own
 * triangles, taken out of the shell and drawn tinted and see-through, both
 * sides, with no ink of their own — a pane is the frame's to outline — and
 * **writing no depth**. A pane that wrote depth would hide every hull behind
 * it from the outline pass, which runs after the fills: the driver seen
 * through a side window would lose his outline, and from the driver's seat
 * so would every car, house and tree seen through the windscreen. With the
 * lining there to hide the far wall, nothing behind the glass needs hiding.
 *
 * **Sized off the shell, not written down** (`probeOf`): the floor is laid
 * over the shell's own bottom, the dashboard runs forward until it meets the
 * windscreen and the bonnet, the seats are as wide as the shell lets them be,
 * so the same code furnishes a hatchback, a van, a bus, a tractor's cab and a
 * town's traffic. The body that sits in it is `HERO` (`body.ts`), seated with
 * the legs to the pedals (`HERO.drive`), which is what decides where the
 * dashboard's underside, the wheel and the firewall may go.
 *
 * **Nothing here knows which vehicle it furnishes.** `liner` takes any shell
 * and a rule, `probeOf` any soup, `roadCabin` any shell with its windscreen
 * and its seats, and `seatPieces`, `wheelPart`, `instrumentPanel` and `stick`
 * any seat: the helicopter, the submarine, the launch and the plane are
 * furnished from the same pieces, and so can any other closed craft be —
 * the other worlds' pressurised rover and their lander's canopy among them.
 */
import * as THREE from 'three';
import { AVATAR_HEIGHT } from '../stature.ts';
import { PALETTE } from '../theme.ts';
import type { WheelGrip } from '../cast.ts';
import type { Seat } from './contract.ts';
import { HERO } from './body.ts';
import { PROUD, craftContext, loft, soupOf } from './build.ts';
import type { Soup, Station, Turning } from './build.ts';

const H = AVATAR_HEIGHT;
const V = THREE.Vector3;

// ---------------------------------------------------------------------------
// The glass
// ---------------------------------------------------------------------------

export { GLASS_OPACITY, GLASS_TINT, glassMaterial } from './build.ts';

/** Whether a material is a craft's see-through glass: what the fleet still fades and the merge leaves out. */
export const isGlassMaterial = (material: THREE.Material): boolean => material.userData.atlasGlass === true;

/**
 * How near a vehicle nobody is riding is drawn glazed and driven: its windows
 * see-through, a cabin inside and a driver at the wheel — Earth's road
 * traffic (`glazeTraffic`, `life.ts`) and the other worlds' rovers
 * (`worlds/traffic.ts`). Past it the vehicle is its plain build, opaque
 * slate glass and nobody in it, which is what it was everywhere until
 * 2026-10-04: a driver is the cast's seated body and some seven hundred
 * triangles, a lining and a front row some six hundred more, and at a
 * hundred and twenty units a driver behind tinted glass is a few pixels. Not
 * scaled by the detail knob: it answers whether the inside can be seen, not
 * how far the world is built.
 */
export const CABIN_REACH = 120;

// ---------------------------------------------------------------------------
// Soups
// ---------------------------------------------------------------------------

/** An empty soup of `triangles` triangles. */
export function emptySoup(triangles: number): Soup {
  const n = triangles * 9;
  return { position: new Float32Array(n), normal: new Float32Array(n), color: new Float32Array(n), outline: new Float32Array(n) };
}

/** Soups end to end. */
export function joinSoups(soups: readonly Soup[]): Soup {
  let n = 0;
  for (const soup of soups) n += soup.position.length;
  const out = emptySoup(n / 9);
  let at = 0;
  for (const soup of soups) {
    out.position.set(soup.position, at);
    out.normal.set(soup.normal, at);
    out.color.set(soup.color, at);
    out.outline.set(soup.outline, at);
    at += soup.position.length;
  }
  return out;
}

/** Every vertex of a soup repainted one colour, in place: what a window's triangles become as glass. */
export function painted(soup: Soup, colour: number): Soup {
  const c = new THREE.Color(colour);
  for (let i = 0; i < soup.color.length; i += 3) {
    soup.color[i] = c.r;
    soup.color[i + 1] = c.g;
    soup.color[i + 2] = c.b;
  }
  return soup;
}

// ---------------------------------------------------------------------------
// The shell, probed
// ---------------------------------------------------------------------------

/**
 * A shell asked where it is from inside: straight rays against its triangles,
 * both faces, nearest hit. What the cabin is sized by.
 */
export interface ShellProbe {
  /** Distance along a unit ray to the first triangle, or Infinity. */
  cast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number;
  /** The height of the first surface over a point, or Infinity. */
  ceiling(x: number, y: number, z: number): number;
  /** The height of the first surface under a point, or -Infinity. */
  floor(x: number, y: number, z: number): number;
  /** How far out to `side` (+1 the left, +X) from the axis the first surface is at a height and station, or Infinity. */
  wall(y: number, z: number, side: 1 | -1): number;
}

export function probeOf(soups: readonly Soup[]): ShellProbe {
  const all = joinSoups(soups).position;
  const count = all.length / 9;
  // Möller–Trumbore against every triangle; a cabin asks a few dozen rays of
  // a shell of a thousand or two, which is nothing next to building it.
  function cast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
    let best = Infinity;
    for (let t = 0; t < count; t++) {
      const i = t * 9;
      const ax = all[i]!, ay = all[i + 1]!, az = all[i + 2]!;
      const e1x = all[i + 3]! - ax, e1y = all[i + 4]! - ay, e1z = all[i + 5]! - az;
      const e2x = all[i + 6]! - ax, e2y = all[i + 7]! - ay, e2z = all[i + 8]! - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const sx = ox - ax, sy = oy - ay, sz = oz - az;
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const d = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (d > 1e-6 && d < best) best = d;
    }
    return best;
  }
  return {
    cast,
    ceiling: (x, y, z) => y + cast(x, y, z, 0, 1, 0),
    floor: (x, y, z) => y - cast(x, y, z, 0, -1, 0),
    wall: (y, z, side) => cast(0, y, z, side, 0, 0),
  };
}

// ---------------------------------------------------------------------------
// The lining
// ---------------------------------------------------------------------------

/**
 * How far inside the shell its lining stands: a fiftieth of a body, enough
 * that the lining's fill is nearer the eye than the shell's hull at any
 * angle the cabin is seen from, and too little to read as a thickness at a
 * window's edge.
 */
export const LINER_INSET = 0.02 * H;

/** Which of a shell's triangles get a lining, by its middle and its own normal; and what colour, by its middle's height. */
export interface LinerRule {
  keep(cx: number, cy: number, cz: number, nx: number, ny: number, nz: number): boolean;
  /** By the middle's height and the shell face's own outward normal's rise: a roof's faces rise, a door's do not. */
  colour(cy: number, ny: number): number;
}

/**
 * The lining of a shell: every kept triangle copied, wound the other way,
 * its normal and its ink's normal turned to face in, and every corner moved
 * `LINER_INSET` in along the shell's **welded** normal — the mean of every
 * face that meets at that point — so the lining stays closed where the shell
 * has a crease, as an inset along each face's own normal would not.
 * `inset` is `LINER_INSET` but where a shell has been cut open (a canopy's
 * cockpit, `worlds/cockpit.ts`): along an open edge the welded normal leans
 * the lining off the edge it lines, and a full inset leaves a sliver of the
 * shell bare there.
 */
export function liner(shell: Soup, rule: LinerRule, inset = LINER_INSET): Soup {
  const p = shell.position;
  const count = p.length / 9;
  // Welded normals, area-weighted, by position to a thousandth of a body.
  const q = (v: number): number => Math.round(v / (H * 1e-3));
  const keyOf = (i: number): string => `${q(p[i]!)},${q(p[i + 1]!)},${q(p[i + 2]!)}`;
  const welded = new Map<string, THREE.Vector3>();
  const a = new V();
  const b = new V();
  const c = new V();
  const n = new V();
  for (let t = 0; t < count; t++) {
    const i = t * 9;
    a.fromArray(p, i);
    b.fromArray(p, i + 3).sub(a);
    c.fromArray(p, i + 6).sub(a);
    n.crossVectors(b, c);
    for (let k = 0; k < 3; k++) {
      const key = keyOf(i + k * 3);
      const sum = welded.get(key);
      if (sum === undefined) welded.set(key, n.clone());
      else sum.add(n);
    }
  }
  for (const sum of welded.values()) sum.normalize();

  const kept: number[] = [];
  for (let t = 0; t < count; t++) {
    const i = t * 9;
    a.fromArray(p, i);
    b.fromArray(p, i + 3);
    c.fromArray(p, i + 6);
    n.subVectors(b, a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-14) continue;
    n.normalize();
    if (rule.keep((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3, n.x, n.y, n.z)) kept.push(t);
  }
  const out = emptySoup(kept.length);
  const colour = new THREE.Color();
  let o = 0;
  for (const t of kept) {
    const i = t * 9;
    a.fromArray(p, i);
    b.fromArray(p, i + 3);
    c.fromArray(p, i + 6);
    n.subVectors(b, a).cross(c.clone().sub(a)).normalize().negate();
    colour.set(rule.colour((a.y + b.y + c.y) / 3, -n.y));
    // Corners 0, 2, 1: wound the other way round, so the lining faces in.
    for (const k of [0, 2, 1]) {
      const w = welded.get(keyOf(i + k * 3))!;
      out.position[o] = p[i + k * 3]! - w.x * inset;
      out.position[o + 1] = p[i + k * 3 + 1]! - w.y * inset;
      out.position[o + 2] = p[i + k * 3 + 2]! - w.z * inset;
      out.normal[o] = n.x;
      out.normal[o + 1] = n.y;
      out.normal[o + 2] = n.z;
      out.outline[o] = -w.x;
      out.outline[o + 1] = -w.y;
      out.outline[o + 2] = -w.z;
      out.color[o] = colour.r;
      out.color[o + 1] = colour.g;
      out.color[o + 2] = colour.b;
      o += 3;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The seats
// ---------------------------------------------------------------------------

/** A seat cushion's thickness, and the seat back's. */
const CUSHION = 0.05 * H;
const BACKREST = 0.05 * H;
/** How far behind the pack the seat back's face is, where its foot is over the hip, and how high it rises. */
const BACK_GAP = 0.006 * H;
const BACK_FOOT = 0.08 * H;
const BACK_TOP = 0.37 * H;
/** The headrest: its bottom and top over the hip, and its width. */
const HEADREST = [0.4, 0.49, 0.17] as const;

/**
 * One seat as built for the body on it: a cushion whose top is the hip — the
 * hip is on its pan, as `review.ts` asks — a seat back behind the pack, and
 * a headrest behind the head. The cushion is a slab on a short pedestal at
 * its front, and not a block to the floor, because the feet of whoever sits
 * behind go under it (`HERO.drive.toe` is longer than a row's pitch). Any
 * seat facing other than ahead is turned by its yaw.
 */
export function seatPieces(seat: Seat, floor: number, base: number, headrest = true): THREE.Group {
  const { box, tone } = craftContext();
  const colour = base;
  const group = new THREE.Group();
  const width = 2 * HERO.half * 1.02;
  // The cushion: from a little behind the hip to under the thighs, short of the knee.
  const fore = 0.17 * H;
  const aft = 0.07 * H;
  const cushion = box(width, CUSHION, fore + aft, colour);
  cushion.position.set(0, -CUSHION, (fore - aft) / 2);
  group.add(cushion);
  // The pedestal under its front, clear of the feet behind it.
  const stand = Math.max(0, seat.y - CUSHION - floor);
  if (stand > 0.01 * H) {
    const pedestal = box(width * 0.7, stand, 0.05 * H, tone(base, 0.6));
    pedestal.position.set(0, -CUSHION - stand, fore - 0.05 * H);
    group.add(pedestal);
  }
  // The back, standing behind the pack from a little over the cushion: the
  // gap under it is where the shins of whoever sits behind go past it.
  const back = box(width, BACK_TOP - BACK_FOOT, BACKREST, colour);
  back.position.set(0, BACK_FOOT, -HERO.back - BACK_GAP - BACKREST / 2);
  group.add(back);
  if (headrest) {
    const rest = box(HEADREST[2] * H, (HEADREST[1] - HEADREST[0]) * H, BACKREST * 0.8, tone(base, 0.85));
    rest.position.set(0, HEADREST[0] * H, -HERO.back - BACK_GAP - BACKREST / 2);
    group.add(rest);
  }
  group.position.set(seat.x, seat.y, seat.z);
  group.rotation.y = seat.yaw;
  return group;
}

// ---------------------------------------------------------------------------
// The wheel and the instruments
// ---------------------------------------------------------------------------

/**
 * What a driver holds: a car's wheel, a bus's broad flat one, a tractor's
 * upright one. Each is a `WheelGrip` about the driver's hip — measured
 * against the hero's own arms, which are short for his height (the cast's
 * shoulder to wrist is 0.22 of a body, `HERO.reach`), so the wheel is near
 * the chest — and every one clears the knees (`HERO.drive.kneeTop`).
 */
export const WHEELS = {
  car: { centre: [0, 0.3 * H, 0.25 * H], tilt: (28 * Math.PI) / 180, radius: 0.08 * H, spread: 1.5 },
  bus: { centre: [0, 0.28 * H, 0.24 * H], tilt: (50 * Math.PI) / 180, radius: 0.09 * H, spread: 1.5 },
  tractor: { centre: [0, 0.3 * H, 0.24 * H], tilt: (40 * Math.PI) / 180, radius: 0.08 * H, spread: 1.5 },
} as const satisfies Record<string, WheelGrip>;

export type WheelKind = keyof typeof WHEELS;

/**
 * The wheel's turn at full lock, radians: a real car's goes round a turn and
 * more each way; this one a quarter turn, which reads as a hard turn from the
 * seat and keeps the spokes where the eye can follow them. The hands go with
 * it only as far as `WHEEL_HOLD` (`cast.ts`) and slide past.
 */
export const WHEEL_LOCK = 1.6;

/** The axle a wheel turns about, forward and down from its middle, as a unit vector in the seat's frame. */
export function wheelAxle(wheel: WheelGrip): THREE.Vector3 {
  return new V(0, -Math.sin(wheel.tilt), Math.cos(wheel.tilt));
}

/**
 * The wheel as a turning part, about its own axle (local +Z, away from the
 * driver), drawn in its own plane: a rim, three spokes and a boss. `at` is its
 * middle in the craft's frame. `assemble` stands it on the tilt. What a road
 * cabin's driver holds, and a launch's helmsman.
 */
export function wheelPart(wheel: WheelGrip, at: THREE.Vector3, colour: number): Turning {
  const { ringWall, strut, column, tone } = craftContext();
  const group = new THREE.Group();
  const rim = 0.014 * H;
  const ring = ringWall(wheel.radius - rim, wheel.radius + rim, rim * 1.6, colour, 14);
  // A ring wall stands up +Y; a quarter turn about X lays its axle along +Z.
  ring.rotation.x = Math.PI / 2;
  ring.position.z = -rim * 0.8;
  group.add(ring);
  for (const angle of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
    group.add(strut(new V(0, 0, 0), new V(Math.cos(angle) * wheel.radius, Math.sin(angle) * wheel.radius, 0), rim * 1.1, colour));
  }
  const boss = column(rim * 2.2, rim * 2.4, tone(PALETTE.bark, 0.8), 8);
  boss.rotation.x = Math.PI / 2;
  boss.position.z = -rim * 1.2;
  group.add(boss);
  return { name: 'steer', at: at.clone(), tilt: wheel.tilt, soup: soupOf(group) };
}

/** A speedometer's needle, about the dial's middle (local +Z into the dash), pointing up at rest before its turn. */
function needlePart(at: THREE.Vector3, length: number): Turning {
  const { box } = craftContext();
  const group = new THREE.Group();
  const needle = box(length * 0.12, length, PROUD * 0.4, PALETTE.red);
  group.add(needle);
  return { name: 'needle', at: at.clone(), tilt: 0, soup: soupOf(group) };
}

/**
 * The needle's sweep: at rest it points down to the left, flat out down to
 * the right, three quarters of a turn between, positive clockwise as the
 * driver sees it (`craft/motion.ts`).
 */
export const NEEDLE_REST = -2.36;
export const NEEDLE_SWEEP = 4.72;

// ---------------------------------------------------------------------------
// A road vehicle's cabin
// ---------------------------------------------------------------------------

export interface RoadCabinSpec {
  /** The seats as the craft publishes them, `seats[0]` the driver's. */
  seats: readonly Seat[];
  /** The shell and its glass together, which the floor, the dashboard and the walls are fitted inside. */
  probe: ShellProbe;
  /** The windscreen's lowest edge, on the axis: where the dashboard's top meets it. */
  screen: { y: number; z: number };
  /** Where the windscreen meets the roof, on the axis: what the mirror hangs from. */
  header: { y: number; z: number };
  /** The floor's top, under the soles. */
  floor: number;
  /** How far back the floor runs. */
  rear: number;
  /** What the driver holds, or nothing (a traffic vehicle seen from outside keeps its wheel; a parked one too). */
  wheel: WheelKind;
  /**
   * The seats' colour and the dashboard's, each a `PALETTE` colour the cabin
   * tones its pieces from, and whether the full kit (console, mirror,
   * headrests, instruments) is built.
   */
  trim: number;
  dash: number;
  full: boolean;
  /** The road wheels, whose tops the cabin covers where they come up into it. */
  wheels: readonly WheelArch[];
}

/**
 * A road wheel as the cabin keeps clear of it: which side, how far out from
 * the axis its inner face is, its axle's height and station, and its radius.
 */
export interface WheelArch {
  side: 1 | -1;
  inner: number;
  y: number;
  z: number;
  radius: number;
}

/** A box in the craft's frame. */
export interface CabinBox {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

export interface RoadCabin {
  /** Everything that does not move, as one soup in the craft's frame. */
  still: Soup;
  /** The steering wheel (`'steer'`) and, in the full kit, the speedometer's needle (`'needle'`). */
  turning: Turning[];
  /** Where the firewall stands, the front of the footwell: nothing of the lining is laid ahead of it. */
  firewall: number;
  /** The wheel arches built over the wheels inside the cabin (`CraftModel.arches`). */
  arches: CabinBox[];
}

/** The dashboard's face, ahead of the driver's hip: past the wheel, over the shins. */
const DASH_FACE = 0.4 * H;
/** Its underside over the hip: over the shins where they pass under it (`HERO.drive`). */
const DASH_UNDER = 0.03 * H;
/** How far ahead of the toes the firewall is. */
const TOE_ROOM = 0.05 * H;
/** How far inside the shell and the glass anything of the cabin keeps. */
const KEEP_IN = 0.03 * H;

/**
 * The inside of a road vehicle, fitted to its shell: the floor, every seat, a
 * dashboard from the driver's knees forward to the windscreen and on under
 * the bonnet to a firewall ahead of the toes, a steering wheel on its column,
 * and in the full kit an instrument hood with a speedometer, a centre
 * console with a gear lever, and a mirror under the header rail.
 */
export function roadCabin(spec: RoadCabinSpec): RoadCabin {
  const { box, strut, column, tone } = craftContext();
  const { probe } = spec;
  const driver = spec.seats[0]!;
  const group = new THREE.Group();
  // How far either side of the axis the shell lets the cabin go at a height
  // and a station; where a ray finds no wall (past an end of the shell) the
  // last width found stands.
  let lastHalf = 0.1 * H;
  const half = (y: number, z: number, least: number): number => {
    const w = Math.min(probe.wall(y, z, 1), probe.wall(y, z, -1)) - KEEP_IN;
    if (Number.isFinite(w)) lastHalf = w;
    return Math.max(least, lastHalf);
  };

  // --- the floor: a slab laid in stations from the rear to the firewall, each as wide as the shell there.
  const firewall = driver.z + (driver.legs === 'drive' ? HERO.drive.toe : HERO.toe) + TOE_ROOM;
  const slab = 0.025 * H;
  const floorStations: Station[] = [];
  const steps = Math.max(2, Math.ceil((firewall - spec.rear) / (0.25 * H)));
  for (let i = 0; i <= steps; i++) {
    const z = spec.rear + ((firewall - spec.rear) * i) / steps;
    floorStations.push({ z, ring: rect(half(spec.floor + slab, z, 0.05 * H), spec.floor - slab, spec.floor) });
  }
  group.add(loft(floorStations, tone(spec.trim, 0.55)));

  // --- the dashboard: from its face forward, its top under the glass and then
  // under the bonnet, as wide as the shell; and the firewall down to the floor.
  const under = driver.y + DASH_UNDER;
  const dashStations: Station[] = [];
  const face = Math.min(driver.z + DASH_FACE, firewall - 0.06 * H);
  const dashSteps = 5;
  let top = spec.screen.y - 0.01 * H;
  for (let i = 0; i <= dashSteps; i++) {
    const z = face + ((firewall - 0.02 * H - face) * i) / dashSteps;
    // Under whatever is over it — the windscreen, then the bonnet — and never over the glass's bottom edge.
    const over = probe.ceiling(0, under + 0.01 * H, z) - KEEP_IN;
    top = Math.max(under + 0.04 * H, Math.min(spec.screen.y - 0.01 * H, over));
    dashStations.push({ z, ring: rect(half(top, z, 0.1 * H), under, top) });
  }
  // The firewall: the last section dropped to the floor.
  dashStations.push({ z: firewall, ring: rect(half(top, firewall, 0.1 * H), spec.floor, top) });
  group.add(loft(dashStations, tone(spec.dash, 0.8)));

  // --- the wheel arches: the pack's wheels are each a third of the car's
  // width, and their tops come up inside the shell beside the seats and under
  // the dashboard. Each is covered, from the floor to over the tyre, between
  // its inner face and the shell's side; a rear passenger's outer hip and a
  // driver's outer foot go into one, under the window line and the
  // dashboard, where nothing of them is seen (`CraftModel.arches`).
  const arches: CabinBox[] = [];
  for (const arch of spec.wheels) {
    const from = Math.max(spec.rear, arch.z - arch.radius - 0.02 * H);
    const to = Math.min(firewall, arch.z + arch.radius + 0.02 * H);
    if (to - from < 0.05 * H) continue;
    const archStations: Station[] = [];
    const steps = 6;
    const inner = arch.inner - 0.02 * H;
    let top = -Infinity;
    let outer = inner;
    for (let i = 0; i <= steps; i++) {
      const z = from + ((to - from) * i) / steps;
      const dz = z - arch.z;
      const over = arch.y + Math.sqrt(Math.max(0, arch.radius * arch.radius - dz * dz)) + 0.03 * H;
      const y = Math.max(spec.floor + 0.02 * H, over);
      const wall = probe.wall(Math.min(y, spec.floor + 0.1 * H), z, arch.side) - KEEP_IN;
      const out = Math.max(inner + 0.03 * H, Number.isFinite(wall) ? wall : inner + 0.03 * H);
      top = Math.max(top, y);
      outer = Math.max(outer, out);
      archStations.push({
        z,
        ring: [
          [arch.side * inner, spec.floor - 0.01 * H],
          [arch.side * out, spec.floor - 0.01 * H],
          [arch.side * out, y],
          [arch.side * inner, y],
        ],
      });
    }
    group.add(loft(archStations, tone(spec.trim, 0.85)));
    // What it hides is the whole tyre's top, under the bonnet too, where the
    // cover itself stops at the firewall.
    const x0 = arch.side * inner;
    const x1 = arch.side * Math.max(outer, arch.inner + 2 * arch.radius);
    arches.push({
      min: [Math.min(x0, x1), arch.y - arch.radius, arch.z - arch.radius - 0.03 * H],
      max: [Math.max(x0, x1), Math.max(top, arch.y + arch.radius + 0.03 * H), arch.z + arch.radius + 0.03 * H],
    });
  }

  // --- the seats
  for (const [i, seat] of spec.seats.entries()) {
    group.add(seatPieces(seat, spec.floor, spec.trim, spec.full && i < 2));
  }

  // --- the wheel on its column, the driver's.
  const wheel = WHEELS[spec.wheel];
  const centre = new V(driver.x + wheel.centre[0], driver.y + wheel.centre[1], driver.z + wheel.centre[2]);
  const axle = wheelAxle(wheel);
  group.add(strut(centre.clone().addScaledVector(axle, 0.02 * H), centre.clone().addScaledVector(axle, DASH_FACE - wheel.centre[2] + 0.05 * H), 0.025 * H, PALETTE.steel));
  const turning: Turning[] = [wheelPart(wheel, centre, PALETTE.bark)];

  if (spec.full) {
    // The binnacle: a hood standing on the dashboard's top over two dials,
    // the speedometer with its needle and a second for the revs, where the
    // eye sees them through the wheel's upper half.
    // Standing proud of the dashboard's top, so the dials clear the wheel's boss.
    const dialY = top + 0.012 * H;
    const hood = box(0.2 * H, 0.06 * H, 0.06 * H, tone(spec.dash, 0.6));
    hood.position.set(driver.x, dialY - 0.035 * H, face + 0.025 * H);
    group.add(hood);
    const brow = box(0.2 * H, 0.012 * H, 0.07 * H, tone(spec.dash, 0.5));
    brow.position.set(driver.x, dialY + 0.025 * H, face + 0.02 * H);
    group.add(brow);
    // A trim strip across the dashboard's face, from door to door, under the vents.
    const strip = box(2 * half(top - 0.09 * H, face, 0.1 * H), 0.014 * H, PROUD, tone(PALETTE.tan, 1.1));
    strip.position.set(0, top - 0.095 * H, face - PROUD * 0.5);
    group.add(strip);
    const dialRadius = 0.026 * H;
    for (const [i, dx] of [0.05 * H, -0.05 * H].entries()) {
      const dial = column(dialRadius, PROUD * 2, PALETTE.cream, 12);
      // A column stands up +Y; a quarter turn about X faces its bottom cap at the driver.
      dial.rotation.x = Math.PI / 2;
      dial.position.set(driver.x + dx, dialY, face - 0.005 * H - PROUD);
      group.add(dial);
      if (i === 0) turning.push(needlePart(new V(driver.x + dx, dialY, face - 0.005 * H - PROUD * 1.6), dialRadius * 0.85));
      else {
        const needle = box(dialRadius * 0.12, dialRadius * 0.8, PROUD * 0.4, PALETTE.red);
        needle.rotation.z = 0.9;
        needle.position.set(driver.x + dx, dialY, face - 0.005 * H - PROUD * 1.6);
        group.add(needle);
      }
    }
    // Air vents on the dashboard's face — one by each door and two in the
    // middle — and the radio between the middle two.
    const ventY = top - 0.06 * H;
    for (const x of [driver.x + Math.sign(driver.x) * 0.16 * H, 0.05 * H, -0.05 * H, -driver.x - Math.sign(driver.x) * 0.16 * H]) {
      const vent = box(0.075 * H, 0.035 * H, PROUD, tone(spec.dash, 0.5));
      vent.position.set(x, ventY, face - PROUD * 0.5);
      group.add(vent);
      for (let k = 0; k < 2; k++) {
        const slat = box(0.07 * H, 0.004 * H, PROUD * 0.6, tone(spec.dash, 1.2));
        slat.position.set(x, ventY + (0.01 + k * 0.013) * H, face - PROUD * 1.1);
        group.add(slat);
      }
    }
    const radio = box(0.09 * H, 0.05 * H, PROUD, PALETTE.ink);
    radio.position.set(0, ventY - 0.075 * H, face - PROUD * 0.5);
    group.add(radio);
    const display = box(0.06 * H, 0.018 * H, PROUD * 0.6, PALETTE.skyBlue);
    display.position.set(0, ventY - 0.055 * H, face - PROUD * 1.1);
    group.add(display);
    // A centre console between the front seats, and a gear lever on it; not
    // under a driver who sits on the axis, as a tractor's does.
  }
  if (spec.full && Math.abs(driver.x) > HERO.half) {
    const consoleTop = driver.y + 0.05 * H;
    const consoleLength = face - (driver.z - 0.05 * H);
    const middle = box(0.05 * H, consoleTop - spec.floor, consoleLength, tone(spec.dash, 0.95));
    middle.position.set(0, spec.floor, driver.z - 0.05 * H + consoleLength / 2);
    group.add(middle);
    const leverFoot = new V(0, consoleTop, driver.z + 0.2 * H);
    const knob = new V(0, consoleTop + 0.08 * H, driver.z + 0.18 * H);
    group.add(strut(leverFoot, knob, 0.012 * H, PALETTE.steel));
    const ball = box(0.03 * H, 0.03 * H, 0.03 * H, PALETTE.ink);
    ball.position.copy(knob).add(new V(0, -0.005 * H, 0));
    group.add(ball);
  }
  if (spec.full) {
    // The mirror, on a short stalk from the header rail, high in the middle
    // of the windscreen: a frame and its glass, which faces the driver.
    const mirrorAt = new V(0, spec.header.y - 0.04 * H, spec.header.z - 0.03 * H);
    const roof = probe.ceiling(0, mirrorAt.y, mirrorAt.z);
    if (Number.isFinite(roof)) group.add(strut(new V(0, roof - KEEP_IN * 0.5, mirrorAt.z), mirrorAt.clone().add(new V(0, 0.02 * H, 0)), 0.01 * H, tone(spec.dash, 0.6)));
    const mirror = box(0.11 * H, 0.03 * H, 0.012 * H, tone(spec.dash, 0.6));
    mirror.position.copy(mirrorAt);
    group.add(mirror);
    const pane = box(0.095 * H, 0.02 * H, PROUD * 0.5, PALETTE.skyBlue);
    pane.position.set(mirrorAt.x, mirrorAt.y + 0.005 * H, mirrorAt.z - 0.006 * H - PROUD * 0.25);
    group.add(pane);
  }
  return { still: soupOf(group), turning, firewall, arches };
}

/** A rectangle's section, `half` either side of the axis between two heights. */
function rect(half: number, bottom: number, top: number): [number, number][] {
  return [
    [-half, bottom],
    [half, bottom],
    [half, top],
    [-half, top],
  ];
}

// ---------------------------------------------------------------------------
// Open cockpits and the rest
// ---------------------------------------------------------------------------

/**
 * An instrument panel standing across a cockpit ahead of a seat: a coaming
 * the width given, a row of round dials facing the seat, and its top `top`
 * over the hip. What the light plane, the helicopter and the submarine are
 * given; the dials are cream on the panel's colour, with a needle each drawn
 * on (they do not move).
 */
export function instrumentPanel(seat: Seat, width: number, top: number, ahead: number, colour: number, dials = 4): THREE.Group {
  const { box, column, tone } = craftContext();
  const group = new THREE.Group();
  const depth = 0.05 * H;
  const height = 0.14 * H;
  const panel = box(width, height, depth, colour);
  panel.position.set(0, top - height, ahead + depth / 2);
  group.add(panel);
  const coaming = box(width + 0.02 * H, 0.025 * H, depth * 1.6, tone(colour, 0.7));
  coaming.position.set(0, top, ahead + depth * 0.4);
  group.add(coaming);
  const radius = 0.024 * H;
  for (let i = 0; i < dials; i++) {
    const x = (i - (dials - 1) / 2) * (width / Math.max(1, dials));
    const dial = column(radius, PROUD * 2, PALETTE.cream, 10);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(x, top - height / 2, ahead - PROUD);
    group.add(dial);
    const needle = box(radius * 0.15, radius * 0.8, PROUD * 0.5, PALETTE.ink);
    needle.rotation.z = 0.6 - i * 0.45;
    needle.position.set(x, top - height / 2, ahead - PROUD * 1.4);
    group.add(needle);
  }
  group.position.set(seat.x, seat.y, seat.z);
  group.rotation.y = seat.yaw;
  return group;
}

/**
 * A control stick from the floor between a seat's knees, leaning towards the
 * seat: a light plane's or a helicopter's cyclic, a grip on top.
 */
export function stick(seat: Seat, floor: number, length: number, colour: number): THREE.Group {
  const { strut, box } = craftContext();
  const group = new THREE.Group();
  const foot = new V(0, floor - seat.y, 0.3 * H);
  const grip = new V(0, floor - seat.y + length, 0.24 * H);
  group.add(strut(foot, grip, 0.016 * H, colour));
  const knob = box(0.035 * H, 0.05 * H, 0.035 * H, PALETTE.ink);
  knob.position.copy(grip);
  group.add(knob);
  group.position.set(seat.x, seat.y, seat.z);
  group.rotation.y = seat.yaw;
  return group;
}
