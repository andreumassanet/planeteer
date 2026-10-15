import { PROUD } from './contract.ts';
import type { Monument } from './contract.ts';

/**
 * Angkor Wat.
 *
 * What has to read at thumbnail size: the quincunx (four corner towers and a
 * taller centre), the lotus-bud profile of the towers, three stepped terraces,
 * and the tiered galleries running round each (wall, dark overhanging eave,
 * ridge). Tier `building`: the temple is wider than tall (39 by 96).
 *
 * Deliberate departures:
 * - The quincunx is spread 1.6x and is a 37 x 28 rectangle, so the five towers
 *   project to distinct screen positions at the default three-quarter view.
 * - The vertical is exaggerated about 1.6x (central tower 39.4 over a 72 front);
 *   the three terraces total only 11.5 units, so each gallery roof clears the
 *   terrace behind it by three to four units.
 * - The plan is turned across the approach (72 wide, 63 deep) so the broad face
 *   is the one you meet.
 * - No moat or outer wall; the causeway is the +Z porch and its two flights of
 *   steps. The colonnades are one dark band, and there are no bas-reliefs,
 *   balustrades or libraries.
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
 * The three galleries, outermost first. `hx`/`hz` are the centreline of the ring
 * and `thick` the wall. The roof is a dark eave overhanging the wall by half a
 * unit each side, then the inset ridge: the corbelled vault as two ink lines.
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
 * Each storey flares outward and the next starts well inside that lip (a step
 * of 0.08 to 0.20 of the radius), so the outline draws a ledge per tier. The
 * recession accelerates (0.54 per unit of height over the body, 0.91 over the
 * storeys, 2.8 over the last tenth), closing on a blunt point about a fifth of
 * the radius wide; a needle reads as a rocket.
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
 * pavilion's length along its wall; its depth is fixed so it lands on the edge
 * of the terrace behind it, whose coordinate is `terrace`.
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
  surfaces: { bark: 'none' },
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
     * A rectangular ring of four boxes. The long sides run the full width and the
     * short ones fill between, so the ink draws the corner lap joint.
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

      // The doorway is a dark panel a third of a unit proud of the outer face.
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

    // Sunk `PROUD` into the terrace, top unmoved, so its underside does not share
    // the terrace's plane with the two doorways standing on it.
    const porch = box(13, 6 + PROUD, 6.6, wallStone);
    porch.position.set(0, OUTER_TOP - PROUD, 33.3);
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
