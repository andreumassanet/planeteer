import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * Elmina Castle — São Jorge da Mina, Central Region, Ghana.
 *
 * **Why Ghana:** West Africa had one pin. Djenné's mosque, in Mali, and then
 * nothing at all across Senegal, The Gambia, Guinea, Sierra Leone, Liberia,
 * Côte d'Ivoire, Ghana, Togo, Benin, Nigeria, Niger, Burkina Faso, Mauritania
 * and Cabo Verde — fourteen countries and an empty coast. Elmina is the oldest
 * European building standing south of the Sahara: a Portuguese sea fort of 1482
 * on a rock between the Benya lagoon and the Atlantic, later Dutch, later
 * British, and the place where the Atlantic slave trade was industrialised.
 *
 * ---------------------------------------------------------------------------
 * White, low and horizontal — because the Citadelle is grey, battered and steep
 * ---------------------------------------------------------------------------
 *
 * The world already has a fortress. `citadelle-laferriere.ts` is a grey wedge
 * that runs to a point and climbs; this is its opposite in every axis, and that
 * is what the two actually look like. Elmina is **lime-wash on horizontals**:
 * one long parapet line, round drums at the seaward corners, red pantile roofs
 * showing over the wall, and dark rock under all of it. Nothing here is
 * battered, nothing runs to a point, and the tallest thing in the model is a
 * flagstaff.
 *
 * The measured trap is that the ground at 5.08 N, 1.35 W is already pale sand
 * (`#edd6ae`), which is within a few points of `PALETTE.sand` — so a white fort
 * on it has far less contrast than the photographs suggest. What separates the
 * fort from the beach is therefore **not** its white: it is the `clay` roofs
 * above the parapet, the `bark` gunports and sea gate, and the `darkOlive` rock
 * below. `sand` is used nowhere in this file for exactly that reason; the warm
 * grey-buff `tan` takes the plinths, copings and string course instead.
 *
 * ---------------------------------------------------------------------------
 * Nothing in the courtyard can be seen, so nothing is spent there
 * ---------------------------------------------------------------------------
 *
 * The contact sheet's quarter camera is 13.4 degrees up, so a rim of height `h`
 * hides about `4h` of depth behind it. The seaward parapet finishes at 19.4 and
 * the fort is only 39 units deep: **everything behind that wall at wall height
 * is gone.** The courtyard is a real void here and it holds one token chapel,
 * two meshes, for the player who walks in.
 *
 * What does get spent is the arithmetic of clearing that rim. Anything at depth
 * `d` behind the parapet has to stand above `19.4 + 0.238 d`:
 *
 * ```
 * centre pavilion roof   ridge 26.4 at d = 10.3   needs 21.9   clears 4.5
 * left wing roof         ridge 24.2 at d = 10.0   needs 21.8   clears 2.4
 * right wing roof        ridge 23.8 at d = 10.0   needs 21.8   clears 2.0
 * landward range roof    ridge 22.5 at d = 31.0   needs 26.8   HIDDEN
 * ```
 *
 * So the seaward range is pulled hard against the back of the sea curtain and
 * given a raised centre pavilion, and the landward range keeps its roof at one
 * mesh and twelve triangles because it is invisible from both fixed cameras and
 * correct from the air. The rear is made **wider** instead of taller — the same
 * inversion the Citadelle made — with the landward block reaching x = 25 and its
 * two corner bastions to 29, past the seaward front's 21, so the back of the
 * fort shows past the front's flanks rather than over them.
 *
 * ---------------------------------------------------------------------------
 * A long white wall broken only by colour draws nothing
 * ---------------------------------------------------------------------------
 *
 * `OutlineEffect` hulls each mesh on its own, so two flush faces get no ink
 * between them — which is how Niagara's American curtain became one blank cream
 * rectangle. A 42-unit run of whitewash is the same hazard with the same colour.
 * Every horizontal on the sea front is therefore separated in **depth**, not in
 * shade: wall face at z = 19.0, parapet 19.5, plinth 19.6, cordon 19.7, the
 * projecting sea battery 20.0, its gate surround 20.4 and the gate itself 20.6.
 * Seven planes, seven ink lines, one colour.
 *
 * ---------------------------------------------------------------------------
 * Ground: it carries its rock, and it does not carry the sea
 * ---------------------------------------------------------------------------
 *
 * **The rock is the monument's own and is modelled.** A fort on a promontory is
 * the case the general rule is *for*: the dark shelf under the white walls is
 * half of every photograph of Elmina, and unlike the Avenue of the Baobabs'
 * deleted green verge it is not a rectangle of somebody else's biome — it is a
 * warm dark rock (`darkOlive` over `bark`) against pale sand, which is what a
 * rock outcrop on a beach looks like. Two battered courses, oblong (a four-sided
 * `taper` is square, so the oblong comes from a parent group carrying the
 * scale), with eight crags standing above them to break the rim so it reads as
 * rock rather than as a plate.
 *
 * **The sea is not modelled, and that is a decision.** Mont-Saint-Michel's file
 * settled the argument and it holds here: nothing in this world is transparent,
 * so an opaque `skyBlue` disc at y = 0 is not water, it is a coaster, and
 * `OutlineEffect` would ink its rim into a hard black ring. What is modelled
 * instead is what water leaves behind — the `bark` wave-cut lower course, and
 * two outlying rocks standing clear of the shelf on the seaward side, which say
 * *this stops at the water* without claiming to be it.
 *
 * ---------------------------------------------------------------------------
 * Proportion
 * ---------------------------------------------------------------------------
 *
 * In life the castle with its outworks runs about 180 m along the shore against
 * walls of roughly 11 m: a true `halfDiagonal / height` near **8.6**, four times
 * the 2.0 cap. So it is cropped and stretched, both:
 *
 * - **Cropped** to the main quadrangle and its four bastions — about 100 m by
 *   90 m of a 180 m site. The landward outwork, the dry ditch, the long approach
 *   from the town and the whole eighteenth-century British addition are out.
 * - **Stretched 2.5x on the vertical.** The fort measures 58.8 units across the
 *   landward front for the crop's real ~100 m, which is 0.59 units per metre; at
 *   that rate an 11 m wall would be 6.5 units and the wall here stands 16.0 from
 *   the rock to the parapet. As the picture rather than the number: the front
 *   reads 3.7 wide for every 1 tall where life gives about 9.
 * - **What the stretch broke, and the fix.** At 2.5x the seaward drums came out
 *   as chimneys. They are widened to a 6.4 apothem — 12.8 across against 14.1
 *   tall, so barely taller than wide — and capped with an open `ringWall` gun
 *   platform standing 3 units proud, so each one finishes as a horizontal ring
 *   rather than as a shaft. That is the single reason the front still reads low.
 * - Measured on the built model: radius 42.2 against height 26.8, so
 *   `halfDiagonal / height` = **1.57**, and `2 * radius / height` = 3.15 against
 *   the 4.0 cap. The rock is the widest thing; the fort alone reaches 34.
 *
 * 1,488 triangles of 2,600 and 83 meshes of 110. It is not a dense model and it
 * should not be: a sea fort is eight large plain white masses, and what draws it
 * is the ink between them. The budget went on the number of *planes* — seven on
 * the sea front alone — rather than on ornament.
 *
 * No `realHeight`. The source list carries none and there is no one number: the
 * curtain is about 11 m, the bastions higher, and the whole thing sits on a rock
 * whose own height is what people actually see.
 */

// ---------------------------------------------------------------------------
// Levels. Every white thing is measured from the rock, and the four numbers
// below are the fort's whole section.
// ---------------------------------------------------------------------------

/** Top of the rock shelf: the datum the fort stands on. */
const ROCK = 3.4;
/** Top of the `tan` plinth course under the lime-wash. */
const FOOT = 6.2;
/** The wall-walk — top of the curtain, underside of its parapet. */
const WALK = 17.0;
/** Top of the seaward parapet, and the rim every roof behind it has to clear. */
const PARAPET = 19.4;

/**
 * The crags, as [x, z, apothem at the foot, at the top, height, wet].
 *
 * Written out rather than placed with `around` because a regular ring of rocks
 * is a crown, not a coast. `wet` picks the darker `bark` for the ones the sea
 * reaches. The last two stand **off** the shelf entirely, on the ground in front
 * of the sea gate, which is the only thing in the model that says where the
 * water is.
 */
const CRAGS: [x: number, z: number, foot: number, top: number, height: number, wet: boolean][] = [
  [-30.0, 6.0, 3.4, 1.4, 5.2, false],
  [28.0, -14.0, 2.8, 1.0, 4.4, true],
  [-24.0, -20.0, 3.0, 1.2, 4.8, false],
  [14.0, 21.5, 2.4, 0.9, 4.0, true],
  [-11.0, 27.5, 2.6, 0.8, 4.6, true],
  [19.0, 25.0, 2.0, 0.6, 3.4, false],
  [-32.0, -12.0, 2.6, 1.0, 4.2, true],
  [31.0, 9.0, 3.0, 1.1, 4.6, false],
];

export const elminaCastle: Monument = {
  id: 'elmina-castle',
  name: 'Elmina Castle',
  iso: 'GHA',
  lat: 5.0847,
  lon: -1.3494,
  tier: 'building',
  // Set by the rock shelf's corners at 42.2. The fort alone reaches 34.
  footprint: 43,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper, ringWall } = ctx;

    const lime = palette.white; // 0xfff2e8, a warm white: this is lime-wash, not marble
    const stone = palette.tan; // plinths, copings, the cordon — a step down from the lime
    const tile = palette.clay; // the pantile roofs, and the only strong hue here
    const dark = palette.bark; // gunports, the sea gate, the wave-cut rock
    const reef = palette.darkOlive; // the shelf the fort stands on
    const iron = palette.steel; // two guns, and nothing else

    const group = new THREE.Group();

    /** A block given by its two opposite corners, which is how a fort is drawn. */
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
     * One oblong battered course of the rock.
     *
     * A four-sided `taper` is square, so the oblong comes from a **parent** group
     * carrying the stretch. There is no rotation anywhere near it, so `T * R * S`
     * has nothing to reorder — but the split is the same one the roofs make
     * below, where it does matter, and keeping both in one idiom is worth more
     * than saving a group.
     */
    const shelf = (
      foot: number,
      top: number,
      height: number,
      y: number,
      stretch: number,
      color: number,
    ): void => {
      const wrap = new THREE.Group();
      wrap.add(taper(foot, top, height, color, 4));
      wrap.scale.x = stretch;
      wrap.position.y = y;
      group.add(wrap);
    };

    /**
     * A pitched roof: eaves at `eaves`, ridge `rise` above them, ridge running
     * along X.
     *
     * A three-sided `column` on its side is the cheapest gable there is — 12
     * triangles — but its pitch is fixed at 60 degrees by the prism's own
     * geometry, and a pantile roof is nearer 43. So the prism is built at unit
     * size and the **mesh** carries the scale while the **pivot** carries the
     * yaw: scale before rotation is exactly right here, because the scale is
     * meant in the prism's own axes. Local axes after the quarter turn about X:
     * local x stays world x, local y becomes the run, local z becomes the height
     * spanning -1 to +2, hence `scale.set(_, 1, _)`.
     */
    const roof = (
      cx: number,
      cz: number,
      length: number,
      halfWidth: number,
      eaves: number,
      rise: number,
      color: number,
    ): void => {
      const prism = column(1, length, color, 3);
      prism.scale.set(halfWidth / Math.sqrt(3), 1, rise / 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, rise / 3, -length / 2);

      const pivot = new THREE.Group();
      pivot.add(prism);
      pivot.rotation.y = Math.PI / 2; // the ridge runs along X
      pivot.position.set(cx, eaves, cz);
      group.add(pivot);
    };

    // -----------------------------------------------------------------------
    // 1. The rock. Two oblong battered courses — the lower one `bark`, which is
    //    the wave-cut foot, the upper `darkOlive` — and six crags standing above
    //    them so the rim is not a rectangle.
    // -----------------------------------------------------------------------
    shelf(24.5, 23.0, 1.2, 0, 1.4, dark);
    shelf(23.0, 21.0, 2.2, 1.2, 1.4, reef);

    for (const [x, z, foot, top, height, wet] of CRAGS) {
      const crag = taper(foot, top, height, wet ? dark : reef, 5);
      crag.position.set(x, 0, z);
      group.add(crag);
    }

    // The landing in front of the sea gate: a rock ledge, one step down, where
    // the boats came alongside. It reaches z = 24.5, past the shelf's own 23, so
    // it reads as the shelf breaking down to the water rather than as a step.
    block(-6.0, 6.0, 2.4, ROCK, 20.4, 24.5, reef);

    // -----------------------------------------------------------------------
    // 2. The sea front. Six planes in one colour — see the note above on why the
    //    depths and not the shades are what draw it.
    // -----------------------------------------------------------------------
    block(-21.0, 21.0, ROCK, FOOT, 15.2, 19.6, stone); // plinth, 0.6 proud
    block(-21.0, 21.0, FOOT, WALK, 15.5, 19.0, lime); // the curtain
    block(-21.2, 21.2, 16.5, 17.3, 15.3, 19.7, stone); // the cordon, proudest of the wall
    block(-21.4, 21.4, 17.3, PARAPET, 15.2, 19.5, lime); // the parapet

    // Gunports: one row, grouped away from the centre so the battery below them
    // has the middle of the wall to itself. One repeating feature on this face
    // and one only — a second rhythm here and the wall reads as brickwork.
    //
    // The row stops at 13.0 and not at 17.5, where it started: the drums reach
    // in to x = 14.8, and `findFlaws` reported the outer pair **sealed inside**
    // them, which is exactly where they were.
    for (const x of [-13.0, -8.5, 8.5, 13.0]) {
      block(x - 0.9, x + 0.9, 10.4, 13.0, 19.0, 19.55, dark);
    }

    // -----------------------------------------------------------------------
    // 3. The sea battery, projecting a unit and a half in front of the curtain,
    //    and lower than it: at 13.4 degrees a 16.8 rim hides everything below
    //    17.4 at the wall behind, and the parapet stands at 19.4, so both lines
    //    show.
    // -----------------------------------------------------------------------
    block(-8.0, 8.0, ROCK, 15.0, 18.5, 20.0, lime);
    block(-8.4, 8.4, 15.0, 16.8, 18.2, 20.3, lime);
    for (const x of [-6.8, -3.4, 0, 3.4, 6.8]) {
      block(x - 0.9, x + 0.9, 16.8, 18.4, 18.4, 20.1, lime);
    }

    // The Door of No Return. It is small, it is at the water, and it is the one
    // thing at Elmina everybody comes to see, so it gets the centre of the front
    // and a `tan` surround to give it two ink lines instead of one.
    block(-3.0, 3.0, ROCK, 9.6, 19.9, 20.4, stone);
    block(-1.9, 1.9, ROCK, 8.4, 20.2, 20.6, dark);
    // One step down from the sill onto the ledge, and one only: a flight here
    // would stand in front of the door it exists to reach.
    block(-3.4, 3.4, 2.9, ROCK, 20.6, 22.2, stone);

    // -----------------------------------------------------------------------
    // 4. The flanks, running back from the sea front, and the landward block —
    //    wider than the front, which is the only way anything behind a 19.4 rim
    //    is seen at all.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      block(side * 17.5, side * 21.4, ROCK, FOOT, -5.4, 19.6, stone);
      block(side * 17.5, side * 21.0, FOOT, WALK, -5.0, 19.0, lime);
      // The cordon carries round the corner, which is the line the quarter view
      // reads the fort by: one horizontal running the whole way round at 16.5.
      block(side * 17.3, side * 21.2, 16.5, 17.3, -5.2, 19.6, stone);
      block(side * 17.3, side * 21.4, 17.3, PARAPET, -5.2, 19.5, lime);
      // Two ports per flank, clear of the drums' z 6.8..20.2.
      for (const z of [0.0, 4.6]) {
        block(side * 21.0, side * 21.55, 10.4, 13.0, z - 0.9, z + 0.9, dark);
      }
    }

    block(-25.4, 25.4, ROCK, FOOT, -18.4, -4.6, stone);
    block(-25.0, 25.0, FOOT, 18.0, -18.0, -5.0, lime);
    block(-25.4, 25.4, 18.0, 20.4, -18.4, -4.6, lime);
    // The landward range's own roof: one mesh, twelve triangles, and hidden from
    // both fixed cameras (it would need to stand at 26.7 and it stands at 22.5).
    // It is here for the flyover and for the player in the outer courtyard.
    roof(0, -11.5, 49.0, 6.4, 18.0, 4.5, tile);

    // The two landward bastions, square, projecting sideways to x = 29 so their
    // flanks clear the sea front's 21.
    for (const side of [-1, 1]) {
      block(side * 24.6, side * 29.0, ROCK, 17.0, -17.0, -8.0, lime);
      block(side * 24.4, side * 29.4, 17.0, 19.2, -17.4, -7.6, lime);
      // Merlons, and only here. The seaward parapet is left as one unbroken
      // line — Elmina's sea front is a solid parapet with embrasures, not
      // battlements, and anything standing on it raises the rim the roofs
      // behind have to clear. These two copings are the widest things in the
      // model at x = 29 and they show past the sea front's 21, so they are
      // where a broken top line is both free and true.
      for (const z of [-15.4, -12.5, -9.6]) {
        block(side * 24.6, side * 29.2, 19.2, 20.8, z - 0.9, z + 0.9, lime);
      }
    }

    // -----------------------------------------------------------------------
    // 5. The seaward drums. Ten sides: a whitewashed masonry drum is a made
    //    thing, so it wants more joints than a rock and fewer than a cog, and at
    //    a 6.4 apothem ten of them put a 4.2-unit chord on each face — an ink
    //    line every four units, which reads as coursing.
    //
    //    The open `ringWall` on top is doing the work the vertical stretch broke:
    //    it finishes each drum as a horizontal ring standing 3 units clear of the
    //    shaft, with a real hole in it, so the eye reads a gun platform and not a
    //    tower.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      const cx = side * 21.5;
      const cz = 13.5;

      const flare = taper(7.0, 6.4, 2.0, stone, 10);
      flare.position.set(cx, ROCK, cz);
      group.add(flare);

      const drum = column(6.4, 14.1, lime, 10);
      drum.position.set(cx, 5.4, cz);
      group.add(drum);

      const cordon = column(6.7, 0.8, stone, 10);
      cordon.position.set(cx, 18.7, cz);
      group.add(cordon);

      const platform = ringWall(5.9, 7.0, 3.0, lime, 10);
      platform.position.set(cx, 19.5, cz);
      group.add(platform);

      // A gun on the platform, standing on the drum's own top face at 19.5 and
      // pointing out to sea. `rotation.x` of a quarter turn puts a column's axis
      // on +Z; the 0.16 taken off it is the elevation.
      const carriage = box(1.6, 1.0, 2.4, dark);
      carriage.position.set(cx, 19.5, cz + 1.6);
      group.add(carriage);

      const barrel = taper(0.46, 0.3, 4.2, iron, 6);
      barrel.rotation.x = Math.PI / 2 - 0.16;
      barrel.position.set(cx, 20.4, cz + 1.2);
      group.add(barrel);

      // A guerite — the corbelled sentry box a Portuguese fort puts on its
      // corners. It stands on the parapet ring at radius 6.5 from the drum's
      // centre, not inside it: at 5.7 it sat over the hole and read as a chimney
      // in a bucket.
      const gx = cx + side * 5.13;
      const gz = cz + 3.99;
      const shaftBox = column(1.15, 2.2, lime, 8);
      shaftBox.position.set(gx, 22.5, gz);
      group.add(shaftBox);
      const cap = taper(1.35, 0.12, 1.5, stone, 8);
      cap.position.set(gx, 24.7, gz);
      group.add(cap);
    }

    // The flagstaff, on the left-hand platform. Elmina flew four flags in five
    // hundred years and it is the one vertical in a model of horizontals.
    const staff = column(0.3, 4.3, dark, 6);
    staff.position.set(-21.5, 22.5, 13.5);
    group.add(staff);

    // -----------------------------------------------------------------------
    // 6. The seaward range: the governor's quarters, pulled hard against the
    //    back of the sea curtain so its roofs clear the parapet. Three blocks at
    //    three depths and two heights — a raised centre pavilion between two
    //    wings — because a single 38-unit run of pantile is a tent.
    // -----------------------------------------------------------------------
    block(-8.0, 8.0, ROCK, 20.5, 3.0, 15.4, lime);
    block(-8.4, 8.4, 19.8, 20.5, 2.8, 15.6, stone);
    roof(0, 9.2, 16.8, 6.4, 20.5, 5.9, tile); // ridge 26.4, pitch 43 degrees

    for (const [x0, x1, eaves, rise] of [
      [-19.0, -8.0, 19.4, 4.8],
      [8.0, 19.0, 19.0, 4.8],
    ] as const) {
      block(x0, x1, ROCK, eaves, 4.2, 14.8, lime);
      block(x0 - 0.4, x1 + 0.4, eaves - 0.7, eaves, 4.0, 15.0, stone);
      roof((x0 + x1) / 2, 9.5, x1 - x0 + 0.8, 5.6, eaves, rise, tile);
    }

    // -----------------------------------------------------------------------
    // 7. The chapel in the courtyard. Two meshes, and it is invisible from both
    //    fixed cameras — it would have to stand at 29.4 to clear the seaward
    //    range's own ridge and it stands at 21.6. It is here because a player
    //    walks into this courtyard, and an empty one would be a lie.
    // -----------------------------------------------------------------------
    block(-5.6, 5.6, ROCK, 17.0, -3.8, 3.4, lime);
    roof(0, -0.2, 10.4, 3.4, 17.0, 4.6, tile);

    return group;
  },
};
