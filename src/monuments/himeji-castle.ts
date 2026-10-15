import type { Monument } from './contract.ts';

/**
 * Himeji Castle — Shirasagi-jo, the White Heron.
 *
 * One tower and its scaffolding: 46.9 of 69.9 units on the daitenshu stack, 23 on the
 * stone that holds it up, and four other things round its foot.
 *
 * What must survive at thumbnail size:
 * - Five receding storeys, each ringed by its own wide roof. The eave overhang in x
 *   is 4.6 units on the first level, then 3.7, 2.9, 2.4, 2.2, so the silhouette is
 *   five grey bars, each shorter than the last, with a white band between. Eave
 *   half-widths run 12.4, 11.0, 8.0, 6.2, 4.9 (ratios 0.89, 0.73, 0.78, 0.79): a
 *   constant 0.81 read as a pagoda. A keep has a big lower mass (floors one and
 *   two carrying the great roof) and then a sharp step in.
 * - The stone base: 23 of 69.9 units (33%, the real share). Four `taper` courses
 *   stepping in by 1.6, 0.8, 0.4, 0.15, so the profile is concave (the ogi-no-kobai
 *   fan slope: near vertical under the keep, flaring hard at the ground).
 * - Gables set into the roof faces: five chidori-hafu (a pair on the great first
 *   roof, one on each flank, one on the third) and two curved kara-hafu on the
 *   second and fourth. White against grey.
 * - Upturned corners: four struts per roof on all five roofs (twenty meshes).
 * - A group: two subsidiary keeps (shotenshu) at the front corners, each with its
 *   own fan-slope base and two-roof stack, and a watariyagura corridor running back
 *   from each along the main base's flank (two of the real three and four).
 *
 * Colour: `white` (0xfff2e8) every plastered wall and gable; `steel` (0x575a5e) every
 * roof, ridge and corner strut; `brown` (0x988165) the stone base (`bone` goes cold
 * in shade, and `tan` merged with `white`); `bark` the gate, window slots and the
 * top storey's gallery band; `gold` the two shachihoko (32 triangles).
 *
 * Tier `tower`, so nothing can come out squat. Departures:
 * - The keep's plan is squeezed 1.56x (69.9 units over 46.4 m is 1.51 units per
 *   metre; its 20 m of wall would be 30.1 units across, it is 19.3), so it stands
 *   2.43 tall per 1 wide against 1.58, 1.54x more slender than life.
 * - Overhangs are widened to compensate: the first eave to 4.6 (1.53x) and the
 *   others in step, so the roofs are squeezed only 1.27x and the great roof hangs
 *   clear of the stone base's foot (0.7 in x, 0.6 in z).
 * - The courtyard spacing is squeezed about 2.0x more (44.7 across against 90): the
 *   small keeps are pulled in until their stone feet meet the great one's.
 * - Five roofs, as seen from outside (six floors inside). Two small keeps, not
 *   three; no Nishinomaru, Hyakken-roka, moats or other buildings.
  */

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * The keep's plan aspect: 1.15 wider across the front than deep, held by every
 * course. `taper` makes only regular prisms, so a rectangular course is a four-sided
 * taper inside a group scaled in x. The hips come out shallower than the long slopes;
 * the front elevation is right.
 */
const ASPECT = 1.15;

/**
 * The keep sits back of centre: the two small keeps take the front of the plan, so
 * the great one moves 5 units into it, putting its first roof over them.
 */
const KEEP_Z = -5;

/** Top of the stone base, and the datum every storey is measured from. */
const BASE_TOP = 23;

/**
 * The fan slope, bottom to top: each course's half-width in z where it starts, where
 * it finishes, and how tall it is. Stepping in by 1.6, 0.8, 0.4, 0.15 makes the
 * profile concave; four equal steps of 0.74 make a pyramid. The courses also get
 * taller as they rise (5.0, 5.5, 6.0, 6.5).
 */
const FAN = [
  { bottom: 11.8, top: 10.2, height: 5.0 },
  { bottom: 10.2, top: 9.4, height: 5.5 },
  { bottom: 9.4, top: 9.0, height: 6.0 },
  { bottom: 9.0, top: 8.85, height: 6.5 },
];

/**
 * The five storeys, bottom to top. Half-widths in z; x follows by `ASPECT`. `wall` is
 * the plastered box, `eave` the half-width the roof starts at (wider by 4.0, 3.2, 2.5,
 * 2.1, 1.9 in z and half again as much in x). The roof is two courses, shallow then
 * steep (about 28 degrees into 37 reads as gently curving, not a tent).
 *
 * `flare`, `rise` and `thick` are the corner struts, small on purpose: 1.3 out against
 * 1.9 up on the great roof, down to 0.75 against 1.05 (2.6 out against 2.0 up grew ten
 * dark prongs, a pagoda's rafter ends).
 */
interface Storey {
  /** Half-width in z of the plastered wall, and how tall it stands. */
  wall: number;
  height: number;
  /** Half-width in z at the eave, where the roof begins. */
  eave: number;
  /** Lower roof course: height, and the half-width it narrows to. */
  lower: number;
  waist: number;
  /** Upper roof course: height, and the half-width it closes to. */
  upper: number;
  top: number;
  /** How far the corner struts run out along the hip line, and how far up. */
  flare: number;
  rise: number;
  thick: number;
}

const STOREYS: Storey[] = [
  { wall: 8.4, height: 7.8, eave: 12.4, lower: 1.1, waist: 10.4, upper: 2.4, top: 8.0, flare: 1.3, rise: 1.9, thick: 0.6 },
  { wall: 7.8, height: 5.8, eave: 11.0, lower: 1.0, waist: 9.4, upper: 2.2, top: 6.0, flare: 1.2, rise: 1.7, thick: 0.55 },
  { wall: 5.5, height: 5.4, eave: 8.0, lower: 0.8, waist: 6.8, upper: 1.9, top: 4.3, flare: 1.0, rise: 1.4, thick: 0.45 },
  { wall: 4.1, height: 4.6, eave: 6.2, lower: 0.7, waist: 5.2, upper: 1.7, top: 3.2, flare: 0.85, rise: 1.2, thick: 0.4 },
  // The crowning irimoya: its upper course is the steepest in the model (47
  // degrees against 37 below), so the stack finishes on a point.
  { wall: 3.0, height: 4.5, eave: 4.9, lower: 0.8, waist: 4.0, upper: 3.1, top: 1.3, flare: 0.75, rise: 1.05, thick: 0.35 },
];

/**
 * The two subsidiary keeps, at the front corners, and the corridor running back from
 * each along the flank of the main base. They are not a mirrored pair (the real three
 * are three buildings at three distances): one at 1.0 and one at 0.86, set a little
 * further forward. The larger tops out at 27.7 (0.40 of the great keep, under its first
 * eave at 30.8) so no small roof pierces the great roof's overhang. Their stone feet
 * run into the main base at ground level, as the real ishigaki does.
 */
const SMALL = [
  { x: 16.8, z: 7.6, scale: 1, corridor: 17 },
  { x: -15.6, z: 9.4, scale: 0.86, corridor: -15.8 },
];

/** The watariyagura: how far back it runs, and how thick. */
const CORRIDOR = { z: 0.5, length: 14, half: 2.6 };

export const himejiCastle: Monument = {
  id: 'himeji-castle',
  name: 'Himeji Castle',
  iso: 'JPN',
  lat: 34.839,
  lon: 134.694,
  // No realHeight: the source list gives none (the keep is 31.5 m, on its stone base
  // 46.4 m).
  tier: 'tower',
  surface: 'plaster',
  // Set by the larger small keep's skirt corner, at hypot(23.4, 14.2) = 27.4.
  // The great keep and its base reach only 22.5 on their own.
  footprint: 28,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut } = ctx;

    const plaster = palette.white; // every wall, every gable: the White Heron
    const tile = palette.steel; // every roof, ridge and corner strut
    const stone = palette.brown; // the fan slopes — warm, so shade keeps its hue
    const dark = palette.bark; // gate, window slots, the top storey's gallery
    const gilt = palette.gold; // two shachihoko and nothing else

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

    /**
     * One rectangular course of the keep (base, wall or roof), as half-widths in z
     * with x following by `ASPECT`: a four-sided taper inside a group scaled in x.
     * Returns the y it finishes at, so courses chain.
     */
    const course = (bottom: number, top: number, height: number, y: number, color: number): number => {
      const wrap = new THREE.Group();
      wrap.add(taper(bottom, top, height, color, 4));
      wrap.scale.x = ASPECT;
      wrap.position.set(0, y, KEEP_Z);
      group.add(wrap);
      return y + height;
    };

    /**
     * The four upturned corners of an eave: a beam along the hip line, the diagonal
     * of the roof's plan, starting a little inside the eave so it is bedded in the
     * tile.
     */
    const corners = (hz: number, y: number, out: number, rise: number, thick: number): void => {
      const hx = hz * ASPECT;
      const length = Math.hypot(hx, hz);
      const ux = hx / length;
      const uz = hz / length;
      for (const sx of [1, -1]) {
        for (const sz of [1, -1]) {
          // The inner end starts above the eave line, not below it, or the strut
          // hangs under the overhang like a pagoda's rafter ends.
          const inset = out * 0.9;
          const from = new THREE.Vector3(
            sx * (hx - ux * inset),
            y + 0.2,
            KEEP_Z + sz * (hz - uz * inset),
          );
          const to = new THREE.Vector3(
            sx * (hx + ux * out),
            y + rise,
            KEEP_Z + sz * (hz + uz * out),
          );
          group.add(strut(from, to, thick, tile));
        }
      }
    };

    /**
     * A triangular prism laid on its side: apex up, eaves at `eaves`, ridge `rise`
     * above them, running along Z (or X with `alongX`). A three-sided `column` has its
     * pitch fixed at 60 degrees, so it is built at unit size and the mesh carries the
     * scale (legal: only the returned group needs an identity transform). After the
     * quarter turn about X: local x is world x, local y the run, local z the height
     * spanning -1 to +2, hence `scale.set(_, 1, _)`. Used for the corridor roofs and,
     * small with its back end buried in the tile, the chidori-hafu dormers.
     */
    const gable = (
      cx: number,
      cz: number,
      length: number,
      halfWidth: number,
      eaves: number,
      rise: number,
      color: number,
      alongX = false,
    ): void => {
      const prism = column(1, length, color, 3);
      prism.scale.set(halfWidth / Math.sqrt(3), 1, rise / 3);
      prism.rotation.x = Math.PI / 2;
      prism.position.set(0, rise / 3, -length / 2);

      const pivot = new THREE.Group();
      pivot.add(prism);
      if (alongX) pivot.rotation.y = Math.PI / 2;
      pivot.position.set(cx, eaves, cz);
      group.add(pivot);
    };

    /**
     * A kara-hafu: the curved gable, whose bargeboard swells in the middle and turns
     * back down at the ends. An eight-sided taper squashed flat, closed to 0.35 rather
     * than a point so the crown is flat (an ogee, not a cone).
     */
    const karahafu = (y: number, z: number, halfWidth: number, rise: number, depth: number): void => {
      const wrap = new THREE.Group();
      wrap.add(taper(1, 0.35, 1, plaster, 8));
      wrap.scale.set(halfWidth, rise, depth);
      wrap.position.set(0, y, z);
      group.add(wrap);
    };

    /** A dark slot standing slightly proud of a wall, so it never z-fights it. */
    const slot = (x: number, y: number, z: number, width: number, height: number, facing: 'x' | 'z') => {
      put(facing === 'z' ? width : 0.5, height, facing === 'z' ? 0.5 : width, dark, x, y, z);
    };

    // -----------------------------------------------------------------------
    // The fan slope: four courses, each stepping in less than the one below.
    // -----------------------------------------------------------------------
    let y = 0;
    for (const step of FAN) y = course(step.bottom, step.top, step.height, y, stone);

    // The gate through the base. It stands proud of the batter, which is what a
    // Japanese castle gate does — it is built out of the wall, not cut into it.
    put(4.6, 4.2, 0.9, dark, 0, 0, KEEP_Z + FAN[0]!.bottom - 0.15);

    // -----------------------------------------------------------------------
    // The keep: five times a white wall and a wide grey roof.
    // -----------------------------------------------------------------------
    y = BASE_TOP;
    for (const storey of STOREYS) {
      const wallBase = y;
      y = course(storey.wall, storey.wall, storey.height, y, plaster);

      const eaveY = y;
      y = course(storey.eave, storey.waist, storey.lower, y, tile);
      y = course(storey.waist, storey.top, storey.upper, y, tile);
      corners(storey.eave, eaveY, storey.flare, storey.rise, storey.thick);

      // Window slots on the two storeys big enough: five across the front and one on
      // each flank on the first, three on the second. The top storey takes a single
      // dark gallery band.
      if (storey === STOREYS[0]) {
        for (const x of [-7, -3.5, 0, 3.5, 7]) {
          slot(x, wallBase + 2.6, KEEP_Z + storey.wall + 0.15, 1.2, 1.7, 'z');
        }
        for (const side of [1, -1]) {
          slot(side * (storey.wall * ASPECT + 0.15), wallBase + 2.6, KEEP_Z, 1.4, 1.7, 'x');
        }
      } else if (storey === STOREYS[1]) {
        for (const x of [-4.4, 0, 4.4]) {
          slot(x, wallBase + 1.9, KEEP_Z + storey.wall + 0.15, 1.1, 1.5, 'z');
        }
      } else if (storey === STOREYS[4]) {
        put(storey.wall * ASPECT * 2 + 0.5, 1.5, storey.wall * 2 + 0.5, dark, 0, wallBase + 1.0, KEEP_Z);
      }
    }

    // The ridge, and the two shachihoko — the gilt dolphins that stand on its
    // ends, tails up, and that no other roof on the planet has.
    const ridgeTop = y + 1.3;
    put(4.4, 1.3, 2.4, tile, 0, y, KEEP_Z);
    for (const side of [1, -1]) {
      const fish = taper(0.55, 0.26, 1.8, gilt, 4);
      fish.position.set(side * 1.9, ridgeTop, KEEP_Z);
      group.add(fish);
    }

    // -----------------------------------------------------------------------
    // The gables, the only ornament. Each runs back level into a rising slope so the
    // far end buries itself: the chidori are set 0.7 inside their eaves (dormers on
    // the tile), the kara-hafu 0.2 proud (the eave line swelling).
    // -----------------------------------------------------------------------
    // The paired chidori on the great first roof, and one on each of its flanks.
    for (const x of [-6.2, 6.2]) {
      gable(x, KEEP_Z + STOREYS[0]!.eave - 3.1, 4.8, 3.5, 30.4, 3.2, plaster);
    }
    for (const side of [1, -1]) {
      gable(side * (STOREYS[0]!.eave * ASPECT - 3.2), KEEP_Z, 5.0, 3.2, 30.4, 3.0, plaster, true);
    }
    // Then the kara-hafu on the second roof, a fifth chidori on the third, and a
    // smaller kara-hafu on the fourth: no two roofs in a row carry the same gable.
    karahafu(39.9, KEEP_Z + STOREYS[1]!.eave + 0.2 - 2.8, 5.2, 2.4, 2.8);
    gable(0, KEEP_Z + STOREYS[2]!.eave - 2.7, 4.0, 2.7, 48.3, 2.5, plaster);
    karahafu(55.8, KEEP_Z + STOREYS[3]!.eave + 0.2 - 2.0, 3.2, 1.7, 2.0);

    // -----------------------------------------------------------------------
    // The two small keeps: the same grammar at two fifths the height.
    // -----------------------------------------------------------------------
    for (const { x, z, scale: k } of SMALL) {
      const stack = taper(6.2 * k, 5.4 * k, 10.5 * k, stone, 4);
      stack.position.set(x, 0, z);
      group.add(stack);

      put(9.6 * k, 6 * k, 9.6 * k, plaster, x, 10.5 * k, z);

      const skirt = taper(6.6 * k, 4.6 * k, 3 * k, tile, 4);
      skirt.position.set(x, 16.5 * k, z);
      group.add(skirt);

      put(7.2 * k, 4.4 * k, 7.2 * k, plaster, x, 19.5 * k, z);

      const lower = taper(5.6 * k, 4.8 * k, 1 * k, tile, 4);
      lower.position.set(x, 23.9 * k, z);
      group.add(lower);

      // Closes to 1.6, not to a point: a small hipped roof with a flat crown
      // reads as a keep, and a cone reads as a turret on a German castle.
      const upper = taper(4.8 * k, 2.2 * k, 2.8 * k, tile, 4);
      upper.position.set(x, 24.9 * k, z);
      group.add(upper);
    }

    // -----------------------------------------------------------------------
    // The watariyagura corridors, back from each small keep along the flank of the
    // main base. Kept to the sides: anything across the front hides the fan slope.
    // -----------------------------------------------------------------------
    for (const { corridor: x, scale: k } of SMALL) {
      put(CORRIDOR.half * 2, 9.5 * k, CORRIDOR.length, stone, x, 0, CORRIDOR.z);
      put(CORRIDOR.half * 2 - 0.4, 5 * k, CORRIDOR.length - 0.4, plaster, x, 9.5 * k, CORRIDOR.z);
      gable(x, CORRIDOR.z, CORRIDOR.length + 0.6, CORRIDOR.half + 0.7, 14.5 * k, 2.6 * k, tile);
    }

    return group;
  },
};
