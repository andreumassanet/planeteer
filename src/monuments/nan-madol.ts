import type { Group, Mesh, Object3D, Monument, MonumentContext } from './contract.ts';

/**
 * Nan Madol — Temwen, Pohnpei, Federated States of Micronesia.
 *
 * **Why here:** the Pacific is a third of the planet and it had one pin. The
 * moai stand on Rapa Nui, which is Polynesia and is 3,700 km from anything;
 * Micronesia and Melanesia — Palau, the Marshalls, Kiribati, Nauru, Papua New
 * Guinea, the Solomons, Vanuatu, Fiji, New Caledonia — had nothing at all. Nan
 * Madol is the one thing in Micronesia that is unarguable: ninety-two
 * artificial islets built on a reef, the only megalithic city in the Pacific,
 * and a shape nothing else in this world's list can make.
 *
 * ---------------------------------------------------------------------------
 * The recognition is the courses, and the avatar sets their size
 * ---------------------------------------------------------------------------
 *
 * The walls are **prismatic basalt columns stacked like logs**: a course laid
 * along the wall (stretchers), then a course laid across it (headers, their
 * hexagonal ends showing on the face), then along again. That alternation is
 * the whole photograph, and every number here is spent on it.
 *
 * The plan is at honest scale. Nandauwas' outer enclosure is about 75 m across
 * and the model's is 17.2 units, so this is **0.229 units per metre**, and the
 * canals fall out at 26 m wide against a real 8 to 30. At that scale two things
 * are unbuildable. The wall's real 7.6 m is **1.74 units** — a quarter of the
 * 6.8-unit avatar, a kerb you step over rather than a wall you stand under. And
 * a single basalt column, 0.8 m thick, is 0.18 units, narrower than the pen that
 * would ink it.
 *
 * So the wall is 10.15 units, one and a half avatars: the **vertical is
 * exaggerated 5.8x against the plan**, past Fuji's 4.5x and the largest stretch
 * in this set. The columns take the repair Mont-Saint-Michel's gables took,
 * where each modelled roof stands for three real houses — seven courses of 1.45
 * units, each standing for about eight real ones. Fewer than seven and the wall
 * reads as striped rather than stacked, which is the one thing it must not do.
 *
 * What the stretch broke: a court that in life is a broad low yard becomes a
 * well, and at 5.8x the walls would have shut it completely. The repair is the
 * next section, and it is the repair the camera wanted anyway.
 *
 * Cropped: ninety-two islets to **three**, and 1.5 km of complex to 188 m of it.
 * What survives the crop is the unit the place is made of — an islet, a canal,
 * an islet — because that is what a visitor actually stands in.
 *
 * Proportion: 24.8 half-diagonal on 17.9 of height, **1.39 against the 2.0
 * cap**, and 2.8x wider than tall against the 4x that `validate` allows. Low
 * and wide is correct here and the tier's 40 units of height are deliberately
 * left on the table; a Nan Madol built up to a tier ceiling would be a keep.
 *
 * ---------------------------------------------------------------------------
 * Every wall steps down toward the camera, and that is not decoration
 * ---------------------------------------------------------------------------
 *
 * The camera looks from 13.4 degrees in the quarter view and 6.8 in the
 * front, so a rim of height h hides 4.2h behind it and 8.4h from the front. A
 * complete Nandauwas — 10 units of wall all the way round — hides its own
 * 19.4-unit court twice over and renders as a closed box.
 *
 * So the enclosure is built as a **ruin that is tallest at the back**. Each
 * course reaches less far forward than the one under it (12.0, 12.0, 10.2, 8.4,
 * 6.6, 4.8, 3.0 in z), which leaves a stair of seven ledges climbing away from
 * the viewer: nothing hides anything, every course draws its own line, and the
 * front wall survives only two courses high. Measured off that: the front wall
 * top stands 2.6 above the court floor, so from the quarter view it hides 10.9
 * of the court's 19.4 units and the **back half of it is visible** — which is
 * why the inner enclosure and the royal crypt are worth their four meshes.
 *
 * The two back corners then rise in three short steps to 17.9. Nandauwas' walls
 * really do sweep up at the corners, and putting that flourish at the back is
 * the same inversion the Citadelle and the Terracotta Army had to make.
 *
 * ---------------------------------------------------------------------------
 * The water, which is the hard part
 * ---------------------------------------------------------------------------
 *
 * Mont-Saint-Michel wrote the argument against modelling water and it is right:
 * nothing in this world is transparent, so an opaque disc at y = 0 is not a sea
 * but a coaster, and `OutlineEffect` inks its free edge into a hard black ring
 * lying on the biome's own ground. The Avenue of the Baobabs proved the same
 * thing without water — a `green` verge laid under a monument is a bright
 * rectangle cut into western Madagascar's gold savanna.
 *
 * The rule that lets this monument keep its canals: **water only where the
 * model's own walls contain it.** Each canal here is a slot 6 units wide and 19
 * long, closed on all four sides by basalt that this model builds — the central
 * islet on one side, a side islet on the other, a causeway across the mouth and
 * the islets' own mass across the head. It has no free edge anywhere, it sits
 * 2.3 units below the islet tops so it never reaches the silhouette, and from
 * outside the model the entire outer surface is retaining wall coming down to
 * whatever the biome has put there. `skyBlue` is the precedent colour for
 * contained water in this set — Marina Bay Sands' pool, Angel Falls' plunge
 * pool, the Guáitara at Las Lajas.
 *
 * **The canals run in z on purpose.** A 6-unit slot between 10-unit walls is
 * invisible when looked at across; it is only ever seen along. Running them
 * front-to-back means the front camera looks straight down them, and the
 * causeway that closes each mouth is deliberately low — its top is 2.9, only
 * **1.0 above the water**. Worked from that top edge at z = 12.4: the 6.8-degree
 * sightline comes down to the surface at z = 4.0, so **13.5 of the canal's 19
 * units are open** from the front and 17.7 of them from 13.4 degrees. A causeway
 * at the islets' own 4.2 would have left 3.8 units, and one at the enclosure's
 * height would have left none.
 *
 * So: **this model owns the water in its canals and the coral rubble on its own
 * platforms, and it owns no ground at all.** There is no apron, no plate and no
 * verge. Pohnpei is `tropical` and its ground here is a pale sand (#edd6ae);
 * dark basalt walls standing straight out of it is the maximum contrast this
 * site can be given, and it costs nothing.
 *
 * ---------------------------------------------------------------------------
 * Colour, and why the basalt is not black
 * ---------------------------------------------------------------------------
 *
 * Columnar basalt is close to black in life and `steel` in this scene's shade
 * is effectively black — and a canal between two walls is the deepest recess
 * this model has. So the stone is `slate` for the stretcher courses (cool
 * grey-violet, the same reasoning that put Fuji in it: light enough that the
 * shaded flank does not collapse into one mass) and `bark` for the header
 * courses, which is warm and dark and keeps a hue where a neutral would not.
 * The alternation is a colour change *and* a depth step of 0.14 — flush courses
 * of one colour render as a single blank slab, which is what happened to
 * Niagara's American curtain. `tan` is the coral rubble the islets are filled
 * with, warm because every square unit of it is in shade behind a wall.
 * `darkOlive` and `green` are the mangrove that has taken the ruin back.
 */

// ---------------------------------------------------------------------------
// Elevation. Every number below is measured off this ladder.
// ---------------------------------------------------------------------------

/** Top of the coarse lower course of every retaining wall — the waterline. */
const REEF_TOP = 2.0;
/** The canal surface, 2.3 below the islet tops so it never reaches a silhouette. */
const WATER_TOP = 1.9;
/** Top of the causeway across each canal mouth: 1.0 of freeboard, and see the header. */
const QUAY_TOP = 2.9;
/** Top of every islet, and the base of the enclosure. */
const PLATFORM_TOP = 4.2;
/** The coral rubble floor inside the enclosure. */
const COURT_TOP = 4.5;

// ---------------------------------------------------------------------------
// Plan. x across, z toward the viewer.
// ---------------------------------------------------------------------------

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
 * The seven courses of the enclosure, bottom to top.
 *
 * `front` is how far forward the course reaches — the stair that lets the
 * camera see every one of them. `half` batters inward 0.12 a course while the
 * header courses are set 0.26 outside that batter line. Each header therefore
 * stands 0.14 proud of the stretcher under it and the next stretcher sits 0.38
 * back, so the outer face goes in-out-in-out as it leans away: two ink lines per
 * pair rather than one, which is what header-and-stretcher masonry looks like
 * from ten metres.
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
 * Where the exposed header logs lie along the top of each side wall, in z.
 *
 * Five to a side, and they are the one place a single basalt column is drawn as
 * itself rather than as part of a course. Each is a six-sided prism laid across
 * the wall with 0.65 of it proud of the outer face, which is the hexagonal end
 * that names the material. They stop short of z = -8.6 because the corner horns
 * stand there.
 */
const HEADER_LOGS = [-7.6, -5.0, -2.4, 0.2, 2.4];

/**
 * Mangrove clumps: x, the surface they stand on, z.
 *
 * The third stands on the top of course 3, and its z is not free: course 4 runs
 * forward to 6.6 and course 3 to 8.4, so the only exposed ledge is the 1.8 units
 * between them. At 5.6 the trunk was inside the course above it — invisible from
 * both fixed cameras and not caught by `findFlaws`, because the crown reaches
 * wider than the wall and the pair is therefore never *contained* by it.
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
  // No `realHeight`. Nan Madol is a city of ninety-two islets; the number
  // people quote (7.6 m, sometimes 8) is one wall of one of them, and the same
  // objection the contract makes for Machu Picchu applies here.
  tier: 'building',
  // 24.8 of it is used, by the outer corner of each side islet. Pohnpei's baked
  // ring is only 57 x 52 units, so 50 units across is already most of the
  // island and anything larger would hang over the reef.
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

    /** A block given by its extents rather than its size — every wall here is one. */
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
     * `yaw`, resting on the surface `y`.
     *
     * Laid down rather than stood up, which is the whole point of the place, and
     * the reason it is worth a helper: a `column` stands on +Y, so the mesh is
     * pitched a quarter turn about X and the pivot carries the yaw. Rotation
     * only, on both nodes, so the determinant stays positive — a reflected
     * matrix is what turns a mesh into a solid ink blob. After the pitch the
     * prism's flats face up and down (the ends that were at +/-Z are the
     * apothem), so `y + radius` puts it resting exactly on the surface.
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

    // -----------------------------------------------------------------------
    // 1. The three islets. Each is a retaining wall of basalt with coral rubble
    //    packed inside it, and each is built in two courses so there is an ink
    //    line at the waterline rather than one blank four-unit face.
    // -----------------------------------------------------------------------
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

      // The causeway across the mouth. Low on purpose — see the header.
      slab(side * ISLET_X, side * CANAL_X, 0, 1.8, CANAL_Z, PLAN_Z, header);
      slab(side * ISLET_X, side * CANAL_X, 1.8, QUAY_TOP, CANAL_Z, PLAN_Z, stretcher);

      // The water, run 0.15 into the stone on all four sides so its own edges
      // are buried and only the surface is ever seen.
      slab(side * (ISLET_X - 0.15), side * (CANAL_X + 0.15), 0, WATER_TOP, -CANAL_Z - 0.15, CANAL_Z + 0.15, water);

      // The seaward wall. Only the back half of each side islet carries one:
      // a 2.9-unit wall standing at the model's outer edge hides 12 units
      // behind it from the quarter view, which is exactly where the near canal
      // is. Back of z = 2.0 it frames the composition; forward of it, it would
      // close the one slot this model exists to show.
      slab(side * OUTER_X, side * (OUTER_X - 2.2), PLATFORM_TOP, PLATFORM_TOP + 1.5, -11.6, 2.0, stretcher);
      slab(side * (OUTER_X - 0.1), side * (OUTER_X - 2.4), PLATFORM_TOP + 1.5, PLATFORM_TOP + 2.9, -11.6, -0.5, header);

      // A low wall along each side islet's canal edge, so the slot has stone on
      // both hands. Two courses, and the upper one stops short of the mouth.
      slab(side * CANAL_X, side * (CANAL_X + 2.3), PLATFORM_TOP, PLATFORM_TOP + 1.5, -11.6, 8.0, stretcher);
      slab(side * (CANAL_X + 0.1), side * (CANAL_X + 2.5), PLATFORM_TOP + 1.5, PLATFORM_TOP + 2.9, -11.6, 5.0, header);
    }

    // The coral floor of the enclosure's court.
    slab(-6.3, 6.3, PLATFORM_TOP, COURT_TOP, -9.7, 9.7, rubble);

    // -----------------------------------------------------------------------
    // 2. Nandauwas. Seven courses, each reaching less far forward than the one
    //    below it. The side walls own the corners and run the full length; the
    //    back and front walls span only the width between them, so no two boxes
    //    share a face and every joint gets its ink.
    // -----------------------------------------------------------------------
    COURSES.forEach((course, k) => {
      const y = PLATFORM_TOP + k * COURSE_H;
      const top = y + COURSE_H;
      const color = course.header ? header : stretcher;
      const inner = course.half - WALL_T;

      for (const side of [-1, 1]) {
        slab(side * course.half, side * inner, y, top, WALL_BACK, course.front, color);
      }
      slab(-inner, inner, y, top, WALL_BACK, WALL_BACK + WALL_T, color);

      // The sea gate survives in the two lowest courses and nowhere else: the
      // rest of the front wall is down, which is both what the site looks like
      // and the only way the court is visible at all.
      if (k < 2) {
        for (const side of [-1, 1]) {
          slab(side * inner, side * GATE_HALF, y, top, course.front - WALL_T, course.front, color);
        }
      }
    });

    // The corner horns, at the back where they can be seen over everything in
    // front of them. Three short steps, each shorter and narrower than the last.
    for (const side of [-1, 1]) {
      slab(side * 7.88, side * 5.58, WALL_TOP, WALL_TOP + 1.4, WALL_BACK, -8.6, header);
      slab(side * 7.7, side * 5.8, WALL_TOP + 1.4, WALL_TOP + 2.6, WALL_BACK, -9.0, stretcher);
      slab(side * 7.5, side * 6.0, WALL_TOP + 2.6, WALL_TOP + 3.55, WALL_BACK, -9.4, header);
    }

    // -----------------------------------------------------------------------
    // 3. The header logs. The top course of each side wall is left as bare
    //    columns lying across the wall with their hexagonal ends proud of the
    //    canal face — the one detail that says what the whole thing is built of.
    // -----------------------------------------------------------------------
    for (const side of [-1, 1]) {
      for (const z of HEADER_LOGS) {
        log(side * 5.18, WALL_TOP, z, (side * Math.PI) / 2, 0.58, 3.35, header);
      }
    }

    // -----------------------------------------------------------------------
    // 4. Inside: the inner enclosure and the royal crypt. Two `ringWall`s
    //    turned 45 degrees — the lathe puts its corners on the axes, so without
    //    the turn a square ring comes out as a diamond in plan. Four meshes for
    //    the thing the site is *for*, and the stepped front wall is what makes
    //    them visible from the quarter view at all.
    // -----------------------------------------------------------------------
    put(ringWall(4.6, 6.2, 2.4, header, 4), 0, COURT_TOP, -1.0).rotation.y = Math.PI / 4;
    put(ringWall(4.4, 6.0, 1.6, stretcher, 4), 0, COURT_TOP + 2.4, -1.0).rotation.y = Math.PI / 4;
    put(box(3.6, 2.0, 5.0, header), 0, COURT_TOP, -1.0);
    put(box(4.2, 0.7, 5.6, stretcher), 0, COURT_TOP + 2.0, -1.0);

    // -----------------------------------------------------------------------
    // 5. The landing. Nan Madol is arrived at by canoe and the model needs a
    //    front — facing +Z is the one clause of the contract no validator can
    //    check. Three steps out of the water on the axis of the sea gate.
    // -----------------------------------------------------------------------
    slab(-5.0, 5.0, 0, 3.15, PLAN_Z, PLAN_Z + 0.8, stretcher);
    slab(-4.2, 4.2, 0, 2.1, PLAN_Z + 0.8, PLAN_Z + 1.5, header);
    slab(-3.4, 3.4, 0, 1.05, PLAN_Z + 1.5, PLAN_Z + 2.1, stretcher);

    // -----------------------------------------------------------------------
    // 6. Fallen stone. A ruin is a wall plus what has come off it, and half of
    //    these are the only thing that proves the slot is water.
    // -----------------------------------------------------------------------
    // Two columns down in the canals, half submerged: passing the surface less
    // the radius puts the axis exactly on the waterline.
    log(-12.6, WATER_TOP - 0.55, -1.6, 0.34, 0.55, 5.4, stretcher);
    log(12.0, WATER_TOP - 0.5, -1.0, -0.22, 0.5, 4.6, header);
    // One that slipped off a wall head and now bridges the canal, resting on
    // the ledge at either side. This is how the islets are crossed on foot, and
    // it is at z = -7.8 rather than mid-canal because it stands 2.6 above the
    // water: from 6.8 degrees it shadows everything behind it, and at mid-canal
    // that was six of the thirteen units of surface the causeway had left open.
    // The eastern canal carries no bridge at all, so one of the two is clear.
    log(-8.9, PLATFORM_TOP, -7.8, -Math.PI / 2, 0.6, 6.4, header);
    // Two on the causeways and one across the court floor at the gate.
    log(-11.4, QUAY_TOP, 9.2, 0.28, 0.5, 3.0, stretcher);
    log(12.8, QUAY_TOP, 9.4, -0.46, 0.48, 3.2, header);
    log(-4.4, COURT_TOP, 6.0, 0.62, 0.52, 3.4, stretcher);
    log(1.2, PLATFORM_TOP, 8.8, -0.14, 0.46, 3.2, header);

    // -----------------------------------------------------------------------
    // 7. Quarried columns, stacked and never laid. The eastern islets carry
    //    piles of dressed basalt that the builders left where they landed it,
    //    and a stack of six is the cheapest thing in this file that says the
    //    walls above were *made* rather than found: same prism, same length,
    //    lying loose instead of coursed. Two rows of two on a row of three,
    //    each row resting on the tops of the one under it.
    // -----------------------------------------------------------------------
    for (const x of [17.6, 18.8, 20.0]) log(x, PLATFORM_TOP + 0.4, -6.4, 0, 0.55, 5.2, stretcher);
    for (const x of [18.2, 19.4]) log(x, PLATFORM_TOP + 1.5, -6.0, 0.06, 0.55, 4.8, header);
    log(18.8, PLATFORM_TOP + 2.6, -5.6, -0.09, 0.55, 4.4, stretcher);
    // Two more where the causeway meets the western islet, half sorted.
    for (const x of [-18.4, -19.7]) log(x, PLATFORM_TOP + 0.4, 5.2, 0.05, 0.52, 4.4, header);

    // -----------------------------------------------------------------------
    // 8. Mangrove. Nan Madol is abandoned and the forest is inside it; without
    //    something growing out of the stone this reads as a building site.
    // -----------------------------------------------------------------------
    for (const [x, y, z, scale] of SCRUB) {
      put(taper(1.5 * scale, 0.9 * scale, 2.2 * scale, scrub, 5), x, y, z);
      put(taper(2.8 * scale, 1.0 * scale, 2.4 * scale, leaf, 6), x, y + 2.2 * scale, z);
    }

    return group;
  },
};
