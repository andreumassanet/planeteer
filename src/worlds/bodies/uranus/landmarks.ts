/**
 * Uranus's landmarks: four places worth crossing the haze for.
 *
 * Each honours something true — the man who found the planet, the one
 * machine that has visited it, the diamonds thought to fall inside it, and
 * the Sun's strange path round its pole — and stands where the deck's own
 * story puts it (`deckRelief` in the system file). What the Sidelings built
 * at each is invented; what it remembers is not.
 */

import * as THREE from 'three';
import { PALETTE } from '../../../theme.ts';
import type { Landmark } from '../../contract.ts';
import { ball, dome } from '../../architecture.ts';
import { crystal, diamond } from './buildings.ts';

/**
 * Herschel's Glass, on the rim of the hood a short walk north of Longlight.
 *
 * William Herschel found Uranus on 13 March 1781 from the garden of his house
 * in Bath, with a seven-foot reflector whose mirror he had ground and
 * polished himself, and took it at first for a comet. He wanted to call it
 * *Georgium Sidus*, George's Star, after his king; the rest of astronomy
 * would not have it. It was the first planet found that nobody in antiquity
 * had known.
 *
 * The Sidelings' monument is that telescope three times over, in brass and
 * wood on its A-frame stand, its tube aimed up the sky at about where the Sun
 * stands at noon, ringed by thirteen crystals for the thirteenth of March.
 */
const HERSCHEL: Landmark = {
  id: 'herschel-glass',
  name: "Herschel's Glass",
  lat: 53.5,
  lon: 35,
  radius: 24,
  build(ctx) {
    const group = new THREE.Group();
    const floor = ctx.column(13, 0.8, PALETTE.bone, 16);
    group.add(floor);
    const step = ctx.column(9, 0.8, PALETTE.slate, 16);
    step.position.y = 0.8;
    group.add(step);
    const top = 1.6;
    // The stand: two A-frames of timber either side of the tube, with a
    // crossbar between their heads that the tube rocks on.
    const pivot = new THREE.Vector3(0, top + 9.5, 0);
    for (const side of [-1, 1]) {
      const head = new THREE.Vector3(side * 2.4, pivot.y, 0);
      group.add(ctx.strut(new THREE.Vector3(side * 3.6, top, -4.2), head, 0.5, PALETTE.bark));
      group.add(ctx.strut(new THREE.Vector3(side * 3.6, top, 4.2), head, 0.5, PALETTE.bark));
      group.add(ctx.strut(new THREE.Vector3(side * 3.4, top + 3.2, -3.0), new THREE.Vector3(side * 3.4, top + 3.2, 3.0), 0.3, PALETTE.bark));
    }
    group.add(ctx.strut(new THREE.Vector3(-2.6, pivot.y, 0), new THREE.Vector3(2.6, pivot.y, 0), 0.4, PALETTE.steel));
    // The tube, its foot (the mirror end) low and behind, its mouth up and
    // ahead: a group turned about `x`, so the tube's own `+y` leans toward +z.
    const tube = new THREE.Group();
    tube.position.copy(pivot);
    tube.rotation.x = 0.62;
    const barrel = ctx.column(1.5, 15, PALETTE.gold, 10);
    barrel.position.y = -6;
    tube.add(barrel);
    const mirror = ctx.column(1.8, 1.2, PALETTE.bark, 10);
    mirror.position.y = -7;
    tube.add(mirror);
    const mouth = ctx.ringWall(1.3, 1.85, 0.8, PALETTE.bark, 10);
    mouth.position.y = 8.6;
    tube.add(mouth);
    // The eyepiece, on the side near the mouth, where Herschel stood.
    const eyepiece = ctx.column(0.35, 1.4, PALETTE.steel, 6);
    eyepiece.rotation.z = Math.PI / 2;
    eyepiece.position.set(1.5, 7.4, 0);
    tube.add(eyepiece);
    group.add(tube);
    // The ladder an observer climbs, against the stand.
    group.add(ctx.strut(new THREE.Vector3(5.6, top, 3.4), new THREE.Vector3(2.8, top + 8.5, 1.2), 0.25, PALETTE.tan));
    // Thirteen crystals in a ring: the thirteenth of March, 1781.
    for (let k = 0; k < 13; k++) {
      const a = (k / 13) * Math.PI * 2;
      const shard = new THREE.Group();
      shard.position.set(Math.cos(a) * 11.4, 0.8, Math.sin(a) * 11.4);
      crystal(ctx, shard, 0, 0, 0.7, 2 + (k % 3) * 1.2, k === 0 ? PALETTE.gold : PALETTE.white);
      group.add(shard);
    }
    return group;
  },
};

/**
 * The Pole Dial, at the north pole itself.
 *
 * At a pole of Uranus the Sun neither rises nor sets through a whole season:
 * in the 2020s it hangs some sixty degrees up the sky and simply goes round,
 * once every 17 hours 14 minutes, at the same height. So the shadow of a
 * gnomon here does not swing across a dial like a garden sundial's — it
 * sweeps the whole circle, evenly, at one length, and the only thing that
 * changes it is the season, over decades. The Sidelings built the dial
 * anyway, because a people who wait should know how long they have waited.
 *
 * A frost spire for the gnomon, a dial floor round it, and seventeen hour
 * stones outside the wall, one for each hour of the turn.
 */
const POLE_DIAL: Landmark = {
  id: 'pole-dial',
  name: 'The Pole Dial',
  lat: 89.6,
  lon: 0,
  radius: 18,
  build(ctx) {
    const group = new THREE.Group();
    const floor = ctx.column(10.6, 0.6, PALETTE.white, 24);
    group.add(floor);
    const inlay = ctx.ringWall(7.4, 8.4, 0.7, PALETTE.gold, 24);
    group.add(inlay);
    // The gnomon: three tapering prisms and a point, 34 units high.
    let y = 0.6;
    let width = 2.6;
    for (let k = 0; k < 3; k++) {
      const h = 9;
      const narrow = width * 0.72;
      const shaft = ctx.taper(width, narrow, h, k % 2 === 0 ? PALETTE.bone : PALETTE.white, 3);
      shaft.position.y = y;
      group.add(shaft);
      y += h;
      const collar = ctx.ringWall(narrow * 0.9, narrow * 1.5, 0.5, PALETTE.skyBlue, 6);
      collar.position.y = y - 0.25;
      group.add(collar);
      width = narrow;
    }
    const point = ctx.taper(width, 0.05, 6, PALETTE.gold, 3);
    point.position.y = y;
    group.add(point);
    // Seventeen hour stones round the outside, the first in gold.
    for (let k = 0; k < 17; k++) {
      const a = (k / 17) * Math.PI * 2;
      const stone = new THREE.Group();
      stone.position.set(Math.cos(a) * 13.2, 0, Math.sin(a) * 13.2);
      crystal(ctx, stone, 0, 0, 0.6, k % 4 === 0 ? 2.6 : 1.4, k === 0 ? PALETTE.gold : PALETTE.bone);
      group.add(stone);
    }
    return group;
  },
};

/**
 * The Diamond Well, on the equator a walk east of Gloaming, in the Long Dusk.
 *
 * Thousands of kilometres under the deck, the pressure is thought to strip the
 * hydrogen off methane and squeeze the carbon left into diamond, which sinks
 * through the hot slush of the mantle like hail. It has been made to happen
 * for a split second in a laboratory (with lasers, at SLAC, in 2017), and
 * nobody has seen it here. The Sidelings say they hear it.
 *
 * A well-head with nothing under it but the haze, a tripod of crystal struts
 * over it, and three diamonds hung from the tripod, the lowest the size of a
 * person — which in the equator's low sun throw long glints across the deck.
 */
const DIAMOND_WELL: Landmark = {
  id: 'diamond-well',
  name: 'The Diamond Well',
  lat: 1.2,
  lon: 61.6,
  radius: 18,
  build(ctx) {
    const group = new THREE.Group();
    const curb = ctx.ringWall(5.2, 7.6, 1.6, PALETTE.bone, 18);
    group.add(curb);
    const lip = ctx.ringWall(5.0, 7.9, 0.4, PALETTE.gold, 18);
    lip.position.y = 1.6;
    group.add(lip);
    const deep = ctx.column(5.2, 0.4, PALETTE.ink, 18);
    deep.position.y = 0.6;
    group.add(deep);
    const apex = new THREE.Vector3(0, 19, 0);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      const foot = new THREE.Vector3(Math.cos(a) * 9.2, 0, Math.sin(a) * 9.2);
      group.add(ctx.strut(foot, apex, 0.55, PALETTE.white));
      crystal(ctx, group, foot.x, foot.z, 1.2, 2.4, PALETTE.skyBlue);
    }
    const knot = ball(ctx, 1, PALETTE.gold, 8);
    knot.position.copy(apex);
    group.add(knot);
    // Three diamonds on one line, the biggest lowest.
    const sizes = [0.9, 1.4, 2.1];
    let hang = apex.y - 1;
    for (const size of sizes) {
      hang -= size * 1.3 + 0.9;
      const stone = diamond(ctx, size, PALETTE.white);
      stone.position.y = hang;
      stone.rotation.y = size;
      group.add(stone);
      hang -= size * 1.3;
    }
    group.add(ctx.strut(new THREE.Vector3(0, apex.y - 1, 0), new THREE.Vector3(0, hang + 2.1 * 1.15, 0), 0.08, PALETTE.gold));
    return group;
  },
};

/**
 * The Voyager Beacon, on the south collar beside the town named for it.
 *
 * Voyager 2 is the only thing from Earth that has ever been to Uranus. It
 * passed on 24 January 1986, 81,500 km from the cloud tops, with the south
 * pole turned toward the Sun, and in the weeks round that day found ten new
 * moons, two new rings, a magnetic field tipped 59 degrees off the spin axis,
 * and a planet that looked, to the dismay of everyone watching, almost
 * perfectly blank. Then it went on to Neptune and did not come back.
 *
 * The collar is in its forty-two-year night now, and the Sidelings of
 * Voyager keep a beacon lit for it there: the probe at about twice its size —
 * ten-sided bus, the big dish, the long magnetometer boom and the power
 * boom — on a plinth, ringed with lanterns.
 */
const VOYAGER: Landmark = {
  id: 'voyager-beacon',
  name: 'The Voyager Beacon',
  lat: -49.4,
  lon: 121.5,
  radius: 20,
  build(ctx) {
    const group = new THREE.Group();
    const plinth = ctx.column(7.5, 1.2, PALETTE.slate, 10);
    group.add(plinth);
    const pier = ctx.taper(3.4, 2.2, 6, PALETTE.bone, 10);
    pier.position.y = 1.2;
    group.add(pier);
    const bus = ctx.column(2.6, 1.6, PALETTE.steel, 10);
    bus.position.y = 7.2;
    group.add(bus);
    // The high-gain dish, 3.7 m across on the real one, open to the sky.
    const dish = dome(ctx, 4.8, PALETTE.white, 0.3, 16);
    dish.rotation.x = Math.PI;
    dish.position.y = 11.6;
    group.add(dish);
    const feed = ctx.strut(new THREE.Vector3(0, 8.8, 0), new THREE.Vector3(0, 12.6, 0), 0.2, PALETTE.steel);
    group.add(feed);
    // The magnetometer boom, thirteen metres on the real one, and its can.
    group.add(ctx.strut(new THREE.Vector3(2.4, 8, 0), new THREE.Vector3(14, 10, 0), 0.14, PALETTE.steel));
    const can = ctx.column(0.35, 0.8, PALETTE.gold, 6);
    can.position.set(14, 9.6, 0);
    group.add(can);
    // The power boom the other way, with the three generator drums on it.
    group.add(ctx.strut(new THREE.Vector3(-2.4, 7.6, 0.6), new THREE.Vector3(-7.6, 6.4, 2.4), 0.2, PALETTE.steel));
    for (let k = 0; k < 3; k++) {
      const drum = ctx.column(0.55, 1.1, PALETTE.bark, 8);
      drum.position.set(-4.2 - k * 1.3, 6.6 - k * 0.3, 1.3 + k * 0.45);
      group.add(drum);
    }
    // The science platform boom, short and off to one side.
    group.add(ctx.strut(new THREE.Vector3(-1.6, 7.4, -1.6), new THREE.Vector3(-5.4, 7.2, -4.4), 0.2, PALETTE.steel));
    const camera = ctx.box(1.2, 1, 1, PALETTE.gold);
    camera.position.set(-5.4, 7.2, -4.4);
    group.add(camera);
    // The lanterns: ten, for the moons it found.
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const post = ctx.column(0.25, 3, PALETTE.bark, 6);
      post.position.set(Math.cos(a) * 9.6, 0, Math.sin(a) * 9.6);
      group.add(post);
      const lamp = ctx.lit(ball(ctx, 0.55, PALETTE.apricot, 8));
      lamp.position.set(Math.cos(a) * 9.6, 3.4, Math.sin(a) * 9.6);
      group.add(lamp);
    }
    return group;
  },
};

export const LANDMARKS: readonly Landmark[] = [HERSCHEL, POLE_DIAL, DIAMOND_WELL, VOYAGER];
