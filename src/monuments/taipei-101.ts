import type { Monument } from './contract.ts';
import { PROUD as STEP_PROUD } from './contract.ts';

/**
 * Taipei 101.
 *
 * Unlike the other tall monuments, which narrow as they rise, each of its eight
 * modules is a truncated pyramid on its head: narrow at the bottom, splayed 7
 * degrees outward, finishing a fifth wider than it started, and then the plan
 * drops back and repeats. The silhouette is a sawtooth with a vertical envelope.
 *
 * Five parts: the inverted taper eight times; a dark notch band at the foot of
 * each module (module n's top is already wider than module n+1's bottom, so the
 * flare builds its own cornice and the band only has to be darker); 32 `gold`
 * ruyi roundels, four at every junction, projecting 0.67 past the widest point
 * of their module; a three-box stepped base 1.8x wider than the shaft that steps
 * inward as the shaft splays outward; and an 8.17-unit spire (11.7% of the
 * height, the real 60 m of 508) of collar, mast, bead and needle.
 *
 * Tier `tower`. At 508 m the building is 1.12x Petronas and 0.61x the Burj
 * Khalifa; filed `tower` it understates by at most 15%, filed `landmark` it
 * would overstate by 52-63%. Interpolating from the Burj (73.6) or Petronas
 * (78.6) also lands near 70. Nothing on the planet is near enough for the tier
 * to be a placement matter.
 *
 * Plan stretch 1.8x uniform against the height (0.1378 units per vertical
 * metre). A module splays 4.2 m a side, which at the height's scale is 0.58
 * units, under the width of the pen; at 1.8x it is 1.04 units. Below about
 * 1.72x it vanishes in the ink and above 2x the tower looks like a chimney.
 * The slenderness drops from 10.1:1 to 5.6:1, and each module becomes 0.42:1
 * instead of 0.80:1, so the junction band is built at 0.62 units (4x the scaled
 * reveal) and inset 0.55 (2.2x) to keep the segments from merging into banding.
 * Half-diagonal 14.38 over 69.9 tall is 0.41 against a cap of 4; the declared
 * footprint is 14.5.
 *
 * Colour separates it from the grey towers: the wall is `green` (the closest
 * palette entry to the blue-green curtain wall), and the dark grooves are
 * `darkOlive` rather than `steel`, which goes black in shade and reads as a
 * hole.
 *
 * Simplified: square modules instead of chamfered ones, no cornice meshes, the
 * ruyi as six-sided discs (24 triangles each), no curtain-wall mullions on the
 * modules (they would be struts), and the podium as one dark plate.
 */

// --- scale: the vertical and the horizontal have different metres ---

/** Metres to the tip of the spire, over the 70 units of the `tower` tier. */
const UNIT = 70 / 508;
/** The plan's metre: 1.8x the height's, uniformly, so plan ratios are untouched. */
const PLAN = UNIT * 1.8;

// --- elevation --------------------------------------------------------------
const APRON_TOP = 0.9;
const STEP1_TOP = 5.6;
const LEDGE1_TOP = 6.15;
const STEP2_TOP = 10.3;
const LEDGE2_TOP = 10.85;
/** Top of the stepped base, floor 26 at about 100 m. The eight modules start here. */
const BASE_TOP = 100 * UNIT;
/** Top of module eight, floor 90 at about 390 m. */
const STACK_TOP = 390 * UNIT;
/** The roof at 448 m. Everything above it is spire. */
const ROOF = 448 * UNIT;
/**
 * The tier ceiling less a hair: `validate` allows 70.05, and 508 * UNIT may not
 * land on exactly 70 in floating point.
 */
const TOP = 69.9;

// --- the eight modules ------------------------------------------------------
const MODULES = 8;
const PITCH = (STACK_TOP - BASE_TOP) / MODULES;
/** The notch. 4x the scaled reveal (see the header). */
const BAND_H = 0.62;
const MODULE_H = PITCH - BAND_H;

/** Half-widths across the flats. 42 m at the bottom of a module, 50.4 m at the top. */
const MODULE_BOTTOM = 21 * PLAN;
const MODULE_TOP = 25.2 * PLAN;
/** How far the notch is inset from the module standing on it. 2.2x the scaled value. */
const NOTCH = 0.55;
const BAND_HALF = MODULE_BOTTOM - NOTCH;

/** A square's corner distance against its half-width across the flats. */
const CORNER = Math.SQRT2;

// --- the ruyi medallions ----------------------------------------------------
/** 8 m across on a 42 m face, sized by the plan metre like everything else horizontal. */
const MEDAL_R = 4 * PLAN;
const MEDAL_T = 6 * PLAN;
/**
 * Clearance under the top of the module the medallion is mounted on, the
 * contract's `PROUD`: at 0.05 the disc's top and the module's top flickered.
 */
const MEDAL_DROP = STEP_PROUD;

// --- plan: the base, half-widths across the flats, in the plan metre ---
// 82 m at the pavement down to 56 m where the stack starts, against the shaft's 42 m.
const APRON_HALF = 41 * PLAN;
const STEP1_HALF = 38 * PLAN;
const LEDGE1_HALF = 40.2 * PLAN;
const STEP2_HALF = 33 * PLAN;
const LEDGE2_HALF = 35.2 * PLAN;
const STEP3_HALF = 27.8 * PLAN;

/**
 * How far a dark pier stands out of the base wall. A recess this shallow is
 * invisible under the cel ramp; a pier standing proud earns its own outline.
 */
const PROUD = 0.28;

/** Non-negative offsets, mirrored about the axis; a 0 stays single. */
const mirrored = (offsets: number[]): number[] =>
  offsets.flatMap((offset) => (offset === 0 ? [0] : [offset, -offset]));

export const taipei101: Monument = {
  id: 'taipei-101',
  name: 'Taipei 101',
  iso: 'TWN',
  lat: 25.034,
  lon: 121.565,
  realHeight: 508,
  tier: 'tower',
  surface: 'metal',
  surfaces: { green: 'metal', darkOlive: 'metal', tan: 'stone', sand: 'stone', bark: 'none' },
  footprint: 14.5,

  build(ctx) {
    const { THREE, palette, box, column, taper, around } = ctx;

    // The blue-green curtain wall: `green` separates this tower from three grey ones.
    const glass = palette.green;
    // Every dark on the building. Warm on purpose, and not `steel`, which goes hueless in recesses.
    const dark = palette.darkOlive;
    // The ruyi, the observatory band and the doorway lintel.
    const gilt = palette.gold;
    // The base's stone, and the sunlit top of each of its cornices.
    const stone = palette.tan;
    const trim = palette.sand;
    // The pavement plate.
    const ground = palette.bark;
    // The spire: the brightest thing in the palette, as a needle 0.2 units thick has only contrast to survive on.
    const steelwork = palette.white;

    const group = new THREE.Group();

    /** A rectangular course, placed by the heights it starts and stops at. */
    const slab = (base: number, top: number, half: number, color: number): void => {
      const mesh = box(half * 2, top - base, half * 2, color);
      mesh.position.y = base;
      group.add(mesh);
    };

    /** A pier driven through a base step: one mesh, front face and back. */
    const acrossFront = (
      base: number,
      top: number,
      x: number,
      half: number,
      width: number,
    ): void => {
      const pier = box(width, top - base, half * 2 + PROUD * 2, dark);
      pier.position.set(x, base, 0);
      group.add(pier);
    };

    /** The same beam turned through a right angle: one mesh, both side faces. */
    const alongSide = (
      base: number,
      top: number,
      z: number,
      half: number,
      depth: number,
    ): void => {
      const pier = box(half * 2 + PROUD * 2, top - base, depth, dark);
      pier.position.set(0, base, z);
      group.add(pier);
    };

    // --- the pavement, and the base stepping inward ---
    slab(0, APRON_TOP, APRON_HALF, ground);
    slab(APRON_TOP, STEP1_TOP, STEP1_HALF, stone);
    slab(STEP1_TOP, LEDGE1_TOP, LEDGE1_HALF, trim);
    slab(LEDGE1_TOP, STEP2_TOP, STEP2_HALF, stone);
    slab(STEP2_TOP, LEDGE2_TOP, LEDGE2_HALF, trim);
    // The top of the base is already curtain wall, which stitches the stone to the stack.
    slab(LEDGE2_TOP, BASE_TOP, STEP3_HALF, glass);

    // Piers on the two tall steps: four bays across the front, three down the side,
    // none through the middle of the front (the doorway). The third step is glass and gets none.
    for (const x of mirrored([2.6, 6.5])) {
      acrossFront(APRON_TOP, STEP1_TOP, x, STEP1_HALF, 1.5);
    }
    for (const z of mirrored([4.7])) {
      alongSide(APRON_TOP, STEP1_TOP, z, STEP1_HALF, 1.5);
    }
    for (const x of mirrored([4.1])) {
      acrossFront(LEDGE1_TOP, STEP2_TOP, x, STEP2_HALF, 1.4);
    }

    // --- the doorway: it marks +Z and is the only thing with a human dimension ---
    const portal = box(3.2, 3.0, 0.7, dark);
    portal.position.set(0, APRON_TOP, STEP1_HALF);
    group.add(portal);

    const lintel = box(4.2, 0.55, 0.6, gilt);
    lintel.position.set(0, APRON_TOP + 3.0, STEP1_HALF + 0.05);
    group.add(lintel);

    // --- the eight modules: identical, so the stack repeats instead of diminishing.
    // Each lays a dark band, stands a flaring frustum on it and rings its shoulders with four medallions. ---

    /** Half-width across the flats a fraction `t` of the way up a module. */
    const halfAt = (t: number): number =>
      MODULE_BOTTOM + (MODULE_TOP - MODULE_BOTTOM) * t;

    /**
     * How far out the medallions are mounted, along the corner diagonal. A disc
     * on a splaying corner would be buried at the top and floating at the bottom,
     * so its back is set just inside the corner at the lowest point and it is
     * thick enough (1.49 units) to stand 0.67 proud at the module's widest.
     */
    const MEDAL_BACK =
      halfAt((MODULE_H - 2 * MEDAL_R - MEDAL_DROP) / MODULE_H) * CORNER - 0.15;

    /** Four ruyi on the four shoulders of a module, at height `y` above its base. */
    const ruyi = (y: number) =>
      around(MODULES / 2, () => {
        // `around` puts its copies on the axes; the ornaments belong on the corners.
        const shoulder = new THREE.Group();
        shoulder.rotation.y = Math.PI / 4;

        const disc = column(MEDAL_R, MEDAL_T, gilt, 6);
        // A prism runs up +Y from its base; laid on its back it runs out along +Z, where the corner is.
        disc.rotation.x = Math.PI / 2;
        disc.position.set(0, y, MEDAL_BACK);
        shoulder.add(disc);

        return shoulder;
      });

    for (let index = 0; index < MODULES; index++) {
      const bandBase = BASE_TOP + index * PITCH;
      const moduleBase = bandBase + BAND_H;

      slab(bandBase, moduleBase, BAND_HALF, dark);

      const shell = taper(MODULE_BOTTOM, MODULE_TOP, MODULE_H, glass, 4);
      shell.position.y = moduleBase;
      group.add(shell);

      group.add(ruyi(moduleBase + MODULE_H - MEDAL_R - MEDAL_DROP));
    }

    // --- the crown: one bright band where the stack stops, then three receding steps ---
    slab(STACK_TOP, STACK_TOP + 0.76, 4.9, gilt);

    const crown: Array<[bottom: number, top: number, to: number, color: number]> = [
      [4.6, 4.0, 57.4, glass],
      [3.75, 3.05, 59.9, dark],
      [2.8, 1.85, ROOF, dark],
    ];
    let crownBase = STACK_TOP + 0.76;
    for (const [bottom, top, to, color] of crown) {
      const step = taper(bottom, top, to - crownBase, color, 4);
      step.position.y = crownBase;
      group.add(step);
      crownBase = to;
    }

    // --- the spire: four lengths and a bead (a bare stick is a scratch on the sky) ---
    const collar = column(1.5, 0.55, steelwork, 6);
    collar.position.y = ROOF;
    group.add(collar);

    const mast = taper(1.05, 0.62, 3.3, steelwork, 6);
    mast.position.y = ROOF + 0.55;
    group.add(mast);

    const bead = column(0.66, 0.45, dark, 6);
    bead.position.y = ROOF + 3.85;
    group.add(bead);

    const upper = taper(0.44, 0.24, 2.4, steelwork, 6);
    upper.position.y = ROOF + 4.3;
    group.add(upper);

    const needle = taper(0.22, 0.05, TOP - (ROOF + 6.7), steelwork, 4);
    needle.position.y = ROOF + 6.7;
    group.add(needle);

    return group;
  },
};
