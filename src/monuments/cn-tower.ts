import type { Monument } from './contract.ts';

/**
 * CN Tower.
 *
 * Tier `landmark` (120 tall). The monuments file supertall office buildings as
 * `tower` and free-standing towers as `landmark`; this was the tallest
 * free-standing structure from 1975 to 2007. At 70 units it would stand 0.58 of
 * the Tokyo Tower though it is 1.68x the Eiffel Tower's height. Every landmark
 * gets 120 units, so width carries the 553 m: footprint 4.8, the narrowest of
 * any monument (the Burj Khalifa's is 14.5).
 *
 * Every elevation is the real tower's, in metres, times `U = 120 / 553.33`;
 * half-diagonal over height is 0.039. Three declared departures:
 * 1. The main pod is 1.10x taller than life (height/width 0.82 to 0.90), to
 *    read as a drum and not a saucer next to the Space Needle.
 * 2. The upper pod is about 1.2x wider than life (15.2 m against about 13): 2.14x
 *    the shaft it stands on, still half the main pod's width. Built honestly it
 *    was a single grey pixel.
 * 3. Plan widths are set by slenderness, 12.8 : 1 across the buttress noses
 *    (9.40 wide, 120 tall); the bare shaft alone is 24 : 1 at the ground.
 *
 * What must survive at thumbnail size:
 * - The hexagonal shaft: one six-sided `taper`, 2.50 to 0.73 half-width over
 *   97.6 units (1.19 at the pod neck). One mesh, because a stack of frusta
 *   would draw a ladder of horizontal rules.
 * - Three buttress wings: one three-sided `taper` on the shaft's axis. A
 *   triangle's circumradius is twice its apothem, so its corners reach 4.70 at
 *   the ground, at 60, 180 and 300 degrees (the middles of the hexagon's faces).
 *   The wing dies where `2 * apothem(y) = shaftHalf(y)`, y = 43.0 (35.9% of the
 *   height). Two meshes, so the flare steepens over the bottom 46 m (0.100 of
 *   reach per unit of rise, against 0.060 above).
 * - The main pod: nine meshes between 333 m and 360.5 m. A sloping skirt
 *   (1.25 to 2.95 over 8.5 m), three dark glazed bands (342-346, 351, 356)
 *   separated by pale rims standing 0.26-0.32 proud, the upper drum and a coned
 *   cap. The proud rims are what read as stacked decks.
 * - The antenna: 97.59 to 120 units (18.7%), two lengths with a step from 0.42
 *   to 0.30 half-width at 503 m, plus two collars so it reads as a built mast.
 * - The upper pod: four meshes at 439.5-453 m centred on 446.3 m, half-width
 *   1.65 where the shaft is 0.77, at 80.6% of the height.
 *
 * Unlike the Space Needle (`tower`, footprint 11.3, `white`/`darkOlive`): 12.8 : 1
 * against 3.1 : 1, no daylight between the wings (they wrap the shaft), a drum
 * (5.96 tall over 6.62 wide) at 63% of the height, a second pod, and 120 units
 * against 70. There are no floors: 29.2 units of bare cone lie between the wings
 * vanishing at y = 43.0 and the pod skirt at y = 72.2. The three dark strips on
 * the shaft are elevator window slots (0.22 and 0.13 thick, half-buried), for
 * vertical grain.
 *
 * Colour: the shaft is `blush` (0xeec3af), the palette's pale warm neutral; `bone`
 * goes to a dark hueless patch in the shaded half of a single-material shaft,
 * `steel` goes black, `slate` cold, `sand` golden and `tan` olive. `tan` is the
 * ground apron and base roof (it is the continent's own colour, so the plate
 * blends in); `steel` the glazing (pod bands, collars, slots); `white` the
 * antenna, which separates cleanly from `blush` where `cream` would not.
 *
 * Budget: 29 meshes of 130 and 1,192 triangles of 3,600, 13 of the meshes in the
 * two pods. Reach 4.70 of the declared 4.8.
 */

// ---------------------------------------------------------------------------
// Everything vertical is the real tower in metres. `U` is the only conversion.
// ---------------------------------------------------------------------------

const REAL_HEIGHT = 553.33;
const TOP = 120;
/** World units per metre: 0.21687. */
const U = TOP / REAL_HEIGHT;
const at = (metres: number): number => metres * U;

// --- the shaft: one straight cone, ground to the top of the concrete ---
const SHAFT_TOP = at(450);
const SHAFT_FOOT = 2.5;
const SHAFT_NECK = 0.73;

/** Half-width across the flats of the hexagonal core at height `y`. */
const shaftHalf = (y: number): number =>
  SHAFT_FOOT + ((SHAFT_NECK - SHAFT_FOOT) * y) / SHAFT_TOP;

// --- the buttress wings: a triangular frustum on the same axis ---
/**
 * Apothems, so the corners reach twice these. The wing is swallowed where
 * `2 * apothem(y) = shaftHalf(y)`, y = 43.0; the last unit above it is modelled
 * and buried, so the vanishing is a blend.
 */
const WING_FOOT = 2.35;
const WING_KNEE = 1.85;
const WING_HEAD = 0.83;
const WING_KNEE_Y = at(46);
const WING_TOP_Y = at(203);

// --- the ground works. Kept deliberately small: see "a mast, not a building". ---
const APRON_HALF = 4.2;
const APRON_TOP = at(2.3);
const BASE_HALF = 3.1;
const BASE_TOP = at(9.7);
const BASE_ROOF_HALF = 3.3;
const BASE_ROOF_TOP = at(10.8);

// --- the elevator slots ---
const SLOT_LOW_TOP = 50;
const SLOT_HIGH_TOP = 95;
const SLOT_LOW_THICK = 0.22;
const SLOT_HIGH_THICK = 0.13;

// --- the main pod, 333 m to 360.5 m ---
const POD_FOOT = at(333);
const POD_SKIRT_TOP = at(341.5);
const POD_SKIRT_FOOT_HALF = 1.25;
const POD_SKIRT_HEAD_HALF = 2.95;
/** `[top in metres, half-width, glazed]`, stacked from the skirt's top up. */
const POD_DECKS: Array<[number, number, boolean]> = [
  [345.3, 3.03, true], // Glass Floor and LookOut, 342-346 m
  [346.4, 3.25, false],
  [350.2, 2.99, true], // the revolving restaurant, 351 m
  [351.3, 3.31, false], // the widest thing on the pod
  [354.4, 2.95, true], // Sky Terrace, 356 m
  [355.9, 3.27, false], // the EdgeWalk ledge, standing proud
  [357.9, 2.68, false],
];
const POD_CAP_TOP = at(360.5);
const POD_CAP_HALF = 1.25;

// --- the upper pod, 441 m to 452 m, centred on the SkyPod's real 447 m ---
const SKYPOD_FOOT = at(439.5);
const SKYPOD_SKIRT_TOP = at(444);
const SKYPOD_SKIRT_FOOT_HALF = 0.8;
const SKYPOD_SKIRT_HEAD_HALF = 1.5;
const SKYPOD_DECKS: Array<[number, number, boolean]> = [
  [448.5, 1.58, true],
  [449.8, 1.65, false],
];
const SKYPOD_CAP_TOP = at(453);
const SKYPOD_CAP_HALF = 0.72;

// --- the antenna: 450 m to 553.33 m, one metre off the real 102 m mast ---
const MAST_STEP = at(503);
const MAST_COLLAR_TOP = at(504.4);
const MAST_FOOT_HALF = 0.58;
const MAST_STEP_HALF = 0.42;
const MAST_COLLAR_HALF = 0.5;
const MAST_UPPER_HALF = 0.3;
const MAST_TIP_HALF = 0.11;
const MAST_HIGH_COLLAR = 114.5;

const POD_SIDES = 16;
const APRON_SIDES = 12;

export const cnTower: Monument = {
  id: 'cn-tower',
  name: 'CN Tower',
  iso: 'CAN',
  lat: 43.643,
  lon: -79.387,
  realHeight: 553,
  tier: 'landmark',
  surface: 'concrete',
  surfaces: { steel: 'none', tan: 'stone' },
  footprint: 4.8,

  build(ctx) {
    const { THREE, palette, column, taper, strut, around } = ctx;
    const concrete = palette.blush;
    const apron = palette.tan;
    const glass = palette.steel;
    const mast = palette.white;

    const group = new THREE.Group();

    /** Stacks a drum on the running cursor and returns the new cursor. */
    const drum = (base: number, top: number, half: number, color: number) => {
      const mesh = column(half, top - base, color, POD_SIDES);
      mesh.position.y = base;
      group.add(mesh);
      return top;
    };

    // --- ground works ---
    group.add(column(APRON_HALF, APRON_TOP, apron, APRON_SIDES));
    const entrance = column(BASE_HALF, BASE_TOP - APRON_TOP, concrete, APRON_SIDES);
    entrance.position.y = APRON_TOP;
    group.add(entrance);
    const baseRoof = column(BASE_ROOF_HALF, BASE_ROOF_TOP - BASE_TOP, apron, APRON_SIDES);
    baseRoof.position.y = BASE_TOP;
    group.add(baseRoof);

    // --- the shaft. One mesh, ground to 450 m: see the note on joints. ---
    group.add(taper(SHAFT_FOOT, SHAFT_NECK, SHAFT_TOP, concrete, 6));

    // --- the buttress wings: two triangular frusta on the shaft's own axis ---
    group.add(taper(WING_FOOT, WING_KNEE, WING_KNEE_Y, concrete, 3));
    const wingUpper = taper(WING_KNEE, WING_HEAD, WING_TOP_Y - WING_KNEE_Y, concrete, 3);
    wingUpper.position.y = WING_KNEE_Y;
    group.add(wingUpper);

    // --- the elevator slots, on the three hexagon faces the wings do not use:
    //     `around` puts them at 0, 120 and 240 degrees, the wings' corners at 60,
    //     180 and 300. A strut is placed by its endpoints, so a centreline on the
    //     shaft's face buries half of it (a line, not a rib). They lean 1.04
    //     degrees (the shaft's batter), enough for `lookAt` to resolve a roll. ---
    group.add(
      around(3, () => {
        const slot = new THREE.Group();
        const face = (y: number) => new THREE.Vector3(0, y, shaftHalf(y));
        slot.add(strut(face(BASE_ROOF_TOP), face(SLOT_LOW_TOP), SLOT_LOW_THICK, glass));
        slot.add(strut(face(SLOT_LOW_TOP), face(SLOT_HIGH_TOP), SLOT_HIGH_THICK, glass));
        return slot;
      }),
    );

    // --- the main pod ---
    const skirt = taper(
      POD_SKIRT_FOOT_HALF,
      POD_SKIRT_HEAD_HALF,
      POD_SKIRT_TOP - POD_FOOT,
      concrete,
      POD_SIDES,
    );
    skirt.position.y = POD_FOOT;
    group.add(skirt);

    let cursor = POD_SKIRT_TOP;
    for (const [topMetres, half, glazed] of POD_DECKS) {
      cursor = drum(cursor, at(topMetres), half, glazed ? glass : concrete);
    }
    const podCap = taper(
      POD_DECKS[POD_DECKS.length - 1]![1],
      POD_CAP_HALF,
      POD_CAP_TOP - cursor,
      concrete,
      POD_SIDES,
    );
    podCap.position.y = cursor;
    group.add(podCap);

    // --- the upper pod ---
    const skypodSkirt = taper(
      SKYPOD_SKIRT_FOOT_HALF,
      SKYPOD_SKIRT_HEAD_HALF,
      SKYPOD_SKIRT_TOP - SKYPOD_FOOT,
      concrete,
      POD_SIDES,
    );
    skypodSkirt.position.y = SKYPOD_FOOT;
    group.add(skypodSkirt);

    cursor = SKYPOD_SKIRT_TOP;
    for (const [topMetres, half, glazed] of SKYPOD_DECKS) {
      cursor = drum(cursor, at(topMetres), half, glazed ? glass : concrete);
    }
    const skypodCap = taper(
      SKYPOD_DECKS[SKYPOD_DECKS.length - 1]![1] - 0.06,
      SKYPOD_CAP_HALF,
      SKYPOD_CAP_TOP - cursor,
      concrete,
      POD_SIDES,
    );
    skypodCap.position.y = cursor;
    group.add(skypodCap);

    // --- the antenna ---
    const lower = taper(MAST_FOOT_HALF, MAST_STEP_HALF, MAST_STEP - SHAFT_TOP, mast, 6);
    lower.position.y = SHAFT_TOP;
    group.add(lower);

    const collar = column(MAST_COLLAR_HALF, MAST_COLLAR_TOP - MAST_STEP, glass, 6);
    collar.position.y = MAST_STEP;
    group.add(collar);

    const upper = taper(MAST_UPPER_HALF, MAST_TIP_HALF, TOP - MAST_COLLAR_TOP, mast, 6);
    upper.position.y = MAST_COLLAR_TOP;
    group.add(upper);

    const highCollar = column(0.24, 0.22, glass, 6);
    highCollar.position.y = MAST_HIGH_COLLAR;
    group.add(highCollar);

    return group;
  },
};
