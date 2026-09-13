import { PROUD, STOREY, TONES } from '../contract.ts';
import type { ScenicPart } from '../contract.ts';

/**
 * Stilt house — Southeast Asia.
 *
 * The whole part is one idea: **the gap under the floor**. A house standing on
 * posts has daylight beneath it, and at any distance that band of dark is what
 * separates it from every other small building in the kit. It is also the only
 * part whose most important feature is an absence, which is why the posts are
 * long enough to be obvious — a full storey, not a plinth.
 *
 * The roof is the other half. `southeast-asia` sets a pitch of 1.0 and a hip
 * chance of 0.25, so these come out steep and gabled, and the ridge is carried
 * past the gable ends by 0.8 units on each side — the projecting ridge is a real
 * feature of Batak and Toraja roofs and it is the cheapest way to stop a steep
 * gable reading as an A-frame tent. A darker ridge cap runs the length of it.
 *
 * **The wall is two boards, not one.** A timber house is built out of a lower
 * course and an upper course and they weather differently; here that is one
 * extra box in a darker tone, and it is what stops the room reading as a crate
 * balanced on sticks. The band under the eaves is darker again — the same
 * shadow every part in this kit now draws rather than waits for the sun to
 * give it.
 *
 * The ladder is two struts and is invisible past 60 units. It is here because
 * it is the thing you see when you are standing next to one, and standing next
 * to one is what the avatar does.
 */

const POST = 0.42;

export const stiltHouse: ScenicPart = {
  id: 'stilt-house',
  name: 'Stilt house',
  kind: 'dwelling',
  footprint: 6.4,
  note: 'A two-board room on posts with daylight under it, under a steep capped roof.',

  build(ctx, rng, style) {
    const { THREE, box, panes, tone, column, lit, roof, windows } = ctx;
    const group = new THREE.Group();

    const wall = rng.pick(style.walls);
    const thatch = rng.pick(style.roofs);
    const timber = rng.pick(style.trim);

    const board = tone(wall, TONES.course);
    const shade = tone(wall, TONES.eave);
    const surround = tone(wall, TONES.light);
    const ridgeTile = tone(thatch, TONES.cap);
    const rail = tone(timber, TONES.cap);

    const width = rng.range(4.6, 5.8);
    const depth = width * rng.range(1.05, 1.4);
    const clear = rng.range(2.2, 3.1);
    const body = STOREY * rng.range(0.85, 1.05);

    // Six posts, not four: a four-post house reads as a table.
    for (const x of [-1, 0, 1]) {
      for (const z of [-1, 1]) {
        // Square posts, not hexagonal: a hexagon costs eight triangles more
        // each and there are six of them, which is the whole difference
        // between this part fitting the `dwelling` budget and not. Sawn
        // timber is square anyway.
        const post = column(POST, clear, timber, 4);
        post.position.set((x * (width - 0.9)) / 2, 0, (z * (depth - 0.9)) / 2);
        group.add(post);
      }
    }

    const floor = box(width + 0.5, 0.42, depth + 0.5, rail);
    floor.position.y = clear;
    group.add(floor);

    // The room, in two boards and a shadow.
    const sole = body * 0.42;
    const lowerBoard = box(width, sole, depth, board);
    lowerBoard.position.y = clear + 0.42;
    group.add(lowerBoard);
    // `PROUD` short of the eave band, which caps the wall: level with it, the
    // two tops were one plane in two colours under the roof.
    const shell = box(width - PROUD * 2, body - sole - PROUD, depth - PROUD * 2, wall);
    shell.position.y = clear + 0.42 + sole;
    group.add(shell);
    const eaveBand = box(width + PROUD, 0.3, depth + PROUD, shade);
    eaveBand.position.y = clear + 0.42 + body - 0.3;
    group.add(eaveBand);

    const roofHeight = Math.min(style.pitch * (width / 2 + 1.1), 5.4);
    const ridge = rng.chance(style.hipped) ? depth * 0.4 : depth + 1.6;
    const cap = roof(depth + 1.6, width + 2.2, roofHeight, ridge, thatch);
    cap.rotation.y = Math.PI / 2;
    cap.position.y = clear + 0.42 + body;
    group.add(cap);
    // `PROUD` inside each gable of a gabled roof: flush, its ends lay in the
    // gables' planes and fought them.
    const ridgeCap = box(0.46, 0.32, Math.min(ridge, depth + 1.6 - PROUD * 2), ridgeTile);
    ridgeCap.position.y = clear + 0.42 + body + roofHeight - 0.11;
    group.add(ridgeCap);

    // Veranda, on some. A second floor plane at a different level is what makes
    // the silhouette asymmetric, which is worth more than any amount of detail.
    if (rng.chance(0.5)) {
      const deck = box(width * 0.72, 0.3, 1.9, rail);
      deck.position.set(0, clear + 0.2, depth / 2 + 0.95);
      group.add(deck);
      const handrail = box(width * 0.72, 0.16, 0.18, timber);
      handrail.position.set(0, clear + 1.1, depth / 2 + 1.85);
      group.add(handrail);
    }

    // The ladder.
    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const foot = depth / 2 + 1.5;
    for (const side of [-0.55, 0.55]) {
      group.add(ctx.strut(at(side, 0, foot), at(side, clear + 0.3, depth / 2 + 0.2), 0.16, timber));
    }

    // A lamp inside a one-room house, seen through the door: dimmer than a
    // window and never more than half of one. See `ctx.lit`.
    const doorway = lit(panes(1, 1.05, body * 0.8, 0, rng.pick(style.glass), PROUD * 2), 0.5);
    doorway.position.set(0, clear + 0.42, depth / 2 + PROUD);
    group.add(doorway);
    const lintel = panes(1, 1.4, 0.2, 0, rail, PROUD * 3);
    lintel.position.set(0, clear + 0.42 + body * 0.8, depth / 2 + PROUD * 1.5);
    group.add(lintel);

    // Two shuttered windows on one flank, which is the side an alley sees.
    const side = rng.sign();
    const row = windows({
      count: 2,
      width: 1.05,
      height: 1.05,
      frame: surround,
      spread: depth * 0.34,
      strength: 0.8,
    });
    row.rotation.y = (side * Math.PI) / 2;
    row.position.set((side * width) / 2, clear + 0.42 + body * 0.4, 0);
    group.add(row);

    return group;
  },
};
