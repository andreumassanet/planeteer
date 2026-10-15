import type { Group, Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Guggenheim Bilbao.
 *
 * What must survive at thumbnail size:
 * - A crumple of titanium plates leaning at different angles and catching the
 *   light at different values; no two volumes alike or aligned.
 * - A tall centre: the atrium is the one plate reaching 38.6 of the tier's 40
 *   while its neighbours stop between 19 and 32.
 * - Plain limestone boxes under and beside the metal, orthogonal with level tops
 *   (soft against hard, silver against warm stone), which stops the metal reading
 *   as geology.
 * - A long low wing running east under a bridge, with the limestone tower beyond.
 *
 * +Z is the Nervión: the museum is read from the water and the Puente de La Salve,
 * the long axis along X, the bridge at the right-hand end.
 *
 * A plate is a chain of tapers, each leaning, yawing and changing width a little
 * more than the one below (as for the Sydney Opera House's shells). The blocks
 * are scaled about 5:1 across the lean (`wide` ~1.8 against `deep` ~0.32) so each
 * chain is a broad thin sheet that curls; fat chains (`deep` ~0.9) are boulders,
 * big flat facets (4-5 sides) are sugar cubes, flaring petals are crates, and
 * mostly horizontal massing hides volumes behind each other from 13 degrees, so
 * the plates are a row along X at staggered heights. Six fine segments read as
 * panel courses where three read as a broken rock: regularity inside each volume,
 * disorder in their arrangement.
 *
 * Palette: `white` and `bone` are two titanium values (a single tone flattens the
 * crumple); `sand` limestone; `tan` the coping on every stone block (one level ink
 * line across the building, six meshes); `bark` the glazing (a warm entry, since a
 * cool neutral in a slot reads as a hole); `brown` plaza and bridge, a step darker
 * than the limestone; `steel` the river, which supplies the dark the metal is
 * bright against (as at the Golden Temple).
 *
 * The water is one mesh, stated rather than shown: plaza at 3.2, riverside terrace
 * at 2.2, water at 0.9, so the ink draws two lines before the dark plate, and one
 * metal volume lies down into it at the front. From the fixed cameras a 9-unit
 * band projects to a couple of units.
 *
 * Distortions: the plan is squeezed about 1.7x against the height (68 long by 38.6
 * tall, 1.76:1 against 3:1; even 105 long at the tier maximum is only 2.7:1, and a
 * wider footprint frames the model smaller). The east wing gets 26 of 68 units
 * (38% against about a third) and the west galleries carry the loss. Thirteen
 * plates fill the middle 40 units and the limestone is five blocks. Footprint 37;
 * half-diagonal over height is 0.95, so legibility, not the cap, is the limit.
 *
 * Left out: Buren's red arches (two posts and a lintel read as a torii gate and
 * stole the card; the bridge is a plain dark deck on four slender piers), the
 * mullions, panel joints and entrance stair, and everything east of the tower.
 */

const rad = (degrees: number): number => (degrees * Math.PI) / 180;

// ---------------------------------------------------------------------------
// The site. Three level steps down to the river (see the header).
// ---------------------------------------------------------------------------

const HALF_X = 33;
const QUAY = { top: 3.2, front: 3.4, back: -12 };
const TERRACE = { top: 2.2, front: 5.4 };
const WATER = { top: 0.9, front: 15 };

// ---------------------------------------------------------------------------
// The titanium
// ---------------------------------------------------------------------------

/**
 * One curling plate. Nothing is shared with anything else in the table: every row is
 * hand-set and differs from every other in at least four of these fields.
 */
interface Blade {
  /** Where the chain is rooted, absolutely. Most are rooted inside a stone block. */
  at: [number, number, number];
  /** Which way it leans: degrees clockwise from +Z, so 0 leans at the river. */
  az: number;
  /** Lean from vertical at the foot and at the tip, degrees. Past 90 it droops. */
  tilt: [number, number];
  /** Total yaw accumulated up the chain — the sideways curl that makes it writhe. */
  curl: number;
  /** Length of the chain along its own spine. This is what sets the apex. */
  len: number;
  /** Half-width at the foot, at `peak`, and at the tip. */
  w: [number, number, number];
  /** Where along the chain the widest node sits, 0..1. */
  peak: number;
  /**
   * Section stretch across the lean and along it. `wide` near 1.8 against `deep`
   * near 0.32 is the sheet; the file turns on this number.
   */
  wide: number;
  deep: number;
  segments: number;
  sides: number;
  metal: 'bright' | 'dim';
}

/**
 * The plates, west to east, with the apex each one reaches. The first seven draw the
 * silhouette: 19, 26, 30, 38.6, 24, 32, 20, so it rises to the atrium, drops, throws
 * up a second lower peak and falls away east (one peak is a mountain; two with a
 * trough are a collision).
 */
const BLADES: Blade[] = [
  // The row. `az` is scattered on purpose: a plate leaning toward or away from the
  // camera moves its tip in Z, changing its lighting without disturbing the rhythm.
  {
    // apex 19.1 — the low shoulder against the west limestone
    at: [-23, 5, -2], az: -32, tilt: [6, 40], curl: 20, len: 15,
    w: [3.6, 4.2, 2.2], peak: 0.3, wide: 1.75, deep: 0.32, segments: 5, sides: 7, metal: 'dim',
  },
  {
    // apex 25.8 — leaning out over the river
    at: [-17.5, 4, -4], az: 20, tilt: [4, 36], curl: -22, len: 23,
    w: [4, 4.6, 2.3], peak: 0.3, wide: 1.85, deep: 0.3, segments: 6, sides: 7, metal: 'bright',
  },
  {
    // apex 30.4 — leaning back inland, so its lit face is the one turned away
    at: [-12, 4, -1], az: 155, tilt: [8, 44], curl: 26, len: 29,
    w: [4.2, 4.8, 2.4], peak: 0.3, wide: 1.8, deep: 0.34, segments: 6, sides: 7, metal: 'dim',
  },
  {
    // apex 38.6 — the atrium. Seven segments: the tallest plate gets the finest
    // courses, because it is the one surface large enough for them to read.
    at: [-6, 4, -3], az: 16, tilt: [4, 30], curl: -20, len: 36,
    w: [4.6, 5.4, 2.5], peak: 0.25, wide: 1.9, deep: 0.33, segments: 7, sides: 7, metal: 'bright',
  },
  {
    // apex 23.7 — the trough, and it leans backwards out of the way to keep it
    at: [0, 4, -5], az: -150, tilt: [10, 46], curl: 24, len: 22,
    w: [3.8, 4.4, 2.2], peak: 0.3, wide: 1.7, deep: 0.31, segments: 5, sides: 7, metal: 'dim',
  },
  {
    // apex 32.1 — the second peak
    at: [5, 4, -2], az: 34, tilt: [6, 38], curl: -26, len: 30,
    w: [4.2, 5, 2.4], peak: 0.3, wide: 1.85, deep: 0.32, segments: 6, sides: 7, metal: 'bright',
  },
  {
    // apex 20.0 — the fall toward the wing
    at: [10, 4, -4], az: 120, tilt: [12, 48], curl: 22, len: 18,
    w: [3.4, 4, 2.1], peak: 0.3, wide: 1.7, deep: 0.35, segments: 5, sides: 7, metal: 'dim',
  },

  // Two rooted high and thrown sideways, crossing the row (a bouquet is symmetrical
  // however the stems are arranged).
  {
    // apex 23.6, out to x = -26
    at: [-14, 8, -5], az: -108, tilt: [22, 62], curl: 30, len: 20,
    w: [3.4, 4.2, 2], peak: 0.3, wide: 1.75, deep: 0.3, segments: 5, sides: 7, metal: 'bright',
  },
  {
    // apex 24.1, thrown back over the inland side
    at: [2, 9, -6], az: 168, tilt: [18, 54], curl: -26, len: 18,
    w: [3.2, 4, 2], peak: 0.3, wide: 1.7, deep: 0.32, segments: 5, sides: 7, metal: 'dim',
  },

  // The step-down east: without these the metal stops dead and the wing looks
  // like a separate building parked next to it.
  {
    // apex 21.4
    at: [11, 6, -2], az: 44, tilt: [10, 46], curl: -24, len: 17,
    w: [3.4, 4, 2.1], peak: 0.3, wide: 1.7, deep: 0.33, segments: 5, sides: 7, metal: 'bright',
  },
  {
    // apex 16.3
    at: [16, 5, -3], az: -136, tilt: [16, 52], curl: 28, len: 13,
    w: [3, 3.6, 1.9], peak: 0.3, wide: 1.65, deep: 0.34, segments: 4, sides: 7, metal: 'dim',
  },

  // The river face. Thicker in section than the row (`deep` 0.62 and 0.4): seen face-on,
  // a plate needs some body or it reads as a sheet of paper on its edge.
  {
    // apex 20.8 — sweeps down the front to the terrace. The most Gehry thing here.
    at: [-8, 4, 6], az: 26, tilt: [8, 46], curl: 28, len: 18,
    w: [4.4, 5.2, 2.5], peak: 0.3, wide: 1.5, deep: 0.62, segments: 5, sides: 7, metal: 'bright',
  },
  {
    // The hull lies down along the bank with its foot at 0.7, inside the water.
    at: [-7, 3, 8.6], az: 96, tilt: [86, 102], curl: -10, len: 18,
    w: [2.4, 3, 2], peak: 0.35, wide: 2.1, deep: 0.4, segments: 4, sides: 7, metal: 'bright',
  },

  // The long east gallery: the same chain laid almost flat. `tilt` starting at
  // 79 and passing 90 is what makes it run out horizontally and then droop.
  {
    at: [5, 10, 0], az: 92, tilt: [79, 97], curl: 8, len: 24,
    w: [3.4, 4, 3.2], peak: 0.3, wide: 1.75, deep: 0.55, segments: 6, sides: 7, metal: 'bright',
  },
];

/** The limestone: width, height, depth, x, y, z. Level tops, no rotations, on purpose. */
const STONE: Array<[number, number, number, number, number, number]> = [
  [11, 14, 16, -29, QUAY.top, -2], //   the west galleries
  // Its foot `PROUD` up inside the coping below: at 17.2 its underside and
  // the coping's shared a plane, sand and tan, and flickered.
  [8, 5, 9, -31, 17.2 + PROUD, -4], //  their upper storey, set back
  [34, 7, 15, -5, QUAY.top, -2], //     the plinth the whole flower grows out of
  [26, 4, 12, 19, QUAY.top, -1], //     the wing's base
  [5, 16, 7, 31, QUAY.top, -4], //      the tower beyond the bridge
];

/** The glazing: same tuple. Two slots between blocks, one long band on the river face. */
const GLASS: Array<[number, number, number, number, number, number]> = [
  [30, 4.6, 2.2, -5, 3.8, 5],
  // `PROUD` shallower each side than the 15 it was: at that depth its ends lay
  // in the plane of the plinth's river and back faces and flickered.
  [2.6, 14, 15 - 2 * PROUD, -23, QUAY.top, -2],
  [2.6, 12, 13, 14, QUAY.top, -2],
];

const BRIDGE_X = 23;

/** How far each block reaches back past its joint, to close the notch on the outside of a bend. */
const LAP = 0.16;

export const guggenheimBilbao: Monument = {
  id: 'guggenheim-bilbao',
  name: 'Guggenheim Bilbao',
  iso: 'ESP',
  lat: 43.269,
  lon: -2.934,
  // No `realHeight`: the source list carries none, and the museum has no single
  // height to give — the atrium is about 50 m and nothing else comes near it.
  tier: 'building',
  surface: 'metal',
  surfaces: { sand: 'stone', tan: 'stone', brown: 'concrete', steel: 'none' },
  footprint: 37,

  build(ctx) {
    const { THREE, palette, box, taper } = ctx;
    const group = new THREE.Group();

    const metals = { bright: palette.white, dim: palette.bone };
    const stone = palette.sand;
    const coping = palette.tan;
    const concrete = palette.brown;
    /** Glazing and the shadow under the bridge deck. Warm, per the contract's note on recesses. */
    const dark = palette.bark;

    // --- the river ---------------------------------------------------------
    // Each plate overlaps the step in front of it by 0.3 so no faces are coplanar,
    // and stops `PROUD` short of the site's ends, which the terrace's ends are cut to.
    const water = box(HALF_X * 2 - 2 * PROUD, WATER.top, WATER.front - TERRACE.front + 0.3, palette.steel);
    water.position.z = (WATER.front + TERRACE.front - 0.3) / 2;
    group.add(water);

    const terrace = box(HALF_X * 2, TERRACE.top, TERRACE.front - QUAY.front, stone);
    terrace.position.z = (TERRACE.front + QUAY.front) / 2;
    group.add(terrace);

    const quay = box(HALF_X * 2, QUAY.top, QUAY.front - QUAY.back, concrete);
    quay.position.z = (QUAY.front + QUAY.back) / 2;
    group.add(quay);

    // --- the limestone -----------------------------------------------------
    for (const [w, h, d, x, y, z] of STONE) {
      const block = box(w, h, d, stone);
      block.position.set(x, y, z);
      group.add(block);

      const cap = box(w + 0.9, 0.6, d + 0.9, coping);
      cap.position.set(x, y + h, z);
      group.add(cap);
    }

    for (const [w, h, d, x, y, z] of GLASS) {
      const pane = box(w, h, d, dark);
      pane.position.set(x, y, z);
      group.add(pane);
    }

    // --- the bridge --------------------------------------------------------
    // Four slender piers rather than two solid ones, so the wing visibly passes under.
    const deck = box(7, 1.2, 27, concrete);
    deck.position.set(BRIDGE_X, 15, 0);
    group.add(deck);

    // `PROUD` narrower than the 5.6 the piers' outer faces reach: flush, those
    // faces and the soffit's sides were one plane in two colours.
    const soffit = box(5.6 - 2 * PROUD, 0.9, 25, dark);
    soffit.position.set(BRIDGE_X, 14.1, 0);
    group.add(soffit);

    for (const z of [-8, 8]) {
      for (const dx of [-2, 2]) {
        const pier = box(1.6, 11.1, 1.6, concrete);
        pier.position.set(BRIDGE_X + dx, QUAY.top, z);
        group.add(pier);
      }
    }

    // --- the plates --------------------------------------------------------

    const widthAt = (w: Blade['w'], peak: number, u: number): number =>
      u <= peak
        ? w[0] + (w[1] - w[0]) * (u / peak)
        : w[1] + (w[2] - w[1]) * ((u - peak) / (1 - peak));

    // No return annotation on the inner helper and no `THREE.Group` anywhere:
    // `ctx.THREE` is a value, so there is no namespace to write a type against.
    const blade = (spec: Blade): Group => {
      const root = new THREE.Group();
      root.position.set(spec.at[0], spec.at[1], spec.at[2]);
      root.rotation.y = rad(spec.az);

      const seg = spec.len / spec.segments;
      const dCurl = rad(spec.curl) / spec.segments;
      let node: Group = root;
      let previous = 0;

      for (let i = 0; i < spec.segments; i++) {
        const tilt = rad(
          spec.tilt[0] + (spec.tilt[1] - spec.tilt[0]) * (i / Math.max(1, spec.segments - 1)),
        );

        // Two nested groups per joint rather than one Euler: yaw first, then lean,
        // so `curl` turns the direction the plate leans in.
        const yaw = new THREE.Group();
        yaw.rotation.y = dCurl;
        node.add(yaw);

        const lean = new THREE.Group();
        lean.rotation.x = tilt - previous;
        previous = tilt;
        yaw.add(lean);

        const bottom = widthAt(spec.w, spec.peak, i / spec.segments);
        const top = widthAt(spec.w, spec.peak, (i + 1) / spec.segments);
        const lap = i === 0 ? 0 : bottom * LAP;
        // Widened by the same amount it is dropped, so the block still measures
        // `bottom` where the joint actually is.
        const foot = bottom + ((bottom - top) * lap) / seg;

        // The scale goes on the mesh, not the chain, so the flat face follows each
        // block's own frame (a root scale would shear every block above the first).
        const block = taper(foot, top, seg + lap, metals[spec.metal], spec.sides);
        block.position.y = -lap;
        block.scale.x = spec.wide;
        block.scale.z = spec.deep;
        lean.add(block);

        const next = new THREE.Group();
        next.position.y = seg;
        lean.add(next);
        node = next;
      }
      return root;
    };

    for (const spec of BLADES) group.add(blade(spec));

    return group;
  },
};
