/**
 * Jupiter's landmarks: three places worth crossing the cloud for.
 *
 * Two of them mark real events at the coordinates they happened at, the way
 * Mars's Viking memorial does; the third is a lookout on the Great Red Spot's
 * wall, where the storm's own relief (`stormRelief` in the system file) puts
 * the crest. What the Floaters built at each is invented; where it stands is
 * not.
 */

import * as THREE from 'three';
import { PALETTE } from '../../../theme.ts';
import type { Landmark } from '../../contract.ts';
import { ball, dome } from '../../architecture.ts';
import { WALL_AT } from '../../../system/bodies/jupiter.ts';
import { bag, wheel } from './buildings.ts';

/**
 * The Galileo probe, where it went in on 7 December 1995: 6.5 N, 4.4 W.
 *
 * It came in at 47 km/s behind a heat shield that lost most of its own mass
 * on the way down, opened its parachute, and talked to the orbiter for 58
 * minutes until the pressure reached 23 bar, and then it was crushed and
 * melted somewhere below. By bad luck — or the only luck there is for a thing
 * that has to fall somewhere — it went into a hot spot, one of the clear dry
 * holes along the North Equatorial Belt's edge, which is why it found so much
 * less water than anyone expected. The memorial stands at the bottom of that
 * hole (the system file puts a hot spot exactly here).
 *
 * The Floaters' replica, at about three times the size: the blunt heat shield
 * nose down on a pedestal, the descent module on it, and the parachute held
 * over it on its shroud lines — and two small bags tethered either side, which
 * is how anything is held up here.
 */
const GALILEO: Landmark = {
  id: 'galileo-probe',
  name: 'Galileo Probe Memorial',
  lat: 6.5,
  lon: -4.4,
  radius: 18,
  build(ctx) {
    const group = new THREE.Group();
    const plinth = ctx.column(7, 1, PALETTE.bone, 10);
    group.add(plinth);
    const step = ctx.column(4.2, 1.6, PALETTE.tan, 10);
    step.position.y = 1;
    group.add(step);
    // The heat shield, blunt end down: a cone wider at the foot.
    const shield = ctx.taper(3.6, 1.6, 2, PALETTE.bark, 12);
    shield.position.y = 2.6;
    group.add(shield);
    const module = ctx.column(1.6, 1.8, PALETTE.steel, 10);
    module.position.y = 4.6;
    group.add(module);
    const cap = dome(ctx, 1.6, PALETTE.gold, 0.6, 10);
    cap.position.y = 6.4;
    group.add(cap);
    // The parachute, and its lines from the module's shoulder to the skirt.
    const canopyY = 13;
    const canopy = dome(ctx, 5, PALETTE.orange, 0.45, 12);
    canopy.position.y = canopyY;
    group.add(canopy);
    const skirt = ctx.ringWall(4.6, 5.1, 0.35, PALETTE.white, 12);
    skirt.position.y = canopyY - 0.1;
    group.add(skirt);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      group.add(ctx.strut(new THREE.Vector3(Math.cos(a) * 1.2, 6.6, Math.sin(a) * 1.2), new THREE.Vector3(Math.cos(a) * 4.8, canopyY, Math.sin(a) * 4.8), 0.1, PALETTE.white));
    }
    for (const side of [-1, 1]) {
      const holder = bag(ctx, 2.2, PALETTE.violet, 0.85, 10);
      holder.position.set(side * 7.5, 17, 0);
      group.add(holder);
      group.add(ctx.strut(new THREE.Vector3(side * 7.5, 15.2, 0), new THREE.Vector3(side * 4.9, canopyY + 0.2, 0), 0.1, PALETTE.white));
      const anchor = ctx.column(0.7, 1.2, PALETTE.bark, 6);
      anchor.position.set(side * 6.3, 1, 0);
      group.add(anchor);
      group.add(ctx.strut(new THREE.Vector3(side * 6.3, 2, 0), new THREE.Vector3(side * 7.5, 15.2, 0), 0.08, PALETTE.white));
    }
    // Fifty-eight minutes of signal: a ring of fifty-eight notches would be
    // fifty-eight meshes, so it is one ring and the number is in the name.
    const ring = ctx.ringWall(6.4, 7.2, 1.25, PALETTE.gold, 29);
    group.add(ring);
    return group;
  },
};

/**
 * Spot Watch: a lookout on the crest of the Great Red Spot's wall, due north
 * of the eye, where the storm's collar of wind runs at 150 m/s and its cloud
 * stands highest. From the top you look south across the spiral arms to
 * Calm, the capital in the eye, and north back down to Hollow.
 *
 * A tripod of masts leaning in to a platform ring, a wind wheel for its
 * power, a long glass trained on the eye, and a red bag over all of it —
 * which every Floater reads as "the Spot is this way".
 */
const SPOT_WATCH: Landmark = {
  id: 'spot-watch',
  name: 'Spot Watch',
  lat: -22.4 + WALL_AT * 4.9,
  lon: -60,
  radius: 20,
  build(ctx) {
    const group = new THREE.Group();
    const deck = 15;
    const feet = 8;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      const foot = new THREE.Vector3(Math.cos(a) * feet, 0, Math.sin(a) * feet);
      group.add(ctx.strut(foot, new THREE.Vector3(Math.cos(a) * 2.4, deck, Math.sin(a) * 2.4), 0.55, PALETTE.bark));
      const shoe = ctx.column(1.1, 0.8, PALETTE.steel, 6);
      shoe.position.copy(foot);
      group.add(shoe);
    }
    const floor = ctx.column(4.2, 0.6, PALETTE.tan, 12);
    floor.position.y = deck;
    group.add(floor);
    const rail = ctx.ringWall(3.9, 4.3, 1.1, PALETTE.cream, 12);
    rail.position.y = deck + 0.6;
    group.add(rail);
    // The glass, trained south (the town frame's -z) and a little down.
    const glass = new THREE.Group();
    glass.position.set(0, deck + 2.2, 0);
    glass.rotation.x = -Math.PI / 2 - 0.12;
    const tube = ctx.taper(0.9, 0.6, 7, PALETTE.steel, 8);
    glass.add(tube);
    const lens = ctx.column(1.05, 0.5, PALETTE.gold, 8);
    lens.position.y = 7;
    glass.add(lens);
    group.add(glass);
    const post = ctx.column(0.4, 2.2, PALETTE.steel, 6);
    post.position.y = deck + 0.6;
    group.add(post);
    // A wind wheel for the lamps, on the north side.
    const mount = new THREE.Group();
    mount.position.set(0, deck + 0.6, 3.2);
    wheel(ctx, mount, 2.8, 3.6, 6, PALETTE.crimson, PALETTE.cream, 0.2);
    group.add(mount);
    const red = bag(ctx, 4.6, PALETTE.red, 0.8, 14);
    red.position.y = deck + 13;
    group.add(red);
    const seam = ctx.ringWall(4.5, 4.85, 0.5, PALETTE.gold, 14);
    seam.position.y = deck + 12.8;
    group.add(seam);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      group.add(ctx.strut(new THREE.Vector3(Math.cos(a) * 3.6, deck + 1.6, Math.sin(a) * 3.6), new THREE.Vector3(Math.cos(a) * 2.8, deck + 10.2, Math.sin(a) * 2.8), 0.12, PALETTE.bark));
    }
    return group;
  },
};

/**
 * Fragment G, where the brightest piece of Comet Shoemaker–Levy 9 came down
 * on 18 July 1994, near 44 S, 26 W: twenty-one fragments in a line struck the
 * planet over six days, each leaving a dark scar bigger than Earth that the
 * winds took months to smear away. It was the first collision between two
 * bodies of the solar system anyone had ever watched.
 *
 * The Floaters keep the scar as dark rings on a platform and the comet as it
 * was seen arriving — the other string of pearls — twenty-one beads on stalks
 * in a curving line, the largest in the middle where G was.
 */
const FRAGMENT_G: Landmark = {
  id: 'fragment-g',
  name: 'Fragment G Scar',
  lat: -44,
  lon: -26,
  radius: 22,
  build(ctx) {
    const group = new THREE.Group();
    const scars = [PALETTE.bark, PALETTE.brown, PALETTE.bark];
    scars.forEach((colour, k) => {
      const inner = 4 + k * 4.5;
      const ring = ctx.ringWall(inner, inner + 2.2, 0.5 + (2 - k) * 0.35, colour, 18);
      group.add(ring);
    });
    const core = dome(ctx, 3.4, PALETTE.ink, 0.5, 12);
    group.add(core);
    for (let k = 0; k < 21; k++) {
      const t = k / 20;
      const a = -1.1 + t * 2.2;
      const x = Math.sin(a) * 16;
      const z = Math.cos(a) * 16 - 10;
      // G is the seventh letter, and the fragments were lettered A to W
      // without I and O; its bead is the seventh and the largest.
      const r = k === 6 ? 1.6 : 0.55 + 0.45 * Math.sin(t * Math.PI);
      const stalk = 2 + Math.sin(t * Math.PI) * 4;
      group.add(ctx.strut(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, stalk, z), 0.1, PALETTE.steel));
      const bead = ball(ctx, r, k === 6 ? PALETTE.gold : PALETTE.white, 8);
      bead.position.set(x, stalk + r, z);
      group.add(bead);
    }
    return group;
  },
};

export const LANDMARKS: readonly Landmark[] = [GALILEO, SPOT_WATCH, FRAGMENT_G];
