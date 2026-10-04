import type { Mesh, Monument } from './contract.ts';

/**
 * Pyramids of Meroë — the North Cemetery.
 *
 * **Not Giza small.** What names Meroë from a thumbnail is what Giza has
 * not: a crowd of narrow, steep pyramids standing close in rows along a ridge,
 * each with a little temple in front of it that is a pylon gateway in
 * miniature, and orange dunes drifting against their feet. Several have lost
 * their tops — Giuseppe Ferlini blew the heads off a number of them in 1834
 * looking for gold — so the skyline is points and stumps, never one shape
 * repeated.
 *
 * ## What is here
 *
 * - **Ten pyramids** in two rows on the ridge, five on the crest and five
 *   smaller ones east of them, sizes all different. Five end in a point, as
 *   the restored ones do; five are cut off flat at 50 to 72 per cent of their
 *   height, with fallen blocks on top.
 * - **Each is stepped**: five or six courses, each set back from the one under
 *   it, toned alternately, so the small steps of the real faces read as
 *   coursing.
 * - **Each has its chapel on its east face**, as the real ones all do: a
 *   room against the pyramid, and in front of it the pylon — two battered
 *   towers with a doorway between them, each tower capped by a proud cornice.
 * - **The ridge** of sandstone they stand on, and **the dunes**, banked
 *   against the ridge's flanks and lapping the pyramids' western feet.
 *
 * ## Sizes, in numbers
 *
 * `placement.ts` turns +Z north and +X west, and the rows run north-south as
 * the real ones do, so the chapels face -X, the sunrise. At 0.7 units a metre
 * the largest pyramid is 20 m across and 31 m tall to its point, which is the
 * tallest at Meroë. The faces are 72 degrees, a little steeper than the real
 * 68 to 70, so a pyramid reads as a spike and not as Giza's tent. **The
 * spacing is compressed**: the real cemetery runs a few hundred metres along
 * its ridge, and here the bases stand two or three units apart. That puts
 * the site in a 48-unit radius against 25 units of height (ridge and tallest
 * point), 1.9 where `MAX_ASPECT` allows 2, with no vertical stretch.
 *
 * **Colour.** `brown` for the weathered sandstone, its courses alternating
 * with a tone 1.08 up; the chapels a tone lighter so they separate from the
 * face they stand against, the pylons lighter again and their cornices
 * lightest; `bark` for the doorways. `sand` for the ridge and `apricot` for
 * the dunes, the orange that every photograph of the place is half made of.
 *
 * **No `realHeight`**: the source list has none for Meroë, a cemetery of
 * some two hundred pyramids, not a height.
 *
 * **Budget.** Built as ordinary pieces and drawn by `ctx.merge` as one mesh per
 * colour, like Giza.
 */

/** Height over half-base: tan of 72 degrees. */
const STEEP = 3.08;

/** The ridge: half-widths at its foot (x, z), its top's share of them, its height. */
const RIDGE = { x: 34, z: 47, top: 0.92, height: 3.5 };

interface Pyramid {
  x: number;
  z: number;
  /** Half-width across the flats at the base. */
  base: number;
  /** Share of the full height still standing; 1 is a point. */
  kept: number;
  courses: number;
}

/**
 * The western row on the crest and the eastern row below it, south to north,
 * each row bowed to follow the ridge, and every chapel clear of the next
 * pyramid by a unit or more.
 */
const PYRAMIDS: Pyramid[] = [
  { x: 11, z: -31, base: 4.5, kept: 0.6, courses: 5 },
  { x: 14, z: -18, base: 6.0, kept: 0.72, courses: 6 },
  { x: 14, z: -2, base: 7.0, kept: 1, courses: 6 },
  { x: 13, z: 14, base: 6.0, kept: 1, courses: 6 },
  { x: 11, z: 28, base: 4.5, kept: 0.68, courses: 5 },
  { x: -10, z: -27, base: 4.0, kept: 1, courses: 5 },
  { x: -12, z: -13, base: 4.5, kept: 0.55, courses: 5 },
  { x: -13, z: 2, base: 5.0, kept: 1, courses: 5 },
  { x: -11, z: 17, base: 4.0, kept: 0.66, courses: 5 },
  { x: -8, z: 30, base: 3.5, kept: 0.5, courses: 5 },
];

/** Dunes as [x, y, z, half-x, half-z, height]: low eight-sided mounds. */
const DUNES: [number, number, number, number, number, number][] = [
  // banked against the ridge's western flank
  [31, 0, -14, 4.5, 14, 3.2],
  [29, 0, 22, 4, 10, 2.8],
  // against the eastern flank, smaller
  [-31, 0, 6, 3.2, 10, 2.4],
  // drifted against the western feet of the crest's pyramids, sunk into the
  // ridge so their undersides share no plane with the pyramids' bases
  [22.5, RIDGE.height - 0.4, -10, 3, 6, 1.9],
  [21, RIDGE.height - 0.4, 21, 2.8, 5, 1.6],
];

export const pyramidsOfMeroe: Monument = {
  id: 'pyramids-of-meroe',
  name: 'Pyramids of Meroë',
  iso: 'SDN',
  lat: 16.9383,
  lon: 33.7489,
  tier: 'building',
  footprint: 48,

  build(ctx) {
    const { THREE, palette, tone, box, taper } = ctx;
    const stone = [palette.brown, tone(palette.brown, 1.08)];
    const chapelWall = tone(palette.brown, 1.16);
    const pylonStone = tone(palette.brown, 1.24);
    const cornice = tone(palette.brown, 1.34);
    const rubble = tone(palette.brown, 0.9);
    const door = palette.bark;
    const ridge = palette.sand;
    const dune = palette.apricot;

    const draft = new THREE.Group();
    const placed = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      draft.add(mesh);
      return mesh;
    };
    /** A frustum scaled to a rectangle by a parent carrying only the scale. */
    const stretched = (sides: number, top: number, height: number, color: number, sx: number, sz: number, x: number, y: number, z: number): void => {
      const parent = new THREE.Group();
      parent.add(taper(1, top, height, color, sides));
      parent.scale.set(sx, 1, sz);
      parent.position.set(x, y, z);
      draft.add(parent);
    };

    // --- the ridge ---
    stretched(16, RIDGE.top, RIDGE.height, ridge, RIDGE.x, RIDGE.z, 0, 0, 0);

    // --- the dunes ---
    for (const [x, y, z, sx, sz, h] of DUNES) stretched(8, 0.38, h, dune, sx, sz, x, y, z);

    const ground = RIDGE.height;
    PYRAMIDS.forEach((p, n) => {
      const height = p.base * STEEP;
      const standing = height * p.kept;
      const radiusAt = (y: number): number => p.base * (1 - y / height);
      const ledge = p.base * 0.04;

      // --- the courses ---
      for (let i = 0; i < p.courses; i++) {
        // Lower courses taller, as at Giza: equal ones stripe it like a ziggurat.
        const y0 = standing * (i / p.courses) ** 0.85;
        const y1 = standing * ((i + 1) / p.courses) ** 0.85;
        const last = i + 1 === p.courses;
        const top = last ? radiusAt(y1) : radiusAt(y1) + ledge;
        placed(taper(radiusAt(y0), top, y1 - y0, stone[(i + n) % 2]!, 4), p.x, ground + y0, p.z);
      }

      // --- the broken top: two fallen blocks on the stump ---
      if (p.kept < 1) {
        const r = radiusAt(standing);
        const a = box(r * 0.8, 0.7, r * 0.7, rubble);
        a.rotation.y = 0.35 + n * 0.4;
        placed(a, p.x + r * 0.25, ground + standing - 0.05, p.z - r * 0.2);
        const b = box(r * 0.55, 0.5, r * 0.5, rubble);
        b.rotation.y = -0.5 + n * 0.3;
        placed(b, p.x - r * 0.3, ground + standing - 0.05, p.z + r * 0.35);
      }

      // --- the chapel on the east face (-X) ---
      const length = p.base * 0.8;
      const pylonHeight = p.base * 1.1;
      const roomHeight = pylonHeight * 0.68;
      const face = p.x - p.base;
      const pylonX = face - length;
      // The room runs from the pylon into the pyramid, deep enough that its
      // back is buried under the sloping face all the way up.
      const back = face + roomHeight / STEEP + 0.4;
      placed(box(back - pylonX, roomHeight, p.base * 1.2, chapelWall), (pylonX + back) / 2, ground, p.z);

      // The pylon: two battered towers either side of the door.
      const towerX = p.base * 0.3;
      const towerZ = p.base * 0.34;
      const gap = p.base * 0.18;
      const shrink = 0.74;
      for (const side of [1, -1]) {
        const z = p.z + side * (gap + towerZ);
        stretched(4, shrink, pylonHeight, pylonStone, towerX, towerZ, pylonX, ground, z);
        // The cornice, proud of the tower's head all round.
        placed(box(towerX * shrink * 2 + 0.3, 0.45, towerZ * shrink * 2 + 0.3, cornice), pylonX, ground + pylonHeight - 0.1, z);
      }
      // The doorway: dark, between the towers, its face set behind theirs.
      placed(box(0.5, pylonHeight * 0.62, gap * 2 + 0.3, door), pylonX - towerX + 0.35, ground, p.z);
    });

    return ctx.merge(draft);
  },
};
