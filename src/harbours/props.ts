/**
 * A harbour's furniture, each standing on y = 0 in its own frame: bollards,
 * lamps, barrels, crates, fish boxes, lobster pots, nets on a rack, coils of
 * rope, benches, buoys, a ladder and a fender, the sheds, the fish market and
 * the lighthouse. A mesh marked `glow` lights up at night (`material.ts`).
 */
import * as THREE from 'three';
import type { MonumentContext } from '../monuments/contract.ts';
import { PROUD } from '../scenery/contract/tones.ts';
import type { Rng } from '../scenery/random.ts';
import { SCENERY_SCALE } from '../stature.ts';
import type { HarbourStyle } from './style.ts';

const METRE = SCENERY_SCALE;

export const put = <T extends THREE.Object3D>(object: T, x: number, y: number, z: number): T => {
  object.position.set(x, y, z);
  return object;
};

/** Marks every mesh under `object` to glow after dark. */
export function glowing<T extends THREE.Object3D>(object: T): T {
  object.traverse((child) => {
    child.userData.harbourGlow = 1;
  });
  return object;
}

export function bollard(ctx: MonumentContext): THREE.Group {
  const group = new THREE.Group();
  const iron = ctx.tone(ctx.palette.bark, 0.8);
  group.add(ctx.column(0.2, 0.55, iron, 6));
  group.add(put(ctx.column(0.27, 0.12, iron, 6), 0, 0.55, 0));
  return group;
}

/** The lamp's head height, for the near-light pools. */
export const LAMP_HEAD = 4.4 * METRE;

/** A lamp standard: a post, an arm out over `+z` and its lantern. */
export function lamp(ctx: MonumentContext, style: HarbourStyle): THREE.Group {
  const { column, box, strut, palette } = ctx;
  const group = new THREE.Group();
  const iron = style.lanterns ? palette.crimson : ctx.tone(palette.steel, 0.9);
  group.add(column(0.22, 0.5, iron, 6));
  group.add(column(0.1, LAMP_HEAD + 0.3, iron, 6));
  group.add(strut(new THREE.Vector3(0, LAMP_HEAD + 0.1, 0), new THREE.Vector3(0, LAMP_HEAD + 0.1, 0.7), 0.08, iron));
  group.add(put(box(0.36, 0.1, 0.36, iron), 0, LAMP_HEAD + 0.05, 0.7));
  group.add(put(glowing(box(0.28, 0.42, 0.28, palette.cream)), 0, LAMP_HEAD - 0.4, 0.7));
  return group;
}

export function barrel(ctx: MonumentContext, rng: Rng): THREE.Group {
  const group = new THREE.Group();
  const colour = rng.pick([ctx.palette.brown, ctx.palette.clay, ctx.palette.skyBlue, ctx.palette.olive]);
  group.add(ctx.column(0.42, 1.15, colour, 8));
  group.add(put(ctx.column(0.42 + PROUD, 0.1, ctx.tone(ctx.palette.bark, 0.9), 8), 0, 0.2, 0));
  group.add(put(ctx.column(0.42 + PROUD, 0.1, ctx.tone(ctx.palette.bark, 0.9), 8), 0, 0.85, 0));
  return group;
}

export function crate(ctx: MonumentContext, size: number, colour: number): THREE.Mesh {
  return ctx.box(size, size * 0.8, size, colour);
}

/** A stack of shallow fish boxes, the top one full of ice. */
export function fishBoxes(ctx: MonumentContext, rng: Rng): THREE.Group {
  const group = new THREE.Group();
  const colour = rng.pick([ctx.palette.skyBlue, ctx.palette.red, ctx.palette.white, ctx.palette.apricot]);
  const count = rng.between(1, 4);
  for (let k = 0; k < count; k++) group.add(put(ctx.box(1.0, 0.32, 0.7, ctx.tone(colour, k % 2 === 0 ? 1 : 0.88)), rng.range(-0.05, 0.05), k * 0.32, 0));
  group.add(put(ctx.box(0.84, 0.06, 0.56, ctx.palette.white), 0, count * 0.32 - 0.02, 0));
  return group;
}

/** A lobster pot: a slatted half-drum on a base, its mesh a darker band. */
export function lobsterPot(ctx: MonumentContext): THREE.Group {
  const group = new THREE.Group();
  group.add(ctx.box(1.0, 0.1, 0.62, ctx.palette.brown));
  const drum = ctx.column(0.3, 0.98, ctx.tone(ctx.palette.olive, 0.7), 6);
  drum.rotation.z = Math.PI / 2;
  group.add(put(drum, -0.49, 0.1, 0));
  return group;
}

/** A coil of rope on the stones. */
export function coil(ctx: MonumentContext): THREE.Mesh {
  return ctx.ringWall(0.18, 0.5, 0.2, ctx.palette.tan, 10);
}

/** Two posts, a bar and a net hung over it to dry. */
export function netRack(ctx: MonumentContext, rng: Rng): THREE.Group {
  const { column, box, palette } = ctx;
  const group = new THREE.Group();
  const span = 3.2;
  for (const x of [-span / 2, span / 2]) group.add(put(column(0.08, 2.1, palette.bark, 6), x, 0, 0));
  group.add(put(box(span + 0.3, 0.12, 0.12, palette.bark), 0, 2.0, 0));
  const net = rng.pick([palette.olive, palette.green, palette.skyBlue, palette.salmon]);
  group.add(put(box(span - 0.3, 1.5, 0.08, net), 0, 0.5, 0.11));
  group.add(put(box(span - 0.5, 1.2, 0.08, ctx.tone(net, 0.85)), 0, 0.75, -0.11));
  return group;
}

/** A bench along `x`, its back on the `-z` side. */
export function bench(ctx: MonumentContext): THREE.Group {
  const { box, palette } = ctx;
  const group = new THREE.Group();
  const iron = ctx.tone(palette.steel, 0.9);
  for (const x of [-0.8, 0.8]) group.add(put(box(0.1, 0.55, 0.55, iron), x, 0, 0));
  group.add(put(box(2, 0.08, 0.55, palette.brown), 0, 0.55, 0));
  group.add(put(box(2, 0.4, 0.06, palette.brown), 0, 0.75, -0.28));
  return group;
}

/** A buoy, half under the water: a float and a little cage or a cone on it. */
export function buoy(ctx: MonumentContext, colour: number): THREE.Group {
  const group = new THREE.Group();
  group.add(put(ctx.column(0.42, 0.75, colour, 8), 0, -0.4, 0));
  group.add(put(ctx.taper(0.3, 0.08, 0.7, colour, 6), 0, 0.35, 0));
  group.add(put(ctx.box(0.6, 0.12, 0.6, ctx.palette.white), 0, 0.2, 0));
  return group;
}

/** An iron ladder down a face at `z = 0` into the water, from `top` to `bottom`. */
export function ladder(ctx: MonumentContext, top: number, bottom: number): THREE.Group {
  const { column, box, palette } = ctx;
  const group = new THREE.Group();
  const iron = ctx.tone(palette.steel, 1.1);
  for (const x of [-0.32, 0.32]) group.add(put(column(0.045, top - bottom + 0.6, iron, 4), x, bottom, 0.12));
  for (let y = bottom + 0.3; y < top; y += 0.42) group.add(put(box(0.64, 0.06, 0.06, iron), 0, y, 0.12));
  return group;
}

/** A rubber fender hung on a face at `z = 0`. */
export function fender(ctx: MonumentContext, height: number): THREE.Mesh {
  return put(ctx.box(0.6, height, 0.35, ctx.tone(ctx.palette.bark, 0.7)), 0, 0, 0.18);
}

/**
 * A shed: walls, a door and a window on its `+z` front, and a roof by the
 * region's form. Its footprint is `width` by `depth`.
 */
export function shed(ctx: MonumentContext, style: HarbourStyle, width: number, depth: number, rng: Rng): THREE.Group {
  const { box, palette } = ctx;
  const group = new THREE.Group();
  const walls = rng.pick(style.walls);
  const height = 2.8 * METRE;
  group.add(box(width, height, depth, walls));
  // A base course, the door and a window, each stepped proud of the wall.
  group.add(box(width + PROUD * 2, 0.45, depth + PROUD * 2, ctx.tone(walls, 0.8)));
  group.add(put(box(1.3, 2.4, PROUD * 2, style.trim), -width * 0.18, 0, depth / 2));
  group.add(put(box(1.1, 0.9, PROUD * 2, ctx.tone(palette.slate, 1.1)), width * 0.24, 1.4, depth / 2));
  group.add(put(box(1.3, 0.12, PROUD * 3, style.trim), width * 0.24, 1.3, depth / 2));
  roof(ctx, group, style, width, depth, height, walls);
  return group;
}

function roof(ctx: MonumentContext, group: THREE.Group, style: HarbourStyle, width: number, depth: number, height: number, walls: number): void {
  const { box, taper } = ctx;
  if (style.roofForm === 'flat') {
    group.add(put(box(width + 0.3, 0.3, depth + 0.3, ctx.tone(style.roof, 0.95)), 0, height, 0));
    group.add(put(box(width + 0.3, 0.4, 0.2, style.roof), 0, height + 0.3, (depth + 0.1) / 2));
    return;
  }
  if (style.roofForm === 'thatch') {
    const hat = taper(Math.max(width, depth) * 0.72, 0.15, 2.2, style.roof, 4);
    hat.rotation.y = Math.PI / 4;
    group.add(put(hat, 0, height, 0));
    return;
  }
  // A pitched roof: two slabs on a ridge along `x`, and on the curved form, the eaves turned up.
  const pitch = style.roofForm === 'curved' ? 0.5 : 0.62;
  const run = (depth / 2 + 0.4) / Math.cos(pitch);
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, height + Math.tan(pitch) * (depth / 2 + 0.4) - 0.1, 0);
    pivot.rotation.x = side * pitch;
    const slab = box(width + 0.5, 0.22, run, style.roof);
    slab.position.set(0, -0.11, side * run / 2);
    pivot.add(slab);
    group.add(pivot);
    if (style.roofForm === 'curved') {
      const lip = box(width + 0.7, 0.18, 0.5, ctx.tone(style.roof, 0.85));
      lip.position.set(0, height - 0.05, side * (depth / 2 + 0.45));
      lip.rotation.x = -side * 0.3;
      group.add(lip);
    }
  }
  // The gables filled under the slabs: a square turned on its corner, squashed to the pitch by a parent.
  const squash = new THREE.Group();
  squash.position.set(0, height, 0);
  squash.scale.set(1, Math.tan(pitch), 1);
  const gable = box(width, depth / Math.SQRT2, depth / Math.SQRT2, walls);
  gable.rotation.x = Math.PI / 4;
  // A box stands on its base, so its middle is moved onto the pivot after the turn.
  gable.position.set(0, -depth / 4, -depth / 4);
  squash.add(gable);
  group.add(squash);
}

/** An open fish market: posts round a counter under a broad roof, `width` along `x`. */
export function market(ctx: MonumentContext, style: HarbourStyle, width: number, depth: number): THREE.Group {
  const { box, column, palette } = ctx;
  const group = new THREE.Group();
  const height = 3.2 * METRE;
  for (const x of [-width / 2 + 0.3, 0, width / 2 - 0.3]) {
    for (const z of [-depth / 2 + 0.3, depth / 2 - 0.3]) group.add(put(column(0.16, height, style.trim === palette.white ? palette.steel : style.trim, 6), x, 0, z));
  }
  group.add(put(box(width - 1.2, 1.0, 1.1, palette.white), 0, 0, 0));
  group.add(put(box(width - 1.4, 0.12, 0.9, palette.skyBlue), 0, 1.0, 0));
  group.add(put(box(width + 0.6, 0.3, depth + 0.6, style.roof), 0, height, 0));
  group.add(put(box(width + 0.6 + PROUD * 2, 0.5, 0.12, ctx.tone(style.roof, 0.85)), 0, height - 0.2, (depth + 0.6) / 2));
  return group;
}

/** The lighthouse's height, and its lantern's, for the pools. */
export const LIGHT_LANTERN = 7.6 * METRE;

/** A harbour light on the breakwater's head: a white tower banded, a gallery and a lantern. */
export function lighthouse(ctx: MonumentContext, band: number): THREE.Group {
  const { column, taper, ringWall, palette } = ctx;
  const group = new THREE.Group();
  const tower = LIGHT_LANTERN - 1.2;
  group.add(column(1.4, 0.6, ctx.tone(palette.bone, 0.9), 8));
  group.add(put(taper(1.1, 0.8, tower - 0.6, palette.white, 8), 0, 0.6, 0));
  group.add(put(taper(0.96 + PROUD, 0.88 + PROUD, 1.0, band, 8), 0, tower * 0.45, 0));
  group.add(put(column(1.15, 0.2, palette.steel, 8), 0, tower, 0));
  group.add(put(ringWall(1.0, 1.1, 0.5, palette.steel, 8), 0, tower + 0.2, 0));
  group.add(put(glowing(column(0.55, 1.0, palette.cream, 8)), 0, tower + 0.2, 0));
  group.add(put(taper(0.7, 0.1, 0.8, band, 8), 0, tower + 1.2, 0));
  return group;
}

/** A string of red paper lanterns between two posts, along `x`. */
export function lanterns(ctx: MonumentContext, span: number): THREE.Group {
  const { column, strut, palette } = ctx;
  const group = new THREE.Group();
  const top = 3.2 * METRE;
  for (const x of [-span / 2, span / 2]) group.add(put(column(0.08, top, palette.bark, 6), x, 0, 0));
  group.add(strut(new THREE.Vector3(-span / 2, top - 0.1, 0), new THREE.Vector3(span / 2, top - 0.1, 0), 0.03, palette.ink));
  const count = Math.max(2, Math.floor(span / 1.6));
  for (let k = 1; k < count; k++) {
    const x = -span / 2 + (span * k) / count;
    group.add(put(glowing(column(0.24, 0.5, palette.crimson, 8)), x, top - 0.75, 0));
  }
  return group;
}
