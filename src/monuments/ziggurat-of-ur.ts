import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Ziggurat of Ur — Dhi Qar, Iraq.
 *
 * **Why Iraq:** Mesopotamia had nothing. The world's landmark list ran from
 * Petra to Persepolis with a thousand kilometres of the Tigris and the Euphrates
 * between them and not one pin on it — no Iraq, no Syria, no Lebanon, no Kuwait
 * — which is to say the place cities were invented in was the one region with
 * nothing to walk to. The ziggurat at Ur is the best preserved of them, built by
 * Ur-Nammu about 2100 BC and re-faced twice since, and it is the shape all the
 * others are drawn from.
 *
 * **And it is not a pyramid, which is the whole reason it earns a place.** The
 * world already holds Giza, Chichén Itzá and Teotihuacán, and a fourth
 * four-sided mass that gets smaller as it rises would be nothing new. Four
 * things separate a ziggurat from a step pyramid at 260 pixels, and the model is
 * built to spend everything on them:
 *
 * 1. **The triple staircase.** One flight straight out from the front and two
 *    running up along the face to meet it — a hundred steps converging on one
 *    gate. Nothing else in antiquity is approached like this.
 * 2. **Very unequal stages.** A pyramid's terraces are a series; a ziggurat is
 *    one enormous battered terrace with two much smaller boxes and a shrine on
 *    top. Three masses, not nine.
 * 3. **A rectangular plan**, 64 by 45 metres. Every prism `ctx` makes is regular,
 *    so each stage is a square `taper` inside a group carrying `scale.x` — and
 *    that only works because the batter is a *fraction*: with `sx = X0/Z0` fixed,
 *    `X1/Z1` has to be the same number, so every stage narrows by 0.9 in both
 *    axes at once. It is not a limitation here, it is what a batter is.
 * 4. **Mudbrick.** `clay` and `brown`, with the bitumen-set lower courses in
 *    `bark` — never the pale limestone of the other three.
 *
 * ---------------------------------------------------------------------------
 * The vertical is stretched 1.39x and `MAX_ASPECT` had nothing to do with it
 * ---------------------------------------------------------------------------
 *
 * Ur is 64 by 45 metres and stood about 30: a height-to-width of 0.47, which
 * over this model's 52-unit base would be 24.4 units. It ships at **33.9**.
 *
 * The cap is not what forced that and the arithmetic is worth writing down,
 * because it is easy to get backwards. `validate` tests
 * `2 * radius <= MAX_ASPECT * height` with `MAX_ASPECT` at 4, so what has to
 * hold is **half-diagonal over height at or under 2.00** — and the honest
 * ziggurat, at 37.5 out and 24.4 up, is 1.54 and passes comfortably. Nothing
 * mechanical objected. What objected was the picture: at 24 units on an 88-unit
 * spread the three stages stop being unequal masses and become a low mound with
 * lines on it, which is the shape of a *platform*, not of the thing a platform
 * was invented to hold up. This is Sigiriya's finding rather than the Parthenon's
 * — the honest proportion is not automatically the one to protect, and every
 * photograph of Ur is taken from the foot of the central staircase, where the
 * terrace fills the sky and the 45-metre depth is behind you and out of frame.
 *
 * Half-diagonal over height as built: **1.11** against the 2.00 cap.
 *
 * What the stretch broke, and where it was paid for: the stairs. The real
 * central flight climbs 11 m over about 30 of run, which is 20 degrees. The
 * model's is 14.0 over 23, which is **31 degrees** — steeper, and steeper in the
 * same proportion as the building, so the two agree with each other. A
 * ziggurat's stair is steep in every reconstruction drawing ever made, which is
 * the one place this stretch improves the picture rather than costing something.
 *
 * ---------------------------------------------------------------------------
 * It owns its plinth and nothing else
 * ---------------------------------------------------------------------------
 *
 * The ground at the placed coordinate is `grassland`, which `groundColorAt`
 * paints `#a9ae2b`. There is no apron, no courtyard floor and no temenos
 * pavement: the two-unit plinth is the building's own foot — the stepped-out
 * bottom course that every mudbrick wall in Mesopotamia stands on — and it stops
 * at the wall line. The stairs run down off it onto whatever the biome says is
 * there, which is what a stair does.
 *
 * **The temenos wall was built and then taken out**, and the note beside where
 * it used to be has the measurement. Short version: an enclosure round a mass
 * this wide is seen edge-on from the quarter view, so 250 triangles bought two
 * dark stubs at the base and five units of extra declared footprint. What is
 * there instead is stair — cheek walls on the two flanking flights and an apron
 * at the foot of the central one — which is all on the face the camera is
 * pointed at.
 */

/** How much of its own half-width each stage loses between its foot and its top. */
const BATTER = 0.9;

/**
 * The three masses, as [half-width in x at the foot, half-depth in z at the
 * foot, height, z of the centre]. The rectangle is `scale.x` on a group holding
 * a square `taper`; see the note above for why the batter has to be a fraction.
 */
const STAGES: [halfX: number, halfZ: number, height: number, z: number][] = [
  [25.0, 16.0, 12.0, -8],
  [17.5, 11.5, 9.0, -10],
  [11.5, 7.5, 6.0, -11],
];

/** Top of the plinth, which is where the stages start. */
const PLINTH = 2.0;

/** Steps in the central flight, and in each of the two that run along the face. */
const CENTRE_STEPS = 13;
const FLANK_STEPS = 9;

/** Where the central stair starts on the ground, and the half-width of its ramp. */
const STAIR_FOOT = 31;
const STAIR_HALF = 5.5;

export const zigguratOfUr: Monument = {
  id: 'ziggurat-of-ur',
  name: 'Ziggurat of Ur',
  iso: 'IRQ',
  lat: 30.9626,
  lon: 46.1031,
  tier: 'building',
  footprint: 38,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, taper } = ctx;

    const brick = palette.clay; // baked mudbrick: the warm red every reconstruction uses
    const bitumen = palette.bark; // the plinth and the gate pylons, set in pitch
    const stair = palette.brown; // the three flights, a shade off the wall they climb
    const upper = palette.tan; // the third stage, weathered paler than the terrace
    const shrine = palette.white; // the whitewashed temple on top, and the warm white

    const group = new THREE.Group();

    const block = (
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
      color: number,
    ): Mesh => {
      const mesh = box(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), color);
      mesh.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
      group.add(mesh);
      return mesh;
    };

    /**
     * One battered rectangular mass. The group carries `scale.x` and no
     * rotation, the child carries the geometry and no transform, so nothing here
     * can meet the `T * R * S` trap — there is no R.
     */
    const mass = (halfX: number, halfZ: number, height: number, y: number, z: number, color: number): Group => {
      const shell = new THREE.Group();
      shell.scale.x = halfX / halfZ;
      shell.position.set(0, y, z);
      shell.add(taper(halfZ, halfZ * BATTER, height, color, 4));
      group.add(shell);
      return shell;
    };

    // -----------------------------------------------------------------------
    // 1. The plinth. Two units of dark bitumen-set brick stepped out past every
    //    wall above it, which is the one horizontal ink line the great terrace
    //    gets and the reason it reads as standing on something.
    // -----------------------------------------------------------------------
    block(-26, 26, 0, PLINTH, -25, 9, bitumen);

    // -----------------------------------------------------------------------
    // 2. The three stages. Unequal on purpose — 13.5, 10.5 and 7.5 units — so
    //    the silhouette is one great mass with two boxes on it rather than a
    //    series of terraces, which is what would make it a pyramid.
    // -----------------------------------------------------------------------
    let level = PLINTH;
    const tops: number[] = [];
    for (let i = 0; i < STAGES.length; i++) {
      const [halfX, halfZ, height, z] = STAGES[i]!;
      mass(halfX, halfZ, height, level, z, i === 2 ? upper : brick);
      level += height;
      tops.push(level);
    }
    const TERRACE = tops[0]!; // 15.5: where all three stairs arrive

    // The parapet round the first terrace, on three sides. The front is left
    // open because the stairs land there, and because a parapet on the near edge
    // of a terrace is the shallow-camera trap in miniature.
    const t1 = STAGES[0]!;
    const topX = t1[0] * BATTER;
    const topZ = t1[1] * BATTER;
    block(-topX, topX, TERRACE, TERRACE + 1.3, t1[3] - topZ - 0.6, t1[3] - topZ + 0.9, bitumen);
    for (const side of [-1, 1]) {
      block(
        side * (topX + 0.6),
        side * (topX - 0.9),
        TERRACE,
        TERRACE + 1.3,
        t1[3] - topZ,
        t1[3] + topZ,
        bitumen,
      );
    }

    // -----------------------------------------------------------------------
    // 3. The shrine. The one white thing in a red building, and the reason the
    //    eye goes to the top: a whitewashed temple on the summit is what a
    //    ziggurat is *for*, and Sumerian temples were limewashed.
    // -----------------------------------------------------------------------
    const summit = tops[2]!;
    block(-7.5, 7.5, summit, summit + 4.2, -15.7, -6.3, shrine);
    block(-8.2, 8.2, summit + 4.2, summit + 4.9, -16.4, -5.6, upper);
    // Four niches in the shrine's front wall, stepped 0.35 proud so each gets
    // its own ink line. Flush, they would be paint: `OutlineEffect` hulls each
    // mesh separately and a face coplanar with its neighbour draws nothing.
    for (let i = 0; i < 4; i++) {
      const x = -5.4 + i * 3.6;
      block(x - 1.0, x + 1.0, summit + 0.5, summit + 3.5, -6.3, -5.95, bitumen);
    }

    // -----------------------------------------------------------------------
    // 4. The central staircase. Thirteen steps from the ground at z = 31 to the
    //    terrace at 15.5 — 34 degrees, and see the note above for why it is
    //    steeper than the real one.
    //
    //    Each step is a whole block standing on y = 0 rather than a tread laid
    //    on the one below, because that is what the masonry ramp actually is and
    //    because it puts the ink line at the riser, where a stair is read.
    // -----------------------------------------------------------------------
    const run = STAIR_FOOT - 8;
    for (let i = 0; i < CENTRE_STEPS; i++) {
      const z1 = STAIR_FOOT - (i * run) / CENTRE_STEPS;
      const z0 = STAIR_FOOT - ((i + 1) * run) / CENTRE_STEPS;
      block(-STAIR_HALF, STAIR_HALF, 0, ((i + 1) * TERRACE) / CENTRE_STEPS, z0, z1, stair);
    }
    // The two cheek walls. They turn the flight from a wedge into a channel,
    // which is what every drawing of Ur has, and they are the strongest pair of
    // parallel lines in the model.
    for (const side of [-1, 1]) {
      for (let i = 0; i < CENTRE_STEPS; i += 2) {
        const z1 = STAIR_FOOT - (i * run) / CENTRE_STEPS;
        const z0 = STAIR_FOOT - ((i + 2) * run) / CENTRE_STEPS;
        const top = Math.min(TERRACE, ((i + 2) * TERRACE) / CENTRE_STEPS) + 1.4;
        block(side * STAIR_HALF, side * (STAIR_HALF + 1.6), 0, top, z0, z1, bitumen);
      }
    }

    // -----------------------------------------------------------------------
    // 5. The two flights along the face. They start at the outer ends of the
    //    terrace and climb inward, so all three arrive at one gate — the whole
    //    point of the arrangement and the thing that says ziggurat.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      for (let i = 0; i < FLANK_STEPS; i++) {
        const x1 = side * (23.0 - (i * 15.5) / FLANK_STEPS);
        const x0 = side * (23.0 - ((i + 1) * 15.5) / FLANK_STEPS);
        block(x0, x1, 0, ((i + 1) * TERRACE) / FLANK_STEPS, 8.0, 11.4, stair);
      }
    }

    // -----------------------------------------------------------------------
    // 6. The gate. Two pylons rather than one tower, and the gap between them is
    //    the point: a solid gatehouse 6 units tall on the terrace edge would hide
    //    about 24 units of what stands behind it, which is most of the second
    //    stage. Split in two, you see between them.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * 4.4, side * 8.6, TERRACE, TERRACE + 4.2, 2.0, 6.4, bitumen);
      block(side * 4.0, side * 9.0, TERRACE + 4.2, TERRACE + 5.0, 1.6, 6.8, brick);
    }

    // -----------------------------------------------------------------------
    // 7. The pilasters. Three on each flank of the great terrace and three
    //    across its back, proud of the wall by about a third of a unit at both
    //    ends — which is why each is a square `taper` inside a group carrying
    //    `scale.z`, so it comes out as a strip and not a lump. They batter with
    //    the wall because they use the same 0.9.
    //
    //    Three a side and no more. The stages are already a horizontal
    //    subdivision, and two regular subdivisions of one surface multiply into
    //    brickwork — which is what Angel Falls' cliff did at seven strata by
    //    five ribs.
    // -----------------------------------------------------------------------
    const pilaster = (x: number, z: number, sx: number, sz: number): void => {
      const strip = new THREE.Group();
      strip.scale.set(sx, 1, sz);
      strip.position.set(x, PLINTH, z);
      strip.add(taper(5.6, 5.6 * BATTER, t1[2], brick, 4));
      group.add(strip);
    };
    for (const side of [-1, 1]) {
      for (const z of [-19.5, -8.0, 3.5]) pilaster(side * 21.2, z, 0.78, 0.36);
    }
    for (const x of [-13.5, 0, 13.5]) pilaster(x, -21.4, 0.36, 0.72);

    // -----------------------------------------------------------------------
    // 8. The cheek walls of the two flanking stairs, and the apron at the foot
    //    of the central one.
    //
    //    **This is where a temenos wall used to be and it was taken out after
    //    looking at the card.** Ur stands inside a walled precinct and the model
    //    built one: three runs, six units clear of the plinth, 250 triangles. At
    //    260 pixels from 13.4 degrees it contributed two dark stubs either side
    //    of the base, because a rectangular enclosure round a mass this size is
    //    seen edge-on from the quarter view and the back of it is behind the
    //    building. It also pushed the declared footprint from 38 to 43, which
    //    buys a wider flattened pad in the world for nothing. The same triangles
    //    spent on the stairs are all on the near face, where the camera is.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * 23.0, side * 25.0, 0, 3.2, 7.6, 11.8, bitumen);
      for (let i = 0; i < FLANK_STEPS; i += 2) {
        const x1 = side * (23.0 - (i * 15.5) / FLANK_STEPS);
        const x0 = side * (23.0 - ((i + 2) * 15.5) / FLANK_STEPS);
        const top = Math.min(TERRACE, ((i + 2) * TERRACE) / FLANK_STEPS) + 1.2;
        block(x0, x1, 0, top, 11.4, 12.9, bitumen);
      }
    }
    // The apron: two shallow courses spreading wider than the flight, which is
    // what the bottom of a monumental stair does and what stops the ramp looking
    // as though it had been cut off at the ground.
    block(-11.0, 11.0, 0, 1.0, STAIR_FOOT - 1.4, STAIR_FOOT + 3.0, stair);
    block(-8.2, 8.2, 1.0, 1.9, STAIR_FOOT - 2.6, STAIR_FOOT + 0.4, stair);

    return group;
  },
};
