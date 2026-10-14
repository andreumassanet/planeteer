import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Burj Khalifa.
 *
 * Three things make it the Burj and not any tapering spike:
 * - The Y plan: three wings buttressing a hexagonal core (a flat faces each
 *   wing), so the silhouette changes from every bearing.
 * - The spiral of setbacks: each setback shortens one wing and the next goes to
 *   the next wing, so the two edges of the silhouette notch at different
 *   heights. Each is capped with a dark `steel` ledge overhanging by 0.15.
 * - The spire: 20 of the 120 units, in three lengths (half-width
 *   2.05, 1.05, 0.45, 0.10), above a shaft already bare for 12 units.
 *
 * Simplified: six setbacks per wing (18, not the real 27), because 27 steps of
 * 0.38 units fall under a pixel and give a smooth cone; octagonal wing tips (the
 * cheapest count that keeps the nose exactly `half` wide); stockier than life
 * (4.4:1 against 5.3:1, or the setbacks lose a quarter of their depth); raised
 * ribs on the wing flanks of the bottom four tiers only. The podium is a round
 * plaza with three arms; the plate is symmetric because the Y is lopsided in z
 * (one wing forward, two back) and the bounding box would sit 2.4 units off the
 * axis.
 */

// --- elevation ---
/** Top of the tallest wing. Above this the shaft is bare. */
const WING_TOP = 88;
/** Where the concrete shaft ends and the spire begins. */
const SHAFT_TOP = 100;
const TOP = 120;

// --- the spiral ---
const WINGS = 3;
const TIERS = 6;
/** Fraction of a setback interval each wing lags the one before it. */
const STAGGER = 1 / WINGS;
/**
 * Bends the ladder of setback heights. Below 1 the steps crowd towards the top,
 * leaving the base tier tall (22-32 units, staggered per wing) and the upper
 * ones an even ~10.
 */
const CURVE = 0.72;

// --- the wings, in half-widths across the flats ---
/** Reach from the axis to the wing tip at the ground. */
const TIP = 13.6;
/** The reach the taper decays towards, never quite reached. */
const REACH_MIN = 3.3;
const HALF_MAX = 3.3;
const HALF_MIN = 1.35;
/** Multiple of four, so the octagonal nose is exactly `half` wide and `half` deep. */
const NOSE_SIDES = 8;

// --- the setback ledges ---
const LEDGE = 0.15;
const LEDGE_HEIGHT = 0.7;

// --- the flank ribs ---
const RIB = 0.3;
const RIB_PROUD = 0.14;
const RIBBED_TIERS = 4;

// --- the core ---
const CORE_BOTTOM = 3.2;
const CORE_TOP = 2.0;

// --- the podium ---
const PLAZA_RADIUS = 13.9;
const PLAZA_HEIGHT = 1.3;
const PODIUM_RADIUS = 10.3;
const PODIUM_HEIGHT = 2.1;
const ARM_REACH = 12.2;
const ARM_FLARE = 1.3;

/**
 * Height of wing `wing`'s `tier`-th setback. The wings share one ladder offset by
 * a third of a rung, so the order going up is wing 0, 1, 2, 0, 1, 2... The last
 * rung lands on `WING_TOP` and only wing 2 reaches it: the wings end at 81.6,
 * 84.8 and 88, which makes the crown lean.
 */
function setback(wing: number, tier: number): number {
  const rungs = TIERS + (WINGS - 1) * STAGGER;
  return WING_TOP * Math.pow((tier + 1 + wing * STAGGER) / rungs, CURVE);
}

/** How far a wing reaches from the axis at height `y`. */
function reachAt(y: number): number {
  return REACH_MIN + (TIP - REACH_MIN) * Math.pow(1 - y / WING_TOP, 1.15);
}

/** Half-width of a wing at height `y`. Narrows more slowly than the reach shortens. */
function halfAt(y: number): number {
  return HALF_MIN + (HALF_MAX - HALF_MIN) * Math.pow(1 - y / WING_TOP, 0.8);
}

export const burjKhalifa: Monument = {
  id: 'burj-khalifa',
  name: 'Burj Khalifa',
  iso: 'ARE',
  lat: 25.197,
  lon: 55.274,
  realHeight: 828,
  tier: 'landmark',
  footprint: 14.5,

  build(ctx) {
    const { THREE, palette, box, column, taper, around } = ctx;
    const glass = palette.bone;
    const ledgeColor = palette.steel;
    const trim = palette.slate;
    const plazaColor = palette.sand;
    const podiumColor = palette.tan;

    const group = new THREE.Group();

    // --- the plaza. Round on purpose: see the note at the top of the file. ---
    group.add(column(PLAZA_RADIUS, PLAZA_HEIGHT, plazaColor, 12));
    const podium = column(PODIUM_RADIUS, PODIUM_HEIGHT, podiumColor, 12);
    podium.position.y = PLAZA_HEIGHT;
    group.add(podium);

    // --- the buttressed core, one taper the whole way up, buried in the wings
    //     for the first sixty units. A hexagon rotated so a flat faces each wing. ---
    group.add(taper(CORE_BOTTOM, CORE_TOP, SHAFT_TOP, glass, 6));

    // --- the three wings ---
    group.add(
      around(WINGS, (wing) => {
        const arm = new THREE.Group();

        // The podium's arm, level with the podium block.
        const flare = halfAt(0) + ARM_FLARE;
        const skirt = box(flare * 2, PODIUM_HEIGHT, ARM_REACH, podiumColor);
        skirt.position.set(0, PLAZA_HEIGHT, ARM_REACH / 2);
        arm.add(skirt);

        let base = 0;
        for (let tier = 0; tier < TIERS; tier++) {
          const top = setback(wing, tier);
          // The tier keeps its base width and gives it up at the ledge: stepped,
          // never tapered.
          const half = halfAt(base);
          const reach = reachAt(base);
          const depth = reach - half;
          // Every tier over the first starts `PROUD` up inside the ledge below it,
          // and its back end runs `PROUD` past the axis, so no faces are coplanar.
          const foot = tier === 0 ? base : base + PROUD;
          const rise = top - foot;

          const shaft = box(half * 2, rise, depth + PROUD, glass);
          shaft.position.set(0, foot, (depth - PROUD) / 2);
          arm.add(shaft);

          const nose = column(half, rise, glass, NOSE_SIDES);
          nose.position.set(0, foot, depth);
          arm.add(nose);

          if (tier < RIBBED_TIERS) {
            for (const side of [-1, 1]) {
              const rib = box(RIB, rise, depth * 0.94, trim);
              rib.position.set(side * (half + RIB_PROUD - RIB / 2), foot, depth / 2);
              arm.add(rib);
            }
          }

          // The ledge: the same plan grown by `LEDGE` all round, sitting on top
          // of the setback so it overhangs the narrower tier above it.
          const ledgeHalf = half + LEDGE;
          const ledgeShaft = box(ledgeHalf * 2, LEDGE_HEIGHT, depth, ledgeColor);
          ledgeShaft.position.set(0, top, depth / 2);
          arm.add(ledgeShaft);

          const ledgeNose = column(ledgeHalf, LEDGE_HEIGHT, ledgeColor, NOSE_SIDES);
          ledgeNose.position.set(0, top, depth);
          arm.add(ledgeNose);

          base = top;
        }

        return arm;
      }),
    );

    // --- the crown: three drums between the last wing and the spire, so the
    //     shaft keeps stepping after the wings have run out ---
    const crown: Array<[radius: number, height: number, color: number]> = [
      [2.85, 4.1, trim],
      [2.45, 3.8, glass],
      [2.1, 3.4, trim],
    ];
    let crownBase = WING_TOP + LEDGE_HEIGHT;
    for (const [radius, height, color] of crown) {
      const drum = column(radius, height, color, 6);
      drum.position.y = crownBase;
      group.add(drum);
      crownBase += height;
    }

    // --- the spire: 20 units, a sixth of the model, in three lengths ---
    const mast = taper(2.05, 1.05, 8, ledgeColor, 6);
    mast.position.y = SHAFT_TOP;
    group.add(mast);

    const upper = taper(1.05, 0.45, 7, ledgeColor, 6);
    upper.position.y = SHAFT_TOP + 8;
    group.add(upper);

    const needle = taper(0.45, 0.1, TOP - (SHAFT_TOP + 15), ledgeColor, 4);
    needle.position.y = SHAFT_TOP + 15;
    group.add(needle);

    return group;
  },
};
