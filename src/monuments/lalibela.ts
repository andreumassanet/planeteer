import type { Mesh, Monument } from './contract.ts';

/**
 * Lalibela — Bete Giyorgis, the Church of Saint George.
 *
 * **This is the inverse of Petra, and that inversion is the whole file.** Petra
 * is a façade cut sideways into a cliff, so its file spends its geometry on rock
 * standing *behind* the carving. Bete Giyorgis was cut *downward into level
 * ground*: the masons trenched a deep square pit into a rock terrace and left a
 * free-standing cruciform church standing in the middle of it, its roof finishing
 * flush with the ground you walk on. There is no elevation of this building. You
 * arrive at the lip of a hole and look down on a church.
 *
 * ---------------------------------------------------------------------------
 * Where y = 0 is, and why. This decision is the build.
 * ---------------------------------------------------------------------------
 *
 * A monument's base sits at y = 0 and `validate` refuses anything below it, so
 * **a hole cannot be dug — it can only be built around.** That settles it: y = 0
 * is the *bottom of the pit*, the church's own foot, and the surrounding ground
 * is modelled as a mass of rock standing 37.8 units above it. The terrace is not
 * scenery around the church; it is the only way the contract can express a hole.
 *
 * The alternative — y = 0 at the rock's top surface, the way the site actually
 * meets the planet — puts the entire church and its pit under the terrain: the
 * validator rejects it, and even if it did not, the world would show a paved
 * square with nothing on it. Choosing the pit floor instead costs one thing and
 * buys two. It costs realism at the join: on the planet this reads as a rock mesa
 * with a hole in its top rather than as a hole in flat ground, and a player
 * walking up to it climbs 37.8 units of rock before looking in. It buys the church
 * standing on the ground plane like every other monument in the world, and it
 * buys the pit, which is the whole point of the place.
 *
 * So the model is built as **an inverted mesa**: an apron of rock, a terrace, a
 * square trench cut through it, and a church left standing in the trench with a
 * courtyard clear on all four sides.
 *
 * ---------------------------------------------------------------------------
 * The sightline problem, and the one liberty taken to solve it
 * ---------------------------------------------------------------------------
 *
 * Seen from 13.9° above the horizon, and at that
 * angle a pit whose rim stands at the church's roofline is a closed box. The
 * arithmetic, on this model's own numbers: a ray leaving a point on the church's
 * front face rises 0.28 units for every unit it travels toward the camera, so a
 * full-height near wall 10 units out reveals only the top **2.8 units** of a 31.2-unit
 * church. Nor can the courtyard be widened out of the problem, because 0.28 is
 * the whole exchange rate — seeing two thirds of the church past a full-height
 * rim would need a trench about 200 units across, four times the tier's entire
 * footprint. The near rock has to come down. That is not a preference; it is the
 * only lever the geometry offers.
 *
 * So the terrace stands at 37.8 across the back and the rear two thirds of both
 * sides, then **drops in one clean step to a 10-unit lip** around the front,
 * which is true enough of churches cut into a sloping rock scarp and is the same
 * device the Great Sphinx's enclosure uses for the same reason. One step and not
 * three: the first build terraced down in three courses and came out an
 * amphitheatre. The consequence is deliberate — **the flush roof is read against
 * the back wall.** You look over the low lip, across the courtyard floor, at a
 * church whose roofline and the top of the rock behind it are one continuous
 * horizontal, which is what every photograph taken from the rim shows.
 *
 * ---------------------------------------------------------------------------
 * What must survive at thumbnail size
 * ---------------------------------------------------------------------------
 *
 * 1. **The Greek cross.** Equal arms, 12.9 wide on a span of 28.0, so 0.46 — the
 *    chunky plus of the aerial photograph. From above it is unmistakable; from
 *    the quarter view it is four re-entrant corners 7.55 units deep, and
 *    `OutlineEffect` inks every one of them.
 * 2. **The three nested crosses on the roof.** Carved in relief, so they are the
 *    one thing here that had to be *added* rather than left standing: three cross
 *    slabs of 22.4, 15.2 and 8.2 units span, in steps of 0.55 on a 31.2-unit
 *    church. The real relief is flat and this one is a very shallow stair, which
 *    is the trade — a flat relief has no side faces for the ink to find. The
 *    relief alone is `cream` and the roof plane under it `blush`: a `cream` roof
 *    was tried and the whole top read as a lid dropped on the church, while
 *    `blush` keeps the roof continuous with the walls and still lets the crosses
 *    carry the brightest note in the model.
 * 3. **The pit.** Sheer walls on all four sides with the church clear of every
 *    one of them by 7.8 units, a `brown` cut-face veneer standing 0.4 proud of the
 *    weathered `clay` above it so the trench reads as a fresh cut through old
 *    rock, and hermit niches punched into that veneer — the courtyard walls of
 *    the real one are honeycombed with tombs and cells.
 * 4. **The stepped profile.** A three-stepped plinth at the foot, two string
 *    courses across the body, then a cornice projecting 1.0 beyond the body and a
 *    flat roof set back inside it: three receding levels from body to roof plane.
 *    The cornice is load-bearing, compositionally. Without it the plinth, the
 *    body and the relief make one continuous taper and the church renders as a
 *    beehive — which is exactly what the first build did.
 * 5. **Rows of windows.** Lower register flat-topped and squat, upper register
 *    arched with an octagonal head, on all twelve outward faces of the cross, with
 *    the doorway on the +Z arm under its own lintel. Each register sits just under
 *    a string course, which is real, and which also gives every window a brow — a
 *    dark panel proud of a wall reads as an opening once something overhangs it,
 *    and nothing in the contract can cut a real one.
 *
 * ---------------------------------------------------------------------------
 * Proportion
 * ---------------------------------------------------------------------------
 *
 * **The church is not distorted; the trench around it is.** Bete Giyorgis is
 * about 12 m tall on a cross about 12 m across, and here it stands 31.2 units
 * from pavement to roof on a 32.4-unit plinth span — 0.96 against a real 1.0,
 * untouched. And the pit is exactly as deep as the church is tall, because that
 * is what "the roof is level with the ground" means; the two are one constant in
 * the code. What is squeezed is the courtyard: the real pit is roughly 25 m
 * square around a 12 m church, a ratio of 2.08, and this one runs 48 across
 * against 32.4, a ratio of 1.48. **The trench is 1.4x tighter in plan than life.**
 * That is the axis carrying the least recognition — nobody names this place by
 * how much floor there is — and spending it is what keeps the church big enough
 * to read in a 260-pixel cell.
 *
 * The rock is cropped for the reason Petra crops its cliff: the terrace runs to
 * the horizon in life, and here it is 8 units of rim on a 1-unit apron ledge, the
 * least rock that still reads as ground rather than as a wall around a courtyard.
 * Half-diagonal 46.67 against height 39.45 gives 1.18, inside the 2.0 cap, so
 * nothing needed stretching to fit.
 *
 * **Tier: `building`.** By the tier question — from how far should you be able to
 * name it? — Lalibela is the hardest case in the list, because the honest answer
 * is *you cannot see it at all until you are standing over it*. But `monument`'s
 * 15 units cannot hold a church, a courtyard and a rim, and this is a site rather
 * than an object. `building` at 40 units, filled to 39.45, is the tier that fits.
 *
 * No `realHeight`: the source list asserts none, and Lalibela is eleven churches,
 * not a height. The 12 m usually quoted belongs to Bete Giyorgis alone.
 */

// ---------------------------------------------------------------------------
// The rock. Everything here is an absolute height above the pit floor.
// ---------------------------------------------------------------------------

/** The apron of talus at the foot of the scarp — the model's widest point. */
const APRON = 33;
const APRON_TOP = 3.5;
/** The terrace proper, set back from the apron so the mass has a base ledge. */
const ROCK = 32;
/** Inner half-width of the trench. The church stands clear inside this. */
const PIT = 24;
/** Top of the courtyard pavement. */
const PAVE = 6.6;
/** Ground level — and therefore the church's roof plane. The two are one number. */
const GROUND = 37.8;
/**
 * The front lip, and the z at which the side walls drop to it. One drop, not a
 * flight of them: three courses of terrace read as an amphitheatre, and it took
 * a render to find that out. See the sightline note above.
 */
const LIP = 10;
const DROP = 8;
/** The entrance channel cut through the front lip, and its half-width. */
const SILL = 7.2;
const CHANNEL = 7;
/** How far the fresh cut face stands proud of the weathered rock behind it. */
const VENEER = 0.4;

// ---------------------------------------------------------------------------
// The church: [bottom, top, span, arm]. Read the third and fourth columns down
// the page and that is the elevation — plinth stepping out, one body, a
// projecting cornice, a flat roof, three crosses in relief.
// ---------------------------------------------------------------------------

type Level = [y0: number, y1: number, span: number, arm: number];

const PLINTH: Level[] = [
  [PAVE, 8.6, 32.4, 17.3],
  [8.6, 10.6, 30.8, 15.5],
  [10.6, 12.6, 29.2, 13.7],
];

/** The one mass. Everything else is a course on top of or under it. */
const BODY: Level = [12.6, 34.2, 28.0, 12.9];

/** Half-width of an arm end face, and how far out that face stands. */
const ARM_HALF = BODY[3] / 2;
const FACE = BODY[2] / 2;

/** Projecting courses. Real mouldings, and the brow every window needs. */
const STRINGS: Level[] = [
  [19.6, 20.8, 29.0, 13.9],
  [29.0, 30.2, 29.0, 13.9],
];

/**
 * The cornice, projecting further than anything below it, and then a flat roof.
 * The first build ran three receding courses up to the roof and the church came
 * out a beehive: six steps of similar decrement, and a stack of shrinking
 * crosses is a dome. One strong horizontal stops it dead.
 */
const CORNICE: Level = [34.2, 35.6, 30.0, 14.9];
const ROOF: Level = [35.6, GROUND, 28.6, 13.5];

/** The three crosses in relief. 0.55 of step each, on a 31.2-unit church. */
const RELIEF: Level[] = [
  [GROUND, 38.35, 22.4, 10.3],
  [38.35, 38.9, 15.2, 7.0],
  [38.9, 39.45, 8.2, 3.8],
];

/** Depth of a window panel: half buried in the wall, half proud of it. */
const PANE = 0.6;

export const lalibela: Monument = {
  id: 'lalibela',
  name: 'Rock-Hewn Churches of Lalibela',
  iso: 'ETH',
  lat: 12.032,
  lon: 39.043,
  tier: 'building',
  footprint: 46.7,

  build(ctx) {
    const { THREE, palette, box, column, around } = ctx;

    // Lalibela is cut from one bed of red volcanic tuff, so this is one rock in
    // four weathers, laddered by value from the bottom of the hole to the top of
    // the roof — which is also the order the light reaches them in. Every entry is
    // on the warm side of the palette, because most of this model is a recess and
    // the note beside `ctx.palette` is unambiguous about what a neutral does in
    // one. `crimson` and `red` are out for the reason Petra keeps them out: at cel
    // saturation they read as paint, not stone.
    const terrace = palette.clay; // weathered rock, the ground you walk on
    const fresh = palette.brown; // the cut faces of the trench, in permanent shade
    const stone = palette.salmon; // the church, in the light that reaches the pit
    const roof = palette.blush; // the roof plane, level with the ground and open to the sky
    const sunlit = palette.cream; // the relief crosses, the one surface that never leaves the sun
    const shadow = palette.bark; // doorways, windows, hermit niches

    const group = new THREE.Group();

    /**
     * A block given by its own extents rather than a size and a centre. Half of
     * this file is walls that must meet exactly, and naming both faces is the
     * only way to be sure they do.
     */
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
     * One level of the Greek cross: a spine along X and two stubs along Z,
     * standing on `y0` and centred on the axis.
     *
     * **Three boxes and not two, and the reason is worth the extra draw call.**
     * Two full bars crossing is the obvious build, and it puts two top faces at
     * the same height over the whole central square. Wherever the course above
     * fails to cover that square — its four corners, always — the two faces are
     * coplanar and z-fight. It showed up first and worst on the roof, which is
     * the one large horizontal surface in the model and the one everybody
     * photographs. Butting the stubs against the spine instead means nothing in
     * the church overlaps anything.
     */
    const cross = ([y0, y1, span, arm]: Level, color: number): void => {
      const height = y1 - y0;
      const spine = box(span, height, arm, color);
      spine.position.y = y0;
      group.add(spine);
      const stub = (span - arm) / 2;
      for (const side of [-1, 1]) {
        const wing = box(arm, height, stub, color);
        wing.position.set(0, y0, (side * (arm + stub)) / 2);
        group.add(wing);
      }
    };

    // -----------------------------------------------------------------------
    // 1. The rock mass. The trench is what these blocks leave between them —
    //    nothing subtracts, so the hole is never built in the first place.
    // -----------------------------------------------------------------------

    // The apron: one plate under the whole site, a unit wider than the terrace on
    // every side, so the mass sits on a ledge instead of on a clean corner.
    block(-APRON, APRON, 0, APRON_TOP, -APRON, APRON, terrace);
    // The courtyard pavement, inside the trench only.
    block(-PIT, PIT, APRON_TOP, PAVE, -PIT, PIT, fresh);

    // The back wall, full height, and the only wall whose top edge lines up with
    // the church's roof in the default view. It carries the whole flush-roof
    // reading, so it runs the full width and is never stepped.
    block(-ROCK, ROCK, APRON_TOP, GROUND, -ROCK, -PIT, terrace);

    // The side walls: full height as far as the drop, then the low front.
    for (const side of [-1, 1]) {
      const inner = side * PIT;
      const outer = side * ROCK;
      block(inner, outer, APRON_TOP, GROUND, -PIT, DROP, terrace);
      block(inner, outer, APRON_TOP, LIP, DROP, PIT, terrace);
    }

    // The front lip, split by the entrance channel. The real courtyard is reached
    // through a cutting in the rock, and here that cutting is also what lets the
    // camera see the floor of the trench at all.
    for (const side of [-1, 1]) {
      block(side * CHANNEL, side * ROCK, APRON_TOP, LIP, PIT, ROCK, terrace);
    }
    block(-CHANNEL, CHANNEL, APRON_TOP, SILL, PIT, ROCK, terrace);

    // -----------------------------------------------------------------------
    // 2. The cut faces. A veneer of fresher stone standing 0.4 proud of the
    //    weathered rock, so the trench reads as something quarried out of the
    //    terrace rather than as a courtyard walled in. It stops short of each
    //    wall's top: the last few units up there have been in the weather for
    //    eight hundred years.
    // -----------------------------------------------------------------------
    const face = PIT - VENEER;
    block(-face, face, PAVE, GROUND - 4, -PIT, -face, fresh);
    block(-face, face, PAVE, LIP - 1.5, face, PIT, fresh);
    for (const side of [-1, 1]) {
      block(side * face, side * PIT, PAVE, GROUND - 4, -PIT, DROP, fresh);
      block(side * face, side * PIT, PAVE, LIP - 1.5, DROP, PIT, fresh);
    }

    // Hermit cells and tombs, cut into the trench walls. Four to the back wall,
    // two to each side — only the walls facing the light show any, which is also
    // the only place they would ever have been cut.
    const niche = (x: number, z: number, width: number, depth: number): void => {
      const mesh = box(width, 6.0, depth, shadow);
      mesh.position.set(x, 16, z);
      group.add(mesh);
    };
    for (const x of [-19.5, -10, 10, 19.5]) niche(x, -face - 0.1, 2.6, 0.8);
    for (const side of [-1, 1]) {
      for (const z of [-18, -7]) niche(side * (face + 0.1), z, 0.8, 2.6);
    }

    // -----------------------------------------------------------------------
    // 3. The church. A stepped plinth, one cruciform mass, two string courses,
    //    a projecting cornice, a flat roof, three crosses in relief. The roof
    //    finishes at GROUND, which is the terrace's own top: one constant, used
    //    twice, so the two can never drift apart.
    // -----------------------------------------------------------------------
    for (const level of PLINTH) cross(level, stone);
    cross(BODY, stone);
    for (const level of STRINGS) cross(level, stone);
    cross(CORNICE, stone);
    cross(ROOF, roof);
    for (const level of RELIEF) cross(level, sunlit);

    // -----------------------------------------------------------------------
    // 4. The openings. Built once for the +Z arm and spun to the other three,
    //    which is what a Greek cross is for. Every panel is a dark block half
    //    buried in its wall: nothing in the contract cuts a hole, and at this
    //    size a hole and a dark panel under a projecting course are the same
    //    drawing.
    // -----------------------------------------------------------------------

    /** A flat-topped window in a wall facing +Z. */
    const pane = (width: number, y0: number, y1: number, x: number, z: number): Mesh => {
      const mesh = box(width, y1 - y0, PANE, shadow);
      mesh.position.set(x, y0, z);
      return mesh;
    };

    /** The octagonal head of an arched window, laid so its face looks down +Z. */
    const head = (radius: number, y: number, x: number, z: number): Mesh => {
      const mesh = column(radius, PANE, shadow, 8);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z - PANE / 2);
      return mesh;
    };

    const arms = around(4, () => {
      const arm = new THREE.Group();

      // The arm end face: two squat windows below the first string course, one
      // arched window above it.
      for (const side of [-1, 1]) {
        arm.add(pane(2.2, 14.5, 19.0, side * 4.0, FACE));
      }
      arm.add(pane(3.2, 23.5, 26.3, 0, FACE));
      arm.add(head(1.6, 26.3, 0, FACE));

      // The two flanks of the arm. One arched window each, turned a quarter so
      // it faces ±X, and set midway along the flank's 7.55 units of wall.
      for (const side of [-1, 1]) {
        const flank = side * ARM_HALF;
        const shaft = box(PANE, 2.5, 2.6, shadow);
        shaft.position.set(flank, 23.5, 10.4);
        const cap = column(1.3, PANE, shadow, 8);
        cap.rotation.z = -Math.PI / 2;
        cap.position.set(flank - PANE / 2, 26.0, 10.4);
        arm.add(shaft, cap);
      }
      return arm;
    });
    group.add(arms);

    // The doorway, on the +Z arm alone, so the model has a front. Two jambs and a
    // lintel standing 0.5 proud of the wall frame a dark panel — the Axumite
    // frame, and the one place on the church where the interior shows.
    const door = box(3.6, 5.6, PANE, shadow);
    door.position.set(0, 12.6, FACE);
    group.add(door);
    for (const side of [-1, 1]) {
      const jamb = box(0.7, 5.6, 1.0, stone);
      jamb.position.set(side * 2.15, 12.6, FACE);
      group.add(jamb);
    }
    const lintel = box(5.0, 1.0, 1.0, stone);
    lintel.position.set(0, 18.2, FACE);
    group.add(lintel);

    return group;
  },
};
