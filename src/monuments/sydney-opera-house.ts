import type { Group, Mesh, Monument } from './contract.ts';

/**
 * Sydney Opera House.
 *
 * Three things carry it: a **broad low podium**, **cascades of white shells of
 * stepping height**, and **dark glass in the shells' mouths**. It is the
 * repetition and the stagger that read, never any one shell — a single sail on
 * its own is a tent, and sails without the podium are litter on a lawn.
 *
 * ## The plan, as it is on Bennelong Point
 *
 * `placement.ts` turns +Z north and +X west, and the building is laid out on
 * those axes as it lies: the long axis runs north up the point, the harbour on
 * three sides, the city to the south.
 *
 * - **Two halls side by side**, the Concert Hall to the west and the Joan
 *   Sutherland Theatre to the east, each under a set of four shells. In each
 *   set the tallest pair stand **back to back** over the stage — one opening
 *   south over the entrance foyer, one north — and two more step down to the
 *   north in front of it, nesting, so the set rises to a peak a third of the way
 *   along and falls away toward the water. That both-ways fan is the silhouette
 *   from the east or the west, and the old model, one cascade leaning one way,
 *   did not have it.
 * - **The Bennelong shells**, a small back-to-back pair on the south-west
 *   corner of the podium, the restaurant nearest Circular Quay.
 * - **The monumental steps**, thirty units wide across the south face, rising
 *   the full height of the podium from the forecourt.
 * - **The podium**, pink granite, its deck oversailing a dark course, on a
 *   paved apron drawn out to a point at the north: the Broadwalk round the tip
 *   of the headland.
 *
 * So from the harbour (the contact sheet's front view) every northern mouth
 * faces the camera with its glass, and from the north-west (its quarter view)
 * the Concert Hall shows its full profile — which is the view from Kirribilli,
 * the one on every postcard.
 *
 * ## A shell
 *
 * The toolkit has no curved surface, so a shell is a chain of eight blocks,
 * each leaning a little further than the one below and each narrower, hung off
 * the top of its predecessor. The lean pushes the spine forward while the taper
 * pulls the width in, and the two edges that fall out are the real shell's: the
 * back sweeps a long convex arc from the rear foot over to the tip, and the
 * mouth edge falls from the tip in a concave curve — receding to 0.22 of the
 * height at mid-height, then overhanging to 0.49 at the tip, like a wave about
 * to break. Measured, not assumed; the table is beside `SWEEP`.
 *
 * - **Hexagonal blocks**, turned so a flat faces the lean, where the first
 *   model's were octagons: the profile is exact in the plane that is seen, and
 *   the budget pays for ten shells instead of seven.
 * - **The tiles are two tones.** The blocks alternate `white` and a tone of it,
 *   and because each joint is square to a spine that curls, the joints fan out
 *   from the foot like the shells' ribs, with the chevron tiling between them.
 * - **The glass is a wall in each mouth**: a tall pointed slab, dark, standing
 *   just in front of the mouth edge where it meets the podium and held inside
 *   the shell's outline all the way up, so the white rim frames it. The first
 *   model's shells were solid wedges with no glass; this is what it lacked.
 *
 * ## Scale
 *
 * 183 by 120 m and 67 m to the top shell; here 44 by 63 on the podium and 37
 * to the top, so the vertical is about 1.6x the plan. The shells need it — at
 * true proportion the tallest is a gable — and it cost length: at their true
 * slenderness the four shells of a set would need 60 units of podium, and here
 * they nest into 48 by overlapping further than life.
 *
 * **Colour.** `white` and its tone for the tiles; `blush` for the pink granite
 * of the podium and its steps, darkened for the shadow course; `bone` for the
 * Broadwalk's paving; `slate` for the glass, undarkened — never black, which in
 * this world is ink, and at the town windows' 0.72 these house-sized panes in
 * shade were.
 *
 * **Budget.** Built as ordinary pieces and drawn by `ctx.merge` as one mesh per
 * colour — the "merging them by material later is a single call" that
 * `contract.ts` made every geometry non-indexed for.
 */

/**
 * The shell chain. `SWEEP` is the total lean from vertical at the tip; the
 * blocks share it out evenly, so the first stands square on the podium and each
 * one after tips a further `SWEEP / (SEGMENTS - 1)`.
 *
 * The mouth edge of a unit-height shell at 52 degrees and `BASE_RATIO` 0.62,
 * as x in the lean direction against height, measured by walking the chain:
 *
 *     y 0.00  0.302     y 0.56  0.226
 *     y 0.15  0.255     y 0.69  0.258
 *     y 0.29  0.226     y 0.81  0.312
 *     y 0.43  0.215     tip     0.488
 */
const SEGMENTS = 8;
const SWEEP = (52 * Math.PI) / 180;

/** Width falls as `(1 - t)^WIDTH_EXP`. Above 1 the tip sharpens to a spike; below it blunts. */
const WIDTH_EXP = 1.2;

/**
 * Base half-length as a fraction of how far forward the spine travels. At 1 the
 * mouth edge would be plumb; at 0.62 it recedes and then overhangs, and the
 * shell's foot is short enough for four of them to nest on the podium.
 */
const BASE_RATIO = 0.62;

/** How far each block reaches back past its joint, closing the notch the kink opens. */
const LAP = 0.16;

const TILT = Array.from({ length: SEGMENTS }, (_, i) => (SWEEP * i) / (SEGMENTS - 1));
/** Rise and forward reach of a chain of unit-length blocks — the two sums that scale a shell. */
const RISE = TILT.reduce((sum, angle) => sum + Math.cos(angle), 0);
const REACH = TILT.reduce((sum, angle) => sum + Math.sin(angle), 0);

/** A hexagon's corners stand this far past its flats; the across-hall scale takes it back out. */
const HEX_CORNER = 1 / Math.cos(Math.PI / 6);

/** Half the base length of a shell of this height. */
const halfLength = (height: number): number => (height / RISE) * REACH * BASE_RATIO;

/** The glass stops here, as a fraction of the shell's height: above it the tip overhangs the plane. */
const GLASS_REACH = 0.8;
/** And stands this far in front of the mouth's foot. */
const GLASS_PROUD = 0.35;
/** Its half-width at the foot, against the shell's own half-width there. */
const GLASS_WIDTH = 0.85;

// --- the podium -----------------------------------------------------------
const PODIUM_HALF = 22;
const PODIUM_SOUTH = -26;
const PODIUM_NORTH = 37;
const APRON = 0.6;
const WALL_TOP = 5.8;
const SHADOW_TOP = 6.4;
const DECK_TOP = 7.4;

/** The monumental steps: across the south face, from the forecourt to the deck. */
const STEPS = 12;
const STEP_RUN = 0.85;
const STAIR_WEST = 9;
const STAIR_EAST = -21;

interface Shell {
  /** Tip above the deck. */
  height: number;
  /** Half the hall it spans, across the set. */
  halfWidth: number;
  /** Centre of the shell's foot along Z. */
  z: number;
  /** Which way the mouth opens: +1 north, -1 south. */
  faces: 1 | -1;
}

/**
 * A set of four: the south-facing shell and the tallest back to back, then two
 * stepping down to the north. Each foot overlaps the next — 2.5 back to back,
 * 4 and 3 where a shell nests under the mouth of the one behind — which is how
 * four shells of this height fit 48 units.
 */
const set = (x: number, heights: [number, number, number, number], widths: [number, number, number, number], south: number): { x: number; shells: Shell[] } => {
  const [h1, h2, h3, h4] = heights;
  const z1 = south + (h1 / RISE) * REACH;
  const z2 = z1 + halfLength(h1) + halfLength(h2) - 2.5;
  const z3 = z2 + halfLength(h2) - 4 + halfLength(h3);
  const z4 = z3 + halfLength(h3) - 3 + halfLength(h4);
  return {
    x,
    shells: [
      { height: h1, halfWidth: widths[0], z: z1, faces: -1 },
      { height: h2, halfWidth: widths[1], z: z2, faces: 1 },
      { height: h3, halfWidth: widths[2], z: z3, faces: 1 },
      { height: h4, halfWidth: widths[3], z: z4, faces: 1 },
    ],
  };
};

/** The Concert Hall, to the west (+X), the taller set. `south` is where its southern tip reaches. */
const CONCERT = set(11, [19, 29.6, 22, 15], [7.5, 10, 8, 6], -9);
/** The Joan Sutherland Theatre, to the east, a size smaller. */
const THEATRE = set(-11, [17, 27, 20, 13.5], [7, 9, 7.5, 5.5], -10);
/** The Bennelong restaurant: two small shells back to back on the south-west corner. */
const BENNELONG: { x: number; shells: Shell[] } = {
  x: 15,
  shells: [
    { height: 11, halfWidth: 4.5, z: -19.5, faces: -1 },
    { height: 8, halfWidth: 3.6, z: -19.5 + halfLength(11) + halfLength(8) - 1.5, faces: 1 },
  ],
};

export const sydneyOperaHouse: Monument = {
  id: 'sydney-opera-house',
  name: 'Sydney Opera House',
  iso: 'AUS',
  lat: -33.857,
  lon: 151.215,
  // No `realHeight`: the source list carries none for this one.
  tier: 'building',
  footprint: 45,

  build(ctx) {
    const { THREE, palette, tone, box, column, taper } = ctx;
    const tiles = [palette.white, tone(palette.white, 0.93)];
    // `slate` itself, not the 0.72 the town windows take: these panes are the
    // size of a house and face away from the sun, so the ramp's shade band
    // lands on them, and at 0.72 they read as black fins between the sails.
    const glass = palette.slate;
    const granite = tone(palette.blush, 0.8);
    const deck = tone(palette.blush, 0.92);
    const shadow = tone(palette.blush, 0.5);
    const steps = tone(palette.blush, 0.88);
    const paving = palette.bone;

    const draft = new THREE.Group();
    const slab = (width: number, base: number, top: number, south: number, north: number, color: number, x = 0): Mesh => {
      const mesh = box(width, top - base, north - south, color);
      mesh.position.set(x, base, (south + north) / 2);
      draft.add(mesh);
      return mesh;
    };

    // --- the apron: the Broadwalk, drawn out to the point ---
    // An octagon stretched along the point by a parent that carries only
    // scale, so it composes as S * R and stays a proper transform.
    const stretch = new THREE.Group();
    stretch.scale.set(25, 1, 40);
    stretch.position.z = 2;
    stretch.add(column(1, APRON, paving, 8));
    draft.add(stretch);

    // --- the podium: granite walls, the dark course, the oversailing deck ---
    slab(PODIUM_HALF * 2, APRON, WALL_TOP, PODIUM_SOUTH, PODIUM_NORTH, granite);
    slab(PODIUM_HALF * 2 - 1, WALL_TOP, SHADOW_TOP, PODIUM_SOUTH + 0.5, PODIUM_NORTH - 0.5, shadow);
    slab(PODIUM_HALF * 2 + 0.8, SHADOW_TOP, DECK_TOP, PODIUM_SOUTH - 0.4, PODIUM_NORTH + 0.4, deck);

    // --- the monumental steps: each tread a box reaching back to the podium,
    //     so only its riser and tread are seen ---
    const rise = DECK_TOP / STEPS;
    for (let k = 0; k < STEPS; k++) {
      const south = PODIUM_SOUTH - (STEPS - k) * STEP_RUN;
      slab(STAIR_WEST - STAIR_EAST, 0, (k + 1) * rise, south, PODIUM_SOUTH + 0.2, steps, (STAIR_WEST + STAIR_EAST) / 2);
    }

    // --- one shell, built with its mouth toward local -X ---
    const shell = ({ height, halfWidth }: Shell): Group => {
      const outer = new THREE.Group();
      const sail = new THREE.Group();
      const segment = height / RISE;
      const half = halfLength(height);
      // Across the hall. Exact on the whole chain, because every joint below
      // turns about Z and leaves Z alone; the hexagon's corners stand past its
      // flats, so the scale takes that back out.
      sail.scale.z = halfWidth / (half * HEX_CORNER);
      outer.add(sail);

      let node: Group = sail;
      for (let i = 0; i < SEGMENTS; i++) {
        const joint = new THREE.Group();
        joint.rotation.z = TILT[i]! - (i === 0 ? 0 : TILT[i - 1]!);
        node.add(joint);

        const bottom = half * Math.pow(1 - i / SEGMENTS, WIDTH_EXP);
        const top = half * Math.pow(1 - (i + 1) / SEGMENTS, WIDTH_EXP);
        const lap = i === 0 ? 0 : bottom * LAP;
        // Widened by the same amount it was dropped, so the block still
        // measures `bottom` where the joint actually is.
        const foot = bottom + ((bottom - top) * lap) / segment;
        const block = taper(foot, top, segment + lap, tiles[i % 2]!, 6);
        block.position.y = -lap;
        // A flat to the lean, so the half-width in the plane of the profile is
        // the flat's and the profile above stays true.
        block.rotation.y = Math.PI / 6;
        joint.add(block);

        const next = new THREE.Group();
        next.position.y = segment;
        joint.add(next);
        node = next;
      }

      // The glass wall in the mouth: a four-sided taper thinned to a slab by a
      // parent that carries only scale, standing in front of the mouth's foot.
      const bottom = halfWidth * GLASS_WIDTH;
      const pane = new THREE.Group();
      pane.scale.x = 0.15 / bottom;
      pane.position.x = -half - GLASS_PROUD;
      pane.add(taper(bottom, 0.1, height * GLASS_REACH, glass, 4));
      outer.add(pane);
      return outer;
    };

    for (const { x, shells } of [CONCERT, THEATRE, BENNELONG]) {
      for (const spec of shells) {
        const placed = shell(spec);
        // Local -X is the mouth: a quarter turn sends it north, the opposite
        // quarter south, and either way the hall's width lands on X.
        placed.rotation.y = (spec.faces * Math.PI) / 2;
        placed.position.set(x, DECK_TOP, spec.z);
        draft.add(placed);
      }
    }

    return ctx.merge(draft);
  },
};
