/**
 * How the Drifters build (invented): rings, halos and spokes, held up on
 * masts thinner than anyone else would dare.
 *
 * Mars builds pressure vessels and Jupiter builds balloons; Saturn's people
 * build **the thing they look at every day of their lives**. The rings fill a
 * third of their sky, so everything here is a ring of some kind — a halo hung
 * from a mast-head, an armillary of two rings round a pod, three planters
 * stacked on a stem, a hall roofed with a hoop instead of a lid, a gate that is
 * a circle standing on its edge. And every ring that is not level is tilted
 * at the planet's own **26.7 degrees**, which is how far the rings are tipped
 * to the Sun at the height of summer and the one number every Drifter knows.
 *
 * The rules are the kit's: the context's primitives, palette colours from the
 * style, **everything standing on `y = 0`**, and the footprint returned is the
 * widest thing at any height — a halo overhead is as much a wall as a door at
 * the foot. The layout spaces buildings for a radius of about eight, so no
 * footprint here passes seven before the plot's own scale.
 */

import * as THREE from 'three';
import type { BuildingBuilder } from '../../contract.ts';
import { ball, dome } from '../../architecture.ts';
import type { SceneryContext } from '../../../scenery/contract.ts';
import { SATURN } from '../../../system/bodies/saturn.ts';
import { PALETTE } from '../../../theme.ts';

/** The rings' tilt to the orbit, which is the tilt of everything a Drifter builds aslant. */
export const TILT = (SATURN.tiltDeg * Math.PI) / 180;

/**
 * A flat ring centred on its own plane (a `ringWall` stands on `y = 0`, so it
 * is pulled down half its thickness), in a group that can be tipped.
 */
export function hoop(ctx: SceneryContext, inner: number, outer: number, thickness: number, color: number, sides: number): THREE.Group {
  const group = new THREE.Group();
  const ring = ctx.ringWall(inner, outer, thickness, color, sides);
  ring.position.y = -thickness / 2;
  group.add(ring);
  return group;
}

/** A house: a slender mast, a home at its foot, and a halo hung from its head with pods under it. */
const halo: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const tall = rng.range(10, 13.5) * style.height;
  const wall = rng.pick(style.walls);
  const roof = rng.pick(style.roofs);
  const accent = rng.pick(style.accents);
  const home = rng.range(2.1, 2.6);
  const sides = rng.pick([7, 8]);
  group.add(ctx.column(home, 2.8 * style.height, wall, sides));
  const cap = dome(ctx, home, roof, 0.7, sides);
  cap.position.y = 2.8 * style.height;
  group.add(cap);
  const door = ctx.box(1.3, 2.2, 0.6, ctx.tone(roof, 0.75));
  door.position.z = home - 0.2;
  group.add(door);
  const mast = ctx.taper(0.5, 0.2, tall, roof, 6);
  group.add(mast);
  const head = ball(ctx, 0.45, accent, 6);
  head.position.y = tall + 0.2;
  group.add(head);

  // The halo, hung on four cables from the mast-head.
  const r = rng.range(3.6, 4.4);
  const y = tall * rng.range(0.62, 0.72);
  const ring = hoop(ctx, r - 0.7, r, 0.45, accent, 20);
  ring.position.y = y;
  group.add(ring);
  const turn = rng.range(0, Math.PI);
  for (let k = 0; k < 4; k++) {
    const a = turn + (k / 4) * Math.PI * 2;
    group.add(ctx.strut(new THREE.Vector3(0, tall - 0.2, 0), new THREE.Vector3(Math.cos(a) * (r - 0.35), y + 0.2, Math.sin(a) * (r - 0.35)), 0.09, ctx.tone(roof, 0.7)));
  }
  // Pods hung under it: the rooms nobody needs to reach every day.
  const pods = rng.between(2, 3);
  for (let k = 0; k < pods; k++) {
    const a = turn + ((k + 0.5) / pods) * Math.PI * 2;
    const at = new THREE.Vector3(Math.cos(a) * (r - 0.35), y - 1.9, Math.sin(a) * (r - 0.35));
    const pod = ball(ctx, 0.85, wall, 8);
    pod.scale.y = 1.2;
    pod.position.copy(at);
    group.add(pod);
    group.add(ctx.strut(at.clone().setY(y - 0.9), at.clone().setY(y - 0.2), 0.08, ctx.tone(roof, 0.7)));
  }
  return { group, radius: Math.max(home, r) * 1.04 };
};

/** A workshop: a pod on a stem inside two crossed rings — an armillary, tipped at the tilt. */
const gyre: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const stem = rng.range(5.5, 7.5) * style.height;
  const roof = rng.pick(style.roofs);
  group.add(ctx.column(2.2, 0.6, roof, 8));
  const shaft = ctx.taper(0.75, 0.35, stem, roof, 6);
  shaft.position.y = 0.6;
  group.add(shaft);
  const middle = 0.6 + stem + 1.4;
  const pod = ball(ctx, 2.1, rng.pick(style.walls), 10);
  pod.scale.y = 0.82;
  pod.position.y = middle;
  group.add(pod);
  const band = hoop(ctx, 2.0, 2.3, 0.4, rng.pick(style.accents), 12);
  band.position.y = middle;
  group.add(band);

  const outer = rng.range(4.8, 5.5);
  const yaw = rng.range(0, Math.PI);
  // Tipped about z inside a turned parent: the tilt in the ring's own frame,
  // the heading in the town's, so the two rotations never share an axis.
  const tipped = new THREE.Group();
  tipped.position.y = middle;
  tipped.rotation.y = yaw;
  const big = hoop(ctx, outer - 0.65, outer, 0.5, rng.pick(style.accents), 24);
  big.rotation.z = TILT;
  tipped.add(big);
  const small = hoop(ctx, outer * 0.66, outer * 0.66 + 0.45, 0.4, rng.pick(style.walls), 20);
  small.rotation.x = -TILT;
  tipped.add(small);
  group.add(tipped);
  // Two stays from the base, one to each ring's low side, so the armillary
  // is held and not floating: the big ring dips on its -x side, the small one
  // on its -z side, both before the yaw.
  const Y = new THREE.Vector3(0, 1, 0);
  const lows = [
    new THREE.Vector3(-(outer - 0.3) * Math.cos(TILT), -(outer - 0.3) * Math.sin(TILT), 0),
    new THREE.Vector3(0, -(outer * 0.66 + 0.2) * Math.sin(TILT), -(outer * 0.66 + 0.2) * Math.cos(TILT)),
  ];
  for (const low of lows) {
    low.applyAxisAngle(Y, yaw).setY(middle + low.y);
    group.add(ctx.strut(new THREE.Vector3(low.x * 0.35, 0.6, low.z * 0.35), low, 0.16, roof));
  }
  return { group, radius: outer * 1.03 };
};

/** A garden: three ring planters stacked on a stem, greenery on each and trailing under it. */
const garden: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const stemColor = rng.pick(style.roofs);
  const tall = rng.range(12.5, 15) * style.height;
  group.add(ctx.column(1.4, 0.8, stemColor, 8));
  const stem = ctx.taper(0.6, 0.28, tall, stemColor, 6);
  group.add(stem);
  const planter = rng.pick(style.walls);
  const leaves = [PALETTE.green, PALETTE.olive, PALETTE.darkOlive] as const;
  const tiers = [
    { r: rng.range(4.7, 5.2), y: tall * 0.24, plants: 6 },
    { r: rng.range(3.6, 4.0), y: tall * 0.52, plants: 5 },
    { r: rng.range(2.5, 2.9), y: tall * 0.78, plants: 4 },
  ];
  const turn = rng.range(0, Math.PI);
  for (const [t, tier] of tiers.entries()) {
    const ring = hoop(ctx, tier.r - 1.0, tier.r, 0.6, t % 2 === 0 ? planter : ctx.tone(planter, 0.9), 18);
    ring.position.y = tier.y;
    group.add(ring);
    for (let k = 0; k < 3; k++) {
      const a = turn + t * 0.7 + (k / 3) * Math.PI * 2;
      group.add(ctx.strut(new THREE.Vector3(0, tier.y + 0.6, 0), new THREE.Vector3(Math.cos(a) * (tier.r - 0.9), tier.y + 0.1, Math.sin(a) * (tier.r - 0.9)), 0.12, stemColor));
    }
    for (let k = 0; k < tier.plants; k++) {
      const a = turn + t + ((k + 0.5) / tier.plants) * Math.PI * 2;
      const mid = tier.r - 0.5;
      const leaf = ball(ctx, rng.range(0.55, 0.8), rng.pick(leaves), 6);
      leaf.position.set(Math.cos(a) * mid, tier.y + 0.65, Math.sin(a) * mid);
      group.add(leaf);
      if (k % 2 === 0) {
        // A vine trailing over the rim.
        const hang = rng.range(1.2, 2.2);
        const from = new THREE.Vector3(Math.cos(a) * (tier.r - 0.05), tier.y + 0.2, Math.sin(a) * (tier.r - 0.05));
        const to = from.clone().setY(tier.y - hang);
        group.add(ctx.strut(from, to, 0.12, leaves[0]));
        const bud = ball(ctx, 0.32, rng.pick(style.accents), 5);
        bud.position.copy(to);
        group.add(bud);
      }
    }
  }
  const crown = dome(ctx, 0.9, rng.pick(style.accents), 1.1, 8);
  crown.position.y = tall;
  group.add(crown);
  return { group, radius: tiers[0]!.r * 1.04 };
};

/** A hall: a round wall open to the sky, roofed with a floating hoop on slender columns. */
const hall: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const r = rng.range(5.4, 6.0);
  const wallHigh = rng.range(2.2, 2.8) * style.height;
  const wall = rng.pick(style.walls);
  group.add(ctx.ringWall(r - 0.7, r, wallHigh, wall, 20));
  const door = ctx.box(2.2, 2.0, 1.0, ctx.tone(wall, 0.7));
  door.position.z = r - 0.35;
  group.add(door);
  const roofY = wallHigh + rng.range(3.2, 4.2) * style.height;
  const roof = rng.pick(style.roofs);
  const columns = 6;
  for (let k = 0; k < columns; k++) {
    const a = (k / columns) * Math.PI * 2 + Math.PI / columns;
    const post = ctx.column(0.24, roofY - wallHigh, roof, 5);
    post.position.set(Math.cos(a) * (r - 0.35), wallHigh, Math.sin(a) * (r - 0.35));
    group.add(post);
  }
  const lid = hoop(ctx, r * 0.55, r + 0.5, 0.5, roof, 24);
  lid.position.y = roofY + 0.25;
  group.add(lid);
  // The parasol's ribs, up from the hoop to a finial over the open middle.
  const top = roofY + 2.6;
  const accent = rng.pick(style.accents);
  for (let k = 0; k < columns; k++) {
    const a = (k / columns) * Math.PI * 2;
    group.add(ctx.strut(new THREE.Vector3(Math.cos(a) * r * 0.6, roofY + 0.5, Math.sin(a) * r * 0.6), new THREE.Vector3(0, top, 0), 0.14, accent));
  }
  const finial = ball(ctx, 0.6, accent, 8);
  finial.position.y = top;
  group.add(finial);
  const shrine = dome(ctx, 1.8, rng.pick(style.accents), 1, 10);
  group.add(shrine);
  return { group, radius: (r + 0.5) * 1.02 };
};

/** A gate: a circle standing on its edge, a lantern hung in it. Nothing behind it; the circle is the point. */
const gate: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const r = rng.range(3.2, 3.9) * Math.min(1.1, style.height);
  const centre = r + 0.7;
  const segments = 14;
  const a1 = rng.pick(style.walls);
  const a2 = rng.pick(style.accents);
  for (let k = 0; k < segments; k++) {
    const p = (k / segments) * Math.PI * 2;
    const q = ((k + 1) / segments) * Math.PI * 2;
    const from = new THREE.Vector3(Math.cos(p) * r, centre + Math.sin(p) * r, 0);
    const to = new THREE.Vector3(Math.cos(q) * r, centre + Math.sin(q) * r, 0);
    group.add(ctx.strut(from, to, 0.6, k % 2 === 0 ? a1 : a2));
  }
  for (const side of [-1, 1]) {
    const foot = ctx.box(1.3, 0.9, 1.4, rng.pick(style.roofs));
    foot.position.x = side * r * 0.45;
    group.add(foot);
  }
  const lantern = ball(ctx, 0.55, a2, 8);
  lantern.position.y = centre + r * 0.35;
  group.add(lantern);
  group.add(ctx.strut(new THREE.Vector3(0, centre + r * 0.35 + 0.4, 0), new THREE.Vector3(0, centre + r - 0.25, 0), 0.08, a1));
  return { group, radius: r + 0.4 };
};

/**
 * The middle of every town: the Orrery. A needle with the planet on it at
 * half height and its rings round it, tipped at the tilt, the B ring wide and
 * the A ring outside a gap where the Cassini Division is; and two halos higher
 * up the needle, for the moons. Every Drifter town is built round a model of
 * the thing it stands on. Six and a half units of footprint before its plot's
 * scale.
 */
const orrery: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const roof = rng.pick(style.roofs);
  group.add(ctx.column(5, 1, roof, 12));
  const step = ctx.column(3.6, 0.8, rng.pick(style.walls), 12);
  step.position.y = 1;
  group.add(step);
  const tall = rng.range(26, 32) * style.height;
  const needle = ctx.taper(0.85, 0.12, tall, rng.pick(style.walls), 8);
  needle.position.y = 1.8;
  group.add(needle);
  const middle = 1.8 + tall * 0.45;
  const globe = ball(ctx, 2.6, PALETTE.sand, 14);
  globe.scale.y = 0.9;
  globe.position.y = middle;
  group.add(globe);
  const belt = hoop(ctx, 2.45, 2.7, 0.5, PALETTE.gold, 14);
  belt.position.y = middle;
  group.add(belt);
  const tipped = new THREE.Group();
  tipped.position.y = middle;
  tipped.rotation.y = rng.range(0, Math.PI);
  const rings = new THREE.Group();
  rings.rotation.z = TILT;
  rings.add(hoop(ctx, 3.2, 3.8, 0.25, PALETTE.bone, 24));
  rings.add(hoop(ctx, 3.8, 5.2, 0.35, PALETTE.cream, 28));
  rings.add(hoop(ctx, 5.45, 6.2, 0.3, PALETTE.sand, 30));
  tipped.add(rings);
  group.add(tipped);
  const accent = rng.pick(style.accents);
  for (const [k, t] of [0.72, 0.86].entries()) {
    const r = 2.2 - k * 0.7;
    const moon = hoop(ctx, r * 0.6, r, 0.35, accent, 12);
    moon.position.y = 1.8 + tall * t;
    group.add(moon);
  }
  const tip = ball(ctx, 0.55, accent, 8);
  tip.position.y = 1.8 + tall + 0.3;
  group.add(tip);
  return { group, radius: 6.4 };
};

export const DRIFTER_BUILDINGS: Readonly<Record<string, BuildingBuilder>> = {
  halo,
  gyre,
  garden,
  hall,
  gate,
  orrery,
};
