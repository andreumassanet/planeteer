/**
 * How the Sidelings build (invented): crystals, lenses and frost.
 *
 * Mars builds pressure vessels and Jupiter builds balloons; Uranus's problem
 * is **light**. The Sun at 19 au gives a three-hundred-and-seventieth of what
 * it gives Earth, so a Sideling's first question about any building is what
 * it does with the little that arrives. The answers are the forms below:
 *
 * - a **crystal** house is a cluster of six-sided prisms on a plinth, each
 *   capped with a point, like a geode stood on end — the prisms carry the
 *   light down into the rooms the way a fibre does;
 * - a **lens** house is a wide, flat, two-sided lens on a stalk, held level so
 *   the Sun circling overhead in the long northern day falls on its whole
 *   face at every hour;
 * - a **frost spire** is a needle of stacked tapering prisms ringed with
 *   collars of frost, the tallest thing in a town and the first to catch the
 *   Sun when it comes back after a forty-two-year night;
 * - and in every square a **sunwatch**: an armillary of two rings on a
 *   prism column with a gold ball in the middle, the instrument that keeps
 *   the calendar on a world where noon lasts a generation.
 *
 * The kit's rules hold: the context's primitives, palette colours from the
 * style, **everything standing on `y = 0`**, and the footprint returned is the
 * widest thing at any height. The layout spaces buildings for a radius of
 * about eight, so no footprint here passes seven and a half before the plot's
 * own scale.
 */

import * as THREE from 'three';
import type { BuildingBuilder } from '../../contract.ts';
import { ball, dome } from '../../architecture.ts';
import type { SceneryContext } from '../../../scenery/contract.ts';

/**
 * One crystal: a six-sided prism and the point on top of it, standing on
 * `y = 0` at `(x, z)`. Returns the height of the tip.
 */
export function crystal(ctx: SceneryContext, group: THREE.Group, x: number, z: number, radius: number, height: number, color: number): number {
  const shaft = ctx.column(radius, height, color, 6);
  shaft.position.set(x, 0, z);
  group.add(shaft);
  const point = ctx.taper(radius, 0.06, radius * 1.7, ctx.tone(color, 1.08), 6);
  point.position.set(x, height, z);
  group.add(point);
  return height + radius * 1.7;
}

/**
 * An octahedron — a cut diamond — centred at its middle: two four-sided
 * pyramids base to base. The lower is the upper turned half over about `x`,
 * which is a rotation (determinant +1), never a mirror.
 */
export function diamond(ctx: SceneryContext, radius: number, color: number): THREE.Group {
  const group = new THREE.Group();
  const top = ctx.taper(radius, 0.04, radius * 1.15, color, 4);
  group.add(top);
  const bottom = ctx.taper(radius, 0.04, radius * 1.15, ctx.tone(color, 0.86), 4);
  bottom.rotation.x = Math.PI;
  group.add(bottom);
  return group;
}

/**
 * An upright ring, its plane the `xy` plane, centred at `(0, y, 0)`.
 * `ringWall` extrudes up `y`; a quarter turn about `x` carries that to `+z`,
 * so the ring is pulled back half its thickness to sit on its own plane.
 */
export function hoop(ctx: SceneryContext, radius: number, width: number, thickness: number, color: number, sides = 20): THREE.Mesh {
  const ring = ctx.ringWall(radius - width, radius, thickness, color, sides);
  ring.rotation.x = Math.PI / 2;
  ring.position.z = -thickness / 2;
  return ring;
}

/** A house: a geode of prisms on a hexagonal plinth, with a door in the tallest. */
const crystalHouse: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const base = rng.range(4.2, 5.6);
  const plinth = ctx.column(base, 0.7, rng.pick(style.roofs), 6);
  group.add(plinth);
  const lift = new THREE.Group();
  lift.position.y = 0.7;
  group.add(lift);
  const wall = rng.pick(style.walls);
  // The main prism, in the middle: the room.
  const main = rng.range(2.0, 2.5);
  crystal(ctx, lift, 0, 0, main, rng.range(7, 10.5) * style.height, wall);
  const door = ctx.box(1.4, 2.5, 0.5, rng.pick(style.accents));
  door.position.z = main * 0.87;
  lift.add(door);
  // The lesser prisms round it, shorter and leaning on it for company.
  const count = rng.between(3, 5);
  const turn = rng.range(0, Math.PI * 2);
  for (let k = 0; k < count; k++) {
    const a = turn + (k / count) * Math.PI * 2 + rng.jitter() * 0.25;
    // Keep the door's side, +z, clear.
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.6) continue;
    const r = rng.range(0.8, 1.5);
    const out = main + r * 0.55;
    const shade = k % 2 === 0 ? wall : rng.pick(style.walls);
    crystal(ctx, lift, Math.cos(a) * out, Math.sin(a) * out, r, rng.range(3, 6.5) * style.height, shade);
  }
  // A hexagon's corners stand 1/cos(30) past the radius the context takes.
  return { group, radius: base * 1.16 };
};

/** A house: a flat lens held level on a stalk, a stair up to it, a frost cap on top. */
const lens: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const r = rng.range(4.6, 6.2);
  const lift = rng.range(3.4, 5) * style.height;
  const thick = rng.range(0.28, 0.36);
  const trim = rng.pick(style.roofs);
  const stalk = ctx.taper(1.8, 1.1, lift, trim, 8);
  group.add(stalk);
  const foot = ctx.column(2.4, 0.5, ctx.tone(trim, 0.85), 8);
  group.add(foot);
  const body = ball(ctx, r, rng.pick(style.walls), 16);
  body.scale.y = thick;
  body.position.y = lift + r * thick * 0.9;
  group.add(body);
  const rim = ctx.ringWall(r * 0.96, r * 1.03, 0.45, rng.pick(style.accents), 16);
  rim.position.y = lift + r * thick * 0.9 - 0.22;
  group.add(rim);
  const cap = dome(ctx, r * 0.32, rng.pick(style.roofs), 0.9, 10);
  cap.position.y = lift + r * thick * 1.75;
  group.add(cap);
  // The stair: a strut from the ground to the lens's underside.
  group.add(ctx.strut(new THREE.Vector3(0, 0, r * 0.92), new THREE.Vector3(0, lift + 0.2, r * 0.42), 0.32, trim));
  const door = ctx.box(1.3, 2.2, 0.5, rng.pick(style.accents));
  door.position.set(0, 0.5, 2.0);
  group.add(door);
  return { group, radius: r * 1.03 };
};

/** A tower: stacked tapering prisms ringed with frost collars, and a crystal point. */
const frostSpire: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const r = rng.range(2.4, 3.2);
  const sides = 6;
  const plinth = ctx.taper(r * 1.55, r * 1.25, 1.2, rng.pick(style.roofs), sides);
  group.add(plinth);
  const segments = rng.between(3, 4);
  let y = 1.2;
  let width = r;
  const wall = rng.pick(style.walls);
  const frost = rng.pick(style.accents);
  for (let k = 0; k < segments; k++) {
    const h = rng.range(4.5, 6.5) * style.height;
    const narrow = width * rng.range(0.7, 0.8);
    const shaft = ctx.taper(width, narrow, h, k % 2 === 0 ? wall : ctx.tone(wall, 0.9), sides);
    shaft.position.y = y;
    group.add(shaft);
    y += h;
    const collar = ctx.ringWall(narrow * 0.9, narrow * 1.35, 0.5, frost, sides * 2);
    collar.position.y = y - 0.25;
    group.add(collar);
    width = narrow;
  }
  const point = ctx.taper(width, 0.05, width * 3.2, ctx.tone(wall, 1.1), sides);
  point.position.y = y;
  group.add(point);
  const door = ctx.box(1.5, 2.5, 0.5, frost);
  door.position.set(0, 1.2, r * 0.82);
  group.add(door);
  return { group, radius: r * 1.55 * 1.16 };
};

/**
 * The square's instrument: a prism column, an armillary of two rings on it
 * and the gold Sun in the middle, and a ring of seven hour-stones — one
 * for each of the seventeen-hour turns a Sideling counts in a week, the
 * week being, they say, as long as anything should be.
 */
const sunwatch: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const floor = ctx.column(5.2, 0.6, rng.pick(style.roofs), 12);
  group.add(floor);
  const wall = rng.pick(style.walls);
  const column = ctx.column(1.3, 8, wall, 6);
  column.position.y = 0.6;
  group.add(column);
  const head = ctx.taper(1.3, 2.2, 1.2, ctx.tone(wall, 0.9), 6);
  head.position.y = 8.6;
  group.add(head);
  const centre = 15.4;
  const accent = rng.pick(style.accents);
  // The meridian ring, upright, and the horizon ring through it at an angle:
  // the second leans 98 degrees off the first, which is the joke.
  const meridian = hoop(ctx, 5.2, 0.55, 0.5, accent, 22);
  meridian.position.y += centre;
  group.add(meridian);
  const tilted = new THREE.Group();
  tilted.position.y = centre;
  tilted.rotation.y = Math.PI / 2;
  tilted.rotation.x = (98 - 90) * (Math.PI / 180);
  tilted.add(hoop(ctx, 4.5, 0.45, 0.4, rng.pick(style.roofs), 22));
  group.add(tilted);
  group.add(ctx.strut(new THREE.Vector3(0, 9.8, 0), new THREE.Vector3(0, centre - 5.2, 0), 0.35, accent));
  const sun = ball(ctx, 1.4, accent, 10);
  sun.position.y = centre;
  group.add(sun);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    const marker = new THREE.Group();
    marker.position.set(Math.cos(a) * 4.3, 0.6, Math.sin(a) * 4.3);
    crystal(ctx, marker, 0, 0, 0.45, 1.2 + (k % 2) * 0.8, k === 0 ? accent : wall);
    group.add(marker);
  }
  return { group, radius: 5.4 };
};

export const SIDELING_BUILDINGS: Record<string, BuildingBuilder> = {
  crystal: crystalHouse,
  lens,
  'frost-spire': frostSpire,
  sunwatch,
};
