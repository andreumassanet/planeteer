import type { Group, Mesh, Monument } from './contract.ts';

/**
 * Great Zimbabwe — the Great Enclosure.
 *
 * The largest ancient structure south of the Sahara, and the read is two
 * shapes: **a curved dry-stone wall closing on itself**, and **the conical
 * tower** standing inside it. Everything else is what makes those two read
 * as granite laid by hand rather than as a ring and a cone.
 *
 * ## What is here
 *
 * - **The outer wall**, an ellipse of thirty segments laid in three courses,
 *   each set back from the one under it, so the wall is battered — thick at
 *   the foot and thin at the top, as the real one is (5 m at the base, about
 *   1.3 m at the top) — and every ledge between courses is a line for the pen.
 *   It is low on the north and rises to its full height round the south-east,
 *   which is where the real wall is highest.
 * - **The chevron frieze** along the top of that highest stretch: the zig-zag
 *   band of set stones that is the site's one decoration, here a row of proud
 *   struts a tone lighter than the wall.
 * - **Three entrances** on the northern half, each a gap whose two ends are
 *   rounded off — the real wall never ends in a corner — and wide enough for
 *   a person of this world to walk through, which the real ones (about a metre)
 *   would not be.
 * - **The parallel passage**: an inner wall following the outer one round the
 *   east side, from beside the north entrance to the tower, with a corridor
 *   between them.
 * - **The conical tower** at the passage's end, solid, in four courses
 *   narrowing to its flat top, and the small tower beside it.
 * - Inside: the low curved wall of an inner enclosure on the west side, the
 *   daga floors of three houses, and trees, because the enclosure is grassed
 *   and the trees are what give the wall something to be taller than.
 *
 * ## Sizes, in numbers
 *
 * `placement.ts` turns +Z north and +X west. The plan is an ellipse 89 by 64 m
 * in life, the long axis laid east-west here, at 0.81 units a metre: the wall's
 * midline is 72 by 52 units. **The vertical is stretched 2.3x**, because the
 * wall is 11 m at its highest and the enclosure 89 m long — at true height it
 * is a kerb on the contact sheet, and the `MAX_ASPECT` cap wants the model at
 * least half as tall as its plan is wide in any case: 21 units of wall against
 * a 39.9-unit radius, 1.9 where 2 is allowed. The wall's thickness is
 * stretched 1.25x, not 2.3x, so the battered courses still read as a wall
 * and not as a ramp. The tower is 10 m tall and 5.5 m across at its foot:
 * 19 units tall (the same 2.3x) and 7.2 across (1.55x, so it is still a cone
 * rather than a post). The tower stands a little under the wall behind it,
 * as the real one does.
 *
 * **Colour.** `tan` for the granite, a warm grey that keeps its hue in shade
 * where `bone` would go cold; its courses toned 0.92, 1 and 1.06 from the foot
 * up, so the coursing reads before the ink does. The chevrons at 1.22. The
 * grass a tone of `green`, the house floors `brown`, the trees `green` and
 * `darkOlive` on `bark`.
 *
 * **Budget.** Built as ordinary pieces and drawn by `ctx.merge` as one mesh per
 * colour, like Giza.
 */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Semi-axes of the outer wall's midline at its foot, x (east-west) and z (north-south). */
const A = 36;
const B = 26;
/** Thirty segments of 12 degrees of the ellipse's parameter. */
const SEGMENTS = 30;
/**
 * The three courses: thickness, and share of the wall's height. Each course's
 * outer face steps back by 0.8 of what it loses and its inner face by 0.2, so
 * the batter is mostly outside, as on the real wall.
 */
const COURSES = [
  { thick: 5.0, share: 0.42, tone: 0.92 },
  { thick: 3.8, share: 0.33, tone: 1.0 },
  { thick: 2.6, share: 0.25, tone: 1.06 },
];
const FOOT = COURSES[0]!.thick;
/** Where a course's midline stands, outward of the foot's midline. */
const courseOffset = (thick: number): number => FOOT / 2 - 0.8 * (FOOT - thick) - thick / 2;

/** The wall's height: 11 on the north, 21 at the south-east (parameter 225 degrees). */
const LOW = 11;
const HIGH = 21;
const heightAt = (phi: number): number => LOW + (HIGH - LOW) * ((1 + Math.cos(phi - 225 * DEG)) / 2) ** 2;

/** Segments left out for the entrances: north (90 degrees), north-west (42) and north-east (138). */
const GAPS = new Set([3, 7, 11]);
/** Segments that carry the chevron frieze: centres 198 to 258 degrees, the high south-east stretch. */
const FRIEZE = new Set([16, 17, 18, 19, 20, 21]);

/** The parallel passage: corridor width, and the inner wall's thickness, height and run. */
const PASSAGE = 3.0;
const INNER_THICK = 2.4;
const INNER_HIGH = 12.5;
const INNER_FROM = 100 * DEG;
const INNER_TO = 202 * DEG;
const INNER_SEGMENTS = 9;
const INNER_OFFSET = -(FOOT / 2 + PASSAGE + INNER_THICK / 2);

/** The conical tower, and the small one beside it, inside the south-east wall. */
const TOWER = { phi: 214 * DEG, inset: 9.5, foot: 3.6, top: 2.2, height: 19, courses: 4 };
const SMALL_TOWER = { phi: 233 * DEG, inset: 8.5, foot: 1.9, top: 1.2, height: 7.5, courses: 2 };

/** The grass the whole site stands on, this far past the wall's midline. */
const GROUND_MARGIN = 3.5;
const GROUND = 0.5;

export const greatZimbabwe: Monument = {
  id: 'great-zimbabwe',
  name: 'Great Zimbabwe',
  iso: 'ZWE',
  lat: -20.2675,
  lon: 30.9339,
  realHeight: 11,
  tier: 'building',
  footprint: 40,

  build(ctx) {
    const { THREE, palette, tone, box, column, taper, strut } = ctx;
    const granite = palette.tan;
    const chevron = tone(granite, 1.22);
    const grass = tone(palette.green, 0.92);
    const daga = palette.brown;
    const leaves = [palette.green, palette.darkOlive];
    const trunk = palette.bark;

    const draft = new THREE.Group();
    const placed = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      draft.add(mesh);
      return mesh;
    };

    /** A point on the ellipse `offset` outward of the foot's midline, by the parameter. */
    const along = (phi: number, offset: number): [number, number] => {
      const nx = B * Math.cos(phi);
      const nz = A * Math.sin(phi);
      const n = Math.hypot(nx, nz);
      return [A * Math.cos(phi) + (offset * nx) / n, B * Math.sin(phi) + (offset * nz) / n];
    };

    /**
     * A run of wall between two parameters: a group on the chord, yawed along
     * it, local +X along the wall and local -Z outward, with one box a course.
     * The boxes run past the chord's ends by enough to close the outer corner
     * at the joint with the next segment.
     */
    const run = (
      phi0: number,
      phi1: number,
      height: number,
      courses: { thick: number; share: number; tone: number }[],
      offsetOf: (thick: number) => number,
      base: number,
    ): { frame: Group; length: number; outer: number; top: number } => {
      const [x0, z0] = along(phi0, base);
      const [x1, z1] = along(phi1, base);
      const length = Math.hypot(x1 - x0, z1 - z0);
      const frame = new THREE.Group();
      frame.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      frame.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
      let y = 0;
      let outer = 0;
      let top = 0;
      for (const course of courses) {
        const h = height * course.share;
        const block = box(length + course.thick * 0.16 + 0.1, h, course.thick, tone(granite, course.tone));
        const offset = offsetOf(course.thick);
        block.position.set(0, y, -offset);
        frame.add(block);
        outer = offset + course.thick / 2;
        top = y;
        y += h;
      }
      draft.add(frame);
      return { frame, length, outer, top };
    };

    // --- the grass ---
    {
      const ground = new THREE.Group();
      ground.add(column(1, GROUND, grass, 16));
      ground.scale.set(A + GROUND_MARGIN, 1, B + GROUND_MARGIN);
      draft.add(ground);
    }

    // --- the outer wall ---
    const step = TAU / SEGMENTS;
    for (let k = 0; k < SEGMENTS; k++) {
      if (GAPS.has(k)) continue;
      const phi0 = k * step;
      const phi1 = phi0 + step;
      const height = heightAt(phi0 + step / 2);
      const wall = run(phi0, phi1, height, COURSES, courseOffset, 0);

      if (FRIEZE.has(k)) {
        // The zig-zag on the top course's outer face, its back sunk 0.12 into
        // the stone so it neither floats nor shares the face's plane.
        const thick = 0.5;
        const z = -(wall.outer + thick / 2 - 0.12);
        const low = height - 3.2;
        const high = height - 1.1;
        const span = wall.length - 0.8;
        const points = 5;
        for (let i = 0; i + 1 < points; i++) {
          const u0 = -span / 2 + (span * i) / (points - 1);
          const u1 = -span / 2 + (span * (i + 1)) / (points - 1);
          const from = new THREE.Vector3(u0, i % 2 === 0 ? low : high, z);
          const to = new THREE.Vector3(u1, i % 2 === 0 ? high : low, z);
          wall.frame.add(strut(from, to, thick, chevron));
        }
      }
    }

    // --- the rounded ends at every entrance ---
    for (const k of GAPS) {
      for (const [phi, beside] of [[k * step, (k - 0.5) * step], [(k + 1) * step, (k + 1.5) * step]] as const) {
        const [x, z] = along(phi, courseOffset(COURSES[1]!.thick));
        // The top course's tone: its cap is level with that course's top.
        placed(taper(FOOT / 2, COURSES[2]!.thick / 2, heightAt(beside), tone(granite, COURSES[2]!.tone), 8), x, 0, z);
      }
    }

    // --- the parallel passage's inner wall ---
    {
      const inner = [
        { thick: INNER_THICK, share: 0.58, tone: 0.96 },
        { thick: INNER_THICK - 0.7, share: 0.42, tone: 1.03 },
      ];
      const innerOffset = (thick: number): number => INNER_OFFSET - (INNER_THICK - thick) * 0.3;
      const innerStep = (INNER_TO - INNER_FROM) / INNER_SEGMENTS;
      for (let k = 0; k < INNER_SEGMENTS; k++) {
        const phi0 = INNER_FROM + k * innerStep;
        // It rises towards the tower, as the outer wall does.
        const height = INNER_HIGH - 3 * (1 - k / (INNER_SEGMENTS - 1));
        run(phi0, phi0 + innerStep, height, inner, innerOffset, 0);
      }
      // Its open end beside the north entrance is rounded like the others.
      const [x, z] = along(INNER_FROM, INNER_OFFSET);
      placed(taper(INNER_THICK / 2, (INNER_THICK - 0.7) / 2, INNER_HIGH - 3, tone(granite, 1.03), 8), x, 0, z);
    }

    // --- the conical towers ---
    for (const t of [TOWER, SMALL_TOWER]) {
      const [x, z] = along(t.phi, -t.inset);
      const radiusAt = (y: number): number => t.foot + (t.top - t.foot) * (y / t.height);
      for (let i = 0; i < t.courses; i++) {
        const y0 = (t.height * i) / t.courses;
        const y1 = (t.height * (i + 1)) / t.courses;
        const last = i + 1 === t.courses;
        // A ledge of 0.12 at every course but the top, which ends flat.
        const course = taper(radiusAt(y0), radiusAt(y1) + (last ? 0 : 0.12), y1 - y0, tone(granite, i % 2 === 0 ? 1.0 : 1.08), 10);
        placed(course, x, y0, z);
      }
    }

    // --- inside: an inner enclosure's low wall on the west side ---
    {
      const low = [{ thick: 2.0, share: 1, tone: 0.96 }];
      const from = -36 * DEG;
      const to = 36 * DEG;
      const n = 6;
      for (let k = 0; k < n; k++) {
        const phi0 = from + ((to - from) * k) / n;
        run(phi0, phi0 + (to - from) / n, 4.2, low, () => 0, -13);
      }
    }

    // --- the daga floors of three houses ---
    for (const [x, z, r] of [[-6, 10, 3.0], [4, 13, 2.6], [12, -9, 3.2]] as const) {
      placed(column(r, 1.0, daga, 8), x, 0, z);
    }

    // --- trees, inside: the grass outside is too narrow a ring to hold one ---
    const trees: [number, number, number][] = [
      [-2, -4, 1.0], [9, 3, 0.85], [-14, -13, 0.9], [-21, 7, 1.0], [2, -18, 0.8],
    ];
    trees.forEach(([x, z, s], i) => {
      placed(column(0.45 * s, 3.4 * s, trunk, 5), x, 0, z);
      const leaf = leaves[i % 2]!;
      placed(taper(0.6 * s, 3.0 * s, 1.8 * s, leaf, 6), x, 3.0 * s, z);
      placed(taper(3.0 * s, 0.7 * s, 2.6 * s, tone(leaf, 1.08), 6), x, 4.8 * s, z);
    });

    return ctx.merge(draft);
  },
};
