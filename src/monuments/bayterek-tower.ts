import type { Group, Monument, Vector3 } from './contract.ts';

/**
 * Bayterek Tower — Astana.
 *
 * Built when the capital of Kazakhstan moved from Almaty to Astana, and drawn
 * after a legend: the tree of life, a tall poplar (*bayterek*), in whose crown
 * the bird Samruk lays a golden egg. The whole silhouette is that sentence — a
 * white trunk that narrows, a crown that opens like a basket, and a golden ball
 * held in it. Nothing else on the planet has that outline, so nothing here
 * spends geometry on anything but those three masses.
 *
 * ## Scale
 *
 * 105 m to the top of the sphere, on the `tower` tier's 70 units: 0.667 units a
 * metre. The sphere is 22 m across in life, so 14.7 units; it is drawn 15.9
 * (radius 7.95), **8% large**, because at thumbnail size the ball is the thing
 * the eye names and the white basket round it eats into its edge. Its centre
 * is at 62, which puts its top at 69.95, a hair under the tier.
 *
 * Aspect is nothing to worry about: the widest part is the terrace at 14.3
 * units from the axis, 0.20 of the height on the half-diagonal test.
 *
 * ## The lattice
 *
 * Eight white ribs, not the real tower's many thinner members: every rib is a
 * chain of `strut`s and every joint is an ink line, so a bundle of sixteen at
 * this size would grey out into one pale column. Eight stay countable from the
 * front, which is what makes it read as a lattice rather than a pole.
 *
 * - **The trunk** is five struts a rib, flaring at the foot and narrowest about
 *   half way up, bound by three rings that give the white some ink to hold on
 *   to.
 * - **The crown** forks every rib into a V at 48 units and joins each branch to
 *   its neighbour's, twice over, so the basket is a row of diamonds closing in
 *   pointed tips round the sphere's upper half — the shape every photograph of
 *   it has. The tips stand 0.7 units off the glass, so the struts read as
 *   holding the ball rather than piercing it.
 * - **The core** is the lift shaft inside the lattice, a step darker than the
 *   ribs so the gaps between them read as depth and not as sky.
 *
 * Everything is built as pieces and handed back through `ctx.merge`: about a
 * hundred struts would be a hundred meshes against the tier's 80.
 */

const TOP = 69.95;
/** Sphere: centre and radius. See the scale note for the 8%. */
const BALL_R = 7.95;
const BALL_Y = TOP - BALL_R; // 62.0
const BALL_SIDES = 12;

/** Latitude rings of a unit sphere at 30-degree steps: [y, radius]. */
const SHELL: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [-Math.sqrt(3) / 2, 0.5],
  [-0.5, Math.sqrt(3) / 2],
  [0, 1],
  [0.5, Math.sqrt(3) / 2],
  [Math.sqrt(3) / 2, 0.5],
  [1, 0],
];
/** `taper` takes half-widths across the flats; this puts the vertices on the sphere. */
const FLAT = Math.cos(Math.PI / BALL_SIDES);

const RIBS = 8;
const STEP = (Math.PI * 2) / RIBS;

/** The terrace: two round steps. */
const TERRACE_R = 14;
const TERRACE_H = 0.9;
const STEP_R = 10.5;
const STEP_H = 0.7;
const FLOOR = TERRACE_H + STEP_H; // 1.6, where the ribs spring

/**
 * The trunk, one rib's path: [height, distance from the axis]. Wide at the
 * foot, narrowest at 30 to 40, opening again into the fork at 48. The two
 * middle entries differ by 0.2 on purpose: a strut that is exactly vertical
 * gets an arbitrary roll (see `strut` in `contract.ts`).
 */
const TRUNK: ReadonlyArray<readonly [number, number]> = [
  [FLOOR, 6.4],
  [10, 5.0],
  [20, 4.0],
  [30, 3.4],
  [40, 3.6],
  [48, 4.4],
];

/**
 * The crown's three rows of nodes. `half` says whether a row sits on the ribs'
 * own bearings or half way between them: the V of each fork lands between two
 * ribs, which is what makes the rows join into diamonds.
 */
const CROWN = [
  { y: 55, r: 7.2, half: true },
  { y: 61, r: 8.6, half: false },
  { y: 66, r: 7.6, half: true },
];

/** The rings that bind the trunk: heights. Each straddles the ribs at that height. */
const BANDS = [19.4, 29.4, 39.4];
const BAND_H = 1.2;

const RIB = 1.2;
const BRANCH = 0.9;
const CORE_R = 2.0;

/** A rib's distance from the axis at height `y`, read off `TRUNK`. */
function trunkAt(y: number): number {
  for (let i = 0; i + 1 < TRUNK.length; i++) {
    const [y0, r0] = TRUNK[i]!;
    const [y1, r1] = TRUNK[i + 1]!;
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return TRUNK[TRUNK.length - 1]![1];
}

export const bayterekTower: Monument = {
  id: 'bayterek-tower',
  name: 'Bayterek Tower',
  iso: 'KAZ',
  lat: 51.1283,
  lon: 71.4305,
  realHeight: 105,
  tier: 'tower',
  /** The terrace's corners reach 14.27 (`TERRACE_R` across the flats, 16 sides). */
  footprint: 14.5,

  build(ctx) {
    const { THREE, palette, tone, column, taper, strut, ringWall } = ctx;
    const white = palette.white; // the warm white; `bone` goes hueless in shade
    const ring = tone(palette.white, 0.88);
    const core = tone(palette.white, 0.78);
    const glass = palette.gold;
    const stone = palette.tan;

    const draft = new THREE.Group();

    /** A point on bearing `angle` (0 is +Z, the front), at height `y` and radius `r`. */
    const at = (angle: number, y: number, r: number): Vector3 =>
      new THREE.Vector3(r * Math.sin(angle), y, r * Math.cos(angle));

    // --- the terrace ---
    draft.add(column(TERRACE_R, TERRACE_H, stone, 16));
    const step = column(STEP_R, STEP_H, tone(stone, 1.1), 16);
    step.position.y = TERRACE_H;
    draft.add(step);

    // --- the core: the lift shaft, up into the bottom of the sphere ---
    const shaft = column(CORE_R, BALL_Y - BALL_R + 1.2 - FLOOR, core, 8);
    shaft.position.y = FLOOR;
    draft.add(shaft);

    // --- the trunk: eight ribs ---
    for (let k = 0; k < RIBS; k++) {
      const angle = k * STEP;
      for (let i = 0; i + 1 < TRUNK.length; i++) {
        const [y0, r0] = TRUNK[i]!;
        const [y1, r1] = TRUNK[i + 1]!;
        draft.add(strut(at(angle, y0, r0), at(angle, y1, r1), RIB, white));
      }
    }

    // --- the rings that bind it ---
    // `ringWall` is a lathe, whose vertices start on +Z, so with eight sides
    // its corners sit on the ribs' bearings and each rib passes through one.
    for (const y of BANDS) {
      const r = trunkAt(y + BAND_H / 2);
      const band = ringWall(r - 0.9, r + 0.9, BAND_H, ring, RIBS);
      band.position.y = y;
      draft.add(band);
    }

    // --- the crown: forks into diamonds, closing in tips round the ball ---
    // The rows alternate between the ribs' bearings and the half-way ones, so
    // each node reaches up to the two nodes either side of its own bearing.
    const [forkY, forkR] = TRUNK[TRUNK.length - 1]!;
    let below: Vector3[] = [];
    for (let k = 0; k < RIBS; k++) below.push(at(k * STEP, forkY, forkR));
    for (const row of CROWN) {
      const nodes: Vector3[] = [];
      for (let k = 0; k < RIBS; k++) nodes.push(at((k + (row.half ? 0.5 : 0)) * STEP, row.y, row.r));
      for (let k = 0; k < RIBS; k++) {
        // A node on a rib's bearing reaches the two half-way nodes either side
        // of it; a half-way node reaches the two ribs either side of it.
        const left = row.half ? (k + RIBS - 1) % RIBS : k;
        const right = row.half ? k : (k + 1) % RIBS;
        const from = below[k]!;
        draft.add(strut(from, nodes[left]!, BRANCH, white));
        draft.add(strut(from, nodes[right]!, BRANCH, white));
      }
      below = nodes;
    }

    // --- the golden sphere ---
    const ball: Group = new THREE.Group();
    for (let i = 0; i + 1 < SHELL.length; i++) {
      const [y0, r0] = SHELL[i]!;
      const [y1, r1] = SHELL[i + 1]!;
      const band = taper(r0 * FLAT * BALL_R, r1 * FLAT * BALL_R, (y1 - y0) * BALL_R, glass, BALL_SIDES);
      band.position.y = y0 * BALL_R;
      ball.add(band);
    }
    ball.position.y = BALL_Y;
    draft.add(ball);

    return ctx.merge(draft);
  },
};
