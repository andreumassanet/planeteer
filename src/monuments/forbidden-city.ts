import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * The Forbidden City.
 *
 * A representative crop, since the whole complex at any honest scale is a
 * texture: the Hall of Supreme Harmony (Taihedian) on its three-tiered marble
 * terrace, the great courtyard in front of it inside the red palace wall, and
 * the Meridian Gate (Wumen) closing the far side; about 330 m of the central
 * axis out of 960.
 *
 * Two scales: the buildings are at about 0.67 units per metre (Taihedian's 70 m
 * eave is 47 units) and the distances between them at about 0.2, so the 330 m
 * from the gate to the hall is 66 units, foreshortened roughly 3.3x as a long
 * lens does.
 *
 * What must survive at thumbnail size:
 * - The double-eaved hipped roof: two gold roofs with heavy overhang, concave
 *   slope and kicked-up corners, more than half the hall's height.
 * - Deep red under gold-yellow. `palette.gold` is the glazed tile; `palette.red`
 *   is painted timber in sunlight (columns, architraves, palace wall) and
 *   `palette.crimson` what is in shade or masonry (door bays, clerestory, the
 *   gate's rammed wall), so a 40-unit red mass is not one slab.
 * - The white marble terrace: three tiers of `palette.white`, each with a `bone`
 *   balustrade (broken on the front for the stairs, a newel at each break and
 *   front corner) and a stair of two treads with the imperial ramp in `bone`
 *   riding 0.3 above. 9.7 units of terrace under a 28.7-unit hall.
 *
 * Tier `building`: 38.4 tall by 68 wide and 66 deep; the city is deliberately
 * low, so `landmark` would waste 120 units on the flattest famous thing.
 *
 * Departures:
 * - The Meridian Gate is behind the hall (-Z), not in front: a 13-unit gate wall
 *   between the camera and the terrace would hide it. It is 1.6x wider and 0.83
 *   as tall relative to the hall (64 units to 47, 31.7 to 38.4) so it is seen
 *   past the hall, not over it.
 * - The vertical is exaggerated about 1.6x (35.05 m would be 24 units; it is
 *   38.4): the terrace goes from 5.5 to 9.7 and the two roofs take most of the
 *   rest.
 * - The palace wall down the sides is held to 5.8 units (10 m is 6.7), or it
 *   crosses the lowest tier from oblique angles.
 *
 * Roofs: `taper` only makes regular prisms, so each course is a four-sided taper
 * inside a group scaled in x, which fixes the plan aspect at eave and ridge. The
 * hips come out shallower than the long slopes (main roof z-pitch 25 degrees at
 * the eave and 33 at the ridge, x-pitch about 17 and 22); the front elevation is
 * right. The courses close to a 19.2 x 12.0 flat capped by a 21-unit ridge beam,
 * a ridge 0.53 of the eave length (about 0.5 in life). Both roofs are two
 * courses, shallow below and steep above (main 25 then 33 degrees, skirt 28
 * then 35), the concave profile reduced to one kink. The upturned corners are
 * four struts per roof along the hip line, eight meshes.
 *
 * Left out: the other 979 buildings (the next halls would add 40 units of terrace
 * depth), the moat, the wall and corner towers (a half-diagonal of 122), the
 * dougong (one dark `palette.bark` band under each eave), figurines, urns, lions
 * and pavement. The two chiwen at the ridge ends are kept.
 */

// --- the ground plan ------------------------------------------------------

/** The courtyard paving. Its corner is the model's radius: hypot(34, 33) = 47.4. */
const PAVING = { hx: 34, hz: 33, height: 0.7 };

/**
 * The terrace and the hall are centred here rather than at the origin: the gate
 * needs the back half of the plan and the stairs need somewhere to land.
 */
const AXIS_Z = 6;

// --- the three-tiered marble terrace --------------------------------------

/** Half-widths across the front (x) and along the axis (z). Steps of 2.5. */
const TERRACE = [
  { hx: 26.5, hz: 18.5, base: PAVING.height, height: 3.2 },
  { hx: 24, hz: 16, base: 3.9, height: 3 },
  { hx: 21.5, hz: 13.5, base: 6.9, height: 2.8 },
];
const TERRACE_TOP = 9.7;

/** The balustrade: a rail, and posts only where the real terrace has newels. */
const RAIL = { thick: 1.2, height: 1.3 };
const POST = { width: 1.5, height: 2.2 };

/** Half-width of the gap the stairs cut in the balustrade, and of the stairs themselves. */
const STAIR_HALF = 10;
/** How far each tier's flight projects, and the width of the imperial ramp on it. */
const STAIR_RUN = 4.4;
const RAMP_WIDTH = 6;

// --- the Hall of Supreme Harmony ------------------------------------------

/**
 * The stack, bottom to top. Every course is a half-width pair (x, z) and a height,
 * and each either corbels out (dougong) or steps in (storeys), so the ink has
 * something to draw at every level.
 */
const HALL = {
  podium: { hx: 21, hz: 13, height: 0.9 },
  storey: { hx: 19, hz: 11, height: 8.8 },
  architrave: { hx: 19.3, hz: 11.3, height: 1 },
  dougong: { hx: 20.25, hz: 12.25, height: 1.2 },
  clerestory: { hx: 14, hz: 8.5, height: 4.6 },
  upperArchitrave: { hx: 14.3, hz: 8.8, height: 0.9 },
  upperDougong: { hx: 15, hz: 9.5, height: 1.2 },
};

/**
 * Columns: eight across the front for seven bays, so the centre bay is the door.
 * Two more on each flank, at +-`sideZ`, for the three-quarter view.
 */
const COLUMNS = { count: 8, radius: 1, sideZ: 5.5 };

/**
 * The lower eave, the skirt roof round the foot of the clerestory. Two courses;
 * `mid` is the kink. Half-widths in z; x follows by the plan aspect.
 */
const SKIRT = { hx: 23.5, hz: 14.5, mid: 12.6, top: 9.2, lower: 1, upper: 2.4 };

/** The main roof, same two-course construction, narrower because it starts higher. */
const ROOF = { hx: 20, hz: 12.5, mid: 10.6, top: 6, lower: 0.9, upper: 3 };
const RIDGE = { width: 21, depth: 9.5, height: 1.4 };
/** The dragon-fish that terminate the main ridge. */
const CHIWEN = { bottom: 1, top: 0.55, height: 1.4 };

/** The upturned corners: how far out along the hip line, and how far up. */
const FLARE = { out: 3.2, rise: 2.2, thick: 1 };

// --- the palace wall down both sides of the courtyard ---------------------

const WALL = {
  x: 31.3,
  half: 1.9,
  eave: 2.4,
  z: 5.5,
  length: 45,
  base: PAVING.height,
  height: 5.8,
  rise: 1.2,
};

// --- the Meridian Gate ----------------------------------------------------

/**
 * The U: a bar across the back and two wings running forward from its ends. It is
 * wider than the hall on purpose: at half-width 28 against the hall's 23.5-unit
 * eave the hall hid the gate. At 32 the ends and wings stand 8.5 units clear of
 * the eave on each side, framing the hall between two red masses.
 */
const GATE = {
  z: -27,
  barHx: 32,
  barHz: 5,
  wingX: 28.6,
  wingHx: 4.4,
  wingZ: -22,
  wingHz: 10,
  /**
   * 15, not 12.5: the four corner pavilions have to clear the hall's lower eave.
   * At 12.5 their gold roofs topped out at 21.0 against an eave at 21.6 (and
   * further from the camera); at 15 they top out at 23.5.
   */
  height: 15,
  coping: 0.8,
};
const GATE_TOP = PAVING.height + GATE.height + GATE.coping; // 16.5

/** The central of the Five Phoenix Towers, double-eaved like the hall it faces. */
const TOWER = {
  body: { hx: 12, hz: 4.5, height: 5.6 },
  dougong: { hx: 12.75, hz: 5.25, height: 1 },
  skirt: { hx: 15, hz: 6.5, top: 4.4, height: 2.2 },
  upper: { hx: 9, hz: 3.75, height: 2.8 },
  roof: { hx: 11.5, hz: 5, top: 2.6, height: 2.6 },
  ridge: { width: 13, depth: 3.4, height: 1 },
};

/** The four smaller pavilions: two on the bar, two at the heads of the wings. */
const PAVILIONS = [
  { x: 25, z: -27 },
  { x: -25, z: -27 },
  { x: 28.6, z: -17 },
  { x: -28.6, z: -17 },
];
const PAVILION = { hx: 4.5, height: 3.8, roof: 5.4, roofTop: 1.6, roofHeight: 3.2 };

export const forbiddenCity: Monument = {
  id: 'forbidden-city',
  name: 'Forbidden City',
  iso: 'CHN',
  lat: 39.916,
  lon: 116.397,
  // No realHeight: the source list gives none (Taihedian 35.05 m, the gate 37.95,
  // the wall 10).
  tier: 'building',
  // The paving's corner, at hypot(34, 33) = 47.4. Everything else is inside it.
  footprint: 48,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut } = ctx;
    const tile = palette.gold; // every roof and every ridge: glazed imperial yellow
    const timber = palette.red; // columns, architraves, the palace wall — painted, in sun
    const shade = palette.crimson; // door bays, clerestory, the gate's masonry
    const marble = palette.white; // the three terrace tiers and their stairs
    const stone = palette.bone; // balustrades, copings, the carved imperial ramp
    const shadow = palette.bark; // every dougong band, and the gate's openings
    // The courtyard's grey brick: a third value, since `bone` paving matched the
    // terrace and the tiers stopped reading as lifted.
    const pavement = palette.slate;

    const group = new THREE.Group();

    /** A box placed by its base centre, which is where every helper's origin is. */
    const put = (
      width: number,
      height: number,
      depth: number,
      color: number,
      x: number,
      y: number,
      z: number,
    ): void => {
      const mesh = box(width, height, depth, color);
      mesh.position.set(x, y, z);
      group.add(mesh);
    };

    /** The same, for a course of the hall stated as half-widths on the axis. */
    const course = (
      half: { hx: number; hz: number; height: number },
      y: number,
      color: number,
    ): number => {
      put(half.hx * 2, half.height, half.hz * 2, color, 0, y, AXIS_Z);
      return y + half.height;
    };

    /**
     * One course of a hipped roof. `taper` makes regular prisms only, so the
     * rectangle comes from a group scaled in x by the plan aspect; the aspect is
     * fixed, so the top's x follows from its z. Returns the top half-widths, so
     * courses chain.
     */
    const roofCourse = (
      hx: number,
      hz: number,
      topHz: number,
      height: number,
      y: number,
      z: number,
    ): { hx: number; hz: number; top: number } => {
      const aspect = hx / hz;
      const wrap = new THREE.Group();
      wrap.add(taper(hz, topHz, height, tile, 4));
      wrap.scale.x = aspect;
      wrap.position.set(0, y, z);
      group.add(wrap);
      return { hx: topHz * aspect, hz: topHz, top: y + height };
    };

    /**
     * The four upturned corners of an eave: each a beam running out and up along
     * the hip line (the diagonal of the roof's plan).
     */
    const flare = (hx: number, hz: number, y: number, z: number, out: number): void => {
      const length = Math.hypot(hx, hz);
      const ux = hx / length;
      const uz = hz / length;
      for (const sx of [1, -1]) {
        for (const sz of [1, -1]) {
          const from = new THREE.Vector3(
            sx * (hx - ux * 1.4),
            y - 0.35,
            z + sz * (hz - uz * 1.4),
          );
          const to = new THREE.Vector3(
            sx * (hx + ux * out),
            y + FLARE.rise,
            z + sz * (hz + uz * out),
          );
          group.add(strut(from, to, FLARE.thick, tile));
        }
      }
    };

    /**
     * A slab lying on a slope in the z/y plane: the imperial ramp. The box's long
     * axis is +Z and its origin the centre of its bottom face, so one rotation
     * about X puts its low end at (y0, z0) and its high end at (y1, z1).
     */
    const rampSlab = (width: number, y0: number, z0: number, y1: number, z1: number): void => {
      const run = z0 - z1;
      const rise = y1 - y0;
      const mesh = box(width, 0.55, Math.hypot(run, rise), stone);
      mesh.rotation.x = Math.atan2(rise, run);
      mesh.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
      group.add(mesh);
    };

    /** The same idea in the x/y plane: one pitch of the palace wall's tiled coping. */
    const roofSlab = (x0: number, y0: number, x1: number, y1: number): void => {
      const run = x1 - x0;
      const rise = y1 - y0;
      const mesh = box(Math.hypot(run, rise), 0.6, WALL.length + 1.2, tile);
      mesh.rotation.z = Math.atan2(rise, run);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, WALL.z);
      group.add(mesh);
    };

    // --- the courtyard paving -------------------------------------------
    put(PAVING.hx * 2, PAVING.height, PAVING.hz * 2, pavement, 0, 0, 0);

    // --- the three-tiered terrace, its balustrade and its stairs ---------
    for (const tier of TERRACE) {
      put(tier.hx * 2, tier.height, tier.hz * 2, marble, 0, tier.base, AXIS_Z);

      const top = tier.base + tier.height;
      const inner = tier.hz - RAIL.thick;

      // Four runs, lapped at the corners so the ink draws the joint, with the
      // front run split for the stairs.
      put(tier.hx * 2, RAIL.height, RAIL.thick, stone, 0, top, AXIS_Z - tier.hz + RAIL.thick / 2);
      for (const side of [1, -1]) {
        put(RAIL.thick, RAIL.height, inner * 2, stone, side * (tier.hx - RAIL.thick / 2), top, AXIS_Z);
        put(
          tier.hx - STAIR_HALF,
          RAIL.height,
          RAIL.thick,
          stone,
          (side * (tier.hx + STAIR_HALF)) / 2,
          top,
          AXIS_Z + tier.hz - RAIL.thick / 2,
        );
        // A newel at the head of the flight and one at the front corner.
        for (const x of [STAIR_HALF + POST.width / 2, tier.hx - POST.width / 2]) {
          put(POST.width, POST.height, POST.width, stone, side * x, top, AXIS_Z + tier.hz - POST.width / 2);
        }
      }

      // Two steps and the ramp. The ramp rides 0.3 above the treads because in
      // life it is a separate stone laid between two flights, not on them.
      const face = AXIS_Z + tier.hz;
      put(STAIR_HALF * 2, tier.height / 2, 2.2, marble, 0, tier.base, face + STAIR_RUN - 1.1);
      put(STAIR_HALF * 2, tier.height, 2.2, marble, 0, tier.base, face + 1.1);
      rampSlab(RAMP_WIDTH, tier.base + 0.3, face + STAIR_RUN, top + 0.3, face);
    }

    // --- the hall: podium, red storey, columns, architrave, dougong -------
    let y = course(HALL.podium, TERRACE_TOP, stone);
    const storeyBase = y;
    y = course(HALL.storey, y, shade);

    // The end posts stand `PROUD` inside the storey's corners: with their outer
    // flat on its end wall, red and crimson shared a plane and flickered.
    const span = HALL.storey.hx - COLUMNS.radius - PROUD;
    for (let i = 0; i < COLUMNS.count; i++) {
      const post = column(COLUMNS.radius, HALL.storey.height, timber, 8);
      post.position.set(
        -span + (2 * span * i) / (COLUMNS.count - 1),
        storeyBase,
        AXIS_Z + HALL.storey.hz + COLUMNS.radius * 0.4,
      );
      group.add(post);
    }
    for (const side of [1, -1]) {
      for (const offset of [COLUMNS.sideZ, -COLUMNS.sideZ]) {
        const post = column(COLUMNS.radius, HALL.storey.height, timber, 8);
        post.position.set(
          side * (HALL.storey.hx + COLUMNS.radius * 0.4),
          storeyBase,
          AXIS_Z + offset,
        );
        group.add(post);
      }
    }

    y = course(HALL.architrave, y, timber);
    y = course(HALL.dougong, y, shadow);

    // --- the lower eave: two courses, shallow then steep ------------------
    const skirtBase = y;
    const skirtLower = roofCourse(SKIRT.hx, SKIRT.hz, SKIRT.mid, SKIRT.lower, y, AXIS_Z);
    const skirtUpper = roofCourse(
      skirtLower.hx,
      skirtLower.hz,
      SKIRT.top,
      SKIRT.upper,
      skirtLower.top,
      AXIS_Z,
    );
    flare(SKIRT.hx, SKIRT.hz, skirtBase, AXIS_Z, FLARE.out);

    // --- the clerestory, and the second dougong band ----------------------
    y = course(HALL.clerestory, skirtUpper.top, shade);
    y = course(HALL.upperArchitrave, y, timber);
    y = course(HALL.upperDougong, y, shadow);

    // --- the main roof ----------------------------------------------------
    const roofBase = y;
    const roofLower = roofCourse(ROOF.hx, ROOF.hz, ROOF.mid, ROOF.lower, y, AXIS_Z);
    const roofUpper = roofCourse(
      roofLower.hx,
      roofLower.hz,
      ROOF.top,
      ROOF.upper,
      roofLower.top,
      AXIS_Z,
    );
    flare(ROOF.hx, ROOF.hz, roofBase, AXIS_Z, FLARE.out - 0.2);

    put(RIDGE.width, RIDGE.height, RIDGE.depth, tile, 0, roofUpper.top, AXIS_Z);
    for (const side of [1, -1]) {
      const fish = taper(CHIWEN.bottom, CHIWEN.top, CHIWEN.height, tile, 4);
      fish.position.set((side * RIDGE.width) / 2, roofUpper.top + RIDGE.height, AXIS_Z);
      group.add(fish);
    }

    // --- the palace wall down both sides of the courtyard -----------------
    const wallTop = WALL.base + WALL.height;
    for (const side of [1, -1]) {
      put(WALL.half * 2, WALL.height, WALL.length, timber, side * WALL.x, WALL.base, WALL.z);
      // Two pitches meeting over the wall's centre line, each overhanging its
      // own face by half a unit — the little tiled roof the real wall carries.
      roofSlab(side * (WALL.x - WALL.eave), wallTop, side * WALL.x, wallTop + WALL.rise);
      roofSlab(side * (WALL.x + WALL.eave), wallTop, side * WALL.x, wallTop + WALL.rise);
    }

    // --- the Meridian Gate ------------------------------------------------
    const gateBase = PAVING.height;
    const gateWallTop = gateBase + GATE.height;
    put(GATE.barHx * 2, GATE.height, GATE.barHz * 2, shade, 0, gateBase, GATE.z);
    put(GATE.barHx * 2 + 2, GATE.coping, GATE.barHz * 2 + 1, stone, 0, gateWallTop, GATE.z);
    for (const side of [1, -1]) {
      put(GATE.wingHx * 2, GATE.height, GATE.wingHz * 2, shade, side * GATE.wingX, gateBase, GATE.wingZ);
      put(
        GATE.wingHx * 2 + 1,
        GATE.coping,
        GATE.wingHz * 2 + 1,
        stone,
        side * GATE.wingX,
        gateWallTop,
        GATE.wingZ,
      );
    }
    // Three of the five openings, on the face the courtyard sees.
    for (const x of [0, 9, -9]) {
      put(x === 0 ? 5 : 4, 7, 1, shadow, x, gateBase, GATE.z + GATE.barHz);
    }

    // The central tower: the same double-eaved construction as the hall, at a
    // third of the size, so the gate reads as the hall's smaller answer.
    let g = GATE_TOP;
    put(TOWER.body.hx * 2, TOWER.body.height, TOWER.body.hz * 2, shade, 0, g, GATE.z);
    g += TOWER.body.height;
    put(TOWER.dougong.hx * 2, TOWER.dougong.height, TOWER.dougong.hz * 2, shadow, 0, g, GATE.z);
    g += TOWER.dougong.height;
    const towerSkirt = roofCourse(TOWER.skirt.hx, TOWER.skirt.hz, TOWER.skirt.top, TOWER.skirt.height, g, GATE.z);
    put(TOWER.upper.hx * 2, TOWER.upper.height, TOWER.upper.hz * 2, shade, 0, towerSkirt.top, GATE.z);
    const towerRoof = roofCourse(
      TOWER.roof.hx,
      TOWER.roof.hz,
      TOWER.roof.top,
      TOWER.roof.height,
      towerSkirt.top + TOWER.upper.height,
      GATE.z,
    );
    put(TOWER.ridge.width, TOWER.ridge.height, TOWER.ridge.depth, tile, 0, towerRoof.top, GATE.z);

    // The four corner pavilions. Square, so their roofs need no scaling at all.
    for (const pavilion of PAVILIONS) {
      put(PAVILION.hx * 2, PAVILION.height, PAVILION.hx * 2, shade, pavilion.x, GATE_TOP, pavilion.z);
      const roof = taper(PAVILION.roof, PAVILION.roofTop, PAVILION.roofHeight, tile, 4);
      roof.position.set(pavilion.x, GATE_TOP + PAVILION.height, pavilion.z);
      group.add(roof);
    }

    return group;
  },
};
