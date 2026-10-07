import { PROUD } from './contract.ts';
import type { Group, Mesh, Monument, MonumentContext } from './contract.ts';

/**
 * The Château Frontenac — Quebec City, Quebec.
 *
 * **Why Quebec:** Canada had two pins and both were in southern Ontario. The CN
 * Tower at 43.64 N and Niagara Falls at 43.08 N, 120 km apart, and then nothing
 * — no Quebec, no Maritimes, no prairies, no Rockies, no British Columbia, no
 * Arctic — across the second-largest country on the planet. The Frontenac stands
 * on the cliff above the St Lawrence, it is the most photographed hotel on
 * Earth, and it is a **building type this world does not have**: a railway hotel
 * of 1893 pretending to be a castle. Neuschwanstein is a castle. The difference
 * between them is the roofs, and that is what this file spends its budget on.
 *
 * ---------------------------------------------------------------------------
 * The recognised view, and the one crop
 * ---------------------------------------------------------------------------
 *
 * From the Lévis ferry, or from the Lower Town looking up: a mass of red-brown
 * brick under a **forest of steep green copper roofs**, with one tower standing
 * twice as high as anything around it, dormers all over the slopes, turrets on
 * the corners, and chimneys through the ridges. Six things, and the model builds
 * all six.
 *
 * The proportion, worked before anything was planned: the built footprint is
 * roughly 100 by 90 m and the central tower is 79 m, so the true
 * `halfDiagonal / height` is 67 / 79 = **0.85**. The Frontenac is one of the few
 * landmarks in this folder that fits the 2.0 cap as it stands — **no vertical
 * stretch, none needed.** The plan is squeezed about 10% all the same (39.9
 * units for 79 m is 0.505 units per metre, so true would be 50 by 45 and it is
 * built at 46 by 41), for exactly the reason Neuschwanstein squeezed its own by
 * 17%: what is being named here is a *crowd of roofs*, and at true spacing the
 * crowd spreads into a terrace of houses. Measured on the built model: radius
 * 30.2 against height 39.9, `halfDiagonal / height` = **0.76**.
 *
 * ---------------------------------------------------------------------------
 * How far forward the tower goes, which is the one decision that had a number
 * ---------------------------------------------------------------------------
 *
 * In life the central tower rises from the middle of the block, behind the wing
 * that faces the river. Seen in three-quarter view from 13.4 degrees up,
 * so a ridge of height `h` hides everything below `h + 0.238 d` at depth `d`
 * behind it. The riverfront ridge is 24.5 at z = 13; a tower left in the middle
 * of the courtyard at z = 0 would need to clear `24.5 + 0.238 x 13 = 27.6`, and
 * its shaft finishes at 29.0 — **1.4 units of a 26.6-unit shaft would have been
 * visible, 5% of it.** The tower would have read as a roof with a hat on.
 *
 * So the tower is pulled into the plane of the riverfront and given its own 0.6
 * units of projection past it, which is the same move a château makes with a
 * central pavilion anyway. Nothing is lost that a photograph does not already
 * lose: every picture taken from the river shows the tower rising *out of* the
 * front, because the front is what is between you and it.
 *
 * ---------------------------------------------------------------------------
 * Green, not olive
 * ---------------------------------------------------------------------------
 *
 * The palette holds two greens and the choice is not a toss-up. Against `clay`
 * brick (179, 109, 69) they have almost the same value — `green` computes to 159
 * luminance and `olive` to 158 — so the whole difference is hue and saturation,
 * and it lands in the shade. Halve them, which is what a surface turned from the
 * sun does here:
 *
 * ```
 * green  145,173,120  ->  72,86,60    still a green roof
 * olive  171,174, 43  ->  85,87,21    a murky dark yellow
 * ```
 *
 * Every steep roof has a shaded slope from every angle there is, so `olive`
 * would have given the model a set of dark yellow patches where its subject is.
 * `green` is also simply the more honest verdigris: copper patina is a
 * desaturated blue-green and `olive` is a saturated yellow-green, which reads as
 * lichen. Five colours in total — `clay` brick, `tan` stone, `green` copper,
 * `bark` windows, and `gold` on two finials.
 *
 * ---------------------------------------------------------------------------
 * A hundred dormers would be a grid, so there are eight
 * ---------------------------------------------------------------------------
 *
 * Angel Falls' cliff learned that two regular subdivisions of one surface
 * multiply into brickwork, and a hotel is the obvious place to make that mistake
 * twice: storey bands across the walls and window bays down them, dormers evenly
 * spaced along every roof. So there is **one repeating feature per surface and
 * no more.** The walls carry a single row of tall `bark` slots running two
 * storeys, unevenly spaced, and no storey bands at all — the only horizontals
 * are the four cornices and the tower's, which are single lines, not a series.
 * The roofs carry eight dormers of seven different widths spread over four
 * different slopes, plus two projecting cross-gables that break the eaves line
 * outright. Nothing in the model repeats at a regular pitch.
 *
 * The cones follow the same reasoning from the other side. The Space Needle's
 * legs showed that `OutlineEffect` hulls every mesh, so segment count is a
 * choice about what a curve should *read* as: few joints say natural, many say
 * manufactured. Every drum and cone here is eight-sided, because a copper roof
 * is the most manufactured object in this model and should look it.
 *
 * ---------------------------------------------------------------------------
 * Ground: it carries the terrace, and it does not carry the river or the cliff
 * ---------------------------------------------------------------------------
 *
 * **The Dufferin Terrace is modelled and it is right to be.** It is a built
 * boardwalk with a balustrade running the whole river front, it is where every
 * photograph of the hotel is taken from, and a terrace is exactly the case the
 * rule is for: a plaza, a courtyard, a fort's rock, a terrace own their ground.
 * With it goes the building's own `tan` stone base course, two steps of it, so
 * the brick does not start in the dirt.
 *
 * **The cliff and the river are not modelled.** The world flattens a 90-unit pad
 * under every monument, so a cliff would be a wall standing on a lawn; and the
 * St Lawrence would be the same opaque `skyBlue` coaster Mont-Saint-Michel
 * refused, inked into a hard black rim by `OutlineEffect`. Declining to model
 * water is a decision this folder has made before and it is made again here. The
 * biome at 46.81 N, 71.21 W is `boreal` and the ground reads `#665c45`, a dark
 * olive-brown, which is a perfectly good ground for a red brick building to
 * stand on — better than any plate this file could lay under itself.
 *
 * 1,456 triangles of 2,600 and 92 meshes of 110. The mesh budget is the binding
 * one, as it should be for a building whose subject is *how many separate roofs
 * it has*.
 *
 * `realHeight` is 79 m, which is the central tower. The rest of the hotel is
 * about half that.
 */

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/** Top of the stone base and of the terrace deck: where the brick starts. */
const BASE = 2.4;

/** Tower plan: half-width, and the z its centre sits at. */
const TOWER_HALF = 6.0;
const TOWER_Z = 13.6;

/**
 * The eight dormers, and the reason they are written out as a table is that the
 * *irregularity* is the feature. Six different widths over four different roofs,
 * and no two gaps equal: `roof` says which slope, `at` is the position along it.
 */
const DORMERS: { roof: 'frontLeft' | 'frontRight' | 'leftWing' | 'rightWing'; at: number; width: number }[] = [
  { roof: 'frontLeft', at: -10.2, width: 2.6 },
  { roof: 'frontLeft', at: -7.2, width: 2.0 },
  { roof: 'frontRight', at: 8.8, width: 2.9 },
  { roof: 'leftWing', at: -12.5, width: 2.6 },
  { roof: 'leftWing', at: -3.5, width: 2.2 },
  { roof: 'leftWing', at: 3.5, width: 2.4 },
  { roof: 'rightWing', at: -9.0, width: 2.3 },
  { roof: 'rightWing', at: 0.5, width: 1.9 },
];

export const chateauFrontenac: Monument = {
  id: 'chateau-frontenac',
  name: 'Château Frontenac',
  iso: 'CAN',
  lat: 46.8124,
  lon: -71.205,
  realHeight: 79,
  tier: 'building',
  // Set by the big corner turret's cone at 30.2. The terrace corner reaches
  // 29.5 and the riverfront's own corners only 27.6.
  footprint: 32,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper } = ctx;

    const brick = palette.clay; // the walls: Glenboig brick, red-brown
    const stone = palette.tan; // base, cornices, quoins, turret rings, chimney caps
    const copper = palette.green; // every roof, cone, dormer and gable
    const glass = palette.bark; // the windows and the loggia's recess
    const gilt = palette.gold; // two finials

    const group = new THREE.Group();

    /** A block given by its two opposite corners. */
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
     * A pitched roof: eaves at `eaves`, ridge `rise` above them, running along Z
     * — or along X with `alongX`.
     *
     * A three-sided `column` on its side is the cheapest gable there is, 12
     * triangles, but its pitch is fixed at 60 degrees by the prism's own
     * geometry and every roof here wants its own angle. So the prism is built at
     * unit size and the **mesh** carries the scale while the **pivot** carries
     * the yaw. That order is deliberate: `T * R * S` applies the scale first, in
     * the prism's own axes, which is where the numbers are meant. Local axes
     * after the quarter turn about X: local x stays world x, local y becomes the
     * run, local z becomes the height spanning -1 to +2, hence `scale.set(_, 1,
     * _)`.
     *
     * Pitches here run 45 to 55 degrees. Flatten them and this stops being a
     * château and becomes a shopping centre.
     */
    const gable = (
      cx: number,
      cz: number,
      length: number,
      halfWidth: number,
      eaves: number,
      rise: number,
      color: number,
      alongX = false,
    ): void => {
      const prism = column(1, length, color, 3);
      prism.scale.set(halfWidth / Math.sqrt(3), 1, rise / 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, rise / 3, -length / 2);

      const pivot = new THREE.Group();
      pivot.add(prism);
      if (alongX) pivot.rotation.y = Math.PI / 2;
      pivot.position.set(cx, eaves, cz);
      group.add(pivot);
    };

    // -----------------------------------------------------------------------
    // 1. The Dufferin Terrace, and the stone base under the brick. The two
    //    things in this model that own their ground — see the note above for
    //    what deliberately does not get modelled with them.
    // -----------------------------------------------------------------------
    block(-18.0, 18.0, 0, BASE, 18.6, 23.4, stone);
    // The balustrade in three runs with two gaps, not one 36-unit rail: a rail
    // that long is a blank slab, and the gaps are where the stairs come up.
    for (const [x0, x1] of [[-18.0, -7.0], [-3.2, 3.2], [7.0, 18.0]] as const) {
      block(x0, x1, BASE, BASE + 1.4, 22.6, 23.4, stone);
    }

    block(-20.8, 20.8, 0, 1.0, -17.8, 20.0, stone);
    block(-20.4, 20.4, 1.0, BASE, -17.4, 19.6, stone);

    // -----------------------------------------------------------------------
    // 2. The riverfront, in two unequal halves either side of the tower. The
    //    left is taller than the right by a unit — a château is a pile that grew
    //    and mirroring the two halves would say otherwise.
    // -----------------------------------------------------------------------
    // Both halves run *under* the tower to x = 5 rather than stopping at its
    // face at 6. Two parallel faces a tenth of a unit apart is the Niagara
    // failure — `OutlineEffect` hulls each mesh alone, so a face flush with its
    // neighbour's loses the depth test and draws no ink at all. Everything in
    // this model that meets another mass either overlaps it outright or stands
    // clear of it by half a unit; nothing stops just short.
    //
    // [x0, x1, eaves, rise]
    const FRONT = [
      [-20.0, -5.0, 17.5, 7.0], // ridge 24.5, pitch 48 degrees
      [5.0, 20.0, 16.5, 6.5], // ridge 23.0, pitch 45 degrees
    ] as const;
    for (const [x0, x1, eaves, rise] of FRONT) {
      block(x0, x1, BASE, eaves, 7.0, 19.0, brick);
      // Each cornice stops `PROUD` under its eaves: flush, its top shared the
      // brick's plane in another colour.
      block(x0 - 0.4, x1 + 0.4, eaves - 0.8 - PROUD, eaves - PROUD, 6.6, 19.4, stone);
      gable((x0 + x1) / 2, 13.0, x1 - x0 + 0.8, 6.4, eaves, rise, copper, true);
    }

    // -----------------------------------------------------------------------
    // 3. The wings and the back range, closing a courtyard. Every one is shorter
    //    than the one in front of it — 24.5, 22.5, 21.0, 19.5 — so the pile
    //    steps down away from the river, which is both true and the only way the
    //    back of it is seen at all.
    // -----------------------------------------------------------------------
    block(-20.0, -9.0, BASE, 16.0, -17.0, 8.0, brick);
    // Its cornice also ends `PROUD` short of the brick's end, both buried in
    // the riverfront block, rather than sharing that end's plane.
    block(-20.4, -8.6, 15.2 - PROUD, 16.0 - PROUD, -17.4, 8.0 - PROUD, stone);
    gable(-14.5, -4.5, 25.8, 5.9, 16.0, 6.5, copper); // ridge 22.5, pitch 48 degrees

    block(9.0, 20.0, BASE, 15.0, -17.0, 8.0, brick);
    block(8.6, 20.4, 14.2 - PROUD, 15.0 - PROUD, -17.4, 8.0 - PROUD, stone);
    gable(14.5, -4.5, 25.8, 5.9, 15.0, 6.0, copper); // ridge 21.0

    block(-9.5, 9.5, BASE, 14.0, -17.0, -8.0, brick);
    gable(0, -12.5, 19.8, 5.0, 14.0, 5.5, copper, true); // ridge 19.5

    // -----------------------------------------------------------------------
    // 4. The central tower. Square, canted at the corners by `tan` quoins, a
    //    heavy corbelled cornice, and a roof steeper than anything else in the
    //    model at 55 degrees.
    // -----------------------------------------------------------------------
    block(-TOWER_HALF, TOWER_HALF, BASE, 29.0, TOWER_Z - TOWER_HALF, TOWER_Z + TOWER_HALF, brick);

    // Quoins: four vertical strips standing 0.25 proud in both axes. They are
    // vertical on purpose — the tower already carries three tall window slots,
    // and a horizontal band added to those would have made the one grid this
    // file is trying not to draw.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        block(sx * 5.45, sx * 6.25, BASE, 29.0, TOWER_Z + sz * 5.45, TOWER_Z + sz * 6.25, stone);
      }
    }

    block(-6.9, 6.9, 29.0, 30.2, TOWER_Z - 6.9, TOWER_Z + 6.9, stone);

    const spire = taper(6.3, 0.55, 8.2, copper, 4);
    spire.position.set(0, 30.2, TOWER_Z);
    group.add(spire);

    const lantern = column(1.0, 0.8, stone, 8);
    lantern.position.set(0, 38.4, TOWER_Z);
    group.add(lantern);

    const finial = taper(0.55, 0.1, 0.7, gilt, 8);
    finial.position.set(0, 39.2, TOWER_Z);
    group.add(finial);

    // The four bartizans at the tower's corners, corbelled out over the cornice
    // and hugging the roof's own corner: at 5.8 from the axis their shafts stand
    // just outside the roof's 5.32 half-width at that height, which is what makes
    // them read as stuck to it rather than as four more chimneys.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const bx = sx * 5.8;
        const bz = TOWER_Z + sz * 5.2;

        const corbel = taper(0.7, 1.6, 1.4, stone, 8);
        corbel.position.set(bx, 30.2, bz);
        group.add(corbel);

        const shaft = column(1.6, 2.6, brick, 8);
        shaft.position.set(bx, 31.6, bz);
        group.add(shaft);

        const cone = taper(1.75, 0, 2.8, copper, 8);
        cone.position.set(bx, 34.2, bz);
        group.add(cone);
      }
    }

    // -----------------------------------------------------------------------
    // 5. The two round corner turrets, and they are deliberately not a pair. The
    //    big one closes the north end of the riverfront at 32.5 — the second
    //    tallest point in the model at 33.7 with its finial, and the only thing
    //    that keeps the tower from standing alone. The small one is 5.2 units
    //    shorter, a unit further forward and has no finial at all, which is what
    //    stops the front reading as symmetrical.
    // -----------------------------------------------------------------------
    // [x, z, apothem, top of drum, ring height, cone height, finial]
    const TURRETS = [
      { x: -20.0, z: 16.0, r: 4.0, drum: 22.0, cone: 9.6, gilt: true },
      { x: 19.5, z: 17.0, r: 2.8, drum: 19.0, cone: 7.4, gilt: false },
    ];
    for (const t of TURRETS) {
      // The stone foot runs to the ground rather than stopping on the plinth:
      // the turrets stand outside the plinth's own rectangle, and a drum that
      // started at 2.4 out there would be a drum hanging in the air.
      const foot = column(t.r + 0.3, BASE, stone, 8);
      foot.position.set(t.x, 0, t.z);
      group.add(foot);

      const drum = column(t.r, t.drum - BASE, brick, 8);
      drum.position.set(t.x, BASE, t.z);
      group.add(drum);

      const ring = column(t.r + 0.35, 0.9, stone, 8);
      ring.position.set(t.x, t.drum, t.z);
      group.add(ring);

      const cone = taper(t.r + 0.35, 0, t.cone, copper, 8);
      cone.position.set(t.x, t.drum + 0.9, t.z);
      group.add(cone);

      if (t.gilt) {
        const tip = column(0.24, 1.2, gilt, 4);
        tip.position.set(t.x, t.drum + 0.9 + t.cone, t.z);
        group.add(tip);
      }
    }

    // -----------------------------------------------------------------------
    // 6. The two cross-gables: projecting bays that break the eaves line from
    //    the ground up, which is the one roof feature that changes the *wall*
    //    as well as the slope. Both stop just under the ridge behind them —
    //    24.2 against 24.5, and 22.8 against 23.0 — so neither becomes the top
    //    of its own roof.
    // -----------------------------------------------------------------------
    block(-15.2, -11.6, BASE, 19.6, 13.0, 20.3, brick);
    gable(-13.4, 16.8, 7.0, 2.4, 19.6, 4.6, copper);
    block(11.6, 15.4, BASE, 18.4, 13.0, 20.2, brick);
    gable(13.5, 16.6, 7.2, 2.2, 18.4, 4.4, copper);

    // -----------------------------------------------------------------------
    // 7. The dormers. A cheek of brick pushed through the slope with its own
    //    little copper gable facing out; the back of each one buries itself in
    //    the roof it stands on, so only the front shows.
    // -----------------------------------------------------------------------
    for (const d of DORMERS) {
      const half = d.width / 2;
      const rise = d.width * 0.55;
      if (d.roof === 'frontLeft' || d.roof === 'frontRight') {
        const sill = d.roof === 'frontLeft' ? 18.0 : 17.0;
        const top = sill + 3.4;
        block(d.at - half, d.at + half, sill, top, 15.5, 17.8, brick);
        gable(d.at, 16.65, 2.7, half + 0.3, top, rise, copper);
      } else if (d.roof === 'leftWing') {
        block(-20.6, -18.5, 16.5, 19.6, d.at - half, d.at + half, brick);
        gable(-19.55, d.at, 2.5, half + 0.3, 19.6, rise, copper, true);
      } else {
        block(18.5, 20.6, 15.5, 18.4, d.at - half, d.at + half, brick);
        gable(19.55, d.at, 2.5, half + 0.3, 18.4, rise, copper, true);
      }
    }

    // -----------------------------------------------------------------------
    // 8. Three chimneys, through three different ridges at three different
    //    heights. They cost six meshes and they are the only thing in the model
    //    that says the roofs are on a building somebody lives in.
    // -----------------------------------------------------------------------
    for (const [x, z, foot, height] of [
      [-14.5, -9.0, 21.0, 5.6],
      [-9.0, 13.0, 23.0, 5.4],
      [14.5, -6.0, 19.5, 5.1],
    ] as const) {
      block(x - 0.8, x + 0.8, foot, foot + height, z - 1.3, z + 1.3, brick);
      block(x - 1.0, x + 1.0, foot + height, foot + height + 0.8, z - 1.5, z + 1.5, stone);
    }

    // -----------------------------------------------------------------------
    // 9. The windows: one row per face, two storeys tall, and never at an even
    //    pitch. See the note above on why there are no storey bands to cross
    //    them with.
    // -----------------------------------------------------------------------
    // The riverfront's own wall is mostly taken by the turrets and the two
    // projecting bays; what is left of it either side of the tower carries two
    // slots each, which is all the bare brick there is to carry any.
    for (const x of [-10.4, -8.0]) {
      block(x - 0.7, x + 0.7, 5.0, 15.0, 19.0, 19.45, glass);
    }
    for (const x of [7.6, 9.8]) {
      block(x - 0.7, x + 0.7, 5.0, 14.2, 19.0, 19.45, glass);
    }
    for (const x of [-3.2, 0, 3.2]) {
      block(x - 0.7, x + 0.7, 11.0, 27.0, TOWER_Z + 6.0, TOWER_Z + 6.45, glass);
    }
    for (const z of [-14.0, -6.0]) {
      block(-20.45, -20.0, 5.0, 13.5, z - 0.7, z + 0.7, glass);
    }
    for (const z of [-13.0, -4.0]) {
      block(20.0, 20.45, 5.0, 12.6, z - 0.7, z + 0.7, glass);
    }

    // -----------------------------------------------------------------------
    // 10. The loggia at the tower's foot, opening onto the terrace: a dark
    //     recess with three stone piers in front of it and a cornice over. The
    //     recess is `bark` and not a neutral for the reason set out beside
    //     `palette` in `contract.ts` — a `bone` or `steel` void behind columns
    //     comes back reading as a hole in the building rather than as a shadow
    //     inside it.
    // -----------------------------------------------------------------------
    block(-5.2, 5.2, BASE, 8.2, 20.0, 20.5, glass);
    for (const x of [-3.6, 0, 3.6]) {
      block(x - 0.7, x + 0.7, BASE, 8.2, 20.4, 21.4, stone);
    }
    block(-5.4, 5.4, 8.2, 9.4, 19.9, 21.5, stone);

    return group;
  },
};
