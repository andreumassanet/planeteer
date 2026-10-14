import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Niagara Falls.
 *
 * A bowl and a wall with a wooded island between them: the Canadian
 * (Horseshoe) fall is a deep curved crest, concave toward the viewer, pouring
 * inward from three sides into an open basin; across the basin, straight and
 * yawed 20 degrees, is the American fall, the only one of the three that lands
 * on a mountain of its own fallen rock. As with `victoria-falls.ts`, a waterfall
 * is a shape of land, so the monument is the landform and the water is what makes
 * it visible, and the spray plume is kept small and placed where it cannot cross
 * the thing being read.
 *
 * Budget is spent on, in order: the curve (twelve facets of a half-circle 19.5
 * units in radius, opening downstream, drawn as a plan outline, a white crest
 * ribbon and, at thumbnail size, as light); the open mouth (the arms stop at one
 * line and nothing is built downstream, so the bowl is a C); the second fall
 * (four slabs stepped in depth so 22 units of white are not one blank
 * rectangle, with Bridal Veil notched off its west end by Luna Island); the
 * talus; the wooded island; the basin (one sheet of `skyBlue` both falls land
 * in); and the mist.
 *
 * No cutaway is needed. Victoria's chasm is a slot whose near rim hides all but
 * a sliver of the drop, but here the bowl is open downstream into a basin, so
 * the sight line from the quarter camera to the foot of the far curtain crosses
 * the mouth and clears every rim. Facets 10 and 11 turn away from the quarter
 * camera and are back faces, not hidden ones. The gorge that continues north
 * for eleven kilometres is not modelled; building any gorge wall on the
 * camera's side would bring back Victoria's problem.
 *
 * The ramp draws the curve: twelve facets 15 degrees apart sweep the sun's dot
 * product across the bowl (-0.42 at the west arm, 0.45 at the apex, 0.66 at the
 * east, 0.75 for the water on top), so a curved wall banded by cel shading puts
 * white on three of the four bands from one colour. The near arm is `+X`, which
 * also lights the American curtain at 0.59 (mirrored it would drop a band), and
 * is where the American fall really is.
 *
 * The mist is five puffs, all behind the apex (`z <= -19`) and above the rim
 * (`base >= 27.6`), so each silhouettes against sky; a cloud inside the mouth
 * would fill the concavity with white. They are lumps in three tiers, twelve-
 * sided, closed by a `taper`.
 *
 * Scale: horizontally 1 unit is 11 m, so the Horseshoe's twelve chords measure
 * 61.1 units (672 m against the surveyed 670). Vertically 1 unit is 2.11 m
 * (27 units for the 57 m drop, a 5.21x stretch); true scale gives a
 * half-diagonal over height of 9.6 against a cap of 2. Bridal Veil is 3 units
 * (about 2x real) and Luna Island 2 (about 1.5x) so they survive as a notch and
 * a rib. The gap from the Horseshoe's east arm to the American crest is 17.9
 * units, about half the real Goat Island brink, so both falls fit the circle.
 * Tier `building`: at `landmark`'s height a landform this wide would be a wall.
 *
 * Colour: `skyBlue` for flat water and `white` for aerated water, with the lip
 * the hard boundary between them (blue river above, white curtain, blue basin
 * below). `bark` under `brown` at `COURSE` (15 of 27) is the hard caprock over
 * soft shale. `tan` appears only in the talus, so three warm values read as
 * separate fallen blocks. `green` is lawn and `darkOlive` the tree clumps, so
 * the island reads as wooded.
 */

const DEG = Math.PI / 180;

// --- Heights. 1 unit = 2.11 m; the drop is 27. ---

/** Lip = plateau top = the river's surface at the brink. 57 m. */
const LIP_Y = 27;

/** Top of the rock under the river; the `skyBlue` plate is the 1.8 above it. */
const RIVER_Y = 25.2;

/**
 * Top of the white crest ribbon, 0.3 below the river: anything standing proud of
 * the water occludes over four times its height of the river behind it, so the
 * lip is worth more as a colour boundary than as a bump.
 */
const CREST_Y = 26.7;

/** Dolostone over shale: the 12 units above the line are 25 m, the real 24. */
const COURSE = 15;

/**
 * The wooded rims stand 1.3 above the water, and Goat Island 1.9. From the front
 * view (6.8 degrees up) a level crest and its flanking promontories project to
 * one line; lifting the arms drops the crest into a visible notch between them.
 */
const BANK_Y = 28.3;
const ISLAND_Y = 28.9;

/** The plunge pool, and the flat river re-forming below it. */
const POOL_Y = 1.8;
const BASIN_Y = 1.6;

// --- The Horseshoe ---

/**
 * Centre and radius of the bowl: a plain half-circle whose twelve chords measure
 * 61.1 units (672 m at 11 m to the unit). The apex sits at `BOWL_Z - BOWL_R` and
 * the two arm tips on the line `z = BOWL_Z`, where the model stops.
 */
const BOWL_X = -16;
const BOWL_Z = 1;
const BOWL_R = 19.5;

/**
 * Twelve facets over the half-circle. The count is set by the cel ramp: each
 * facet is one flat fill, so twelve are twelve samples of `n.L`, which crosses
 * two of the ramp's three thresholds. The rim planks fan outward from their
 * chords, leaving wedge gaps that the river slab and Goat Island fill; past
 * `x = -28` three stay open and read as fluting, out of sight of both fixed views.
 */
const FACETS = 12;
const SPAN = (180 / FACETS) * DEG;

/** Radial depth of the rim: the land between the crest and where blocks take over. */
const RIM = 13;

/**
 * Which facets carry river behind them and which carry woodland, west to east.
 * The Canadian side is open water from 15 degrees in from the west tip, with
 * facet 0 kept as land (Table Rock); Goat Island crowds the east arm from 45
 * degrees round. This also stops the bowl reading as a mirrored ornament.
 */
const GREEN_FACETS = new Set([0, 9, 10, 11]);

/**
 * The churn at the foot, as four blocks standing 4 to 6.5 out of the pool. White
 * on white, visible only by the ink; they stop the curtain meeting its pool in a
 * dead horizontal, which reads as a dam. `phi` places them around the arc.
 */
const CHURN: ReadonlyArray<{ phi: number; r: number; w: number; d: number; h: number }> = [
  { phi: -62, r: 12.6, w: 8.5, d: 4.6, h: 5.4 },
  { phi: -26, r: 11.8, w: 9.5, d: 5.0, h: 6.4 },
  { phi: 11, r: 12.2, w: 9.0, d: 4.6, h: 5.8 },
  { phi: 46, r: 12.8, w: 7.5, d: 4.2, h: 4.4 },
];

// --- The American Falls ---

/**
 * The straight fall, given as a line: start, bearing, length. The true angle
 * between the Horseshoe's axis and the American face is about 45 degrees, which
 * would turn the curtain 77 degrees from the quarter camera. A 20-degree yaw
 * keeps the crest visibly oblique, with the face 52 degrees off the quarter
 * camera and 20 off the front one.
 */
const AM_X = 21;
const AM_Z = -2.5;
const AM_YAW = 20 * DEG;
const AM_LEN = 27;

/** Distance along the crest from `AM_X, AM_Z`. */
const BRIDAL_END = 3;
const LUNA_END = 5;

/**
 * The American curtain, in four slabs. `lip` wobbles so 22 units are not a
 * ruler. `out` is how far the slab stands into the basin: coplanar meshes get no
 * ink (each hull is expanded separately and loses the depth test against a
 * flush neighbour), so stepping them in depth gives each step an ink line the
 * length of the fall, and the sliver of side face it exposes is a dark seam.
 * The backs all stay at `-3.0`, buried in the shore, so no step opens a hole.
 */
const AM_SHEETS: ReadonlyArray<{ s0: number; s1: number; lip: number; out: number }> = [
  { s0: 5.0, s1: 10.4, lip: 26.7, out: 1.2 },
  { s0: 10.4, s1: 16.0, lip: 26.9, out: 2.1 },
  { s0: 16.0, s1: 21.6, lip: 26.6, out: 1.3 },
  { s0: 21.6, s1: 27.0, lip: 26.8, out: 2.2 },
];

/**
 * The talus: the American fall lands on a mountain of its own caprock rather
 * than into water, and only 21 to 34 m of the 57 is free fall, so the pile climbs
 * to 12 of 27. It uses the cliff's two rock colours plus `tan` and is the one
 * jumbled, un-rectangular thing in a model of straight courses. `s` runs along
 * the crest, `o` out into the basin, `yaw` is added to the crest's own so no two
 * blocks are parallel.
 */
const TALUS: ReadonlyArray<{
  s: number;
  o: number;
  w: number;
  d: number;
  h: number;
  yaw: number;
  tone: 0 | 1 | 2;
}> = [
  { s: 6.5, o: 3.6, w: 7.0, d: 6.0, h: 11.0, yaw: 9, tone: 1 },
  { s: 11.0, o: 2.8, w: 8.0, d: 6.6, h: 9.4, yaw: -7, tone: 0 },
  { s: 15.5, o: 4.4, w: 6.6, d: 5.6, h: 12.0, yaw: 14, tone: 2 },
  { s: 19.5, o: 3.0, w: 7.6, d: 6.0, h: 9.8, yaw: -12, tone: 1 },
  { s: 23.5, o: 4.2, w: 6.2, d: 5.0, h: 8.2, yaw: 6, tone: 0 },
  { s: 9.0, o: 8.6, w: 5.2, d: 4.6, h: 5.8, yaw: 22, tone: 2 },
  { s: 13.5, o: 7.8, w: 4.6, d: 4.0, h: 7.2, yaw: -18, tone: 0 },
  { s: 18.0, o: 9.2, w: 5.6, d: 4.2, h: 5.2, yaw: 31, tone: 1 },
];

// --- The mist ---

/**
 * Five puffs, all behind the apex and above the rim (`base >= 27.6`, `z <=
 * -19`), so on the quarter camera's screen-up axis the lowest base (32.9) clears
 * the apex crest (31.8). `r` is a half-width across the flats of a twelve-sided
 * prism, so each reaches about 3% further at its corners.
 */
interface Puff {
  x: number;
  z: number;
  r: number;
  base: number;
  h: number;
  /** Closes a stack with a `taper`, so the column does not end flat. */
  cap: boolean;
}

const MIST: ReadonlyArray<Puff> = [
  { x: -20, z: -19.4, r: 4.2, base: 27.6, h: 3.4, cap: false },
  { x: -14, z: -21.0, r: 3.6, base: 27.8, h: 3.2, cap: false },
  { x: -24.5, z: -22.0, r: 3.2, base: 27.6, h: 3.0, cap: false },
  { x: -18, z: -20.4, r: 3.8, base: 30.6, h: 3.4, cap: false },
  { x: -21, z: -21.2, r: 2.8, base: 33.4, h: 2.8, cap: true },
];

// --- Woodland ---

/**
 * Tree clumps: three on Goat Island, three on the two rims, one on the low
 * Canadian bank below the falls. Each was checked against what is under it: the
 * rims are yawed planks, so a clump placed by eye can hang past the cliff edge.
 */
const WOODS: ReadonlyArray<{ x: number; z: number; w: number; d: number; h: number; y: number }> = [
  { x: 13.5, z: -5.0, w: 5.6, d: 4.4, h: 2.6, y: ISLAND_Y },
  { x: 19.0, z: -13.0, w: 6.4, d: 5.0, h: 3.0, y: ISLAND_Y },
  { x: 23.5, z: -24.0, w: 5.0, d: 4.6, h: 2.4, y: ISLAND_Y },
  { x: -42.0, z: -2.8, w: 5.4, d: 4.2, h: 2.8, y: BANK_Y },
  { x: -40.0, z: 9.0, w: 4.6, d: 4.0, h: 2.2, y: 6.8 },
  { x: 32.5, z: -13.0, w: 6.0, d: 4.6, h: 2.6, y: BANK_Y },
  { x: 40.0, z: -10.0, w: 5.0, d: 4.2, h: 2.2, y: BANK_Y },
];

export const niagaraFalls: Monument = {
  id: 'niagara-falls',
  name: 'Niagara Falls',
  iso: 'CAN',
  lat: 43.083,
  lon: -79.075,
  // No `realHeight`: the Horseshoe and the American fall are both 57 m, only 21
  // to 34 m of the latter is free water, and the number usually quoted is a flow rate.
  tier: 'building',
  footprint: 52,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;
    const shale = palette.bark; //       the shadowed lower course
    const caprock = palette.brown; //    Lockport dolostone, and the plateau
    const rubble = palette.tan; //       the third value in the talus, and only there
    const river = palette.skyBlue; //    flat water: above the lip and in the basin
    const foam = palette.white; //       aerated water: curtains, crests, churn, mist
    const park = palette.green; //       lawn and clearings
    const wood = palette.darkOlive; //   tree clumps

    const group = new THREE.Group();

    /** An axis-aligned mass, given as the box it occupies. */
    const slab = (
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      y0: number,
      y1: number,
      color: number,
    ) => {
      const mesh = box(x1 - x0, y1 - y0, z1 - z0, color);
      mesh.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
      group.add(mesh);
      return mesh;
    };

    /** The same, yawed about its own centre: every facet and every fallen block. */
    const plank = (
      cx: number,
      cz: number,
      w: number,
      d: number,
      y0: number,
      y1: number,
      yaw: number,
      color: number,
    ) => {
      const mesh = box(w, y1 - y0, d, color);
      mesh.position.set(cx, y0, cz);
      mesh.rotation.y = yaw;
      group.add(mesh);
      return mesh;
    };

    // --- the Horseshoe: each facet is a chord of the half-circle. The rim block
    // sits on the chord and runs outward; the curtain hangs on the same chord and
    // runs 3.0 inward, so its top face is a white ribbon following the curve. ---
    const chord = 2 * BOWL_R * Math.sin(SPAN / 2);
    const inset = BOWL_R * Math.cos(SPAN / 2);

    for (let i = 0; i < FACETS; i++) {
      const phi = -Math.PI / 2 + SPAN * (i + 0.5);
      // Outward from the bowl's centre, and the tangent along the crest.
      const ux = Math.sin(phi);
      const uz = -Math.cos(phi);
      const mx = BOWL_X + inset * ux;
      const mz = BOWL_Z + inset * uz;
      // `rotation.y = -phi` puts the box's +Z on the inward radial.
      const yaw = -phi;
      const rx = mx + ux * (RIM / 2);
      const rz = mz + uz * (RIM / 2);

      plank(rx, rz, chord + 0.7, RIM, 0, RIVER_Y, yaw, caprock);

      // The two arm tips are the only rim faces that look at the camera, so only they get the course line, 0.3 proud.
      if (i === 0 || i === FACETS - 1) {
        plank(rx, rz, chord + 1.3, RIM + 0.4, 0, COURSE, yaw, shale);
      }

      // A lawn facet sinks `PROUD` into its rock and stands `PROUD` in from its sides, off the neighbours' planes.
      const green = GREEN_FACETS.has(i);
      const trim = green ? PROUD * 2 : 0;
      plank(
        rx,
        rz,
        chord + 0.7 - trim,
        RIM - trim,
        green ? RIVER_Y - PROUD : RIVER_Y,
        green ? BANK_Y : LIP_Y,
        yaw,
        green ? park : river,
      );

      // The curtain: 3.0 into the bowl, 1.2 behind the crest so no yawed corner opens a hairline.
      plank(mx - ux * 0.9, mz - uz * 0.9, chord + 0.9, 4.2, 0.9, CREST_Y, yaw, foam);
    }

    // The plunge pool, one twelve-sided prism echoing the bowl; its circumradius is 15.5, inside the curtains' 16.3.
    const pool = column(15, POOL_Y, foam, 12);
    pool.position.set(BOWL_X, 0, BOWL_Z);
    group.add(pool);

    for (const lump of CHURN) {
      const phi = lump.phi * DEG;
      plank(
        BOWL_X + lump.r * Math.sin(phi),
        BOWL_Z - lump.r * Math.cos(phi),
        lump.w,
        lump.d,
        0,
        lump.h,
        -phi,
        foam,
      );
    }

    // --- the river above and the basin below: the lobe that widens the rim band's
    // river in the middle (a horizontal plane seen from 13.4 degrees collapses to
    // `depth * sin(13.4)`), with its near edge inside the rim band's outer radius ---
    slab(-28, 8, -40, -19, 0, RIVER_Y, caprock);
    slab(-28, 8, -40, -19, RIVER_Y, LIP_Y, river);

    // The Niagara re-forming below the falls. It runs to 41 because both falls
    // land in it; the east corner reaches 49.6 of the 52-unit footprint, just
    // inside the American shore's 49.9. Its back face starts `PROUD` inside the
    // Canadian bank's, which is at z = 2.
    slab(-40, 41, 2 + PROUD, 28, 0, BASIN_Y, river);

    // The Canadian bank downstream of Table Rock, kept low: at gorge height it would be the near rim.
    slab(-46, -34, 2, 18, 0, 5.6, shale);
    slab(-45, -34, 2, 17, 5.6, 6.8, park);

    // --- Goat Island: its downstream cliff faces the camera between the two falls, in two courses, the upper battered back by 1 ---
    slab(9, 27, -32, 0.5, 0, COURSE, shale);
    slab(10, 27, -32, -0.5, COURSE, LIP_Y, caprock);
    slab(10, 27, -32, -0.5, LIP_Y, ISLAND_Y, park);

    // --- the American Falls ------------------------------------------------
    const dx = Math.cos(AM_YAW);
    const dz = Math.sin(AM_YAW);
    // The face normal, pointing into the basin.
    const nx = -dz;
    const nz = dx;
    /** A point on the crest frame: `s` along the crest, `o` out into the basin. */
    const at = (s: number, o: number): [number, number] => [
      AM_X + s * dx + o * nx,
      AM_Z + s * dz + o * nz,
    ];

    // The shore behind the crest: two courses, then the river's east channel, then the mainland.
    const [sx, sz] = at(AM_LEN / 2, -4.5);
    plank(sx, sz, AM_LEN + 1, 9, 0, COURSE, -AM_YAW, shale);
    plank(sx, sz, AM_LEN + 1, 9, COURSE, RIVER_Y, -AM_YAW, caprock);
    plank(sx, sz, AM_LEN + 1, 9, RIVER_Y, LIP_Y, -AM_YAW, river);
    const [bx, bz] = at(AM_LEN / 2 - 3, -13);
    plank(bx, bz, AM_LEN - 5, 8, 0, LIP_Y, -AM_YAW, caprock);
    plank(bx, bz, AM_LEN - 5, 8, LIP_Y, BANK_Y, -AM_YAW, park);

    // Bridal Veil, then Luna Island's rib, then the fall proper. The rib carries
    // its own woodland to the brink. `out` is the front face's distance into the
    // basin; the back is pinned at -3.0 inside the shore block.
    const sheet = (s0: number, s1: number, lip: number, out: number) => {
      const [cx, cz] = at((s0 + s1) / 2, (out - 3.0) / 2);
      plank(cx, cz, s1 - s0 + 0.4, out + 3.0, 0.9, lip, -AM_YAW, foam);
    };
    sheet(0, BRIDAL_END, 26.5, 1.2);
    for (const s of AM_SHEETS) sheet(s.s0, s.s1, s.lip, s.out);

    const [lx, lz] = at((BRIDAL_END + LUNA_END) / 2, -1.4);
    plank(lx, lz, LUNA_END - BRIDAL_END, 5.4, 0, LIP_Y, -AM_YAW, shale);
    plank(lx, lz, LUNA_END - BRIDAL_END, 5.4, LIP_Y, ISLAND_Y, -AM_YAW, park);

    for (const rock of TALUS) {
      const [tx, tz] = at(rock.s, rock.o);
      const tone = rock.tone === 0 ? caprock : rock.tone === 1 ? rubble : shale;
      plank(tx, tz, rock.w, rock.d, 0, rock.h, -AM_YAW + rock.yaw * DEG, tone);
    }

    // Where the American fall's water reaches the river, past its own rubble.
    for (const [s, o, w, h] of [
      [10, 12.5, 11, 3.4],
      [20, 12.0, 10, 2.8],
    ] as const) {
      const [wx, wz] = at(s, o);
      plank(wx, wz, w, 5.5, 0, h, -AM_YAW, foam);
    }

    // --- woodland ----------------------------------------------------------
    for (const clump of WOODS) {
      slab(
        clump.x - clump.w / 2,
        clump.x + clump.w / 2,
        clump.z - clump.d / 2,
        clump.z + clump.d / 2,
        clump.y,
        clump.y + clump.h,
        wood,
      );
    }

    // --- the mist ----------------------------------------------------------
    for (const puff of MIST) {
      const cloud = puff.cap
        ? taper(puff.r, puff.r * 0.5, puff.h, foam, 12)
        : column(puff.r, puff.h, foam, 12);
      cloud.position.set(puff.x, puff.base, puff.z);
      group.add(cloud);
    }

    return group;
  },
};
