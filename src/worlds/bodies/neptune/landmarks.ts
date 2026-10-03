/**
 * Neptune's landmarks: five places worth crossing the deck for.
 *
 * Three mark real things — the one spacecraft that has ever been here, the
 * night in 1846 the planet was found by arithmetic, and the ring arcs Voyager
 * named after a revolutionary slogan — and two are lookouts on the storms the
 * feature file draws, the Great Dark Spot and the moon nobody can see from
 * the deck. What the Gale built at each is invented; the events are not.
 *
 * Every one stands on its own levelled platform (`settlements.ts` floats a
 * landmark on a deck exactly as it floats a town), so each builder stands on
 * `y = 0` and keeps inside the radius it declares.
 */

import * as THREE from 'three';
import { PALETTE } from '../../../theme.ts';
import type { Landmark } from '../../contract.ts';
import { ball, dome } from '../../architecture.ts';
import { kite, sail, stay } from './buildings.ts';

/**
 * Voyager 2, under the point of its closest approach.
 *
 * On 25 August 1989 it passed 4,950 km over Neptune's north polar region —
 * the closest it came to anything in twelve years — and bent its path down
 * past Triton and out of the plane of the planets for good. It is still the
 * only visitor, and everything anyone knows about the Dark Spot, the
 * companions and the winds is from the week it spent here.
 *
 * The Gale's replica at about three times life size, the booms shortened:
 * the ten-sided bus, the 3.7 m dish open to the sky, the magnetometer boom
 * one way and the power source's three canisters the other, the scan
 * platform on its arm and the golden record on the flank — on a guyed pylon, because here even a memorial is
 * flown rather than stood.
 */
const VOYAGER: Landmark = {
  id: 'voyager-2',
  name: 'Voyager 2 Memorial',
  lat: 73,
  lon: -38,
  radius: 22,
  build(ctx) {
    const group = new THREE.Group();
    group.add(ctx.column(10, 0.8, PALETTE.slate, 12));
    const step = ctx.column(6, 0.8, PALETTE.bone, 12);
    step.position.y = 0.8;
    group.add(step);
    const pylon = ctx.taper(1.6, 0.8, 12, PALETTE.steel, 6);
    pylon.position.y = 1.6;
    group.add(pylon);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      stay(ctx, group, new THREE.Vector3(0, 10, 0), new THREE.Vector3(Math.cos(a) * 8.6, 1.6, Math.sin(a) * 8.6), PALETTE.steel, PALETTE.steel);
    }
    // The bus, ten-sided.
    const busY = 13.6;
    const bus = ctx.column(2, 1.8, PALETTE.white, 10);
    bus.position.y = busY;
    group.add(bus);
    // The dish, open to the sky: a shallow dome turned over, on a short neck.
    const neck = ctx.column(0.5, 1.2, PALETTE.steel, 6);
    neck.position.y = busY + 1.8;
    group.add(neck);
    const dish = dome(ctx, 7.4, PALETTE.white, 0.3, 16);
    dish.rotation.x = Math.PI;
    dish.position.y = busY + 3 + 7.4 * 0.3;
    group.add(dish);
    const feed = ctx.taper(0.35, 0.12, 2.4, PALETTE.gold, 6);
    feed.position.y = busY + 3;
    group.add(feed);
    // The booms: magnetometer one way, the RTGs the other, the scan platform off the side.
    const hub = new THREE.Vector3(0, busY + 0.9, 0);
    group.add(ctx.strut(hub, new THREE.Vector3(-16, busY + 2.2, 0), 0.22, PALETTE.steel));
    group.add(ctx.strut(hub, new THREE.Vector3(7, busY - 0.8, 4), 0.35, PALETTE.steel));
    for (let k = 0; k < 3; k++) {
      const rtg = ctx.column(0.7, 1.4, PALETTE.bark, 8);
      rtg.rotation.z = Math.PI / 2;
      rtg.position.set(4.6 + k * 1.2, busY - 0.4 - k * 0.15, 2.6 + k * 0.5);
      group.add(rtg);
    }
    group.add(ctx.strut(hub, new THREE.Vector3(-3.5, busY + 0.4, -6.4), 0.3, PALETTE.steel));
    const platform = ctx.box(1.8, 1.4, 1.4, PALETTE.gold);
    platform.position.set(-3.5, busY - 0.3, -6.4);
    group.add(platform);
    // The golden record, as a disc on the bus's flank.
    const record = ctx.column(0.9, 0.12, PALETTE.gold, 14);
    record.rotation.x = Math.PI / 2;
    record.position.set(0, busY + 0.9, 2.05);
    group.add(record);
    return group;
  },
};

/**
 * The Galle Stone: Neptune was found with a pencil.
 *
 * Urbain Le Verrier worked out from the wobble in Uranus's orbit where an
 * unseen planet had to be, and posted the answer to Johann Galle in Berlin;
 * Galle and Heinrich d'Arrest found it on the night the letter arrived, 23
 * September 1846, within one degree of the prediction. It is the only planet
 * discovered by mathematics before anyone looked.
 *
 * The Gale think this is the finest thing anyone has ever done for them, and
 * built a hoop standing on edge — the orbit the arithmetic drew — with a
 * needle through it, a degree off true, pointing at the sky where Earth was
 * that night.
 */
const GALLE: Landmark = {
  id: 'galle-stone',
  name: 'The Galle Stone',
  lat: 12,
  lon: -24,
  radius: 20,
  build(ctx) {
    const group = new THREE.Group();
    group.add(ctx.column(9.5, 0.9, PALETTE.slate, 14));
    const stone = ctx.taper(5.2, 4.2, 1.6, PALETTE.bone, 7);
    stone.position.y = 0.9;
    group.add(stone);
    // The hoop: a ring wall turned on edge, its thickness centred on its plane.
    const hoopR = 8.2;
    const hoop = ctx.ringWall(hoopR - 0.9, hoopR, 1.2, PALETTE.gold, 28);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.set(0, 2.5 + hoopR, -0.6);
    group.add(hoop);
    // Its two feet, set into the stone.
    for (const side of [-1, 1]) {
      const foot = ctx.box(1.6, 2.2, 1.6, PALETTE.steel);
      foot.position.set(side * 1.8, 1.4, 0);
      group.add(foot);
    }
    // The needle, through the hoop's centre and a degree off its axis.
    const centre = new THREE.Vector3(0, 2.5 + hoopR, 0);
    const way = new THREE.Vector3(0.12, 0.62, 1).normalize();
    group.add(ctx.strut(centre.clone().addScaledVector(way, -9.5), centre.clone().addScaledVector(way, 10.5), 0.32, PALETTE.white));
    const tip = ball(ctx, 0.75, PALETTE.skyBlue, 10);
    tip.position.copy(centre).addScaledVector(way, 10.8);
    group.add(tip);
    // Le Verrier's and Galle's two posts either side, with the letter between them.
    for (const side of [-1, 1]) {
      const post = ctx.taper(0.8, 0.5, 5, PALETTE.bone, 6);
      post.position.set(side * 7, 0.9, 5.5);
      group.add(post);
    }
    const letter = ctx.box(3.6, 2.4, 0.3, PALETTE.white);
    letter.position.set(0, 2.2, 6.2);
    group.add(letter);
    return group;
  },
};

/**
 * The Arcs: Neptune's rings, laid out on the deck.
 *
 * Five rings — Galle, Le Verrier, Lassell, Arago and Adams, after the people
 * who found or nearly found the planet — and in the outermost, Adams, four
 * clumps of dust that should have spread round it and have not: Liberté,
 * Égalité, Fraternité and Courage. Voyager confirmed them in 1989; they have
 * been fading since, and Liberté may be gone within a century.
 *
 * Five low concentric rings at their true proportions and four standing arcs
 * on the outermost, the tallest Fraternité, the longest arc.
 */
const ARCS: Landmark = {
  id: 'the-arcs',
  name: 'The Arcs',
  lat: -3,
  lon: 74,
  radius: 30,
  build(ctx) {
    const group = new THREE.Group();
    group.add(ctx.column(27, 0.6, PALETTE.slate, 32));
    const centre = ball(ctx, 4.2, PALETTE.skyBlue, 14);
    centre.position.y = 4.8;
    group.add(centre);
    group.add(ctx.column(1.4, 1.2, PALETTE.steel, 8));
    // Galle 41,900 km, Le Verrier 53,200, Lassell to 57,200, Arago 57,200, Adams 62,930.
    const rings: [number, number, number][] = [
      [10.6, 11.4, PALETTE.bone],
      [13.6, 14.2, PALETTE.white],
      [14.6, 15.4, PALETTE.bone],
      [15.6, 16.0, PALETTE.white],
      [16.9, 17.5, PALETTE.white],
    ];
    for (const [inner, outer, colour] of rings) {
      const ring = ctx.ringWall(inner, outer, 0.5, colour, 40);
      ring.position.y = 0.6;
      group.add(ring);
    }
    // The arcs, as runs of blocks on the Adams ring: Courage, Liberté,
    // Égalité and Fraternité, leading to trailing, about 40 degrees of it.
    const arcs: [number, number, number, number][] = [
      [0.0, 0.04, 2.4, PALETTE.gold],
      [0.12, 0.2, 3.4, PALETTE.orange],
      [0.26, 0.34, 3.0, PALETTE.gold],
      [0.4, 0.62, 4.2, PALETTE.crimson],
    ];
    for (const [from, to, high, colour] of arcs) {
      const steps = Math.max(2, Math.round((to - from) * 22));
      for (let k = 0; k < steps; k++) {
        const a0 = from + ((to - from) * k) / steps;
        const a1 = from + ((to - from) * (k + 1)) / steps;
        const r = 17.2;
        const p0 = new THREE.Vector3(Math.cos(a0) * r, 1.1 + high / 2, Math.sin(a0) * r);
        const p1 = new THREE.Vector3(Math.cos(a1) * r, 1.1 + high / 2, Math.sin(a1) * r);
        // One chord of the arc: a block as long as the chord, standing on the ring.
        const block = ctx.box(p0.distanceTo(p1) + 0.3, high, 1.1, colour);
        block.position.set((p0.x + p1.x) / 2, 1.1, (p0.z + p1.z) / 2);
        block.rotation.y = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
        group.add(block);
      }
    }
    return group;
  },
};

/**
 * Triton's Orrery: the moon nobody on the deck can see.
 *
 * Triton is the seventh-largest moon in the solar system and the only big
 * one that goes round its planet **backwards** — 157 degrees inclined, so it
 * is almost certainly a captured dwarf planet from the Kuiper belt — and
 * tides are pulling it slowly down; in a few billion years it will cross the
 * Roche limit and come apart into a ring. Voyager saw nitrogen geysers on it
 * and a pink southern cap. From the 1-bar level, under the haze, it is not
 * there at all, and the Gale built this so the children would believe in it.
 *
 * Neptune on a column, Triton's orbit as a tilted hoop of struts round it,
 * and Triton on the hoop, pink cap and all.
 */
const TRITON: Landmark = {
  id: 'triton-orrery',
  name: "Triton's Orrery",
  lat: -15,
  lon: -104,
  radius: 22,
  build(ctx) {
    const group = new THREE.Group();
    group.add(ctx.column(12, 0.8, PALETTE.slate, 16));
    const column = ctx.taper(1.8, 1.1, 7.8, PALETTE.bone, 8);
    column.position.y = 0.8;
    group.add(column);
    const centreY = 13;
    const planet = ball(ctx, 4.6, PALETTE.skyBlue, 16);
    planet.position.y = centreY;
    group.add(planet);
    // The orbit: a ring of struts tilted 23 degrees off the equator (157
    // reckoned the backwards way), the arrows on it pointing retrograde.
    const orbit = 10.5;
    const tilt = 23 * (Math.PI / 180);
    const at = (a: number): THREE.Vector3 =>
      new THREE.Vector3(Math.cos(a) * orbit, centreY + Math.sin(a) * orbit * Math.sin(tilt), Math.sin(a) * orbit * Math.cos(tilt));
    const segments = 20;
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI * 2;
      const a1 = ((k + 1) / segments) * Math.PI * 2;
      group.add(ctx.strut(at(a0), at(a1), 0.28, k % 5 === 0 ? PALETTE.gold : PALETTE.steel));
    }
    // Two spokes from the planet to hold the hoop up.
    for (const a of [Math.PI * 0.25, Math.PI * 1.25]) group.add(ctx.strut(new THREE.Vector3(0, centreY, 0), at(a), 0.2, PALETTE.steel));
    const where = at(Math.PI * 0.7);
    const moon = ball(ctx, 1.6, PALETTE.cream, 12);
    moon.position.copy(where);
    group.add(moon);
    const cap = dome(ctx, 1.62, PALETTE.blush, 0.6, 12);
    cap.rotation.x = Math.PI;
    cap.position.copy(where);
    group.add(cap);
    return group;
  },
};

/**
 * The Companion Overlook, on the Dark Spot's southern rim.
 *
 * The bright companion clouds sat on this edge the whole week Voyager
 * watched, while the Spot itself rolled over every sixteen days or so; when
 * Hubble looked again in 1994 the Spot had gone and nobody saw it go. The
 * Gale built a deck raised on raked legs, a windbreak of three great sails
 * behind it, and a long glass on a pivot, kept trained on the place the Spot
 * used to be by people who are sure it will come back.
 */
const OVERLOOK: Landmark = {
  id: 'companion-overlook',
  name: 'Companion Overlook',
  lat: -29.4,
  lon: 14.2,
  radius: 20,
  build(ctx) {
    const group = new THREE.Group();
    group.add(ctx.column(8.5, 0.8, PALETTE.slate, 12));
    // The deck, raised on raked legs and reaching out over the platform's edge.
    const deckY = 6;
    const deck = ctx.column(6.8, 0.7, PALETTE.bone, 14);
    deck.position.set(0, deckY, 4.5);
    group.add(deck);
    const rail = ctx.ringWall(6.3, 6.8, 1.1, PALETTE.steel, 14);
    rail.position.set(0, deckY + 0.7, 4.5);
    group.add(rail);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      group.add(ctx.strut(new THREE.Vector3(Math.cos(a) * 5.4, 0.8, Math.sin(a) * 4.8 - 1), new THREE.Vector3(Math.cos(a) * 4.6, deckY, 4.5 + Math.sin(a) * 4.6), 0.5, PALETTE.steel));
    }
    // The windbreak: three sails on masts along the south edge.
    for (let k = 0; k < 3; k++) {
      const x = -5 + k * 5;
      const mast = ctx.column(0.24, 14, PALETTE.steel, 6);
      mast.position.set(x, 0.8, -6);
      group.add(mast);
      const cloth = sail(ctx, 4.2, 11, 0.8, k === 1 ? PALETTE.gold : PALETTE.white);
      cloth.position.set(x, 2.8, -6);
      group.add(cloth);
    }
    // The glass: a long taper on a pivot, aimed out and a little down.
    const pivot = ctx.column(0.6, 1.6, PALETTE.steel, 8);
    pivot.position.set(0, deckY + 0.7, 6);
    group.add(pivot);
    const glass = ctx.taper(0.9, 0.55, 6.5, PALETTE.gold, 10);
    glass.rotation.x = Math.PI / 2 + 0.12;
    glass.position.set(0, deckY + 2.6, 3.4);
    group.add(glass);
    // A kite on a long tether off the deck, for the look of it.
    const anchor = new THREE.Vector3(5.2, deckY + 0.8, 7.5);
    const high = new THREE.Vector3(-1.5, deckY + 11, 11);
    group.add(ctx.strut(anchor, high, 0.08, PALETTE.steel));
    const flier = kite(ctx, 2.2, PALETTE.crimson);
    flier.position.copy(high);
    group.add(flier);
    return group;
  },
};

export const LANDMARKS: readonly Landmark[] = [VOYAGER, GALLE, ARCS, TRITON, OVERLOOK];
