/**
 * How the Floaters build (invented): membranes, bladders, rings and spokes.
 *
 * Mars builds pressure vessels — domes on drums — because its problem is
 * keeping air in. Jupiter's problem is the opposite of a foundation: there is
 * no ground, the platform a town stands on is itself held up, and anything
 * heavy here falls for a very long time. So nothing below is massive. A house
 * is a light gondola hung under its own gas bag; a workshop is a wheel of
 * spokes turning in the wind; a hall is three sails of membrane on a mast; a
 * granary is a bunch of small bladders on stalks, like grapes. Every one of
 * them is mostly air with a line drawn round it, which is what the pen is
 * best at.
 *
 * The rules are the kit's: the context's primitives, palette colours from the
 * style, **everything standing on `y = 0`**, and the footprint returned is the
 * widest thing at any height — a bag overhead is as much a wall as a gondola
 * at the foot. The layout spaces buildings for a radius of about eight, so no
 * footprint here passes seven and a half before the plot's own scale.
 */

import * as THREE from 'three';
import type { ArchitectureStyle, BuildingBuilder } from '../../contract.ts';
import { ball, dome } from '../../architecture.ts';
import type { SceneryContext } from '../../../scenery/contract.ts';

/** A gas bag: a sphere squashed a little, centred where its middle is. */
function bag(ctx: SceneryContext, radius: number, color: number, squash: number, sides = 12): THREE.Mesh {
  const mesh = ball(ctx, radius, color, sides);
  mesh.scale.y = squash;
  return mesh;
}

/**
 * An upright ring with spokes: a ring wall turned on its side. `ringWall`
 * extrudes up `y`; a quarter turn about `x` carries `y` to `+z`, so the ring is
 * pulled back half its thickness to be centred on its own plane.
 */
function wheel(ctx: SceneryContext, group: THREE.Group, radius: number, hubY: number, spokes: number, rim: number, spoke: number, turn: number): void {
  const thickness = 0.7;
  const ring = ctx.ringWall(radius - 0.55, radius, thickness, rim, 18);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, hubY, -thickness / 2);
  group.add(ring);
  for (let k = 0; k < spokes; k++) {
    const a = turn + (k / spokes) * Math.PI * 2;
    const end = new THREE.Vector3(Math.cos(a) * (radius - 0.4), hubY + Math.sin(a) * (radius - 0.4), 0);
    group.add(ctx.strut(new THREE.Vector3(0, hubY, 0), end, 0.22, spoke));
  }
  const hub = ctx.column(0.75, 1.1, spoke, 8);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, hubY, -0.55);
  group.add(hub);
}

/** A house: a gondola, a ring of deck round it, and its own bag on four tethers. */
const bladder: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const gondola = rng.range(2.2, 3.0);
  const tall = rng.range(2.4, 3.2) * style.height;
  const sides = rng.pick([6, 8]);
  const wall = rng.pick(style.walls);
  group.add(ctx.column(gondola, tall, wall, sides));
  const deck = ctx.ringWall(gondola, gondola + 1.1, 0.35, ctx.tone(wall, 0.8), sides);
  group.add(deck);
  const door = ctx.box(1.5, 2.3, 0.6, rng.pick(style.accents));
  door.position.z = gondola - 0.2;
  group.add(door);
  const lid = ctx.taper(gondola * 1.05, gondola * 0.4, 0.9, rng.pick(style.roofs), sides);
  lid.position.y = tall;
  group.add(lid);

  const r = rng.range(3.6, 5.0);
  const squash = rng.range(0.72, 0.9);
  const lift = tall + rng.range(3.2, 4.6) * style.height;
  const centre = lift + r * squash;
  const skin = rng.pick(style.roofs);
  const body = bag(ctx, r, skin, squash);
  body.position.y = centre;
  group.add(body);
  // A band round the bag's waist: the seam it was sewn along.
  const seam = ctx.ringWall(r * 0.97, r * 1.04, 0.45, rng.pick(style.accents), 12);
  seam.position.y = centre - 0.22;
  group.add(seam);
  const turn = rng.range(0, Math.PI);
  for (let k = 0; k < 4; k++) {
    const a = turn + (k / 4) * Math.PI * 2;
    const low = new THREE.Vector3(Math.cos(a) * gondola * 0.8, tall + 0.6, Math.sin(a) * gondola * 0.8);
    const high = new THREE.Vector3(Math.cos(a) * r * 0.6, centre - r * squash * 0.75, Math.sin(a) * r * 0.6);
    group.add(ctx.strut(low, high, 0.14, ctx.tone(wall, 0.6)));
  }
  if (rng.chance(0.5)) {
    // A steering fin on the bag's lee side: a bag that is moored still wants
    // to point into the wind.
    const fin = ctx.roof(0.3, r * 0.9, r * 0.6, 0.1, rng.pick(style.accents));
    fin.position.set(0, centre + r * squash * 0.55, -r * 0.55);
    group.add(fin);
  }
  return { group, radius: Math.max(gondola + 1.1, r * 1.04) };
};

/** A workshop: a wind wheel on an A-frame, with a pod of a room at its foot. */
const windWheel: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const radius = rng.range(4.2, 5.4) * Math.min(1.15, style.height);
  const hubY = radius + rng.range(1.4, 2.4);
  const leg = rng.pick(style.walls);
  const trim = rng.pick(style.roofs);
  for (const side of [-1, 1]) {
    const top = new THREE.Vector3(0, hubY, side * 0.9);
    group.add(ctx.strut(new THREE.Vector3(-radius * 0.5, 0, side * 1.6), top, 0.35, leg));
    group.add(ctx.strut(new THREE.Vector3(radius * 0.5, 0, side * 1.6), top, 0.35, leg));
  }
  wheel(ctx, group, radius, hubY, rng.pick([6, 8]), trim, rng.pick(style.accents), rng.range(0, 1));
  // Membrane vanes on alternate spokes, which is what turns it.
  const vanes = 3;
  const turn = rng.range(0, Math.PI);
  for (let k = 0; k < vanes; k++) {
    const a = turn + (k / vanes) * Math.PI * 2;
    // An arm at the hub turned so its +y runs out along the spoke: a turn of
    // `a - pi/2` about z carries (0, 1) to (cos a, sin a).
    const arm = new THREE.Group();
    arm.position.set(0, hubY, 0.45);
    arm.rotation.z = a - Math.PI / 2;
    const vane = ctx.box(radius * 0.32, radius * 0.6, 0.12, rng.pick(style.walls));
    vane.position.y = radius * 0.22;
    arm.add(vane);
    group.add(arm);
  }
  const room = dome(ctx, 2.4, ctx.tone(leg, 1.1), 0.9, 10);
  room.position.set(0, 0, 2.2);
  group.add(room);
  return { group, radius: Math.max(radius * 1.02, 4.7) };
};

/** A hall: three membrane sails round a mast, and a bulb at the top for a lamp. */
const sail: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const tall = rng.range(11, 16) * style.height;
  const reach = rng.range(3.6, 4.8);
  const mast = ctx.taper(0.7, 0.25, tall, rng.pick(style.roofs), 6);
  group.add(mast);
  const fins = rng.between(3, 4);
  const skin = rng.pick(style.walls);
  const turn = rng.range(0, Math.PI);
  for (let k = 0; k < fins; k++) {
    const a = turn + (k / fins) * Math.PI * 2;
    // A sail is a thin slab, wide at the foot and leaning in to the mast:
    // the outer edge a strut from the foot to the head, the slab between.
    const fin = ctx.roof(0.18, reach, tall * 0.78, 0.05, k % 2 === 0 ? skin : ctx.tone(skin, 0.88));
    fin.position.set(Math.cos(a) * reach * 0.5, 0, -Math.sin(a) * reach * 0.5);
    fin.rotation.y = a + Math.PI / 2;
    group.add(fin);
    const edge = ctx.strut(new THREE.Vector3(Math.cos(a) * reach, 0, -Math.sin(a) * reach), new THREE.Vector3(0, tall * 0.8, 0), 0.16, rng.pick(style.roofs));
    group.add(edge);
  }
  const lamp = ball(ctx, 1.1, rng.pick(style.accents), 8);
  lamp.position.y = tall + 0.9;
  group.add(lamp);
  const collar = ctx.ringWall(0.4, 1.4, 0.3, rng.pick(style.accents), 8);
  collar.position.y = tall * 0.8;
  group.add(collar);
  return { group, radius: reach * 1.05 };
};

/** A granary: small bladders on stalks from one footing, like a bunch of grapes. */
const cluster: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const foot = ctx.column(2.6, 1.3, rng.pick(style.walls), 8);
  group.add(foot);
  const count = rng.between(3, 5);
  const turn = rng.range(0, Math.PI * 2);
  let widest = 2.6;
  for (let k = 0; k < count; k++) {
    const a = turn + (k / count) * Math.PI * 2 + rng.jitter() * 0.3;
    const r = rng.range(1.5, 2.5);
    const out = rng.range(2.0, 3.6);
    const up = rng.range(6, 10.5) * style.height;
    const head = new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out);
    group.add(ctx.strut(new THREE.Vector3(Math.cos(a) * 0.8, 1.2, Math.sin(a) * 0.8), head, 0.18, rng.pick(style.roofs)));
    const one = bag(ctx, r, rng.pick(style.roofs), rng.range(0.85, 1.1), 10);
    one.position.copy(head).setY(up + r * 0.8);
    group.add(one);
    widest = Math.max(widest, out + r);
  }
  const knot = ball(ctx, 0.9, rng.pick(style.accents), 8);
  knot.position.y = 1.9;
  group.add(knot);
  return { group, radius: widest * 1.02 };
};

/** A market: a horizontal wheel of spokes under a membrane canopy, on one mast. */
const canopy: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const radius = rng.range(4.6, 6.0);
  const high = rng.range(5.5, 7) * style.height;
  const mast = ctx.column(0.45, high + 1.6, rng.pick(style.roofs), 6);
  group.add(mast);
  const rim = ctx.ringWall(radius - 0.4, radius, 0.4, rng.pick(style.accents), 16);
  rim.position.y = high;
  group.add(rim);
  const spokes = rng.pick([6, 8]);
  const turn = rng.range(0, Math.PI);
  const spokeColor = rng.pick(style.roofs);
  for (let k = 0; k < spokes; k++) {
    const a = turn + (k / spokes) * Math.PI * 2;
    group.add(ctx.strut(new THREE.Vector3(0, high + 1.4, 0), new THREE.Vector3(Math.cos(a) * (radius - 0.2), high + 0.2, Math.sin(a) * (radius - 0.2)), 0.16, spokeColor));
  }
  const skin = ctx.taper(radius * 0.98, 0.5, 1.5, rng.pick(style.walls), spokes * 2);
  skin.position.y = high + 0.3;
  group.add(skin);
  // Stalls hung from the rim: a few small pods, the goods in them.
  const stalls = rng.between(2, 3);
  for (let k = 0; k < stalls; k++) {
    const a = turn + ((k + 0.5) / stalls) * Math.PI * 2;
    const pod = bag(ctx, 0.9, rng.pick(style.roofs), 1.2, 8);
    pod.position.set(Math.cos(a) * radius * 0.8, high - 1.6, Math.sin(a) * radius * 0.8);
    group.add(pod);
    group.add(ctx.strut(new THREE.Vector3(Math.cos(a) * radius * 0.8, high - 0.6, Math.sin(a) * radius * 0.8), new THREE.Vector3(Math.cos(a) * radius * 0.8, high + 0.1, Math.sin(a) * radius * 0.8), 0.08, spokeColor));
  }
  return { group, radius: radius * 1.02 };
};

/**
 * The middle of every town: the mooring mast the whole platform is tied to.
 * A tapering mast ringed in collars, a horizontal wheel of spokes near the top
 * with guy lines down to the platform's edge, and the town's great bag riding
 * over all of it. Ten units of footprint before its plot's scale.
 */
const mooringMast: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const tall = rng.range(22, 28) * style.height;
  const base = ctx.taper(3.2, 2.2, 2.2, rng.pick(style.walls), 8);
  group.add(base);
  const mast = ctx.taper(1.5, 0.55, tall, rng.pick(style.roofs), 8);
  mast.position.y = 2.2;
  group.add(mast);
  const accent = rng.pick(style.accents);
  for (let k = 1; k <= 3; k++) {
    const t = k / 4;
    const r = 1.5 - t * 0.95;
    const collar = ctx.ringWall(r * 0.9, r + 0.9, 0.5, accent, 10);
    collar.position.y = 2.2 + tall * t;
    group.add(collar);
  }
  const wheelY = 2.2 + tall * 0.82;
  const outer = 8.2;
  const rim = ctx.ringWall(outer - 0.5, outer, 0.55, accent, 20);
  rim.position.y = wheelY;
  group.add(rim);
  const spokes = 8;
  const ropes = rng.pick(style.roofs);
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2;
    const end = new THREE.Vector3(Math.cos(a) * (outer - 0.3), wheelY + 0.3, Math.sin(a) * (outer - 0.3));
    group.add(ctx.strut(new THREE.Vector3(0, wheelY + 1.2, 0), end, 0.2, ropes));
    if (k % 2 === 0) {
      // Guy lines: from the wheel down and out to the platform's anchors.
      const anchor = new THREE.Vector3(Math.cos(a) * 9.6, 0.4, Math.sin(a) * 9.6);
      group.add(ctx.strut(end, anchor, 0.12, ctx.tone(ropes, 0.7)));
      const cleat = ctx.column(0.6, 0.8, ctx.tone(ropes, 0.7), 6);
      cleat.position.copy(anchor).setY(0);
      group.add(cleat);
    }
  }
  const r = 6.2;
  const centre = 2.2 + tall + r * 0.72;
  const great = bag(ctx, r, rng.pick(style.walls), 0.78, 14);
  great.position.y = centre;
  group.add(great);
  const seam = ctx.ringWall(r * 0.98, r * 1.05, 0.6, accent, 14);
  seam.position.y = centre - 0.3;
  group.add(seam);
  const crown = ctx.taper(0.9, 0.08, 3.2, accent, 6);
  crown.position.y = centre + r * 0.76;
  group.add(crown);
  return { group, radius: 10 };
};

export const FLOATER_BUILDINGS: Readonly<Record<string, BuildingBuilder>> = {
  bladder,
  'wind-wheel': windWheel,
  sail,
  cluster,
  canopy,
  'mooring-mast': mooringMast,
};

/** For the landmarks, which want the same kit in their own colours. */
export type { ArchitectureStyle };
export { bag, wheel };
