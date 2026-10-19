/**
 * A harbour drawn in its own frame (`x` across, `y` up from the sea's radius,
 * `z` out along the main run), from the monument context's primitives, for
 * the streamer to merge into one mesh: wooden piers on piles with their
 * bracing and planks laid with gaps, a stone quay with a dressed face, its
 * coping, ladders, fenders and bollards, a breakwater armoured with rock and
 * lit at its head, a slipway, the sheds and the market, the clutter of a
 * working waterfront, lamps, buoys, and the boats nobody takes, tied up.
 *
 * Also what a body walks into on it (`solids`), where its lamps hang
 * (`lamps`), and, for the check, every pile and every prop's foot.
 */
import * as THREE from 'three';
import type { MonumentContext } from '../monuments/contract.ts';
import { seaDepthAt } from '../sea-floor.ts';
import { PLANET_RADIUS } from '../globe.ts';
import { PROUD } from '../scenery/contract/tones.ts';
import { rngFrom } from '../scenery/random.ts';
import type { Rng } from '../scenery/random.ts';
import { buildBoat } from './boats.ts';
import { deckHeightAt } from './plan.ts';
import type { Harbour } from './types.ts';
import { harbourStyle } from './style.ts';
import {
  LAMP_HEAD, LIGHT_LANTERN, barrel, bench, bollard, buoy, coil, crate, fender, fishBoxes, ladder, lamp, lanterns,
  lighthouse, lobsterPot, market, netRack, put, shed,
} from './props.ts';

/** A box a body cannot walk into, in the harbour's frame: its middle across and out, half sizes, and its top over the sea. */
export interface HarbourSolid {
  x: number;
  z: number;
  hx: number;
  hz: number;
  top: number;
}

export interface BuiltHarbour {
  group: THREE.Group;
  solids: HarbourSolid[];
  /** The lamps' glass, in the frame. */
  lamps: THREE.Vector3[];
  /** For the check: every pile, foot to top, and every prop's foot. */
  piles: { x: number; z: number; foot: number; top: number }[];
  props: { x: number; z: number; y: number }[];
}

/** How far under the sea floor a pile or a quay's foot goes. */
const FOOT = 1;
/** Between piles along a pier, and between bollards. */
const PILE_STEP = 4.5;
const BOLLARD_STEP = 7;
/** How thick a deck's planks are, their pitch along the run and the gap between them. */
const PLANKS = 0.3;
const PLANK_PITCH = 0.8;
const PLANK_GAP = 0.14;
/** Between lamps along a quay, and between ladders and fenders on a face. */
const LAMP_STEP = 13;
const LADDER_STEP = 17;
const FENDER_STEP = 6;
/** A dressed face's stones: their length and course. */
const STONE = 2.2;
const COURSE = 0.8;

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export function buildHarbour(ctx: MonumentContext, harbour: Harbour): BuiltHarbour {
  const { box, column, strut, tone, palette } = ctx;
  const group = new THREE.Group();
  const solids: HarbourSolid[] = [];
  const lamps: THREE.Vector3[] = [];
  const piles: BuiltHarbour['piles'] = [];
  const props: BuiltHarbour['props'] = [];
  const bollards: THREE.Vector3[] = [];
  const taken: Rect[] = [];
  const scratch = new THREE.Vector3();
  const rng = rngFrom('harbour-build', harbour.place);
  const style = harbourStyle(harbour.region);
  const { deck, width, length, size } = harbour;
  const half = width / 2;

  const floorAt = (x: number, z: number): number => {
    scratch.copy(harbour.root).addScaledVector(harbour.across, x / PLANET_RADIUS).addScaledVector(harbour.out, z / PLANET_RADIUS).normalize();
    return -seaDepthAt(scratch);
  };
  const overlaps = (r: Rect): boolean => taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.z0 < t.z1 && r.z1 > t.z0);
  /** A prop stood on the deck under it, all four corners on one level; false where there is none or it would overlap another. */
  const stand = (object: THREE.Object3D, x: number, z: number, hx: number, hz: number, solid = 0): boolean => {
    const rect = { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz };
    const y = deckHeightAt(harbour, x, z);
    if (y === null || overlaps(rect)) return false;
    for (const [cx, cz] of [[rect.x0, rect.z0], [rect.x1, rect.z0], [rect.x0, rect.z1], [rect.x1, rect.z1]] as const) {
      if (deckHeightAt(harbour, cx, cz) !== y) return false;
    }
    group.add(put(object, x, y, z));
    taken.push(rect);
    props.push({ x, z, y });
    if (solid > 0) solids.push({ x, z, hx, hz, top: y + solid });
    return true;
  };
  const addBollard = (x: number, z: number): void => {
    group.add(put(bollard(ctx), x, deck, z));
    bollards.push(new THREE.Vector3(x, deck + 0.6, z));
    props.push({ x, z, y: deck });
  };
  const addLamp = (x: number, z: number, yaw: number): void => {
    const post = lamp(ctx, style);
    post.rotation.y = yaw;
    group.add(put(post, x, deck, z));
    taken.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 });
    props.push({ x, z, y: deck });
    lamps.push(new THREE.Vector3(x + Math.sin(yaw) * 0.7, deck + LAMP_HEAD - 0.2, z + Math.cos(yaw) * 0.7));
  };

  /** A wooden deck on piles: planks across with gaps, stringers, headstocks, cross-bracing. */
  function woodDeck(x: number, z0: number, z1: number, w: number, timber: number): void {
    const run = z1 - z0;
    let k = 0;
    for (let z = z0; z < z1 - 0.05; z += PLANK_PITCH, k++) {
      const plank = Math.min(PLANK_PITCH - PLANK_GAP, z1 - z);
      group.add(put(box(w, PLANKS, plank, tone(timber, k % 3 === 0 ? 0.9 : k % 3 === 1 ? 1.04 : 0.97)), x, deck - PLANKS, z + plank / 2));
    }
    const beam = deck - PLANKS - 0.4;
    const rows = w > 3.2 ? [-w / 2 + 0.3, 0, w / 2 - 0.3] : [-w / 2 + 0.3, w / 2 - 0.3];
    for (const dx of rows) group.add(put(box(0.28, 0.4, run, tone(style.piles, 1.1)), x + dx, beam, z0 + run / 2));
    let bay = 0;
    for (let z = z0 + 1.5; z <= z1 - 0.3; z += PILE_STEP, bay++) {
      const head = beam - 0.3;
      group.add(put(box(w + 0.2, 0.3, 0.32, style.piles), x, head, z));
      for (const dx of [-w / 2 + 0.3, w / 2 - 0.3]) {
        const foot = Math.min(floorAt(x + dx, z), -0.5) - FOOT;
        group.add(put(column(0.2, head - foot, style.piles, 6), x + dx, foot, z));
        piles.push({ x: x + dx, z, foot, top: head });
      }
      // An X between the pair every other bay, clear of the water.
      if (bay % 2 === 0 && head > 1.4) {
        const l = x - w / 2 + 0.3;
        const r = x + w / 2 - 0.3;
        group.add(strut(new THREE.Vector3(l, 0.3, z), new THREE.Vector3(r, head - 0.1, z), 0.12, tone(style.piles, 0.9)));
        group.add(strut(new THREE.Vector3(r, 0.3, z), new THREE.Vector3(l, head - 0.1, z), 0.12, tone(style.piles, 0.9)));
      }
    }
  }

  /**
   * A dressed stone face along one axis: every other stone of each course
   * stepped `PROUD` out of the block's darker face, in a running bond.
   * `along` is 'x' (a face at `z = at`) or 'z' (a face at `x = at`).
   */
  function dress(along: 'x' | 'z', a0: number, a1: number, at: number, foot: number): void {
    let course = 0;
    for (let y = Math.max(foot, -0.6); y < deck - 0.5; y += COURSE, course++) {
      const height = Math.min(COURSE - 0.1, deck - 0.4 - y);
      if (height < 0.2) break;
      const shift = course % 2 === 0 ? 0 : STONE / 2;
      let n = 0;
      for (let a = a0 + shift; a < a1 - 0.3; a += STONE, n++) {
        if (n % 2 === 1) continue;
        const l = Math.min(STONE - 0.12, a1 - a);
        const c = a + l / 2;
        const colour = tone(style.stone, 1.06);
        group.add(along === 'x' ? put(box(l, height, PROUD * 2, colour), c, y, at) : put(box(PROUD * 2, height, l, colour), at, y, c));
      }
    }
  }

  /** A stone block from under the sea floor to the deck, with a lighter coping proud along the faces in `edges`. */
  function stoneBlock(r: Rect, edges: readonly ('x0' | 'x1' | 'z1')[]): void {
    let deepest = -0.5;
    for (let z = r.z0; z <= r.z1; z += 3) for (const x of [r.x0, (r.x0 + r.x1) / 2, r.x1]) deepest = Math.min(deepest, floorAt(x, z));
    const foot = deepest - FOOT;
    group.add(put(box(r.x1 - r.x0, deck - foot, r.z1 - r.z0, tone(style.stone, 0.86)), (r.x0 + r.x1) / 2, foot, (r.z0 + r.z1) / 2));
    for (const edge of edges) {
      if (edge === 'z1') {
        group.add(put(box(r.x1 - r.x0, 0.38, 1.1, style.coping), (r.x0 + r.x1) / 2, deck - 0.3, r.z1 - 0.4));
        dress('x', r.x0, r.x1, r.z1, foot);
      } else {
        const x = edge === 'x0' ? r.x0 + 0.4 : r.x1 - 0.4;
        group.add(put(box(1.1, 0.38, r.z1 - r.z0, style.coping), x, deck - 0.3, (r.z0 + r.z1) / 2));
        dress('z', r.z0, r.z1, edge === 'x0' ? r.x0 : r.x1, foot);
      }
    }
  }

  /** Fenders, ladders and bollards along a face: along `x` at `z = at` (facing +z), or along `z` at `x = at` facing `sign` x. */
  function faceFurniture(along: 'x' | 'z', a0: number, a1: number, at: number, sign: number, keep: (a: number) => boolean): void {
    for (let a = a0 + FENDER_STEP / 2; a < a1; a += FENDER_STEP) {
      if (!keep(a)) continue;
      const pad = fender(ctx, deck - 0.6);
      if (along === 'z') pad.rotation.y = (sign * Math.PI) / 2;
      group.add(along === 'x' ? put(pad, a, -0.3, at) : put(pad, at, -0.3, a));
    }
    for (let a = a0 + LADDER_STEP / 2 + 1.2; a < a1 - 1; a += LADDER_STEP) {
      if (!keep(a)) continue;
      const rungs = ladder(ctx, deck, -1.2);
      if (along === 'z') rungs.rotation.y = (sign * Math.PI) / 2;
      group.add(along === 'x' ? put(rungs, a, 0, at) : put(rungs, at, 0, a));
    }
    for (let a = a0 + 2; a < a1 - 1; a += BOLLARD_STEP) {
      if (!keep(a)) continue;
      if (along === 'x') addBollard(a, at - 0.5);
      else addBollard(at - sign * 0.5, a);
    }
  }

  // Where piers meet the waterfront, nothing is put on its edge.
  const junctions: [number, number][] = [[-half - 1.5, half + 1.5]];
  for (const pier of harbour.piers) junctions.push([pier.x - pier.width / 2 - 1.5, pier.x + pier.width / 2 + 1.5]);
  if (harbour.breakwater !== null) junctions.push([harbour.breakwater.x - harbour.breakwater.width / 2 - 1.5, harbour.breakwater.x + harbour.breakwater.width / 2 + 1.5]);
  if (harbour.slip !== null) junctions.push([harbour.slip.x - harbour.slip.width / 2 - 1, harbour.slip.x + harbour.slip.width / 2 + 1]);
  const open = (x: number): boolean => !junctions.some(([a, b]) => x > a && x < b);

  // The main run.
  if (harbour.kind === 'pier') {
    woodDeck(0, harbour.runFrom, length, width, style.timber);
    for (let z = Math.max(harbour.runFrom, 0) + 4; z <= length - 1; z += BOLLARD_STEP) for (const side of [-1, 1]) addBollard(side * (half - 0.35), z);
    group.add(put(ladder(ctx, deck, -1.2), 0, 0, length));
  } else {
    stoneBlock({ x0: -half, x1: half, z0: harbour.runFrom, z1: length }, ['x0', 'x1', 'z1']);
    faceFurniture('z', Math.max(0, harbour.runFrom), length, half, 1, () => true);
    faceFurniture('z', Math.max(0, harbour.runFrom), length, -half, -1, () => true);
  }

  // The waterfront, one block a run of strips with the same back.
  const front = harbour.waterfront;
  if (front !== null) {
    const first = front.strips[0]!;
    const last = front.strips[front.strips.length - 1]!;
    let i = 0;
    while (i < front.strips.length) {
      let j = i;
      while (j + 1 < front.strips.length && front.strips[j + 1]!.back === front.strips[i]!.back) j++;
      const edges: ('x0' | 'x1' | 'z1')[] = ['z1'];
      if (i === 0) edges.push('x0');
      if (j === front.strips.length - 1) edges.push('x1');
      stoneBlock({ x0: front.strips[i]!.x0, x1: front.strips[j]!.x1, z0: front.strips[i]!.back, z1: front.face }, edges);
      i = j + 1;
    }
    faceFurniture('x', first.x0, last.x1, front.face, 1, open);
    for (let x = first.x0 + LAMP_STEP / 2; x < last.x1 - 1; x += LAMP_STEP) {
      if (open(x)) addLamp(x, front.face - 1.1, Math.PI);
    }
  }

  // The other piers, a lamp at each one's end.
  for (const pier of harbour.piers) {
    woodDeck(pier.x, pier.z0, pier.z1, pier.width, style.timber);
    for (let z = pier.z0 + 4; z <= pier.z1 - 1; z += BOLLARD_STEP) for (const side of [-1, 1]) addBollard(pier.x + side * (pier.width / 2 - 0.3), z);
    group.add(put(ladder(ctx, deck, -1.2), pier.x, 0, pier.z1));
    addLamp(pier.x - pier.width / 2 + 0.3, pier.z1 - 1, Math.PI / 2);
  }
  // The main run's lamps, along one edge leaning in.
  const runLamps = size === 'village' ? [length - 1.5] : [];
  if (size !== 'village') for (let z = Math.max(harbour.runFrom, 0) + 8; z <= length - 1; z += LAMP_STEP) runLamps.push(z);
  for (const z of runLamps) addLamp(-half + 0.35, z, Math.PI / 2);

  /** Rocks piled against a wall's sea side, along `z`, in three falling rows. */
  function armour(x: number, side: number, z0: number, z1: number, r: Rng): void {
    for (let z = z0; z < z1; z += 1.7) {
      for (let k = 0; k < 3; k++) {
        const size = r.range(1.0, 1.8);
        const rock = ctx.taper(size, size * 0.55, size * r.range(0.9, 1.4), tone(style.rock, r.range(0.85, 1.1)), 5);
        rock.rotation.set(r.range(-0.25, 0.25), r.range(0, Math.PI), r.range(-0.25, 0.25));
        group.add(put(rock, x + side * (0.6 + k * 1.6 + r.range(0, 0.6)), deck - 2.4 - k * 1.4 - size * 0.4, z + r.range(-0.4, 0.4)));
      }
    }
  }
  function armourAcross(x0: number, x1: number, z: number, r: Rng): void {
    for (let x = x0; x < x1; x += 1.7) {
      for (let k = 0; k < 2; k++) {
        const size = r.range(1.0, 1.8);
        const rock = ctx.taper(size, size * 0.55, size * r.range(0.9, 1.4), tone(style.rock, r.range(0.85, 1.1)), 5);
        rock.rotation.set(r.range(-0.25, 0.25), r.range(0, Math.PI), r.range(-0.25, 0.25));
        group.add(put(rock, x, deck - 2.6 - k * 1.4 - size * 0.4, z + 0.6 + k * 1.5 + r.range(0, 0.5)));
      }
    }
  }

  // The breakwater: a core of blocks, paved, a parapet to seaward, rock piled against it, a light on its head.
  const mole = harbour.breakwater;
  if (mole !== null) {
    const side = Math.sign(mole.x);
    const outer = mole.x + side * (mole.width / 2);
    const inner = mole.x - side * (mole.width / 2);
    stoneBlock({ x0: mole.x - mole.width / 2, x1: mole.x + mole.width / 2, z0: mole.z0, z1: mole.z1 }, [side > 0 ? 'x0' : 'x1']);
    faceFurniture('z', Math.max(0, mole.z0) + 2, mole.z1 - mole.width - 2, inner, -side, () => true);
    // The parapet along the sea side, a wall to lean on and not to walk through.
    const wallZ0 = Math.max(mole.z0, 0) + 1;
    group.add(put(box(0.7, 1.1, mole.z1 - wallZ0, style.coping), outer - side * 0.35, deck, (wallZ0 + mole.z1) / 2));
    solids.push({ x: outer - side * 0.35, z: (wallZ0 + mole.z1) / 2, hx: 0.35, hz: (mole.z1 - wallZ0) / 2, top: deck + 1.1 });
    taken.push(side > 0 ? { x0: outer - 0.7, x1: outer, z0: wallZ0, z1: mole.z1 } : { x0: outer, x1: outer + 0.7, z0: wallZ0, z1: mole.z1 });
    armour(outer, side, Math.max(mole.z0, 0) + 1, mole.z1 + 1.5, rng);
    let tipX = mole.x;
    if (mole.head > 0) {
      const a = inner;
      const b = inner - side * mole.head;
      stoneBlock({ x0: Math.min(a, b), x1: Math.max(a, b), z0: mole.z1 - mole.width, z1: mole.z1 }, ['z1']);
      tipX = b + side * (mole.width / 2);
      armourAcross(Math.min(a, b) - 1, Math.max(a, b) + 1, mole.z1, rng);
    }
    if (stand(lighthouse(ctx, rng.pick([palette.red, palette.green])), tipX, mole.z1 - mole.width / 2, 1.4, 1.4, LIGHT_LANTERN)) {
      lamps.push(new THREE.Vector3(tipX, deck + LIGHT_LANTERN - 0.6, mole.z1 - mole.width / 2));
    }
    for (let z = Math.max(mole.z0, 0) + 10; z < mole.z1 - mole.width - 4; z += LAMP_STEP * 1.4) addLamp(inner + side * 0.4, z, (side * Math.PI) / 2);
  }

  // The slipway: a slab laid at its grade with runners for a keel, and stepped masonry under its high end.
  const slip = harbour.slip;
  if (slip !== null) {
    const run = slip.z1 - slip.z0;
    const fall = slip.top - slip.foot;
    const along = Math.hypot(run, fall);
    const tilt = new THREE.Group();
    tilt.position.set(slip.x, slip.top, slip.z0);
    tilt.rotation.x = Math.atan2(fall, run);
    tilt.add(put(box(slip.width, 0.6, along, tone(style.stone, 0.95)), 0, -0.6, along / 2));
    for (const dx of [-0.6, 0.6]) tilt.add(put(box(0.22, PROUD, along - 0.6, tone(style.timber, 0.8)), dx, 0, along / 2));
    group.add(tilt);
    for (let k = 0; k < 3; k++) {
      const za = slip.z0 + (k * run) / 4;
      const top = slip.top - (fall * (k + 1)) / 4 - 0.75;
      const under = Math.min(floorAt(slip.x, za + run / 8), -0.5) - FOOT;
      if (top > under + 0.3) group.add(put(box(slip.width - 0.1, top - under, run / 4, tone(style.stone, 0.8)), slip.x, under, za + run / 8));
    }
  }

  // The tropics' stilt hut beside the main run, its door to the sea.
  const stilt = harbour.stilt;
  if (stilt !== null) {
    const w = stilt.x1 - stilt.x0;
    const d = stilt.z1 - stilt.z0;
    woodDeck((stilt.x0 + stilt.x1) / 2, stilt.z0, stilt.z1, w, style.timber);
    const hut = shed(ctx, style, d - 2.4, w - 2.2, rng);
    const outward = stilt.x0 > 0 ? 1 : -1;
    hut.rotation.y = (outward * Math.PI) / 2;
    stand(hut, (stilt.x0 + stilt.x1) / 2 + outward * 0.4, (stilt.z0 + stilt.z1) / 2, (w - 2.2) / 2, (d - 2.4) / 2, 3.6);
  }

  /** One of the waterfront's things, or a little group of them. */
  function placeClutter(x: number, z: number, r: Rng): boolean {
    switch (r.int(7)) {
      case 0: {
        const placed = stand(barrel(ctx, r), x, z, 0.45, 0.45, 1.15);
        if (placed) stand(barrel(ctx, r), x + 0.95, z + r.range(-0.2, 0.2), 0.45, 0.45, 1.15);
        return placed;
      }
      case 1: {
        const colour = r.pick([palette.clay, palette.skyBlue, palette.olive, palette.tan, palette.red]);
        const stack = new THREE.Group();
        const levels = r.between(1, 3);
        for (let l = 0; l < levels; l++) stack.add(put(crate(ctx, 1.3, tone(colour, l % 2 === 0 ? 1 : 0.9)), r.range(-0.08, 0.08), l * 1.04, 0));
        return stand(stack, x, z, 0.7, 0.7, levels * 1.04);
      }
      case 3: {
        const pots = new THREE.Group();
        const count = r.between(2, 5);
        for (let k = 0; k < count; k++) pots.add(put(lobsterPot(ctx), (k % 2) * 1.05 - 0.5, Math.floor(k / 2) * 0.42, 0));
        return stand(pots, x, z, 1.05, 0.35);
      }
      case 4:
        return stand(coil(ctx), x, z, 0.5, 0.5);
      case 5:
        return stand(netRack(ctx, r), x, z, 1.75, 0.3);
      default:
        return stand(fishBoxes(ctx, r), x, z, 0.55, 0.4);
    }
  }

  // The waterfront's buildings and its clutter, in the band behind the bollards.
  if (front !== null) {
    const first = front.strips[0]!.x0;
    const last = front.strips[front.strips.length - 1]!.x1;
    const backAt = (x: number): number => front.strips.find((s) => x >= s.x0 && x <= s.x1)?.back ?? front.face;
    const fits = (x0: number, x1: number, depth: number): boolean => {
      if (x0 < first || x1 > last) return false;
      for (let x = x0; x <= x1; x += 1) if (!open(x) || front.face - 1.8 - backAt(x) < depth + 0.3) return false;
      return true;
    };
    const buildings = size === 'port' ? [{ w: 10, d: 5, market: true }, { w: 4.5, d: 4, market: false }] : [{ w: 4.5, d: 4, market: false }];
    for (const b of buildings) {
      for (let tries = 0; tries < 12; tries++) {
        const x = rng.range(first + b.w / 2, last - b.w / 2);
        if (!fits(x - b.w / 2, x + b.w / 2, b.d)) continue;
        const z = Math.max(backAt(x - b.w / 2), backAt(x + b.w / 2), backAt(x)) + 0.3 + b.d / 2;
        const model = b.market ? market(ctx, style, b.w, b.d) : shed(ctx, style, b.w, b.d, rng);
        if (stand(model, x, z, b.w / 2, b.d / 2, b.market ? 1.0 : 3.6)) {
          // A market is walked through between its posts; only the counter stops a body.
          if (b.market) solids[solids.length - 1] = { x, z, hx: (b.w - 1.2) / 2, hz: 0.55, top: deck + 1.0 };
          break;
        }
      }
    }
    const clutter = size === 'port' ? 16 : 9;
    for (let n = 0, tries = 0; n < clutter && tries < clutter * 4; tries++) {
      const x = rng.range(first + 1, last - 1);
      const z = rng.range(backAt(x) + 0.8, front.face - 2.2);
      if (open(x) && placeClutter(x, z, rng)) n++;
    }
    for (let k = 0; k < (size === 'port' ? 3 : 2); k++) {
      const x = rng.range(first + 2, last - 2);
      if (open(x)) stand(bench(ctx), x, front.face - 2.6, 1.05, 0.35);
    }
    if (style.lanterns) {
      for (let k = 0; k < 2; k++) {
        const x = rng.range(first + 4, last - 4);
        if (open(x - 3) && open(x + 3)) stand(lanterns(ctx, 6), x, front.face - 1.9, 3.05, 0.15);
      }
    }
  }

  // A little on the main run near its root: pots, a coil, a barrel, on its edges.
  if (harbour.kind === 'pier') {
    const z0 = Math.max(harbour.runFrom, 0) + 2;
    for (let k = 0; k < 3; k++) {
      const z = z0 + k * 2.4;
      if (z > length - 6) break;
      const which = rng.int(3);
      const thing = which === 0 ? lobsterPot(ctx) : which === 1 ? coil(ctx) : barrel(ctx, rng);
      if (which === 0) thing.rotation.y = Math.PI / 2;
      stand(thing, (k % 2 === 0 ? -1 : 1) * (half - 0.55), z, 0.42, 0.52, which === 2 ? 1.15 : 0);
    }
  }

  /** A port's crane on its mole, its jib out over the water, and the crates it has landed. */
  function crane(z: number): void {
    const steel = palette.orange;
    const tower = 7.5;
    group.add(put(box(2.4, 0.6, 2.4, palette.steel), 0, deck, z));
    group.add(put(box(1.1, tower, 1.1, steel), 0, deck + 0.6, z));
    group.add(put(box(2, 1.6, 2, steel), 0, deck + 0.6 + tower, z));
    const top = deck + 0.6 + tower + 1.6;
    const tip = new THREE.Vector3(half + 6, top + 1.5, z);
    group.add(strut(new THREE.Vector3(0, top, z), tip, 0.4, steel));
    group.add(strut(new THREE.Vector3(0, top, z), new THREE.Vector3(-3.5, top + 0.5, z), 0.4, steel));
    group.add(put(box(1.2, 1, 1.2, palette.steel), -3.5, top - 0.6, z));
    group.add(strut(tip, new THREE.Vector3(half + 6, deck + 2.5, z), 0.06, palette.ink));
    group.add(put(box(0.5, 0.4, 0.5, palette.steel), half + 6, deck + 2.1, z));
    solids.push({ x: 0, z, hx: 1.2, hz: 1.2, top });
    taken.push({ x0: -1.3, x1: 1.3, z0: z - 1.3, z1: z + 1.3 });
    props.push({ x: 0, z, y: deck });
    const colours = [palette.clay, palette.skyBlue, palette.olive, palette.red, palette.tan];
    for (let k = 0; k < 6; k++) {
      const stack = new THREE.Group();
      const levels = 1 + rng.int(2);
      for (let l = 0; l < levels; l++) stack.add(put(crate(ctx, 1.4, rng.pick(colours)), 0, l * 1.12, 0));
      stand(stack, -half + 1.6 + (k % 2) * 1.5, Math.max(harbour.runFrom, 0) + 6 + Math.floor(k / 2) * 1.6, 0.7, 0.7, levels * 1.12);
    }
  }
  if (harbour.kind === 'quay') crane(length - 12);

  // The boats nobody takes, and their lines.
  for (const m of harbour.moorings) {
    const model = buildBoat(ctx, m.kind, m.length, m.beam, style, rng);
    const holder = new THREE.Group();
    holder.position.set(m.x, m.hauled ?? 0, m.z);
    holder.rotation.y = m.yaw;
    if (m.hauled !== undefined && slip !== null) {
      // Drawn up the slipway bow first, along its grade.
      model.group.rotation.x = -Math.atan2(slip.top - slip.foot, slip.z1 - slip.z0);
      model.group.position.y = 0.25;
    }
    holder.add(model.group);
    group.add(holder);
    if (m.hauled !== undefined) continue;
    const amplitude = rng.range(0.07, 0.13) * (m.kind === 'yacht' ? 0.6 : 1);
    const bob = [amplitude, rng.range(0, Math.PI * 2), m.x, m.z];
    holder.traverse((child) => {
      child.userData.harbourBob = bob;
    });
    holder.updateMatrix();
    const [bow, stern] = model.cleats.map((cleat) => cleat.clone().applyMatrix4(holder.matrix)) as [THREE.Vector3, THREE.Vector3];
    if (m.buoy) {
      const ahead = new THREE.Vector3(0, 0, m.length / 2 + 1.0).applyMatrix4(holder.matrix);
      const float = buoy(ctx, palette.white);
      float.scale.setScalar(0.7);
      float.traverse((child) => {
        child.userData.harbourBob = [amplitude * 0.8, bob[1]! + 0.6, ahead.x, ahead.z];
      });
      group.add(put(float, ahead.x, 0, ahead.z));
      group.add(strut(bow, new THREE.Vector3(ahead.x, 0.3, ahead.z), 0.05, palette.tan));
      continue;
    }
    for (const cleat of [bow, stern]) {
      let best: THREE.Vector3 | null = null;
      for (const post of bollards) if (post.distanceTo(cleat) < 9 && (best === null || post.distanceTo(cleat) < best.distanceTo(cleat))) best = post;
      if (best !== null) group.add(strut(best, cleat, 0.05, palette.tan));
    }
  }

  // The channel's buoys.
  for (const mark of harbour.marks) {
    const float = buoy(ctx, mark.port ? palette.red : palette.green);
    const bob = [0.12, rng.range(0, Math.PI * 2), mark.x, mark.z];
    float.traverse((child) => {
      child.userData.harbourBob = bob;
    });
    group.add(put(float, mark.x, 0, mark.z));
  }

  return { group, solids, lamps, piles, props };
}
