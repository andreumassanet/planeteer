import type { Monument } from './contract.ts';

/**
 * Burj Khalifa.
 *
 * A tapering spike passes every check in `validate` and is not this building —
 * it is any building. Three things are the Burj and everything in this file
 * serves one of them:
 *
 * - **The Y plan.** Three wings buttressing a hexagonal core. It is why the
 *   tower never reads as a box and why it looks like a different silhouette
 *   from every bearing: from the front you get one wing end-on as a narrow
 *   spine with two more splaying away behind it, and the mass is triangular
 *   rather than rectangular all the way up.
 * - **The spiral of setbacks.** The wings do not step back together. Each
 *   setback shortens **one** wing, and the next one goes to the next wing, so
 *   the steps wind up around the tower and the left and right edges of the
 *   silhouette are notched at *different* heights. That asymmetry is the whole
 *   trick — a tower whose two edges step together is a wedding cake, and a
 *   smooth taper is a cone. Every setback is capped with a dark `steel` ledge
 *   overhanging by 0.15, because at thumbnail size the shoulder is carried by
 *   the ink line, not by the 1.5-unit step itself.
 * - **The spire.** 20 units of the 120, a sixth, in three lengths that go
 *   2.05 -> 1.05 -> 0.45 -> 0.10 half-width. Above the last wing the shaft is
 *   already bare for 12 units, so a third of the model is needle. That is the
 *   proportion that holds the record and it is the first thing an honest
 *   silhouette has to give up room for.
 *
 * Traded away, and why:
 *
 * - **Six setbacks per wing, not nine — 18 in total against the real 27.** This
 *   is the one number worth arguing about. The wings have 10.3 units of reach
 *   to give away between the ground and the crown. Spread over 27 steps that is
 *   0.38 units each: at the size a `landmark` is actually read from, under a
 *   pixel, and the silhouette comes back as a smooth cone with some noise on
 *   it. At 18 the steps average 1.7 units and the outline is visibly serrated,
 *   which is what the setbacks are *for*. Fewer than 18 and the spiral stops
 *   reading as a spiral, because you need several turns of it.
 * - **The wing tips are octagonal, not round.** Eight sides is the cheapest
 *   count that keeps the nose exactly `half` wide (any multiple of four does;
 *   ten does not), so the wing's flanks and its tip line up to the unit.
 * - **It is stockier than life.** The real tower is 828 m over about 156 m
 *   across the wing tips, 5.3:1. This one is 120 over 27.6, 4.4:1. The
 *   slenderness is part of the building, so it is only stretched by 20%, but
 *   at a true 5.3 the setbacks lose a quarter of their depth and go under the
 *   ink line.
 * - **No curtain-wall mullions except a raised rib down each wing flank on the
 *   bottom four tiers.** The vertical fluting is real and it is invisible past
 *   about thirty units; the ribs are there for the walk-up, not the thumbnail.
 * - **The podium is a round plaza with three arms**, not the actual mall and
 *   lake. It is also load-bearing for the contract: the Y is lopsided in z (one
 *   wing forward, two back), and without a symmetric plate under it the model's
 *   bounding box sits 2.4 units off the Y axis and `validate` rejects it.
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
 * which is what leaves the base tier tall (22-32 units, staggered per wing) and
 * the upper ones an even ~10.
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
 * Height of wing `wing`'s `tier`-th setback.
 *
 * The three wings share one ladder offset by a third of a rung, so the global
 * order of the 18 setbacks going up is wing 0, 1, 2, 0, 1, 2, ... — the spiral.
 * The last rung lands exactly on `WING_TOP`, and only wing 2 gets there: the
 * three wings die off at 81.6, 84.8 and 88, which is what makes the crown lean.
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

    // --- the buttressed core, one taper the whole way up. Buried in the wings
    //     for the first sixty units and the only thing left by ninety. A
    //     hexagon rotated so a flat faces each wing, not a corner. ---
    group.add(taper(CORE_BOTTOM, CORE_TOP, SHAFT_TOP, glass, 6));

    // --- the three wings ---
    group.add(
      around(WINGS, (wing) => {
        const arm = new THREE.Group();

        // The podium's arm, level with the podium block, turning the round
        // plaza into a Y before the tower even starts.
        const flare = halfAt(0) + ARM_FLARE;
        const skirt = box(flare * 2, PODIUM_HEIGHT, ARM_REACH, podiumColor);
        skirt.position.set(0, PLAZA_HEIGHT, ARM_REACH / 2);
        arm.add(skirt);

        let base = 0;
        for (let tier = 0; tier < TIERS; tier++) {
          const top = setback(wing, tier);
          const height = top - base;
          // The tier keeps the width it had at its own base and gives it up all
          // at once at the ledge. Stepped, never tapered: a tapered wing is a
          // cone with a Y section and loses the shoulders.
          const half = halfAt(base);
          const reach = reachAt(base);
          const depth = reach - half;

          const shaft = box(half * 2, height, depth, glass);
          shaft.position.set(0, base, depth / 2);
          arm.add(shaft);

          const nose = column(half, height, glass, NOSE_SIDES);
          nose.position.set(0, base, depth);
          arm.add(nose);

          if (tier < RIBBED_TIERS) {
            for (const side of [-1, 1]) {
              const rib = box(RIB, height, depth * 0.94, trim);
              rib.position.set(side * (half + RIB_PROUD - RIB / 2), base, depth / 2);
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
