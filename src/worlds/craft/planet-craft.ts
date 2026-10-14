/** The planets' own vehicles: Mercury's shade rover, Venus's crawler and aerostat. */

import * as THREE from 'three';
import type { VehicleSpec } from '../contract.ts';
import { HERO } from '../../craft/body.ts';
import { BALLOON_CLIMB, BALLOON_SPEED } from '../../vehicles.ts';
import { PALETTE } from '../../theme.ts';
import { AVATAR_HEIGHT } from '../../stature.ts';
import { ball, dome } from '../architecture.ts';
import { aerostat, rover } from './built-models.ts';
import { AT_THE_WHEEL, driverPlace, glassDome } from './driver.ts';


/**
 * Mercury's rover: the kit's long-cabbed rover under a white parasol on four
 * posts, because on the day side the one thing a driver needs more than
 * wheels is shade. Gold foil on the parasol's rim, like everything made there.
 */
export const SUNSHADE_ROVER: VehicleSpec = {
  kind: 'rover',
  name: 'the shade rover',
  // The long rover's cab is raised only over its front, and a seated crown
  // clears it from 10.5 long (`cockpit.ts`).
  kit: { id: 'rover-cab', length: 11, seat: [-0.17, 0.3, 0.17], closed: true, livery: { wall: PALETTE.white, roof: PALETTE.steel, accent: PALETTE.gold } },
  dress(ctx, size) {
    const g = new THREE.Group();
    const top = size.height * 0.62;
    const lift = size.height * 1.02;
    const x = size.width * 0.36;
    const z = size.length * 0.3;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) g.add(ctx.strut(new THREE.Vector3(sx * x, top, sz * z), new THREE.Vector3(sx * x * 0.95, lift, sz * z * 0.95), 0.16, PALETTE.steel));
    }
    const shade = dome(ctx, size.width * 0.62, PALETTE.white, 0.22, 12);
    shade.scale.z = size.length / size.width;
    shade.position.y = lift;
    g.add(shade);
    const foil = ctx.ringWall(size.width * 0.6, size.width * 0.64, 0.22, PALETTE.gold, 16);
    foil.scale.z = size.length / size.width;
    foil.position.y = lift - 0.1;
    g.add(foil);
    return g;
  },
  build(ctx) {
    const base = rover(ctx);
    const g = base.group;
    for (const x of [-1.35, 1.35]) {
      for (const z of [-1.5, 1.5]) g.add(ctx.strut(new THREE.Vector3(x, 2.05, z), new THREE.Vector3(x * 0.95, 5.0, z * 0.95), 0.16, PALETTE.steel));
    }
    const shade = dome(ctx, 3.4, PALETTE.white, 0.22, 12);
    shade.scale.z = 1.25;
    shade.position.y = 5.0;
    g.add(shade);
    const foil = ctx.ringWall(3.25, 3.45, 0.22, PALETTE.gold, 16);
    foil.scale.z = 1.25;
    foil.position.y = 4.9;
    g.add(foil);
    return { group: g, seat: { x: base.seat.x, y: base.seat.y, z: base.seat.z }, radius: base.radius + 0.3, pose: AT_THE_WHEEL };
  },
  handling: { top: 20 },
};

/**
 * Venus's crawler: the kit's long rover in a scorched livery; in code, a low armoured hull on two tracks, a squat domed cab and
 * slit windows, for ground at 464 degrees and ninety atmospheres. Slow, and it
 * does not care what it drives over.
 */
export const CRAWLER: VehicleSpec = {
  kind: 'rover',
  name: 'the crawler',
  // The kit's long rover in the colours of a hull that has been to 464 degrees.
  // A seated crown clears the cab from 10.5 long (`cockpit.ts`).
  kit: { id: 'rover-cab', length: 10.8, seat: [-0.17, 0.3, 0.17], closed: true, livery: { wall: PALETTE.steel, roof: PALETTE.bark, accent: PALETTE.gold } },
  build(ctx) {
    const g = new THREE.Group();
    for (const x of [-1.9, 1.9]) {
      const track = ctx.box(1.1, 1.3, 6.4, PALETTE.bark);
      track.position.set(x, 0, 0);
      g.add(track);
      for (const z of [-2.4, -0.8, 0.8, 2.4]) {
        const wheel = ctx.column(0.55, 1.16, PALETTE.steel, 8);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.62, z);
        g.add(wheel);
      }
    }
    const hull = ctx.taper(2.6, 2.1, 1.4, PALETTE.steel, 6);
    hull.scale.z = 1.4;
    hull.position.y = 1.2;
    g.add(hull);
    const armour = ctx.ringWall(2.4, 2.75, 0.45, PALETTE.clay, 6);
    armour.scale.z = 1.4;
    armour.position.y = 1.35;
    g.add(armour);
    // The cab: the driver on the hull's top at a wheel (`driverPlace`) under
    // a glass dome that clears the seated crown.
    const deck = 2.6;
    const hip = new THREE.Vector3(0, deck + 0.02 * AVATAR_HEIGHT + HERO.drive.sole, -0.5);
    g.add(driverPlace(hip, deck, PALETTE.crimson));
    const collar = ctx.ringWall(1.8, 2.0, 0.25, PALETTE.clay, 12);
    collar.position.set(0, deck, 0.1);
    g.add(collar);
    g.add(glassDome(ctx, 1.95, hip.y + HERO.crown + 0.15 * AVATAR_HEIGHT - deck, deck, 0.1));
    const lamp = ctx.lit(ball(ctx, 0.35, PALETTE.gold, 8));
    lamp.position.set(0, 2.2, 3.05);
    g.add(lamp);
    return { group: g, seat: { x: hip.x, y: hip.y, z: hip.z }, radius: 3.4, pose: AT_THE_WHEEL };
  },
  handling: { top: 13, reverse: 5, accel: 5, turn: 0.9 },
};

/**
 * Venus's aerostat: the engine's balloon in the sulphur colours, slower still,
 * because at fifty kilometres up the air is a soup and the wind is the only
 * engine anybody trusts.
 */
export const VENUS_AEROSTAT: VehicleSpec = {
  kind: 'aerostat',
  name: 'the aerostat',
  build(ctx) {
    // Earth's balloon in its crimson and gold, the sulphur's colours.
    const made = aerostat(ctx, 6);
    return { group: made.group, seat: made.seat, radius: made.radius, stand: true };
  },
  handling: { climb: BALLOON_CLIMB * 0.7, sink: BALLOON_CLIMB * 0.6, top: BALLOON_SPEED * 0.8 },
};
