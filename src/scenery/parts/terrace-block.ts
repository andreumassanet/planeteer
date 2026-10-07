import { PROUD, STOREY, TONES, doorPaint } from '../contract.ts';
import type { ScenicPart } from '../contract.ts';

/**
 * Terrace block — the fabric of a European street.
 *
 * The part that makes a *town* rather than a village. Four to seven storeys, a
 * shopfront on the ground floor in a different colour, a mansard or a cornice on
 * top, and two chimney pots. Stand six of these in a row and the
 * street is there; stand six gabled houses in a row and it is still a hamlet.
 *
 * **The ground floor is half the trick.** A five-storey box in one colour is a
 * five-storey box. The same box with its bottom 3.8 units in a darker, more
 * saturated colour — a *tone* of the trim, see below — is a building with shops
 * under it, and it costs one mesh.
 * That band is also the only part of the building an avatar standing next to it
 * can actually see, so it gets a glazed front, a doorway and a fascia over both.
 *
 * **The bays are the other half, and they are what the redesign added.** A
 * terrace is not a wall with holes in it, it is a repeat: pier, window, pier,
 * window, pier. Here the piers are one `panes` plate row in a lighter tone of
 * the same render — one mesh for all of them, ten triangles each, standing
 * `PROUD` so the pen draws a vertical line down the facade at every bay. What
 * that buys is that the front is *articulated* at 120 units, where a flat wall
 * with three glazing bands on it was a slab with stripes.
 *
 * The glazing follows the same rule the whole kit now follows: **reveals where
 * somebody stands, painted frames above.** The first two floors get real
 * frames with two panes and a reveal; everything higher is a painted frame row
 * and a pane row, two meshes and twelve triangles a floor, because at the fifth
 * floor a reveal is a fifth of a pixel. The back gets one pane row a floor,
 * which is one lit room.
 *
 * The mansard is a `roof` with a ridge almost as long as the block and a rise of
 * about half a storey — flat enough to read as a roof line rather than as a
 * gable, which is what a mansard is — with a darker ridge cap along it. On the
 * flat-roofed variants a cornice and a parapet do the same job for the same
 * reason: a block with nothing on top ends rather than finishes.
 */

const PLINTH = 0.45;
/**
 * Floors that get a real reveal, counted from the first floor up.
 *
 * A reveal is a ten-triangle plate and a painted frame is two. Two floors of
 * them plus the shopfront is about 100 triangles of the part's 456; seven
 * floors of them is 300, and past the second floor a 0.16-unit reveal is a
 * fifth of a pixel at the distance a five-storey building is seen from.
 */
const FRAMED_FLOORS = 2;

export const terraceBlock: ScenicPart = {
  id: 'terrace-block',
  name: 'Terrace block',
  kind: 'block',
  footprint: 8.4,
  note: 'Four to seven storeys of bays over a shopfront, under a mansard or a cornice. The street, not the house.',

  build(ctx, rng, style) {
    const { THREE, box, panes, tone, lit, rim, roof, windows } = ctx;
    const group = new THREE.Group();

    const wall = rng.pick(style.walls);
    const shop = rng.pick(style.trim);
    const tile = rng.pick(style.roofs);

    const course = tone(wall, TONES.course);
    const pier = tone(wall, TONES.light);
    const shade = tone(wall, TONES.eave);
    const fascia = tone(shop, TONES.cap);
    const ridgeTile = tone(tile, TONES.cap);

    const width = rng.range(9, 12.8);
    const depth = rng.range(6.8, 8.6);
    // A block is at least four storeys whatever the region says: below that it
    // is a house, and the kit already has houses.
    const storeys = rng.between(Math.max(4, style.storeys[0]), Math.max(5, style.storeys[1] + 2));
    const bays = width > 11 ? 3 : 2;

    group.add(box(width + 0.4, PLINTH, depth + 0.4, course));

    // A tone of the trim rather than the trim itself: `style.trim` carries
    // `skyBlue` and `gold`, which are *lighter* than most walls, and a whole
    // ground storey of either was the brightest field in the frame at Palma
    // instead of the darker base the paragraph above claims. At `course` it is
    // the same hue and reads as a shopfront under a house.
    const ground = box(width, STOREY, depth, tone(shop, TONES.course));
    ground.position.y = PLINTH;
    group.add(ground);

    const upper = (storeys - 1) * STOREY;
    // `PROUD` short of the eave band, which caps the wall: level with it, the
    // two tops were one plane in two colours under the roof or the cornice.
    const shell = box(width, upper - PROUD, depth, wall);
    shell.position.y = PLINTH + STOREY;
    group.add(shell);

    const top = PLINTH + STOREY + upper;

    // --- the shopfront: glass, a door, and a fascia over both ---
    const front = depth / 2;
    // The door stands in its own frame inside the corner and the glass keeps
    // clear of it: at 0.38 of the width, the narrowest blocks ran the frame
    // into the last pane.
    const shopGlass = lit(panes(3, width * 0.2, STOREY * 0.5, width * 0.045, ctx.glass), 0.9);
    shopGlass.position.set(-width * 0.08, PLINTH + STOREY * 0.24, front + PROUD);
    group.add(shopGlass);
    const shopDoor = ctx.door({
      width: 1.3,
      height: STOREY * 0.66,
      leaf: doorPaint(rng, style, wall),
      frame: fascia,
      sill: PLINTH,
      step: course,
    });
    shopDoor.position.set(width / 2 - 1.1, 0, front);
    group.add(shopDoor);
    const board = panes(1, width - 0.4, 0.5, 0, fascia, PROUD * 3);
    board.position.set(0, PLINTH + STOREY * 0.8, front + PROUD * 1.5);
    group.add(board);

    // --- the bays: piers standing proud of the render, in a lighter tone ---
    const piers = panes(bays + 1, 0.38, upper - 0.3, width / (bays + 0.55), pier, PROUD * 1.5);
    piers.position.set(0, PLINTH + STOREY, front + PROUD * 0.75);
    group.add(piers);

    // --- one row of windows a floor, front and back ---
    const spread = width / (bays + 0.55);
    for (let floor = 1; floor < storeys; floor++) {
      const sill = PLINTH + floor * STOREY + STOREY * 0.3;
      const glazing = STOREY * 0.5;
      if (floor <= FRAMED_FLOORS) {
        const row = windows({ count: bays, width: 1.5, height: glazing, frame: pier, spread });
        row.position.set(0, sill, front);
        group.add(row);
      } else {
        // Painted on, and pooled: one frame row and one pane row for the whole
        // floor. Two meshes and twelve triangles against four and eighteen, and
        // the floor lights as one flat, which above the second storey is what a
        // block of flats does anyway.
        const flat = panes(bays, 1.5, glazing, spread - 1.5, pier);
        flat.position.set(0, sill, front + PROUD);
        group.add(flat);
        const pane = lit(panes(bays, 1.22, glazing - 0.28, spread - 1.22, ctx.glass));
        pane.position.set(0, sill + 0.14, front + PROUD * 2);
        group.add(pane);
      }

      const back = lit(panes(bays, 1.4, STOREY * 0.5, spread - 1.4, ctx.glass));
      back.rotation.y = Math.PI;
      back.position.set(0, sill, -front - PROUD);
      group.add(back);
    }

    // The shadow the cornice or the mansard eaves throw down the front.
    const eaveBand = box(width + PROUD * 2, 0.34, depth + PROUD * 2, shade);
    eaveBand.position.y = top - 0.34;
    group.add(eaveBand);

    // --- what finishes it ---
    if (rng.chance(0.55)) {
      const rise = STOREY * rng.range(0.5, 0.78);
      const ridge = width * 0.72;
      const mansard = roof(width + 0.7, depth + 0.7, rise, ridge, tile);
      mansard.position.y = top;
      group.add(mansard);
      const ridgeCap = box(ridge + 0.3, 0.32, 0.5, ridgeTile);
      ridgeCap.position.y = top + rise - 0.11;
      group.add(ridgeCap);
      for (const side of [-1, 1]) {
        const pot = box(0.7, 1.5, 0.7, course);
        pot.position.set(side * width * rng.range(0.24, 0.34), top + rise * 0.6, 0);
        group.add(pot);
      }
    } else {
      const cornice = box(width + 0.8, 0.55, depth + 0.8, pier);
      cornice.position.y = top;
      group.add(cornice);
      const parapet = rim(width + 0.4, depth + 0.4, 0.4, rng.range(0.7, 1.4), wall);
      parapet.position.y = top + 0.55;
      group.add(parapet);
      const stack = box(0.9, 1.7, 0.9, course);
      stack.position.set(width * rng.range(-0.3, 0.3), top + 0.55, depth * -0.2);
      group.add(stack);
      const pot = box(1.1, 0.28, 1.1, ridgeTile);
      pot.position.set(stack.position.x, top + 2.25, stack.position.z);
      group.add(pot);
    }

    return group;
  },
};
