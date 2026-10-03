/**
 * How the Gale build (invented): hulls, fins, sails and kites, all of it tied
 * down.
 *
 * Mars builds pressure vessels and Jupiter builds gas bags. Neptune's problem
 * is neither the air nor the floor: it is the wind, two thousand kilometres an
 * hour at the equator, and every building below is an answer to it. A house
 * is a low teardrop hull with its blunt end to the gale and a fin on its back
 * that keeps it pointing there, on a short pivot so it can swing; a mast flies
 * kites on a tether, because a kite is the one structure that is stronger the
 * harder it blows; a hall is a long hull under a rig of three sails; a store
 * is a lens of cloud-weave held down by a ring of anchors and stays. Nothing
 * stands up straight that does not have to, and everything that does is
 * guyed.
 *
 * The rules are the kit's: the context's primitives, palette colours from the
 * style, **everything standing on `y = 0`**, and the footprint returned is the
 * widest thing at any height, guy lines included, because a stay is as much a
 * wall as a hull. The layout spaces buildings for a radius of about eight, so
 * no footprint here passes seven and a half before the plot's own scale.
 *
 * The downwind direction of every building is its own `-x`; the fin trails
 * toward it and the kites stream toward it.
 */

import * as THREE from 'three';
import type { BuildingBuilder } from '../../contract.ts';
import { ball, dome } from '../../architecture.ts';
import type { SceneryContext } from '../../../scenery/contract.ts';

/**
 * A sail: a triangle with its foot along `x` from 0 to `foot`, its luff up the
 * mast at x = 0 to `height`, and its leech bellied out by `belly`, extruded a
 * hand thick and centred on its own plane, `z = 0`. Standing on `y = 0`.
 */
export function sail(ctx: SceneryContext, foot: number, height: number, belly: number, color: number): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(foot, 0);
  shape.quadraticCurveTo(foot * 0.55 + belly, height * 0.55, 0, height);
  shape.lineTo(0, 0);
  const thickness = 0.28;
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 4 });
  geometry.translate(0, 0, -thickness / 2);
  return new THREE.Mesh(geometry, ctx.toon(color));
}

/**
 * A kite: a flat diamond, taller than wide, centred at its origin and facing
 * `+z`. An octahedron pressed thin, so its four facets catch the light in four
 * bands and the pen draws the cross-spar for free.
 */
export function kite(ctx: SceneryContext, size: number, color: number): THREE.Mesh {
  const geometry = new THREE.OctahedronGeometry(1, 0);
  const mesh = new THREE.Mesh(geometry, ctx.toon(color));
  mesh.scale.set(size * 0.7, size, size * 0.14);
  return mesh;
}

/** A stay from `from` to a peg on the ground at `foot`, with the peg. */
export function stay(ctx: SceneryContext, group: THREE.Group, from: THREE.Vector3, foot: THREE.Vector3, line: number, peg: number): void {
  group.add(ctx.strut(from, foot, 0.12, line));
  const pin = ctx.taper(0.45, 0.2, 0.7, peg, 5);
  pin.position.copy(foot);
  group.add(pin);
}

/**
 * A house: a teardrop hull on a pivot, blunt end into the wind, a fin on its
 * back and a short tail of streamers. Two stays hold the nose down.
 */
const windHouse: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const length = rng.range(5.2, 6.6);
  const beam = rng.range(2.4, 3.0);
  const tall = rng.range(2.2, 2.8) * style.height;
  const wall = rng.pick(style.walls);
  const trim = rng.pick(style.roofs);
  const accent = rng.pick(style.accents);
  // The pivot: a squat drum the hull turns on.
  const pivot = ctx.column(beam * 0.55, 1.1, trim, 8);
  group.add(pivot);
  // The hull, a sphere stretched along x and pressed flat, its blunt end at
  // +x: the stern half is stretched further than the bow.
  const bow = ball(ctx, 1, wall, 12);
  bow.scale.set(length * 0.38, tall * 0.5, beam);
  bow.position.set(length * 0.12, 1.1 + tall * 0.5, 0);
  group.add(bow);
  const stern = ctx.taper(beam * 0.92, 0.25, length * 0.62, wall, 10);
  stern.rotation.z = Math.PI / 2;
  // The taper's own x is the world's up after the quarter turn, and the
  // scale is applied before the turn: so x is the squash, not z.
  stern.scale.set((tall * 0.5) / beam, 1, 1);
  stern.position.set(length * 0.12, 1.1 + tall * 0.5, 0);
  group.add(stern);
  // A band of windows round the bow, as one ring.
  const band = ctx.ringWall(beam * 0.97, beam * 1.03, 0.45, ctx.glass, 12);
  band.scale.set(length * 0.38 / beam, 1, 1);
  band.position.set(length * 0.12, 1.1 + tall * 0.42, 0);
  group.add(band);
  // The fin: a sail stood on the hull's back, trailing downwind.
  const fin = sail(ctx, length * 0.42, tall * 1.3, 0.6, accent);
  fin.position.set(-length * 0.05, 1.1 + tall * 0.85, 0);
  group.add(fin);
  // The hatch in the bow's flank, and a gangway up to it.
  const door = ctx.box(1.2, 1.5, 0.5, trim);
  door.position.set(length * 0.14, 1.1 + tall * 0.12, beam * 0.88);
  group.add(door);
  group.add(ctx.strut(new THREE.Vector3(length * 0.14, 0, beam * 1.6), new THREE.Vector3(length * 0.14, 1.2 + tall * 0.12, beam * 0.95), 0.4, trim));
  // Two stays off the nose to pegs ahead and to either side.
  const nose = new THREE.Vector3(length * 0.45, 1.1 + tall * 0.45, 0);
  for (const side of [-1, 1]) stay(ctx, group, nose, new THREE.Vector3(length * 0.78, 0, side * beam * 1.3), trim, trim);
  return { group, radius: Math.hypot(length * 0.78, beam * 1.3) + 0.5 };
};

/**
 * A kite mast: a tapering pole on a stepped footing, three stays, and a train
 * of kites flying off its head on one tether, each smaller and higher than
 * the last. The Gale's prayer flags, and their wind gauge: you can read the
 * gale's strength off the tether's angle.
 */
const kiteMast: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const tall = rng.range(12, 17) * style.height;
  const pole = rng.pick(style.roofs);
  const line = lineColour(style);
  const foot = ctx.column(1.8, 0.8, rng.pick(style.walls), 8);
  group.add(foot);
  const mast = ctx.taper(0.55, 0.22, tall, pole, 6);
  mast.position.y = 0.8;
  group.add(mast);
  const head = new THREE.Vector3(0, tall + 0.8, 0);
  const turn = rng.range(0, Math.PI * 2);
  for (let k = 0; k < 3; k++) {
    const a = turn + (k / 3) * Math.PI * 2;
    stay(ctx, group, new THREE.Vector3(0, tall * 0.62, 0), new THREE.Vector3(Math.cos(a) * 5.6, 0, Math.sin(a) * 5.6), line, pole);
  }
  // The tether streams downwind and up; the kites sit along it.
  const kites = rng.between(2, 4);
  const lean = rng.range(0.42, 0.62);
  let from = head.clone();
  for (let k = 0; k < kites; k++) {
    const run = 1.9 - k * 0.25;
    const to = from.clone().add(new THREE.Vector3(-Math.cos(lean) * run, Math.sin(lean) * run, 0));
    group.add(ctx.strut(from, to, 0.08, line));
    const flier = kite(ctx, 1.6 - k * 0.25, k % 2 === 0 ? rng.pick(style.accents) : rng.pick(style.walls));
    flier.position.copy(to);
    flier.rotation.y = Math.PI / 2;
    flier.rotation.x = -0.4;
    group.add(flier);
    from = to;
  }
  return { group, radius: 6.8 };
};

/** Whatever a style names first among its roofs: the dark one, for lines. */
function lineColour(style: { roofs: readonly number[] }): number {
  return style.roofs[0]!;
}

/**
 * A hall: a long hull low to the deck, a gallery of windows along each side,
 * and a rig of three sails standing on its back, the tallest forward. It is
 * where a Gale town keeps its common table and argues about the weather.
 */
const sailHall: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const length = rng.range(9, 11);
  const beam = rng.range(3.4, 4.2);
  const tall = rng.range(3, 3.8) * style.height;
  const wall = rng.pick(style.walls);
  const trim = rng.pick(style.roofs);
  const hull = dome(ctx, 1, wall, 1, 14);
  hull.scale.set(length / 2, tall, beam);
  group.add(hull);
  const keel = ctx.box(length * 0.86, 0.6, beam * 1.5, trim);
  group.add(keel);
  for (const side of [-1, 1]) {
    const row = ctx.panes(4, 1.1, 0.9, 0.9, ctx.glass);
    row.position.set(0, 0.9, side * beam * 0.83);
    row.rotation.y = side > 0 ? 0 : Math.PI;
    group.add(row);
  }
  const rig = rng.between(2, 3);
  const accent = rng.pick(style.accents);
  for (let k = 0; k < rig; k++) {
    const x = length * (0.26 - k * 0.24);
    const mast = ctx.column(0.18, tall * (2.6 - k * 0.45), trim, 5);
    mast.position.set(x, tall * 0.6, 0);
    group.add(mast);
    const cloth = sail(ctx, length * 0.26, tall * (2.2 - k * 0.4), 0.9, k === 0 ? accent : rng.pick(style.walls));
    cloth.position.set(x, tall * 0.95, 0);
    group.add(cloth);
  }
  return { group, radius: Math.max(length / 2, beam) * 1.08 };
};

/**
 * A store: a lens of woven cloud held a body's height off the deck, pulled
 * down on all sides by stays to a ring of anchor posts. Grain does not keep
 * in a jet stream; what the Gale store is the ice they comb out of the
 * cirrus, and it keeps best up in the wind.
 */
const anchoredLens: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const r = rng.range(4.2, 5.4);
  const lift = rng.range(3.6, 4.8) * style.height;
  const posts = rng.between(4, 6);
  const trim = rng.pick(style.roofs);
  const turn = rng.range(0, Math.PI);
  const lens = ball(ctx, r, rng.pick(style.walls), 12);
  lens.scale.y = 0.34;
  lens.position.y = lift + r * 0.34;
  group.add(lens);
  const girdle = ctx.ringWall(r * 0.94, r * 1.02, 0.5, rng.pick(style.accents), 14);
  girdle.position.y = lift + r * 0.3;
  group.add(girdle);
  for (let k = 0; k < posts; k++) {
    const a = turn + (k / posts) * Math.PI * 2;
    const post = ctx.taper(0.5, 0.28, 1.6, trim, 5);
    post.position.set(Math.cos(a) * r * 1.22, 0, Math.sin(a) * r * 1.22);
    group.add(post);
    group.add(
      ctx.strut(
        new THREE.Vector3(Math.cos(a) * r * 1.22, 1.5, Math.sin(a) * r * 1.22),
        new THREE.Vector3(Math.cos(a) * r * 0.9, lift + r * 0.25, Math.sin(a) * r * 0.9),
        0.12,
        trim,
      ),
    );
  }
  // The hatch, up a ladder from the middle.
  const ladder = ctx.column(0.35, lift + 0.2, trim, 5);
  group.add(ladder);
  return { group, radius: r * 1.32 };
};

/**
 * The town's centre: the Gale Mast. A tall guyed mast whose head carries a
 * vane — a long fin on a boom that turns the whole crown into the wind — and
 * a ring of small sails round its middle like a collar of feathers. Every
 * town has one and every town claims its own reads the gale truest.
 */
const galeMast: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const tall = rng.range(18, 22) * style.height;
  const trim = rng.pick(style.roofs);
  const wall = rng.pick(style.walls);
  const accent = rng.pick(style.accents);
  const base = ctx.taper(3.6, 2.6, 1.4, wall, 8);
  group.add(base);
  const step = ctx.taper(2.4, 1.8, 1.2, trim, 8);
  step.position.y = 1.4;
  group.add(step);
  const mast = ctx.taper(0.9, 0.35, tall, wall, 8);
  mast.position.y = 2.6;
  group.add(mast);
  // The collar of sails.
  const collar = rng.between(5, 7);
  for (let k = 0; k < collar; k++) {
    const a = (k / collar) * Math.PI * 2;
    const cloth = sail(ctx, 2.6, 4.6, 0.5, k % 2 === 0 ? accent : wall);
    cloth.rotation.y = a;
    cloth.position.set(Math.cos(a) * 0.6, tall * 0.45, -Math.sin(a) * 0.6);
    group.add(cloth);
  }
  // The vane at the head: a boom along x, a fin at its tail, a teardrop at its nose.
  const headY = tall + 2.6;
  const boom = ctx.strut(new THREE.Vector3(3.2, headY, 0), new THREE.Vector3(-5.2, headY, 0), 0.26, trim);
  group.add(boom);
  const fin = sail(ctx, 3.4, 4.2, 0.4, accent);
  fin.position.set(-6.4, headY - 0.6, 0);
  group.add(fin);
  const nose = ball(ctx, 1.1, wall, 10);
  nose.scale.set(1.6, 1, 1);
  nose.position.set(3.4, headY, 0);
  group.add(nose);
  // Four stays.
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    stay(ctx, group, new THREE.Vector3(0, tall * 0.7, 0), new THREE.Vector3(Math.cos(a) * 6.6, 0, Math.sin(a) * 6.6), trim, trim);
  }
  return { group, radius: 7.2 };
};

export const GALE_BUILDINGS: Readonly<Record<string, BuildingBuilder>> = {
  'wind-house': windHouse,
  'kite-mast': kiteMast,
  'sail-hall': sailHall,
  'anchored-lens': anchoredLens,
  'gale-mast': galeMast,
};
