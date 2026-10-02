/**
 * How the Cinder build: **mirror above, shade below** — invented, and argued
 * from the one physical fact that governs a building on an airless world.
 *
 * With no air, nothing carries heat away by touch; a roof in the sun at 430 C
 * is cooled only by what it reflects and what it radiates. So every made thing
 * here is two layers. The top faces the sun and is a mirror — whitewash and
 * foil, `white` and `gold` — and the underside faces the ground and the black
 * sky and is dark, because a dark surface in shade radiates best. Under that,
 * low and half-sunk, is where somebody lives.
 *
 * - **parasol** — a dwelling drum under a mirrored canopy on one mast: the
 *   house of a family, and the commonest thing in a Cinder town;
 * - **heliostat** — a tilted mirror on a frame, turning the light away from a
 *   long house behind it (and toward the town's furnaces, which nobody
 *   will show a visitor);
 * - **burrow** — a mound inside a berm with radiator fins on its back: the
 *   terminator nomads' house, built to be left;
 * - **screen** — a curved white wall throwing a crescent of shade, with two
 *   domes living in it;
 * - **shade tower** — the landmark of every town: parasols stacked up a mast
 *   like a pagoda, so the square under it is in shade at any hour of the
 *   176-day day.
 *
 * Every builder stands on `y = 0` and returns its footprint, and none of them
 * reaches past 8.4 units, which is what a layout's guess of 8 can hold.
 */

import * as THREE from 'three';
import type { BuildingBuilder } from '../../contract.ts';
import { dome } from '../../architecture.ts';
import { PALETTE } from '../../../theme.ts';

/** A disc of shade: dark underneath, a shallow mirrored cone on top. */
function canopy(ctx: Parameters<BuildingBuilder>[0], radius: number, under: number, mirror: number, sides: number): THREE.Group {
  const group = new THREE.Group();
  const disc = ctx.taper(radius, radius * 0.94, 0.4, under, sides);
  group.add(disc);
  const cone = ctx.taper(radius * 0.92, radius * 0.18, radius * 0.22, mirror, sides);
  cone.position.y = 0.4;
  group.add(cone);
  return group;
}

const parasol: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const r = rng.range(5, 7.4);
  const mast = rng.range(6.5, 8.5) * style.height;
  const sides = rng.pick([8, 10, 12]);
  const wall = rng.pick(style.walls);
  const house = ctx.column(r * 0.5, 2.4, ctx.tone(wall, 0.9), sides);
  group.add(house);
  const lid = dome(ctx, r * 0.5, rng.pick(style.roofs), 0.45, sides);
  lid.position.y = 2.4;
  group.add(lid);
  const door = ctx.box(1.4, 2.1, 0.5, PALETTE.bark);
  door.position.z = r * 0.5 - 0.1;
  group.add(door);
  const pole = ctx.column(0.3, mast, PALETTE.steel, 6);
  group.add(pole);
  const shade = canopy(ctx, r, rng.pick(style.roofs), PALETTE.white, sides);
  shade.position.y = mast;
  group.add(shade);
  // Stays from the mast to the rim, which is the ink that says *umbrella*.
  const stays = rng.between(3, 4);
  for (let k = 0; k < stays; k++) {
    const a = (k / stays) * Math.PI * 2 + 0.4;
    group.add(ctx.strut(new THREE.Vector3(0, mast - 2.6, 0), new THREE.Vector3(Math.cos(a) * r * 0.75, mast + 0.05, Math.sin(a) * r * 0.75), 0.16, PALETTE.steel));
  }
  const finial = ctx.taper(0.35, 0.05, 1.2, rng.pick(style.accents), 5);
  finial.position.y = mast + 0.4 + r * 0.22;
  group.add(finial);
  // A prism's radius is to its faces; its corners are the wall.
  return { group, radius: r / Math.cos(Math.PI / sides) };
};

const heliostat: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const wall = rng.pick(style.walls);
  const length = rng.range(5, 6.4);
  const house = ctx.box(length, 2.6, 4, wall);
  house.position.z = 1.2;
  group.add(house);
  const roof = ctx.roof(length + 0.6, 4.6, 1.1, length * 0.6, rng.pick(style.roofs));
  roof.position.set(0, 2.6, 1.2);
  group.add(roof);
  const door = ctx.box(1.4, 2.1, 0.5, PALETTE.bark);
  door.position.set(0, 0, 3.2);
  group.add(door);
  // The frame, behind the house, and the mirror on it tilted at the sky.
  const pivot = rng.range(6.5, 8) * style.height;
  for (const side of [-1, 1]) {
    const post = ctx.column(0.32, pivot, PALETTE.steel, 6);
    post.position.set(side * (length * 0.5 - 0.3), 0, -2.6);
    group.add(post);
  }
  const tilt = rng.range(0.7, 1.05);
  const mirror = new THREE.Group();
  mirror.position.set(0, pivot, -2.6);
  mirror.rotation.x = -tilt;
  const glass = ctx.box(length + 0.8, 0.3, 4.4, PALETTE.white);
  glass.position.y = 0.12;
  mirror.add(glass);
  const back = ctx.box(length * 0.8, 0.3, 3.6, PALETTE.steel);
  back.position.y = -0.2;
  mirror.add(back);
  group.add(mirror);
  const hub = ctx.column(0.55, 0.6, rng.pick(style.accents), 8);
  hub.position.set(0, pivot - 0.3, -2.6);
  group.add(hub);
  return { group, radius: Math.hypot(length * 0.5 + 0.4, 5) };
};

const burrow: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const r = rng.range(4.2, 6);
  const berm = ctx.ringWall(r * 0.78, r, 1.1, rng.pick(style.roofs), 12);
  group.add(berm);
  const mound = dome(ctx, r * 0.8, rng.pick(style.walls), 0.55, 12);
  group.add(mound);
  const cowl = ctx.box(1.8, 2.2, 2.2, ctx.tone(rng.pick(style.walls), 0.85));
  cowl.position.z = r * 0.62;
  group.add(cowl);
  const hood = ctx.box(2.3, 0.3, 2.6, PALETTE.white);
  hood.position.set(0, 2.2, r * 0.62);
  group.add(hood);
  // Radiator fins on the mound's back, edge-on to the sun and broadside to
  // the sky: the Cinder's frill, built.
  const fins = rng.between(3, 4);
  for (let k = 0; k < fins; k++) {
    const fin = ctx.box(0.22, 1.6, 2.6, PALETTE.steel);
    fin.position.set((k - (fins - 1) / 2) * 0.9, r * 0.8 * 0.55 - 0.5, -r * 0.2);
    group.add(fin);
  }
  return { group, radius: r * 1.04 };
};

const screen: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const arc = rng.range(5.2, 6.2);
  const tall = rng.range(7, 10) * style.height;
  const panels = 5;
  const spread = rng.range(0.85, 1.05);
  for (let k = 0; k < panels; k++) {
    const a = ((k / (panels - 1)) * 2 - 1) * spread;
    const panel = ctx.box(arc * spread * 0.5, tall * (k % 2 === 0 ? 1 : 0.9), 0.6, k % 2 === 0 ? PALETTE.white : PALETTE.cream);
    panel.position.set(Math.sin(a) * arc, 0, -Math.cos(a) * arc);
    panel.rotation.y = -a;
    group.add(panel);
    const brace = ctx.strut(
      new THREE.Vector3(Math.sin(a) * (arc + 2), 0, -Math.cos(a) * (arc + 2)),
      new THREE.Vector3(Math.sin(a) * (arc + 0.3), tall * 0.7, -Math.cos(a) * (arc + 0.3)),
      0.3,
      PALETTE.steel,
    );
    group.add(brace);
  }
  for (const side of [-1, 1]) {
    const r = rng.range(1.8, 2.4);
    const hut = dome(ctx, r, rng.pick(style.walls), 0.8, 10);
    hut.position.set(side * 2.3, 0, -1.6);
    group.add(hut);
    const rim = ctx.ringWall(r * 0.98, r * 1.08, 0.4, rng.pick(style.accents), 10);
    rim.position.set(side * 2.3, 0, -1.6);
    group.add(rim);
  }
  return { group, radius: arc + 2.1 };
};

const shadeTower: BuildingBuilder = (ctx, rng, style) => {
  const group = new THREE.Group();
  const sides = 8;
  const plinth = ctx.taper(7, 6.2, 1.2, rng.pick(style.roofs), sides);
  group.add(plinth);
  const height = rng.range(20, 24) * style.height;
  const core = ctx.taper(1.8, 1.1, height, rng.pick(style.walls), sides);
  core.position.y = 1.2;
  group.add(core);
  const tiers = 4;
  const under = rng.pick(style.roofs);
  for (let k = 0; k < tiers; k++) {
    const t = (k + 1) / (tiers + 0.6);
    const shade = canopy(ctx, 6.6 - k * 1.15, under, k % 2 === 0 ? PALETTE.white : PALETTE.gold, sides * 2);
    shade.position.y = 1.2 + height * t;
    group.add(shade);
  }
  const lamp = ctx.column(0.7, 1.4, rng.pick(style.accents), 6);
  lamp.position.y = 1.2 + height;
  group.add(lamp);
  const needle = ctx.taper(0.35, 0.04, 4, PALETTE.gold, 5);
  needle.position.y = 2.6 + height;
  group.add(needle);
  // Benches round the foot, in the shade the tower throws: the square is a
  // place to sit.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const bench = ctx.box(2.2, 0.7, 0.8, PALETTE.steel);
    bench.position.set(Math.cos(a) * 4.6, 1.2, Math.sin(a) * 4.6);
    bench.rotation.y = -a + Math.PI / 2;
    group.add(bench);
  }
  return { group, radius: 7 / Math.cos(Math.PI / sides) };
};

export const CINDER_BUILDINGS: Readonly<Record<string, BuildingBuilder>> = {
  parasol,
  heliostat,
  burrow,
  screen,
  'shade-tower': shadeTower,
};
