/**
 * Mercury's landmarks: five places outside any town worth the walk, each at a
 * real coordinate. What stands there is invented.
 */

import * as THREE from 'three';
import type { Landmark } from '../../contract.ts';
import type { SceneryContext } from '../../../scenery/contract.ts';
import { ball, dome } from '../../architecture.ts';
import { PALETTE } from '../../../theme.ts';

/**
 * MESSENGER, where it came down on 30 April 2015 at 54.4 N, 149.9 W, near
 * Janacek crater; its impact crater (about 16 m across) is the berm here. The
 * probe stands as it flew, on a plinth: the body box, the curved sunshade, the
 * two solar panels and the magnetometer boom, under a parasol of the Cinder's
 * own, ringed with mirror posts.
 */
const MESSENGER: Landmark = {
  id: 'messenger',
  name: 'MESSENGER Shrine',
  lat: 54.44,
  lon: -149.88,
  radius: 16,
  build(ctx) {
    const group = new THREE.Group();
    const berm = ctx.ringWall(8, 10.2, 1.2, PALETTE.tan, 16);
    group.add(berm);
    const plinth = ctx.column(2.6, 2.2, PALETTE.steel, 8);
    group.add(plinth);
    // The probe, at about 1.3 world units a metre: a 1.85 m body.
    const probe = new THREE.Group();
    probe.position.y = 2.2;
    const body = ctx.box(1.8, 1.6, 1.4, PALETTE.gold);
    body.position.y = 0.5;
    probe.add(body);
    const shade = new THREE.Group();
    shade.position.z = 1.2;
    for (let k = -1; k <= 1; k++) {
      const panel = ctx.box(1.15, 2.6, 0.2, PALETTE.white);
      panel.position.set(k * 1.05, 0.0, -Math.abs(k) * 0.32);
      panel.rotation.y = -k * 0.32;
      shade.add(panel);
    }
    probe.add(shade);
    for (const side of [-1, 1]) {
      const arm = ctx.strut(new THREE.Vector3(side * 0.9, 1.3, 0), new THREE.Vector3(side * 2.2, 1.3, 0), 0.12, PALETTE.steel);
      probe.add(arm);
      const wing = ctx.box(1.9, 0.12, 1.6, PALETTE.skyBlue);
      wing.position.set(side * 3.1, 1.24, 0);
      probe.add(wing);
    }
    probe.add(ctx.strut(new THREE.Vector3(0, 2.1, -0.6), new THREE.Vector3(0, 2.3, -4.4), 0.08, PALETTE.steel));
    group.add(probe);
    // The parasol the Cinder hold over it.
    const mast = ctx.column(0.35, 11, PALETTE.steel, 6);
    mast.position.set(-5.5, 0, -3.5);
    group.add(mast);
    const canopy = ctx.taper(7.2, 6.8, 0.4, PALETTE.slate, 12);
    canopy.position.set(-2.4, 11, -1.6);
    group.add(canopy);
    const mirror = ctx.taper(6.8, 1.4, 1.4, PALETTE.white, 12);
    mirror.position.set(-2.4, 11.4, -1.6);
    group.add(mirror);
    group.add(ctx.strut(new THREE.Vector3(-5.5, 8, -3.5), new THREE.Vector3(-2.4, 11, -1.6), 0.25, PALETTE.steel));
    // Mirror posts on the berm, one for each year it flew.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const post = ctx.column(0.35, 3.2, PALETTE.steel, 5);
      post.position.set(Math.cos(a) * 9.1, 1.2, Math.sin(a) * 9.1);
      group.add(post);
      const glint = ctx.box(1.3, 1.3, 0.2, PALETTE.gold);
      glint.position.set(Math.cos(a) * 9.1, 4.4, Math.sin(a) * 9.1);
      glint.rotation.y = -a;
      group.add(glint);
    }
    return group;
  },
};

/**
 * The Apollodorus Observatory, at the hub of the Spider (30.6 N, 163.0 E): a
 * dish laid face up at the black sky and a ring of heliostats round it. You
 * walk out of the crater along one of the troughs.
 */
const APOLLODORUS: Landmark = {
  id: 'apollodorus',
  name: 'Apollodorus Observatory',
  lat: 30.6,
  lon: 163.0,
  radius: 20,
  build(ctx) {
    const group = new THREE.Group();
    const base = ctx.taper(6.5, 5.5, 2, PALETTE.bone, 10);
    group.add(base);
    const tower = ctx.column(2.4, 7, PALETTE.white, 10);
    tower.position.y = 2;
    group.add(tower);
    const dish = dome(ctx, 7, PALETTE.white, 0.35, 16);
    dish.rotation.x = Math.PI;
    dish.position.y = 12;
    group.add(dish);
    const rim = ctx.ringWall(6.6, 7.3, 0.6, PALETTE.gold, 16);
    rim.position.y = 11.6;
    group.add(rim);
    const feed = ctx.column(0.25, 5, PALETTE.steel, 6);
    feed.position.y = 10;
    group.add(feed);
    const horn = ball(ctx, 0.7, PALETTE.gold, 8);
    horn.position.y = 15.4;
    group.add(horn);
    addHeliostats(ctx, group, 8, 11.5, 3.2);
    return group;
  },
};

function addHeliostats(ctx: SceneryContext, group: THREE.Group, count: number, distance: number, height: number): void {
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2;
    const post = ctx.column(0.28, height, PALETTE.steel, 6);
    post.position.set(Math.cos(a) * distance, 0, Math.sin(a) * distance);
    group.add(post);
    const panel = new THREE.Group();
    panel.position.set(Math.cos(a) * distance, height, Math.sin(a) * distance);
    panel.rotation.y = -a + Math.PI / 2;
    panel.rotation.x = -0.75;
    const glass = ctx.box(2.6, 0.2, 2, PALETTE.white);
    panel.add(glass);
    group.add(panel);
  }
}

/**
 * The Ray Beacon, on Hokusai's floor at the foot of its central peak (57.8 N,
 * 16.8 E; a pad on the peak would plane its top into a cliff): a white needle
 * with mirror vanes at the top that flashes the sun across the rays.
 */
const HOKUSAI: Landmark = {
  id: 'hokusai-beacon',
  name: 'Hokusai Ray Beacon',
  lat: 57.67,
  lon: 17.55,
  radius: 12,
  build(ctx) {
    const group = new THREE.Group();
    const step = ctx.taper(5.6, 4.8, 1.2, PALETTE.slate, 6);
    group.add(step);
    const needle = ctx.taper(1.8, 0.7, 24, PALETTE.white, 6);
    needle.position.y = 1.2;
    group.add(needle);
    for (let k = 0; k < 3; k++) {
      const vane = ctx.box(0.25, 3.2, 4.2, k === 1 ? PALETTE.gold : PALETTE.white);
      vane.position.y = 22;
      vane.rotation.y = (k / 3) * Math.PI;
      group.add(vane);
    }
    const tip = ctx.taper(0.6, 0.04, 3, PALETTE.gold, 6);
    tip.position.y = 25.2;
    group.add(tip);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      group.add(ctx.strut(new THREE.Vector3(Math.cos(a) * 4.4, 1.2, Math.sin(a) * 4.4), new THREE.Vector3(Math.cos(a) * 1.2, 9, Math.sin(a) * 1.2), 0.35, PALETTE.steel));
    }
    return group;
  },
};

/**
 * The Prokofiev Ice Works, on the floor of the largest of the north's cold
 * traps (85.7 N, 62.7 W), where water ice has been detected: a headframe over
 * the shaft, the winding wheel and cut blocks stacked to go south.
 */
// Forty units off the crater's centre, on the flattest of its floor.
const PROKOFIEV: Landmark = {
  id: 'prokofiev-ice',
  name: 'Prokofiev Ice Works',
  lat: 86.03,
  lon: -57.37,
  radius: 20,
  build(ctx) {
    const group = new THREE.Group();
    const collar = ctx.ringWall(1.8, 3.2, 0.8, PALETTE.steel, 10);
    group.add(collar);
    // The headframe: four legs leaning in, and a beam across the top.
    const top = 13;
    for (const [x, z] of [[-3.2, -2.4], [3.2, -2.4], [-3.2, 2.4], [3.2, 2.4]] as const) {
      group.add(ctx.strut(new THREE.Vector3(x, 0, z), new THREE.Vector3(x * 0.45, top, z * 0.45), 0.42, PALETTE.slate));
    }
    for (const y of [4.5, 9]) {
      const s = 1 - (y / top) * 0.55;
      group.add(ctx.strut(new THREE.Vector3(-3.2 * s, y, -2.4 * s), new THREE.Vector3(3.2 * s, y, -2.4 * s), 0.25, PALETTE.steel));
      group.add(ctx.strut(new THREE.Vector3(-3.2 * s, y, 2.4 * s), new THREE.Vector3(3.2 * s, y, 2.4 * s), 0.25, PALETTE.steel));
    }
    const head = ctx.box(3.6, 1.2, 2.8, PALETTE.slate);
    head.position.y = top;
    group.add(head);
    const wheel = ctx.ringWall(1.6, 2.1, 0.4, PALETTE.gold, 14);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0, top + 2.6, 0.2);
    group.add(wheel);
    // The cut ice, stacked in courses on two pallets.
    for (const side of [-1, 1]) {
      for (let course = 0; course < 3; course++) {
        for (let k = 0; k < 3 - course; k++) {
          const block = ctx.box(1.6, 1.3, 1.6, course % 2 === 0 ? PALETTE.white : PALETTE.skyBlue);
          block.position.set(side * 9 + (k - (2 - course) / 2) * 1.75, course * 1.3, side * 4);
          group.add(block);
        }
      }
    }
    // The winding house, low and dark, radiating into the sky like everything here.
    const shed = ctx.box(6, 3, 4, PALETTE.steel);
    shed.position.set(0, 0, -8.5);
    group.add(shed);
    const roof = ctx.roof(6.6, 4.6, 1.4, 4, PALETTE.bark);
    roof.position.set(0, 3, -8.5);
    group.add(roof);
    group.add(ctx.strut(new THREE.Vector3(0, top + 2.6, -0.2), new THREE.Vector3(0, 3.6, -6.6), 0.12, PALETTE.ink));
    return group;
  },
};

/**
 * The Noon Stone, at 0 N 0 E: a hot pole, where at every other perihelion the
 * sun stands overhead at its closest. A mirror dais and a gnomon whose shadow
 * vanishes at that noon.
 */
const NOON_STONE: Landmark = {
  id: 'noon-stone',
  name: 'The Noon Stone',
  lat: 0,
  lon: 0,
  radius: 14,
  build(ctx) {
    const group = new THREE.Group();
    const dais = ctx.taper(8.4, 7.6, 0.8, PALETTE.white, 12);
    group.add(dais);
    const ring = ctx.ringWall(5.6, 6.4, 0.3, PALETTE.gold, 24);
    ring.position.y = 0.8;
    group.add(ring);
    const gnomon = ctx.taper(1.1, 0.25, 16, PALETTE.bark, 4);
    gnomon.position.y = 0.8;
    group.add(gnomon);
    // Twelve hour stones for a day of 176 Earth days, fourteen and a half days apart.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const stone = ctx.box(0.8, k % 3 === 0 ? 1.8 : 1.0, 0.8, k % 3 === 0 ? PALETTE.gold : PALETTE.bone);
      stone.position.set(Math.cos(a) * 7.4, 0.8, Math.sin(a) * 7.4);
      stone.rotation.y = -a;
      group.add(stone);
    }
    return group;
  },
};

export const LANDMARKS: readonly Landmark[] = [MESSENGER, APOLLODORUS, HOKUSAI, PROKOFIEV, NOON_STONE];
