/**
 * Four places on Venus worth the walk, outside any town.
 *
 * Two are real: the landers that reached the surface, kept by the Bathyd
 * where they fell (the keeping is invented; the landers, their dates and
 * their coordinates are not). Two are the Bathyd's own: the Bell on a pancake
 * dome beside Seoritsu, a short walk from the spawn, and the Lantern on
 * Cleopatra's rim, the one tall thing they ever built.
 */

import * as THREE from 'three';
import type { Landmark } from '../../contract.ts';
import type { SceneryContext } from '../../../scenery/contract.ts';
import { PALETTE } from '../../../theme.ts';
import { ball, dome } from '../../architecture.ts';
import { lamp } from './buildings.ts';

/** The low round plinth and the ring of sulphur lamps every Bathyd memorial stands in. */
function memorial(ctx: SceneryContext, group: THREE.Group, radius: number, lamps: number): number {
  const plinth = ctx.column(radius, 0.8, PALETTE.tan, 12);
  group.add(plinth);
  const kerb = ctx.ringWall(radius - 0.6, radius, 1.1, PALETTE.brown, 12);
  group.add(kerb);
  for (let k = 0; k < lamps; k++) {
    const a = (k / lamps) * Math.PI * 2;
    const post = lamp(ctx, Math.cos(a) * (radius - 1.4), Math.sin(a) * (radius - 1.4), 1.4, PALETTE.gold, PALETTE.bark);
    post.position.y = 0.8;
    group.add(post);
  }
  return 0.8;
}

/**
 * Venera 13, 7.5 S 303 E: down on 1 March 1982, east of Phoebe Regio, and
 * alive for 127 minutes at 457 C and 89 atmospheres — long enough to take
 * the first colour photographs of another planet's surface and drill a
 * sample. The landing ring, the pressure sphere, the disc of the drag plate
 * and the antenna on top; the drill arm; and one camera's lens cap, lying
 * where it fell (on Venera 14 a cap landed exactly under the soil probe,
 * which then measured the cap).
 */
const VENERA_13: Landmark = {
  id: 'venera-13',
  name: 'Venera 13',
  lat: -7.5,
  lon: -57,
  radius: 14,
  build(ctx) {
    const group = new ctx.THREE.Group();
    const floor = memorial(ctx, group, 11, 6);
    const ring = ctx.ringWall(2.1, 3.0, 0.9, PALETTE.steel, 16);
    ring.position.y = floor;
    group.add(ring);
    const legs = ctx.column(1.4, 1.2, PALETTE.steel, 8);
    legs.position.y = floor + 0.6;
    group.add(legs);
    const sphere = ball(ctx, 2.0, PALETTE.white, 12);
    sphere.position.y = floor + 3.4;
    group.add(sphere);
    const plate = ctx.taper(3.4, 3.0, 0.35, PALETTE.white, 16);
    plate.position.y = floor + 5.2;
    group.add(plate);
    const mast = ctx.column(0.55, 2.0, PALETTE.bone, 8);
    mast.position.y = floor + 5.55;
    group.add(mast);
    const tip = ctx.taper(0.55, 0.12, 0.8, PALETTE.gold, 8);
    tip.position.y = floor + 7.55;
    group.add(tip);
    // The camera ports, two dark eyes low on the sphere.
    for (const side of [-1, 1]) {
      const port = ctx.box(0.7, 0.5, 0.4, PALETTE.ink);
      port.position.set(side * 0.9, floor + 2.2, 1.7);
      group.add(port);
    }
    group.add(ctx.strut(new THREE.Vector3(1.6, floor + 2.0, 0), new THREE.Vector3(3.9, floor + 0.2, 1.1), 0.24, PALETTE.gold));
    const cap = ctx.column(0.55, 0.16, PALETTE.white, 10);
    cap.position.set(4.6, floor, -2.4);
    group.add(cap);
    return group;
  },
};

/**
 * Venera 7, 5 S 351 E: on 15 December 1970 the first spacecraft to land
 * softly on another planet and send word from its surface — twenty-three
 * minutes of faint signal, because the parachute tore on the way down and
 * the probe hit at 17 m/s and rolled onto its side. So it lies on its side
 * here, the shreds of the canopy beside it.
 */
const VENERA_7: Landmark = {
  id: 'venera-7',
  name: 'Venera 7',
  lat: -5,
  lon: -9,
  radius: 12,
  build(ctx, rng) {
    const group = new ctx.THREE.Group();
    const floor = memorial(ctx, group, 9.5, 5);
    const body = ball(ctx, 1.7, PALETTE.white, 12);
    body.position.set(0, floor + 1.7, 0);
    group.add(body);
    const band = ctx.ringWall(1.6, 1.85, 0.5, PALETTE.steel, 12);
    band.rotation.z = Math.PI / 2;
    band.position.set(-0.25, floor + 1.7, 0);
    group.add(band);
    // The antenna, pointing along the ground now rather than at Earth.
    group.add(ctx.strut(new THREE.Vector3(1.5, floor + 1.9, 0.2), new THREE.Vector3(3.6, floor + 1.4, 0.6), 0.3, PALETTE.bone));
    for (let k = 0; k < 3; k++) {
      const shred = ctx.box(rng.range(1.4, 2.4), 0.12, rng.range(0.9, 1.6), PALETTE.orange);
      shred.position.set(-3.2 - k * 0.9, floor + k * 0.12, -1.6 + k * 1.3);
      shred.rotation.y = k * 0.7;
      group.add(shred);
    }
    return group;
  },
};

/**
 * The Lantern of Cleopatra (invented): a tower on the northern rim of
 * Cleopatra crater, the one tall thing the Bathyd ever built, because a
 * crater rim is the one place on Venus where height can be seen from far
 * enough to be worth it. It stands on the outer shoulder of the northern
 * rim, looking down into the bowl. A heavy battered base, a shaft, a gallery, and a
 * ball of sulphur burning in a cage at the top, lit at the frost line.
 */
const LANTERN: Landmark = {
  id: 'cleopatra-lantern',
  name: 'Lantern of Cleopatra',
  // Just outside the crest, where the rim's outer slope is gentle enough to
  // level: on the crest itself the pad's edge was a drop into the bowl.
  lat: 66.47,
  lon: 7.1,
  radius: 12,
  build(ctx) {
    const group = new ctx.THREE.Group();
    const base = ctx.taper(7, 5, 3.2, PALETTE.bark, 8);
    group.add(base);
    const shaft = ctx.taper(3.4, 2.4, 13, PALETTE.steel, 8);
    shaft.position.y = 3.2;
    group.add(shaft);
    for (const y of [7, 11.5]) {
      const band = ctx.ringWall(3.0 - (y - 3.2) * 0.075, 3.5 - (y - 3.2) * 0.075, 0.6, PALETTE.bone, 8);
      band.position.y = y;
      group.add(band);
    }
    const gallery = ctx.column(3.6, 0.7, PALETTE.bark, 8);
    gallery.position.y = 16.2;
    group.add(gallery);
    const fire = ball(ctx, 1.9, PALETTE.gold, 10);
    fire.position.y = 19;
    group.add(fire);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      group.add(ctx.strut(new THREE.Vector3(Math.cos(a) * 3.1, 16.9, Math.sin(a) * 3.1), new THREE.Vector3(Math.cos(a) * 1.2, 21.6, Math.sin(a) * 1.2), 0.26, PALETTE.bark));
    }
    const hat = ctx.taper(2.0, 0.2, 2.2, PALETTE.clay, 8);
    hat.position.y = 21.6;
    group.add(hat);
    const door = ctx.box(1.6, 2.2, 0.6, PALETTE.ink);
    door.position.z = 6.3;
    group.add(door);
    return group;
  },
};

/**
 * The Bell of Seoritsu (invented): a bell cast from the lead frost of Maxwell
 * and hung on the dome beside the town, rung once each sunrise — every 117
 * Earth days, which is how long a day lasts here. In this air a bell's note
 * carries further than on any other world, and the Bathyd say it can be heard
 * in Farra; the physics says they are probably right.
 */
const BELL: Landmark = {
  id: 'seoritsu-bell',
  name: 'Bell of Seoritsu',
  lat: -29.45,
  lon: 11.2,
  radius: 14,
  build(ctx) {
    const group = new ctx.THREE.Group();
    const floor = memorial(ctx, group, 11, 6);
    for (const side of [-1, 1]) {
      const pillar = ctx.taper(1.7, 1.25, 10.5, PALETTE.bark, 6);
      pillar.position.set(side * 6.2, floor, 0);
      group.add(pillar);
      const foot = ctx.taper(2.4, 1.8, 1.2, PALETTE.brown, 6);
      foot.position.set(side * 6.2, floor, 0);
      group.add(foot);
    }
    const lintel = ctx.box(15.4, 1.6, 2.6, PALETTE.brown);
    lintel.position.y = floor + 10.5;
    group.add(lintel);
    const roof = ctx.box(16.4, 0.5, 3.2, PALETTE.clay);
    roof.position.y = floor + 12.1;
    group.add(roof);
    // The bell, mouth down: a flared body, a crown, a gold lip.
    const mouth = floor + 3.4;
    const body = ctx.taper(3.6, 2.1, 4.6, PALETTE.steel, 12);
    body.position.y = mouth;
    group.add(body);
    const crown = dome(ctx, 2.1, PALETTE.steel, 0.6, 12);
    crown.position.y = mouth + 4.6;
    group.add(crown);
    const lip = ctx.ringWall(3.3, 3.9, 0.55, PALETTE.gold, 12);
    lip.position.y = mouth;
    group.add(lip);
    const hanger = ctx.column(0.35, 10.5 - 4.6 - 3.4 - 1.2, PALETTE.bark, 6);
    hanger.position.y = mouth + 4.6 + 1.2;
    group.add(hanger);
    const clapper = ball(ctx, 0.8, PALETTE.gold, 8);
    clapper.position.y = mouth + 0.2;
    group.add(clapper);
    return group;
  },
};

export const LANDMARKS: readonly Landmark[] = [BELL, VENERA_13, VENERA_7, LANTERN];
