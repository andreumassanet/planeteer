import { PROUD } from './contract.ts';
import type { Group, Monument, Vector3 } from './contract.ts';

/**
 * Atomium.
 *
 * A unit cell of an iron crystal: nine spheres at the corners and centre of a
 * cube, joined by twenty tubes. The cube stands on a corner, its body diagonal
 * vertical: one sphere at the top, one at the bottom, six between on two
 * triangles 60 degrees out of phase. With edge `a` the rise between levels is
 * a/sqrt(3), the total a*sqrt(3), the middle ring radius a*sqrt(2/3). Edge tubes
 * are `a` long and the eight centre-to-corner tubes 0.866 a.
 *
 * Proportions are real (18 m spheres, 29 m between centres, scaled 120/102); the
 * half-diagonal over height is 0.32. Tubes are 35% fatter than true so the
 * lattice does not grey out at thumbnail size; spheres stay 4.5 times their
 * diameter.
 */

// ---------------------------------------------------------------------------
// The crystal
// ---------------------------------------------------------------------------

/** A hair under the tier's 120 so floating-point drift cannot push it over. */
const TOP = 119.9;

/** The real thing, in metres, kept as the source of every proportion below. */
const REAL_HEIGHT = 102;
const REAL_EDGE = 29; // sphere centre to sphere centre, along a cube edge
const REAL_SPHERE = 18; // sphere diameter

const SCALE = TOP / REAL_HEIGHT;
const EDGE = REAL_EDGE * SCALE; // 34.12
const BALL = (REAL_SPHERE / 2) * SCALE; // 10.59

/** The three consequences of standing the cube on its corner. */
const DIAGONAL = EDGE * Math.sqrt(3); // 59.09 — bottom sphere centre to top sphere centre
const RISE = EDGE / Math.sqrt(3); // 19.70 — one level to the next
const RING = EDGE * Math.sqrt(2 / 3); // 27.86 — axis to a middle sphere's centre

/**
 * Centre of the lowest sphere. The gap below it (just under 40 units, 33.8 m in
 * life) is the gap the monument is known for; the bipods reach past it.
 */
const BOTTOM_Y = TOP - BALL - DIAGONAL; // 50.22

/**
 * Azimuth of the lower triangle of corners, in radians. With the lower triangle
 * facing the camera its nearest sphere lands on the axis and eclipses the bottom
 * sphere; turned 60 degrees, an upper sphere comes forward instead.
 */
const PHASE = Math.PI / 3;

// ---------------------------------------------------------------------------
// Faceted balls
// ---------------------------------------------------------------------------

const BALL_SIDES = 10;

/**
 * The ball is a stack of six frusta: latitude rings of the unit sphere at
 * 30-degree steps, cones at the poles and four bands between. `taper` takes
 * half-widths across the flats, so each ring is multiplied by `cos(pi / sides)`
 * to put the vertices on the sphere (that keeps `RING + BALL` the exact
 * footprint). The faint seams between bands read as panelled steel.
 */
const SHELL: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [-Math.sqrt(3) / 2, 0.5],
  [-0.5, Math.sqrt(3) / 2],
  [0, 1],
  [0.5, Math.sqrt(3) / 2],
  [Math.sqrt(3) / 2, 0.5],
  [1, 0],
];

const FLAT = Math.cos(Math.PI / BALL_SIDES);

// ---------------------------------------------------------------------------
// Tubes, bipods, base
// ---------------------------------------------------------------------------

const TUBE_R = 2.2; // half-width across the flats; 4.8 across the corners
const TUBE_SIDES = 8;

/** Where a bipod leg meets its sphere, as a fraction of the ball's radius. */
const LEG_TOP = { out: 0.35, down: 0.45, front: 0.1 };
const LEG_FOOT_X = 8;
const LEG_FOOT_Z = 32;
const LEG_BOTTOM_R = 3;
const LEG_TOP_R = 2.1;

const PLINTH_R = 36;
const PLINTH_H = 2.6;
const STEP_R = 30;
const STEP_H = 1.4;
const PAD = 5.4;
const PAD_H = 1.3;

export const atomium: Monument = {
  id: 'atomium',
  name: 'Atomium',
  iso: 'BEL',
  lat: 50.895,
  lon: 4.341,
  realHeight: 102,
  tier: 'landmark',
  /** `RING + BALL` = 38.41, and every other part is built to stay inside it. */
  footprint: 39,

  build(ctx) {
    const { THREE, palette, box, column, taper, around } = ctx;

    /**
     * Steel is mirror-bright and nothing here reflects, so: `bone` for the nine
     * spheres (`white` and `cream` come back ivory; `slate` welds the balls into
     * one lump at 200 px). The contract's warning against `bone` is about a wall
     * seen through a gap; every face here is the outside of a convex solid. The
     * twenty tubes are `slate`, so balls and sticks separate by value.
     */
    const metal = palette.bone;
    /** The rods: cooler and a step down in value, so twenty of them stay countable. */
    const rod = palette.slate;
    /** Painted structural steel: darker again, so the legs recede and the crystal floats. */
    const structure = palette.steel;
    /** Warm stone for the terrace, per the contract's note on anything at ground level. */
    const ground = palette.tan;

    const group = new THREE.Group();
    const UP = new THREE.Vector3(0, 1, 0);

    /** A corner or centre of the cube, from its azimuth, height and radius. */
    const at = (azimuth: number, y: number, radius: number): Vector3 =>
      new THREE.Vector3(radius * Math.sin(azimuth), y, radius * Math.cos(azimuth));

    // --- the nine spheres ---
    const ball = (centre: Vector3): Group => {
      const shell = new THREE.Group();
      for (let i = 0; i + 1 < SHELL.length; i++) {
        const [y0, r0] = SHELL[i]!;
        const [y1, r1] = SHELL[i + 1]!;
        const band = taper(
          r0 * FLAT * BALL,
          r1 * FLAT * BALL,
          (y1 - y0) * BALL,
          metal,
          BALL_SIDES,
        );
        band.position.y = y0 * BALL;
        shell.add(band);
      }
      shell.position.copy(centre);
      return shell;
    };

    const bottom = at(0, BOTTOM_Y, 0);
    const core = at(0, BOTTOM_Y + DIAGONAL / 2, 0);
    const top = at(0, BOTTOM_Y + DIAGONAL, 0);
    const lower = [0, 1, 2].map((k) => at(PHASE + (k * 2 * Math.PI) / 3, BOTTOM_Y + RISE, RING));
    const upper = [0, 1, 2].map((k) =>
      at(PHASE + Math.PI / 3 + (k * 2 * Math.PI) / 3, BOTTOM_Y + 2 * RISE, RING),
    );

    for (const centre of [bottom, core, top, ...lower, ...upper]) group.add(ball(centre));

    // --- the twenty tubes ---
    // Centre to centre, so no cap shows and the outline draws the joint. Each end
    // stops `PROUD` short of the centre: the lift shaft's caps would otherwise lie
    // in the plane of a ball's equator, where two bands (colours) meet.
    const tube = (from: Vector3, to: Vector3) => {
      const along = to.clone().sub(from).normalize();
      const mesh = column(TUBE_R, from.distanceTo(to) - PROUD * 2, rod, TUBE_SIDES);
      mesh.quaternion.setFromUnitVectors(UP, along);
      mesh.position.copy(from).addScaledVector(along, PROUD);
      group.add(mesh);
    };

    // Twelve edges: bottom to each lower corner, each lower corner to the two
    // upper corners 60 degrees away from it, and each upper corner to the top.
    for (let k = 0; k < 3; k++) {
      tube(bottom, lower[k]!);
      tube(lower[k]!, upper[k]!);
      tube(lower[k]!, upper[(k + 2) % 3]!);
      tube(upper[k]!, top);
    }
    // Eight diagonals: the centre sphere to all eight corners. The first two are
    // the vertical lift shaft, kept as two tubes because the cell has eight.
    for (const corner of [bottom, top, ...lower, ...upper]) tube(core, corner);

    // --- three bipods ---
    // Each pair rises from the terrace into a lower sphere, below and outboard of
    // its centre.
    const bipods = around(3, () => {
      const bipod = new THREE.Group();
      const socket = lower[0]!;
      for (const side of [-1, 1]) {
        const head = new THREE.Vector3(
          side * LEG_TOP.out * BALL,
          socket.y - LEG_TOP.down * BALL,
          RING + LEG_TOP.front * BALL,
        );
        const foot = new THREE.Vector3(side * LEG_FOOT_X, PLINTH_H + PAD_H, LEG_FOOT_Z);
        const leg = taper(LEG_BOTTOM_R, LEG_TOP_R, head.distanceTo(foot), structure, 8);
        leg.quaternion.setFromUnitVectors(UP, head.clone().sub(foot).normalize());
        leg.position.copy(foot);
        bipod.add(leg);

        const pad = box(PAD, PAD_H, PAD, structure);
        pad.position.set(side * LEG_FOOT_X, PLINTH_H, LEG_FOOT_Z);
        bipod.add(pad);
      }
      return bipod;
    });
    // `around` starts at +Z; the bipods belong under the lower triangle.
    bipods.rotation.y = PHASE;
    group.add(bipods);

    // --- the terrace it stands on ---
    const plinth = column(PLINTH_R, PLINTH_H, ground, 12);
    group.add(plinth);

    const step = column(STEP_R, STEP_H, ground, 12);
    step.position.y = PLINTH_H;
    group.add(step);

    // The entrance pavilion, directly under the void where the bottom sphere
    // hangs — the piece that makes forty units of empty air read as deliberate.
    const pavilion = column(8.5, 5.5, structure, 12);
    pavilion.position.y = PLINTH_H + STEP_H;
    group.add(pavilion);

    return group;
  },
};
