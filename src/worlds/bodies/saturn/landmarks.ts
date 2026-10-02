/**
 * Saturn's landmarks: four places worth crossing the cloud for.
 *
 * One marks a real event at the coordinates it happened at, the way Mars's
 * Viking memorial does; the other three stand on real features where the
 * deck's own relief (`deckRelief` in the system file) puts them — a corner of
 * the Hexagon's wall, the bottom of the Rose's eye, the top of the Dragon
 * Storm. What the Drifters built at each is invented; where it stands is not.
 */

import * as THREE from 'three';
import { PALETTE } from '../../../theme.ts';
import type { Landmark } from '../../contract.ts';
import { ball, dome } from '../../architecture.ts';
import { DRAGON_STORM, HEXAGON, HEXAGON_CORNER_LAT } from '../../../system/bodies/saturn.ts';
import { TILT, hoop } from './buildings.ts';

/**
 * Cassini, where its last signal came from: 9.4 N, 53 W, at 11:55 UTC on
 * 15 September 2017, after thirteen years in orbit and twenty-two dives
 * between the planet and its rings. It was sent in on purpose, so that it
 * could never fall on Enceladus or Titan and carry Earth's microbes to an
 * ocean that might have its own.
 *
 * The Drifters' replica, about three times its size: the tall body on a
 * mount, the high-gain dish on top opening to the sky, the gold Huygens probe
 * on its side (Huygens itself went down on Titan in 2005), the three power
 * units, the long magnetometer boom; round the plinth thirteen gold posts,
 * one a year; and over it a halo held on three cables, which is how a Drifter
 * marks a place where someone came down and stayed.
 */
const CASSINI: Landmark = {
  id: 'cassini',
  name: "Cassini's Rest",
  lat: 9.4,
  lon: -53,
  radius: 20,
  build(ctx) {
    const group = new THREE.Group();
    group.add(ctx.column(9, 1.2, PALETTE.bone, 14));
    for (let k = 0; k < 13; k++) {
      const a = (k / 13) * Math.PI * 2;
      const post = ctx.column(0.35, 1.6, PALETTE.gold, 5);
      post.position.set(Math.cos(a) * 7.8, 1.2, Math.sin(a) * 7.8);
      group.add(post);
    }
    // The mount: three legs up to the foot of the stack.
    const foot = 4.4;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      group.add(ctx.strut(new THREE.Vector3(Math.cos(a) * 3.6, 1.2, Math.sin(a) * 3.6), new THREE.Vector3(Math.cos(a) * 1.1, foot, Math.sin(a) * 1.1), 0.35, PALETTE.steel));
    }
    // The engines under the stack, and the stack.
    for (const side of [-1, 1]) {
      const bell = ctx.taper(0.7, 0.3, 1.4, PALETTE.bark, 8);
      bell.rotation.x = Math.PI;
      bell.position.set(side * 0.7, foot + 0.4, 0);
      group.add(bell);
    }
    const stack = ctx.column(1.7, 7.2, PALETTE.steel, 10);
    stack.position.y = foot;
    group.add(stack);
    const blanket = ctx.column(1.75, 2.4, PALETTE.gold, 10);
    blanket.position.y = foot + 1.2;
    group.add(blanket);
    const top = foot + 7.2;
    // The dish, opening upward: a shallow cap turned over.
    const dish = dome(ctx, 4, PALETTE.white, 0.28, 18);
    dish.rotation.x = Math.PI;
    dish.position.y = top + 1.4;
    group.add(dish);
    const feed = ctx.column(0.25, 1.4, PALETTE.bone, 6);
    feed.position.y = top + 0.3;
    group.add(feed);
    // Huygens, on the side, its heat shield facing out.
    const huygens = dome(ctx, 1.3, PALETTE.gold, 0.45, 12);
    huygens.rotation.z = -Math.PI / 2;
    huygens.position.set(1.7, foot + 4.2, 0);
    group.add(huygens);
    // The three power units, black and finned, on short arms.
    for (const [k, a] of [2.2, 3.4, 4.4].entries()) {
      const from = new THREE.Vector3(Math.cos(a) * 1.5, foot + 1.2 + k * 0.4, Math.sin(a) * 1.5);
      const to = new THREE.Vector3(Math.cos(a) * 3.0, foot + 0.6 + k * 0.4, Math.sin(a) * 3.0);
      group.add(ctx.strut(from, to, 0.55, PALETTE.ink));
    }
    // The magnetometer boom, eleven metres in life, out the other side.
    group.add(ctx.strut(new THREE.Vector3(-1.5, top - 0.6, 0), new THREE.Vector3(-8.6, top + 0.6, 1.2), 0.18, PALETTE.steel));
    // The halo over it.
    const ringY = top + 8;
    const ring = hoop(ctx, 6.2, 7.2, 0.5, PALETTE.gold, 32);
    ring.position.y = ringY;
    group.add(ring);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      group.add(ctx.strut(new THREE.Vector3(Math.cos(a) * 8.6, 1.2, Math.sin(a) * 8.6), new THREE.Vector3(Math.cos(a) * 6.7, ringY, Math.sin(a) * 6.7), 0.14, PALETTE.white));
    }
    return group;
  },
};

/**
 * The Sixth Corner Beacon, on the crest of the Hexagon's wall where two of
 * its sides meet (the first corner is at longitude 0 by the system file's
 * snapshot). A six-sided tower banded in sky blue, a lantern, and a flat
 * hexagonal halo at the top — the one ring a Drifter will build with corners,
 * and only here.
 */
const SIXTH_CORNER: Landmark = {
  id: 'sixth-corner',
  name: 'Sixth Corner Beacon',
  lat: HEXAGON_CORNER_LAT,
  lon: HEXAGON.corner,
  radius: 16,
  build(ctx) {
    const group = new THREE.Group();
    group.add(ctx.taper(7, 6, 1.4, PALETTE.slate, 6));
    const tall = 30;
    const tower = ctx.taper(4, 1.8, tall, PALETTE.bone, 6);
    tower.position.y = 1.4;
    group.add(tower);
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      const r = 4 - t * 2.2;
      const band = ctx.ringWall(r * 0.92, r + 0.7, 0.9, PALETTE.skyBlue, 6);
      band.position.y = 1.4 + tall * t;
      group.add(band);
    }
    const lantern = ball(ctx, 1.6, PALETTE.gold, 10);
    lantern.position.y = 1.4 + tall + 1.4;
    group.add(lantern);
    const crown = hoop(ctx, 4.6, 5.6, 0.5, PALETTE.skyBlue, 6);
    crown.position.y = 1.4 + tall + 4;
    group.add(crown);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      group.add(ctx.strut(new THREE.Vector3(Math.cos(a) * 1.8, 1.4 + tall - 0.4, Math.sin(a) * 1.8), new THREE.Vector3(Math.cos(a) * 5.1, 1.4 + tall + 3.9, Math.sin(a) * 5.1), 0.14, PALETTE.white));
    }
    return group;
  },
};

/**
 * The Pole Halo, at the bottom of the Rose's eye on the north pole itself.
 * A ring thirty-four units across held over the eye on six masts, the
 * planet's own tilt kept by a smaller ring inside it, and a white post at the
 * exact pole — the one place on Saturn that does not go round.
 */
const POLE_HALO: Landmark = {
  id: 'pole-halo',
  name: 'The Pole Halo',
  lat: 90,
  lon: 0,
  radius: 22,
  build(ctx) {
    const group = new THREE.Group();
    group.add(ctx.column(3, 0.6, PALETTE.bone, 12));
    const post = ctx.column(0.7, 7, PALETTE.white, 8);
    post.position.y = 0.6;
    group.add(post);
    const knob = ball(ctx, 1, PALETTE.pink, 10);
    knob.position.y = 8;
    group.add(knob);
    const high = 18;
    const ring = hoop(ctx, 15.5, 17, 1.1, PALETTE.gold, 36);
    ring.position.y = high;
    group.add(ring);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const mast = ctx.taper(0.6, 0.3, high + 1, PALETTE.slate, 6);
      mast.position.set(Math.cos(a) * 16.2, 0, Math.sin(a) * 16.2);
      group.add(mast);
    }
    const tipped = new THREE.Group();
    tipped.position.y = high;
    const inner = hoop(ctx, 9, 10, 0.7, PALETTE.pink, 30);
    inner.rotation.z = TILT;
    tipped.add(inner);
    group.add(tipped);
    for (const side of [-1, 1]) {
      // The inner ring hangs from the outer by two cables at its high and low sides.
      const at = new THREE.Vector3(side * 9.5 * Math.cos(TILT), high + side * 9.5 * Math.sin(TILT), 0);
      group.add(ctx.strut(at, new THREE.Vector3(side * 16.2, high, 0), 0.14, PALETTE.white));
    }
    return group;
  },
};

/**
 * The Dragon's Harp, on the top of the Dragon Storm of 2004 in Storm Alley,
 * whose lightning was ten thousand times an Earth storm's and heard on
 * Cassini's radio as crackle. Two masts and a bar strung with nine gold rods:
 * the Drifters say the storm plays it, and when the lightning walks the alley
 * it does.
 */
const DRAGON_HARP: Landmark = {
  id: 'dragon-harp',
  name: "The Dragon's Harp",
  lat: DRAGON_STORM.lat,
  lon: DRAGON_STORM.lon,
  radius: 16,
  build(ctx) {
    const group = new THREE.Group();
    group.add(ctx.box(22, 1, 6, PALETTE.slate));
    const tall = 22;
    for (const side of [-1, 1]) {
      const mast = ctx.taper(1.2, 0.6, tall, PALETTE.steel, 6);
      mast.position.set(side * 9.5, 1, 0);
      group.add(mast);
      const cap = ball(ctx, 1.1, PALETTE.gold, 8);
      cap.position.set(side * 9.5, tall + 1.6, 0);
      group.add(cap);
    }
    const bar = ctx.box(20, 1, 1, PALETTE.steel);
    bar.position.y = tall;
    group.add(bar);
    for (let k = 0; k < 9; k++) {
      const x = -8 + k * 2;
      const length = tall - 2 - Math.abs(k - 4) * 1.6;
      group.add(ctx.strut(new THREE.Vector3(x, tall, 0), new THREE.Vector3(x, tall - length, 0), 0.2, PALETTE.gold));
      const rod = ctx.taper(0.18, 0.04, 2.2 + (k % 3), PALETTE.white, 4);
      rod.position.set(x, tall + 1, 0);
      group.add(rod);
    }
    const halo = hoop(ctx, 3, 3.7, 0.4, PALETTE.violet, 20);
    halo.position.y = tall + 6;
    halo.rotation.x = Math.PI / 2;
    group.add(halo);
    group.add(ctx.strut(new THREE.Vector3(0, tall + 0.5, 0), new THREE.Vector3(0, tall + 2.3, 0), 0.2, PALETTE.violet));
    return group;
  },
};

export const LANDMARKS: readonly Landmark[] = [CASSINI, SIXTH_CORNER, POLE_HALO, DRAGON_HARP];
