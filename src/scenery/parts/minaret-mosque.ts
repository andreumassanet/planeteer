import { DOOR_HEAD, DOOR_JAMB, PROUD, STOREY, TONES, doorPaint } from '../contract.ts';
import type { ScenicPart } from '../contract.ts';

/**
 * Minaret mosque — the civic building of the Maghreb, the Middle East, the Sahel
 * and South Asia.
 *
 * Two marks and no more: **a dome and a shaft**. Everything else on this model
 * is the plinth they stand on. At the distance a civic building earns its budget
 * — you are outside the town, looking at it — a dome beside a vertical is the
 * whole of the recognition, and the hall under them is a pale rectangle.
 *
 * The dome is `ctx.dome` at three rings. It is a lathed quarter-ellipse rather
 * than a hemisphere because a mosque dome is taller than half a sphere, and
 * because a squashed ball reads as a bubble. Three bands of ink up the profile
 * read as a dome; six read as a beach ball. It sits on a drum with a darker
 * collar round the foot of it, which is what stops the dome growing out of the
 * roof — the same ledge the round hut's thatch needs.
 *
 * The minaret carries a balcony ring two thirds of the way up. Without it the
 * shaft is a chimney — the same failure the church tower has, solved the same
 * way, because a vertical needs one horizontal to be a tower. **The shaft is
 * two tones**, darker below the balcony and lighter above it: an eight-sided
 * column in one flat colour takes one cel band for its whole 24 units, which is
 * the tallest smooth grey thing the kit could build.
 *
 * **The arcade is the redesign's addition and it is two meshes.** A mosque hall
 * meets its courtyard in a row of arches, and here that is one `panes` plate
 * row of piers standing proud of the render, with a row of dark openings behind
 * them, `lit` low because a hole with a lamp behind it is a dimmer claim than a
 * window. Four piers and three arches for 46 triangles, and the pale rectangle
 * of the hall front has a rhythm on it.
 */

export const minaretMosque: ScenicPart = {
  id: 'minaret-mosque',
  name: 'Minaret mosque',
  kind: 'civic',
  footprint: 9.2,
  note: 'A dome on a collared drum and a two-tone shaft over an arcaded hall. Four regions build it.',

  build(ctx, rng, style) {
    const { THREE, box, panes, tone, column, lit, taper, rim, dome } = ctx;
    const group = new THREE.Group();

    const wall = rng.pick(style.walls);
    const dark = rng.pick(style.glass);
    // The dome is the one saturated thing on the building, so it gets its own
    // pick rather than sharing the roof colour.
    const domeColor = rng.pick(style.roofs);

    const course = tone(wall, TONES.course);
    const shade = tone(wall, TONES.eave);
    const coping = tone(wall, TONES.light);
    const collar = tone(wall, TONES.cap);
    const domeCap = tone(domeColor, TONES.cap);

    const hallWidth = rng.range(9, 11);
    const hallDepth = hallWidth * rng.range(0.8, 1);
    const hallHeight = STOREY * rng.range(1.5, 2);

    group.add(box(hallWidth + 0.6, 0.45, hallDepth + 0.6, course));
    // `PROUD` taller than the band it wears, for the flat-roof house's reason:
    // level with it, the band's closed top and the hall's roof were one plane in
    // two colours and the roof z-fought, 26.6 u² a build (2026-09-13). The
    // extra stands inside the crown's ring, where nothing can see it.
    const hall = box(hallWidth, hallHeight + PROUD, hallDepth, wall);
    hall.position.y = 0.45;
    group.add(hall);
    const band = box(hallWidth + PROUD * 2, 0.32, hallDepth + PROUD * 2, shade);
    band.position.y = 0.45 + hallHeight - 0.32;
    group.add(band);

    const crown = rim(hallWidth + 0.3, hallDepth + 0.3, 0.4, 0.9, coping);
    crown.position.y = 0.45 + hallHeight;
    group.add(crown);

    // --- the dome, on a drum with a collar so it does not grow out of the roof ---
    const domeRadius = hallWidth * rng.range(0.26, 0.33);
    const drumZ = -hallDepth * 0.1;
    // Sunk `PROUD` into the roof: on a hall wide for its depth it reaches
    // through the crown at the back, and its underside out there was the
    // crown's too.
    const drum = column(domeRadius * 1.06, 1.5 + PROUD, wall, 12);
    drum.position.set(0, 0.45 + hallHeight - PROUD, drumZ);
    group.add(drum);
    const ring = taper(domeRadius * 1.2, domeRadius * 1.1, 0.4, collar, 12);
    // `PROUD` over the drum's top, so the dome grows out of the collar. Level
    // with it, the drum's top and the collar's were one plane in two colours
    // round the dome's foot.
    ring.position.set(0, 0.45 + hallHeight + 1.5 - 0.4 + PROUD, drumZ);
    group.add(ring);

    const cap = dome(domeRadius, domeRadius * rng.range(1.05, 1.35), domeColor, 12, 3);
    cap.position.set(0, 0.45 + hallHeight + 1.5, drumZ);
    group.add(cap);

    const spike = column(0.16, 1.1, domeCap, 4);
    spike.position.set(0, cap.position.y + domeRadius * 1.05, drumZ);
    group.add(spike);

    // --- the minaret ---
    const side = rng.sign();
    const shaftWidth = rng.range(1.15, 1.5);
    const shaftHeight = rng.range(19, 25);
    const at = side * (hallWidth / 2 - shaftWidth);
    const az = hallDepth / 2 - shaftWidth;
    const balconyY = 1.65 + shaftHeight * 0.68;

    const base = box(shaftWidth * 1.6, 1.2, shaftWidth * 1.6, course);
    base.position.set(at, 0.45, az);
    group.add(base);

    const sides = rng.chance(0.5) ? 4 : 8;
    // Stops `PROUD` into the corbel, whose top would otherwise share its plane
    // round the foot of the upper shaft.
    const lower = column(shaftWidth / 2, balconyY - 1.65 - PROUD, shade, sides);
    lower.position.set(at, 1.65, az);
    group.add(lower);
    const upper = column(shaftWidth * 0.45, 1.65 + shaftHeight - balconyY, wall, sides);
    upper.position.set(at, balconyY, az);
    group.add(upper);

    const balcony = rim(shaftWidth * 2.1, shaftWidth * 2.1, 0.42, 0.75, coping);
    balcony.position.set(at, balconyY, az);
    group.add(balcony);
    const corbel = box(shaftWidth * 1.7, 0.26, shaftWidth * 1.7, collar);
    corbel.position.set(at, balconyY - 0.26, az);
    group.add(corbel);

    const lantern = column(shaftWidth * 0.42, 2, coping, 8);
    lantern.position.set(at, 1.65 + shaftHeight, az);
    group.add(lantern);
    // The muezzin's openings, lit low: four dark slots round the lantern, one
    // `panes` row a face and eight triangles for all of them.
    const slots = lit(panes(2, shaftWidth * 0.2, 1.2, shaftWidth * 0.18, dark), 0.6);
    slots.position.set(at, 1.65 + shaftHeight + 0.4, az + shaftWidth * 0.42 + PROUD);
    group.add(slots);

    const tip = taper(shaftWidth * 0.5, 0.1, 2.4, domeColor, 8);
    tip.position.set(at, 1.65 + shaftHeight + 2, az);
    group.add(tip);

    // --- the front: an arcade, and a door on steps ---
    const face = hallDepth / 2;
    const bays = 3;
    const spread = hallWidth / (bays + 0.7);
    const archHeight = hallHeight * 0.62;
    // The outer bays are open arches and the middle one is the door, framed to
    // fill it between its piers: a door laid over the middle arch read as a
    // board stuck across an opening.
    const archWidth = spread * 0.62;
    const arches = lit(panes(2, archWidth, archHeight, spread * 2 - archWidth, dark), 0.55);
    arches.position.set(0, 0.45, face + PROUD);
    group.add(arches);
    const piers = panes(bays + 1, spread * 0.38, archHeight + 0.5, spread * 0.62, coping, PROUD * 2);
    piers.position.set(0, 0.45, face + PROUD);
    group.add(piers);
    const lintel = panes(1, spread * (bays + 0.7), 0.3, 0, collar, PROUD * 3);
    lintel.position.set(0, 0.45 + archHeight + 0.5, face + PROUD * 1.5);
    group.add(lintel);

    const door = ctx.door({
      width: archWidth - DOOR_JAMB * 2,
      height: archHeight - DOOR_HEAD,
      leaf: doorPaint(rng, style, wall),
      frame: coping,
      sill: 0.45,
      step: course,
    });
    door.position.set(0, 0, face);
    group.add(door);

    return group;
  },
};
