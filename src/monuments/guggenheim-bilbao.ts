import type { Group, Monument } from './contract.ts';
import { PROUD } from './contract.ts';

/**
 * Guggenheim Bilbao.
 *
 * Four things have to survive at thumbnail size, and the order matters because
 * the last two are what stop the first two reading as a landslide:
 *
 * - **A crumple of titanium plates leaning at different angles**, catching the
 *   light at different values. It is the *disorder* that names this building —
 *   no two volumes alike, none aligned with any other, nothing repeated.
 * - **A tall centre.** The atrium rises clear of everything else; here it is the
 *   one plate that reaches 38.6 of the tier's 40 while its neighbours stop
 *   between 19 and 32.
 * - **Plain limestone boxes underneath and beside the metal**, orthogonal, with
 *   level tops. This is the building's one legible rule — soft against hard,
 *   silver against warm stone — and it is also the thing that stops the metal
 *   reading as geology. See the long note below; it cost more iterations than
 *   anything else in this file.
 * - **A long low wing running east under a bridge**, with the limestone tower on
 *   the far side of it.
 *
 * ## Which way is the front
 *
 * +Z is the Nervión. The museum was built on the river's south bank to be read
 * from the water and from the Puente de La Salve, and that is the view every
 * photograph takes: the long axis runs along X, the flower shows its profile,
 * the bridge crosses at the right-hand end. The river is in the model — see
 * "the water" below.
 *
 * ## The reduction, and the four attempts that failed first
 *
 * A *plate* is a chain of tapers: each block leans a little further than the one
 * below it, yaws a little further, and changes width, so the chain sweeps a
 * curve. That is the Sydney Opera House's shell, and it is the only way this
 * toolkit makes a curved surface. What is new here is the **section**: the
 * blocks are scaled to about 5:1 across the lean (`wide` ~1.8) against it
 * (`deep` ~0.32), so each chain comes out as a broad thin *sheet* that curls,
 * rather than a solid wedge.
 *
 * That one number is the whole difference between this file and four discarded
 * versions of it, all of which read as a rock pile rather than a building:
 *
 * - **Fat chains** (`deep` ~0.9, bulging widths): boulders. A tapering mass that
 *   is round in plan is what a rock is; ten of them is scree.
 * - **Big flat facets** (4 and 5 sides, 2-3 segments): the faces became properly
 *   architectural and the silhouette became a heap of sugar cubes. Cubism, not
 *   Gehry.
 * - **Flaring petals** (widest at the top, cut flat): correctly anti-rock —
 *   rocks taper upward and these do not — but with few segments it is a stack of
 *   crates.
 * - **Horizontal-dominant massing** (most volumes lying down): the real
 *   building does sprawl, but volumes lying behind other volumes are invisible
 *   from a camera 13 degrees above the ground. Only the silhouette and the front
 *   row are ever seen. That is why the plates below are laid out as a *row along
 *   X* at staggered heights rather than as a cluster in depth.
 *
 * **The segment count went the opposite way to intuition.** Coarse chains of
 * three blocks were tried in order to reduce the ink — `OutlineEffect` draws a
 * line at every joint — and they made things worse: three hard steps read as a
 * broken rock, where six fine ones read as *panel courses on a clad surface*.
 * Sydney's shells are eight blocks each and that is exactly why they look made.
 * Regularity inside each volume, disorder in how the volumes are arranged: that
 * is the split this building needs, and it is the opposite of the split the
 * Opera House needs.
 *
 * ## The palette does half the work
 *
 * Every version with warm-white metal on warm-sand stone read as one beige mass.
 * The split that fixed it is value plus hue, and each colour has one job:
 *
 * - `white` and `bone` are the titanium — one bright, one a neutral grey for the
 *   volumes that should fall back. Two metals rather than one because adjacent
 *   panels on the real building genuinely read at different values, and because
 *   a single tone across thirteen plates flattens the crumple.
 * - `sand` is the limestone: warm, light, and clearly a different material from
 *   the neutral metal even where the two are close in value.
 * - `tan` is the coping course that caps every stone block. **One level ink line
 *   across a building is worth more than any amount of modelling below it** —
 *   the copings are six meshes and they are what makes the boxes read as
 *   parapets instead of as more lumps.
 * - `bark` is the glazing. The contract's rule that recesses want a *warm* entry
 *   is why it is `bark` and not `slate`: a cool neutral in a slot comes back as
 *   a hole rather than a dark plane, and the glass here has to read as surface.
 * - `brown` is the plaza and the bridge — concrete, a step darker than the
 *   limestone so the building sits on something rather than dissolving into it.
 * - `steel` is the water, for the Golden Temple's reason exactly: this is a
 *   value composition before it is a colour one, and the river has to supply
 *   the dark that the metal is bright against. `skyBlue` would put the river at
 *   nearly the metal's own value.
 *
 * ## The water
 *
 * It is in, at one mesh, and it is stated rather than shown: three level steps
 * down — plaza at 3.2, riverside terrace at 2.2, water at 0.9 — so the ink draws
 * two lines before the dark plate, and one metal volume lies down *into* it at
 * the front. From the fixed cameras (7 and 13 degrees above the horizon) a
 * 9-unit band of water projects to a couple of units, which is a dark line under
 * the building rather than a lake. That is the correct amount: the Guggenheim is
 * a building on a river, not a building in one.
 *
 * ## What is distorted, and by how much
 *
 * - **The plan is squeezed about 1.7x against the height.** The museum is
 *   roughly 150 m long and 50 m tall, or 3:1; this model is 68 long and 38.6
 *   tall, or 1.76:1. It is not a taste decision — the `building` tier cannot
 *   hold the true proportion at all. At its maximum 55-unit footprint and its
 *   maximum 40-unit height the widest honest model is about 105 long, still only
 *   2.7:1, and a 55-unit footprint also frames the model smaller in a
 *   thumbnail, which costs exactly the thing that has to be legible. The axis that
 *   carries the least recognition here is the length: nobody names this building
 *   by how long it is.
 * - **The squeeze was paid back to the east wing.** Compressed evenly, the long
 *   gallery would have become a stub. It gets 26 of the model's 68 units — 38%
 *   where life gives it about a third — and the west galleries carry the loss
 *   instead, because they are the part of the building no photograph is of.
 * - **The metal is bigger than its share.** Thirteen plates fill the middle
 *   40 units where the real titanium is spread over most of the length, and the
 *   limestone is reduced to five blocks. At true proportions the crumple is a
 *   texture; here it has to be the subject.
 * - **The footprint is 37 rather than the tier's 55**, and the aspect check is
 *   nowhere near binding: half-diagonal over height is 0.95 against a limit of
 *   2. This monument is constrained by legibility, not by the cap.
 *
 * ## Traded away
 *
 * - **Buren's red arches over the bridge.** They were built, rendered, and cut:
 *   two red posts and a lintel at this scale read unmistakably as a *torii gate*
 *   and stole the card outright. The bridge is a plain dark deck on four slender
 *   piers, which is what the 1997 building stood under anyway.
 * - **The glass mullions, the panel joints, the entrance stair.** At 260 pixels
 *   the chain joints already lay as much line across each plate as the ink can
 *   carry.
 * - **Everything east of the tower.** The wing is cropped where the limestone
 *   tower stands; nothing continues past it.
 */

const rad = (degrees: number): number => (degrees * Math.PI) / 180;

// ---------------------------------------------------------------------------
// The site. Three level steps down to the river — see "the water" above.
// ---------------------------------------------------------------------------

const HALF_X = 33;
const QUAY = { top: 3.2, front: 3.4, back: -12 };
const TERRACE = { top: 2.2, front: 5.4 };
const WATER = { top: 0.9, front: 15 };

// ---------------------------------------------------------------------------
// The titanium
// ---------------------------------------------------------------------------

/**
 * One curling plate. Nothing in here is shared with anything else in the table:
 * the building has no repetition to exploit, so every row is hand-set and every
 * row differs from every other in at least four of these fields.
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
   * near 0.32 is the sheet; it is the single number this whole file turns on.
   */
  wide: number;
  deep: number;
  segments: number;
  sides: number;
  metal: 'bright' | 'dim';
}

/**
 * The plates, west to east, with the apex each one actually reaches.
 *
 * The first seven are the row that draws the silhouette, and their heights are
 * chosen as a shape rather than a list: 19, 26, 30, **38.6**, 24, 32, 20. It
 * rises to the atrium, drops fourteen units, throws up a second lower peak and
 * falls away east. A single peak in the middle is a mountain; two peaks with a
 * real trough between them is a collision, which is what this building is.
 */
const BLADES: Blade[] = [
  // The row. `az` is scattered on purpose: a plate leaning toward or away from
  // the camera moves its tip in Z, which changes how it is lit and what it
  // overlaps without disturbing the rhythm along X.
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

  // Two rooted high and thrown sideways, so they cross the row rather than
  // standing in it. Without a pair of plates going *across* the others this is a
  // bouquet, and a bouquet is symmetrical no matter how the stems are arranged.
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

  // The river face. Thicker in section than the row (`deep` 0.62 and 0.4): these
  // two are seen face-on from the fixed cameras, and a plate seen face-on
  // needs some body or it reads as a sheet of paper stood on its edge.
  {
    // apex 20.8 — sweeps down the front to the terrace. The most Gehry thing here.
    at: [-8, 4, 6], az: 26, tilt: [8, 46], curl: 28, len: 18,
    w: [4.4, 5.2, 2.5], peak: 0.3, wide: 1.5, deep: 0.62, segments: 5, sides: 7, metal: 'bright',
  },
  {
    // The hull: lies down along the bank with its foot at 0.7, inside the water.
    // Things behaving as though the water were there is the strongest evidence
    // for it in a still drawing.
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
    // Each plate overlaps the step in front of it by 0.3 so no two faces are
    // coplanar and the ink lands exactly on the change of level.
    // `PROUD` short of the site's ends, which the terrace's ends are cut to:
    // flush, the two ends shared a plane and flickered where they overlap.
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
    // Four slender piers rather than two solid ones: the wing has to be visibly
    // passing underneath, and a pier as deep as the deck closes that gap up.
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

        // Two nested groups per joint rather than one Euler: yaw first, then
        // lean, so `curl` turns the *direction* the plate leans in. Written as a
        // single rotation the two axes fight over the Euler order and the sign
        // of `curl` stops meaning anything.
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

        // The scale goes on the mesh, not on the chain, so the flat face follows
        // each block's own frame however far the chain has curled by then. A
        // scale on the root would shear every block above the first.
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
