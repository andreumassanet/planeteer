import type { Monument } from './contract.ts';

/**
 * Chichen Itza — El Castillo, the pyramid of Kukulcan.
 *
 * A smooth four-sided taper is *almost* this building and reads as nothing, so
 * everything here serves the one distinction that matters: this is a staircase,
 * not a ramp. Four things carry it — nine stepped terraces, the broad stairway
 * up each face, the balustrades that hold a straight line while the terraces
 * step back behind them, and the temple on the summit that stops the pyramid
 * looking decapitated.
 *
 * **Why `building` and not `landmark`.** The real thing is 55 m across and 30 m
 * tall, a ratio of 1.8. At the landmark tier's 120 units that base wants a
 * 110-unit radius — twice that tier's own footprint ceiling — so it could only
 * be filed there by being made steep, and a steep Castillo is somebody else's
 * pyramid. At 40 tall and 70 across it keeps its proportions, and 40 units is
 * the right answer to "from how far should you be able to name it": from across
 * the site, over the trees, which is exactly how you meet it.
 *
 * Two things traded away:
 *
 * - **The base is 1.75 wide to tall, not 1.84.** Five per cent steeper than
 *   life, and it buys the footprint back under 50 of the tier's 55 so placement
 *   has room. Next to nine terraces the difference is invisible.
 * - **The temple carries no roof comb and no relief.** At the size the summit
 *   block occupies — a fifth of the model's height — a doorway on each face is
 *   the last thing that still reads, and anything finer is a smudge.
 */

// --- the body -------------------------------------------------------------
const TERRACES = 9;
/** Each terrace is a sloping talud capped by a vertical tablero: the Maya lip. */
const TALUD = 2.6;
const TABLERO = 0.9;
const TERRACE = TALUD + TABLERO;
const BODY = TERRACES * TERRACE;
const TOP = 40;

/** Half-width across the flats at the ground. A 4-gon, so the corners reach x1.41. */
const BASE = 35;
const INSET = 2.5;
/** How far a tablero stands proud of the talud above it — the ledge the ink catches. */
const LIP = 0.7;

/** The face of the pyramid, as a line. Everything on the outside is hung off it. */
const SLOPE = INSET / TERRACE;
const faceZ = (y: number): number => BASE - SLOPE * y;

// --- the stairways --------------------------------------------------------
/**
 * Twelve steps against nine terraces. Fewer and the treads come out the same
 * size as the terraces they cross, which is the one thing that would undo the
 * staircase; many more and the model is paying draw calls for a texture.
 */
const STEPS = 12;
const STEP_RISE = BODY / STEPS;
const STEP_DEPTH = 5;
const STAIR_HALF = 4.5;
/** How far the stairway projects from the face. The real ones project too. */
const STAIR_PROUD = 1.4;

const RAIL = 2.2;
const RAIL_X = STAIR_HALF + RAIL / 2;
/** The rail rides the same slope as the treads, lifted clear of their noses. */
const RAIL_LIFT = 0.8;
const RAIL_FOOT = 2.0;
const railZ = (y: number): number => faceZ(y - RAIL_LIFT) + STAIR_PROUD;

// --- the temple -----------------------------------------------------------
const TEMPLE_HALF = 9.6;
const TEMPLE_WALL = 3;
const TEMPLE_HEIGHT = 6.8;
const TEMPLE_CORNICE = 1.2;
const DOOR_HALF = 4;
const DOOR_HEIGHT = 5.4;

export const chichenItza: Monument = {
  id: 'chichen-itza',
  name: 'Chichen Itza',
  iso: 'MEX',
  lat: 20.683,
  lon: -88.569,
  realHeight: 30,
  tier: 'building',
  footprint: 50,

  build(ctx) {
    const { THREE, palette, box, taper, strut, around } = ctx;
    const stone = palette.sand;
    const band = palette.tan;
    const painted = palette.clay;
    const shadow = palette.bark;
    const group = new THREE.Group();

    // --- nine terraces ---
    for (let i = 0; i < TERRACES; i++) {
      const bottom = BASE - INSET * i;
      const top = bottom - INSET;

      const talud = taper(bottom, top, TALUD, stone, 4);
      talud.position.y = i * TERRACE;
      group.add(talud);

      // Wider than the talud it caps and wider than the one above, so every
      // terrace ends on a ledge with an ink line under it rather than on a
      // crease. Nine of these are the difference between stairs and a slope.
      const tablero = box((top + LIP) * 2, TABLERO, (top + LIP) * 2, band);
      tablero.position.y = i * TERRACE + TALUD;
      group.add(tablero);
    }

    // --- four stairways ---
    group.add(
      around(4, (side) => {
        const stair = new THREE.Group();

        for (let i = 0; i < STEPS; i++) {
          const y = i * STEP_RISE;
          const front = faceZ(y) + STAIR_PROUD;
          const step = box(STAIR_HALF * 2, STEP_RISE, STEP_DEPTH, stone);
          // Deep enough to bury itself in the terraces behind: only the tread
          // and its riser are ever seen, and the rest is what holds the stair
          // onto the pyramid instead of floating a ladder against it.
          step.position.set(0, y, front - STEP_DEPTH / 2);
          stair.add(step);
        }

        for (const x of [1, -1]) {
          stair.add(
            strut(
              new THREE.Vector3(x * RAIL_X, RAIL_FOOT, railZ(RAIL_FOOT)),
              new THREE.Vector3(x * RAIL_X, BODY + RAIL_LIFT, railZ(BODY + RAIL_LIFT)),
              RAIL,
              band,
            ),
          );

          // The rail is a beam centred on its own axis, so its lower end is cut
          // on the diagonal and hangs below y = 0. The alfarda's foot block
          // covers it, which is also what the real stairways end in.
          const foot = box(RAIL + 0.8, RAIL_FOOT + 0.4, 4.6, band);
          foot.position.set(x * RAIL_X, 0, railZ(RAIL_FOOT) - 0.65);
          stair.add(foot);

          // Only the north stairway ends in the feathered serpent, and with four
          // identical faces these two blocks are the only thing that says which
          // way the front is.
          if (side === 0) {
            const head = box(RAIL + 0.6, 1.8, 3, painted);
            head.position.set(x * RAIL_X, 0, railZ(RAIL_FOOT) + 2.96);
            stair.add(head);
          }
        }

        return stair;
      }),
    );

    // --- the temple ---
    const temple = new THREE.Group();
    temple.position.y = BODY;
    group.add(temple);

    // Dark, and set back a full wall thickness, so each doorway reads as a hole
    // into shadow. A hole is cheaper as a recess than as geometry.
    temple.add(
      box((TEMPLE_HALF - TEMPLE_WALL) * 2, TEMPLE_HEIGHT, (TEMPLE_HALF - TEMPLE_WALL) * 2, shadow),
    );

    const pier = TEMPLE_HALF - DOOR_HALF;
    temple.add(
      around(4, () => {
        const wall = new THREE.Group();
        for (const x of [1, -1]) {
          const jamb = box(pier, DOOR_HEIGHT, TEMPLE_WALL, painted);
          jamb.position.set(x * (DOOR_HALF + pier / 2), 0, TEMPLE_HALF - TEMPLE_WALL / 2);
          wall.add(jamb);
        }
        const lintel = box(TEMPLE_HALF * 2, TEMPLE_HEIGHT - DOOR_HEIGHT, TEMPLE_WALL, stone);
        lintel.position.set(0, DOOR_HEIGHT, TEMPLE_HALF - TEMPLE_WALL / 2);
        wall.add(lintel);
        return wall;
      }),
    );

    const cornice = box((TEMPLE_HALF + 0.8) * 2, TEMPLE_CORNICE, (TEMPLE_HALF + 0.8) * 2, stone);
    cornice.position.y = TEMPLE_HEIGHT;
    temple.add(cornice);

    const roof = box(17.2, TOP - BODY - TEMPLE_HEIGHT - TEMPLE_CORNICE, 17.2, painted);
    roof.position.y = TEMPLE_HEIGHT + TEMPLE_CORNICE;
    temple.add(roof);

    return group;
  },
};
