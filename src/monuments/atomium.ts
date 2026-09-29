import { PROUD } from './contract.ts';
import type { Group, Monument, Vector3 } from './contract.ts';

/**
 * Atomium.
 *
 * A unit cell of an iron crystal magnified 165 billion times: nine spheres at
 * the corners and the centre of a cube, joined by twenty tubes. Everything in
 * this file is that sentence turned into arithmetic — there is no styling
 * decision to make, only a rotation to get right.
 *
 * **The cube stands on a corner.** Its body diagonal is vertical, and that is
 * the entire silhouette: one sphere at the very top, one at the very bottom, and
 * six in between on two staggered triangles. Miss it and you get a box of balls
 * instead of the diamond everybody recognises.
 *
 * The rotation is not eyeballed. Take the cube with edge vectors on the axes and
 * corners at `a * (i, j, k)`, `i, j, k` in `{0, 1}`; the vertical is
 * `u = (1,1,1)/sqrt(3)`, so a corner's height is `a * (i+j+k) / sqrt(3)` and its
 * distance from the axis is `|p - (p.u)u|`. That gives four levels — one corner,
 * three, three, one — with
 *
 *     rise between levels   a / sqrt(3)        = 0.5774 a
 *     total (body diagonal) a * sqrt(3)        = 1.7321 a
 *     ring radius (both middle levels)         a * sqrt(2/3) = 0.8165 a
 *
 * and the two middle triangles 60 degrees out of phase with each other, because
 * the horizontal part of the corner `(a,0,0)` is proportional to `(2,-1,-1)` and
 * that of `(0,a,a)` to `(-2,1,1)` — exactly antipodal. So the six middle spheres
 * sit on a hexagon of azimuths, which is also why the model's bounding box comes
 * out centred on the Y axis with nothing to correct.
 *
 * Checks that fall out of the same arithmetic, and that the file asserts by
 * construction rather than by trust: every one of the twelve edge tubes is `a`
 * long, and every one of the eight centre-to-corner tubes is
 * `a * sqrt(3) / 2 = 0.866 a`. **The diagonals are the shorter of the two
 * lengths, not the longer.** Half a body diagonal is always less than an edge;
 * a description that says otherwise is remembering a photograph, not measuring
 * a cube.
 *
 * Proportions are the real ones, undistorted. At 102 m the Atomium is 18 m
 * across the spheres and 29 m between their centres, so the whole model is those
 * three numbers times `120 / 102`. Nothing is cropped and nothing is stretched:
 * the half-diagonal against the height is 38.4 / 119.9 = 0.32 where 2.00 is
 * allowed, which is what a tall thing on a circular plan looks like.
 *
 * The only liberty in the geometry is the thickness of the tubes — the one taken
 * with colour is argued for where the colours are chosen, in `build`. At true
 * scale a 3 m tube inside a 102 m monument
 * is 3.5 units across, and at thumbnail size the outline's own ink is nearly as
 * wide as the tube it is drawing, so the lattice greys out. They are 35% fatter
 * here, which still leaves the spheres 4.5 times the diameter of the sticks —
 * the point of the brief, that this reads as balls joined by rods and not as a
 * wireframe, survives with room to spare.
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
 * Centre of the lowest sphere. Everything above is measured from here, and what
 * is left below — just under 40 units, 33.8 m in life — is the gap the whole
 * monument is famous for. The bottom sphere hangs a third of the way up; the
 * bipods reach past it to the spheres above.
 */
const BOTTOM_Y = TOP - BALL - DIAGONAL; // 50.22

/**
 * Azimuth of the lower triangle of corners, in radians.
 *
 * Three-fold symmetry cannot put all six middle spheres off the centre line of a
 * front view, so the choice is only which triangle points at the camera — and
 * the two are not equally good. Rendered both: with the lower triangle forward
 * its nearest sphere lands dead on the axis, a third bigger for being closer,
 * and **eclipses the bottom sphere completely**. The diamond loses the point it
 * hangs from, which is the one feature nothing else in this model supplies. Turn
 * it 60 degrees and the sphere that comes forward is an upper one, high enough
 * to clear it, and the near bipod goes round the back where its own sphere hides
 * it. 60 degrees, then.
 */
const PHASE = Math.PI / 3;

// ---------------------------------------------------------------------------
// Faceted balls
// ---------------------------------------------------------------------------

const BALL_SIDES = 10;

/**
 * The ball has no helper of its own, so it is a stack of six frusta: latitude
 * rings of the unit sphere at 30-degree steps, cones at the poles and four
 * bands between. `taper` takes half-widths across the flats, so each ring is
 * multiplied by `cos(pi / sides)` to put the vertices *on* the sphere rather
 * than outside it — which is what keeps `RING + BALL` the exact footprint.
 *
 * Where two bands meet they share a radius, so each one's hidden cap sits
 * exactly inside the other and only one of the pair is ever front-facing.
 * `OutlineEffect` inks each band separately, and the five faint seams that
 * leaves per ball are welcome: the real spheres are panelled steel.
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
     * Polished stainless steel, mirror-bright, and nothing in this world is
     * reflective — so the question is what a mirror ball against a cyan sky
     * turns into on a four-step ramp. Four candidates, all four rendered at
     * thumbnail size before choosing:
     *
     * - `white` and `cream` are the contract's blessed pale entries and both
     *   come back ivory. A porcelain Atomium; steel is not warm.
     * - `slate` is the obedient answer — the one cool neutral with hue left to
     *   lose in shade, and literally what a mirror ball is, a picture of the sky.
     *   But it is 40% darker than `bone`, and at 200 pixels that darkness welds
     *   the nine balls into one lump. The silhouette survives; the *lattice*,
     *   which is the whole subject, does not.
     * - `bone` keeps every ball separate and is the only neutral grey here.
     *
     * The contract warns off `bone` and the warning is worth taking seriously,
     * but read what it is warning about: a wall glimpsed *through* a colonnade,
     * darker than the sky in the gaps, reading as a hole where a surface should
     * be. There is no such surface here. Every face in this model is the outside
     * of a convex solid, bounded by its own ink and by lit faces of the same
     * ball; nothing sits behind a gap pretending to be solid. A dark hueless
     * patch in the foreground, ringed in ink against bright cyan, reads as the
     * shaded half of a sphere, which is what it is.
     *
     * So: `bone` for the nine spheres. The twenty tubes take `slate` instead,
     * and that is the same argument running the other way — they are the thin
     * members, they live in the spheres' shadow and edge-on against sky, and
     * they are exactly what the warning is about. It also buys the thing the
     * brief asks for outright: balls and sticks separated by value, countable
     * rather than smeared. Bright at the top of the ladder, cool in the middle,
     * dark at the feet.
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
    // Run centre to centre: both ends finish deep inside their sphere, so no cap
    // is ever visible and the joint is drawn by the outline where the cylinder
    // crosses the ball. Each end stops `PROUD` short of the centre: the lift
    // shaft's caps otherwise lay in the plane of a ball's equator, where two of
    // its bands meet, and the two colours shared it.
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
    // Each pair rises from the terrace to one of the lower spheres, entering it
    // below and outboard of its centre so the leg reads as continuing inside.
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
