import type { Monument } from './contract.ts';

/**
 * Angkor Wat.
 *
 * Four things have to survive at thumbnail size and every unit here is spent on
 * one of them:
 *
 * - **The quincunx.** Four towers on the corners of a square, one taller in the
 *   middle. It is on the Cambodian flag and it is the whole read.
 * - **The lotus bud.** Not a cone: a stack of receding storeys, each stepping in
 *   behind the flared lip of the one below, the recession accelerating until the
 *   profile closes to a point. `PRASAT` is that curve, written once and used at
 *   two sizes so all five towers are the same building.
 * - **The stepped rectangular terraces** the towers rise from — three of them,
 *   each smaller and each carrying its own gallery.
 * - **The long low galleries with their tiered roofs**, running the whole way
 *   round every terrace: wall, a dark overhanging eave, then the ridge. Three
 *   concentric rings, and they are what makes this a temple-city rather than
 *   five towers on a wedding cake.
 *
 * **Why `building`.** The tier question is "from how far should you be able to
 * name it", and the answer is: from the far end of the causeway, across the
 * moat, over the trees. Not from out at sea — Angkor Wat is horizontal, and it
 * hides inside its own forest until you are through the outer wall. `landmark`
 * would also be arithmetically legal (a 96-unit width passes that tier's fill
 * check on width alone), but a tier is a budget in world units, and 120 of them
 * spent vertically on something three times wider than tall buys a pagoda. 39
 * tall by 96 wide is the shape; `building` is the tier that has it.
 *
 * Four deliberate departures, with their numbers:
 *
 * - **The quincunx is spread 1.6x.** In life the inner gallery that carries the
 *   four corner towers is about 60 m across a 187 m front — 0.32 of the width.
 *   Here it is 37 units across 72, or 0.51. At the true ratio the corner towers
 *   stand inside the central tower's own width and the five read as one lumpy
 *   mass, which is exactly what the flag's silhouette avoids by being a drawing
 *   rather than a photograph.
 * - **The quincunx is a rectangle, 37 x 28, not a square.** The only distortion
 *   in this file that exists purely for the camera, and it earns it twice.
 *   Head-on, the front pair stands 6.9 units clear of the centre tower on each
 *   side. At the contact sheet's default three-quarter view (32 degrees off
 *   axis) the five project to five distinct screen positions — 0, +-8.4,
 *   +-23.1 — where a square plan of the same area would put the inner pair at
 *   +-5.2, inside the centre tower's own 6.8 half-width, and hide two of the
 *   five behind it.
 * - **The vertical is exaggerated about 1.6x, and the terraces pay for it.** In
 *   life the central tower stands 65 m over a 187 m front, a ratio of 0.35; here
 *   39.4 over 72, or 0.55. The three terraces together are only 11.5 units of
 *   the 39.4 — deliberately squat, because a terrace tall enough to be
 *   proportionate swallows the gallery standing on it. Each gallery roof now
 *   clears the terrace behind it by three to four units, which is the gap that
 *   makes three rings read as three rings instead of one stepped mound.
 * - **The plan is turned across the approach.** The enclosure is 187 m wide and
 *   215 m deep along the western causeway; here it is 72 wide and 63 deep, so
 *   the broad face is the one you meet. A 1.3x swap of a ratio nobody could name
 *   in exchange for a front elevation that fills a square thumbnail.
 *
 * Traded away, and why:
 *
 * - **The moat and the outer wall.** The moat is 190 m of water outside a 1,025
 *   x 802 m enclosure — around this model it would be a ring some 80 units out,
 *   half again this tier's whole footprint ceiling, holding nothing but a speck
 *   in the middle. The western causeway survives as the porch and the two
 *   flights of steps on +Z, which is enough to say which way the temple faces.
 * - **The colonnades are one dark band, not pillars.** A pillar every three
 *   units along four sides of the outer gallery alone is about sixty meshes,
 *   more than half this tier. A single course in shadow under the eaves reads as
 *   the same thing the moment the ink lands on it, for four.
 * - **No bas-reliefs, no naga balustrades, no libraries.** All three live at a
 *   scale below one pixel here.
 */

// --- the three terraces. Half-widths: x across the front, z along the approach.
const TERRACES = [
  { hx: 36, hz: 31.5, base: 0, height: 2.4 },
  { hx: 29, hz: 24.5, base: 2.4, height: 4.2 },
  { hx: 24, hz: 19.5, base: 6.6, height: 4.9 },
];
/** Top of each terrace, which is where the gallery standing on it begins. */
const OUTER_TOP = 2.4;
const MIDDLE_TOP = 6.6;
const UPPER_TOP = 11.5;

/**
 * The three galleries, outermost first. `hx`/`hz` are the *centreline* of the
 * ring and `thick` the wall. The roof is two courses on top: a dark eave that
 * overhangs the wall by half a unit each side — the shadow line an overhang
 * actually casts, and the cheapest tier boundary there is — then the ridge,
 * inset again. That is the corbelled vault reduced to the two ink lines that
 * survive at this size.
 */
const GALLERIES = [
  { hx: 33, hz: 28.5, base: OUTER_TOP, wall: 5.2, thick: 3.6, eaves: 0.9, ridge: 2.2 },
  { hx: 26.5, hz: 22, base: MIDDLE_TOP, wall: 4.8, thick: 3, eaves: 0.8, ridge: 2.4 },
  { hx: 18.5, hz: 14, base: UPPER_TOP, wall: 4, thick: 2.6, eaves: 0.7, ridge: 2 },
];
const EAVES_OVERHANG = 1;
const RIDGE_INSET = 1.2;

/** The shadowed colonnade on the outer gallery's face, and how far it stands proud. */
const COLONNADE = { base: 3.6, height: 2.2, proud: 0.4 };

/**
 * The lotus bud, as fractions of one tower's radius and height:
 * `[bottom radius, top radius, height]` per storey.
 *
 * Three properties do all the work, and the first two are the difference between
 * this and a cone. **Every storey flares slightly outward** (top wider than
 * bottom), and **the next storey starts well inside that lip** — a step of 0.08
 * to 0.20 of the radius, which on the central tower is up to 1.1 units of ledge
 * for the outline to draw. The first version of this file stepped in by 0.07
 * with the storeys tapering inward, and the thumbnail came out as five smooth
 * cones: the tiers were there in the numbers and invisible on the screen.
 *
 * The third property is the bud, and it is what stops the tiers reading as a
 * spire. The recession accelerates — the radius falls at 0.54 per unit of height
 * over the body, 0.91 over the storeys, 2.8 over the last tenth — so the profile
 * curves inward and closes *short*, on a blunt point about a fifth of the radius
 * wide. The version before this one ran the same tiers out to a needle and the
 * five towers came out as rockets.
 */
const PRASAT: Array<[number, number, number]> = [
  [1, 1.03, 0.26], // the sanctuary body, all but vertical
  [0.86, 0.89, 0.14],
  [0.73, 0.76, 0.13],
  [0.61, 0.64, 0.11],
  [0.5, 0.53, 0.1],
  [0.41, 0.44, 0.09],
  [0.34, 0.36, 0.07], // shoulder
  [0.28, 0.2, 0.05], // the bud closes
  [0.16, 0, 0.05],
];

/** The same curve with two storeys taken out. The corner towers are two thirds the size. */
const CORNER_PRASAT: Array<[number, number, number]> = [
  [1, 1.04, 0.3],
  [0.84, 0.87, 0.17],
  [0.69, 0.72, 0.15],
  [0.55, 0.58, 0.13],
  [0.43, 0.45, 0.11],
  [0.34, 0.26, 0.08],
  [0.2, 0, 0.06],
];

/** The quincunx square: the corner towers stand on the corners of the inner gallery. */
const QUINCUNX = { x: 18.5, z: 14 };
const CORNER_TOWER = { radius: 4.6, base: UPPER_TOP, height: 17.5 };
/** The centre tower stands on its own plinth and tops out at 39.4 of the tier's 40. */
const CENTRE_TOWER = { plinth: 7.6, plinthHeight: 3.5, radius: 6.6, height: 24.4 };

/**
 * The four gopuras that break each side of the outer gallery. `along` is the
 * length of the pavilion along the wall it sits on; the depth across the wall is
 * fixed so the pavilion lands exactly on the terrace edge behind it, whose
 * coordinate is `terrace`.
 */
const GOPURA_DEPTH = 6;
const GOPURAS = [
  // Front, on +Z: taller and wider than the other three, as the western gopura is.
  { x: 0, z: 28.5, terrace: 31.5, alongX: true, along: 13, height: 10.5, cap: 2.7, door: 4.2 },
  { x: 0, z: -28.5, terrace: -31.5, alongX: true, along: 11, height: 9, cap: 2.5, door: 3.4 },
  { x: 33, z: 0, terrace: 36, alongX: false, along: 11, height: 9, cap: 2.5, door: 3.4 },
  { x: -33, z: 0, terrace: -36, alongX: false, along: 11, height: 9, cap: 2.5, door: 3.4 },
];

export const angkorWat: Monument = {
  id: 'angkor-wat',
  name: 'Angkor Wat',
  iso: 'KHM',
  lat: 13.412,
  lon: 103.867,
  realHeight: 65,
  tier: 'building',
  // The first terrace's corner, at hypot(36, 31.5) = 47.9. Everything else is inside it.
  footprint: 48,

  build(ctx) {
    const { THREE, palette, box, column, taper } = ctx;
    const platform = palette.brown;
    const wallStone = palette.bone;
    const roofStone = palette.tan;
    const towerStone = palette.sand;
    const shadow = palette.bark;

    const group = new THREE.Group();

    /**
     * A rectangular ring of four boxes. The two long sides run the full width and
     * the two short ones fill between them, so the corners are a lap joint rather
     * than a mitre — the ink lands on the seam and draws the corner for free,
     * which is the same trick the Colosseum's attic uses.
     */
    const ring = (
      halfX: number,
      halfZ: number,
      thickness: number,
      base: number,
      height: number,
      color: number,
    ): void => {
      for (const side of [1, -1]) {
        const long = box(halfX * 2 + thickness, height, thickness, color);
        long.position.set(0, base, side * halfZ);
        group.add(long);

        const short = box(thickness, height, halfZ * 2 - thickness, color);
        short.position.set(side * halfX, base, 0);
        group.add(short);
      }
    };

    /** One tower, from a normalised profile. Nine meshes at the centre, seven at a corner. */
    const prasat = (
      profile: Array<[number, number, number]>,
      x: number,
      z: number,
      base: number,
      radius: number,
      height: number,
    ): void => {
      let y = base;
      for (const [bottom, top, span] of profile) {
        const storey = taper(bottom * radius, top * radius, span * height, towerStone, 8);
        storey.position.set(x, y, z);
        group.add(storey);
        y += span * height;
      }
    };

    // --- the three terraces ---
    for (const terrace of TERRACES) {
      const slab = box(terrace.hx * 2, terrace.height, terrace.hz * 2, platform);
      slab.position.y = terrace.base;
      group.add(slab);
    }

    // --- the three galleries: wall, eave, ridge ---
    for (const gallery of GALLERIES) {
      ring(gallery.hx, gallery.hz, gallery.thick, gallery.base, gallery.wall, wallStone);

      const eavesBase = gallery.base + gallery.wall;
      ring(
        gallery.hx,
        gallery.hz,
        gallery.thick + EAVES_OVERHANG,
        eavesBase,
        gallery.eaves,
        platform,
      );
      ring(
        gallery.hx,
        gallery.hz,
        gallery.thick - RIDGE_INSET,
        eavesBase + gallery.eaves,
        gallery.ridge,
        roofStone,
      );
    }

    // --- the outer gallery's colonnade, in shadow under its own eave ---
    const outer = GALLERIES[0]!;
    ring(
      outer.hx,
      outer.hz,
      outer.thick + COLONNADE.proud * 2,
      COLONNADE.base,
      COLONNADE.height,
      shadow,
    );

    // --- the cruciform cloister on the upper terrace, tying the centre tower to
    //     the inner gallery on all four axes ---
    const inner = GALLERIES[2]!;
    const armX = box((inner.hx - inner.thick / 2) * 2, 3, 4, wallStone);
    armX.position.y = UPPER_TOP;
    group.add(armX);
    const armZ = box(4, 3, (inner.hz - inner.thick / 2) * 2, wallStone);
    armZ.position.y = UPPER_TOP;
    group.add(armZ);

    // --- the gopuras ---
    for (const gopura of GOPURAS) {
      const width = gopura.alongX ? gopura.along : GOPURA_DEPTH;
      const depth = gopura.alongX ? GOPURA_DEPTH : gopura.along;

      const body = box(width, gopura.height, depth, wallStone);
      body.position.set(gopura.x, OUTER_TOP, gopura.z);
      group.add(body);

      // The doorway sits half in, half out of the outer face: a dark panel a
      // third of a unit proud is a shadowed opening the moment it is inked, and
      // it costs one mesh where a real jamb costs three.
      const doorWidth = gopura.alongX ? gopura.door : 0.7;
      const doorDepth = gopura.alongX ? 0.7 : gopura.door;
      const door = box(doorWidth, gopura.height * 0.62, doorDepth, shadow);
      door.position.set(
        gopura.alongX ? 0 : gopura.terrace,
        OUTER_TOP,
        gopura.alongX ? gopura.terrace : 0,
      );
      group.add(door);

      // Its own small prasat, in the same flare-then-step language as the five
      // real ones and held under 18 units, so it can never be taken for a sixth.
      const capBase = OUTER_TOP + gopura.height;
      const lower = taper(gopura.cap, gopura.cap * 1.06, 1.9, towerStone, 8);
      lower.position.set(gopura.x, capBase, gopura.z);
      group.add(lower);
      const upper = taper(gopura.cap * 0.76, 0.3, 3, towerStone, 8);
      upper.position.set(gopura.x, capBase + 1.9, gopura.z);
      group.add(upper);
    }

    // --- the causeway porch on +Z, and the steps down off the terrace ---
    const porch = box(13, 6, 6.6, wallStone);
    porch.position.set(0, OUTER_TOP, 33.3);
    group.add(porch);

    const porchRoof = box(14.4, 1, 7.6, roofStone);
    porchRoof.position.set(0, OUTER_TOP + 6, 33.3);
    group.add(porchRoof);

    const porchDoor = box(4.2, 4, 0.7, shadow);
    porchDoor.position.set(0, OUTER_TOP, 36.6);
    group.add(porchDoor);

    const upperStep = box(11, 1.2, 2, platform);
    upperStep.position.set(0, 1.2, 37.6);
    group.add(upperStep);

    const lowerStep = box(13, 1.2, 2, platform);
    lowerStep.position.set(0, 0, 38.5);
    group.add(lowerStep);

    // --- the quincunx ---
    for (const x of [QUINCUNX.x, -QUINCUNX.x]) {
      for (const z of [QUINCUNX.z, -QUINCUNX.z]) {
        prasat(CORNER_PRASAT, x, z, CORNER_TOWER.base, CORNER_TOWER.radius, CORNER_TOWER.height);
      }
    }

    const plinth = column(CENTRE_TOWER.plinth, CENTRE_TOWER.plinthHeight, towerStone, 8);
    plinth.position.y = UPPER_TOP;
    group.add(plinth);

    prasat(
      PRASAT,
      0,
      0,
      UPPER_TOP + CENTRE_TOWER.plinthHeight,
      CENTRE_TOWER.radius,
      CENTRE_TOWER.height,
    );

    return group;
  },
};
