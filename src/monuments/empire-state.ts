import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Empire State Building.
 *
 * What must survive to a thumbnail:
 * - The stepped setbacks: a five-storey base filling the block, then four
 *   setbacks before the shaft (the 1916 zoning envelope). Nearly all the stepping
 *   is on the long axis: half-widths 15.3, 12.9, 10.2, 8.1, 6.15 across the front
 *   against only 7.2 to 5.1 through the depth.
 * - The vertical ribs: dark window strips with limestone piers between them,
 *   base course to crown. A tower reads tall because it is striped, not because
 *   it is thin. Four strips a face give nine bands of about 4 pixels each (three
 *   would be a fence, five grey).
 * - The crown: four tight tiers receding to the 86th-floor deck, each with its
 *   own cornice.
 * - The mooring mast (a ribbed cone with a lantern) and the antenna, together a
 *   quarter of the height.
 *
 * Tier `tower`: the Statue of Liberty is 20.7 units away (footprint 24, this 18),
 * so at `landmark` the block would eat the statue; at 70 against 70 they read
 * as one skyline.
 *
 * Aspect is 0.29 at true proportions, so the plan goes out 1.5x instead (30.6 x
 * 14.4, aspect 0.50) so the ribs stay separable (a true shaft face of 8.2 units
 * carries about six bands, 12.3 carries nine). The base is stretched 2.7x
 * (8.35 units, 12% of the height) to read as a storeyed building.
 *
 * The front is the 34th Street elevation, the long 129.5 m face, on +Z, since
 * every setback is on that axis; a doorway at its centre gives scale. The tower
 * is centred on the block.
 *
 * Simplified: no window strips on the side faces of the two upper tiers (the
 * mast's eight ribs buy more), every opening rectangular, and the mooring mast
 * one ribbed cone.
 */

// --- elevation, in tier units. The antenna tip stops just under the ceiling. ---
const GRANITE_TOP = 1.5;
const SHAFT_BASE = 20.0;
const SHAFT_TOP = 44.4;
const C4_BASE = 49.7;
const C4_TOP = 50.7;
const DECK_TOP = 51.3;
const DRUM_TOP = 53.6;
const MAST_RIB_TOP = 58.0;
const MAST_SHAFT_TOP = 58.4;
const LANTERN_TOP = 60.3;
const MAST_TOP = 61.2;
const ANTENNA_TOP = 69.6;

// --- plan: half-widths across the flats, X across the front, Z through the depth ---
const SHAFT_X = 6.15;
const SHAFT_Z = 5.1;

/** How far a setback cornice oversails the mass it caps. Its ink line is the step. */
const LEDGE_OUT = 0.5;

/**
 * How far a dark strip stands out of the wall it is set into. A recess this
 * shallow is invisible under a cel ramp; a proud strip gets its own outline.
 */
const STRIP_OUT = 0.28;

/**
 * The zoning envelope, bottom to top: the mass runs `base` to `top` at
 * half-widths `x` by `z`, then its cornice runs `top` to `ledge` half a unit
 * proud all round in the lighter stone.
 *
 * `front` and `side` are the window strips, listed as non-negative offsets and
 * mirrored (0 is the centre bay and is not doubled). Each entry is one mesh: a
 * beam driven through the mass, surfacing on both opposite faces.
 */
const SETBACKS = [
  // The five-storey base, on the whole block. No centre bay: the doorway is there.
  { base: GRANITE_TOP, top: 7.6, x: 15.3, z: 7.2, ledge: 8.35, front: [5.3, 10.6], side: [0, 3.2] },
  { base: 8.35, top: 12.1, x: 12.9, z: 6.9, ledge: 12.8, front: [0, 4.3, 8.6], side: [0, 3.2] },
  { base: 12.8, top: 15.9, x: 10.2, z: 6.2, ledge: 16.6, front: [0, 3.5, 7.0], side: [] },
  { base: 16.6, top: 19.3, x: 8.1, z: 5.6, ledge: 20.0, front: [0, 2.7, 5.4], side: [] },
];

const SETBACK_STRIP = 1.3;

/**
 * The crown, floors 81 to 85: four tiers stepping in 0.75 a side across the front
 * and 0.55 through the depth. Each tier caps at `capTop`, and every cap is
 * narrower than the one below it (a crown that widens again reads as a hat).
 */
const CROWN = [
  { base: SHAFT_TOP, top: 46.0, x: 5.55, z: 4.75, capTop: 46.4 },
  { base: 46.4, top: 47.7, x: 4.8, z: 4.2, capTop: 48.1 },
  { base: 48.1, top: 49.3, x: 4.05, z: 3.65, capTop: 49.7 },
];
const CROWN_CAP_OUT = 0.35;

/** Non-negative offsets, mirrored about the axis; a 0 stays single. */
const mirrored = (offsets: number[]): number[] =>
  offsets.flatMap((offset) => (offset === 0 ? [0] : [offset, -offset]));

export const empireState: Monument = {
  id: 'empire-state',
  name: 'Empire State Building',
  iso: 'USA',
  lat: 40.748,
  lon: -73.986,
  realHeight: 443,
  tier: 'tower',
  footprint: 18,

  build(ctx) {
    const { THREE, palette, box, column, taper, strut, around } = ctx;
    // Indiana limestone: pale, faintly cool, and deliberately not the `sand`
    // that half the world's stone buildings will be painted in.
    const stone = palette.bone;
    // Windows, spandrels and the granite at the pavement, all one dark.
    const dark = palette.steel;
    // Warmer and a shade lighter than the walls: the sunlit top of every
    // cornice, and the aluminium of the mast.
    const trim = palette.sand;
    const gilt = palette.gold;

    const group = new THREE.Group();

    /** A rectangular course, placed by the heights it starts and stops at. */
    const slab = (base: number, top: number, x: number, z: number, color: number): void => {
      const mesh = box(x * 2, top - base, z * 2, color);
      mesh.position.y = base;
      group.add(mesh);
    };

    /** A window strip driven through the depth: one mesh, front face and back. */
    const acrossFront = (
      base: number,
      top: number,
      x: number,
      halfZ: number,
      width: number,
    ): void => {
      const strip = box(width, top - base, halfZ * 2 + STRIP_OUT * 2, dark);
      strip.position.set(x, base, 0);
      group.add(strip);
    };

    /** The same beam turned through a right angle: one mesh, both side faces. */
    const alongSide = (
      base: number,
      top: number,
      z: number,
      halfX: number,
      depth: number,
    ): void => {
      const strip = box(halfX * 2 + STRIP_OUT * 2, top - base, depth, dark);
      strip.position.set(0, base, z);
      group.add(strip);
    };

    // --- the granite course at the pavement, proud of the limestone above it ---
    slab(0, GRANITE_TOP, 15.6, 7.5, dark);

    // --- base and setbacks ---
    for (const step of SETBACKS) {
      slab(step.base, step.top, step.x, step.z, stone);
      slab(step.top, step.ledge, step.x + LEDGE_OUT, step.z + LEDGE_OUT, trim);

      for (const x of mirrored(step.front)) {
        acrossFront(step.base, step.top, x, step.z, SETBACK_STRIP);
      }
      for (const z of mirrored(step.side)) {
        alongSide(step.base, step.top, z, step.x, SETBACK_STRIP);
      }
    }

    // --- the doorway, and the one place a warm metal belongs down here ---
    // It also marks the front for the only check the validator cannot make.
    const portal = box(4.6, 4.6, 0.7, dark);
    portal.position.set(0, 0.4, 7.3);
    group.add(portal);

    const lintel = box(5.8, 0.75, 0.6, gilt);
    lintel.position.set(0, 5.0, 7.35);
    group.add(lintel);

    // --- the shaft: twenty-four units of it, and all of them striped ---
    slab(SHAFT_BASE, SHAFT_TOP, SHAFT_X, SHAFT_Z, stone);

    // Four strips a face, so the front reads corner pier / slot / pier / slot /
    // wide centre pier / slot / pier / slot / corner pier. They stop `PROUD` under
    // the shaft's top, or their tops would share a plane with the stone's.
    const stripTop = SHAFT_TOP - PROUD;
    for (const x of mirrored([1.45, 3.95])) {
      acrossFront(SHAFT_BASE, stripTop, x, SHAFT_Z, 1.15);
    }
    for (const z of mirrored([0, 2.85])) {
      alongSide(SHAFT_BASE, stripTop, z, SHAFT_X, 1.2);
    }

    // The corner piers stand proud of both faces they meet, giving four unbroken
    // ink lines up the shaft. They stop at the crown.
    for (const x of [1, -1]) {
      for (const z of [1, -1]) {
        const pier = box(1.7, SHAFT_TOP - SHAFT_BASE, 1.7, stone);
        pier.position.set(x * (SHAFT_X - 0.55), SHAFT_BASE, z * (SHAFT_Z - 0.55));
        group.add(pier);
      }
    }

    // --- the crown ---
    for (const tier of CROWN) {
      slab(tier.base, tier.top, tier.x, tier.z, stone);
      slab(tier.top, tier.capTop, tier.x + CROWN_CAP_OUT, tier.z + CROWN_CAP_OUT, trim);
    }
    slab(C4_BASE, C4_TOP, 3.3, 3.1, stone);

    // The 86th-floor deck, the only gold above the doorway: one bright band where
    // the stone ends and the mast begins.
    slab(C4_TOP, DECK_TOP, 3.7, 3.5, gilt);

    // --- the mooring mast ---
    const drum = column(2.9, DRUM_TOP - DECK_TOP, trim, 8);
    drum.position.y = DECK_TOP;
    group.add(drum);

    const cone = taper(2.4, 1.6, MAST_SHAFT_TOP - DRUM_TOP, trim, 8);
    cone.position.y = DRUM_TOP;
    group.add(cone);

    // Eight ribs from the deck to just below the lantern, leaning with the cone
    // (hence `strut`s). `around(8)` lands one on each facet centre, since the
    // prism helpers put a flat on +Z.
    group.add(
      around(8, () =>
        strut(
          new THREE.Vector3(0, DECK_TOP, 3.0),
          new THREE.Vector3(0, MAST_RIB_TOP, 1.85),
          0.75,
          trim,
        ),
      ),
    );

    // One horizontal across the cone, so it is a mast and not a funnel.
    const collar = column(2.1, 0.5, stone, 8);
    collar.position.y = 55.9;
    group.add(collar);

    // The 102nd-floor lantern: glazed, so dark, and a shade wider than the cone
    // under it. A pale mast with one dark bead near the top is the read.
    const lantern = column(1.8, LANTERN_TOP - MAST_SHAFT_TOP, dark, 8);
    lantern.position.y = MAST_SHAFT_TOP;
    group.add(lantern);

    const cap = taper(1.8, 0.75, MAST_TOP - LANTERN_TOP, trim, 8);
    cap.position.y = LANTERN_TOP;
    group.add(cap);

    // --- the antenna: eight units of it, an eighth of the whole building ---
    const mast = column(0.62, 65.5 - MAST_TOP, dark, 6);
    mast.position.y = MAST_TOP;
    group.add(mast);

    // Two collars on the antenna (a bare 1.2-unit stick is a scratch on the sky).
    // The upper one stops `PROUD` short of the mast's top.
    for (const [y, radius] of [
      [63.0, 1.0],
      [65.0 - PROUD, 0.85],
    ] as const) {
      const ring = column(radius, 0.5, trim, 6);
      ring.position.y = y;
      group.add(ring);
    }

    const whip = taper(0.45, 0.12, ANTENNA_TOP - 65.5, dark, 4);
    whip.position.y = 65.5;
    group.add(whip);

    return group;
  },
};
