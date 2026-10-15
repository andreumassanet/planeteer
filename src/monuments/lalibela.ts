import type { Mesh, Monument } from './contract.ts';

/**
 * Lalibela: Bete Giyorgis, the Church of Saint George.
 *
 * The church is cut downward into level ground, a free-standing Greek cross in
 * the middle of a square pit with its roof flush with the ground around it. A
 * monument's base sits at y = 0 and cannot go below it, so y = 0 is the pit
 * floor and the surrounding ground is a mass of rock standing `GROUND` units
 * above it: an inverted mesa. Nothing subtracts; the trench is what the rock
 * blocks leave between them.
 *
 * From the camera's elevation a pit whose rim stands at the roofline is a closed
 * box, so the terrace is full height across the back and the rear of both
 * sides, then drops in one step to a low lip around the front. The flush roof
 * is read against the back wall.
 *
 * The church has equal arms (0.46 of the span), three nested relief crosses on
 * the roof, a stepped plinth, two string courses and a projecting cornice (it
 * stops the plinth, body and relief reading as a beehive), and window
 * registers on the twelve outward faces with a doorway on the +Z arm. Panels
 * are dark blocks half buried in the wall, since nothing in the contract cuts a
 * hole. The cut faces of the trench are a fresher veneer standing proud of the
 * weathered rock, with hermit niches punched into it.
 *
 * The church keeps its proportion; the courtyard is about 1.4x tighter in plan
 * than life and the rock is cropped to a short rim. Tier `building`. No
 * `realHeight`: Lalibela is eleven churches, not a height.
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
/** The front lip, and the z at which the side walls drop to it: one drop, not a flight. */
const LIP = 10;
const DROP = 8;
/** The entrance channel cut through the front lip, and its half-width. */
const SILL = 7.2;
const CHANNEL = 7;
/** How far the fresh cut face stands proud of the weathered rock behind it. */
const VENEER = 0.4;

// The church: [bottom, top, span, arm]. Reading the third and fourth columns
// down the page gives the elevation.

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

/** The cornice projects further than anything below it, then a flat roof. */
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
  surface: 'none',
  footprint: 46.7,

  build(ctx) {
    const { THREE, palette, box, column, around } = ctx;

    // One rock in four weathers, laddered by value from the pit floor to the
    // roof. All warm: most of this model is a recess, and `crimson` and `red`
    // read as paint at cel saturation.
    const terrace = palette.clay; // weathered rock, the ground you walk on
    const fresh = palette.brown; // the cut faces of the trench, in permanent shade
    const stone = palette.salmon; // the church, in the light that reaches the pit
    const roof = palette.blush; // the roof plane, level with the ground and open to the sky
    const sunlit = palette.cream; // the relief crosses, the one surface that never leaves the sun
    const shadow = palette.bark; // doorways, windows, hermit niches

    const group = new THREE.Group();

    /** A block given by its extents rather than a size and a centre, so walls meet exactly. */
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
     * standing on `y0` and centred on the axis. Butting the stubs against the
     * spine (rather than crossing two full bars) keeps coplanar top faces from
     * z-fighting over the central square.
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

    // --- 1. The rock mass ---

    // The apron: one plate under the whole site, wider than the terrace on every side.
    block(-APRON, APRON, 0, APRON_TOP, -APRON, APRON, terrace);
    // The courtyard pavement, inside the trench only.
    block(-PIT, PIT, APRON_TOP, PAVE, -PIT, PIT, fresh);

    // The back wall, full height; its top lines up with the church's roof.
    block(-ROCK, ROCK, APRON_TOP, GROUND, -ROCK, -PIT, terrace);

    // The side walls: full height as far as the drop, then the low front.
    for (const side of [-1, 1]) {
      const inner = side * PIT;
      const outer = side * ROCK;
      block(inner, outer, APRON_TOP, GROUND, -PIT, DROP, terrace);
      block(inner, outer, APRON_TOP, LIP, DROP, PIT, terrace);
    }

    // The front lip, split by the entrance channel that also lets the camera see the floor.
    for (const side of [-1, 1]) {
      block(side * CHANNEL, side * ROCK, APRON_TOP, LIP, PIT, ROCK, terrace);
    }
    block(-CHANNEL, CHANNEL, APRON_TOP, SILL, PIT, ROCK, terrace);

    // --- 2. The cut faces, stopping short of each wall's top ---
    const face = PIT - VENEER;
    block(-face, face, PAVE, GROUND - 4, -PIT, -face, fresh);
    block(-face, face, PAVE, LIP - 1.5, face, PIT, fresh);
    for (const side of [-1, 1]) {
      block(side * face, side * PIT, PAVE, GROUND - 4, -PIT, DROP, fresh);
      block(side * face, side * PIT, PAVE, LIP - 1.5, DROP, PIT, fresh);
    }

    // Hermit cells and tombs: four in the back wall, two in each side.
    const niche = (x: number, z: number, width: number, depth: number): void => {
      const mesh = box(width, 6.0, depth, shadow);
      mesh.position.set(x, 16, z);
      group.add(mesh);
    };
    for (const x of [-19.5, -10, 10, 19.5]) niche(x, -face - 0.1, 2.6, 0.8);
    for (const side of [-1, 1]) {
      for (const z of [-18, -7]) niche(side * (face + 0.1), z, 0.8, 2.6);
    }

    // --- 3. The church; the roof finishes at GROUND ---
    // -----------------------------------------------------------------------
    for (const level of PLINTH) cross(level, stone);
    cross(BODY, stone);
    for (const level of STRINGS) cross(level, stone);
    cross(CORNICE, stone);
    cross(ROOF, roof);
    for (const level of RELIEF) cross(level, sunlit);

    // --- 4. The openings, built once for the +Z arm and spun to the other three ---

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

      // The arm end face: two squat windows below the first string course, one arched above it.
      for (const side of [-1, 1]) {
        arm.add(pane(2.2, 14.5, 19.0, side * 4.0, FACE));
      }
      arm.add(pane(3.2, 23.5, 26.3, 0, FACE));
      arm.add(head(1.6, 26.3, 0, FACE));

      // The two flanks of the arm: one arched window each, facing +-X.
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

    // The doorway, on the +Z arm alone: two jambs and a lintel frame a dark panel.
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
