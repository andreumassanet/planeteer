import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Grand Palace and Wat Phra Kaew, Bangkok.
 *
 * **Why Thailand:** mainland South-East Asia had Angkor Wat and Bagan, and both
 * are stone and brick — a temple mountain and a plain of stupas. What the
 * region's living architecture looks like, the steep, layered, upswept roof in
 * orange and green tile with a horn at every gable, was nowhere on the planet.
 * The Grand Palace compound is where every photograph of that roof is taken.
 *
 * ---------------------------------------------------------------------------
 * The crop: three buildings inside one white wall
 * ---------------------------------------------------------------------------
 *
 * The real compound is about 400 by 500 m with dozens of halls. The model keeps
 * the three that name it, each a different shape so the ink draws three
 * silhouettes rather than one roof three times:
 *
 * 1. **The ordination hall of Wat Phra Kaew** (the Temple of the Emerald
 *    Buddha), front left, long side to the viewer: a white hall on a white
 *    platform ringed by a colonnade, under the Thai roof — see below.
 * 2. **Phra Si Rattana Chedi**, back left: the gold bell-shaped stupa in the
 *    Sri Lankan manner, on stepped round bases, with a ringed spire. It is the
 *    tallest thing in the model, as it is the tallest thing over the wall in
 *    life, and it stands *behind* the hall so its spire rises out of the roofs.
 * 3. **Chakri Maha Prasat**, right: the 1882 throne hall, a European body under
 *    three Thai spired roofs, the middle one taller. The contrast of a
 *    Renaissance facade with a Thai skyline is the thing it is known for.
 *
 * Round them, the **white crenellated wall** with a fort at each corner and a
 * spired gate in the front, on a paved court.
 *
 * ---------------------------------------------------------------------------
 * The Thai roof, which is the point
 * ---------------------------------------------------------------------------
 *
 * A Thai temple roof is layered two ways at once, and both are what separate
 * it from the Chinese and Korean roofs already in the world:
 *
 * - **In height**: a lower skirt roof over the colonnade (here `green`, the
 *   colour of the tile margins) and an upper roof over the hall (`orange`), with
 *   the hall's own wall showing between them.
 * - **In length**: at each gable end the roof steps down in overlapping tiers,
 *   so the end of the building is three gables one in front of and below the
 *   other. Here that is the upper roof, an end tier a step lower, and the skirt
 *   in front of both.
 *
 * Every gable is a triangular prism, steep: the upper roof is 55 degrees, the
 * end tiers 52, the skirt 35. Every gable end carries a **chofa**, the slender
 * horn that rises from the apex, as a `gold` beam leaning outward; the end
 * tiers also carry the gilt bargeboards down their rakes and the small upturned
 * hooks at the eave corners, and a gilt pediment standing `PROUD` of the tile.
 * The horns are the single feature by which a Thai roof is named from far off,
 * so there are six of them and they break the skyline at three heights.
 *
 * ---------------------------------------------------------------------------
 * Proportion
 * ---------------------------------------------------------------------------
 *
 * The wall is 69.6 by 53.6 units with a fort on each corner, so the reach is
 * the forts': `hypot(34, 26)` plus a fort's corner, 45.8. The chedi's spire
 * tops out at 37.4, the tier's 40 less a margin. Half-diagonal over height is
 * 1.22 against the 2.0 cap. Against life the plan is squeezed about
 * 6:1 and the heights about 2:1 (the chedi is 40 m, the hall's ridge about
 * 30 m), so the buildings stand closer together and taller in their court than
 * they do — the same trade as every compound in this folder: a palace read from
 * outside its wall is its skyline.
 *
 * The real height is left out of the source: a compound has no one height.
 */

/** The wall's centre lines and section. */
const WALL_X = 34;
const WALL_Z = 26;
const WALL_THICK = 1.6;
const WALL_HEIGHT = 5;

/** The ordination hall's centre. Its ridge runs along X. */
const HALL_X = -12;
const HALL_Z = 8;

/** The chedi's centre, behind the hall. */
const CHEDI_X = -15;
const CHEDI_Z = -13;

/** The throne hall's centre. */
const THRONE_X = 18;
const THRONE_Z = 3;

/**
 * The hall's three roofs: eaves height, half-width, rise, length, and for the
 * end tiers the centre's distance from the hall's centre.
 */
const SKIRT = { eaves: 8.6, half: 7.4, rise: 5.2, length: 31 };
const UPPER = { eaves: 12.2, half: 5.6, rise: 8.0, length: 24.6 };
const END_TIER = { eaves: 11.4, half: 5.9, rise: 7.6, length: 3.6, at: 13.1 };

export const grandPalace: Monument = {
  id: 'grand-palace',
  name: 'Grand Palace and Wat Phra Kaew',
  iso: 'THA',
  lat: 13.75,
  lon: 100.4913,
  tier: 'building',
  footprint: 46.5,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, tone, box, column, taper, strut } = ctx;

    const lime = palette.white; // the walls, the forts, the hall and the throne hall
    const plinth = tone(palette.white, 0.8); // the throne hall's base course
    const pillar = palette.cream; // the colonnade, a shade off the wall behind it
    const court = palette.bone; // the paving inside the wall
    const gilt = palette.gold; // the chedi, the horns, the bargeboards, the doors
    const leaf = tone(palette.gold, 0.82); // the pediments, under the gilt bargeboards
    const tile = palette.orange; // the roofs
    const tileShade = tone(palette.orange, 0.86); // the end tiers, a step behind the upper roof
    const margin = palette.green; // the skirt roofs and the middle course of every spire
    const door = palette.bark; // the gate's passage
    const glass = tone(palette.slate, 0.8); // the throne hall's windows: never black

    const draft = new THREE.Group();

    const put = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      draft.add(mesh);
      return mesh;
    };
    const block = (w: number, h: number, d: number, color: number, x: number, y: number, z: number): Mesh =>
      put(box(w, h, d, color), x, y, z);
    const beam = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      thickness: number,
      color: number,
    ): void => {
      draft.add(strut(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), thickness, color));
    };

    /**
     * A gable: a triangular prism with its base at `eaves`, `2 * half` wide and
     * `rise` tall, running `length` along Z (or along X with `alongX`). A
     * three-sided `column` has its flat face on +Z at the apothem and its apex
     * at twice that behind, so scaled by `half / sqrt(3)` across and `rise / 3`
     * deep and laid down a quarter turn about X it is exactly that triangle. The
     * mesh carries the scale and the pivot the yaw, so the scale is applied in
     * the prism's own axes (`T * R * S`).
     */
    const gable = (
      cx: number,
      cz: number,
      eaves: number,
      length: number,
      half: number,
      rise: number,
      color: number,
      alongX: boolean,
    ): void => {
      const prism = column(1, length, color, 3);
      prism.scale.set(half / Math.sqrt(3), 1, rise / 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, rise / 3, -length / 2);
      const pivot = new THREE.Group();
      pivot.add(prism);
      if (alongX) pivot.rotation.y = Math.PI / 2;
      pivot.position.set(cx, eaves, cz);
      draft.add(pivot);
    };

    /** The horn on a gable's apex: a gilt beam leaning out and up, `side` the way out along X. */
    const chofa = (x: number, apex: number, z: number, side: number): void => {
      beam(x - side * 0.2, apex - 0.6, z, x + side * 1.4, apex + 2.2, z, 0.5, gilt);
    };

    // -----------------------------------------------------------------------
    // 1. The court and the wall.
    // -----------------------------------------------------------------------
    block(2 * WALL_X - 0.6, 0.3, 2 * WALL_Z - 0.6, court, 0, 0, 0);

    block(2 * WALL_X, WALL_HEIGHT, WALL_THICK, lime, 0, 0, WALL_Z);
    block(2 * WALL_X, WALL_HEIGHT, WALL_THICK, lime, 0, 0, -WALL_Z);
    block(WALL_THICK, WALL_HEIGHT, 2 * WALL_Z, lime, WALL_X, 0, 0);
    block(WALL_THICK, WALL_HEIGHT, 2 * WALL_Z, lime, -WALL_X, 0, 0);

    // The crenellation: square merlons every five units, a little thinner than
    // the wall so their faces step in from it. The front leaves room for the gate.
    const merlon = (x: number, z: number): void => {
      block(1.3, 1.5, 1.3, lime, x, WALL_HEIGHT, z);
    };
    for (let k = -6; k <= 6; k++) {
      const x = k * 5;
      merlon(x, -WALL_Z);
      if (Math.abs(x) > 6) merlon(x, WALL_Z);
    }
    for (let k = -4; k <= 4; k++) {
      merlon(WALL_X, k * 5);
      merlon(-WALL_X, k * 5);
    }

    // A fort on each corner: a white hexagonal bastion under a small tiled cap.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        put(column(2.8, 6.6, lime, 6), sx * WALL_X, 0, sz * WALL_Z);
        put(taper(2.2, 0.25, 3.2, tile, 6), sx * WALL_X, 6.6, sz * WALL_Z);
      }
    }

    // The gate in the front wall, its passage dark right through, under a
    // three-course spire like the throne hall's.
    block(8, 8, 5, lime, 0, 0, WALL_Z);
    block(3.2, 5.2, 5.2, door, 0, 0, WALL_Z);
    put(taper(3.4, 2.2, 2.4, tile, 4), 0, 8, WALL_Z);
    put(taper(2.4, 1.2, 2.2, margin, 4), 0, 10.2, WALL_Z);
    put(taper(1.3, 0.06, 6.0, gilt, 4), 0, 12.2, WALL_Z);

    // -----------------------------------------------------------------------
    // 2. The ordination hall of Wat Phra Kaew.
    // -----------------------------------------------------------------------
    block(31, 1.6, 15.5, lime, HALL_X, 0, HALL_Z);
    // The gilt band round the platform stops short of its top, so the two tops
    // are not one plane.
    block(31.6, 0.5, 16.1, gilt, HALL_X, 0.9, HALL_Z);
    // The hall rises through the skirt roof to the upper roof's eaves; the band
    // of it between the two roofs is the clerestory wall.
    block(28, 10.8, 10, lime, HALL_X, 1.6, HALL_Z);

    // The colonnade under the skirt's eaves, seven a side.
    for (let i = 0; i < 7; i++) {
      const x = HALL_X - 12 + i * 4;
      for (const sz of [-1, 1]) block(1.0, 7.0, 1.0, pillar, x, 1.6, HALL_Z + sz * 6.6);
    }
    // Three gilt doors on the long side facing the court, standing out of the wall.
    for (const dx of [-7, 0, 7]) block(2.4, 5.0, 0.4, gilt, HALL_X + dx, 1.6, HALL_Z + 4.92);

    // The roofs: the skirt, the upper roof, and an end tier at each gable.
    gable(HALL_X, HALL_Z, SKIRT.eaves, SKIRT.length, SKIRT.half, SKIRT.rise, margin, true);
    gable(HALL_X, HALL_Z, UPPER.eaves, UPPER.length, UPPER.half, UPPER.rise, tile, true);

    const skirtEnd = SKIRT.length / 2;
    const skirtApex = SKIRT.eaves + SKIRT.rise;
    const upperEnd = UPPER.length / 2;
    const upperApex = UPPER.eaves + UPPER.rise;
    const tierEnd = END_TIER.at + END_TIER.length / 2;
    const tierApex = END_TIER.eaves + END_TIER.rise;

    for (const side of [-1, 1]) {
      gable(HALL_X + side * END_TIER.at, HALL_Z, END_TIER.eaves, END_TIER.length, END_TIER.half, END_TIER.rise, tileShade, true);

      // Gilt pediments, 0.2 proud of the tile, set inside each triangle so
      // their rakes run parallel to the roof's.
      const tierHalf = 5.0;
      gable(
        HALL_X + side * (tierEnd + 0.05),
        HALL_Z,
        12.1,
        0.3,
        tierHalf,
        (tierHalf * END_TIER.rise) / END_TIER.half,
        leaf,
        true,
      );
      const skirtHalf = 6.4;
      gable(
        HALL_X + side * (skirtEnd + 0.05),
        HALL_Z,
        9.2,
        0.3,
        skirtHalf,
        (skirtHalf * SKIRT.rise) / SKIRT.half,
        leaf,
        true,
      );

      // The horns: one on every tier, at three heights.
      chofa(HALL_X + side * upperEnd, upperApex, HALL_Z, side);
      chofa(HALL_X + side * (tierEnd + 0.2), tierApex, HALL_Z, side);
      chofa(HALL_X + side * (skirtEnd + 0.2), skirtApex, HALL_Z, side);

      // The end tier's bargeboards and the hooks at its eave corners, and the
      // skirt's hooks.
      const rakeX = HALL_X + side * (tierEnd + 0.1);
      for (const sz of [-1, 1]) {
        beam(rakeX, tierApex, HALL_Z, rakeX, END_TIER.eaves - 0.2, HALL_Z + sz * 6.1, 0.45, gilt);
        beam(rakeX, END_TIER.eaves - 0.2, HALL_Z + sz * 6.1, rakeX + side * 0.5, END_TIER.eaves + 1.2, HALL_Z + sz * 7.0, 0.4, gilt);
        const hookX = HALL_X + side * (skirtEnd + 0.1);
        beam(hookX, SKIRT.eaves - 0.2, HALL_Z + sz * 7.6, hookX + side * 0.5, SKIRT.eaves + 1.2, HALL_Z + sz * 8.4, 0.4, gilt);
      }
    }

    // -----------------------------------------------------------------------
    // 3. Phra Si Rattana Chedi: a terrace, three round bases, the bell, the
    //    square harmika, the ringed spire. Ten sides on everything round, so the
    //    bell reads as a bell and not as a nut.
    // -----------------------------------------------------------------------
    block(15, 1.4, 15, lime, CHEDI_X, 0, CHEDI_Z);
    block(12.4, 1.0, 12.4, pillar, CHEDI_X, 1.4, CHEDI_Z);
    let y = 2.4;
    for (const radius of [5.8, 5.2, 4.6]) {
      put(column(radius, 1.3, gilt, 10), CHEDI_X, y, CHEDI_Z);
      y += 1.3;
    }
    for (const [bottom, top, height] of [
      [4.3, 4.7, 1.4],
      [4.7, 4.4, 3.2],
      [4.4, 3.2, 3.6],
      [3.2, 1.6, 2.8],
    ] as const) {
      put(taper(bottom, top, height, gilt, 10), CHEDI_X, y, CHEDI_Z);
      y += height;
    }
    block(3.6, 2.2, 3.6, leaf, CHEDI_X, y - 0.3, CHEDI_Z);
    y += 1.9;
    put(column(1.3, 0.8, gilt, 8), CHEDI_X, y, CHEDI_Z);
    y += 0.8;
    // The rings: each course starts a little wider than the last one ended, so
    // every ring is a ledge with its own ink line.
    for (let i = 0; i < 6; i++) {
      const bottom = 1.5 - i * 0.15;
      put(taper(bottom, bottom - 0.23, 1.6, gilt, 8), CHEDI_X, y, CHEDI_Z);
      y += 1.6;
    }
    put(taper(0.5, 0.05, 7.8, gilt, 6), CHEDI_X, y, CHEDI_Z);

    // -----------------------------------------------------------------------
    // 4. Chakri Maha Prasat: the European body, its portico and windows, and
    //    the three Thai spires on its roof.
    // -----------------------------------------------------------------------
    block(26, 9, 9, lime, THRONE_X, 0, THRONE_Z);
    block(26.4, 1.2, 9.4, plinth, THRONE_X, 0, THRONE_Z);
    block(26.6, 0.7, 9.6, pillar, THRONE_X, 8.2, THRONE_Z);
    const front = THRONE_Z + 4.5;
    block(7, 10, 2.4, lime, THRONE_X, 0, front + 0.8);
    gable(THRONE_X, front + 1.05, 10, 2.1, 3.8, 2.0, pillar, false);
    block(2.4, 4.4, 0.4, door, THRONE_X, 0, front + 1.92);
    for (const dx of [5.5, 8.5, 11.5]) {
      for (const sx of [-1, 1]) {
        for (const wy of [2.0, 5.4]) block(1.4, 2.2, 0.4, glass, THRONE_X + sx * dx, wy, front - 0.08);
      }
    }

    /** A spired roof, `f` its size against the middle one's. */
    const prasat = (x: number, f: number, spire: number): void => {
      let at = 8.9;
      for (const [bottom, top, height, color] of [
        [4.4, 3.0, 2.6, tile],
        [3.4, 2.1, 2.3, margin],
        [2.5, 1.4, 2.0, tile],
        [1.6, 1.2, 1.4, gilt],
        [1.3, 0.9, 1.4, gilt],
      ] as const) {
        put(taper(bottom * f, top * f, height * f, color, 4), x, at, THRONE_Z);
        // Each course is sunk 0.2 into the one under it, so no eave hangs over daylight.
        at += height * f - 0.2;
      }
      put(taper(1.0 * f, 0.06, spire, gilt, 4), x, at + 0.2, THRONE_Z);
    };
    prasat(THRONE_X, 1, 9);
    prasat(THRONE_X - 8.5, 0.8, 5.5);
    prasat(THRONE_X + 8.5, 0.8, 5.5);

    return ctx.merge(draft);
  },
};
