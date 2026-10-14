import type { Group, Mesh, Object3D, Monument, MonumentContext } from './contract.ts';

/**
 * Nan Madol, Temwen, Pohnpei, Micronesia.
 *
 * Ninety-two artificial islets built on a reef, the only megalithic city in the
 * Pacific. The walls are prismatic basalt columns stacked like logs: a course
 * laid along the wall (stretchers), then one laid across it (headers, their
 * hexagonal ends showing on the face), then along again. That alternation is
 * the recognition.
 *
 * The plan is at honest scale (0.229 units per metre; Nandauwas' outer enclosure
 * is about 75 m across and the model's 17.2 units), but the real 7.6 m wall
 * would be 1.74 units, a kerb, so the wall is 10.15 units and the vertical is
 * exaggerated 5.8x against the plan. Seven courses of 1.45 units each stand for
 * about eight real ones; fewer than seven reads as striped, not stacked. The
 * complex is cropped from ninety-two islets to three, and 1.5 km to 188 m. Half-
 * diagonal 24.8 on 17.9 of height (1.39); the tier's 40 units of height are
 * left on the table on purpose.
 *
 * Every wall steps down toward the camera. A rim of height h hides 4.2h behind
 * it from the quarter view (13.4 degrees) and 8.4h from the front (6.8), so a
 * complete enclosure would close its court. The enclosure is a ruin tallest at
 * the back: each course reaches less far forward than the one under it (12.0,
 * 12.0, 10.2, 8.4, 6.6, 4.8, 3.0 in z), leaving a stair of seven ledges, and
 * the front wall survives two courses high, so the back half of the court is
 * visible. The two back corners rise in three short steps to 17.9.
 *
 * Water is kept only where the model's own walls contain it: each canal is a
 * slot 6 wide and 19 long closed on all four sides by basalt this model builds,
 * 2.3 below the islet tops so it never reaches the silhouette (`skyBlue`, as at
 * other contained pools). The canals run in z so the front camera looks along
 * them, and each causeway across a mouth is low (top 2.9, 1.0 above the water)
 * so 13.5 of the canal's 19 units are open from the front. The model owns no
 * ground at all: dark basalt standing straight out of the pale sand is the
 * maximum contrast.
 *
 * Colour: `slate` for the stretcher courses (light enough that the shaded flank
 * holds together) and `bark` for the header courses (warm and dark), with a
 * 0.14 depth step so flush courses do not render as one blank slab; `tan` for
 * the coral rubble fill; `darkOlive` and `green` for the mangrove.
 */

// --- Elevation. Every number below is measured off this ladder. ---
/** Top of the coarse lower course of every retaining wall: the waterline. */
const REEF_TOP = 2.0;
/** The canal surface, 2.3 below the islet tops so it never reaches a silhouette. */
const WATER_TOP = 1.9;
/** Top of the causeway across each canal mouth: 1.0 of freeboard. */
const QUAY_TOP = 2.9;
/** Top of every islet, and the base of the enclosure. */
const PLATFORM_TOP = 4.2;
/** The coral rubble floor inside the enclosure. */
const COURT_TOP = 4.5;

// --- Plan. x across, z toward the viewer. ---
/** Half-width of the central islet, which is also the canal's inner wall. */
const ISLET_X = 9.0;
/** Outer wall of each canal. */
const CANAL_X = 15.0;
/** Outer edge of each side islet. The 24.8 corner is what sets the footprint. */
const OUTER_X = 21.5;
/** Half-depth of every islet. */
const PLAN_Z = 12.4;
/** How far the open water reaches, fore and aft; beyond it the islets close. */
const CANAL_Z = 9.5;

/** Wall thickness, and the height of one course of stone. */
const WALL_T = 2.3;
const COURSE_H = 1.45;
/** Back face of the enclosure. */
const WALL_BACK = -12.0;
/** Half-width of the sea gate in the front wall. */
const GATE_HALF = 2.2;

/**
 * The seven courses of the enclosure, bottom to top. `front` is how far forward
 * the course reaches (the stair that lets the camera see every one). `half`
 * batters inward 0.12 a course while the header courses are set 0.26 outside
 * that line, so each header stands 0.14 proud of the stretcher under it and the
 * outer face goes in-out-in-out.
 */
const COURSES: { front: number; half: number; header: boolean }[] = [
  { front: 12.0, half: 8.6, header: false },
  { front: 12.0, half: 8.74, header: true },
  { front: 10.2, half: 8.36, header: false },
  { front: 8.4, half: 8.5, header: true },
  { front: 6.6, half: 8.12, header: false },
  { front: 4.8, half: 8.26, header: true },
  { front: 3.0, half: 7.88, header: false },
];

const WALL_TOP = PLATFORM_TOP + COURSES.length * COURSE_H; // 14.35

/**
 * Where the exposed header logs lie along the top of each side wall, in z. Five
 * to a side; each is a six-sided prism laid across the wall with 0.65 of it
 * proud of the outer face. They stop short of z = -8.6 where the corner horns stand.
 */
const HEADER_LOGS = [-7.6, -5.0, -2.4, 0.2, 2.4];

/**
 * Mangrove clumps: x, the surface they stand on, z. The third stands on the top
 * of course 3, where the only exposed ledge is the 1.8 units between courses 3
 * and 4.
 */
const SCRUB: [x: number, y: number, z: number, scale: number][] = [
  [-18.0, PLATFORM_TOP + 0.4, -6.2, 1.0],
  [18.4, PLATFORM_TOP + 0.4, 3.4, 0.85],
  [7.35, PLATFORM_TOP + 4 * COURSE_H, 7.5, 0.7],
  [-12.2, QUAY_TOP, 11.0, 0.75],
];

export const nanMadol: Monument = {
  id: 'nan-madol',
  name: 'Nan Madol',
  iso: 'FSM',
  lat: 6.8419,
  lon: 158.3344,
  // No `realHeight`: the figure people quote is one wall of one islet.
  tier: 'building',
  // 24.8 of it is used, by the outer corner of each side islet. Pohnpei's baked
  // ring is only 57 x 52 units, so anything larger would hang over the reef.
  footprint: 25,

  build(ctx: MonumentContext): Group {
    const { THREE, palette, box, column, taper, ringWall } = ctx;

    const stretcher = palette.slate; // basalt laid along the wall
    const header = palette.bark; // basalt laid across it, and every deep recess
    const rubble = palette.tan; // the coral fill the islets are packed with
    const water = palette.skyBlue; // the canals, and nothing else
    const scrub = palette.darkOlive; // mangrove
    const leaf = palette.green;

    const group = new THREE.Group();

    const put = <T extends Object3D>(child: T, x: number, y: number, z: number): T => {
      child.position.set(x, y, z);
      group.add(child);
      return child;
    };

    /** A block given by its extents rather than its size. */
    const slab = (
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      z0: number,
      z1: number,
      color: number,
    ): Mesh =>
      put(box(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), color), (x0 + x1) / 2, y0, (z0 + z1) / 2);

    /**
     * One basalt column lying flat, running from (x, z) along +Z turned by
     * `yaw`, resting on the surface `y`. A `column` stands on +Y, so the mesh is
     * pitched a quarter turn about X and the pivot carries the yaw; both are
     * rotations only, so the determinant stays positive. After the pitch the
     * prism's flats face up and down, so `y + radius` rests it on the surface.
     */
    const log = (
      x: number,
      y: number,
      z: number,
      yaw: number,
      radius: number,
      length: number,
      color: number,
    ): Object3D => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y + radius, z);
      pivot.rotation.y = yaw;
      const mesh = column(radius, length, color, 6);
      mesh.rotation.x = Math.PI / 2;
      pivot.add(mesh);
      group.add(pivot);
      return pivot;
    };

    // --- 1. The three islets: a retaining wall of basalt with coral rubble inside, in two courses so there is an ink line at the waterline ---
    slab(-ISLET_X, ISLET_X, 0, REEF_TOP, -PLAN_Z, PLAN_Z, header);
    slab(-ISLET_X, ISLET_X, REEF_TOP, PLATFORM_TOP, -PLAN_Z, PLAN_Z, stretcher);

    for (const side of [-1, 1]) {
      slab(side * CANAL_X, side * OUTER_X, 0, REEF_TOP, -PLAN_Z, PLAN_Z, header);
      slab(side * CANAL_X, side * OUTER_X, REEF_TOP, PLATFORM_TOP, -PLAN_Z, PLAN_Z, stretcher);
      // Coral fill, standing 0.4 proud of its own wall head.
      slab(side * (CANAL_X + 0.4), side * (OUTER_X - 0.4), PLATFORM_TOP, PLATFORM_TOP + 0.4, -PLAN_Z + 0.5, PLAN_Z - 0.5, rubble);

      // The head of each canal, where the islets close behind the water.
      slab(side * ISLET_X, side * CANAL_X, 0, REEF_TOP, -PLAN_Z, -CANAL_Z, header);
      slab(side * ISLET_X, side * CANAL_X, REEF_TOP, PLATFORM_TOP, -PLAN_Z, -CANAL_Z, stretcher);

      // The causeway across the mouth, low on purpose.
      slab(side * ISLET_X, side * CANAL_X, 0, 1.8, CANAL_Z, PLAN_Z, header);
      slab(side * ISLET_X, side * CANAL_X, 1.8, QUAY_TOP, CANAL_Z, PLAN_Z, stretcher);

      // The water, run 0.15 into the stone on all four sides so only the surface is seen.
      slab(side * (ISLET_X - 0.15), side * (CANAL_X + 0.15), 0, WATER_TOP, -CANAL_Z - 0.15, CANAL_Z + 0.15, water);

      // The seaward wall, on the back half of each side islet only: forward of
      // z = 2.0 a 2.9-unit wall would hide the near canal from the quarter view.
      slab(side * OUTER_X, side * (OUTER_X - 2.2), PLATFORM_TOP, PLATFORM_TOP + 1.5, -11.6, 2.0, stretcher);
      slab(side * (OUTER_X - 0.1), side * (OUTER_X - 2.4), PLATFORM_TOP + 1.5, PLATFORM_TOP + 2.9, -11.6, -0.5, header);

      // A low wall along each side islet's canal edge, in two courses; the upper stops short of the mouth.
      slab(side * CANAL_X, side * (CANAL_X + 2.3), PLATFORM_TOP, PLATFORM_TOP + 1.5, -11.6, 8.0, stretcher);
      slab(side * (CANAL_X + 0.1), side * (CANAL_X + 2.5), PLATFORM_TOP + 1.5, PLATFORM_TOP + 2.9, -11.6, 5.0, header);
    }

    // The coral floor of the enclosure's court.
    slab(-6.3, 6.3, PLATFORM_TOP, COURT_TOP, -9.7, 9.7, rubble);

    // --- 2. Nandauwas: seven courses, each reaching less far forward than the one
    // below. The side walls own the corners and run the full length; the back and
    // front walls span the width between them, so no two boxes share a face. ---
    COURSES.forEach((course, k) => {
      const y = PLATFORM_TOP + k * COURSE_H;
      const top = y + COURSE_H;
      const color = course.header ? header : stretcher;
      const inner = course.half - WALL_T;

      for (const side of [-1, 1]) {
        slab(side * course.half, side * inner, y, top, WALL_BACK, course.front, color);
      }
      slab(-inner, inner, y, top, WALL_BACK, WALL_BACK + WALL_T, color);

      // The sea gate survives in the two lowest courses only; the rest of the front wall is down.
      if (k < 2) {
        for (const side of [-1, 1]) {
          slab(side * inner, side * GATE_HALF, y, top, course.front - WALL_T, course.front, color);
        }
      }
    });

    // The corner horns, at the back: three short steps, each shorter and narrower than the last.
    for (const side of [-1, 1]) {
      slab(side * 7.88, side * 5.58, WALL_TOP, WALL_TOP + 1.4, WALL_BACK, -8.6, header);
      slab(side * 7.7, side * 5.8, WALL_TOP + 1.4, WALL_TOP + 2.6, WALL_BACK, -9.0, stretcher);
      slab(side * 7.5, side * 6.0, WALL_TOP + 2.6, WALL_TOP + 3.55, WALL_BACK, -9.4, header);
    }

    // --- 3. The header logs: the top course of each side wall is left as bare
    // columns across the wall with their hexagonal ends proud of the canal face ---
    for (const side of [-1, 1]) {
      for (const z of HEADER_LOGS) {
        log(side * 5.18, WALL_TOP, z, (side * Math.PI) / 2, 0.58, 3.35, header);
      }
    }

    // --- 4. Inside: the inner enclosure and the royal crypt. Two `ringWall`s
    // turned 45 degrees (the lathe puts corners on the axes, so a square ring
    // would be a diamond). ---
    put(ringWall(4.6, 6.2, 2.4, header, 4), 0, COURT_TOP, -1.0).rotation.y = Math.PI / 4;
    put(ringWall(4.4, 6.0, 1.6, stretcher, 4), 0, COURT_TOP + 2.4, -1.0).rotation.y = Math.PI / 4;
    put(box(3.6, 2.0, 5.0, header), 0, COURT_TOP, -1.0);
    put(box(4.2, 0.7, 5.6, stretcher), 0, COURT_TOP + 2.0, -1.0);

    // --- 5. The landing: three steps out of the water on the axis of the sea gate, giving the model a front ---
    // -----------------------------------------------------------------------
    slab(-5.0, 5.0, 0, 3.15, PLAN_Z, PLAN_Z + 0.8, stretcher);
    slab(-4.2, 4.2, 0, 2.1, PLAN_Z + 0.8, PLAN_Z + 1.5, header);
    slab(-3.4, 3.4, 0, 1.05, PLAN_Z + 1.5, PLAN_Z + 2.1, stretcher);

    // --- 6. Fallen stone ---
    // Two columns down in the canals, half submerged (the axis on the waterline).
    log(-12.6, WATER_TOP - 0.55, -1.6, 0.34, 0.55, 5.4, stretcher);
    log(12.0, WATER_TOP - 0.5, -1.0, -0.22, 0.5, 4.6, header);
    // One that slipped off a wall head and bridges the canal, at z = -7.8 rather
    // than mid-canal so it does not shadow the open water. The eastern canal has
    // no bridge, so one of the two is clear.
    log(-8.9, PLATFORM_TOP, -7.8, -Math.PI / 2, 0.6, 6.4, header);
    // Two on the causeways and one across the court floor at the gate.
    log(-11.4, QUAY_TOP, 9.2, 0.28, 0.5, 3.0, stretcher);
    log(12.8, QUAY_TOP, 9.4, -0.46, 0.48, 3.2, header);
    log(-4.4, COURT_TOP, 6.0, 0.62, 0.52, 3.4, stretcher);
    log(1.2, PLATFORM_TOP, 8.8, -0.14, 0.46, 3.2, header);

    // --- 7. Quarried columns, stacked and never laid: two rows of two on a row of
    // three, each resting on the one below ---
    for (const x of [17.6, 18.8, 20.0]) log(x, PLATFORM_TOP + 0.4, -6.4, 0, 0.55, 5.2, stretcher);
    for (const x of [18.2, 19.4]) log(x, PLATFORM_TOP + 1.5, -6.0, 0.06, 0.55, 4.8, header);
    log(18.8, PLATFORM_TOP + 2.6, -5.6, -0.09, 0.55, 4.4, stretcher);
    // Two more where the causeway meets the western islet, half sorted.
    for (const x of [-18.4, -19.7]) log(x, PLATFORM_TOP + 0.4, 5.2, 0.05, 0.52, 4.4, header);

    // --- 8. Mangrove: the forest inside the ruin ---
    for (const [x, y, z, scale] of SCRUB) {
      put(taper(1.5 * scale, 0.9 * scale, 2.2 * scale, scrub, 5), x, y, z);
      put(taper(2.8 * scale, 1.0 * scale, 2.4 * scale, leaf, 6), x, y + 2.2 * scale, z);
    }

    return group;
  },
};
