import type { Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Neuschwanstein Castle.
 *
 * Ludwig II's castle is a pile, not a plan. It was built along the crest of a
 * narrow spur, so every block took whatever length of rock was left where the
 * last one stopped — and the whole character of the thing is that **no two
 * parts match**. Different heights, different widths, different roof pitches,
 * turrets stuck on wherever a stair had to come up. Make it symmetrical and you
 * have not made Neuschwanstein, you have made the castle on the jigsaw box. So
 * nothing here is mirrored and nothing is built with `around`: every block,
 * every turret and every roof is written out once, with its own numbers.
 *
 * What has to survive at thumbnail size, in the order the eye finds it:
 *
 * - **The keep.** One slender tower, 5.8 units square and 39.95 tall — 6.9 : 1,
 *   and standing 7.5 units clear of the next-highest thing in the model. It
 *   earns that gap twice over: everything else was pulled *down* for it. The
 *   Palas ridge sits at 30.5 where a first pass had it at 32.5, and at 32.5 the
 *   tower did not read as the tower, it read as the tallest of several.
 * - **The cluster of cones.** Eight conical turret roofs, no two the same
 *   height: 32.4, 29.4, 27.6, 26.4, 25.2, 22.4, 20.0, 16.4. With the keep's
 *   spire at 39.3 and the square tower's pyramid at 30.0 that is ten points in
 *   one silhouette, stepping the whole way down. They cost 27 of 107 meshes,
 *   the largest single share of the budget, and they are what the castle is.
 * - **The steep roofs**, which are most of the outline. Every one is a
 *   triangular prism pitched between 46 and 55 degrees. Flatten them and the
 *   model turns into an office park.
 * - **The gatehouse**, a tall block at the east end with its own twin towers
 *   flanking a gabled facade, on the lowest of the three terraces so it reads
 *   as the far, low end of a rising ridge.
 * - **The steps.** Three terraces, 1.6 / 3.2 / 5.0, climbing west. The mountain
 *   is not modelled — the world flattens a 90-unit pad under every monument —
 *   but the castle's own stepped levels are the castle, so they stay.
 *
 * ## Colour
 *
 * `white` walls against `steel` roofs, and that pairing is the whole naming
 * decision. `steel` (0x575a5e) is the one entry in the palette that is a dark
 * blue-grey rather than a brown or a violet, and every roof, spire and cone is
 * that single colour so the ten roof points read as one system rather than ten
 * ornaments. `bone` takes the rock terraces, the string courses and the corbel
 * rings: a step down from the white, so the base never competes with the walls.
 *
 * The one departure is `clay` on the gatehouse, and it is not a liberty — the
 * Torbau was built first and built of **red brick**, and it is to this day the
 * one part of Neuschwanstein that is not white. It costs nothing, it is true,
 * and it does more for "the two ends of this castle are not the same building"
 * than any amount of extra geometry could.
 *
 * `bark` is every window and the gate arch; `gold` is two finials, on the keep
 * and on the square tower, which is where a weathervane belongs and is 32
 * triangles of the whole budget.
 *
 * ## Departures, in numbers
 *
 * - **The plan is squeezed 17%.** In life the complex runs about 150 m along
 *   the spur against a 65 m main tower, 2.3 : 1. Here it is 74 units long
 *   against 39.95 tall, 1.85 : 1. That is well inside `MAX_ASPECT`, so this is
 *   not the aspect rule biting — it is a choice. The thing being named is a
 *   *crowd of blocks*, and at true length the crowd spreads out into a terrace
 *   of houses. Pulling the ends in packs the roofs together, which is how the
 *   castle looks from the Marienbrücke and on every postcard of it.
 * - **`building`, not `tower`.** It is a palace, which is where the tier list
 *   puts it, and the `tower` tier's 28-unit footprint could not hold a quarter
 *   of it. At 40 units it stands beside the Taj Mahal, which is right.
 * - **The courtyard is solid.** The real upper and lower courtyards are open
 *   ground between four separate buildings. Modelled that way, from any angle
 *   but straight down you see the far wall's back through the gap and it reads
 *   as a ruin. The blocks here crowd shoulder to shoulder instead, and the
 *   terraces do the work the courtyard did.
 * - **Merlons on the south curtain only.** The wall linking the wings to the
 *   gate is the flattest thing in the model and it is dead centre; five merlons
 *   break its top line for five meshes. The north face of the same wall goes
 *   without, because 107 of 110 meshes is where the budget ran out and the back
 *   of the castle is the half nobody frames.
 * - **No Marienbrücke, no gorge, no lake.** The pad is flat by contract.
 */

// ---------------------------------------------------------------------------
// Elevation. The three terrace tops are the datum every block is measured from.
// ---------------------------------------------------------------------------

/** East terrace — the lower courtyard, under the gatehouse. */
const TERRACE_E = 1.6;
/** Middle terrace — the wings that link the Palas to the gate. */
const TERRACE_M = 3.2;
/** West terrace — the upper courtyard, under the Palas and the keep. */
const TERRACE_W = 5.0;

/** The tier ceiling, reached by the keep's finial and by nothing else. */
const TOP = 39.95;

/**
 * The conical turrets, west to east.
 *
 * Written as data rather than as code because the *list* is the feature: eight
 * rows, and the only thing worth checking about them is that no two finish at
 * the same height. `flare` is the tapered corbel a turret stands on when it
 * hangs off a wall face instead of rising from a terrace — three of them do,
 * and that is what makes those three read as stuck on rather than built in.
 */
interface Turret {
  x: number;
  z: number;
  /** Half-width across the flats of the octagonal shaft. */
  r: number;
  /** Where the shaft — or its corbel, if `flare` — starts. */
  base: number;
  /** Height of the tapered corbel under the shaft; 0 for one that stands on the ground. */
  flare: number;
  /** Top of the shaft. The corbel ring sits on it and the cone on that. */
  wall: number;
  /** Height of the cone itself. */
  spire: number;
}

const TURRETS: Turret[] = [
  // The pair flanking the Palas's west gable. Deliberately unequal: one cone
  // finishes above the gable's peak and the other three units below it.
  { x: -34.7, z: -7.9, r: 1.8, base: TERRACE_W, flare: 0, wall: 26.2, spire: 5.4 }, // 32.4
  { x: -34.7, z: 7.9, r: 1.8, base: TERRACE_W, flare: 0, wall: 23.4, spire: 5.2 }, //  29.4
  // Corbelled off the Palas's south-east corner.
  { x: -17.0, z: 8.6, r: 2.0, base: TERRACE_W, flare: 4.0, wall: 19.4, spire: 5.0 }, // 25.2
  // The little one on the Bower's west end — the lowest point of the cluster.
  { x: -11.3, z: 9.2, r: 1.5, base: TERRACE_M, flare: 3.4, wall: 11.6, spire: 4.0 }, // 16.4
  // Bartizan on the Knights' House's north-east corner.
  { x: 5.6, z: -9.0, r: 1.7, base: TERRACE_M, flare: 3.8, wall: 15.0, spire: 4.2 }, //  20.0
  // The Bower's own round tower, closing the south wing.
  { x: 6.4, z: 7.6, r: 2.6, base: TERRACE_M, flare: 0, wall: 16.4, spire: 5.2 }, //     22.4
  // The gatehouse's twin stair towers. Twin in plan only — the real pair differ
  // in height as well, and that difference is the last thing keeping the east
  // end from reading as the symmetrical castle this one is not.
  { x: 33.2, z: -6.4, r: 2.3, base: TERRACE_E, flare: 0, wall: 20.5, spire: 5.1 }, //   26.4
  { x: 33.2, z: 6.4, r: 2.3, base: TERRACE_E, flare: 0, wall: 21.6, spire: 5.2 }, //    27.6
];

/** Height of the corbel ring under every cone. One number, so the cones agree. */
const RING = 0.8;

export const neuschwanstein: Monument = {
  id: 'neuschwanstein',
  name: 'Neuschwanstein Castle',
  iso: 'DEU',
  lat: 47.558,
  lon: 10.75,
  tier: 'building',
  footprint: 40,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;

    const stone = palette.white; // limestone walls — four fifths of the model
    const rock = palette.bone; // terraces, string courses, corbels
    const slate = palette.steel; // every roof, spire and cone
    const brick = palette.clay; // the gatehouse, and only the gatehouse
    const glass = palette.bark; // windows, the gate arch
    const gilt = palette.gold; // two finials

    const group = new THREE.Group();

    /** Places a helper mesh and keeps it, so the body of `build` stays a list of parts. */
    const put = (mesh: ReturnType<typeof box>, x: number, y: number, z: number) => {
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    /**
     * A gable roof: eaves at `eaves`, ridge `rise` above them, running along X
     * (or along Z with `alongX = false`).
     *
     * A three-sided `column` laid on its side is the cheapest gable there is —
     * 12 triangles, the same as a box — but its pitch is fixed: an apothem-1
     * prism is 3.46 wide and 3 tall, or 60 degrees, and every roof here wants
     * its own angle. So the prism is built at unit size and the *mesh* carries
     * the scale, which is legal (only the returned group must have an identity
     * transform) and lets `halfWidth` and `rise` be chosen independently.
     *
     * Local axes after the quarter turn about X: local x is world x, local y is
     * world z (the length), local z is world -y (the height, spanning -1 to
     * +2). Hence the odd-looking `scale.set(_, 1, _)`.
     */
    const gable = (
      cx: number,
      cz: number,
      length: number,
      halfWidth: number,
      eaves: number,
      rise: number,
      color: number,
      alongX = true,
    ) => {
      const prism = column(1, length, color, 3);
      prism.scale.set(halfWidth / Math.sqrt(3), 1, rise / 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, rise / 3, -length / 2);

      const pivot = new THREE.Group();
      pivot.add(prism);
      if (alongX) pivot.rotation.y = Math.PI / 2;
      pivot.position.set(cx, eaves, cz);
      group.add(pivot);
      return pivot;
    };

    /**
     * A dormer: a cheek of wall pushed through the roof slope with its own
     * little gable facing out. Two meshes, and they are what keeps a twenty-unit
     * run of bare roof from reading as a tent.
     */
    const dormer = (x: number, z: number, width: number, depth: number, sill: number, top: number) => {
      put(box(width, top - sill, depth, stone), x, sill, z);
      gable(x, z, depth + 0.5, width / 2 + 0.25, top, width * 0.62, slate, false);
    };

    /** A dark strip standing slightly proud of a wall. Same trick as Big Ben's slots. */
    const slit = (x: number, y: number, z: number, width: number, height: number, facing: 'x' | 'z') => {
      put(facing === 'z' ? box(width, height, 0.5, glass) : box(0.5, height, width, glass), x, y, z);
    };

    // -----------------------------------------------------------------------
    // Terraces. Three steps climbing west, each a rock course with a masonry
    // one on top of it. The west step's lower course is the widest thing in the
    // model, and its corners at 38.7 units out are what set the footprint.
    // -----------------------------------------------------------------------
    put(box(20, 1.0, 16, rock), 27, 0, 0);
    put(box(18.6, TERRACE_E - 1.0, 14.6, stone), 27, 1.0, 0);

    put(box(37, 2.2, 19, rock), 2.5, 0, 0);
    put(box(35.6, TERRACE_M - 2.2, 17.6, stone), 2.5, 2.2, 0);

    put(box(30, 3.6, 23, rock), -22, 0, 0);
    put(box(28.6, TERRACE_W - 3.6, 21.6, stone), -22, 3.6, 0);

    // -----------------------------------------------------------------------
    // Palas — the great hall at the west end, and the tallest *mass* here. Its
    // ridge is the number the keep has to beat, which is why it is 30.5 and not
    // the 32.5 the block's own proportions wanted.
    // -----------------------------------------------------------------------
    const PALAS_EAVES = 20.5;
    put(box(19, PALAS_EAVES - TERRACE_W, 16, stone), -25.5, TERRACE_W, 0);
    put(box(19.8, 0.8, 16.8, rock), -25.5, 12.2, 0);
    gable(-25.5, 0, 20.6, 8.9, PALAS_EAVES, 10.0, slate); // ridge 30.5, pitch 48 degrees

    // The west facade's gable, in stone and a shade taller and wider than the
    // roof behind it, so the end of the castle silhouettes white and not slate.
    // This is the face that looks down the Alpsee, and it is on half the
    // photographs ever taken of the place.
    gable(-36.2, 0, 1.4, 9.3, 20.4, 10.4, stone); // peak 30.8

    for (const x of [-32.4, -27.6, -22.8]) {
      slit(x, 6.5, 7.95, 2.2, 5.0, 'z');
      slit(x, 14.0, 7.95, 2.2, 5.0, 'z');
    }
    for (const x of [-31.0, -25.5, -20.0]) slit(x, 14.0, -7.95, 2.2, 5.0, 'z');
    for (const z of [-4.2, 4.2]) slit(-35.05, 14.0, z, 2.4, 5.2, 'x');

    // Two dormers on the south slope, unequal and unevenly spaced.
    dormer(-30.5, 5.8, 3.0, 2.8, 21.8, 25.6);
    dormer(-21.6, 5.5, 2.4, 2.4, 22.2, 25.4);

    // -----------------------------------------------------------------------
    // The keep. Square shaft, corbelled gallery, octagonal upper stage, spire.
    // The square-into-octagon step is the whole reason it reads as a keep and
    // not as a chimney: it is the one place in the model where the plan of a
    // thing changes on the way up, and it is where the eye stops climbing.
    // -----------------------------------------------------------------------
    const KX = -14.5;
    const KZ = -5.0;
    put(box(5.8, 21, 5.8, stone), KX, TERRACE_W, KZ);
    put(box(6.4, 0.8, 6.4, rock), KX, 15, KZ);
    put(taper(2.9, 3.5, 1.3, stone, 4), KX, 26, KZ);
    put(box(7.0, 0.9, 7.0, rock), KX, 27.3, KZ);
    put(column(2.6, 4.3, stone, 8), KX, 28.2, KZ);
    put(column(3.1, RING, rock, 8), KX, 32.5, KZ);
    put(taper(2.9, 0, 6.0, slate, 8), KX, 33.3, KZ); // tip 39.3
    put(column(0.22, TOP - 39.3, gilt, 4), KX, 39.3, KZ);
    slit(KX, 9.0, KZ + 2.85, 1.3, 3.8, 'z');
    slit(KX, 19.0, KZ + 2.85, 1.3, 3.8, 'z');

    // -----------------------------------------------------------------------
    // Knights' House — the long north wing, and the square stair tower that
    // punches out of its roof. The tallest thing in the middle of the castle,
    // which is what keeps the span between the two high ends from sagging.
    // -----------------------------------------------------------------------
    const RITTER_EAVES = 17;
    put(box(19, RITTER_EAVES - TERRACE_M, 6.5, stone), -3.5, TERRACE_M, -6.25);
    put(box(19.8, 0.7, 7.3, rock), -3.5, 10, -6.25);
    gable(-3.5, -6.25, 20.2, 3.85, RITTER_EAVES, 5.5, slate); // ridge 22.5, pitch 55 degrees
    // The third window is at 3 and not at 1, which breaks the 5.5 rhythm of the
    // other two on purpose. The stair tower below stands at x = -1 and is 5.8
    // square, so it covers x -3.9..1.9 and its face is 0.9 proud of this wall:
    // a window at 1 was inside the tower, not on the wall, and drew nothing.
    // The wall this row can actually use runs -13..-3.9 and 1.9..6.
    for (const x of [-10, -4.5, 3]) slit(x, 11.5, -2.85, 1.6, 4.2, 'z');
    dormer(-8.0, -4.2, 2.2, 2.2, 17.6, 20.6);
    dormer(1.4, -4.2, 2.0, 2.2, 17.8, 20.4);

    const SX = -1;
    const SZ = -5.0;
    put(box(5.8, 23.5 - TERRACE_M, 5.8, stone), SX, TERRACE_M, SZ);
    put(box(6.4, 0.7, 6.4, rock), SX, 14, SZ);
    put(box(6.8, 1.1, 6.8, rock), SX, 23.5, SZ);
    put(taper(3.5, 0, 5.4, slate, 4), SX, 24.6, SZ); // apex 30.0
    put(column(0.22, 0.7, gilt, 4), SX, 30.0, SZ);
    slit(SX, 12, SZ + 3.05, 1.2, 3.0, 'z');
    slit(SX, 18.0, SZ + 3.05, 1.2, 3.0, 'z');

    // -----------------------------------------------------------------------
    // Bower — the low south wing. Its job is to be short: without something
    // finishing at 18 units the fall from the Palas to the gate has no middle.
    // -----------------------------------------------------------------------
    const BOWER_EAVES = 13;
    put(box(16, BOWER_EAVES - TERRACE_M, 6, stone), -3, TERRACE_M, 6.5);
    gable(-3, 6.5, 17.2, 3.6, BOWER_EAVES, 5.0, slate); // ridge 18
    // The open arcade: one dark recess with piers standing in front of it.
    put(box(14, 4.5, 0.6, glass), -3, 4.2, 9.35);
    // The piers run `PROUD` past the recess at its foot and head: the same
    // height, their tops and undersides would share its planes and flicker.
    for (const x of [-8, -3, 2]) put(box(1.1, 4.5 + 2 * PROUD, 1.0, stone), x, 4.2 - PROUD, 9.5);
    slit(-6, 10.0, 9.45, 1.5, 2.2, 'z');
    slit(0, 10.0, 9.45, 1.5, 2.2, 'z');

    // -----------------------------------------------------------------------
    // The lower courtyard's curtain walls, linking the wings to the gatehouse.
    // Low and plain on purpose — this is the trough between the two high ends —
    // but the south face gets merlons, because dead centre is the worst place
    // in a silhouette to run fifteen units of flat coping.
    // -----------------------------------------------------------------------
    for (const z of [-8.2, 8.2]) {
      put(box(15, 9.5 - TERRACE_M, 1.6, stone), 12.5, TERRACE_M, z);
      put(box(15.6, 0.7, 2.2, rock), 12.5, 9.5, z);
    }
    // Four merlons, not five: the row began at 6.5 and the Bower's round tower
    // stands at x = 6.4 with a 2.6 radius, so the first one was inside the tower
    // shaft from top to bottom. The coping it was meant to break is the run east
    // of the tower, and that is where the four of them are.
    for (const x of [9.5, 12.5, 15.5, 18.5]) put(box(1.6, 1.5, 2.2, stone), x, 10.2, 8.2);

    // -----------------------------------------------------------------------
    // Torbau — the gatehouse. Red brick, tall and narrow, gable facing east
    // over the arch, a stair tower on each flank. The only part of the castle
    // that is not white, and the only block that gets a front of its own.
    // -----------------------------------------------------------------------
    const GATE_EAVES = 18;
    put(box(13.4, GATE_EAVES - TERRACE_E, 11.2, brick), 26.7, TERRACE_E, 0);
    put(box(14.0, 0.8, 11.8, stone), 26.7, 10, 0);
    gable(26.7, 0, 14.4, 6.1, GATE_EAVES, 7.0, slate); // ridge 25
    gable(34.2, 0, 1.4, 6.3, 17.8, 7.4, brick); // the brick gable over the arch, peak 25.2
    // The stair towers stand `PROUD` past the brick's flanks: at 4.9 their
    // faces sat 0.05 inside it, near enough to share its plane and flicker.
    for (const z of [-5.03, 5.03]) put(box(1.3, GATE_EAVES - TERRACE_E, 1.3, stone), 20.3, TERRACE_E, z);
    put(box(0.7, 9.0, 5.6, rock), 33.7, TERRACE_E, 0);
    put(box(0.7, 7.2, 3.6, glass), 33.9, TERRACE_E, 0);
    for (const x of [23, 26.7, 30.4]) slit(x, 12, 5.5, 1.5, 4.0, 'z');

    // -----------------------------------------------------------------------
    // The cones, last, because they are the read: shaft, corbel ring, cone, and
    // for the three that hang off a wall, a tapered corbel underneath.
    // -----------------------------------------------------------------------
    for (const t of TURRETS) {
      let foot = t.base;
      if (t.flare > 0) {
        put(taper(t.r * 0.42, t.r, t.flare, stone, 8), t.x, t.base, t.z);
        foot = t.base + t.flare;
      }
      put(column(t.r, t.wall - foot, stone, 8), t.x, foot, t.z);
      put(column(t.r + 0.45, RING, rock, 8), t.x, t.wall, t.z);
      put(taper(t.r + 0.35, 0, t.spire, slate, 8), t.x, t.wall + RING, t.z);
    }

    return group;
  },
};
